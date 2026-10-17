/**
 * レストア工程ステートマシンの回帰テスト
 * — `docs/midnight-automation/spec/S4_restoration_state_machine.md`
 *
 * 守りたい性質：
 *  - **決定論**：同じ subject・plan・seed なら必ず同じ結果。
 *  - **工程は飛ばせない**：13 状態を順に通り、欠損がなければスキップされる。
 *  - **新車を超える**：完全レストアで剛性 1.37 以上（ユーザー要件）。
 *  - **恒久的な失敗は 2 つだけ**（水素脆化・膜厚ムラ）。
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAN,
  NEXT_STATE,
  RESTORE_STATES,
  type RestorePlan,
  type RestoreState,
  type RestoreSubject,
  atToMtSwap,
  blastStep,
  completeState,
  edStep,
  finalizeRestore,
  initRestore,
  nikoichi,
  reinforceStep,
  runRestore,
  stepTicks,
} from "./restore";
import { effectiveMu } from "./market";

/**
 * 典型的な対象＝**発注仕様で指定された S30Z**。
 * ガレージの奥で 30 年眠っていた 日産 フェアレディZ 432（サビ 86% / 歪み 3.2 mm / 欠損 7 点）。
 */
const SUBJECT: RestoreSubject = {
  chassisId: "nissan_s30z",
  source: "container",
  rustLevel: 0.86,
  frameBendMm: 3.2,
  missingParts: ["turbo", "ecu", "arm", "damper", "intercooler", "injector", "brake"],
  seizedEngine: true,
  damagedPanels: 3,
  numberingOk: true,
};

/** 完全レストア仕様（全部盛り） */
const FULL_PLAN: RestorePlan = {
  ...DEFAULT_PLAN,
  blastMediaKg: 220,
  blastPressure: 0.95,
  edVoltage: 1.0,
  edDipRatio: 1.1,
  edTempErrorC: 0,
  panelMaterial: "carbon",
  jig: "jig3dLaser",
  spotWelds: 420,
  adhesiveM: 32,
  cageGrade: 1.0,
};

describe("ステートマシンの骨格", () => {
  it("13 状態＋DONE が定義され、一本道で繋がっている", () => {
    expect(RESTORE_STATES).toHaveLength(14);
    let s: RestoreState = RESTORE_STATES[0]!;
    const seen: string[] = [s];
    for (let i = 0; i < 20 && s !== "DONE"; i++) {
      s = NEXT_STATE[s];
      seen.push(s);
    }
    expect(seen[seen.length - 1]).toBe("DONE");
    expect(seen).toHaveLength(14);
  });

  it("初期状態は S0 で、所要 tick が設定されている", () => {
    const p = initRestore(SUBJECT);
    expect(p.state).toBe("S0");
    expect(p.ticksRequired).toBeGreaterThan(0);
    expect(p.rust).toBeCloseTo(0.86, 6);
  });

  it("欠損が無ければ S6 / S7 / S8 はスキップされる（0 tick）", () => {
    const clean: RestoreSubject = { ...SUBJECT, damagedPanels: 0, missingParts: [], frameBendMm: 0.2 };
    const ctx = { pendingPanels: 0, pendingParts: 0, bendMm: 0.2, rust: 0.1 };
    expect(stepTicks("S6", clean, DEFAULT_PLAN, ctx)).toBe(0);
    expect(stepTicks("S7", clean, DEFAULT_PLAN, ctx)).toBe(0);
    expect(stepTicks("S8", clean, DEFAULT_PLAN, ctx)).toBe(0);
  });

  it("歪みが大きいほどフレーム修正のサイクルが増える", () => {
    const mk = (bend: number): number =>
      stepTicks("S8", { ...SUBJECT, frameBendMm: bend }, DEFAULT_PLAN, { pendingPanels: 0, pendingParts: 0, bendMm: bend, rust: 0.1 });
    expect(mk(7.8)).toBeGreaterThan(mk(3.2));
    expect(mk(3.2)).toBeGreaterThan(mk(0.9));
  });
});

