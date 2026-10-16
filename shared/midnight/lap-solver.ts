/**
 * 準定常（Quasi-Steady-State）ラップソルバ — 参照実装
 * 設計書: docs/midnight-automation/03_vehicle_engineering_and_physics.md §9
 *
 * コースを一定間隔のノードへ離散化し、
 *   1) 旋回限界速度（ダウンフォース依存のため不動点反復）
 *   2) 前進パス（駆動力・トラクション・空気抵抗・勾配）
 *   3) 後退パス（制動限界）
 * の min を取って速度プロファイルを作り、時間を積分する。
 *
 * 依存なしの純関数。ブラウザ / Worker / Node / テストのいずれでも同じ結果を返す。
 */
import type { TrackDef, VehicleSpec } from "./types";

const G = 9.80665;

/** 離散化の刻み [m] */
const STEP_M = 2;
/** 前進・後退パスの反復回数（周回コースの収束用） */
const CONVERGENCE_PASSES = 3;
/** 走行ラインによる実効半径の拡大。縁石を使える区間はより大きく取れる */
const LINE_RADIUS_GAIN = 1.03;
const LINE_RADIUS_GAIN_KERB = 1.10;
/** 回転慣性の等価質量化に使う諸元 */
const WHEEL_INERTIA_KGM2 = 1.2;
const ENGINE_INERTIA_KGM2 = 0.16;
/** 転がり抵抗係数 */
const ROLLING_RESISTANCE = 0.013;
/** ダウンシフトのヒステリシス（レブリミットに対する比） */
const GEAR_DOWNSHIFT_HYSTERESIS = 0.94;

export interface SolverConditions {
  /** 空気密度 [kg/m^3]（15℃・1013hPa で約 1.225） */
  airDensity: number;
  /** 路面グリップ倍率（乾 1.0 / 湿 0.75 / 濡れ 0.62） */
  surfaceGrip: number;
  /** 搭載燃料の質量 [kg] */
  fuelMassKg: number;
}

export const STANDARD_CONDITIONS: SolverConditions = {
  airDensity: 1.225,
  surfaceGrip: 1.0,
  fuelMassKg: 25,
};

export type LimitKind =
  | "lateral"
  | "power"
  | "traction"
  | "braking"
  | "topSpeed";

export interface LapResult {
  /** 理論ラップ（完璧なライン・完璧な操作） */
  idealLapTimeS: number;
  /** ドライバビリティとドライバー技量を加味した推定ラップ */
  estimatedLapTimeS: number;
  sectorTimesS: Array<{ id: string; timeS: number }>;
  vMaxKph: number;
  vMinKph: number;
  upshiftCount: number;
  /** 区間ごとの支配的な限界要因（次に何を直すべきかの提示に使う） */
  segmentLimits: Array<{ id: string; limit: LimitKind; minKph: number }>;
}

interface Node {
  segIndex: number;
  /** 実効旋回半径 [m]。直線は Infinity */
  radiusM: number;
  gradeRad: number;
  bankRad: number;
  surfaceMu: number;
}

function interpolateTorque(spec: VehicleSpec, rpm: number): number {
  const c = spec.torqueCurve;
  if (c.length === 0) return 0;
  const firstPoint = c[0]!;
  const lastPoint = c[c.length - 1]!;
  if (rpm <= firstPoint.rpm) return firstPoint.nm;
  if (rpm >= lastPoint.rpm) return lastPoint.nm;
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1]!;
    const b = c[i]!;
    if (rpm <= b.rpm) {
      const t = (rpm - a.rpm) / (b.rpm - a.rpm);
      return a.nm + (b.nm - a.nm) * t;
    }
  }
  return lastPoint.nm;
}

function totalMass(spec: VehicleSpec, cond: SolverConditions): number {
  return spec.massKg + cond.fuelMassKg;
}

/** 速度 v におけるタイヤの総グリップ [N]（空力荷重と荷重感度を含む） */
function gripN(
  v: number,
  node: Node,
  spec: VehicleSpec,
  cond: SolverConditions,
): number {
  const m = totalMass(spec, cond);
  const fzStatic = m * G;
  const fzAero =
    0.5 *
    cond.airDensity *
    (spec.clFront + spec.clRear) *
    spec.frontalAreaM2 *
    v *
    v;
  const fz = fzStatic + fzAero;
  const mu =
    spec.tire.mu0 *
    Math.pow(fz / fzStatic, -spec.tire.loadSensitivity) *
    node.surfaceMu *
    cond.surfaceGrip *
    (1 - 0.35 * Math.pow(spec.tire.wear, 1.8));
  return mu * fz;
}

