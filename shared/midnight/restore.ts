/**
 * MIDNIGHT AUTOMATION: C1 to TSUKUBA
 * ───────────────────────────────────────────────────────────
 * レストア工程ステートマシン 参照実装
 * 設計書 `docs/midnight-automation/spec/S4_restoration_state_machine.md`
 *
 * サビ進行度 80% 以上の不動車を「新車を凌駕する車体」へ再生する全13工程。
 *
 *  - **完全決定論**：同じ `subject` ＋ 同じ `plan` ＋ 同じ seed なら必ず同じ結果になる。
 *  - 工程は飛ばせない。歪みを残したまま塗ると、その歪みは永久に残る。
 *  - 恒久的な失敗は **2つだけ**（水素脆化・膜厚ムラ）。全部やり直せると緊張が消え、
 *    全部恒久だと理不尽になる。この比率が設計点。
 *  - 外部依存ゼロ。`types.ts` からは型のみ、`market.ts` からは乱数のみを import する。
 */

import type { ChassisId, PartSlot } from "./types";
import { hash32, mulberry32 } from "./market";

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** 1 ゲーム日の tick 数（`07` §3.1 と一致させること） */
export const TICKS_PER_GAME_DAY = 28_800;

/* ═══════════════════════ 1. 型 ═══════════════════════ */

export const RESTORE_STATES = [
  "S0", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "DONE",
] as const;
export type RestoreState = (typeof RESTORE_STATES)[number];

export const STATE_LABEL: Readonly<Record<RestoreState, string>> = {
  S0: "入庫・洗浄",
  S1: "診断（3Dスキャン＋腐食マッピング）",
  S2: "全バラシ",
  S3: "サンドブラスト剥離",
  S4: "酸洗い・防錆下地",
  S5: "カチオン電着浸漬槽",
  S6: "板金・欠損パネル製作",
  S7: "廃盤パーツの3Dスキャン＆5軸削り出し",
  S8: "3Dフレーム修正治具",
  S9: "スポット増し＋構造用接着",
  S10: "塗装",
  S11: "組み上げ",
  S12: "慣らし（シェイクダウン）",
  DONE: "完成",
};

export const NEXT_STATE: Readonly<Record<RestoreState, RestoreState>> = {
  S0: "S1", S1: "S2", S2: "S3", S3: "S4", S4: "S5", S5: "S6", S6: "S7",
  S7: "S8", S8: "S9", S9: "S10", S10: "S11", S11: "S12", S12: "DONE", DONE: "DONE",
};

/** 基準所要 tick（S4 §3.1）。可変工程は 0 を置き、`stepTicks()` で計算する */
export const BASE_TICKS: Readonly<Record<RestoreState, number>> = {
  S0: 1_800, S1: 5_400, S2: 28_800, S3: 21_600, S4: 14_400, S5: 10_800,
  S6: 0, S7: 0, S8: 0, S9: 18_000, S10: 25_200, S11: 43_200, S12: 28_800, DONE: 0,
};

/** 工程ごとの消費電力 [kW] */
export const STATE_KW: Readonly<Record<RestoreState, number>> = {
  S0: 12, S1: 14, S2: 6, S3: 95, S4: 22, S5: 180, S6: 40,
  S7: 92, S8: 48, S9: 64, S10: 72, S11: 8, S12: 90, DONE: 0,
};

/** 工程ごとの基礎失敗確率 */
export const STATE_FAIL_P: Readonly<Record<RestoreState, number>> = {
  S0: 0, S1: 0, S2: 0.08, S3: 0.06, S4: 0.04, S5: 0.05, S6: 0.1,
  S7: 0.07, S8: 0.12, S9: 0.05, S10: 0.06, S11: 0.03, S12: 0.04, DONE: 0,
};

export type PanelMaterial = "steel" | "aluminium" | "carbon";

export const PANEL_TICKS: Readonly<Record<PanelMaterial, number>> = { steel: 7_200, aluminium: 9_000, carbon: 14_400 };
export const PANEL_MASS_MULT: Readonly<Record<PanelMaterial, number>> = { steel: 1.0, aluminium: 0.62, carbon: 0.34 };
export const PANEL_STIFF: Readonly<Record<PanelMaterial, number>> = { steel: 1.0, aluminium: 0.88, carbon: 1.06 };
export const PANEL_COST_YEN: Readonly<Record<PanelMaterial, number>> = { steel: 18_000, aluminium: 46_000, carbon: 120_000 };

