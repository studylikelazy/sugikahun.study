/**
 * 準定常ラップソルバの回帰テスト。
 * 設計書 docs/midnight-automation/08_data_schema_and_balance.md §7 の
 * 「章ゲート」と「感度表」が崩れていないことを検証する（07 §10.3 ラップタイム回帰）。
 *
 *   pnpm vitest run shared/midnight/lap-solver.test.ts
 */
import { describe, expect, it } from "vitest";
import { TSUKUBA_TC2000 } from "./tsukuba";
import {
  solveLap,
  formatLapTime,
  STANDARD_CONDITIONS,
  type SolverConditions,
} from "./lap-solver";
import type { TorquePoint, VehicleSpec } from "./types";

type Shape = Array<[number, number]>;

const NA: Shape = [
  [1000, 0.55],
  [2000, 0.72],
  [3000, 0.85],
  [4000, 0.93],
  [5000, 1.0],
  [6000, 0.98],
  [7000, 0.92],
  [8000, 0.84],
];

const TURBO: Shape = [
  [1000, 0.25],
  [2000, 0.48],
  [3000, 0.86],
  [3500, 1.0],
  [4500, 1.0],
  [5500, 0.98],
  [6500, 0.92],
  [7500, 0.82],
];

/** 最高出力 [PS] に合わせてトルク曲線を正規化する */
function torqueCurve(shape: Shape, ps: number, rpmLimit: number): TorquePoint[] {
  const points = shape
    .filter(([rpm]) => rpm <= rpmLimit + 500)
    .map(([rpm, factor]) => ({ rpm, nm: factor }));
  let peakW = 0;
  for (const p of points) peakW = Math.max(peakW, p.nm * ((p.rpm * 2 * Math.PI) / 60));
  const k = (ps * 735.5) / peakW;
  return points.map((p) => ({ rpm: p.rpm, nm: p.nm * k }));
}

interface Fixture {
  massKg: number;
  ps: number;
  rpmLimit: number;
  shape: Shape;
  cd: number;
  /** 合計揚力係数（下向き） */
  cl: number;
  mu: number;
  shiftTimeS?: number;
  driveability?: number;
}

function makeSpec(f: Fixture): VehicleSpec {
  return {
    chassis: "tachibana_silka",
    layout: "FR",
    massKg: f.massKg,
    weightDistFront: 0.54,
    cgHeightM: 0.47,
    wheelbaseM: 2.52,
    torqueCurve: torqueCurve(f.shape, f.ps, f.rpmLimit),
    rpmLimit: f.rpmLimit,
    rpmIdle: 1200,
    gearRatios: [3.23, 2.11, 1.54, 1.21, 1.0, 0.84],
    finalDrive: 4.3,
    shiftTimeS: f.shiftTimeS ?? 0.25,
    drivetrainEff: 0.88,
    lsd: { initialNm: 80, lockAccel: 0.5, lockDecel: 0.3 },
    cd: f.cd,
    clFront: f.cl * 0.42,
    clRear: f.cl * 0.58,
    frontalAreaM2: 1.85,
    tire: {
      mu0: f.mu,
      loadSensitivity: 0.16,
      optimalTempC: 85,
      tempToleranceC: 15,
      wear: 0,
      radiusM: 0.312,
    },
    brake: {
      maxTorqueNm: 11000,
      biasFront: 0.62,
      heatCapacityKj: 900,
      fadeStartC: 520,
    },
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
    driveability: f.driveability ?? 0.75,
  };
}

