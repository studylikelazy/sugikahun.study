# 08. データスキーマとバランス表

本書の数値が**単一の正**である。他ドキュメントの数値は本書からの引用とみなす。
実装上の正本は `content/*.json`＋`content/schema/*.ts`（Zod）であり、本書はその人間可読版。

---

## 1. 型定義（TypeScript）

```ts
// ───────── 基本 ─────────
export type ItemId = string;      // "piston_forged"
export type FluidId = string;     // "cutting_oil"
export type MachineId = string;   // "grinder_t2"
export type RecipeId = string;    // "piston_grind"
export type PartDefId = string;   // "piston_2618_86mm"
export type ResearchId = string;  // "res_blueprinting"
export type TrackId = string;     // "tsukuba_tc2000" | "c1_outer"
export type Grade = "C" | "B" | "A" | "S" | "BP";
export type DataKind = "D1" | "D2" | "D3" | "D4" | "D5" | "D6";
export type Act = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ───────── アイテム ─────────
export interface ItemDef {
  id: ItemId;
  name: { ja: string; en: string };
  category: "raw" | "intermediate" | "part" | "consumable" | "data" | "waste";
  stackSize: number;
  massG: number;
  basePriceYen: number;        // 購入価格（売却は 0.3–0.6 倍）
  gradable: boolean;           // 等級を持つか
  unlockAct: Act;
}

// ───────── レシピ ─────────
export interface RecipeDef {
  id: RecipeId;
  machine: MachineId;
  ticks: number;                              // 基準時間（機械の speed で除算）
  inputs:  Array<{ item: ItemId; count: number; minGrade?: Grade }>;
  fluids?: Array<{ fluid: FluidId; amount: number }>;   // 1クラフトあたり [L]
  outputs: Array<{ item: ItemId; count: number }>;
  byproducts?: Array<{ item: ItemId; count: number; chance: number }>;
  tolerances?: Partial<Record<Grade, number>>; // 等級判定の閾値 [mm]
  powerKw: number;
  heatKw: number;
  noiseDb: number;
  toolWear: number;            // 1クラフトあたりの摩耗増分 (0..1)
  unlockedBy?: ResearchId;
}

// ───────── 機械 ─────────
export interface MachineDef {
  id: MachineId;
  name: { ja: string; en: string };
  size: { w: number; h: number };     // タイル
  speed: number;                      // レシピ時間の倍率（1.0 = 基準）
  sigmaBase: number;                  // 公差ばらつきの基礎値 [mm]
  driftPerTick: number;               // 系統誤差の進行 [mm/tick]
  powerIdleKw: number;
  slots: { input: number; output: number };
  fluidPorts?: Array<{ fluid: FluidId; dir: "in" | "out" }>;
  indoorOnly?: boolean;
  costYen: number;
  unlockAct: Act;
  unlockedBy?: ResearchId;
}

// ───────── 搬送 ─────────
export interface BeltDef {
  id: string; tier: 1|2|3|4;
  tilesPerSecond: number;
  itemsPerSecond: number;    // 2レーン合計
  undergroundMax: number;    // タイル
  powerKwPerTile: number;
  costYen: number;
}

// ───────── 部品 ─────────
export interface PartDef {
  id: PartDefId;
  slot: PartSlot;                       // "piston" | "turbo" | "wing" ...
  name: { ja: string; en: string };
  madeBy: RecipeId;
  massG: number;
  attrs: Record<string, number>;        // slotごとの物理属性（§4.2）
  gradeEffect: Partial<Record<keyof PartDef["attrs"], number>>; // 等級1段あたりの係数
  regulation: { street: boolean; streetRadial: boolean; sTire: boolean; modified: boolean };
  unlockedBy?: ResearchId;
}

export interface PartInstance {
  defId: PartDefId;
  serial: number;
  grade: Grade;
  measured: Record<string, number>;     // 実測（重量・寸法誤差・バランス）
  wear: number;                          // 0..1
  heatCycles: number;
  stressAccum: number;
}

// ───────── 車両 ─────────
export interface ChassisDef {
  id: string;
  name: { ja: string; en: string };
  layout: "FR" | "FF" | "MR" | "AWD";
  dryMassKg: number;
  wheelbaseMm: number;
  trackWidthMm: { front: number; rear: number };
  cgHeightMm: number;
  weightDistFront: number;      // 0..1
  torsionalStiffness: number;   // Nm/deg
  baseCd: number; baseAreaM2: number;
  unlockAct: Act;
}

export interface VehicleSpec {        // 部品集約の結果（sim への入力）
  massKg: number;
  cg: { x: number; y: number; z: number };
  torqueCurve: Float32Array;          // 500rpm 刻み、N·m
  rpmLimit: number;
  gearRatios: number[]; finalDrive: number; shiftTimeS: number;
  drivetrainEff: number; lsd: { initialNm: number; lockAccel: number; lockDecel: number };
  cd: number; clFront: number; clRear: number; frontalAreaM2: number;
  tire: TireModel;
  brake: BrakeModel;
  suspension: SuspensionSetup;
  cooling: { radiatorKw: number; oilCoolerKw: number; icEfficiency: number };
  reliability: Record<PartSlot, number>;   // 0..1
  driveability: number;                    // 0..1（03 §11）
}

// ───────── コース ─────────
export interface TrackSegment {
  id: string;
  kind: "straight" | "corner" | "braking" | "complex";
  lengthM: number;
  radiusM: number | null;      // null = 直線
  gradePct: number;            // +が登り
  bankDeg: number;
  surfaceMu: number;           // 乾燥時の基準
  kerbUsable: boolean;
  speedLimitKph?: number;      // 公道区間のみ
  lighting?: "high" | "mid" | "low" | "tunnel";
}
export interface TrackDef {
  id: TrackId;
  name: { ja: string; en: string };
  kind: "circuit" | "highway";
  totalLengthM: number;
  segments: TrackSegment[];
  sectors: Array<{ id: string; from: number; to: number }>;
}

// ───────── 研究 ─────────
export interface ResearchNode {
  id: ResearchId;
  name: { ja: string; en: string };
  act: Act;
  requires: ResearchId[];
  cost: Partial<Record<DataKind, number>>;
  requiresFacility?: MachineId[];
  effects: ResearchEffect[];
}
export type ResearchEffect =
  | { kind: "unlockRecipe"; id: RecipeId }
  | { kind: "unlockMachine"; id: MachineId }
  | { kind: "unlockPart"; id: PartDefId }
  | { kind: "modify"; target: string; op: "mul" | "add"; value: number }  // 例 "turbo.inertia" ×0.75
  | { kind: "unlockSetup"; field: string };

// ───────── セーブ ─────────
export interface SaveHeader {
  magic: "MACT"; formatVersion: number; gameVersion: string;
  tick: number; rngState: [number, number, number, number];
  createdAt: number; checksum: string;
}
```

