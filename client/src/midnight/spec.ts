/**
 * 所有車＋装着パーツ → VehicleSpec の変換（③組む → ④筑波の橋渡し）。
 * 数式の正本は shared/midnight/lap-solver.ts（spec/S5）。
 * ここでは「部品がどの物理量に効くか」だけを定義する（03 §3.3 の等級係数の効き先）。
 */
import type { TorquePoint, VehicleSpec } from "@shared/midnight/types";
import { GRADE_QUALITY_FACTOR } from "@shared/midnight/types";
import { effectiveMu } from "@shared/midnight/market";
import {
  solveLap,
  type LapResult,
  type SolverConditions,
} from "@shared/midnight/lap-solver";
import { TSUKUBA_TC2000 } from "@shared/midnight/tsukuba";
import type { OwnedCar, OwnedPart, TireState } from "./state";
import { TIRE_CATALOG } from "./state";

/* ─────────────────────────── ベース諸元（03 §2） ─────────────────────────── */

interface ChassisBase {
  ps: number;
  rpmLimit: number;
  shape: "NA" | "TURBO";
  weightDistFront: number;
  wheelbaseM: number;
  cd: number;
  driveability: number;
}

export const CHASSIS_BASE: Record<string, ChassisBase> = {
  toyota_ae86: { ps: 130, rpmLimit: 7700, shape: "NA", weightDistFront: 0.54, wheelbaseM: 2.4, cd: 0.35, driveability: 0.78 },
  nissan_s15: { ps: 250, rpmLimit: 7500, shape: "TURBO", weightDistFront: 0.55, wheelbaseM: 2.525, cd: 0.32, driveability: 0.75 },
  mazda_fd3s: { ps: 280, rpmLimit: 8500, shape: "TURBO", weightDistFront: 0.5, wheelbaseM: 2.425, cd: 0.31, driveability: 0.72 },
  mitsubishi_cn9a: { ps: 280, rpmLimit: 7500, shape: "TURBO", weightDistFront: 0.59, wheelbaseM: 2.51, cd: 0.35, driveability: 0.76 },
  toyota_jza80: { ps: 280, rpmLimit: 7200, shape: "TURBO", weightDistFront: 0.53, wheelbaseM: 2.55, cd: 0.33, driveability: 0.73 },
  nissan_bnr32: { ps: 280, rpmLimit: 8000, shape: "TURBO", weightDistFront: 0.57, wheelbaseM: 2.615, cd: 0.34, driveability: 0.74 },
  honda_na1: { ps: 280, rpmLimit: 8000, shape: "NA", weightDistFront: 0.42, wheelbaseM: 2.53, cd: 0.32, driveability: 0.7 },
  nissan_s30z: { ps: 160, rpmLimit: 7000, shape: "NA", weightDistFront: 0.53, wheelbaseM: 2.305, cd: 0.42, driveability: 0.66 },
};

const FALLBACK_BASE: ChassisBase = {
  ps: 200, rpmLimit: 7500, shape: "TURBO", weightDistFront: 0.54, wheelbaseM: 2.52, cd: 0.34, driveability: 0.72,
};

/* ─────────────────────────── トルク曲線（lap-solver.test.ts の Fixture と同じ作法） ─────────────────────────── */

type Shape = Array<[number, number]>;

const NA_SHAPE: Shape = [
  [1000, 0.55], [2000, 0.72], [3000, 0.85], [4000, 0.93],
  [5000, 1.0], [6000, 0.98], [7000, 0.92], [8000, 0.84], [9000, 0.76],
];

const TURBO_SHAPE: Shape = [
  [1000, 0.25], [2000, 0.48], [3000, 0.86], [3500, 1.0],
  [4500, 1.0], [5500, 0.98], [6500, 0.92], [7500, 0.82], [8500, 0.72], [9000, 0.66],
];

export function torqueCurveFor(shape: "NA" | "TURBO", ps: number, rpmLimit: number): TorquePoint[] {
  const src = shape === "NA" ? NA_SHAPE : TURBO_SHAPE;
  const points = src
    .filter(([rpm]) => rpm <= rpmLimit + 500)
    .map(([rpm, factor]) => ({ rpm, nm: factor }));
  let peakW = 0;
  for (const p of points) peakW = Math.max(peakW, p.nm * ((p.rpm * 2 * Math.PI) / 60));
  const k = (ps * 735.5) / Math.max(1, peakW);
  return points.map((p) => ({ rpm: p.rpm, nm: p.nm * k }));
}

export function peakPs(curve: TorquePoint[]): number {
  let peakW = 0;
  for (const p of curve) peakW = Math.max(peakW, p.nm * ((p.rpm * 2 * Math.PI) / 60));
  return peakW / 735.5;
}

/* ─────────────────────────── VehicleSpec 構築 ─────────────────────────── */

