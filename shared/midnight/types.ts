/**
 * MIDNIGHT AUTOMATION: C1 to TSUKUBA — コンテンツ型定義（参照実装）
 *
 * 設計書: docs/midnight-automation/08_data_schema_and_balance.md §1
 * このファイルは「仕様の実行可能な正本」であり、ランタイムコードを含まない型と定数のみを置く。
 * 実際のコンテンツ (content/*.json) は Zod スキーマでこの形に検証される想定。
 */

/* ───────────────────────── 基本 ───────────────────────── */

export type ItemId = string;
export type FluidId = string;
export type MachineId = string;
export type RecipeId = string;
export type PartDefId = string;
export type ResearchId = string;
export type TrackId = string;
export type ChassisId = string;

/**
 * 製造等級。
 * `LEGENDARY`（伝説品質）＝ ブループリンティング（実測選別・摺り合わせ）を通した最上級。
 * 寸法公差 ±0.003 mm に加え、**セット内の重量差 0.001 g 以下**を満たしたものだけが名乗れる。
 */
export type Grade = "C" | "B" | "A" | "S" | "LEGENDARY";

/** LEGENDARY 成立に必要なセット内重量差 [g]（02 §9.4） */
export const LEGENDARY_MASS_MATCH_G = 0.001;

/** 研究の投入資源（Factorio のサイエンスパック相当） */
export type DataKind = "D1" | "D2" | "D3" | "D4" | "D5" | "D6";

/** 章。0 = 鍵と埃 … 6 = 49秒の向こう */
export type Act = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Layer = "pit" | "ground" | "mezzanine";

export interface LocalizedText {
  ja: string;
  en: string;
}

/** 等級ごとの公差しきい値 [mm]（08 §3.1） */
export const GRADE_TOLERANCE_MM: Readonly<Record<Grade, number>> = {
  C: 0.1,
  B: 0.05,
  A: 0.02,
  S: 0.008,
  LEGENDARY: 0.003,
};

/** 等級の性能係数 q（02 §9.1） */
export const GRADE_QUALITY_FACTOR: Readonly<Record<Grade, number>> = {
  C: 0.9,
  B: 1.0,
  A: 1.06,
  S: 1.12,
  LEGENDARY: 1.18,
};

export const GRADE_ORDER: readonly Grade[] = ["C", "B", "A", "S", "LEGENDARY"];

/** シミュレーションの時間定数（07 §3.1） */
export const TICK_HZ = 20;
export const TICKS_PER_GAME_MINUTE = 20;
export const TICKS_PER_GAME_DAY = 28_800;
/** 契約電力デマンドの評価窓 = 30 ゲーム分 */
export const DEMAND_WINDOW_TICKS = 600;

/* ───────────────────────── アイテム・レシピ・機械 ───────────────────────── */

export type ItemCategory =
  | "raw"
  | "intermediate"
  | "part"
  | "consumable"
  | "data"
  | "waste";

export interface ItemDef {
  id: ItemId;
  name: LocalizedText;
  category: ItemCategory;
  stackSize: number;
  massG: number;
  basePriceYen: number;
  /** 等級を持つアイテムか */
  gradable: boolean;
  unlockAct: Act;
}

export interface RecipeInput {
  item: ItemId;
  count: number;
  minGrade?: Grade;
}

export interface RecipeFluid {
  fluid: FluidId;
  /** 1クラフトあたり [L] */
  amount: number;
}

export interface RecipeOutput {
  item: ItemId;
  count: number;
}

export interface RecipeByproduct extends RecipeOutput {
  /** 0..1 */
  chance: number;
}

export interface RecipeDef {
  id: RecipeId;
  machine: MachineId;
  /** 基準所要 tick（機械の speed で除算される） */
  ticks: number;
  inputs: RecipeInput[];
  fluids?: RecipeFluid[];
  outputs: RecipeOutput[];
  byproducts?: RecipeByproduct[];
  /** 等級判定の閾値 [mm]。未指定なら GRADE_TOLERANCE_MM */
  tolerances?: Partial<Record<Grade, number>>;
  powerKw: number;
  heatKw: number;
  noiseDb: number;
  /** 1クラフトあたりの工具摩耗増分 (0..1) */
  toolWear: number;
  unlockedBy?: ResearchId;
}

