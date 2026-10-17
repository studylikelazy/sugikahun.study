/**
 * MIDNIGHT AUTOMATION: C1 to TSUKUBA
 * ───────────────────────────────────────────────────────────
 * 調達市場（4大市場）参照実装 — 設計書 `docs/midnight-automation/spec/S3_four_markets_tables.md`
 *
 *   1. domestic  … 国内中古市場（AA / ネトオク / 解体ヤード / 青カゴ）   乱数の軸＝**目利き**
 *   2. import    … 輸入車市場（本牧・大黒の保税ヤード）                乱数の軸＝**ほぼ無し**（高額・確実）
 *   3. container … コンテナ市場（ブラインド入札）                      乱数の軸＝**完全ガチャ**
 *   4. local     … ローカル市場（PA・町工場）                          乱数の軸＝**解放条件（REP）**
 *
 * 設計上の要点：
 *  - **完全決定論**（判断ログ D-06）。在庫は `hash32(saveSeed, 市場, チャネル, 週)` から生成される。
 *    同じセーブ・同じ週なら、何度リロードしても同じ品物が同じ値段で並ぶ＝セーブ＆ロードで引き直せない。
 *  - AA / ネトオク は **二位価格**。コンテナだけ **一位価格**（＝勝者の呪いを体験させる）。
 *  - 等級は市場では A 止まり。**S / LEGENDARY は自分の工場で作るしかない**（唯一の例外がローカル市場）。
 *  - 外部依存ゼロ。`types.ts` からは型のみを import する（ランタイム依存なし）。
 */

import type { Act, ChassisId, Grade, PartDefId, PartSlot } from "./types";

/* ═══════════════════════ 1. 決定論乱数 ═══════════════════════ */

/** FNV-1a 32bit。市場シードの導出に使う（文字列・数値混在可） */
export function hash32(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  const s = parts.join("\u0001");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32：軽量・高品質・完全再現可能な PRNG */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** 3つの一様乱数の平均 ≒ 正規分布（平均0.5・σ0.167）。裾を持たせたいガチャに使う */
const bell = (r: () => number): number => (r() + r() + r()) / 3;
/** 平均 mu・標準偏差 sigma の近似正規乱数 */
const gauss = (r: () => number, mu: number, sigma: number): number => mu + (bell(r) - 0.5) * 6 * sigma * 0.577;
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length]!;
const yen = (v: number): number => Math.round(v / 100) * 100;

/** 重み付き抽選。`weights` は同じ長さの非負配列 */
export function weightedPick<T>(r: () => number, xs: readonly T[], weights: readonly number[]): T {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  let roll = r() * total;
  for (let i = 0; i < xs.length; i++) {
    roll -= Math.max(0, weights[i] ?? 0);
    if (roll <= 0) return xs[i]!;
  }
  return xs[xs.length - 1]!;
}

/* ═══════════════════════ 2. 相場指数 ═══════════════════════ */

export const MARKET_INDEX_AMPLITUDE = 0.18;
/** 相場のうねりの周期（週）。これを短くすると週ごとの変動が荒くなる */
export const MARKET_INDEX_PERIOD_WEEKS = 8;

/** 週 `w` の全体相場指数（0.82〜1.18）。8週周期のコサイン補間＝ゆるやかに波打つ */
export function marketIndexAt(saveSeed: number, week: number): number {
  const p = MARKET_INDEX_PERIOD_WEEKS;
  const anchor = Math.floor(week / p);
  const t = (week - anchor * p) / p;
  const a = mulberry32(hash32(saveSeed, "index", anchor))() * 2 - 1;
  const b = mulberry32(hash32(saveSeed, "index", anchor + 1))() * 2 - 1;
  const smooth = (1 - Math.cos(Math.PI * t)) / 2;
  return 1 + lerp(a, b, smooth) * MARKET_INDEX_AMPLITUDE;
}

/** 部品カテゴリ（スロット）ごとのブーム補正を掛けた指数（0.7〜1.3） */
export function slotIndexAt(saveSeed: number, week: number, slot: PartSlot): number {
  const boom = mulberry32(hash32(saveSeed, "boom", slot, Math.floor(week / 3)))() * 2 - 1;
  return clamp(marketIndexAt(saveSeed, week) * (1 + boom * 0.08), 0.7, 1.3);
}

/** 為替（輸入市場のみ・相場指数とは独立の系列）0.94〜1.06 */
export function fxAt(saveSeed: number, week: number): number {
  const a = mulberry32(hash32(saveSeed, "fx", week))() * 2 - 1;
  return 1 + a * 0.06;
}

/* ═══════════════════════ 3. 商品プール ═══════════════════════ */

export interface MarketPartDef {
  defId: PartDefId;
  slot: PartSlot;
  /** 日本語表示名（実コンテンツでは LocalizedText に置き換える） */
  name: string;
  /** 新品定価（カタログ価格の基準）*/
  nominalYen: number;
  massG: number;
  /** この部品が市場に出回り始める Act */
  minAct: Act;
}

/**
 * 市場に流通する部品（抜粋 24 件。ID は `08` §2 のアイテム表に準拠）。
 * **`minAct` は「自製できるようになる章の 1つ前」** に置いてある＝
 * 市場では常に「作れるより一歩早く」手に入る。ただし等級は B 止まりで、価格は定価。
 * S / LEGENDARY 等級はここには存在しない＝自分で作るしかない。
 */
export const MARKET_PART_POOL: readonly MarketPartDef[] = [
  { defId: "conrod_scm", slot: "conrod", name: "コンロッド SCM435", nominalYen: 128_000, massG: 2_600, minAct: 0 },
  { defId: "head_ported", slot: "head", name: "ポート研磨ヘッド", nominalYen: 240_000, massG: 24_000, minAct: 0 },
  { defId: "clutch_twin", slot: "clutch", name: "ツインプレートクラッチ", nominalYen: 168_000, massG: 7_400, minAct: 0 },
  { defId: "coilover", slot: "damper", name: "車高調キット", nominalYen: 186_000, massG: 11_200, minAct: 0 },
  { defId: "spring_direct", slot: "spring", name: "直巻スプリング 8kg/mm", nominalYen: 42_000, massG: 4_800, minAct: 0 },
  { defId: "brake_pad_s", slot: "brake", name: "スポーツブレーキパッド", nominalYen: 28_000, massG: 1_900, minAct: 0 },
  { defId: "lsd_mech", slot: "lsd", name: "機械式LSD 1.5way", nominalYen: 218_000, massG: 14_800, minAct: 0 },
  { defId: "piston_forged", slot: "piston", name: "鍛造ピストン 86.0mm", nominalYen: 92_000, massG: 1_680, minAct: 1 },
  { defId: "camshaft_hi", slot: "camshaft", name: "ハイカム 264°", nominalYen: 86_000, massG: 3_100, minAct: 1 },
  { defId: "exhaust_manifold", slot: "exhaust", name: "等長エキマニ 60φ", nominalYen: 148_000, massG: 9_300, minAct: 1 },
  { defId: "turbo_assy", slot: "turbo", name: "タービンASSY（BB・T28相当）", nominalYen: 268_000, massG: 8_900, minAct: 1 },
  { defId: "intercooler", slot: "intercooler", name: "前置インタークーラー", nominalYen: 132_000, massG: 12_500, minAct: 1 },
  { defId: "injector_hi", slot: "injector", name: "大容量インジェクタ 740cc", nominalYen: 78_000, massG: 620, minAct: 1 },
  { defId: "ecu_v2", slot: "ecu", name: "フルコンECU", nominalYen: 298_000, massG: 1_100, minAct: 1 },
  { defId: "gearset_close", slot: "gearbox", name: "クロスギアセット 6速", nominalYen: 680_000, massG: 42_000, minAct: 2 },
  { defId: "wing_gt_l", slot: "wing", name: "GTウィング（大・1700mm）", nominalYen: 196_000, massG: 6_800, minAct: 2 },
  { defId: "crank_billet", slot: "crank", name: "ビレットクランク", nominalYen: 540_000, massG: 17_600, minAct: 3 },
  { defId: "block_closed", slot: "block", name: "クローズドデッキブロック", nominalYen: 720_000, massG: 48_000, minAct: 3 },
  { defId: "diffuser_rear", slot: "diffuser", name: "リアディフューザー", nominalYen: 168_000, massG: 5_400, minAct: 3 },
  { defId: "arm_pillow", slot: "arm", name: "ピロボールアーム一式", nominalYen: 214_000, massG: 13_200, minAct: 3 },
  { defId: "rotor_big", slot: "brake", name: "大径ローター＋6ポット", nominalYen: 486_000, massG: 18_400, minAct: 3 },
  { defId: "cage_cr_mo", slot: "cage", name: "クロモリ7点ロールケージ", nominalYen: 352_000, massG: 28_000, minAct: 4 },
  { defId: "panel_cfrp", slot: "bodyPanel", name: "ドライカーボン外装パネル", nominalYen: 420_000, massG: 4_200, minAct: 4 },
  { defId: "damper_3way", slot: "damper", name: "3way 競技用ダンパー", nominalYen: 980_000, massG: 10_600, minAct: 5 },
];