export type JigKind = "simple" | "jig3d" | "jig3dLaser";
export const JIG_PRECISION: Readonly<Record<JigKind, number>> = { simple: 0.65, jig3d: 1.0, jig3dLaser: 1.18 };

export interface RestoreSubject {
  chassisId: ChassisId;
  source: "container" | "import" | "yard" | "aa" | "netauc";
  /** 0.0–1.0。本ラインの想定対象は 0.80 以上 */
  rustLevel: number;
  /** 0–8 mm。>6 は大型治具が要る */
  frameBendMm: number;
  /** 欠損部品。廃盤は自分で削り出すしかない */
  missingParts: PartSlot[];
  seizedEngine: boolean;
  /** 損傷パネル数（0–12） */
  damagedPanels: number;
  numberingOk: boolean;
  provenance?: "prototype" | "works" | "normal";
}

/** プレイヤーが設定する工程パラメータ */
export interface RestorePlan {
  /** S3：研削材の供給量 [kg]（標準 180） */
  blastMediaKg: number;
  /** S3：ブラスト圧力係数（1.0 が標準。上げると速いが吹き抜ける） */
  blastPressure: number;
  /** S5：電着電圧係数（1.0 が標準） */
  edVoltage: number;
  /** S5：浸漬時間比（1.0 が標準） */
  edDipRatio: number;
  /** S5：液温ずれ [℃] */
  edTempErrorC: number;
  /** S6：欠損パネルに使う材料 */
  panelMaterial: PanelMaterial;
  /** S8：フレーム修正治具の種別 */
  jig: JigKind;
  /** S9：スポット増し打ち点数（0–420） */
  spotWelds: number;
  /** S9：構造用接着剤の長さ [m]（0–32） */
  adhesiveM: number;
  /** S9：ロールケージの等級係数（0 = 無し、1.0 = LEGENDARY） */
  cageGrade: number;
}

export const DEFAULT_PLAN: RestorePlan = {
  blastMediaKg: 180,
  blastPressure: 1.0,
  edVoltage: 1.0,
  edDipRatio: 1.0,
  edTempErrorC: 0,
  panelMaterial: "steel",
  jig: "jig3d",
  spotWelds: 240,
  adhesiveM: 16,
  cageGrade: 0.6,
};

export type RestoreFailure =
  | "boltSnapped"        // S2 固着ボルト破断
  | "blowThrough"        // S3 薄板の吹き抜け
  | "hydrogenEmbrittle"  // S4 水素脆化（**恒久**）
  | "filmUnevenness"     // S5 膜厚ムラ（**恒久**）
  | "panelMisfit"        // S6 パネル寸法不良
  | "stockLost"          // S7 素材ロス
  | "overPull"           // S8 引きすぎ
  | "badWeldSpots"       // S9 打点不良
  | "orangePeel"         // S10 肌荒れ
  | "wiringFault"        // S11 配線ミス
  | "earlyDefect";       // S12 初期不良

export interface RestoreProgress {
  state: RestoreState;
  /** 現在の状態で消化した tick */
  ticksInState: number;
  /** 現在の状態に必要な tick */
  ticksRequired: number;
  elapsedTicks: number;
  /** 残存サビ（S3 で落ちる） */
  rust: number;
  /** 残存歪み mm（S8 で落ちる） */
  bendMm: number;
  /** 未製作の欠損パネル数 */
  pendingPanels: number;
  /** 未製作の欠損部品数 */
  pendingParts: number;
  /** 防錆係数 0–1（S5 で決まる） */
  corrosionResistance: number;
  /** 積み上がった追加質量 [kg] */
  addedMassKg: number;
  costYen: number;
  energyKwh: number;
  failures: RestoreFailure[];
  /** S12 からの差し戻しを 1 回に制限するためのフラグ */
  reworkUsed: boolean;
  log: string[];
}

export interface RestoreResult {
  /** ねじり剛性の倍率。1.0 が新車。完全レストアで 1.37–1.42 */
  stiffnessFactor: number;
  totalDays: number;
  totalCostYen: number;
  energyKwh: number;
  addedMassKg: number;
  residualBendMm: number;
  residualRust: number;
  corrosionResistance: number;
  /** 1 ゲーム日あたりのサビ再発率 */
  rustReturnPerDay: number;
  driveabilityBonus: number;
  valueMultiplier: number;
  repGain: number;
  failures: RestoreFailure[];
  log: string[];
}

