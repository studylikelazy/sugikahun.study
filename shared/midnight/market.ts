/**
 * MIDNIGHT AUTOMATION: C1 to TSUKUBA
 * ───────────────────────────────────────────────────────────
 * 調達市場（4市場）参照実装 — 設計書 `docs/midnight-automation/10_markets_and_sourcing.md`
 *
 * 設計上の要点：
 *  - **完全決定論**（判断ログ D-06）。すべての在庫は `hash32(saveSeed, "...", week)` から生成される。
 *    同じセーブ・同じ週なら、何度リロードしても同じ品物が同じ値段で並ぶ。
 *  - ランダム性の「軸」を市場ごとに分離する：
 *      catalog    … ほぼ無乱数（相場指数のみ）
 *      yard       … **状態（品質）のランダム**
 *      auction    … **出現・レアリティ・競合のランダム**
 *      connection … **解放条件のランダム**（評判とヒートに従属）
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
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length]!;
const yen = (v: number): number => Math.round(v / 100) * 100;

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

/** 部品カテゴリ（スロット）ごとのブーム補正を掛けた指数（0.75〜1.25） */
export function slotIndexAt(saveSeed: number, week: number, slot: PartSlot): number {
  const boom = mulberry32(hash32(saveSeed, "boom", slot, Math.floor(week / 3)))() * 2 - 1;
  return clamp(marketIndexAt(saveSeed, week) * (1 + boom * 0.08), 0.7, 1.3);
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
 * S/BP 等級はここには存在しない＝自分で作るしかない。
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
  layout: "FR" | "FF" | "MR" | "AWD";
  dryMassKg: number;
  /** 当時の新車価格相当（中古相場の基準） */
  newPriceYen: number;
  minAct: Act;
}

/** ベース車プール。**`03` §2 のベースシャシー表が正本**（架空マルク：判断ログ D-08） */
export const MARKET_CHASSIS_POOL: readonly MarketChassisDef[] = [
  { chassisId: "tachibana_s16", name: "橘 スプリンタ S16", layout: "FR", dryMassKg: 925, newPriceYen: 1_380_000, minAct: 0 },
  { chassisId: "tachibana_silka", name: "橘 シルカ S-15", layout: "FR", dryMassKg: 1_180, newPriceYen: 2_480_000, minAct: 1 },
  { chassisId: "kurogane_savant", name: "黒鉄 サヴァント FD", layout: "FR", dryMassKg: 1_240, newPriceYen: 3_380_000, minAct: 2 },
  { chassisId: "hayama_evol4", name: "葉山 エヴォル IV", layout: "AWD", dryMassKg: 1_350, newPriceYen: 2_980_000, minAct: 3 },
  { chassisId: "suganuma_soara", name: "菅沼 ソアーラ JZ", layout: "FR", dryMassKg: 1_510, newPriceYen: 4_580_000, minAct: 4 },
  { chassisId: "nansei_gt33r", name: "南星 GT-33R", layout: "AWD", dryMassKg: 1_560, newPriceYen: 5_280_000, minAct: 5 },
  { chassisId: "asaka_nsr", name: "朝霞 NS-R", layout: "MR", dryMassKg: 1_270, newPriceYen: 7_980_000, minAct: 6 },
];

/* ═══════════════════════ 4. 市場の型 ═══════════════════════ */

export const MARKET_IDS = ["catalog", "yard", "auction", "connection"] as const;
export type MarketId = (typeof MARKET_IDS)[number];

export type Rarity = "common" | "scarce" | "phantom";
export const RARITY_PRICE_MULT: Readonly<Record<Rarity, number>> = { common: 1.0, scarce: 2.2, phantom: 6.5 };
/** 市場に流れうる等級の上限。**S/BP は原則として買えない**（コネクションの一点物のみ例外） */
export const RARITY_MAX_GRADE: Readonly<Record<Rarity, Grade>> = { common: "B", scarce: "A", phantom: "S" };

export type YardFlaw = "crack" | "seized" | "missingParts" | "counterfeit";
/** 0=未鑑定（±0.25）／1=簡易鑑定（±0.10）／2=自社計測ライン（±0.03・全瑕疵開示） */
export type InspectionLevel = 0 | 1 | 2;
export const INSPECTION_BAND: Readonly<Record<InspectionLevel, number>> = { 0: 0.25, 1: 0.1, 2: 0.03 };
export const INSPECTION_FEE_YEN: Readonly<Record<InspectionLevel, number>> = { 0: 0, 1: 8_000, 2: 0 };