export interface MarketChassisDef {
  chassisId: ChassisId;
  name: string;
  /** 実在のモチーフ（UI には出さない。設計上の対応を明示するためのメモ） */
  realWorldRef: string;
  layout: "FR" | "FF" | "MR" | "AWD";
  dryMassKg: number;
  /** 当時の新車価格相当（中古相場の基準） */
  newPriceYen: number;
  minAct: Act;
}

/** ベース車プール。**`03` §2 のベースシャシー表が正本**（架空マルク：判断ログ D-08） */
export const MARKET_CHASSIS_POOL: readonly MarketChassisDef[] = [
  { chassisId: "tachibana_s16", name: "橘 スプリンタ S16", realWorldRef: "S30Z", layout: "FR", dryMassKg: 925, newPriceYen: 1_380_000, minAct: 0 },
  { chassisId: "tachibana_silka", name: "橘 シルカ S-15", realWorldRef: "S15", layout: "FR", dryMassKg: 1_180, newPriceYen: 2_480_000, minAct: 1 },
  { chassisId: "kurogane_savant", name: "黒鉄 サヴァント FD", realWorldRef: "FD3S", layout: "FR", dryMassKg: 1_240, newPriceYen: 3_380_000, minAct: 2 },
  { chassisId: "hayama_evol4", name: "葉山 エヴォル IV", realWorldRef: "CN9A", layout: "AWD", dryMassKg: 1_350, newPriceYen: 2_980_000, minAct: 3 },
  { chassisId: "suganuma_soara", name: "菅沼 ソアーラ JZ", realWorldRef: "JZA80", layout: "FR", dryMassKg: 1_510, newPriceYen: 4_580_000, minAct: 4 },
  { chassisId: "nansei_gt33r", name: "南星 GT-33R", realWorldRef: "BNR32", layout: "AWD", dryMassKg: 1_560, newPriceYen: 5_280_000, minAct: 5 },
  { chassisId: "asaka_nsr", name: "朝霞 NS-R", realWorldRef: "NA1", layout: "MR", dryMassKg: 1_270, newPriceYen: 7_980_000, minAct: 6 },
];

/* ═══════════════════════ 4. 市場の型 ═══════════════════════ */

export const MARKET_IDS = ["domestic", "import", "container", "local"] as const;
export type MarketId = (typeof MARKET_IDS)[number];

export const DOMESTIC_CHANNELS = ["aa", "netauc", "yard", "bluebin"] as const;
export type DomesticChannel = (typeof DOMESTIC_CHANNELS)[number];

export type Rarity = "common" | "scarce" | "phantom";
export const RARITY_PRICE_MULT: Readonly<Record<Rarity, number>> = { common: 1.0, scarce: 2.2, phantom: 6.5 };
/** 市場に流れうる等級の上限。**S / LEGENDARY は原則として買えない**（ローカル市場の一点物のみ例外） */
export const RARITY_MAX_GRADE: Readonly<Record<Rarity, Grade>> = { common: "B", scarce: "A", phantom: "S" };

export type Flaw = "crack" | "seized" | "missingParts" | "counterfeit";
/** 0=未鑑定（±0.25）／1=簡易鑑定（±0.10）／2=自社計測ライン（±0.03・全瑕疵開示） */
export type InspectionLevel = 0 | 1 | 2;
export const INSPECTION_BAND: Readonly<Record<InspectionLevel, number>> = { 0: 0.25, 1: 0.1, 2: 0.03 };
export const INSPECTION_FEE_YEN: Readonly<Record<InspectionLevel, number>> = { 0: 0, 1: 8_000, 2: 0 };

/* ── 4.1 AA（業者オークション） ───────────────────────────── */

export const AA_SCORES = ["R", "RA", "1", "2", "3", "3.5", "4", "4.5", "5", "6", "S"] as const;
export type AaScore = (typeof AA_SCORES)[number];

/** 評価点の出現分布（S3 §3.1.2）。合計 100 */
export const AA_SCORE_WEIGHTS: readonly number[] = [11.0, 4.0, 1.0, 4.0, 12.0, 19.0, 28.0, 13.0, 6.0, 1.6, 0.4];

/** 評価点の数値化（真の状態の計算に使う） */
export const AA_SCORE_VALUE: Readonly<Record<AaScore, number>> = {
  R: 1.5, RA: 1.5, "1": 1, "2": 2, "3": 3, "3.5": 3.5, "4": 4, "4.5": 4.5, "5": 5, "6": 6, S: 6.5,
};

export type InspectorNote =
  | "記録簿有" | "ワンオーナー" | "禁煙車" | "改" | "社外マフラー"
  | "キズA1/B2" | "ガラス飛石" | "サビ有" | "下回り腐食" | "AT滑り" | "白煙" | "エンジン異音" | "メーター交換";

/** 検査員メモ → 真の状態への補正（S3 §3.1.3）。**ゲーム内でこの表は開示しない** */
export const NOTE_DELTA: Readonly<Record<InspectorNote, number>> = {
  記録簿有: 0.06, ワンオーナー: 0.05, 禁煙車: 0.01, 改: -0.04, 社外マフラー: -0.01,
  "キズA1/B2": -0.02, ガラス飛石: -0.01, サビ有: -0.07, 下回り腐食: -0.12,
  AT滑り: -0.15, 白煙: -0.18, エンジン異音: -0.22, メーター交換: -0.03,
};

export type OdoStatus = "actual" | "replaced" | "unknown";

export interface AuctionSheet {
  lotNo: number;
  score: AaScore;
  exterior: "A" | "B" | "C" | "D";
  interior: "A" | "B" | "C" | "D";
  repaired: boolean;
  /** メーター表示値（真の走行距離ではない） */
  odometerKm: number;
  odoStatus: OdoStatus;
  yearModel: number;
  colorCode: string;
  shift: "MT" | "AT";
  inspectionMonthsLeft: number;
  notes: InspectorNote[];
}

export interface AaLot {
  kind: "aa";
  id: string;
  chassisId: ChassisId;
  name: string;
  layout: "FR" | "FF" | "MR" | "AWD";
  dryMassKg: number;
  sheet: AuctionSheet;
  /** 真の状態 0.05–0.98。**未鑑定ではプレイヤーに見せてはならない** */
  trueCondition: number;
  shownConditionMin: number;
  shownConditionMax: number;
  inspectionLevel: InspectionLevel;
  /** 真の走行距離（メーター交換・不明の場合は表示値と食い違う） */
  realOdometerKm: number;
  frameBendMm: number;
  rustLevel: number;
  startYen: number;
  fairYen: number;
  /** 競合業者の撤退閾値のうち最高額（隠し）。`resolveAuction` でのみ使う */
  competitorTopYen: number;
  competitorCount: number;
  /** 落札後にかかる諸費用の合計（手数料＋成約料＋陸送＋名変） */
  feesYen: number;
  arrivesInDays: number;
}

/* ── 4.2 ネトオク ─────────────────────────────────────────── */