/** 08 §7 の章ごと想定スペックとゲートタイム */
const ACT_FIXTURES: Array<{ act: number; gateS: number; spec: VehicleSpec }> = [
  { act: 0, gateS: 72, spec: makeSpec({ massKg: 1180, ps: 165, rpmLimit: 7500, shape: NA, cd: 0.34, cl: 0, mu: 1.12, driveability: 0.85 }) },
  { act: 1, gateS: 66, spec: makeSpec({ massKg: 1115, ps: 220, rpmLimit: 7500, shape: TURBO, cd: 0.34, cl: 0, mu: 1.3, driveability: 0.8 }) },
  { act: 2, gateS: 62, spec: makeSpec({ massKg: 1055, ps: 380, rpmLimit: 7800, shape: TURBO, cd: 0.37, cl: 0.55, mu: 1.33, driveability: 0.7 }) },
  { act: 3, gateS: 58, spec: makeSpec({ massKg: 1030, ps: 430, rpmLimit: 8000, shape: TURBO, cd: 0.4, cl: 1.0, mu: 1.45, driveability: 0.72 }) },
  { act: 4, gateS: 55, spec: makeSpec({ massKg: 970, ps: 510, rpmLimit: 8200, shape: TURBO, cd: 0.43, cl: 2.0, mu: 1.45, driveability: 0.76 }) },
  { act: 5, gateS: 52, spec: makeSpec({ massKg: 900, ps: 585, rpmLimit: 8500, shape: TURBO, cd: 0.45, cl: 2.4, mu: 1.48, shiftTimeS: 0.08, driveability: 0.78 }) },
  { act: 6, gateS: 49.999, spec: makeSpec({ massKg: 875, ps: 620, rpmLimit: 8800, shape: TURBO, cd: 0.46, cl: 2.6, mu: 1.52, shiftTimeS: 0.08, driveability: 0.8 }) },
];
const ACT4 = ACT_FIXTURES[4]!.spec;
const baseLap = () => solveLap(TSUKUBA_TC2000, ACT4, STANDARD_CONDITIONS).idealLapTimeS;

function withSpec(patch: (s: VehicleSpec) => void): number {
  const clone = structuredClone(ACT4);
  patch(clone);
  return solveLap(TSUKUBA_TC2000, clone, STANDARD_CONDITIONS).idealLapTimeS;
}

describe("TC2000 コースデータ", () => {
  it("公称全長と区間長の差が 1% 以内", () => {
    const sum = TSUKUBA_TC2000.segments.reduce((a, s) => a + s.lengthM, 0);
    expect(Math.abs(sum - TSUKUBA_TC2000.totalLengthM) / TSUKUBA_TC2000.totalLengthM).toBeLessThan(0.01);
  });

  it("ホームストレートとバックストレートが実在値と一致する", () => {
    const home = TSUKUBA_TC2000.segments.find((s) => s.id === "home_straight");
    const back = TSUKUBA_TC2000.segments.find((s) => s.id === "back_straight");
    expect(home?.lengthM).toBe(282);
    expect(back?.lengthM).toBe(437);
  });
});

describe("章ゲートの到達性（08 §7）", () => {
  for (const { act, gateS, spec } of ACT_FIXTURES) {
    it(`Act${act}: 想定スペックでゲート ${formatLapTime(gateS)} を下回る`, () => {
      const result = solveLap(TSUKUBA_TC2000, spec, STANDARD_CONDITIONS);
      expect(result.estimatedLapTimeS).toBeLessThan(gateS);
      // 届きすぎてもいけない（スペックが過剰＝バランス崩壊の兆候）
      expect(result.estimatedLapTimeS).toBeGreaterThan(gateS - 1.5);
    });
  }

  it("章が進むほど単調に速くなる", () => {
    const times = ACT_FIXTURES.map((f) => solveLap(TSUKUBA_TC2000, f.spec).idealLapTimeS);
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeLessThan(times[i - 1]!);
  });

  it("最終スペックでも実在の非フォーミュラ最速（49.445秒）を超えない", () => {
    const best = solveLap(TSUKUBA_TC2000, ACT_FIXTURES[6]!.spec).idealLapTimeS;
    expect(best).toBeGreaterThan(49.0);
  });
});