export interface CatalogEntry {
  kind: "catalog";
  id: string;
  defId: PartDefId;
  slot: PartSlot;
  name: string;
  priceYen: number;
  leadDays: number;
  maxGrade: Grade;
  /** 受注生産（A級・納期長・高額） */
  madeToOrder: boolean;
}

export interface YardLot {
  kind: "yard";
  id: string;
  defId: PartDefId;
  slot: PartSlot;
  name: string;
  massG: number;
  nominalYen: number;
  askYen: number;
  /** 真の状態 0.05–0.95。**未鑑定ではプレイヤーに見せてはならない** */
  trueCondition: number;
  shownConditionMin: number;
  shownConditionMax: number;
  inspectionLevel: InspectionLevel;
  /** 鑑定レベルに応じて開示される瑕疵 */
  shownFlaws: YardFlaw[];
  hiddenFlaws: YardFlaw[];
}

export interface AuctionListing {
  kind: "auction";
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
  isFake: boolean;
  startYen: number;
  /** 想定落札価格（UI にはレンジで表示する） */
  fairYen: number;
  /** 競合の最高指値（隠し）。`resolveAuction` でのみ使う */
  competitorTopYen: number;
  competitorCount: number;
  closesOnDay: number;
}

export type ConnectionCost =
  | { kind: "yen"; yen: number }
  | { kind: "data"; dataKind: "D3" | "D4" | "D5" | "D6"; amount: number }
  | { kind: "race"; rivalId: string }
  | { kind: "loan"; days: number };

export interface ConnectionOffer {
  kind: "connection";
  id: string;
  title: string;
  from: string;
  subject: { kind: "part"; defId: PartDefId } | { kind: "blueprint"; defId: PartDefId } | { kind: "chassis"; chassisId: ChassisId };
  maxGrade: Grade;
  cost: ConnectionCost;
  repRequired: number;
  expiresOnDay: number;
}

export interface BaseCarListing {
  kind: "baseCar";
  id: string;
  market: MarketId;
  chassisId: ChassisId;
  name: string;
  layout: "FR" | "FF" | "MR" | "AWD";
  dryMassKg: number;
  odometerKm: number;
  /** フレーム歪み mm。>6 は矯正不能（買ってはいけない個体） */
  frameBendMm: number;
  /** 腐食 0–1 */
  rustLevel: number;
  accidentHistory: boolean;
  oneOwner: boolean;
  /** 車検・ナンバーの有無。無しはサーキット専用 */
  hasPlate: boolean;
  askYen: number;
  inspectionLevel: InspectionLevel;
}

export interface WeeklyMarket {
  week: number;
  marketIndex: number;
  catalog: CatalogEntry[];
  yard: YardLot[];
  auction: AuctionListing[];
  connection: ConnectionOffer[];
  baseCars: BaseCarListing[];
}

export interface MarketContext {
  saveSeed: number;
  week: number;
  act: Act;
  /** 夜の評判 0–100（`04` §6）。コネクション市場の解放条件 */
  reputation: number;
  /** 取締り圧 0–100。高いと裏ルートが店を閉める */
  heat: number;
  /** 幻級を引けていない週数（天井＝ピティ用。呼び出し側が保持する） */
  phantomDrought: number;
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

export function phantomProbability(drought: number): number {
  return Math.min(PHANTOM_PITY_MAX, PHANTOM_BASE_P + PHANTOM_PITY_STEP * Math.max(0, drought));
}

function availableParts(act: Act): MarketPartDef[] {
  return MARKET_PART_POOL.filter((p) => p.minAct <= act);
}

function band(cond: number, level: InspectionLevel): { min: number; max: number } {
  const w = INSPECTION_BAND[level];
  return { min: clamp(cond - w, 0, 1), max: clamp(cond + w, 0, 1) };
}

/** カタログ：乱数は相場指数のみ。確実性を金で買う市場 */
function buildCatalog(ctx: MarketContext): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const p of availableParts(ctx.act)) {
    const idx = slotIndexAt(ctx.saveSeed, ctx.week, p.slot);
    out.push({
      kind: "catalog",
      id: `cat-${ctx.week}-${p.defId}`,
      defId: p.defId,
      slot: p.slot,
      name: p.name,
      priceYen: yen(p.nominalYen * idx),
      leadDays: p.nominalYen > 400_000 ? 3 : 1,
      maxGrade: "B",
      madeToOrder: false,
    });
    if (ctx.act >= 2) {
      out.push({
        kind: "catalog",
        id: `cat-${ctx.week}-${p.defId}-mto`,
        defId: p.defId,
        slot: p.slot,
        name: `${p.name}（受注生産・A級保証）`,
        priceYen: yen(p.nominalYen * idx * 2.6),
        leadDays: 7,
        maxGrade: "A",
        madeToOrder: true,
      });
    }
  }
  return out;
}