function dragN(v: number, spec: VehicleSpec, cond: SolverConditions): number {
  return 0.5 * cond.airDensity * spec.cd * spec.frontalAreaM2 * v * v;
}

interface Tractive {
  forceN: number;
  gearIndex: number;
  effectiveMassKg: number;
}

/**
 * 速度 v で使用するギアを選ぶ。
 * 「レブリミットを超えない最も低いギア」= 実質的に最大駆動力のギアであり、
 * かつ v に対して単調増加なので、シフトのハンチング（往復）が起きない。
 */
function selectGear(v: number, spec: VehicleSpec): number {
  const r = spec.tire.radiusM;
  const last = spec.gearRatios.length - 1;
  for (let i = 0; i < spec.gearRatios.length; i++) {
    const ratio = spec.gearRatios[i]! * spec.finalDrive;
    const rpm = (v / (2 * Math.PI * r)) * 60 * ratio;
    if (rpm <= spec.rpmLimit) return i;
  }
  return last;
}

function rpmAt(v: number, gearIndex: number, spec: VehicleSpec): number {
  const ratio = spec.gearRatios[gearIndex]! * spec.finalDrive;
  return (v / (2 * Math.PI * spec.tire.radiusM)) * 60 * ratio;
}

/** 選択ギアでの駆動力と、回転慣性を含む等価質量 */
function tractiveForce(
  v: number,
  spec: VehicleSpec,
  cond: SolverConditions,
  forcedGear?: number,
): Tractive {
  const r = spec.tire.radiusM;
  const m = totalMass(spec, cond);
  const gearIndex = forcedGear ?? selectGear(v, spec);
  const ratio = spec.gearRatios[gearIndex]! * spec.finalDrive;
  const rpm = (v / (2 * Math.PI * r)) * 60 * ratio;
  const inertia =
    (4 * WHEEL_INERTIA_KGM2) / (r * r) +
    (ENGINE_INERTIA_KGM2 * ratio * ratio) / (r * r);
  // トップギアでもレブリミットを超える＝リミッター作動で駆動力ゼロ
  const torque =
    rpm > spec.rpmLimit
      ? 0
      : interpolateTorque(spec, Math.max(rpm, spec.rpmIdle));
  return {
    forceN: (torque * ratio * spec.drivetrainEff) / r,
    gearIndex,
    effectiveMassKg: m + inertia,
  };
}

/** 駆動輪が使えるグリップの割合（荷重移動を 1 回だけ近似で考慮） */
function driveGripShare(spec: VehicleSpec, accelG: number): number {
  if (spec.layout === "AWD") return 1.0;
  const rearStatic = 1 - spec.weightDistFront;
  const transfer = (accelG * spec.cgHeightM) / spec.wheelbaseM;
  if (spec.layout === "FF") {
    return Math.max(0.15, Math.min(0.95, spec.weightDistFront - transfer));
  }
  // FR / MR
  return Math.max(0.15, Math.min(0.95, rearStatic + transfer));
}

function buildNodes(track: TrackDef): { nodes: Node[]; stepM: number } {
  const rawLength = track.segments.reduce((sum, s) => sum + s.lengthM, 0);
  // 設計データの合計と公称全長のズレを比例配分で吸収する
  const scale = track.totalLengthM / rawLength;
  const nodes: Node[] = [];
  track.segments.forEach((seg, segIndex) => {
    const length = seg.lengthM * scale;
    const count = Math.max(1, Math.round(length / STEP_M));
    const gain = seg.kerbUsable ? LINE_RADIUS_GAIN_KERB : LINE_RADIUS_GAIN;
    const radiusM = seg.radiusM === null ? Infinity : seg.radiusM * gain;
    for (let i = 0; i < count; i++) {
      nodes.push({
        segIndex,
        radiusM,
        gradeRad: Math.atan(seg.gradePct / 100),
        bankRad: (seg.bankDeg * Math.PI) / 180,
        surfaceMu: seg.surfaceMu,
      });
    }
  });
  return { nodes, stepM: track.totalLengthM / nodes.length };
}