/* ═══════════════════════ 2. 初期化 ═══════════════════════ */

export function initRestore(subject: RestoreSubject, plan: RestorePlan = DEFAULT_PLAN): RestoreProgress {
  return {
    state: "S0",
    ticksInState: 0,
    ticksRequired: stepTicks("S0", subject, plan, {
      pendingPanels: subject.damagedPanels,
      pendingParts: subject.missingParts.length,
      bendMm: subject.frameBendMm,
      rust: subject.rustLevel,
    }),
    elapsedTicks: 0,
    rust: subject.rustLevel,
    bendMm: subject.frameBendMm,
    pendingPanels: subject.damagedPanels,
    pendingParts: subject.missingParts.length,
    corrosionResistance: 0,
    addedMassKg: 0,
    costYen: 0,
    energyKwh: 0,
    failures: [],
    reworkUsed: false,
    log: [],
  };
}

interface TickContext {
  pendingPanels: number;
  pendingParts: number;
  bendMm: number;
  rust: number;
}

/** 各工程の所要 tick。可変工程（S6 / S7 / S8）はここで決まる */
export function stepTicks(state: RestoreState, subject: RestoreSubject, plan: RestorePlan, ctx: TickContext): number {
  switch (state) {
    case "S3":
      return Math.round(21_600 * (0.6 + 0.8 * subject.rustLevel));
    case "S6":
      return ctx.pendingPanels === 0 ? 0 : Math.round(ctx.pendingPanels * PANEL_TICKS[plan.panelMaterial] * 1.15);
    case "S7":
      return ctx.pendingParts === 0 ? 0 : ctx.pendingParts * (300 + 540);
    case "S8": {
      if (ctx.bendMm < 0.5) return 0;
      const cycles = Math.ceil(ctx.bendMm / 0.9 / JIG_PRECISION[plan.jig]);
      return cycles * 3_600;
    }
    default:
      return BASE_TICKS[state];
  }
}

/* ═══════════════════════ 3. 工程の数式 ═══════════════════════ */

/** S3：サンドブラスト剥離。サビが深いほど穴が開く */
export function blastStep(subject: RestoreSubject, plan: RestorePlan, r: () => number): {
  remainingRust: number;
  blowThroughPanels: number;
} {
  const stripRate = clamp(0.55 + 0.4 * (plan.blastMediaKg / 180) + 0.1 * (plan.blastPressure - 1), 0, 1);
  const pBlow = clamp(0.06 + 0.35 * Math.max(0, subject.rustLevel - 0.85) + 0.2 * (plan.blastPressure - 1), 0, 0.9);
  let blow = 0;
  // パネル 12 枚それぞれで判定する
  for (let i = 0; i < 12; i++) if (r() < pBlow) blow += 1;
  return { remainingRust: subject.rustLevel * (1 - stripRate), blowThroughPanels: blow };
}

/** S5：カチオン電着。**やり直せない**工程。10年後のサビ再発率がここで決まる */
export function edStep(plan: RestorePlan): {
  filmMicron: number;
  uniformity: number;
  corrosionResistance: number;
  massKg: number;
} {
  const filmMicron = 18 * plan.edVoltage * Math.pow(Math.max(0.1, plan.edDipRatio), 0.45);
  const uniformity = clamp(1 - 0.08 * Math.abs(plan.edVoltage - 1) * 10 - 0.15 * (Math.abs(plan.edTempErrorC) / 5), 0.4, 1);
  const corrosionResistance = clamp(0.35 + 0.65 * uniformity * clamp(filmMicron / 20, 0, 1.2), 0, 1);
  return { filmMicron, uniformity, corrosionResistance, massKg: 6.2 * (filmMicron / 18) };
}

/** S8：1 サイクルあたりの矯正量 */
export function frameStep(bendMm: number, rust: number, plan: RestorePlan): number {
  return Math.min(bendMm, 0.9) * JIG_PRECISION[plan.jig] * (1 - 0.15 * rust);
}

/** S9：剛性ボーナスと重量増 */
export function reinforceStep(plan: RestorePlan): { spotBonus: number; glueBonus: number; cageBonus: number; massKg: number } {
  const spotBonus = 0.12 * Math.pow(clamp(plan.spotWelds, 0, 420) / 420, 0.8);
  const glueBonus = 0.08 * Math.pow(clamp(plan.adhesiveM, 0, 32) / 32, 0.9);
  const cageBonus = 0.22 * clamp(plan.cageGrade, 0, 1);
  const massKg = plan.spotWelds * 0.004 + plan.adhesiveM * 0.21 + (plan.cageGrade > 0 ? 28 : 0);
  return { spotBonus, glueBonus, cageBonus, massKg };
}