export interface NetAucListing {
  kind: "netauc";
  id: string;
  defId: PartDefId;
  slot: PartSlot;
  name: string;
  rarity: Rarity;
  maxGrade: Grade;
  nominalYen: number;
  trueCondition: number;
  shownConditionMin: number;
  shownConditionMax: number;
  inspectionLevel: InspectionLevel;
  /** 出品者評価 1–5。低いほど安いが、贋作率が跳ね上がる */
  sellerStars: 1 | 2 | 3 | 4 | 5;
  /** ノークレーム・ノーリターン */
  noClaimNoReturn: boolean;
  isFake: boolean;
  startYen: number;
  fairYen: number;
  competitorTopYen: number;
  competitorCount: number;
  closesOnDay: number;
  /** 終了5分前の入札で延長される＝スナイプが効かない */
  autoExtend: boolean;
}

/** ネトオクに稀に流れる「奇跡枠」の車体（低走行・ドノーマル・無事故・AT） */
export interface MiracleCarListing {
  kind: "miracle";
  id: string;
  chassisId: ChassisId;
  name: string;
  odometerKm: number;
  shift: "AT";
  trueCondition: number;
  askYen: number;
  /** AT→MT 公認換装ラインの対象であることを示す */
  swapCandidate: true;
}

/* ── 4.3 解体ヤード ───────────────────────────────────────── */

export interface YardPartPrice {
  slot: PartSlot;
  name: string;
  priceYen: number;
  pullMinutes: number;
  breakBase: number;
}

/** 部位別価格表（S3 付録 A3） */
export const YARD_PART_PRICES: readonly YardPartPrice[] = [
  { slot: "bodyPanel", name: "ドア（1枚）", priceYen: 3_000, pullMinutes: 8, breakBase: 0.04 },
  { slot: "bodyPanel", name: "フェンダー", priceYen: 2_500, pullMinutes: 6, breakBase: 0.06 },
  { slot: "bodyPanel", name: "ボンネット", priceYen: 4_000, pullMinutes: 5, breakBase: 0.03 },
  { slot: "ecu", name: "ECU", priceYen: 12_000, pullMinutes: 10, breakBase: 0.05 },
  { slot: "turbo", name: "タービン", priceYen: 25_000, pullMinutes: 38, breakBase: 0.18 },
  { slot: "gearbox", name: "ミッション（MT）", priceYen: 15_000, pullMinutes: 45, breakBase: 0.12 },
  { slot: "lsd", name: "デフ（LSD付）", priceYen: 18_000, pullMinutes: 35, breakBase: 0.1 },
  { slot: "arm", name: "足回り片側", priceYen: 11_000, pullMinutes: 26, breakBase: 0.09 },
  { slot: "damper", name: "純正ダンパー一式", priceYen: 7_000, pullMinutes: 22, breakBase: 0.08 },
  { slot: "intercooler", name: "インタークーラー", priceYen: 9_000, pullMinutes: 20, breakBase: 0.07 },
  { slot: "injector", name: "インジェクタ4本", priceYen: 6_000, pullMinutes: 16, breakBase: 0.06 },
  { slot: "brake", name: "キャリパー左右", priceYen: 8_000, pullMinutes: 18, breakBase: 0.05 },
];

export interface YardLot {
  kind: "yard";
  id: string;
  defId: PartDefId;
  slot: PartSlot;
  name: string;
  massG: number;
  nominalYen: number;
  /** 部位別の固定価格（もぎ取り代） */
  askYen: number;
  /** もぎ取りに要する時間（分）。工具等級で短縮される */
  pullMinutes: number;
  /** 失敗して部品を壊す確率 */
  breakChance: number;
  trueCondition: number;
  shownConditionMin: number;
  shownConditionMax: number;
  inspectionLevel: InspectionLevel;
  shownFlaws: Flaw[];
  hiddenFlaws: Flaw[];
}

/* ── 4.4 青カゴ ───────────────────────────────────────────── */

export type BinTier = "blue" | "red" | "black";
export const BIN_UNIT_YEN: Readonly<Record<BinTier, number>> = { blue: 500, red: 1_000, black: 3_000 };
export const BIN_USABLE_P: Readonly<Record<BinTier, number>> = { blue: 0.18, red: 0.31, black: 0.52 };
export const BIN_RARE_P: Readonly<Record<BinTier, number>> = { blue: 0.003, red: 0.008, black: 0.015 };

export interface BlueBinLot {
  kind: "bluebin";
  id: string;
  tier: BinTier;
  unitYen: number;
  /** カゴに入っている点数 */
  count: number;
  /** 「カゴごと全部買い」の価格（単価 × 点数 × 0.85） */
  bulkYen: number;
  usableChance: number;
  rareChance: number;
}

/* ── 4.5 輸入 ─────────────────────────────────────────────── */

export type ImportKind =
  | "barnFind" | "overseasGrade" | "titanium" | "inconel" | "worksPart" | "deadStock" | "metrology";

export interface ImportListing {
  kind: "import";
  id: string;
  itemKind: ImportKind;
  name: string;
  /** 車体の場合のみ */
  chassisId?: ChassisId;
  /** 素材の場合の単価（円/kg） */
  pricePerKgYen?: number;
  priceYen: number;
  /** 状態は**最初から完全開示**される（鑑定不要） */
  trueCondition: number;
  maxGrade: Grade;
  /** 通関に要する週数 */
  customsWeeks: number;
  /** 消費税・通関諸費用・保税保管を含む総額 */
  landedYen: number;
  /** 公道化に必要な費用（車体のみ）。0 なら不要 */
  complianceYen: number;
  leftHandDrive: boolean;
}

/* ── 4.6 コンテナ ─────────────────────────────────────────── */

export const CONTAINER_TIERS = ["T0", "T1", "T2", "T3", "T4", "T5"] as const;
export type ContainerTier = (typeof CONTAINER_TIERS)[number];

/** 基本確率（S3 §5.3）。合計 100 */
export const TIER_WEIGHTS: Readonly<Record<ContainerTier, number>> = {
  T0: 34.0, T1: 30.0, T2: 22.0, T3: 9.0, T4: 4.2, T5: 0.8,
};

/** ティアごとの想定価値レンジ（円）。T0 は負（産廃処理費） */
export const TIER_VALUE_YEN: Readonly<Record<ContainerTier, readonly [number, number]>> = {
  T0: [-80_000, -10_000],
  T1: [50_000, 400_000],
  T2: [150_000, 900_000],
  T3: [300_000, 2_500_000],
  T4: [800_000, 4_000_000],
  T5: [5_000_000, 20_000_000],
};

/** ティアごとの総重量レンジ（S3 §5.5）。ヒントの数学的根拠 */
export const TIER_WEIGHT_KG: Readonly<Record<ContainerTier, readonly [number, number]>> = {
  T0: [200, 3_000], T1: [800, 12_000], T2: [150, 900],
  T3: [950, 1_700], T4: [60, 600], T5: [180, 1_600],
};

export const CONTAINER_PORTS = ["longBeach", "southampton", "busan", "kobe", "dubai"] as const;
export type ContainerPort = (typeof CONTAINER_PORTS)[number];

export const PORT_NAME: Readonly<Record<ContainerPort, string>> = {
  longBeach: "ロングビーチ", southampton: "サウサンプトン", busan: "釜山", kobe: "神戸", dubai: "ドバイ",
};

/** 積出港によるティア重みの倍率（S3 §5.4） */
export const PORT_TIER_BIAS: Readonly<Record<ContainerPort, Readonly<Record<ContainerTier, number>>>> = {
  longBeach: { T0: 0.8, T1: 0.9, T2: 1.0, T3: 1.3, T4: 1.6, T5: 1.8 },
  southampton: { T0: 0.9, T1: 1.0, T2: 1.1, T3: 1.1, T4: 1.4, T5: 1.2 },
  busan: { T0: 1.0, T1: 1.2, T2: 1.2, T3: 0.9, T4: 0.7, T5: 0.6 },
  kobe: { T0: 1.1, T1: 1.4, T2: 1.1, T3: 0.6, T4: 0.5, T5: 0.3 },
  dubai: { T0: 1.5, T1: 0.8, T2: 0.9, T3: 1.0, T4: 0.9, T5: 1.1 },
};