---

## 2. アイテム表（抜粋 32/約120）

| ID | 名称 | 区分 | 単価 | 等級 | 解放 |
|---|---|---|---|---|---|
| `scrap_steel` | スクラップ鋼 | raw | ¥38/個 | — | Act0 |
| `bar_s45c` | S45C 丸棒 | raw | ¥210 | — | Act0 |
| `bar_scm435` | SCM435 丸棒 | raw | ¥480 | — | Act1 |
| `billet_a2618` | A2618 鍛造材 | raw | ¥1,250 | — | Act2 |
| `ingot_cast_iron` | 鋳鉄インゴット | raw | ¥160 | — | Act1 |
| `bar_ti64` | Ti-6Al-4V 棒 | raw | ¥9,800 | — | Act5 |
| `inconel_bar` | インコネル棒 | raw | ¥18,400 | — | Act5 |
| `prepreg_cf` | カーボンプリプレグ | raw | ¥6,200 | — | Act3 |
| `wafer_si` | シリコンウェハ | raw | ¥3,100 | — | Act2 |
| `rubber_compound` | ゴムコンパウンド | raw | ¥340 | — | Act0 |
| `steel_blank` | 鋼ブランク | intermediate | — | — | Act0 |
| `cast_blank` | 鋳物ブランク | intermediate | — | — | Act1 |
| `forged_blank` | 鍛造ブランク | intermediate | — | — | Act2 |
| `machined_rough` | 粗加工品 | intermediate | — | ○ | Act0 |
| `hardened_part` | 熱処理品 | intermediate | — | ○ | Act1 |
| `piston_forged` | 鍛造ピストン | part | — | ○ | Act2 |
| `conrod_scm` | コンロッド | part | — | ○ | Act1 |
| `crank_billet` | ビレットクランク | part | — | ○ | Act4 |
| `camshaft_hi` | ハイカム | part | — | ○ | Act2 |
| `head_ported` | ポート研磨ヘッド | part | — | ○ | Act1 |
| `turbo_assy` | タービンASSY | part | — | ○ | Act2 |
| `intercooler` | インタークーラー | part | — | ○ | Act2 |
| `injector_hi` | 大容量インジェクタ | part | — | ○ | Act2 |
| `ecu_v2` | フルコンECU | part | — | ○ | Act2 |
| `gearset_close` | クロスギアセット | part | — | ○ | Act3 |
| `lsd_mech` | 機械式LSD | part | — | ○ | Act1 |
| `coilover` | 車高調 | part | — | ○ | Act1 |
| `wing_gt_l` | GTウィング（大） | part | — | ○ | Act3 |
| `rotor_big` | 大径ローター | part | — | ○ | Act4 |
| `tool_insert` | 工具チップ | consumable | ¥420 | — | Act0 |
| `testpiece_fatigue` | 疲労試験片 | consumable | — | ○ | Act4 |
| `chips_swarf` | 切粉 | waste | — | — | Act0 |