/** ヤード：状態のガチャ。安いが、開けるまで分からない */
function buildYard(ctx: MarketContext): YardLot[] {
  const r = mulberry32(hash32(ctx.saveSeed, "yard", ctx.week));
  const pool = availableParts(ctx.act);
  const n = YARD_LOTS_MIN + Math.floor(r() * (YARD_LOTS_MAX - YARD_LOTS_MIN + 1));
  const lots: YardLot[] = [];
  for (let i = 0; i < n; i++) {
    const p = pick(r, pool);
    const cond = clamp(0.45 + (bell(r) - 0.5) * 1.3, 0.05, 0.95);
    const flaws: YardFlaw[] = [];
    if (r() < 0.18 * (1 - cond)) flaws.push("crack");
    if (r() < 0.3 * (1 - cond)) flaws.push("seized");
    if (r() < 0.12) flaws.push("missingParts");
    if (r() < 0.03) flaws.push("counterfeit");
    // 売り手は「見た目」で値付けする＝価格は状態の弱いシグナルにしかならない
    const apparent = clamp(cond + (bell(r) - 0.5) * 0.3, 0.05, 1);
    const idx = slotIndexAt(ctx.saveSeed, ctx.week, p.slot);
    const b = band(cond, 0);
    lots.push({
      kind: "yard",
      id: `yard-${ctx.week}-${i}`,
      defId: p.defId,
      slot: p.slot,
      name: p.name,
      massG: p.massG,
      nominalYen: p.nominalYen,
      askYen: yen(p.nominalYen * (0.08 + 0.3 * apparent) * idx),
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
  if (lots[best]!.trueCondition < 0.6) {
    const l = lots[best]!;
    l.trueCondition = 0.6 + r() * 0.25;
    l.hiddenFlaws = l.hiddenFlaws.filter((f) => f === "missingParts");
    const b = band(l.trueCondition, 0);
    l.shownConditionMin = b.min;
    l.shownConditionMax = b.max;
    l.askYen = yen(l.nominalYen * (0.08 + 0.3 * l.trueCondition) * slotIndexAt(ctx.saveSeed, ctx.week, l.slot));
  }
  return lots;
}

/** 深夜オークション：出現とレアリティと競合のガチャ */
function buildAuction(ctx: MarketContext): AuctionListing[] {
  const r = mulberry32(hash32(ctx.saveSeed, "auction", ctx.week));
  const pool = availableParts(ctx.act);
  const n = 10 + 2 * ctx.act;
  const pPhantom = phantomProbability(ctx.phantomDrought);
  // 幻級は「ワンオフとして意味のある高額部品」からしか出ない（幻のスプリングは興醒めなので）
  const exotic = pool.filter((p) => p.nominalYen >= PHANTOM_MIN_NOMINAL_YEN);
  const out: AuctionListing[] = [];
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
      kind: "auction",
      id: `auc-${ctx.week}-${i}`,
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
      isFake,
      startYen: yen(fair * 0.35),
      fairYen: yen(fair),
      competitorTopYen: yen(top),
      competitorCount: count,
      closesOnDay: 1 + Math.floor(r() * 7),
    });
  }
  return out;
}

const CONNECTION_PEOPLE = ["環状の整備士・森", "湾岸のチューナー・小宮", "元ワークスの技師・鷹野", "輸入屋のジン", "深夜の部品屋・久我"] as const;