export const PORT_WEIGHTS: readonly number[] = [22, 16, 24, 26, 12];

export type CustomsNote = "書類不備" | "申告：機械部品" | "内容相違" | "危険物なし";
export type XrayHint = "車両らしき輪郭" | "円筒形が多数" | "空洞が多い" | "金属密度が高い";

/** T5「伝説」の中身（S3 §5.6） */
export const T5_CONTENTS = [
  "行方不明の最高速プロトタイプ車体",
  "ワークス流出ROM",
  "LEGENDARY級タービン（デッドストック）",
  "風洞用の実寸天秤",
  "未使用スリックタイヤ8セット",
] as const;
export const T5_CONTENT_WEIGHTS: readonly number[] = [30, 22, 20, 14, 14];

export interface ContainerLot {
  kind: "container";
  id: string;
  port: ContainerPort;
  portName: string;
  /** 計量誤差 ±3% を含む表示重量 */
  weightKg: number;
  customsNote: CustomsNote;
  /** 封印が破られている＝抜かれている（ティアが1段下がる） */
  sealBroken: boolean;
  /** X線シルエット。Act4 以降のみ取得できる */
  xray: XrayHint | null;
  /** 真のティア（**開封するまで開示してはならない**） */
  tier: ContainerTier;
  /** 中身の表示名 */
  contents: string;
  /** 中身の評価額（T0 は負） */
  valueYen: number;
  /** 一位価格入札の競合最高額（隠し） */
  competitorTopYen: number;
  competitorCount: number;
}

/* ── 4.7 ローカル ─────────────────────────────────────────── */

export const LOCAL_VENUES = ["daikoku", "tatsumi", "shibaura", "ota"] as const;
export type LocalVenue = (typeof LOCAL_VENUES)[number];

export interface LocalVenueDef {
  venue: LocalVenue;
  name: string;
  repRequired: number;
  /** 営業する曜日（0=日）。空配列は毎日 */
  days: readonly number[];
  openHour: number;
  closeHour: number;
}

export const LOCAL_VENUE_DEFS: readonly LocalVenueDef[] = [
  { venue: "tatsumi", name: "辰巳PA", repRequired: 20, days: [], openHour: 0, closeHour: 4 },
  { venue: "daikoku", name: "大黒PA", repRequired: 40, days: [5, 6], openHour: 23, closeHour: 3 },
  { venue: "shibaura", name: "芝浦PA", repRequired: 60, days: [1, 2, 3, 4, 5], openHour: 1, closeHour: 3 },
  { venue: "ota", name: "大田区の町工場", repRequired: 60, days: [1, 2, 3, 4, 5], openHour: 9, closeHour: 17 },
];

export type LocalCost =
  | { kind: "yen"; yen: number }
  | { kind: "data"; dataKind: "D3" | "D4" | "D5" | "D6"; amount: number }
  | { kind: "race"; rivalId: string }
  | { kind: "loan"; days: number };

export interface LocalOffer {
  kind: "local";
  id: string;
  venue: LocalVenue;
  venueName: string;
  title: string;
  from: string;
  subject:
    | { kind: "part"; defId: PartDefId }
    | { kind: "blueprint"; defId: PartDefId }
    | { kind: "chassis"; chassisId: ChassisId }
    | { kind: "ignitionMap"; quality: number };
  maxGrade: Grade;
  cost: LocalCost;
  repRequired: number;
  expiresOnDay: number;
  /** ワンオフの副次効果（重量差など）。表示用 */
  perk?: string;
}

/* ── 4.8 週次スナップショット ─────────────────────────────── */

export interface WeeklyMarket {
  week: number;
  marketIndex: number;
  fx: number;
  domestic: {
    aa: AaLot[];
    netauc: NetAucListing[];
    miracle: MiracleCarListing[];
    yard: YardLot[];
    bluebin: BlueBinLot[];
  };
  imports: ImportListing[];
  containers: ContainerLot[];
  local: LocalOffer[];
}

export interface MarketContext {
  saveSeed: number;
  week: number;
  act: Act;
  /** 夜の評判 0–100（`04` §6）。ローカル市場の解放条件 */
  reputation: number;
  /** 取締り圧 0–100。高いと裏ルートが店を閉める */
  heat: number;
  /** 幻級を引けていない週数（天井＝ピティ用。呼び出し側が保持する） */
  phantomDrought: number;
  /** コンテナのハズレ連続本数（T4 以上のピティ用） */
  containerDrought?: number;
  /** 雨の週は解体ヤードの状態が落ちる */
  rainy?: boolean;
}

/* ═══════════════════════ 5. 生成 ═══════════════════════ */

export const YARD_LOTS_MIN = 8;
export const YARD_LOTS_MAX = 16;
/** 幻級の基礎出現率と、天井（ピティ）の上限 */
export const PHANTOM_BASE_P = 0.05;
export const PHANTOM_PITY_STEP = 0.01;
export const PHANTOM_PITY_MAX = 0.15;
/** 幻級として出品されうる部品の最低定価 */
export const PHANTOM_MIN_NOMINAL_YEN = 150_000;
/** ネトオクの「奇跡枠」出現率 */
export const MIRACLE_P = 0.006;
/** コンテナのピティ：n 本連続ハズレで T4 以上の重みを最大 1.8 倍にする */
export const CONTAINER_PITY_AT = 20;
export const CONTAINER_PITY_MULT = 1.8;

export function phantomProbability(drought: number): number {
  return Math.min(PHANTOM_PITY_MAX, PHANTOM_BASE_P + PHANTOM_PITY_STEP * Math.max(0, drought));
}

function availableParts(act: Act): MarketPartDef[] {
  return MARKET_PART_POOL.filter((p) => p.minAct <= act);
}

function availableChassis(act: Act): MarketChassisDef[] {
  return MARKET_CHASSIS_POOL.filter((c) => c.minAct <= act);
}

function band(cond: number, level: InspectionLevel): { min: number; max: number } {
  const w = INSPECTION_BAND[level];
  return { min: clamp(cond - w, 0, 1), max: clamp(cond + w, 0, 1) };
}

/* ── 5.1 AA（業者オークション） ───────────────────────────── */

const COLOR_CODES = ["KH2", "KG1", "326", "202", "040", "TA2", "AR2", "BN6"] as const;

/** 検査員メモを引く。評価点と相関する（良い個体には良いメモが付く） */
function rollNotes(r: () => number, score: AaScore, shift: "MT" | "AT"): InspectorNote[] {
  const v = AA_SCORE_VALUE[score];
  const good = v >= 4;
  const notes: InspectorNote[] = [];
  if (good && r() < 0.4) notes.push("記録簿有");
  if (r() < 0.08) notes.push("ワンオーナー");
  if (r() < 0.15) notes.push("禁煙車");
  if (r() < 0.22) notes.push("改");
  if (r() < 0.18) notes.push("社外マフラー");
  if (r() < 0.45) notes.push("キズA1/B2");
  if (r() < 0.12) notes.push("ガラス飛石");
  if (r() < 0.2) notes.push("サビ有");
  if (r() < 0.09) notes.push("下回り腐食");
  if (shift === "AT" && r() < 0.07) notes.push("AT滑り");
  if (r() < 0.05) notes.push("白煙");
  if (r() < 0.04) notes.push("エンジン異音");
  if (r() < 0.06) notes.push("メーター交換");
  return notes;
}