---

## 3. レシピ表（抜粋 20/約140）

| レシピ | 機械 | 時間 | 入力 | 流体 | 出力 | 電力 | 騒音 | 摩耗 |
|---|---|---|---|---|---|---|---|---|
| `steel_melt` | 溶解炉 | 240 | scrap×3 | 冷却水 30L | steel_blank×2 | 180 kW | 88 dB | — |
| `cast_block` | 鋳造機 | 420 | ingot_cast_iron×6 | — | cast_blank×1 | 95 kW | 84 dB | — |
| `forge_blank` | 鍛造プレス | 180 | bar_scm435×2 | 作動油 8L | forged_blank×1 | 220 kW | 96 dB | 0.004 |
| `rough_turn` | NC旋盤 | 160 | billet_a2618×1 | 切削油 20L | machined_rough×1 | 22 kW | 72 dB | 0.012 |
| `mill_piston` | MC | 220 | machined_rough×1 | 切削油 14L | piston_raw×1 | 30 kW | 74 dB | 0.016 |
| `heat_carburize` | 浸炭炉 | 600 | machined_rough×4 | — | hardened_part×4 | 140 kW | 62 dB | — |
| `grind_piston` | 研削盤 | 180 | piston_raw×1 | 研削液 10L | piston_forged×1 | 18 kW | 70 dB | 0.020 |
| `measure_gate` | 計測ゲート | 40 | 任意部品×1 | — | 等級別に振り分け | 3 kW | 48 dB | — |
| `balance_rotating` | バランサー | 300 | crank_billet×1 | — | crank_balanced×1 | 12 kW | 58 dB | 0.006 |
| `assy_turbo` | 組立架台 | 300 | wheel_t, wheel_c, housing, chra | — | turbo_assy×1 | 8 kW | 52 dB | — |
| `mold_carbon` | オートクレーブ | 1,800 | prepreg_cf×8 | 圧縮エア | carbon_panel×1 | 310 kW | 66 dB | — |
| `make_ecu` | 電装ベンチ | 400 | board, wafer_si×4, harness | — | ecu_v2×1 | 6 kW | 44 dB | — |
| `tool_regrind` | 工具再研磨 | 120 | tool_insert_worn×4 | 研削液 6L | tool_insert×3 | 14 kW | 68 dB | — |
| `recycle_swarf` | リサイクル炉 | 300 | chips_swarf×10 | — | scrap_steel×7 | 150 kW | 80 dB | — |
| `dyno_pull` | エンジンダイナモ | 600 | engine_unit（返却）, ガソリン 12L | 冷却水 60L | **D1×3** | 45 kW | 102 dB | — |
| `chassis_dyno` | シャシダイ | 400 | HERO CAR（占有）, ガソリン 9L | 冷却水 40L | **D2×3** | 38 kW | 94 dB | — |
| `wind_tunnel` | 縮尺風洞 | 800 | model_15（返却） | — | **D3×4** | 520 kW | 86 dB | — |
| `fatigue_test` | 耐久ベンチ | 1,000 | testpiece_fatigue×1 | 作動油 4L | **D4×5** | 26 kW | 76 dB | — |
| `metallurgy` | 冶金ラボ | 900 | sample×1, 試薬×2 | — | **D6×4** | 18 kW | 42 dB | — |
| `telemetry_analyze` | 解析ラボ | 300 | telemetry_packet×1 | — | **D5×(8–20)** | 22 kW | 40 dB | — |

### 3.1 等級閾値（`tolerances`）の既定

| 等級 | 閾値 [mm] |
|---|---|
| C | 0.100 |
| B | 0.050 |
| A | 0.020 |
| S | 0.008 |
| BP | 0.003（選別工程のみ） |

---

## 4. 機械表と公差パラメータ