/** コネクション：金ではなく評判で開く市場。BP級と設計図はここだけ */
function buildConnection(ctx: MarketContext): ConnectionOffer[] {
  const r = mulberry32(hash32(ctx.saveSeed, "connection", ctx.week));
  const out: ConnectionOffer[] = [];
  if (ctx.heat >= 70) return out; // 取締りが厳しい週は裏ルートが店を閉める
  const slots = Math.min(3, Math.floor(ctx.reputation / 30));
  // 裏ルートに消耗品は流れない。一点物として意味のある高額部品だけが対象
  const pool = availableParts(ctx.act).filter((p) => p.nominalYen >= 100_000);
  if (pool.length === 0) return out;
  for (let i = 0; i < slots; i++) {
    if (r() > 0.55) continue;
    const p = pick(r, pool);
    const kindRoll = r();
    const chassisPool = MARKET_CHASSIS_POOL.filter((c) => c.minAct <= ctx.act);
    const subject: ConnectionOffer["subject"] =
      kindRoll < 0.5
        ? { kind: "part", defId: p.defId }
        : kindRoll < 0.85
          ? { kind: "blueprint", defId: p.defId }
          : { kind: "chassis", chassisId: pick(r, chassisPool).chassisId };
    const costRoll = r();
    const cost: ConnectionCost =
      costRoll < 0.45
        ? { kind: "yen", yen: yen(p.nominalYen * (2.5 + r() * 4) * marketIndexAt(ctx.saveSeed, ctx.week)) }
        : costRoll < 0.7
          ? { kind: "data", dataKind: pick(r, ["D3", "D4", "D5", "D6"] as const), amount: 40 + Math.floor(r() * 160) }
          : costRoll < 0.9
            ? { kind: "race", rivalId: `rival_${Math.floor(r() * 24)}` }
            : { kind: "loan", days: 2 + Math.floor(r() * 5) };
    out.push({
      kind: "connection",
      id: `con-${ctx.week}-${i}`,
      title: subject.kind === "blueprint" ? `${p.name} の図面` : subject.kind === "chassis" ? "一点物の車体" : `${p.name}（ワンオフ）`,
      from: pick(r, CONNECTION_PEOPLE),
      subject,
      maxGrade: subject.kind === "blueprint" ? "A" : r() < 0.35 ? "BP" : "S",
      cost,
      repRequired: 30 * (i + 1),
      expiresOnDay: 3 + Math.floor(r() * 5),
    });
  }
  return out;
}

/** ベース車：市場ごとに「素性」の分布がまったく違う */
function buildBaseCars(ctx: MarketContext): BaseCarListing[] {
  const r = mulberry32(hash32(ctx.saveSeed, "basecar", ctx.week));
  const pool = MARKET_CHASSIS_POOL.filter((c) => c.minAct <= ctx.act);
  const idx = marketIndexAt(ctx.saveSeed, ctx.week);
  const out: BaseCarListing[] = [];
  const push = (market: MarketId, c: MarketChassisDef, o: Omit<BaseCarListing, "kind" | "id" | "market" | "chassisId" | "name" | "layout" | "dryMassKg" | "inspectionLevel">): void => {
    out.push({
      kind: "baseCar",
      id: `car-${market}-${ctx.week}-${out.length}`,
      market,
      chassisId: c.chassisId,
      name: c.name,
      layout: c.layout,
      dryMassKg: c.dryMassKg,
      inspectionLevel: 0,
      ...o,
    });
  };

  // カタログ（認定中古）：高い・程度良好・素性が完全に開示されている。車種は重複させない
  const shuffled = [...pool].sort((a, b) => hash32(ctx.saveSeed, "cat", ctx.week, a.chassisId) - hash32(ctx.saveSeed, "cat", ctx.week, b.chassisId));
  for (let i = 0; i < Math.min(3, shuffled.length); i++) {
    const c = shuffled[i]!;
    push("catalog", c, {
      odometerKm: Math.round((5 + r() * 35) * 1000),
      frameBendMm: 0,
      rustLevel: r() * 0.05,
      accidentHistory: false,
      oneOwner: r() < 0.6,
      hasPlate: true,
      askYen: yen(c.newPriceYen * (0.75 + r() * 0.2) * idx),
    });
  }
  // ヤード（不動・事故）：激安。フレーム歪みは鑑定しないと見えない
  const yardCount = 2 + Math.floor(r() * 3);
  for (let i = 0; i < yardCount; i++) {
    const c = pick(r, pool);
    const bend = r() < 0.55 ? r() * 8 : r() * 1.5;
    push("yard", c, {
      odometerKm: Math.round((90 + r() * 150) * 1000),
      frameBendMm: Math.round(bend * 10) / 10,
      rustLevel: 0.25 + r() * 0.65,
      accidentHistory: bend > 1.5,
      oneOwner: false,
      hasPlate: r() < 0.15,
      askYen: yen(c.newPriceYen * (0.03 + r() * 0.09) * idx),
    });
  }
  // オークション（素性ガチャ）：当たりもハズレもここに出る
  const aucCount = 2 + Math.floor(r() * 4);
  for (let i = 0; i < aucCount; i++) {
    const c = pick(r, pool);
    const accident = r() < 0.28;
    const oneOwner = !accident && r() < 0.17;
    const odo = oneOwner ? Math.round((12 + r() * 25) * 1000) : Math.round((20 + r() * 160) * 1000);
    push("auction", c, {
      odometerKm: odo,
      frameBendMm: Math.round((accident ? r() * 6 : r() * 1) * 10) / 10,
      rustLevel: r() * 0.45,
      accidentHistory: accident,
      oneOwner,
      hasPlate: r() < 0.8,
      askYen: yen(c.newPriceYen * (0.12 + r() * 0.43) * (oneOwner ? 1.35 : 1) * idx),
    });
  }
  return out;
}