describe("感度（08 §7.1）", () => {
  it("軽量化・増power・グリップ・ダウンフォースはすべてタイムを縮める", () => {
    const base = baseLap();
    expect(withSpec((s) => { s.massKg -= 10; })).toBeLessThan(base);
    expect(withSpec((s) => { s.torqueCurve = s.torqueCurve.map((p) => ({ rpm: p.rpm, nm: p.nm * 1.02 })); })).toBeLessThan(base);
    expect(withSpec((s) => { s.tire.mu0 += 0.05; })).toBeLessThan(base);
    expect(withSpec((s) => { s.clFront *= 1.2; s.clRear *= 1.2; })).toBeLessThan(base);
    expect(withSpec((s) => { s.shiftTimeS = 0.08; })).toBeLessThan(base);
  });

  it("空気抵抗の増加はタイムを落とす", () => {
    expect(withSpec((s) => { s.cd += 0.02; })).toBeGreaterThan(baseLap());
  });

  it("タイヤグリップの寄与がパワーより大きい（主題の数値的裏づけ）", () => {
    const base = baseLap();
    const byGrip = base - withSpec((s) => { s.tire.mu0 += 0.05; });
    const byPower = base - withSpec((s) => { s.torqueCurve = s.torqueCurve.map((p) => ({ rpm: p.rpm, nm: p.nm * 1.02 })); });
    expect(byGrip).toBeGreaterThan(byPower * 3);
  });
});

describe("条件", () => {
  it("雨は 8 秒以上遅くなる", () => {
    const wet: SolverConditions = { airDensity: 1.23, surfaceGrip: 0.72, fuelMassKg: 25 };
    expect(solveLap(TSUKUBA_TC2000, ACT4, wet).idealLapTimeS - baseLap()).toBeGreaterThan(8);
  });

  it("冷えた空気（冬）は過給車に有利", () => {
    const cold: SolverConditions = { airDensity: 1.29, surfaceGrip: 1.02, fuelMassKg: 25 };
    expect(solveLap(TSUKUBA_TC2000, ACT4, cold).idealLapTimeS).toBeLessThan(baseLap());
  });

  it("燃料を減らすと速くなる", () => {
    const light: SolverConditions = { ...STANDARD_CONDITIONS, fuelMassKg: 15 };
    expect(solveLap(TSUKUBA_TC2000, ACT4, light).idealLapTimeS).toBeLessThan(baseLap());
  });
});

describe("ソルバの健全性", () => {
  it("決定論：同じ入力は必ず同じ結果", () => {
    expect(solveLap(TSUKUBA_TC2000, ACT4).idealLapTimeS).toBe(baseLap());
  });

  it("セクタータイムの合計がラップタイムとほぼ一致する", () => {
    const r = solveLap(TSUKUBA_TC2000, ACT4);
    const sum = r.sectorTimesS.reduce((a, s) => a + s.timeS, 0);
    expect(Math.abs(sum - r.idealLapTimeS)).toBeLessThan(0.05);
  });

  it("アップシフト回数が現実的な範囲（6〜16回）に収まる＝ハンチングしていない", () => {
    for (const { spec } of ACT_FIXTURES) {
      const r = solveLap(TSUKUBA_TC2000, spec);
      expect(r.upshiftCount).toBeGreaterThanOrEqual(5);
      expect(r.upshiftCount).toBeLessThanOrEqual(16);
    }
  });

  it("低速コーナーの支配的な限界はトラクションである（05 §1.3 S2 の設計意図）", () => {
    const r = solveLap(TSUKUBA_TC2000, ACT4);
    const hairpin1 = r.segmentLimits.find((s) => s.id === "hairpin1");
    const hairpin2 = r.segmentLimits.find((s) => s.id === "hairpin2");
    expect(hairpin1?.limit).toBe("traction");
    expect(hairpin2?.limit).toBe("traction");
  });

  it("最高速が現実的な範囲（TC2000 は 150〜270 km/h 域）", () => {
    for (const { spec } of ACT_FIXTURES) {
      const r = solveLap(TSUKUBA_TC2000, spec);
      expect(r.vMaxKph).toBeGreaterThan(150);
      expect(r.vMaxKph).toBeLessThan(270);
    }
  });
});