| 機械 | サイズ | speed | `sigmaBase` | `driftPerTick` | 電力 | 価格 | 解放 |
|---|---|---|---|---|---|---|---|
| 手作業台 | 2×2 | 0.25 | 0.120 | 6.0e-7 | 0 | ¥35k | Act0 |
| 汎用旋盤 | 3×3 | 0.70 | 0.070 | 4.0e-7 | 14 kW | ¥420k | Act0 |
| NC旋盤 | 3×3 | 1.00 | 0.040 | 2.2e-7 | 22 kW | ¥1.6M | Act0 |
| マシニングセンタ | 4×4 | 1.15 | 0.028 | 1.6e-7 | 30 kW | ¥3.2M | Act1 |
| 高精度MC | 4×4 | 1.30 | 0.014 | 9.0e-8 | 42 kW | ¥9.8M | Act4 |
| 研削盤 | 3×3 | 1.00 | 0.011 | 1.1e-7 | 18 kW | ¥2.4M | Act1 |
| 精密研削盤 | 3×4 | 1.10 | 0.0045 | 5.0e-8 | 24 kW | ¥11.5M | Act4 |
| ホーニング盤 | 3×3 | 0.95 | 0.0035 | 4.0e-8 | 16 kW | ¥8.2M | Act5 |
| 放電加工機 | 4×4 | 0.60 | 0.0060 | 3.0e-8 | 36 kW | ¥16M | Act5 |
| 溶解炉 | 5×5 | 1.00 | — | — | 180 kW | ¥5.5M | Act1 |
| 浸炭炉 | 4×6 | 1.00 | — | — | 140 kW | ¥7.4M | Act1 |
| 鍛造プレス | 5×5 | 1.00 | — | — | 220 kW | ¥12M | Act2 |
| オートクレーブ | 6×8 | 1.00 | — | — | 310 kW | ¥24M | Act3 |
| 計測ゲート | 2×2 | 1.00 | — | — | 3 kW | ¥1.2M | Act1 |
| 三次元測定機 | 4×4 | 1.00 | — | — | 9 kW | ¥14M | Act4 |
| バランサー | 3×3 | 1.00 | — | — | 12 kW | ¥6.8M | Act4 |
| 選別機（BP） | 4×4 | 1.00 | — | — | 7 kW | ¥22M | Act6 |

**恒温室の効果**：室温 20±1℃ を維持できるタイル上の機械は `sigmaBase × 0.85`。
**校正の効果**：`calibration` は CMM 接続で最大 1.0（`σ × 0.65`）。

---

## 5. 研究コスト表（主要40・抜粋）

`05` §3.2 と同一。コストの設計則：

```
cost(node) = base(act) × tierFactor × dataMix
base(act) = [20, 45, 90, 160, 280, 460, 720][act]
```

| Act | 1ノード平均コスト | その章の総DATA要求 | 想定到達時間 |
|---|---|---|---|
| 0 | 20 | 70 | 0.6 h |
| 1 | 45 | 520 | 4.5 h |
| 2 | 90 | 1,450 | 7.0 h |
| 3 | 160 | 2,900 | 9.0 h |
| 4 | 280 | 5,400 | 11.0 h |
| 5 | 460 | 9,800 | 13.0 h |
| 6 | 720 | 17,200 | 15.0 h+ |

**DATAレートの想定成長**（全種合計／ゲーム分）：

| Act | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| 目標 DATA/min | 0.3 | 1.6 | 4.2 | 9.5 | 19 | 38 | 72 |

---

## 6. コース定義（JSON 例）