export interface MachineDef {
  id: MachineId;
  name: LocalizedText;
  size: { w: number; h: number };
  /** レシピ時間の倍率。1.0 = 基準 */
  speed: number;
  /** 公差ばらつきの基礎値 [mm]（加工機のみ） */
  sigmaBase?: number;
  /** 系統誤差の進行 [mm/tick]（熱変位・摩耗） */
  driftPerTick?: number;
  powerIdleKw: number;
  slots: { input: number; output: number };
  fluidPorts?: Array<{ fluid: FluidId; dir: "in" | "out" }>;
  indoorOnly?: boolean;
  costYen: number;
  unlockAct: Act;
  unlockedBy?: ResearchId;
}

export interface BeltDef {
  id: string;
  tier: 1 | 2 | 3 | 4;
  tilesPerSecond: number;
  /** 2レーン合計 [個/s] */
  itemsPerSecond: number;
  undergroundMax: number;
  powerKwPerTile: number;
  costYen: number;
}

/* ───────────────────────── 品質 ───────────────────────── */

/** 1クラフト分の公差生成に必要な文脈（02 §9.2 / 07 §5） */
export interface CraftQualityContext {
  machineSigmaBase: number;
  driftPerTick: number;
  ticksSinceCalibration: number;
  /** 0..1 */
  toolWear: number;
  envTempC: number;
  /** 0..1 */
  fluidContamination: number;
  /** 0..1（CMM 接続で 1.0） */
  calibration: number;
  inputGrade: Grade | null;
}

/* ───────────────────────── 部品・車両 ───────────────────────── */

export type PartSlot =
  | "piston"
  | "conrod"
  | "crank"
  | "camshaft"
  | "head"
  | "block"
  | "turbo"
  | "intercooler"
  | "injector"
  | "ecu"
  | "exhaust"
  | "clutch"
  | "gearbox"
  | "lsd"
  | "spring"
  | "damper"
  | "arm"
  | "swaybar"
  | "brake"
  | "tire"
  | "wing"
  | "diffuser"
  | "bodyPanel"
  | "cage"
  | "seat";

export interface PartDef {
  id: PartDefId;
  slot: PartSlot;
  name: LocalizedText;
  madeBy: RecipeId;
  massG: number;
  /** slot ごとの物理属性（03 §3.2） */
  attrs: Record<string, number>;
  /** 等級1段あたりの属性係数 */
  gradeEffect?: Record<string, number>;
  regulation: {
    street: boolean;
    streetRadial: boolean;
    sTire: boolean;
    modified: boolean;
  };
  unlockedBy?: ResearchId;
}

export interface PartInstance {
  defId: PartDefId;
  serial: number;
  grade: Grade;
  /** 実測値（重量 g、寸法誤差 mm、バランス g·cm 等） */
  measured: Record<string, number>;
  /** 0..1 */
  wear: number;
  heatCycles: number;
  stressAccum: number;
}

export type DriveLayout = "FR" | "FF" | "MR" | "AWD";

export interface ChassisDef {
  id: ChassisId;
  name: LocalizedText;
  layout: DriveLayout;
  dryMassKg: number;
  wheelbaseMm: number;
  trackWidthMm: { front: number; rear: number };
  cgHeightMm: number;
  /** 0..1 */
  weightDistFront: number;
  torsionalStiffnessNmDeg: number;
  baseCd: number;
  baseFrontalAreaM2: number;
  unlockAct: Act;
}

export interface TorquePoint {
  rpm: number;
  nm: number;
}

export interface TireModel {
  /** ピーク摩擦係数 */
  mu0: number;
  /** 荷重感度 k: mu = mu0 * (Fz/Fz_ref)^(-k) */
  loadSensitivity: number;
  optimalTempC: number;
  tempToleranceC: number;
  /** 0..1 */
  wear: number;
  radiusM: number;
}