export function buildAa(ctx: MarketContext): AaLot[] {
  const r = mulberry32(hash32(ctx.saveSeed, "domestic", "aa", ctx.week));
  const pool = availableChassis(ctx.act);
  const idx = marketIndexAt(ctx.saveSeed, ctx.week);
  const n = 18 + 2 * ctx.act;
  const out: AaLot[] = [];
  for (let i = 0; i < n; i++) {
    const c = pick(r, pool);
    const score = weightedPick(r, AA_SCORES, AA_SCORE_WEIGHTS);
    const repaired = score === "R" || score === "RA";
    const shift: "MT" | "AT" = r() < 0.55 ? "MT" : "AT";
    const notes = rollNotes(r, score, shift);
    const noteDelta = notes.reduce((s, note) => s + NOTE_DELTA[note], 0);
    const trueCondition = clamp(0.075 * AA_SCORE_VALUE[score] + 0.22 + noteDelta + gauss(r, 0, 0.07), 0.05, 0.98);

    const odoStatus: OdoStatus = notes.includes("メーター交換") ? "replaced" : r() < 0.04 ? "unknown" : "actual";
    const shownOdo = Math.round((30 + r() * 150) * 1000);
    const realOdometerKm =
      odoStatus === "actual" ? shownOdo
      : odoStatus === "replaced" ? shownOdo + Math.round(40_000 + r() * 120_000)
      : Math.round(80_000 + r() * 200_000);

    const frameBendMm = Math.round((repaired ? Math.abs(gauss(r, 0, 2.4)) + 0.6 : Math.abs(gauss(r, 0, 0.35))) * 10) / 10;
    const age = 24 + Math.floor(r() * 12);
    const rustLevel = clamp(0.05 + 0.004 * age + (notes.includes("下回り腐食") ? 0.35 : 0) + (notes.includes("サビ有") ? 0.2 : 0), 0, 0.95);

    const fair =
      c.newPriceYen * (0.35 + 0.75 * trueCondition) * idx * (repaired ? 0.72 : 1.0) * (odoStatus === "actual" ? 1.0 : 0.82);
    const count = 2 + Math.floor(r() * 5);
    let top = 0;
    for (let k = 0; k < count; k++) top = Math.max(top, fair * gauss(r, 1.0, 0.18));
    const b = band(trueCondition, 0);

    out.push({
      kind: "aa",
      id: `aa-${ctx.week}-${i}`,
      chassisId: c.chassisId,
      name: c.name,
      layout: c.layout,
      dryMassKg: c.dryMassKg,
      sheet: {
        lotNo: 20_000 + Math.floor(r() * 9_000),
        score,
        exterior: pick(r, ["A", "B", "C", "D"] as const),
        interior: pick(r, ["A", "B", "C", "D"] as const),
        repaired,
        odometerKm: shownOdo,
        odoStatus,
        yearModel: 2026 - age,
        colorCode: pick(r, COLOR_CODES),
        shift,
        inspectionMonthsLeft: Math.floor(r() * 25),
        notes,
      },
      trueCondition,
      shownConditionMin: b.min,
      shownConditionMax: b.max,
      inspectionLevel: 0,
      realOdometerKm,
      frameBendMm,
      rustLevel,
      startYen: yen(fair * 0.45),
      fairYen: yen(fair),
      competitorTopYen: yen(Math.max(fair * 0.45, top)),
      competitorCount: count,
      feesYen: 11_000 + 9_900 + 12_000 + Math.round((28_000 + r() * 57_000) / 100) * 100,
      arrivesInDays: 3 + Math.floor(r() * 5),
    });
  }
  return out;
}

/* ── 5.2 ネトオク ─────────────────────────────────────────── */

export function buildNetAuc(ctx: MarketContext): NetAucListing[] {
  const r = mulberry32(hash32(ctx.saveSeed, "domestic", "netauc", ctx.week));
  const pool = availableParts(ctx.act);
  const n = 14 + 2 * ctx.act;
  const pPhantom = phantomProbability(ctx.phantomDrought);
  // 幻級は「ワンオフとして意味のある高額部品」からしか出ない（幻のスプリングは興醒めなので）
  const exotic = pool.filter((p) => p.nominalYen >= PHANTOM_MIN_NOMINAL_YEN);
  const out: NetAucListing[] = [];
  for (let i = 0; i < n; i++) {
    const roll = r();
    const rarity: Rarity = roll < pPhantom ? "phantom" : roll < pPhantom + 0.25 ? "scarce" : "common";
    const p = rarity === "phantom" && exotic.length > 0 ? pick(r, exotic) : pick(r, pool);
    const cond = clamp(0.62 + (bell(r) - 0.5) * 1.1, 0.1, 1);
    const stars = (1 + Math.floor(r() * 5)) as 1 | 2 | 3 | 4 | 5;
    const isFake = r() < 0.005 + (0.14 * (5 - stars)) / 4;
    const idx = slotIndexAt(ctx.saveSeed, ctx.week, p.slot);
    const fair = p.nominalYen * RARITY_PRICE_MULT[rarity] * (0.35 + 0.55 * cond) * idx * (0.9 + 0.03 * stars);
    const count = 1 + Math.floor(r() * 4);
    let top = 0;
    for (let k = 0; k < count; k++) top = Math.max(top, fair * (0.6 + 0.5 * r()));
    const b = band(cond, 0);
    out.push({
      kind: "netauc",
      id: `net-${ctx.week}-${i}`,
      defId: p.defId,
      slot: p.slot,
      name: p.name,
      rarity,
      maxGrade: RARITY_MAX_GRADE[rarity],
      nominalYen: p.nominalYen,
      trueCondition: cond,
      shownConditionMin: b.min,
      shownConditionMax: b.max,
      inspectionLevel: 0,
      sellerStars: stars,
      noClaimNoReturn: r() < 0.68,
      isFake,
      startYen: yen(fair * 0.35),
      fairYen: yen(fair),
      competitorTopYen: yen(top),
      competitorCount: count,
      closesOnDay: 1 + Math.floor(r() * 7),
      autoExtend: true,
    });
  }
  return out;
}

/** 奇跡枠：低走行・ドノーマル・無事故・**AT**。AT→MT 公認換装ラインの入口 */
export function buildMiracle(ctx: MarketContext): MiracleCarListing[] {
  const r = mulberry32(hash32(ctx.saveSeed, "domestic", "miracle", ctx.week));
  const pool = availableChassis(ctx.act);
  const out: MiracleCarListing[] = [];
  for (let i = 0; i < pool.length; i++) {
    if (r() >= MIRACLE_P) continue;
    const c = pool[i]!;
    const cond = 0.88 + r() * 0.1;
    out.push({
      kind: "miracle",
      id: `mir-${ctx.week}-${i}`,
      chassisId: c.chassisId,
      name: `${c.name}（実走 2万km台・ドノーマル・AT）`,
      odometerKm: Math.round((20 + r() * 9) * 1000),
      shift: "AT",
      trueCondition: cond,
      askYen: yen(c.newPriceYen * (1.1 + r() * 0.5) * marketIndexAt(ctx.saveSeed, ctx.week)),
      swapCandidate: true,
    });
  }
  return out;
}

/* ── 5.3 解体ヤード ───────────────────────────────────────── */

export function buildYard(ctx: MarketContext): YardLot[] {
  const r = mulberry32(hash32(ctx.saveSeed, "domestic", "yard", ctx.week));
  const pool = availableParts(ctx.act);
  const rainy = ctx.rainy === true;
  const n = YARD_LOTS_MIN + Math.floor(r() * (YARD_LOTS_MAX - YARD_LOTS_MIN + 1));
  const lots: YardLot[] = [];
  for (let i = 0; i < n; i++) {
    const p = pick(r, pool);
    const price = YARD_PART_PRICES.find((q) => q.slot === p.slot) ?? YARD_PART_PRICES[0]!;
    // 解体ヤードは4チャネル中で最も状態が悪い（平均 0.38・σ 0.21）
    const cond = clamp(gauss(r, rainy ? 0.3 : 0.38, 0.21), 0.05, 0.95);
    const flaws: Flaw[] = [];
    if (r() < 0.18 * (1 - cond)) flaws.push("crack");
    if (r() < 0.3 * (1 - cond)) flaws.push("seized");
    if (r() < 0.12) flaws.push("missingParts");
    if (r() < 0.03) flaws.push("counterfeit");
    const rust = clamp(1 - cond, 0, 1);
    const b = band(cond, 0);
    lots.push({
      kind: "yard",
      id: `yard-${ctx.week}-${i}`,
      defId: p.defId,
      slot: p.slot,
      name: `${p.name}（もぎ取り）`,
      massG: p.massG,
      nominalYen: p.nominalYen,
      askYen: price.priceYen,
      pullMinutes: Math.round(price.pullMinutes * (rainy ? 1.3 : 1)),
      breakChance: clamp(price.breakBase + 0.25 * rust + (rainy ? 0.05 : 0), 0.01, 0.75),
      trueCondition: cond,
      shownConditionMin: b.min,
      shownConditionMax: b.max,
      inspectionLevel: 0,
      shownFlaws: [],
      hiddenFlaws: flaws,
    });
  }
  // ── 床（確定枠）：毎週かならず「使える個体」が1つは並ぶ。詰みを作らないための保証 ──
  let best = 0;
  for (let i = 1; i < lots.length; i++) if (lots[i]!.trueCondition > lots[best]!.trueCondition) best = i;
  const l = lots[best]!;
  if (l.trueCondition < 0.6) {
    l.trueCondition = 0.6 + r() * 0.25;
    l.hiddenFlaws = l.hiddenFlaws.filter((f) => f === "missingParts");
    const b = band(l.trueCondition, 0);
    l.shownConditionMin = b.min;
    l.shownConditionMax = b.max;
    l.breakChance = clamp(l.breakChance - 0.25 * (1 - l.trueCondition), 0.01, 0.75);
  }
  return lots;
}