```jsonc
{
  "id": "tsukuba_tc2000",
  "name": { "ja": "筑波サーキット コース2000", "en": "Tsukuba Circuit Course 2000" },
  "kind": "circuit",
  "totalLengthM": 2045,
  "sectors": [
    { "id": "S1", "from": 0, "to": 5 },
    { "id": "S2", "from": 6, "to": 12 },
    { "id": "S3", "from": 13, "to": 15 }
  ],
  "segments": [
    { "id": "home_straight", "kind": "straight", "lengthM": 282, "radiusM": null,
      "gradePct": 0.3, "bankDeg": 0, "surfaceMu": 1.00, "kerbUsable": false },
    { "id": "t1_brake", "kind": "braking", "lengthM": 50, "radiusM": null,
      "gradePct": 1.2, "bankDeg": 0, "surfaceMu": 1.00, "kerbUsable": false },
    { "id": "turn1", "kind": "corner", "lengthM": 181, "radiusM": 65,
      "gradePct": -0.4, "bankDeg": 1, "surfaceMu": 1.00, "kerbUsable": true },
    { "id": "t1_exit", "kind": "straight", "lengthM": 60, "radiusM": null,
      "gradePct": -0.5, "bankDeg": 0, "surfaceMu": 1.00, "kerbUsable": true },
    { "id": "esses", "kind": "complex", "lengthM": 160, "radiusM": 110,
      "gradePct": 0, "bankDeg": 0, "surfaceMu": 0.99, "kerbUsable": true },
    { "id": "chicane_to_hp1", "kind": "braking", "lengthM": 55, "radiusM": null,
      "gradePct": 0, "bankDeg": 0, "surfaceMu": 0.99, "kerbUsable": true },
    { "id": "hairpin1", "kind": "corner", "lengthM": 70, "radiusM": 22,
      "gradePct": 0, "bankDeg": 4, "surfaceMu": 1.01, "kerbUsable": true },
    { "id": "hp1_exit", "kind": "straight", "lengthM": 110, "radiusM": null,
      "gradePct": 0.4, "bankDeg": 0, "surfaceMu": 1.00, "kerbUsable": true },
    { "id": "dunlop", "kind": "corner", "lengthM": 75, "radiusM": 45,
      "gradePct": 0, "bankDeg": 0, "surfaceMu": 1.00, "kerbUsable": true },
    { "id": "r80", "kind": "corner", "lengthM": 135, "radiusM": 80,
      "gradePct": -0.3, "bankDeg": 0, "surfaceMu": 1.00, "kerbUsable": true },
    { "id": "r70", "kind": "corner", "lengthM": 90, "radiusM": 70,
      "gradePct": 0, "bankDeg": 0, "surfaceMu": 1.00, "kerbUsable": true },
    { "id": "hp2_brake", "kind": "braking", "lengthM": 60, "radiusM": null,
      "gradePct": 0, "bankDeg": 0, "surfaceMu": 1.00, "kerbUsable": false },
    { "id": "hairpin2", "kind": "corner", "lengthM": 65, "radiusM": 25,
      "gradePct": 0, "bankDeg": 0, "surfaceMu": 1.00, "kerbUsable": true },
    { "id": "back_straight", "kind": "straight", "lengthM": 437, "radiusM": null,
      "gradePct": 0, "bankDeg": 0, "surfaceMu": 1.00, "kerbUsable": false },
    { "id": "final_a", "kind": "complex", "lengthM": 95, "radiusM": 60,
      "gradePct": 0, "bankDeg": 0, "surfaceMu": 1.00, "kerbUsable": true },
    { "id": "final_b", "kind": "complex", "lengthM": 120, "radiusM": 110,
      "gradePct": 0.2, "bankDeg": 0, "surfaceMu": 1.00, "kerbUsable": true }
  ]
}
```

> 区間長の合計は **2,045 m** で、公称全長（`totalLengthM`）と一致している。
> 読み込み時に合計と `totalLengthM` の差が 1% を超えたらアセット不正として弾く
> （`shared/midnight/lap-solver.test.ts` が同じ検査を回帰テストとして実行する）。
> **区間長を 1 本でも触ったら、必ず合計を取り直すこと。**
> 開発中、目分量で置いた初版が合計 2,309 m（+12.9%）になっており、
> 全Actのラップが約 1 秒遅く出ていた——という事故を実際に起こしている。
> C1 側（`c1_outer` 等）は `kind: "highway"` とし、`speedLimitKph` と `lighting` を各区間に持たせる（`04` §2.1）。

---

## 7. 進行曲線（章ゲートの数値根拠）

基準車両 `tachibana_silka`（FRターボ）での想定。
**以下の数値はすべて参照実装 `shared/midnight/lap-solver.ts` ＋ `shared/midnight/tsukuba.ts` で検証済み**
（標準条件：ρ=1.225 kg/m³、乾燥路面、燃料 25 kg、前面投影面積 1.85 m²、タイヤ半径 0.312 m、6速）。

| Act | ゲート | 出力 PS | 車重 kg | タイヤ μ0 | DF @150km/h | Cd | シフト | 理論ラップ | **推定ベスト** | 余裕 |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 1:12.000 | 165（NA） | 1,180 | 1.12 ラジアル | 0 kgf | 0.34 | 0.25 s | 1:11.122 | **1:11.495** | 0.51 s |
| 1 | 1:06.000 | 220 | 1,115 | 1.30 ハイグリップ | 0 kgf | 0.34 | 0.25 s | 1:04.807 | **1:05.261** | 0.74 s |
| 2 | 1:02.000 | 380 | 1,055 | 1.33 ハイグリップ | 110 kgf | 0.37 | 0.25 s | 1:00.549 | **1:01.185** | 0.82 s |
| 3 | 0:58.000 | 430 | 1,030 | 1.45 Sタイヤ | 201 kgf | 0.40 | 0.25 s | 0:56.855 | **0:57.412** | 0.59 s |
| 4 | 0:55.000 | 510 | 970 | 1.45 Sタイヤ | 401 kgf | 0.43 | 0.25 s | 0:53.958 | **0:54.411** | 0.59 s |
| 5 | 0:52.000 | 585 | 900 | 1.48 Sタイヤ+ | 481 kgf | 0.45 | 0.08 s | 0:51.193 | **0:51.587** | 0.41 s |
| 6 | 0:49.999 | 620 | 875 | 1.52 スリック | 522 kgf | 0.46 | 0.08 s | 0:49.486 | **0:49.833** | 0.17 s |