export interface BuiltSpec {
  spec: VehicleSpec;
  ps: number;
  massKg: number;
  stiffness: number;
  muEff: number;
  tireMu: number;
  downforceKgfAt150: number;
}

export interface SetupParams {
  finalDrive: number;
  wingAngleDeg: number;
}

const DRIVETRAIN_EFF: Record<string, number> = { FR: 0.88, FF: 0.9, MR: 0.9, AWD: 0.82 };

export function buildVehicleSpec(
  car: OwnedCar,
  equippedParts: readonly OwnedPart[],
  tire: TireState,
  setup: SetupParams,
): BuiltSpec {
  const base = CHASSIS_BASE[car.chassisId] ?? FALLBACK_BASE;
  const tireDef = TIRE_CATALOG.find((t) => t.id === tire.compoundId) ?? TIRE_CATALOG[0]!;

  let ps = base.ps * (0.82 + 0.18 * car.condition);
  let rpmLimit = base.rpmLimit;
  let shape = base.shape;
  let massKg = car.dryMassKg + car.addedMassKg + 65; // +ドライバー・油脂類
  let cd = base.cd;
  let cl = 0;
  let shiftTimeS = car.shift === "AT" ? 0.45 : 0.25;
  let brakeNm = 9_500;
  let driveability = base.driveability + car.driveabilityBonus - (car.shift === "AT" ? 0.03 : 0);
  let muBonus = 0;
  let stiffness = car.stiffnessFactor;

  for (const part of equippedParts) {
    if (part.broken || part.isFake) continue;
    const q = GRADE_QUALITY_FACTOR[part.grade];
    const cf = 0.7 + 0.3 * part.condition;
    const e = q * cf;
    switch (part.defId) {
      case "piston_forged": ps *= 1 + 0.03 * e; rpmLimit += 200; break;
      case "conrod_scm": ps *= 1.01; rpmLimit += 250; break;
      case "crank_billet": ps *= 1 + 0.02 * e; rpmLimit += 400; driveability += 0.01; break;
      case "block_closed": ps *= 1 + 0.04 * e; rpmLimit += 200; break;
      case "camshaft_hi": ps *= 1 + 0.07 * e; rpmLimit += 300; driveability -= 0.02; break;
      case "head_ported": ps *= 1 + 0.06 * e; break;
      case "turbo_assy": ps *= 1 + 0.38 * e; shape = "TURBO"; driveability -= 0.03; break;
      case "intercooler": ps *= 1 + 0.05 * e; cd += 0.006; massKg += 6; break;
      case "injector_hi": ps *= 1 + 0.03 * e; break;
      case "ecu_v2": ps *= 1 + 0.06 * e; driveability += 0.02; break;
      case "exhaust_manifold": ps *= 1 + 0.04 * e; break;
      case "clutch_twin": shiftTimeS -= 0.04; break;
      case "gearset_close": shiftTimeS = Math.min(shiftTimeS, 0.1 + (1 - cf) * 0.05); driveability += 0.01; break;
      case "lsd_mech": driveability += 0.05 * cf; muBonus += 0.01 * cf; break;
      case "coilover": driveability += 0.04 * cf; muBonus += 0.015 * cf; break;
      case "damper_3way": driveability += 0.06 * cf; muBonus += 0.02 * cf; break;
      case "spring_direct": driveability += 0.02 * cf; break;
      case "arm_pillow": muBonus += 0.02 * cf; driveability += 0.02 * cf; break;
      case "brake_pad_s": brakeNm += 1_500 * cf; break;
      case "rotor_big": brakeNm += 3_200 * cf; massKg += 6; break;
      case "wing_gt_l": {
        const angleScale = 0.7 + (setup.wingAngleDeg / 14) * 0.6;
        cl += 1.2 * e * angleScale;
        cd += 0.02 + setup.wingAngleDeg * 0.0016;
        break;
      }
      case "diffuser_rear": cl += 0.8 * e; cd += 0.005; break;
      case "panel_cfrp": massKg -= 45 * cf; break;
      case "cage_cr_mo": massKg += 28; stiffness += 0.08 * cf; driveability += 0.01; break;
      default: break;
    }
  }

  driveability = Math.max(0.3, Math.min(0.95, driveability));
  shiftTimeS = Math.max(0.05, shiftTimeS);
  const tireMu = tireDef.mu * (1 + muBonus);
  const muEff = effectiveMu(tireMu, stiffness);
  const frontalAreaM2 = 1.85;
  const downforceKgfAt150 =
    (0.5 * 1.225 * cl * frontalAreaM2 * (150 / 3.6) ** 2) / 9.80665;

  const spec: VehicleSpec = {
    chassis: car.chassisId,
    layout: car.layout,
    massKg,
    weightDistFront: base.weightDistFront,
    cgHeightM: 0.47,
    wheelbaseM: base.wheelbaseM,
    torqueCurve: torqueCurveFor(shape, ps, rpmLimit),
    rpmLimit,
    rpmIdle: 1200,
    gearRatios: [3.23, 2.11, 1.54, 1.21, 1.0, 0.84],
    finalDrive: setup.finalDrive,
    shiftTimeS,
    drivetrainEff: DRIVETRAIN_EFF[car.layout] ?? 0.88,
    lsd: { initialNm: 80, lockAccel: 0.5, lockDecel: 0.3 },
    cd,
    clFront: cl * 0.42,
    clRear: cl * 0.58,
    frontalAreaM2,
    tire: {
      mu0: muEff,
      loadSensitivity: 0.16,
      optimalTempC: 85,
      tempToleranceC: 15,
      wear: tire.wear,
      radiusM: 0.312,
    },
    brake: { maxTorqueNm: brakeNm, biasFront: 0.62, heatCapacityKj: 900, fadeStartC: 520 },
    suspension: {
      rideHeightMm: { front: 100, rear: 105 },
      springRateNmm: { front: 10, rear: 9 },
      damperClicks: { front: 16, rear: 16 },
      swaybar: { front: 3, rear: 2 },
      camberDeg: { front: -3, rear: -2 },
      toeDeg: { front: 0, rear: 0.1 },
    },
    cooling: { radiatorKw: 60, oilCoolerKw: 12, icEfficiency: 0.72 },
    reliability: {},
    driveability,
  };

  return { spec, ps, massKg, stiffness, muEff, tireMu, downforceKgfAt150 };
}