/* ── 5.4 青カゴ ───────────────────────────────────────────── */

export function buildBlueBins(ctx: MarketContext): BlueBinLot[] {
  const r = mulberry32(hash32(ctx.saveSeed, "domestic", "bluebin", ctx.week));
  const tiers: BinTier[] = ["blue", "red", "black"];
  return tiers.map((tier, i) => {
    const count = 20 + Math.floor(r() * 41);
    return {
      kind: "bluebin" as const,
      id: `bin-${ctx.week}-${i}`,
      tier,
      unitYen: BIN_UNIT_YEN[tier],
      count,
      bulkYen: yen(BIN_UNIT_YEN[tier] * count * 0.85),
      usableChance: BIN_USABLE_P[tier],
      rareChance: BIN_RARE_P[tier],
    };
  });
}

/* ── 5.5 輸入 ─────────────────────────────────────────────── */

const IMPORT_KINDS: readonly ImportKind[] = ["barnFind", "overseasGrade", "titanium", "inconel", "worksPart", "deadStock", "metrology"];
const IMPORT_WEIGHTS: readonly number[] = [22, 18, 16, 12, 14, 15, 3];

const IMPORT_NAME: Readonly<Record<ImportKind, string>> = {
  barnFind: "左ハンドル納屋物件",
  overseasGrade: "海外仕様の希少グレード",
  titanium: "航空宇宙グレード Ti-6Al-4V 棒材",
  inconel: "インコネル718 棒材",
  worksPart: "海外レース部品（ワークス放出）",
  deadStock: "絶版純正デッドストック",
  metrology: "計測機器（CMM校正器／風洞天秤）",
};

const CUSTOMS_WEEK_WEIGHTS: readonly number[] = [30, 35, 20, 10, 5];

/** 輸入：**乱数をほぼ置かない市場**。高額・開示済み・ただし通関で待たされる */
export function buildImports(ctx: MarketContext): ImportListing[] {
  if (ctx.act < 2 || ctx.week % 2 !== 0) return [];
  const r = mulberry32(hash32(ctx.saveSeed, "import", ctx.week));
  const idx = marketIndexAt(ctx.saveSeed, ctx.week);
  const fx = fxAt(ctx.saveSeed, ctx.week);
  const pool = availableChassis(ctx.act);
  const n = 4 + Math.floor(r() * 6);
  const out: ImportListing[] = [];
  for (let i = 0; i < n; i++) {
    const itemKind = weightedPick(r, IMPORT_KINDS, IMPORT_WEIGHTS);
    const customsWeeks = 2 + weightedPick(r, [0, 1, 2, 3, 4], CUSTOMS_WEEK_WEIGHTS);
    const isCar = itemKind === "barnFind" || itemKind === "overseasGrade";
    const chassis = isCar ? pick(r, pool) : undefined;
    let base: number;
    let cond: number;
    let maxGrade: Grade = "B";
    let pricePerKgYen: number | undefined;
    switch (itemKind) {
      case "barnFind":
        base = (chassis?.newPriceYen ?? 2_000_000) * (0.4 + r() * 0.8);
        cond = 0.25 + r() * 0.4;
        break;
      case "overseasGrade":
        base = (chassis?.newPriceYen ?? 2_000_000) * (0.9 + r() * 1.2);
        cond = 0.6 + r() * 0.35;
        break;
      case "titanium":
        pricePerKgYen = 9_800;
        base = pricePerKgYen * (20 + Math.floor(r() * 80));
        cond = 1;
        maxGrade = "A";
        break;
      case "inconel":
        pricePerKgYen = 18_400;
        base = pricePerKgYen * (10 + Math.floor(r() * 40));
        cond = 1;
        maxGrade = "A";
        break;
      case "worksPart":
        base = 320_000 + r() * 2_480_000;
        cond = 0.75 + r() * 0.2;
        maxGrade = "S";
        break;
      case "deadStock":
        base = 48_000 + r() * 1_152_000;
        cond = 1;
        maxGrade = "A";
        break;
      default:
        base = 1_800_000 + r() * 3_800_000;
        cond = 1;
        maxGrade = "A";
        break;
    }
    const priceYen = yen(base * idx * fx * 1.35);
    const storage = 3_200 * customsWeeks * 7;
    const landedYen = yen(priceYen * 1.1 + 85_000 + storage);
    out.push({
      kind: "import",
      id: `imp-${ctx.week}-${i}`,
      itemKind,
      name: IMPORT_NAME[itemKind] + (chassis ? `：${chassis.name}` : ""),
      ...(chassis ? { chassisId: chassis.chassisId } : {}),
      ...(pricePerKgYen !== undefined ? { pricePerKgYen } : {}),
      priceYen,
      trueCondition: cond,
      maxGrade,
      customsWeeks,
      landedYen,
      complianceYen: isCar ? yen(180_000 + r() * 420_000) : 0,
      leftHandDrive: isCar,
    });
  }
  return out;
}

/* ── 5.6 コンテナ ─────────────────────────────────────────── */

function tierWeightsFor(port: ContainerPort, drought: number): number[] {
  const bias = PORT_TIER_BIAS[port];
  const pity = drought >= CONTAINER_PITY_AT ? CONTAINER_PITY_MULT : 1;
  return CONTAINER_TIERS.map((t) => TIER_WEIGHTS[t] * bias[t] * (t === "T4" || t === "T5" ? pity : 1));
}

function lowerTier(t: ContainerTier): ContainerTier {
  const i = CONTAINER_TIERS.indexOf(t);
  return CONTAINER_TIERS[Math.max(0, i - 1)]!;
}

const T2_CONTENTS = ["中古部品ロット（3〜12点）", "足回り一式 ×2台分", "エンジン補機ロット"] as const;
const T1_CONTENTS = ["鋼材パレット", "樹脂ペレット", "カーボンプリプレグ（冷凍）"] as const;
const T0_CONTENTS = ["粗大ゴミ", "廃タイヤ", "濡れた段ボール"] as const;
const T4_CONTENTS = ["デッドストックのレース用タービン", "競技用ドライサンプ一式", "未使用の鍛造ホイール 2セット"] as const;