「推定ベスト」＝理論ラップ × (1 + 0.035 ×(1 − driveability))。実走でプレイヤーが到達しうる水準。
「余裕」＝ゲート − 推定ベスト。**各Actの標準的な車両が、そのActのゲートを 0.2〜0.8 秒だけ下回る**
ように調整してある。詰めが甘ければ落ちる、詰めれば必ず通る——という緊張を全Actで一定に保つための値。

> **現実との整合**：Act6 の理論ラップ 0:49.486 は、実在の TC2000 における
> 非フォーミュラ最速クラス（49秒4台）とほぼ同じ水準に収まる。
> 本作の最終到達点を「現実の最速クラスに並ぶ」ところに置き、**48秒台は出せない**。
> 到達不能な数字を置かないことが、シミュレーションを名乗る作品の最低限の誠実さである。

### 7.1 感度表（ソルバ検証値・Act4 基準）

| 変更 | ラップへの影響 |
|---|---|
| 出力 +10 PS | **−0.050 s** |
| 車重 −10 kg | **−0.056 s** |
| 燃料 −10 kg | **−0.057 s** |
| ダウンフォース +50 kgf @150km/h（Cd +0.022 込み） | **−0.518 s** |
| タイヤ μ0 +0.05 | **−0.909 s** |
| シフト時間 −0.1 s | **−0.166 s**（ラップあたり 10 回のアップシフト） |
| Cd +0.02（空力付加物） | **+0.008 s** |
| 気温 2℃（ρ=1.29・路面 +2%） | **−0.75 s** |
| 気温 32℃（ρ=1.17・路面 −2%） | **+0.72 s** |
| 雨（路面グリップ 0.72） | **+10.5 s** |

**読み取り**：タイヤ（μ0 +0.05 ＝ −0.91 s）とダウンフォース（+50 kgf ＝ −0.52 s）が支配的で、
パワー（+10 PS ＝ −0.05 s）と軽量化（−10 kg ＝ −0.06 s）の寄与は**一桁小さい**。
Cd の悪化がほぼ無害（+0.02 で +0.008 s）なのは、TC2000 が低速・中速主体で
空気抵抗より揚力係数のほうが効く低速サーキットだからである。
これは実車のタイムアタックと同じ構造であり、**「パワーを上げるだけでは縮まない」**という
本作の主題（`01` §1.2 P1）を数値面から支えている。

### 7.2 区間別の限界要因（Act4 スペック・ソルバ出力）

| 区間 | 支配的な限界 | 区間最低速度 |
|---|---|---|
| ホームストレート | パワー | 171 km/h |
| 第1コーナー進入 | ブレーキ | 132 km/h |
| 第1コーナー | トラクション | 128 km/h |
| S字 | トラクション | 157 km/h |
| シケイン→1ヘア進入 | ブレーキ | 77 km/h |
| 第1ヘアピン | **トラクション** | 69 km/h |
| ダンロップ | トラクション | 103 km/h |
| 80R | トラクション | 103 km/h |
| 70R | トラクション | 134 km/h |
| 第2ヘアピン進入 | ブレーキ | 79 km/h |
| 第2ヘアピン | **トラクション** | 74 km/h |
| バックストレート | パワー | — |
| 最終コーナー | トラクション | 121 km/h |

S2（1ヘア〜2ヘア）がトラクション支配である、という結果は
「LSD・足まわり・タイヤを作れ」という設計上のメッセージと一致している。
この表は **ゲーム内のラップ解析画面にそのまま表示される**（`03` §9.3）。

> 感度表は**バランス調整の基準**であり、`tools/balance-check.ts` が
> `shared/midnight/lap-solver.ts` を呼んで自動で再計算し、±15% を超える逸脱を CI で検出する。

---

## 8. 経済パラメータ