export interface BrakeModel {
  /** 前後合計の最大制動トルク [N·m] */
  maxTorqueNm: number;
  /** 0..1（0.5 = 前後均等） */
  biasFront: number;
  heatCapacityKj: number;
  fadeStartC: number;
}

export interface SuspensionSetup {
  rideHeightMm: { front: number; rear: number };
  springRateNmm: { front: number; rear: number };
  damperClicks: { front: number; rear: number };
  swaybar: { front: number; rear: number };
  camberDeg: { front: number; rear: number };
  toeDeg: { front: number; rear: number };
}

/** 部品集約の結果。シミュレータ（走行／QSS）への唯一の入力 */
export interface VehicleSpec {
  chassis: ChassisId;
  layout: DriveLayout;
  massKg: number;
  weightDistFront: number;
  cgHeightM: number;
  wheelbaseM: number;
  torqueCurve: TorquePoint[];
  rpmLimit: number;
  rpmIdle: number;
  gearRatios: number[];
  finalDrive: number;
  shiftTimeS: number;
  drivetrainEff: number;
  lsd: { initialNm: number; lockAccel: number; lockDecel: number };
  cd: number;
  clFront: number;
  clRear: number;
  frontalAreaM2: number;
  tire: TireModel;
  brake: BrakeModel;
  suspension: SuspensionSetup;
  cooling: { radiatorKw: number; oilCoolerKw: number; icEfficiency: number };
  /** slot ごとの信頼性 0..1 */
  reliability: Partial<Record<PartSlot, number>>;
  /** 扱いやすさ 0..1（03 §11） */
  driveability: number;
}

/* ───────────────────────── コース ───────────────────────── */

export type SegmentKind = "straight" | "corner" | "braking" | "complex";

export interface TrackSegment {
  id: string;
  kind: SegmentKind;
  lengthM: number;
  /** null = 直線 */
  radiusM: number | null;
  /** + が登り [%] */
  gradePct: number;
  bankDeg: number;
  /** 乾燥時の路面係数（1.00 基準） */
  surfaceMu: number;
  kerbUsable: boolean;
  /** 公道区間のみ */
  speedLimitKph?: number;
  lighting?: "high" | "mid" | "low" | "tunnel";
}

export interface TrackDef {
  id: TrackId;
  name: LocalizedText;
  kind: "circuit" | "highway";
  totalLengthM: number;
  segments: TrackSegment[];
  sectors: Array<{ id: string; from: number; to: number }>;
}

/* ───────────────────────── 研究 ───────────────────────── */

export type ResearchEffect =
  | { kind: "unlockRecipe"; id: RecipeId }
  | { kind: "unlockMachine"; id: MachineId }
  | { kind: "unlockPart"; id: PartDefId }
  | { kind: "unlockSetup"; field: string }
  | { kind: "modify"; target: string; op: "mul" | "add"; value: number };

export interface ResearchNode {
  id: ResearchId;
  name: LocalizedText;
  act: Act;
  requires: ResearchId[];
  cost: Partial<Record<DataKind, number>>;
  requiresFacility?: MachineId[];
  effects: ResearchEffect[];
}

/* ───────────────────────── 圧力系・世界状態 ───────────────────────── */

export interface PressureState {
  /** 近隣圧 0..100（02 §10） */
  nuisance: number;
  /** 取締り圧 0..100（04 §5） */
  heat: number;
  /** 進行中の重大イベント（同時に 1 つまで） */
  activeMajorEvent: string | null;
}

export interface WeatherState {
  ambientTempC: number;
  trackTempC: number;
  pressureHpa: number;
  /** 0..1 */
  wetness: number;
  windMs: number;
}

/* ───────────────────────── セーブ ───────────────────────── */

export interface SaveHeader {
  magic: "MACT";
  formatVersion: number;
  gameVersion: string;
  tick: number;
  rngState: [number, number, number, number];
  createdAt: number;
  /** FNV-1a 64 の16進表現 */
  checksum: string;
}