/* ─────────────────────────── 感度ビュー ─────────────────────────── */

export interface SensitivityRow {
  label: string;
  hint: string;
  gainS: number; // 正 = 速くなる量
}

/** 現在のスペックから1項目だけ動かして Δラップ を測る（spec/S6 §5 の背骨） */
export function computeSensitivities(
  built: BuiltSpec,
  cond: SolverConditions,
): { base: LapResult; rows: SensitivityRow[] } {
  const base = solveLap(TSUKUBA_TC2000, built.spec, cond);
  const baseT = base.estimatedLapTimeS;

  const test = (mutate: (s: VehicleSpec) => void, condOverride?: SolverConditions): number => {
    const clone = structuredClone(built.spec);
    mutate(clone);
    return baseT - solveLap(TSUKUBA_TC2000, clone, condOverride ?? cond).estimatedLapTimeS;
  };

  const psNow = peakPs(built.spec.torqueCurve);
  const stiffRatio =
    effectiveMu(1, built.stiffness + 0.15) / Math.max(0.0001, effectiveMu(1, built.stiffness));

  const rows: SensitivityRow[] = [
    {
      label: "タイヤ μ₀ +0.05", hint: "タイヤを1段上げる",
      gainS: test((s) => { s.tire.mu0 += 0.05; }),
    },
    {
      label: "ダウンフォース +50 kgf", hint: "ウィング/ディフューザー（Cd +0.022込み）",
      gainS: test((s) => { s.clFront += 0.25 * 0.42; s.clRear += 0.25 * 0.58; s.cd += 0.022; }),
    },
    {
      label: "車体剛性 +0.15", hint: "レストア補強・ケージ（μに効く）",
      gainS: test((s) => { s.tire.mu0 *= stiffRatio; }),
    },
    {
      label: "車重 −10 kg", hint: "カーボンパネル・軽量化",
      gainS: test((s) => { s.massKg -= 10; }),
    },
    {
      label: "シフトタイム −0.10 s", hint: "クロスミッション/クラッチ",
      gainS: test((s) => { s.shiftTimeS = Math.max(0.04, s.shiftTimeS - 0.1); }),
    },
    {
      label: "燃料 −10 kg", hint: "搭載量を絞る（セットアップ）",
      gainS: test(() => undefined, { ...cond, fuelMassKg: Math.max(5, cond.fuelMassKg - 10) }),
    },
    {
      label: "+100 PS", hint: "エンジン系パーツ全般",
      gainS: test((s) => {
        const f = (psNow + 100) / Math.max(1, psNow);
        s.torqueCurve = s.torqueCurve.map((p) => ({ rpm: p.rpm, nm: p.nm * f }));
      }),
    },
    {
      label: "ドライバビリティ +0.05", hint: "LSD・足回り・ECUで扱いやすく",
      gainS: test((s) => { s.driveability = Math.min(1, s.driveability + 0.05); }),
    },
  ];

  rows.sort((a, b) => b.gainS - a.gainS);
  return { base, rows };
}

export function lapOf(built: BuiltSpec, cond: SolverConditions): LapResult {
  return solveLap(TSUKUBA_TC2000, built.spec, cond);
}