| 項目 | 値 |
|---|---|
| 初期資金 | ¥1,800,000 |
| 電力基本料金 | ¥1,650 / kW / 月 |
| 従量料金 | 昼 ¥22 / kWh、夜(22–08) ¥12 / kWh |
| Lot賃料 | L0 ¥150k/月、以降 ¥180k〜¥2.8M/月 |
| 工員給与 | ¥280k / 人 / 月 |
| 産廃処理 | ¥28 / kg |
| 素材相場変動 | ±18%、週次更新（AR(1) モデル、`φ = 0.6`） |
| 部品外販価格 | 原価 × (C:1.1 / B:1.4 / A:2.0 / S:3.2 / BP:—※非売) |
| 外注加工 | 原価 × 3.2、等級は最大 B |
| 走行会エントリー | ¥18k（スポーツ走行）／¥45k（公式）／¥60k（耐久） |
| タイヤ | ラジアル ¥68k／ハイグリップ ¥110k／Sタイヤ ¥180k／スリック ¥240k（4本） |
| 燃料 | ハイオク ¥175/L、レース燃料 ¥820/L、E85 ¥140/L |
| 罰金（速度超過） | ¥25k–¥80k |
| 修理（壁接触） | ¥50k–¥600k |

### 8.1 資金曲線の目標

| Act | 月間収入 | 月間支出 | 想定残高 |
|---|---|---|---|
| 0 | ¥0.4M | ¥0.3M | ¥1–2M |
| 1 | ¥2.1M | ¥1.6M | ¥3–6M |
| 2 | ¥6.8M | ¥5.4M | ¥8–15M |
| 3 | ¥18M | ¥15M | ¥20–40M |
| 4 | ¥42M | ¥36M | ¥50–90M |
| 5 | ¥88M | ¥79M | ¥110–200M |
| 6 | ¥160M | ¥148M | ¥250M+ |

**原則**：常に「使い切れば足りない、節約すれば余る」水準。破産は発生させない（支払遅延＝信用低下のみ）。

---

## 9. 確率・乱数パラメータ

| 事象 | 分布／確率 |
|---|---|
| 等級判定 | `N(μ_drift, σ_proc)` を閾値で区切る（`02` §9.2） |
| BP選別の成功 | `erf(threshold/(σ√2))^n`、n = 必要点数 |
| 副産物（切粉） | 80% |
| 工具破損 | `wear > 0.9` で 1クラフトあたり 1.5% |
| 部品故障 | `1 − exp(−∫hazard dt)`（`03` §12） |
| 天候 | マルコフ連鎖（晴68% / 曇20% / 雨10% / 豪雨2%、遷移行列は季節依存） |
| 覆面パトカー遭遇 | ヒート40以上で `p = 0.004 × (heat−40) / 分` |
| 検問 | ヒート80以上で `p = 0.02 / 分`、出口を1つ封鎖 |
| ライバル出現 | 時刻・天候・路線ごとの重み付き抽選（1分あたり最大1体） |
| 赤旗（走行会） | セッションあたり 12% |
| 希少部品の露天出現 | 夜1回あたり 7%（REPで +最大15%） |
| オークションのレアリティ | 並 70% / 希少 25% / **幻 5%**（ピティで最大15%、`§11.3`） |
| ヤードの瑕疵 | クラック `18%×(1−状態)` / 固着 `30%×(1−状態)` / 欠品 `12%` / 贋作 `3%` |
| オークションの贋作 | `0.5% + 14%×(5−★)/4`（★5で0.5%、★1で14.5%） |
| コネクションの提示 | 枠ごとに 55%（枠数 = min(3, floor(REP/30))、ヒート70以上で 0） |
| ベース車の修復歴（オークション） | 28%（ワンオーナーは 17%） |

---

## 10. バランス調整の手順

1. **感度表（§7）を先に固定**する。ここが動くと全部が動く。
2. 章ゲートのタイム（`05` §4）から逆算して、各Actの `出力／重量／μ／ダウンフォース` の目標を置く。
3. その目標に到達するための**研究コスト**（§5）と**DATAレート**（§5 末尾）を決める。
4. DATAレートから逆算して、**必要なライン規模と機械台数**を決める（＝工場の難度）。
5. 最後に**経済**（§8）と**市場**（§11）を、上記の設備投資がギリギリ賄える水準に置く。
   市場側で最初に動かすのは「価格」ではなく**等級上限と納期**であること（価格を下げると工場が死ぬ）。
6. `tools/balance-check.ts` で全章を自動シミュレーションし、逸脱 ±15% 以内に収める。

> **調整してよい順**：経済 → 研究コスト → DATAレート → 感度表。
> 感度表を触るのは最後の手段（物理モデルの信頼性を損なうため）。

---

## 11. 市場パラメータ（`10` の単一の正）

### 11.1 共通