/** その週の4市場をまとめて生成する。同じ ctx なら常に同じ結果（決定論） */
export function generateWeeklyMarket(ctx: MarketContext): WeeklyMarket {
  return {
    week: ctx.week,
    marketIndex: marketIndexAt(ctx.saveSeed, ctx.week),
    catalog: buildCatalog(ctx),
    yard: buildYard(ctx),
    auction: buildAuction(ctx),
    connection: buildConnection(ctx),
    baseCars: buildBaseCars(ctx),
  };
}

/* ═══════════════════════ 6. 操作（鑑定・落札・解体） ═══════════════════════ */

/**
 * 鑑定：**真値は変えず、表示帯だけを狭める**。
 * ランダム性を「運」ではなく「情報の不足」として扱うための中核関数。
 */
export function inspect<T extends YardLot | AuctionListing>(lot: T, level: InspectionLevel): T {
  const b = band(lot.trueCondition, level);
  const next = { ...lot, inspectionLevel: level, shownConditionMin: b.min, shownConditionMax: b.max };
  if (next.kind === "yard") {
    const y = next as YardLot;
    y.shownFlaws = level >= 2 ? [...y.hiddenFlaws] : level >= 1 ? y.hiddenFlaws.filter((f) => f === "counterfeit" || f === "missingParts") : [];
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
 * 落札判定。**二位価格方式**（競合最高＋1%しか払わない）＝
 * 上限額を正直に入れるのが最適戦略になり、「読み」のゲームとして健全になる。
 */
export function resolveAuction(listing: AuctionListing, bidYen: number): AuctionResult {
  if (bidYen <= listing.competitorTopYen) return { won: false, paidYen: 0, revealedTopYen: listing.competitorTopYen };
  const paid = Math.min(bidYen, Math.max(listing.startYen, Math.round(listing.competitorTopYen * 1.01)));
  return { won: true, paidYen: yen(paid), revealedTopYen: listing.competitorTopYen };
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
  const pUsable = clamp((mid - 0.35) / 0.45, 0, 1) * 0.82;
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
export function chassisPenalty(car: Pick<BaseCarListing, "frameBendMm" | "rustLevel">): ChassisPenalty {
  const bend = car.frameBendMm;
  return {
    stiffnessFactor: clamp(1 - 0.045 * bend - 0.08 * car.rustLevel, 0.4, 1),
    repairYen: bend <= 1 && car.rustLevel < 0.3 ? 0 : Math.round(45_000 * Math.pow(bend, 1.4) + car.rustLevel * 180_000),
    repairDays: Math.ceil(bend * 1.5 + car.rustLevel * 6),
    writeOff: bend > 6,
  };
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
export function planBids(listings: readonly AuctionListing[], rules: readonly BidRule[], budgetYen: number): AgentDecision[] {
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