/* ═══════════════════════ 4. 進行 ═══════════════════════ */

/**
 * 1 工程を完了させて次へ進む。
 * UI は `ticksRequired` に向かって `ticksInState` を進め、到達したらこれを呼ぶ。
 */
export function completeState(
  progress: RestoreProgress,
  subject: RestoreSubject,
  plan: RestorePlan,
  seed: number,
): RestoreProgress {
  const p: RestoreProgress = {
    ...progress,
    failures: [...progress.failures],
    log: [...progress.log],
  };
  const state = p.state;
  if (state === "DONE") return p;

  const r = mulberry32(hash32(seed, subject.chassisId, state, p.elapsedTicks));
  const required = p.ticksRequired;
  p.elapsedTicks += required;
  p.energyKwh += (STATE_KW[state] * required) / (20 * 3600);

  switch (state) {
    case "S1":
      // 診断：**隠しパラメータが全開示される**。ここから先は読みではなく計画のゲームになる
      p.log.push(`診断完了：サビ ${(p.rust * 100).toFixed(0)}% / 歪み ${p.bendMm.toFixed(1)} mm / 欠損 ${p.pendingParts} 点`);
      break;

    case "S2":
      if (r() < STATE_FAIL_P.S2) {
        p.failures.push("boltSnapped");
        p.elapsedTicks += Math.round(0.3 * TICKS_PER_GAME_DAY);
        p.costYen += 12_000;
        p.log.push("固着ボルト破断。ボルトを新造（+0.3 日）");
      }
      break;

    case "S3": {
      const res = blastStep(subject, plan, r);
      p.rust = res.remainingRust;
      p.costYen += Math.round(plan.blastMediaKg * 180);
      if (res.blowThroughPanels > 0) {
        p.failures.push("blowThrough");
        p.pendingPanels += res.blowThroughPanels;
        p.log.push(`薄板の吹き抜け ${res.blowThroughPanels} 枚。パネル製作が追加されました`);
      }
      p.log.push(`剥離完了：残存サビ ${(p.rust * 100).toFixed(1)}%`);
      break;
    }

    case "S4":
      p.costYen += 86_000;
      if (r() < STATE_FAIL_P.S4) {
        p.failures.push("hydrogenEmbrittle");
        p.log.push("水素脆化が発生（恒久・強度 −6%）。焼鈍で半減できます");
      }
      break;

    case "S5": {
      const ed = edStep(plan);
      p.corrosionResistance = ed.corrosionResistance;
      p.addedMassKg += ed.massKg;
      p.costYen += 240_000;
      if (ed.uniformity < 0.75 || r() < STATE_FAIL_P.S5) {
        p.failures.push("filmUnevenness");
        p.corrosionResistance *= 0.7;
        p.log.push("膜厚ムラ（恒久・防錆 −30%）。再ブラストからやり直すしかありません");
      }
      p.log.push(`電着完了：膜厚 ${ed.filmMicron.toFixed(1)} μm / 均一度 ${(ed.uniformity * 100).toFixed(0)}%`);
      break;
    }

    case "S6": {
      if (p.pendingPanels > 0) {
        const made = p.pendingPanels;
        p.costYen += made * PANEL_COST_YEN[plan.panelMaterial];
        p.addedMassKg += made * 8.4 * PANEL_MASS_MULT[plan.panelMaterial] - made * 8.4;
        if (r() < STATE_FAIL_P.S6) {
          p.failures.push("panelMisfit");
          p.costYen += PANEL_COST_YEN[plan.panelMaterial];
          p.log.push("パネル寸法不良。1 枚作り直し（Cd +0.008 の建て付け段差）");
        }
        p.pendingPanels = 0;
        p.log.push(`パネル ${made} 枚を製作（${plan.panelMaterial}）`);
      }
      break;
    }

    case "S7": {
      if (p.pendingParts > 0) {
        const made = p.pendingParts;
        p.costYen += made * 42_000;
        if (r() < STATE_FAIL_P.S7) {
          p.failures.push("stockLost");
          p.costYen += 42_000;
          p.log.push("削り出し失敗。素材を 1 つ失いました");
        }
        p.pendingParts = 0;
        p.log.push(`廃盤部品 ${made} 点を 5 軸で削り出し（等級は自社ラインの精度そのもの）`);
      }
      break;
    }

    case "S8": {
      if (p.bendMm >= 0.5) {
        const cycles = Math.ceil(p.bendMm / 0.9 / JIG_PRECISION[plan.jig]);
        for (let i = 0; i < cycles && p.bendMm >= 0.2; i++) {
          const need = Math.min(p.bendMm, 0.9);
          const pOver = 0.12 * (1 - JIG_PRECISION[plan.jig]) + 0.06 * (need / 0.9);
          if (r() < pOver) {
            const back = 0.4 + r() * 0.8;
            p.bendMm += back;
            p.failures.push("overPull");
            p.log.push(`引きすぎ：歪みが反対方向に +${back.toFixed(1)} mm`);
            p.elapsedTicks += 3_600;
          } else {
            p.bendMm = Math.max(0, p.bendMm - frameStep(p.bendMm, p.rust, plan));
          }
        }
        p.costYen += 120_000;
        p.log.push(`フレーム矯正完了：残存歪み ${p.bendMm.toFixed(2)} mm`);
      }
      break;
    }

    case "S9": {
      const rf = reinforceStep(plan);
      p.addedMassKg += rf.massKg;
      p.costYen += Math.round(plan.spotWelds * 320 + plan.adhesiveM * 6_400 + plan.cageGrade * 352_000);
      if (r() < STATE_FAIL_P.S9) {
        p.failures.push("badWeldSpots");
        p.log.push("打点不良。スポットの剛性寄与が半減（追い打ち可）");
      }
      break;
    }

    case "S10":
      p.costYen += 420_000;
      if (r() < STATE_FAIL_P.S10) {
        p.failures.push("orangePeel");
        p.elapsedTicks += Math.round(0.4 * TICKS_PER_GAME_DAY);
        p.log.push("肌荒れ。磨き工程を追加（+0.4 日）");
      }
      break;

    case "S11":
      if (r() < STATE_FAIL_P.S11) {
        p.failures.push("wiringFault");
        p.log.push("配線に不備。夜に突然エンストするかもしれません");
      }
      break;

    case "S12":
      p.costYen += 68_000;
      if (!p.reworkUsed && (p.failures.includes("wiringFault") || r() < STATE_FAIL_P.S12)) {
        p.failures.push("earlyDefect");
        p.reworkUsed = true;
        p.log.push("シェイクダウンで初期不良を発見。組み上げへ差し戻し");
        p.state = "S11";
        p.ticksInState = 0;
        p.ticksRequired = stepTicks("S11", subject, plan, p);
        return p;
      }
      break;

    default:
      break;
  }

  const next = NEXT_STATE[state];
  p.state = next;
  p.ticksInState = 0;
  p.ticksRequired = next === "DONE" ? 0 : stepTicks(next, subject, plan, p);
  return p;
}