export function buildContainers(ctx: MarketContext): ContainerLot[] {
  if (ctx.act < 3) return [];
  const r = mulberry32(hash32(ctx.saveSeed, "container", ctx.week));
  const drought = ctx.containerDrought ?? 0;
  const n = 3 + Math.floor(ctx.act / 2);
  const pool = availableChassis(ctx.act);
  const out: ContainerLot[] = [];
  for (let i = 0; i < n; i++) {
    const port = weightedPick(r, CONTAINER_PORTS, PORT_WEIGHTS);
    let tier = weightedPick(r, CONTAINER_TIERS, tierWeightsFor(port, drought));
    const sealBroken = r() < 0.14;
    if (sealBroken) tier = lowerTier(tier);

    const [wLo, wHi] = TIER_WEIGHT_KG[tier];
    const trueWeight = wLo + r() * (wHi - wLo);
    const weightKg = Math.round(trueWeight * (0.97 + r() * 0.06));

    const [vLo, vHi] = TIER_VALUE_YEN[tier];
    const valueYen = yen(vLo + r() * (vHi - vLo));

    let contents: string;
    if (tier === "T5") contents = weightedPick(r, T5_CONTENTS, T5_CONTENT_WEIGHTS);
    else if (tier === "T4") contents = pick(r, T4_CONTENTS);
    else if (tier === "T3") contents = `不動車両：${pick(r, pool).name}`;
    else if (tier === "T2") contents = pick(r, T2_CONTENTS);
    else if (tier === "T1") contents = pick(r, T1_CONTENTS);
    else contents = pick(r, T0_CONTENTS);

    const xray: XrayHint | null =
      ctx.act < 4
        ? null
        : tier === "T3" || (tier === "T5" && contents.includes("車体"))
          ? "車両らしき輪郭"
          : tier === "T1"
            ? "空洞が多い"
            : tier === "T4" || tier === "T5"
              ? "金属密度が高い"
              : "円筒形が多数";

    // 競合は中身の期待値を読んで入札する（情報が同じなら似た額になる）
    const ev = containerPriorEvYen(port, weightKg, xray, drought);
    const count = 2 + Math.floor(r() * 5);
    let top = 0;
    for (let k = 0; k < count; k++) top = Math.max(top, ev * gauss(r, 1.0, 0.22));

    out.push({
      kind: "container",
      id: `con-${ctx.week}-${i}`,
      port,
      portName: PORT_NAME[port],
      weightKg,
      customsNote: pick(r, ["書類不備", "申告：機械部品", "内容相違", "危険物なし"] as const),
      sealBroken,
      xray,
      tier,
      contents,
      valueYen,
      competitorTopYen: yen(Math.max(10_000, top)),
      competitorCount: count,
    });
  }
  return out;
}

/* ── 5.7 ローカル ─────────────────────────────────────────── */

const LOCAL_PEOPLE = ["環状の整備士・森", "湾岸のチューナー・小宮", "元ワークスの技師・鷹野", "輸入屋のジン", "深夜の部品屋・久我", "町工場の親方・大谷"] as const;

export function buildLocal(ctx: MarketContext): LocalOffer[] {
  const out: LocalOffer[] = [];
  if (ctx.heat >= 70) return out; // 取締りが厳しい週は裏ルートが店を閉める
  const r = mulberry32(hash32(ctx.saveSeed, "local", ctx.week));
  const venues = LOCAL_VENUE_DEFS.filter((v) => ctx.reputation >= v.repRequired);
  if (venues.length === 0) return out;
  const slots = Math.min(4, Math.floor(ctx.reputation / 25));
  // 裏ルートに消耗品は流れない。一点物として意味のある高額部品だけが対象
  const pool = availableParts(ctx.act).filter((p) => p.nominalYen >= 100_000);
  if (pool.length === 0) return out;
  const chassisPool = availableChassis(ctx.act);

  for (let i = 0; i < slots; i++) {
    if (r() > 0.55) continue;
    const venueDef = pick(r, venues);
    const p = pick(r, pool);
    const kindRoll = r();
    const subject: LocalOffer["subject"] =
      venueDef.venue === "shibaura" && kindRoll < 0.4
        ? { kind: "ignitionMap", quality: 0.95 }
        : kindRoll < 0.45
          ? { kind: "part", defId: p.defId }
          : kindRoll < 0.8
            ? { kind: "blueprint", defId: p.defId }
            : { kind: "chassis", chassisId: pick(r, chassisPool).chassisId };

    const costRoll = r();
    const cost: LocalCost =
      subject.kind === "ignitionMap"
        ? { kind: "data", dataKind: "D5", amount: 240 }
        : costRoll < 0.4
          ? { kind: "yen", yen: yen(p.nominalYen * (2.5 + r() * 4) * marketIndexAt(ctx.saveSeed, ctx.week)) }
          : costRoll < 0.62
            ? { kind: "data", dataKind: pick(r, ["D3", "D4", "D5", "D6"] as const), amount: 40 + Math.floor(r() * 160) }
            : costRoll < 0.88
              ? { kind: "race", rivalId: `rival_${Math.floor(r() * 24)}` }
              : { kind: "loan", days: 2 + Math.floor(r() * 5) };

    const isCraft = venueDef.venue === "ota";
    out.push({
      kind: "local",
      id: `loc-${ctx.week}-${i}`,
      venue: venueDef.venue,
      venueName: venueDef.name,
      title:
        subject.kind === "ignitionMap" ? "全日本GT 流出ROM"
        : subject.kind === "blueprint" ? `${p.name} の図面`
        : subject.kind === "chassis" ? "ナンバー無し競技車体"
        : isCraft ? "職人の手曲げチタンタコ足"
        : `${p.name}（ワンオフ）`,
      from: pick(r, LOCAL_PEOPLE),
      subject,
      maxGrade: subject.kind === "blueprint" ? "A" : subject.kind === "ignitionMap" ? "A" : r() < 0.35 ? "LEGENDARY" : "S",
      cost,
      repRequired: venueDef.repRequired,
      expiresOnDay: 3 + Math.floor(r() * 5),
      ...(isCraft ? { perk: "−3.2 kg / 排気効率 +6%" } : {}),
    });
  }
  return out;
}

/** その週の4大市場をまとめて生成する。同じ ctx なら常に同じ結果（決定論） */
export function generateWeeklyMarket(ctx: MarketContext): WeeklyMarket {
  return {
    week: ctx.week,
    marketIndex: marketIndexAt(ctx.saveSeed, ctx.week),
    fx: fxAt(ctx.saveSeed, ctx.week),
    domestic: {
      aa: buildAa(ctx),
      netauc: buildNetAuc(ctx),
      miracle: buildMiracle(ctx),
      yard: buildYard(ctx),
      bluebin: buildBlueBins(ctx),
    },
    imports: buildImports(ctx),
    containers: buildContainers(ctx),
    local: buildLocal(ctx),
  };
}

/* ═══════════════════════ 6. 操作（鑑定・落札・解体） ═══════════════════════ */

export type Inspectable = AaLot | NetAucListing | YardLot;

/**
 * 鑑定：**真値は変えず、表示帯だけを狭める**。
 * ランダム性を「運」ではなく「情報の不足」として扱うための中核関数。
 */
export function inspect<T extends Inspectable>(lot: T, level: InspectionLevel): T {
  const b = band(lot.trueCondition, level);
  const next = { ...lot, inspectionLevel: level, shownConditionMin: b.min, shownConditionMax: b.max };
  if (next.kind === "yard") {
    const y = next as YardLot;
    y.shownFlaws =
      level >= 2 ? [...y.hiddenFlaws] : level >= 1 ? y.hiddenFlaws.filter((f) => f === "counterfeit" || f === "missingParts") : [];
  }
  return next;
}

export interface AuctionResult {
  won: boolean;
  paidYen: number;
  /** 競合の最高指値（結果画面で開示する＝次の入札の学習材料にする） */
  revealedTopYen: number;
}

/**
 * AA / ネトオクの落札判定。**二位価格方式**（競合最高＋1%しか払わない）＝
 * 上限額を正直に入れるのが最適戦略になり、「読み」のゲームとして健全になる。
 */
export function resolveAuction(listing: AaLot | NetAucListing, bidYen: number): AuctionResult {
  if (bidYen <= listing.competitorTopYen) return { won: false, paidYen: 0, revealedTopYen: listing.competitorTopYen };
  const paid = Math.min(bidYen, Math.max(listing.startYen, Math.round(listing.competitorTopYen * 1.01)));
  return { won: true, paidYen: yen(paid), revealedTopYen: listing.competitorTopYen };
}

export interface ContainerBidResult {
  won: boolean;
  /** **一位価格**：入札額をそのまま払う（勝者の呪い） */
  paidYen: number;
  feesYen: number;
  revealedTopYen: number;
  tier?: ContainerTier;
  contents?: string;
  /** 落札額・手数料を差し引いた損益 */
  netYen: number;
}

/**
 * コンテナのブラインド入札。**一位価格**＝自分の入札額をそのまま払う。
 * 二位価格で守ってしまうと「勝者の呪い」が消え、この市場の意味が無くなる。
 */
