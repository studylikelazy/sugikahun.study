/**
 * MIDNIGHT AUTOMATION — フェーズ1「経営ループが回る」のゲーム状態。
 * 設計の正本は docs/midnight-automation/HANDOFF.md と spec/S1〜S6。
 * ロジック（市場・レストア・ラップ）は shared/midnight の純関数を呼ぶだけにし、
 * ここでは所有物・資金・週次遷移だけを持つ。
 */
import type { Act, ChassisId, Grade, PartDefId, PartSlot } from "@shared/midnight/types";
import { GRADE_ORDER } from "@shared/midnight/types";
import { hash32, mulberry32 } from "@shared/midnight/market";
import type { RestorePlan, RestoreProgress, RestoreSubject } from "@shared/midnight/restore";

export const SAVE_KEY = "midnight-automation-v1";
export const INITIAL_YEN = 1_800_000;
export const WEEKLY_OVERHEAD_YEN = 20_000;
export const INSPECT_FEE_YEN = 8_000;
export const TSUKUBA_ENTRY_YEN = 18_000;

/* ─────────────────────────── 所有物 ─────────────────────────── */

export interface OwnedCar {
  id: string;
  chassisId: ChassisId;
  name: string;
  code: string;
  engine: string;
  layout: "FR" | "FF" | "MR" | "AWD";
  dryMassKg: number;
  /** 購入後に確定する真の状態 0..1 */
  condition: number;
  frameBendMm: number;
  rustLevel: number;
  /** chassisPenalty 由来。レストア後は RestoreResult の値（新車超えあり） */
  stiffnessFactor: number;
  odometerKm: number;
  shift: "MT" | "AT";
  source: string;
  pricePaidYen: number;
  weekBought: number;
  restored: boolean;
  addedMassKg: number;
  driveabilityBonus: number;
  /** 走行不能（サビ過多・固着など）。レストアするまで筑波に出られない */
  immobile: boolean;
}

export interface OwnedPart {
  id: string;
  defId: PartDefId;
  slot: PartSlot;
  name: string;
  grade: Grade;
  condition: number;
  nominalYen: number;
  pricePaidYen: number;
  source: string;
  weekBought: number;
  isFake: boolean;
  broken: boolean;
}

export interface PendingDelivery {
  id: string;
  label: string;
  arrivesWeek: number;
  car?: OwnedCar;
  part?: OwnedPart;
  materialLabel?: string;
}

export interface LapRecord {
  week: number;
  carName: string;
  lapS: number;
  idealS: number;
  prizeYen: number;
  repGain: number;
  official: boolean;
  gateClearedAct: number | null;
}

export interface RestoreJob {
  carId: string;
  subject: RestoreSubject;
  plan: RestorePlan;
  progress: RestoreProgress;
  seed: number;
  chargedYen: number;
}

/* ─────────────────────────── タイヤ ─────────────────────────── */

export interface TireDef {
  id: string;
  name: string;
  mu: number;
  priceYen: number;
  note: string;
}

export const TIRE_CATALOG: readonly TireDef[] = [
  { id: "radial", name: "スポーツラジアル", mu: 1.15, priceYen: 68_000, note: "街乗り兼用" },
  { id: "highgrip", name: "ハイグリップラジアル", mu: 1.3, priceYen: 110_000, note: "ストリートクラス" },
  { id: "stire", name: "Sタイヤ", mu: 1.45, priceYen: 180_000, note: "分切りの定番" },
  { id: "slick", name: "スリック", mu: 1.5, priceYen: 240_000, note: "アンリミテッド（公道不可）" },
];

export interface TireState {
  compoundId: string;
  wear: number;
  /** 未使用の在庫セット数（装着中の1セットは含まない） */
  stock: Record<string, number>;
}

/* ─────────────────────────── ゲーム状態 ─────────────────────────── */

export interface GameState {
  version: 1;
  saveSeed: number;
  week: number;
  yen: number;
  rep: number;
  heat: number;
  data: Record<string, number>;
  phantomDrought: number;
  containerDrought: number;
  cars: OwnedCar[];
  parts: OwnedPart[];
  heroCarId: string | null;
  /** slot -> OwnedPart.id */
  equipped: Partial<Record<PartSlot, string>>;
  tire: TireState;
  setup: { finalDrive: number; fuelKg: number; wingAngleDeg: number };
  bestLapS: number | null;
  /** 達成済み Act ゲート（賞金の二重取り防止） */
  clearedGates: number[];
  history: LapRecord[];
  lastResultWeek: number;
  /** listingId -> 購入済み */
  purchased: Record<string, true>;
  /** listingId -> 鑑定レベル */
  inspected: Record<string, 1 | 2>;
  /** 鑑定 Lv2（自社計測ライン）が使えるか */
  hasCmm: boolean;
  /** 青カゴの残り点数と購入回数 */
  binState: Record<string, { remaining: number; pulls: number }>;
  deliveries: PendingDelivery[];
  materials: string[];
  restoreJob: RestoreJob | null;
  log: string[];
  /** この週に公式計測（賞金フル）を消化したか */
  officialDoneWeek: number;
}