/** 旋回限界速度（ダウンフォースが v に依存するため不動点反復） */
function lateralLimit(
  node: Node,
  spec: VehicleSpec,
  cond: SolverConditions,
  topSpeed: number,
): number {
  if (!isFinite(node.radiusM)) return topSpeed;
  const m = totalMass(spec, cond);
  let v = 30;
  for (let i = 0; i < 8; i++) {
    const lateralAvailable =
      gripN(v, node, spec, cond) + m * G * Math.sin(node.bankRad);
    const next = Math.sqrt(Math.max(1, (lateralAvailable * node.radiusM) / m));
    v = v + (next - v) * 0.7;
  }
  return Math.min(v, topSpeed);
}

function topSpeedOf(spec: VehicleSpec): number {
  const topGear = spec.gearRatios[spec.gearRatios.length - 1]!;
  const ratio = topGear * spec.finalDrive;
  return (spec.rpmLimit * 2 * Math.PI * spec.tire.radiusM) / (60 * ratio);
}

export function solveLap(
  track: TrackDef,
  spec: VehicleSpec,
  cond: SolverConditions = STANDARD_CONDITIONS,
): LapResult {
  const { nodes, stepM } = buildNodes(track);
  const n = nodes.length;
  const m = totalMass(spec, cond);
  const topSpeed = topSpeedOf(spec);

  const vLat = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    vLat[i] = lateralLimit(nodes[i]!, spec, cond, topSpeed);
  }

  const v = Float64Array.from(vLat);
  const limit: LimitKind[] = new Array(n).fill("lateral");
  const gearAt = new Int8Array(n);

  for (let pass = 0; pass < CONVERGENCE_PASSES; pass++) {
    // ── 前進パス（加速側） ─────────────────────────────
    // 変速中は駆動力が切れる。時間を足すのではなく「駆動なしで惰行する距離」として扱う。
    let shiftRemainingM = 0;
    let gear = selectGear(v[0]!, spec);
    const topGear = spec.gearRatios.length - 1;
    for (let k = 0; k < n; k++) {
      const i = k;
      const j = (k + 1) % n;
      const node = nodes[i]!;
      const vi = v[i]!;

      // ギア選択はヒステリシス付きの状態機械（境界での往復を防ぐ）
      if (gear < topGear && rpmAt(vi, gear, spec) > spec.rpmLimit) {
        gear += 1;
        shiftRemainingM += vi * spec.shiftTimeS;
      } else if (
        gear > 0 &&
        rpmAt(vi, gear - 1, spec) < spec.rpmLimit * GEAR_DOWNSHIFT_HYSTERESIS
      ) {
        gear -= 1; // 制動後の立ち上がり。ダウンシフトは減速中に済むものとして損失を計上しない
      }
      gearAt[i] = gear;

      const lateralUse = isFinite(node.radiusM) ? (m * vi * vi) / node.radiusM : 0;
      const grip = gripN(vi, node, spec, cond);
      const ellipse = Math.sqrt(
        Math.max(0, 1 - Math.pow(Math.min(1, lateralUse / grip), 2)),
      );
      const t = tractiveForce(vi, spec, cond, gear);

      // トラクション限界（荷重移動を 2 回だけ反復して近似）
      let accelG = 0.4;
      let tractionLimitN = 0;
      for (let it = 0; it < 2; it++) {
        tractionLimitN = grip * driveGripShare(spec, accelG) * ellipse;
        accelG = Math.min(2.0, tractionLimitN / (m * G));
      }

      const shifting = shiftRemainingM > 0;
      if (shifting) shiftRemainingM -= stepM;

      const driveN = shifting ? 0 : Math.min(t.forceN, tractionLimitN);
      const resistN =
        dragN(vi, spec, cond) +
        ROLLING_RESISTANCE * m * G +
        m * G * Math.sin(node.gradeRad);
      const a = (driveN - resistN) / t.effectiveMassKg;
      const vNext = Math.sqrt(Math.max(1, vi * vi + 2 * a * stepM));
      if (vNext < v[j]!) {
        v[j] = vNext;
        limit[j] =
          t.forceN <= tractionLimitN
            ? vi >= topSpeed - 0.5
              ? "topSpeed"
              : "power"
            : "traction";
      }
    }

    // ── 後退パス（制動側） ─────────────────────────────
    for (let k = n - 1; k >= 0; k--) {
      const i = k;
      const j = (k + 1) % n;
      const node = nodes[i]!;
      const vj = v[j]!;
      const lateralUse = isFinite(node.radiusM) ? (m * vj * vj) / node.radiusM : 0;
      const grip = gripN(vj, node, spec, cond);
      const ellipse = Math.sqrt(
        Math.max(0, 1 - Math.pow(Math.min(1, lateralUse / grip), 2)),
      );
      const brakeLimitN = Math.min(
        grip * ellipse,
        spec.brake.maxTorqueNm / spec.tire.radiusM,
      );
      const decelN =
        brakeLimitN +
        dragN(vj, spec, cond) +
        ROLLING_RESISTANCE * m * G -
        m * G * Math.sin(node.gradeRad);
      const vPrev = Math.sqrt(Math.max(1, vj * vj + (2 * decelN * stepM) / m));
      if (vPrev < v[i]!) {
        v[i] = vPrev;
        limit[i] = "braking";
      }
    }
  }

  // ── 時間積分とギアの集計 ───────────────────────────────
  const sectorTime = new Map<string, number>();
  const segMinSpeed = new Map<number, number>();
  const segLimitCount = new Map<number, Map<LimitKind, number>>();
  let lapTime = 0;
  let upshiftCount = 0;
  let previousGear = gearAt[n - 1]!;
  let vMax = 0;
  let vMin = Infinity;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const vi = v[i]!;
    const vj = v[j]!;
    const dt = (2 * stepM) / (vi + vj);
    lapTime += dt;

    // 変速の損失は前進パスで速度に反映済み。ここでは回数の集計だけ行う。
    const gear = gearAt[i]!;
    if (gear > previousGear) upshiftCount += gear - previousGear;
    previousGear = gear;

    const node = nodes[i]!;
    const seg = track.segments[node.segIndex]!;
    const sector = track.sectors.find(
      (s) => node.segIndex >= s.from && node.segIndex <= s.to,
    );
    if (sector) sectorTime.set(sector.id, (sectorTime.get(sector.id) ?? 0) + dt);

    const currentMin = segMinSpeed.get(node.segIndex);
    if (currentMin === undefined || vi < currentMin) {
      segMinSpeed.set(node.segIndex, vi);
    }
    let counts = segLimitCount.get(node.segIndex);
    if (!counts) {
      counts = new Map<LimitKind, number>();
      segLimitCount.set(node.segIndex, counts);
    }
    const lim = limit[i]!;
    counts.set(lim, (counts.get(lim) ?? 0) + 1);

    if (vi > vMax) vMax = vi;
    if (vi < vMin) vMin = vi;
    void seg;
  }

  const segmentLimits = track.segments.map((seg, index) => {
    const counts = segLimitCount.get(index);
    let limitKind: LimitKind = "lateral";
    let best = -1;
    if (counts) {
      for (const [kind, count] of counts) {
        if (count > best) {
          best = count;
          limitKind = kind;
        }
      }
    }
    return {
      id: seg.id,
      limit: limitKind,
      minKph: (segMinSpeed.get(index) ?? 0) * 3.6,
    };
  });

  // ドライバビリティが低いほど、理論値との差が広がる（03 §11）
  const driveabilityPenalty = 0.035 * (1 - spec.driveability);

  return {
    idealLapTimeS: lapTime,
    estimatedLapTimeS: lapTime * (1 + driveabilityPenalty),
    sectorTimesS: track.sectors.map((s) => ({
      id: s.id,
      timeS: sectorTime.get(s.id) ?? 0,
    })),
    vMaxKph: vMax * 3.6,
    vMinKph: vMin * 3.6,
    upshiftCount,
    segmentLimits,
  };
}

/** 秒 → "1:02.345" 形式 */
export function formatLapTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  const text = rest.toFixed(3).padStart(6, "0");
  return `${minutes}:${text}`;
}