| 項目 | 値 |
|---|---|
| 在庫の更新 | 毎週月曜 06:00（ゲーム内）。シードは `hash32(saveSeed, 市場ID, 週番号)` |
| 相場指数 | 振幅 ±18%、周期 **8週**（コサイン補間）、週あたり変動 ≤ 0.08、範囲 0.82–1.18 |
| スロット別ブーム | ±8%（3週ごとに更新）。合成後のレンジ 0.70–1.30 |
| 鑑定レベル | 0：±0.25（¥0）／1：±0.10（¥8,000）／2：**±0.03（自社計測ライン・無料）** |
| 等級上限 | カタログ B（受注生産 A）／ヤード A／オークション S（幻のみ）／**BP はコネクションのみ** |

### 11.2 カタログ

| 項目 | 値 |
|---|---|
| 在庫 | 解放済み全品・無限 |
| 価格 | 定価 × スロット指数 |
| 納期 | 1日（¥400,000未満）／3日（以上）、速達 +40% で即日 |
| 受注生産（Act2〜） | 価格 ×2.6、納期7日、**A級保証** |
| 流通開始 | 自製解放の **1章前**（買えるが等級が足りない、という状態を作る） |

### 11.3 ヤード

| 項目 | 値 |
|---|---|
| ロット数 | 週 **8〜16** |
| 状態分布 | 平均 0.45・σ 0.22（範囲 0.05–0.95） |
| 価格 | 定価 × (0.08 + 0.30 × 見かけの状態) × 指数 ＝ 定価の 8〜38% |
| 見かけの状態 | 真の状態 ± 0.15（価格は**弱いシグナル**にしかならない） |
| **床（確定枠）** | 毎週かならず1ロットは状態 ≥ 0.60・重瑕疵なし |
| 解体収率 | 素材 = 質量 × (0.55 + 0.40 × 状態)、D2 = 2 + 8×状態、D3 = 1 + 4×状態（定価¥200k以上） |

### 11.4 深夜オークション

| 項目 | 値 |
|---|---|
| 出品数 | 週 **10 + 2×Act**（10〜22）、締切は D1〜D7 に分散 |
| レアリティ | 並 70% / 希少 25% / 幻 5% |
| 価格倍率 | 並 ×1.0 / 希少 ×2.2 / **幻 ×6.5** |
| 想定落札額 | 定価 × 倍率 × (0.35 + 0.55×状態) × 指数 × (0.90 + 0.03×★) |
| 開始価格 | 想定額 × 0.35 |
| 競合 | 1〜4人、各指値 = 想定額 × U(0.60, 1.10)。最大値が壁 |
| 落札額 | **二位価格**：max(開始価格, 壁 × 1.01) |
| 幻級の対象 | 定価 ¥150,000 以上の部品のみ |
| **ピティ（天井）** | 幻級の出現率 = `min(15%, 5% + 1% × 連続週)` |

### 11.5 コネクション

| 項目 | 値 |
|---|---|
| 枠数 | `min(3, floor(REP / 30))`、各枠 55% で出現 |
| 閉鎖条件 | **ヒート ≥ 70** の週はゼロ |
| 品目 | ワンオフ部品（S/BP）50% / 設計図（A級・レシピ解放）35% / 一点物の車体 15% |
| 対価 | 金銭 45% / データ 25% / 指定ライバルに勝つ 20% / 車を2〜6日貸す 10% |
| 有効期限 | 3〜7日 |

### 11.6 ベース車

| 市場 | 台数/週 | 走行距離 | フレーム歪み | 腐食 | 価格（新車比） |
|---|---|---|---|---|---|
| カタログ | 最大3（重複なし） | 5–40千 km | **0 mm** | <0.05 | ×0.75–0.95 |
| ヤード | 2–4 | 90–240千 km | 55%の確率で 0–8 mm | 0.25–0.90 | **×0.03–0.12** |
| オークション | 2–5 | 20–180千 km | 修復歴あり 0–6 mm／なし 0–1 mm | 0–0.45 | ×0.12–0.55（ワンオーナー ×1.35） |

```
剛性係数    = 1 − 0.045 × 歪みmm − 0.08 × 腐食        （歪み > 6 mm は矯正不能）
矯正費用    = ¥45,000 × 歪み^1.4 + 腐食 × ¥180,000     日数 = ceil(1.5×歪み + 6×腐食)
実効グリップ = μ0 × (0.90 + 0.10 × 剛性係数)
```

> これらの値は `shared/midnight/market.ts` に実装され、`market.test.ts`（34件）が
> 分布・床・天井・価格の序列・等級上限を機械検証している。**表を変えたらテストが落ちる。**

---