/** 完成まで一気に回す（テスト・プレビュー・UI の完成予測に使う） */
export function runRestore(subject: RestoreSubject, plan: RestorePlan = DEFAULT_PLAN, seed = 1): RestoreResult {
  let p = initRestore(subject, plan);
  let guard = 0;
  while (p.state !== "DONE" && guard < 64) {
    p = completeState(p, subject, plan, seed);
    guard += 1;
  }
  return finalizeRestore(p, plan);
}

/* ═══════════════════════ 5. 完成 ═══════════════════════ */

/**
 * 最終剛性の確定（S4 §5）。
 * 完全レストア（スポット420点＋接着32m＋S級ケージ＋残存歪み0.2mm）で **1.37**、
 * ケージが LEGENDARY なら **1.42**。新車（1.00）を明確に超える。
 */
export function finalizeRestore(p: RestoreProgress, plan: RestorePlan): RestoreResult {
  const rf = reinforceStep(plan);
  const spot = p.failures.includes("badWeldSpots") ? rf.spotBonus * 0.5 : rf.spotBonus;
  const panelBonus = plan.panelMaterial === "carbon" ? 0.02 : 0;

  const stiffnessFactor =
    (1 + spot + rf.glueBonus + rf.cageBonus + panelBonus) *
    (1 - 0.045 * p.bendMm) *
    (1 - 0.08 * p.rust) *
    (p.failures.includes("hydrogenEmbrittle") ? 0.94 : 1);

  return {
    stiffnessFactor: Math.max(0.2, stiffnessFactor),
    totalDays: p.elapsedTicks / TICKS_PER_GAME_DAY,
    totalCostYen: p.costYen,
    energyKwh: Math.round(p.energyKwh),
    addedMassKg: Math.round(p.addedMassKg * 10) / 10,
    residualBendMm: Math.round(p.bendMm * 100) / 100,
    residualRust: Math.round(p.rust * 1000) / 1000,
    corrosionResistance: Math.round(p.corrosionResistance * 1000) / 1000,
    rustReturnPerDay: 0.004 * (1 - p.corrosionResistance),
    driveabilityBonus: clamp(0.05 * (stiffnessFactor - 1) / 0.37, 0, 0.05),
    valueMultiplier: clamp(1 + 1.4 * (stiffnessFactor - 0.6), 1, 2.4),
    repGain: stiffnessFactor >= 1.2 ? 15 : 8,
    failures: p.failures,
    log: p.log,
  };
}