export function resolveContainerBid(lot: ContainerLot, bidYen: number): ContainerBidResult {
  if (bidYen <= lot.competitorTopYen) {
    return { won: false, paidYen: 0, feesYen: 0, revealedTopYen: lot.competitorTopYen, netYen: 0 };
  }
  const paid = yen(bidYen);
  const fees = yen(paid * 0.05 + 22_000);
  return {
    won: true,
    paidYen: paid,
    feesYen: fees,
    revealedTopYen: lot.competitorTopYen,
    tier: lot.tier,
    contents: lot.contents,
    netYen: lot.valueYen - paid - fees,
  };
}

/**
 * ヒント（港・重量・X線）からティアの事後確率を求める（ベイズ更新）。
 * **情報を買えば勝率が上がる**ことを数式で保証するための関数。
 */
export function posteriorTier(
  port: ContainerPort,
  weightKg: number,
  xray: XrayHint | null,
  drought = 0,
): Record<ContainerTier, number> {
  const prior = tierWeightsFor(port, drought);
  const out: Record<ContainerTier, number> = { T0: 0, T1: 0, T2: 0, T3: 0, T4: 0, T5: 0 };
  let total = 0;
  CONTAINER_TIERS.forEach((t, i) => {
    const [lo, hi] = TIER_WEIGHT_KG[t];
    // 計量誤差 ±3% を考慮してレンジを少し広げる
    const inRange = weightKg >= lo * 0.97 && weightKg <= hi * 1.03;
    const likelihoodWeight = inRange ? 1 / (hi - lo) : 0;
    let lk = likelihoodWeight;
    if (xray) {
      const carLike = t === "T3" || t === "T5";
      const hollow = t === "T1";
      const dense = t === "T4" || t === "T5";
      const drum = t === "T0" || t === "T2";
      const match =
        xray === "車両らしき輪郭" ? (carLike ? 0.9 : 0.04)
        : xray === "空洞が多い" ? (hollow ? 0.8 : 0.08)
        : xray === "金属密度が高い" ? (dense ? 0.85 : 0.07)
        : drum ? 0.7 : 0.1;
      lk *= match;
    }
    const post = (prior[i] ?? 0) * lk;
    out[t] = post;
    total += post;
  });
  if (total <= 0) {
    // 重量がどのレンジにも入らない異常値。事前分布に戻す
    let pt = 0;
    CONTAINER_TIERS.forEach((t, i) => { pt += prior[i] ?? 0; });
    CONTAINER_TIERS.forEach((t, i) => { out[t] = (prior[i] ?? 0) / pt; });
    return out;
  }
  for (const t of CONTAINER_TIERS) out[t] = out[t] / total;
  return out;
}

/** 事後確率から期待値を求める。UI にそのまま出す（期待値を隠さない：原則6） */
export function containerPriorEvYen(
  port: ContainerPort,
  weightKg: number,
  xray: XrayHint | null,
  drought = 0,
): number {
  const post = posteriorTier(port, weightKg, xray, drought);
  let ev = 0;
  for (const t of CONTAINER_TIERS) {
    const [lo, hi] = TIER_VALUE_YEN[t];
    ev += post[t] * ((lo + hi) / 2);
  }
  return Math.max(0, Math.round(ev));
}

export interface SalvageYield {
  materialG: number;
  /** リバースエンジニアリングで得られる試験データ（`05` §3） */
  data: { D2: number; D3: number };
  /** そのまま使える部品として取り出せたか */
  usablePart: boolean;
}

/** 解体（Act5 の解体ラインが自動で回す処理）。ハズレを完全な無駄にしないための出口 */
export function salvage(lot: YardLot): SalvageYield {
  const broken = lot.hiddenFlaws.includes("crack") || lot.hiddenFlaws.includes("counterfeit");
  return {
    materialG: Math.round(lot.massG * (0.55 + 0.4 * lot.trueCondition)),
    data: { D2: Math.round(2 + 8 * lot.trueCondition), D3: lot.nominalYen >= 200_000 ? Math.round(1 + 4 * lot.trueCondition) : 0 },
    usablePart: !broken && lot.trueCondition >= 0.6 && !lot.hiddenFlaws.includes("seized"),
  };
}

/** ヤード1ロットの期待値（UI に出す。ギャンブルを「情報ゲーム」にするための数値） */
export function yardExpectedValueYen(lot: YardLot, scrapYenPerKg = 420): number {
  const mid = (lot.shownConditionMin + lot.shownConditionMax) / 2;
  const pUsable = clamp((mid - 0.35) / 0.45, 0, 1) * 0.82 * (1 - lot.breakChance);
  const partValue = lot.nominalYen * (0.25 + 0.45 * mid);
  const material = (lot.massG * (0.55 + 0.4 * mid) * scrapYenPerKg) / 1000;
  const dataValue = (2 + 8 * mid) * 1_400;
  return Math.round(pUsable * partValue + (1 - pUsable) * material + dataValue);
}

export interface ChassisPenalty {
  /** ねじり剛性に掛かる係数（1.0 が無傷） */
  stiffnessFactor: number;
  repairYen: number;
  repairDays: number;
  /** 矯正不能＝買ってはいけない個体 */
  writeOff: boolean;
}

/** ベース車の素性がラップに効く経路。歪んだ車体は、どれだけ部品を作っても報われない */
export function chassisPenalty(car: { frameBendMm: number; rustLevel: number }): ChassisPenalty {
  const bend = car.frameBendMm;
  return {
    stiffnessFactor: clamp(1 - 0.045 * bend - 0.08 * car.rustLevel, 0.4, 1),
    repairYen: bend <= 1 && car.rustLevel < 0.3 ? 0 : Math.round(45_000 * Math.pow(bend, 1.4) + car.rustLevel * 180_000),
    repairDays: Math.ceil(bend * 1.5 + car.rustLevel * 6),
    writeOff: bend > 6,
  };
}

/**
 * 車体剛性 → 実効グリップ（S4 §5.1 / S5 §6）。
 * 完全レストア（1.37）で μ +4.4%、歪んだ事故車（0.59）で μ −4.9%。
 * 上限 1.05 を置くのは「剛性だけ上げれば勝てる」を防ぐため。
 */
export function effectiveMu(mu0: number, stiffnessFactor: number): number {
  return mu0 * clamp(0.88 + 0.12 * stiffnessFactor, 0.6, 1.05);
}

/* ═══════════════════════ 7. 自動化（Act4 入札エージェント） ═══════════════════════ */

export interface BidRule {
  slot?: PartSlot;
  defId?: PartDefId;
  /** 想定落札価格に対する上限倍率（1.0 = 相場まで） */
  maxFairMultiple: number;
  minCondition: number;
  minSellerStars: number;
  maxWins: number;
}

export interface AgentDecision {
  listingId: string;
  bidYen: number;
}

/**
 * 入札エージェント：プレイヤーが書いたルールを市場に適用し、入札額のリストを返す。
 * 「ガチャを引く」作業そのものを自動化する——本作が自動化ゲームである以上、ここまで行くのが筋。
 */
export function planBids(listings: readonly NetAucListing[], rules: readonly BidRule[], budgetYen: number): AgentDecision[] {
  const out: AgentDecision[] = [];
  const wins = new Map<number, number>();
  let left = budgetYen;
  const sorted = [...listings].sort((a, b) => a.fairYen / a.nominalYen - b.fairYen / b.nominalYen);
  for (const l of sorted) {
    for (let ri = 0; ri < rules.length; ri++) {
      const rule = rules[ri]!;
      if (rule.slot && rule.slot !== l.slot) continue;
      if (rule.defId && rule.defId !== l.defId) continue;
      if (l.shownConditionMax < rule.minCondition) continue;
      if (l.sellerStars < rule.minSellerStars) continue;
      if ((wins.get(ri) ?? 0) >= rule.maxWins) continue;
      const bid = yen(l.fairYen * rule.maxFairMultiple);
      if (bid > left) continue;
      out.push({ listingId: l.id, bidYen: bid });
      wins.set(ri, (wins.get(ri) ?? 0) + 1);
      left -= bid;
      break;
    }
  }
  return out;
}