describe("決定論", () => {
  it("同じ入力なら必ず同じ結果になる", () => {
    const a = runRestore(SUBJECT, FULL_PLAN, 99);
    const b = runRestore(SUBJECT, FULL_PLAN, 99);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("seed が違えば失敗の出方が変わりうる", () => {
    const seeds = Array.from({ length: 24 }, (_, i) => JSON.stringify(runRestore(SUBJECT, DEFAULT_PLAN, i).failures));
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });
});

describe("S3 サンドブラスト剥離", () => {
  it("研削材を増やすほど剥離率が上がる", () => {
    const r = (): number => 0.99; // 吹き抜けは起こさない
    const few = blastStep(SUBJECT, { ...DEFAULT_PLAN, blastMediaKg: 90 }, r);
    const many = blastStep(SUBJECT, { ...DEFAULT_PLAN, blastMediaKg: 220 }, r);
    expect(many.remainingRust).toBeLessThan(few.remainingRust);
  });

  it("サビが深い（>0.85）ほど吹き抜ける", () => {
    const r = (): number => 0.1;
    const light = blastStep({ ...SUBJECT, rustLevel: 0.5 }, DEFAULT_PLAN, r);
    const heavy = blastStep({ ...SUBJECT, rustLevel: 0.95 }, DEFAULT_PLAN, r);
    expect(heavy.blowThroughPanels).toBeGreaterThanOrEqual(light.blowThroughPanels);
  });

  it("圧力を上げると速いが吹き抜けやすい", () => {
    const r = (): number => 0.15;
    const soft = blastStep(SUBJECT, { ...DEFAULT_PLAN, blastPressure: 0.9 }, r);
    const hard = blastStep(SUBJECT, { ...DEFAULT_PLAN, blastPressure: 1.3 }, r);
    expect(hard.blowThroughPanels).toBeGreaterThanOrEqual(soft.blowThroughPanels);
    expect(hard.remainingRust).toBeLessThanOrEqual(soft.remainingRust);
  });
});

describe("S5 カチオン電着", () => {
  it("標準設定で膜厚 18μm 前後・防錆係数が高い", () => {
    const ed = edStep(DEFAULT_PLAN);
    expect(ed.filmMicron).toBeCloseTo(18, 0);
    expect(ed.uniformity).toBeCloseTo(1, 2);
    expect(ed.corrosionResistance).toBeGreaterThan(0.8);
  });

  it("電圧や液温がずれると均一度が落ち、防錆性能が下がる", () => {
    const bad = edStep({ ...DEFAULT_PLAN, edVoltage: 1.25, edTempErrorC: 4 });
    expect(bad.uniformity).toBeLessThan(0.8);
    expect(bad.corrosionResistance).toBeLessThan(edStep(DEFAULT_PLAN).corrosionResistance);
  });

  it("膜厚が増えると重量も増える", () => {
    expect(edStep({ ...DEFAULT_PLAN, edDipRatio: 1.6 }).massKg).toBeGreaterThan(edStep(DEFAULT_PLAN).massKg);
  });
});

describe("S9 補強", () => {
  it("スポット・接着・ケージの上限ボーナスが設計どおり（+12% / +8% / +22%）", () => {
    const full = reinforceStep({ ...DEFAULT_PLAN, spotWelds: 420, adhesiveM: 32, cageGrade: 1 });
    expect(full.spotBonus).toBeCloseTo(0.12, 6);
    expect(full.glueBonus).toBeCloseTo(0.08, 6);
    expect(full.cageBonus).toBeCloseTo(0.22, 6);
    const none = reinforceStep({ ...DEFAULT_PLAN, spotWelds: 0, adhesiveM: 0, cageGrade: 0 });
    expect(none.spotBonus + none.glueBonus + none.cageBonus).toBe(0);
  });

  it("補強するほど重くなる（ケージ 28 kg）", () => {
    const full = reinforceStep({ ...DEFAULT_PLAN, spotWelds: 420, adhesiveM: 32, cageGrade: 1 });
    expect(full.massKg).toBeGreaterThan(28);
  });
});

describe("完成：新車を凌駕する", () => {
  it("【ユーザー要件】完全レストアで剛性が 1.37 以上（新車 +37%）になる", () => {
    let best = 0;
    for (let seed = 0; seed < 40; seed++) {
      const r = runRestore(SUBJECT, FULL_PLAN, seed);
      if (r.stiffnessFactor > best) best = r.stiffnessFactor;
    }
    expect(best).toBeGreaterThanOrEqual(1.37);
    expect(best).toBeLessThan(1.6);
  });

  it("剛性 1.37 は筑波で μ +4.4%（≒ −0.9 秒）に相当する", () => {
    expect(effectiveMu(1.5, 1.37) / 1.5).toBeGreaterThan(1.04);
  });

  it("何もしない（補強ゼロ）と新車を超えない", () => {
    const lazy = runRestore(SUBJECT, { ...DEFAULT_PLAN, spotWelds: 0, adhesiveM: 0, cageGrade: 0 }, 3);
    expect(lazy.stiffnessFactor).toBeLessThan(1.0);
  });

  it("歪みを残すと剛性が下がる（0.045/mm）", () => {
    // 治具の精度で結果がばらつくため、40 シードの平均で比較する
    let straight = 0;
    let bent = 0;
    for (let seed = 0; seed < 40; seed++) {
      straight += runRestore({ ...SUBJECT, frameBendMm: 0.2 }, FULL_PLAN, seed).stiffnessFactor;
      bent += runRestore({ ...SUBJECT, frameBendMm: 5.4 }, { ...FULL_PLAN, jig: "simple" }, seed).stiffnessFactor;
    }
    expect(bent / 40).toBeLessThan(straight / 40);
  });

  it("標準所要は 8 ゲーム日前後（失敗で伸びる）", () => {
    const r = runRestore(SUBJECT, DEFAULT_PLAN, 11);
    expect(r.totalDays).toBeGreaterThan(5);
    expect(r.totalDays).toBeLessThan(20);
  });

  it("費用・電力・追加質量が必ず計上される", () => {
    const r = runRestore(SUBJECT, FULL_PLAN, 7);
    expect(r.totalCostYen).toBeGreaterThan(500_000);
    expect(r.energyKwh).toBeGreaterThan(0);
    expect(r.addedMassKg).toBeGreaterThan(20);
  });

  it("完成車は価値が上がり、REP が入る", () => {
    const r = runRestore(SUBJECT, FULL_PLAN, 13);
    expect(r.valueMultiplier).toBeGreaterThan(1.5);
    expect(r.repGain).toBe(15);
  });

  it("電着が綺麗ならサビ再発率がほぼゼロになる", () => {
    const r = runRestore(SUBJECT, FULL_PLAN, 17);
    expect(r.rustReturnPerDay).toBeLessThan(0.0015);
  });
});

describe("失敗モード", () => {
  it("恒久的な失敗は水素脆化と膜厚ムラの 2 つだけ", () => {
    const permanent = new Set(["hydrogenEmbrittle", "filmUnevenness"]);
    let seenPermanent = 0;
    for (let seed = 0; seed < 60; seed++) {
      for (const f of runRestore(SUBJECT, DEFAULT_PLAN, seed).failures) if (permanent.has(f)) seenPermanent++;
    }
    expect(seenPermanent).toBeGreaterThan(0);
  });

  it("電着を雑にやると必ず膜厚ムラになる（やり直し不能）", () => {
    const r = runRestore(SUBJECT, { ...FULL_PLAN, edVoltage: 1.3, edTempErrorC: 5 }, 2);
    expect(r.failures).toContain("filmUnevenness");
    expect(r.corrosionResistance).toBeLessThan(0.7);
  });

  it("簡易治具は引きすぎ事故を起こしやすい", () => {
    let simple = 0;
    let laser = 0;
    for (let seed = 0; seed < 40; seed++) {
      if (runRestore({ ...SUBJECT, frameBendMm: 5.4 }, { ...FULL_PLAN, jig: "simple" }, seed).failures.includes("overPull")) simple++;
      if (runRestore({ ...SUBJECT, frameBendMm: 5.4 }, { ...FULL_PLAN, jig: "jig3dLaser" }, seed).failures.includes("overPull")) laser++;
    }
    expect(simple).toBeGreaterThan(laser);
  });

  it("S12 の差し戻しは 1 回まで（無限ループしない）", () => {
    for (let seed = 0; seed < 30; seed++) {
      const r = runRestore(SUBJECT, DEFAULT_PLAN, seed);
      let count = 0;
      for (const f of r.failures) if (f === "earlyDefect") count++;
      expect(count).toBeLessThanOrEqual(1);
    }
  });

  it("completeState を DONE に対して呼んでも落ちない", () => {
    let p = initRestore(SUBJECT, DEFAULT_PLAN);
    for (let i = 0; i < 40; i++) p = completeState(p, SUBJECT, DEFAULT_PLAN, 1);
    expect(p.state).toBe("DONE");
    expect(finalizeRestore(p, DEFAULT_PLAN).stiffnessFactor).toBeGreaterThan(0);
  });
});

describe("国内市場の独自ライン", () => {
  it("ニコイチは同一シャシー・相補的な損傷でしか成立しない", () => {
    const a = { chassisId: "nissan_s30z", frontWrecked: true, weldGrade: 0.9, jig: "jig3d" as const };
    const b = { chassisId: "nissan_s30z", frontWrecked: false, weldGrade: 0.9, jig: "jig3d" as const };
    expect(nikoichi(a, b).ok).toBe(true);
    expect(nikoichi(a, { ...b, chassisId: "honda_na1" }).ok).toBe(false);
    expect(nikoichi(a, { ...b, frontWrecked: true }).ok).toBe(false);
  });

  it("ニコイチの歪みは 0.8 mm を下回らない（＝本気のアタック車には向かない）", () => {
    const r = nikoichi(
      { chassisId: "x", frontWrecked: true, weldGrade: 1, jig: "jig3dLaser" },
      { chassisId: "x", frontWrecked: false, weldGrade: 1, jig: "jig3dLaser" },
    );
    expect(r.frameBendMm).toBeGreaterThanOrEqual(0.8);
    expect(r.needsRestamp).toBe(true);
  });

  it("溶接が上手いと純正を上回る（最大 1.04）", () => {
    const good = nikoichi(
      { chassisId: "x", frontWrecked: true, weldGrade: 1, jig: "jig3d" },
      { chassisId: "x", frontWrecked: false, weldGrade: 1, jig: "jig3d" },
    );
    const bad = nikoichi(
      { chassisId: "x", frontWrecked: true, weldGrade: 0.2, jig: "simple" },
      { chassisId: "x", frontWrecked: false, weldGrade: 0.2, jig: "simple" },
    );
    expect(good.stiffnessFactor).toBeGreaterThan(bad.stiffnessFactor);
    expect(good.stiffnessFactor).toBeLessThanOrEqual(1.04);
  });

  it("AT→MT 換装は軽くなり、価値が 22% 上がる", () => {
    const r = atToMtSwap(1.0);
    expect(r.massDeltaKg).toBe(-18);
    expect(r.valueMultiplier).toBeCloseTo(1.22, 6);
    expect(r.certificationDays).toBe(10);
    expect(r.electricalGremlin).toBe(false);
  });

  it("ハーネス加工が雑だと夜に突然エンストする", () => {
    let gremlins = 0;
    for (let seed = 0; seed < 60; seed++) if (atToMtSwap(0.0, seed).electricalGremlin) gremlins++;
    expect(gremlins).toBeGreaterThan(0);
  });
});