/* ═══════════════════════ 6. 国内市場の独自ライン ═══════════════════════ */

export interface NikoichiInput {
  chassisId: ChassisId;
  /** 前方大破（後ろ半分が無事） */
  frontWrecked: boolean;
  /** 溶接の等級係数 0–1 */
  weldGrade: number;
  jig: JigKind;
}

export interface NikoichiResult {
  ok: boolean;
  reason?: string;
  frameBendMm: number;
  stiffnessFactor: number;
  ticks: number;
  costYen: number;
  /** 車台番号の職権打刻が必要か */
  needsRestamp: boolean;
}

/**
 * ニコイチ合体溶接ライン。**安いが祟る**。
 * 歪みの下限が 0.8 mm なので、本気のアタック車には向かない。
 */
export function nikoichi(a: NikoichiInput, b: NikoichiInput): NikoichiResult {
  if (a.chassisId !== b.chassisId) {
    return { ok: false, reason: "同一シャシーでないと合体できない", frameBendMm: 0, stiffnessFactor: 0, ticks: 0, costYen: 0, needsRestamp: false };
  }
  if (a.frontWrecked === b.frontWrecked) {
    return { ok: false, reason: "損傷部位が相補的でない（前後が揃わない）", frameBendMm: 0, stiffnessFactor: 0, ticks: 0, costYen: 0, needsRestamp: false };
  }
  const jigP = JIG_PRECISION[a.jig];
  const weld = (a.weldGrade + b.weldGrade) / 2;
  // 下限 0.8 mm。切って溶接した以上、どれだけ良い治具を使っても完全には戻らない
  const bend = 0.8 + 2.2 * Math.max(0, 1 - jigP) + 0.6 * (1 - weld);
  // 溶接が上手いと純正を上回る（0.88〜1.04）
  const stiffness = clamp(0.88 + 0.16 * weld, 0.88, 1.04) * (1 - 0.045 * Math.max(0, bend - 0.8));
  return {
    ok: true,
    frameBendMm: Math.round(bend * 100) / 100,
    stiffnessFactor: Math.round(stiffness * 1000) / 1000,
    ticks: 1_800 + 3_600 + 5_400 + 900,
    costYen: 420_000 + 85_000,
    needsRestamp: true,
  };
}

export interface AtToMtResult {
  ticks: number;
  partsCostYen: number;
  certificationYen: number;
  certificationDays: number;
  massDeltaKg: number;
  driveabilityDelta: number;
  valueMultiplier: number;
  /** ハーネス加工が C 級だと夜に突然エンストする */
  electricalGremlin: boolean;
}

/**
 * AT→MT 公認換装ライン。
 * 「ドノーマルの極上AT」を拾って自分で MT 化する——JDM の王道ムーブを体験にする。
 */
export function atToMtSwap(harnessGradeFactor: number, seed = 1): AtToMtResult {
  const r = mulberry32(hash32(seed, "at2mt"));
  const gremlinP = clamp(0.45 * (1 - harnessGradeFactor), 0, 0.45);
  return {
    ticks: 1_200 + 900 + 600 + 1_500 + 600,
    partsCostYen: 420_000,
    certificationYen: 68_000,
    certificationDays: 10,
    massDeltaKg: -18,
    driveabilityDelta: 0.04,
    valueMultiplier: 1.22,
    electricalGremlin: r() < gremlinP,
  };
}