export function initialState(): GameState {
  return {
    version: 1,
    saveSeed: Math.floor(Math.random() * 0xffffffff),
    week: 1,
    yen: INITIAL_YEN,
    rep: 0,
    heat: 10,
    data: { D1: 0, D2: 0, D3: 0, D4: 0, D5: 0, D6: 0 },
    phantomDrought: 0,
    containerDrought: 0,
    cars: [],
    parts: [],
    heroCarId: null,
    equipped: {},
    tire: { compoundId: "radial", wear: 0.3, stock: {} },
    setup: { finalDrive: 4.3, fuelKg: 25, wingAngleDeg: 8 },
    bestLapS: null,
    clearedGates: [],
    history: [],
    lastResultWeek: 0,
    purchased: {},
    inspected: {},
    hasCmm: false,
    binState: {},
    deliveries: [],
    materials: [],
    restoreJob: null,
    log: ["廃工場の鍵を受け取った。まずは市場でベース車を探そう。"],
    officialDoneWeek: 0,
  };
}

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as GameState;
    if (parsed.version !== 1 || typeof parsed.week !== "number") return initialState();
    return { ...initialState(), ...parsed };
  } catch {
    return initialState();
  }
}

export function saveState(s: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* 保存失敗でゲームは止めない */
  }
}

/* ─────────────────────────── Act / ゲート ─────────────────────────── */

/** spec/S5 §7.1 の確定ゲート。変更禁止。 */
export const ACT_GATES: ReadonlyArray<{ act: number; gateS: number; title: string }> = [
  { act: 0, gateS: 72.0, title: "鍵と埃" },
  { act: 1, gateS: 66.0, title: "等級という壁" },
  { act: 2, gateS: 62.0, title: "過給の代償" },
  { act: 3, gateS: 58.0, title: "風を見る" },
  { act: 4, gateS: 55.0, title: "壊れない強さ" },
  { act: 5, gateS: 52.0, title: "軽さの暴力" },
  { act: 6, gateS: 49.999, title: "49秒の向こう" },
];

export function actFromBestLap(bestLapS: number | null): Act {
  if (bestLapS === null) return 0;
  let beaten = 0;
  for (const g of ACT_GATES) if (bestLapS <= g.gateS) beaten += 1;
  return Math.min(6, beaten) as Act;
}

/** 筑波の賞金・REP ブラケット（05 §2 公式計測会） */
export function prizeForLap(lapS: number): { yen: number; rep: number } {
  if (lapS < 50) return { yen: 2_000_000, rep: 20 };
  if (lapS < 52) return { yen: 1_200_000, rep: 14 };
  if (lapS < 55) return { yen: 700_000, rep: 10 };
  if (lapS < 58) return { yen: 400_000, rep: 7 };
  if (lapS < 62) return { yen: 220_000, rep: 5 };
  if (lapS < 66) return { yen: 120_000, rep: 3 };
  if (lapS < 72) return { yen: 60_000, rep: 2 };
  if (lapS < 80) return { yen: 30_000, rep: 1 };
  return { yen: 10_000, rep: 0 };
}

/* ─────────────────────────── ヘルパ ─────────────────────────── */

export function formatYen(v: number): string {
  const sign = v < 0 ? "−" : "";
  return `${sign}¥${Math.abs(Math.round(v)).toLocaleString("ja-JP")}`;
}

/** 状態（0..1）から等級を求め、市場の上限でキャップする */
export function gradeFromCondition(condition: number, maxGrade: Grade): Grade {
  const raw: Grade =
    condition >= 0.97 ? "S" : condition >= 0.82 ? "A" : condition >= 0.58 ? "B" : "C";
  const cap = GRADE_ORDER.indexOf(maxGrade);
  const want = maxGrade === "LEGENDARY" && condition >= 0.95 ? 4 : GRADE_ORDER.indexOf(raw);
  return GRADE_ORDER[Math.min(want, cap)]!;
}

/** その週が雨かどうか（ヤードと筑波の両方に効く・決定論） */
export function isRainyWeek(saveSeed: number, week: number): boolean {
  return mulberry32(hash32(saveSeed, "weather", week))() < 0.25;
}

/** 汎用の決定論ロール（購入結果など、リロードで引き直せない判定に使う） */
export function seededRoll(saveSeed: number, key: string, salt: number | string): number {
  return mulberry32(hash32(saveSeed, key, String(salt)))();
}

let uidCounter = 0;
export function uid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${uidCounter}`;
}

export const SLOT_LABEL: Record<string, string> = {
  piston: "ピストン", conrod: "コンロッド", crank: "クランク", camshaft: "カムシャフト",
  head: "ヘッド", block: "ブロック", turbo: "タービン", intercooler: "インタークーラー",
  injector: "インジェクタ", ecu: "ECU", exhaust: "排気系", clutch: "クラッチ",
  gearbox: "ミッション", lsd: "LSD", spring: "スプリング", damper: "ダンパー",
  arm: "サスアーム", swaybar: "スタビライザ", brake: "ブレーキ", tire: "タイヤ",
  wing: "ウィング", diffuser: "ディフューザー", bodyPanel: "ボディパネル",
  cage: "ロールケージ", seat: "シート",
};

export const LIMIT_LABEL: Record<string, string> = {
  lateral: "横G", power: "パワー", traction: "トラクション", braking: "ブレーキ", topSpeed: "最高速",
};
