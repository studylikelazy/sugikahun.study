/**
 * ゲームの状態遷移（shared/midnight の純関数はここからのみ呼ぶ）。
 * 設計の正本: docs/midnight-automation/HANDOFF.md フェーズ1「経営ループが回る」。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Act, Grade, PartSlot } from "@shared/midnight/types";
import {
  INSPECTION_FEE_YEN, MARKET_CHASSIS_POOL, MARKET_PART_POOL,
  chassisPenalty, generateWeeklyMarket, hash32, resolveAuction, resolveContainerBid, salvage,
  type AaLot, type BlueBinLot, type ContainerLot, type ImportListing, type LocalOffer,
  type MarketContext, type MiracleCarListing, type NetAucListing, type WeeklyMarket, type YardLot,
} from "@shared/midnight/market";
import {
  atToMtSwap, completeState, finalizeRestore, initRestore,
  type RestorePlan, type RestoreResult, type RestoreSubject,
} from "@shared/midnight/restore";
import { STANDARD_CONDITIONS, formatLapTime, type SolverConditions, type LapResult } from "@shared/midnight/lap-solver";
import {
  ACT_GATES, TSUKUBA_ENTRY_YEN, WEEKLY_OVERHEAD_YEN, actFromBestLap, formatYen, gradeFromCondition,
  initialState, isRainyWeek, loadState, prizeForLap, saveState, seededRoll, uid,
  type GameState, type OwnedCar, type OwnedPart,
} from "./state";
import { buildVehicleSpec, lapOf, type BuiltSpec } from "./spec";

/* ── 小物 ────────────────────────────────────────────────── */

function pushLog(d: GameState, msg: string): void {
  d.log = [msg, ...d.log].slice(0, 80);
}

export function chassisDef(chassisId: string) {
  return MARKET_CHASSIS_POOL.find((c) => c.chassisId === chassisId);
}

export function partDef(defId: string) {
  return MARKET_PART_POOL.find((p) => p.defId === defId);
}

export function equippedPartsOf(s: GameState): OwnedPart[] {
  return Object.values(s.equipped)
    .map((id) => s.parts.find((p) => p.id === id))
    .filter((p): p is OwnedPart => Boolean(p));
}

export function heroOf(s: GameState): OwnedCar | null {
  return s.cars.find((c) => c.id === s.heroCarId) ?? null;
}

export function conditionsFor(s: GameState, rainy: boolean): SolverConditions {
  return rainy
    ? { airDensity: 1.2, surfaceGrip: 0.72, fuelMassKg: s.setup.fuelKg }
    : { ...STANDARD_CONDITIONS, fuelMassKg: s.setup.fuelKg };
}

export function carValueYen(car: OwnedCar): number {
  const base = chassisDef(car.chassisId)?.newPriceYen ?? 1_000_000;
  const v = base * (0.2 + 0.5 * car.condition) * (car.restored ? 1.5 : 1) * (car.shift === "AT" ? 0.85 : 1);
  return Math.round(v / 100) * 100;
}

export function partValueYen(part: OwnedPart): number {
  if (part.isFake || part.broken) return Math.round(part.nominalYen * 0.03);
  return Math.round(part.nominalYen * 0.4 * (0.5 + 0.5 * part.condition));
}

function makeCar(args: {
  chassisId: string; condition: number; frameBendMm: number; rustLevel: number;
  odometerKm: number; shift: "MT" | "AT"; source: string; pricePaidYen: number; weekBought: number;
  stiffnessOverride?: number;
}): OwnedCar {
  const def = chassisDef(args.chassisId);
  const pen = chassisPenalty({ frameBendMm: args.frameBendMm, rustLevel: args.rustLevel });
  return {
    id: uid("car"),
    chassisId: args.chassisId,
    name: def?.name ?? args.chassisId,
    code: def?.code ?? "",
    engine: def?.engine ?? "",
    layout: def?.layout ?? "FR",
    dryMassKg: def?.dryMassKg ?? 1_200,
    condition: args.condition,
    frameBendMm: args.frameBendMm,
    rustLevel: args.rustLevel,
    stiffnessFactor: args.stiffnessOverride ?? pen.stiffnessFactor,
    odometerKm: args.odometerKm,
    shift: args.shift,
    source: args.source,
    pricePaidYen: args.pricePaidYen,
    weekBought: args.weekBought,
    restored: false,
    addedMassKg: 0,
    driveabilityBonus: 0,
    immobile: args.rustLevel >= 0.8 || args.condition < 0.35,
  };
}

function makePart(args: {
  defId: string; grade: Grade; condition: number; pricePaidYen: number; source: string;
  weekBought: number; isFake?: boolean; broken?: boolean; nameOverride?: string;
}): OwnedPart {
  const def = partDef(args.defId);
  return {
    id: uid("part"),
    defId: args.defId,
    slot: (def?.slot ?? "ecu") as PartSlot,
    name: args.nameOverride ?? def?.name ?? args.defId,
    grade: args.grade,
    condition: args.condition,
    nominalYen: def?.nominalYen ?? 50_000,
    pricePaidYen: args.pricePaidYen,
    source: args.source,
    weekBought: args.weekBought,
    isFake: args.isFake ?? false,
    broken: args.broken ?? false,
  };
}

/** 所有車 → レストア対象（欠損は状態から決定論で導出） */
export function subjectFromCar(car: OwnedCar, saveSeed: number): RestoreSubject {
  const slots: PartSlot[] = ["piston", "conrod", "crank", "camshaft", "head", "block", "turbo", "intercooler", "injector", "ecu", "clutch", "gearbox", "lsd", "brake", "arm", "damper"];
  const n = Math.max(0, Math.min(7, Math.round((1 - car.condition) * 7)));
  const missing: PartSlot[] = [];
  for (let i = 0; missing.length < n && i < 40; i++) {
    const s = slots[Math.floor(seededRoll(saveSeed, car.id, `missing-${i}`) * slots.length)]!;
    if (!missing.includes(s)) missing.push(s);
  }
  const source: RestoreSubject["source"] = car.source.startsWith("AA")
    ? "aa" : car.source.startsWith("コンテナ")
    ? "container" : car.source.startsWith("輸入")
    ? "import" : car.source.startsWith("ヤード")
    ? "yard" : "netauc";
  return {
    chassisId: car.chassisId,
    source,
    rustLevel: car.rustLevel,
    frameBendMm: car.frameBendMm,
    missingParts: missing,
    seizedEngine: car.condition < 0.25,
    damagedPanels: Math.max(0, Math.min(12, Math.round((1 - car.condition) * 8))),
    numberingOk: true,
  };
}

export function restoreSeedFor(saveSeed: number, carId: string, week: number): number {
  return hash32(saveSeed, "restore", carId, week);
}

/* ── 本体 ────────────────────────────────────────────────── */

export interface AttackOutcome {
  result: LapResult;
  built: BuiltSpec;
  official: boolean;
  yenPrize: number;
  repGain: number;
  d5Gain: number;
  gateActs: number[];
  newBest: boolean;
}

export function useGame() {
  const [state, setState] = useState<GameState>(() => loadState());

  useEffect(() => { saveState(state); }, [state]);

  const update = useCallback((fn: (d: GameState) => void) => {
    setState((prev) => {
      const d = structuredClone(prev);
      fn(d);
      return d;
    });
  }, []);

  const act: Act = actFromBestLap(state.bestLapS);
  const rainy = isRainyWeek(state.saveSeed, state.week);

  const ctx: MarketContext = useMemo(() => ({
    saveSeed: state.saveSeed,
    week: state.week,
    act,
    reputation: state.rep,
    heat: state.heat,
    phantomDrought: state.phantomDrought,
    containerDrought: state.containerDrought,
    rainy,
  }), [state.saveSeed, state.week, act, state.rep, state.heat, state.phantomDrought, state.containerDrought, rainy]);

  const market: WeeklyMarket = useMemo(() => generateWeeklyMarket(ctx), [ctx]);
  const hero = heroOf(state);

  /* 鑑定 */
  const inspectListing = useCallback((id: string, level: 1 | 2) => {
    if (level === 2 && !state.hasCmm) {
      toast.error("Lv2 自社計測ライン未導入 — 海外調達の計測器か、初レストア完了で解禁");
      return;
    }
    const fee = INSPECTION_FEE_YEN[level];
    if (state.yen < fee) { toast.error("資金不足"); return; }
    update((d) => { d.yen -= fee; d.inspected[id] = level; });
    toast.success(level === 2 ? "計測完了（自社ライン・無料）" : `鑑定完了（−${formatYen(fee)}）`);
  }, [state.hasCmm, state.yen, update]);

  /* AA */
  const bidAa = useCallback((lot: AaLot, bid: number) => {
    const res = resolveAuction(lot, bid);
    if (!res.won) {
      toast.error(`競り負け — 業者の指値は ${formatYen(res.revealedTopYen)} だった`);
      update((d) => pushLog(d, `W${d.week} AA競り負け: ${lot.name}（業者指値 ${formatYen(res.revealedTopYen)}）`));
      return;
    }
    const total = res.paidYen + lot.feesYen;
    if (state.yen < total) { toast.error(`資金不足（必要 ${formatYen(total)} = 落札+諸費用）`); return; }
    const car = makeCar({
      chassisId: lot.chassisId, condition: lot.trueCondition,
      frameBendMm: lot.frameBendMm, rustLevel: lot.rustLevel,
      odometerKm: lot.realOdometerKm, shift: lot.sheet.shift,
      source: "AA", pricePaidYen: total, weekBought: state.week,
    });
    update((d) => {
      d.yen -= total;
      d.purchased[lot.id] = true;
      d.cars.push(car);
      if (!d.heroCarId) d.heroCarId = car.id;
      pushLog(d, `W${d.week} AA落札: ${car.name}（${formatYen(total)} / 状態 ${(car.condition * 100).toFixed(0)}% / 歪み ${car.frameBendMm.toFixed(1)}mm）`);
    });
    toast.success(`落札！ ${car.name} — 状態 ${(car.condition * 100).toFixed(0)}% / 歪み ${car.frameBendMm.toFixed(1)}mm（ガレージへ）`);
  }, [state.yen, state.week, update]);

  /* ネトオク */
  const bidNetAuc = useCallback((l: NetAucListing, bid: number) => {
    const res = resolveAuction(l, bid);
    if (!res.won) {
      toast.error(`競り負け — 相手の指値は ${formatYen(res.revealedTopYen)} だった`);
      return;
    }
    if (state.yen < res.paidYen) { toast.error("資金不足"); return; }
    const part = makePart({
      defId: l.defId, grade: gradeFromCondition(l.trueCondition, l.maxGrade),
      condition: l.trueCondition, pricePaidYen: res.paidYen, source: "ネトオク",
      weekBought: state.week, isFake: l.isFake, broken: l.isFake,
    });
    update((d) => {
      d.yen -= res.paidYen;
      d.purchased[l.id] = true;
      d.parts.push(part);
      if (l.rarity === "phantom") d.phantomDrought = 0;
      pushLog(d, `W${d.week} ネトオク落札: ${part.name} [${part.grade}]${l.isFake ? " — 到着品は贋作だった！" : ""}`);
    });
    if (l.isFake) toast.error("到着したのは贋作だった…ノークレーム・ノーリターン");
    else toast.success(`落札！ ${part.name} [${part.grade}] 状態 ${(part.condition * 100).toFixed(0)}%`);
  }, [state.yen, state.week, update]);

  /* 奇跡枠 */
  const buyMiracle = useCallback((m: MiracleCarListing) => {
    if (state.yen < m.askYen) { toast.error("資金不足"); return; }
    const car = makeCar({
      chassisId: m.chassisId, condition: m.trueCondition, frameBendMm: 0.1, rustLevel: 0.03,
      odometerKm: m.odometerKm, shift: "AT", source: "ネトオク奇跡枠",
      pricePaidYen: m.askYen, weekBought: state.week,
    });
    update((d) => {
      d.yen -= m.askYen;
      d.purchased[m.id] = true;
      d.cars.push(car);
      if (!d.heroCarId) d.heroCarId = car.id;
      pushLog(d, `W${d.week} 奇跡枠: ${car.name} AT/状態 ${(car.condition * 100).toFixed(0)}%（AT→MT換装はガレージで）`);
    });
    toast.success(`奇跡！ ${car.name}（低走行AT・状態 ${(car.condition * 100).toFixed(0)}%）`);
  }, [state.yen, state.week, update]);

  /* 解体ヤード */
  const pullYard = useCallback((lot: YardLot) => {
    if (state.yen < lot.askYen) { toast.error("資金不足"); return; }
    const sv = salvage(lot);
    const broke = seededRoll(state.saveSeed, lot.id, "pull") < lot.breakChance;
    const scrapYen = Math.round((sv.materialG * 420) / 1000);
    const usable = !broke && sv.usablePart;
    const part = usable ? makePart({
      defId: lot.defId, grade: gradeFromCondition(lot.trueCondition, "A"),
      condition: lot.trueCondition, pricePaidYen: lot.askYen, source: "解体ヤード", weekBought: state.week,
    }) : null;
    update((d) => {
      d.yen -= lot.askYen;
      d.purchased[lot.id] = true;
      d.data.D2 = (d.data.D2 ?? 0) + sv.data.D2;
      d.data.D3 = (d.data.D3 ?? 0) + sv.data.D3;
      if (part) d.parts.push(part);
      else d.yen += scrapYen;
      pushLog(d, part
        ? `W${d.week} ヤード回収: ${part.name} [${part.grade}]（D2+${sv.data.D2} D3+${sv.data.D3}）`
        : `W${d.week} ヤード: ${lot.name} は素材化（${formatYen(scrapYen)} / D2+${sv.data.D2} D3+${sv.data.D3}）`);
    });
    if (part) toast.success(`抜き取り成功！ ${part.name} [${part.grade}]`);
    else toast.info(broke ? `抜き取り中に破損 — 素材 ${formatYen(scrapYen)} と分解DATAに化けた` : `使える状態ではなかった — 素材化 ${formatYen(scrapYen)}`);
  }, [state.yen, state.saveSeed, state.week, update]);

  /* 青カゴ */
  const pullBin = useCallback((bin: BlueBinLot, bulk: boolean) => {
    const bs = state.binState[bin.id] ?? { remaining: bin.count, pulls: 0 };
    if (bs.remaining <= 0) { toast.error("このカゴはもう空だ"); return; }
    const n = bulk ? bs.remaining : 1;
    const cost = bulk ? Math.floor(bin.unitYen * bs.remaining * 0.85) : bin.unitYen;
    if (state.yen < cost) { toast.error("資金不足"); return; }
    const pool = MARKET_PART_POOL.filter((p) => p.minAct <= act);
    const bigPool = pool.filter((p) => p.nominalYen >= 150_000);
    const gained: OwnedPart[] = [];
    let scrap = 0;
    for (let k = 0; k < n; k++) {
      const roll = seededRoll(state.saveSeed, bin.id, `roll-${bs.pulls + k}`);
      const pick = seededRoll(state.saveSeed, bin.id, `pick-${bs.pulls + k}`);
      const roll2 = seededRoll(state.saveSeed, bin.id, `cond-${bs.pulls + k}`);
      if (roll < bin.rareChance && bigPool.length > 0) {
        const def = bigPool[Math.floor(pick * bigPool.length) % bigPool.length]!;
        gained.push(makePart({
          defId: def.defId, grade: gradeFromCondition(0.78 + roll2 * 0.2, "A"),
          condition: 0.78 + roll2 * 0.2, pricePaidYen: Math.round(cost / n), source: "青カゴ（大物）", weekBought: state.week,
        }));
      } else if (roll < bin.usableChance) {
        const def = pool[Math.floor(pick * pool.length) % pool.length]!;
        const cond = 0.25 + roll2 * 0.45;
        gained.push(makePart({
          defId: def.defId, grade: gradeFromCondition(cond, "A"),
          condition: cond, pricePaidYen: Math.round(cost / n), source: "青カゴ", weekBought: state.week,
        }));
      } else {
        scrap += 40 + Math.floor(roll2 * 200);
      }
    }
    update((d) => {
      d.yen -= cost;
      d.yen += scrap;
      d.binState[bin.id] = { remaining: bs.remaining - n, pulls: bs.pulls + n };
      d.parts.push(...gained);
      if (gained.length > 0 || n > 1) pushLog(d, `W${d.week} 青カゴ${bulk ? "（カゴごと）" : ""}: 使える部品 ${gained.length} 点 / 鉄屑 ${formatYen(scrap)}`);
    });
    if (gained.length > 0) toast.success(`掘り出し物 ${gained.length} 点！（${gained.map((p) => p.name).slice(0, 3).join("、")}${gained.length > 3 ? "…" : ""}）`);
    else toast.info(`ガラクタだけだった（鉄屑 ${formatYen(scrap)}）`);
  }, [state.binState, state.yen, state.saveSeed, state.week, act, update]);

  /* 輸入 */
  const buyImport = useCallback((l: ImportListing) => {
    const total = l.landedYen + l.complianceYen;
    if (state.yen < total) { toast.error(`資金不足（必要 ${formatYen(total)}）`); return; }
    const arrivesWeek = state.week + l.customsWeeks;
    let car: OwnedCar | undefined;
    let part: OwnedPart | undefined;
    let materialLabel: string | undefined;
    if (l.chassisId) {
      const isBarn = l.itemKind === "barnFind";
      const rust = isBarn ? 0.4 + seededRoll(state.saveSeed, l.id, "rust") * 0.35 : 0.05;
      car = makeCar({
        chassisId: l.chassisId, condition: l.trueCondition, frameBendMm: isBarn ? 0.6 : 0.2,
        rustLevel: rust, odometerKm: Math.round(30_000 + seededRoll(state.saveSeed, l.id, "odo") * 120_000),
        shift: "MT", source: `輸入 ${l.itemKind === "barnFind" ? "納屋発見" : "海外A級"}`, pricePaidYen: total, weekBought: state.week,
      });
    } else if (l.itemKind === "worksPart" || l.itemKind === "deadStock") {
      const pool = MARKET_PART_POOL.filter((p) => (l.itemKind === "worksPart" ? p.nominalYen >= 250_000 : true) && p.minAct <= act);
      const def = pool[Math.floor(seededRoll(state.saveSeed, l.id, "def") * pool.length) % Math.max(1, pool.length)] ?? MARKET_PART_POOL[0]!;
      part = makePart({
        defId: def.defId, grade: gradeFromCondition(l.trueCondition, l.maxGrade),
        condition: l.trueCondition, pricePaidYen: total,
        source: l.itemKind === "worksPart" ? "輸入（ワークス流出）" : "輸入（デッドストック）", weekBought: state.week,
      });
    } else if (l.itemKind === "metrology") {
      materialLabel = "CMM:自社計測ライン（CMM）";
    } else {
      const kg = l.pricePerKgYen ? Math.max(1, Math.round(l.priceYen / l.pricePerKgYen)) : 10;
      materialLabel = `${l.itemKind === "titanium" ? "チタン材" : "インコネル材"} ${kg}kg`;
    }
    update((d) => {
      d.yen -= total;
      d.purchased[l.id] = true;
      d.deliveries.push({
        id: uid("dlv"), label: l.name, arrivesWeek,
        ...(car ? { car } : {}), ...(part ? { part } : {}), ...(materialLabel ? { materialLabel } : {}),
      });
      pushLog(d, `W${d.week} 輸入発注: ${l.name}（${formatYen(total)}、W${arrivesWeek} 到着）`);
    });
    toast.success(`発注完了 — ${l.name} は ${l.customsWeeks} 週後に通関（W${arrivesWeek}）`);
  }, [state.yen, state.week, state.saveSeed, act, update]);

  /* コンテナ */
  const bidContainer = useCallback((lot: ContainerLot, bid: number) => {
    const res = resolveContainerBid(lot, bid);
    if (!res.won) {
      toast.error(`落札ならず — 競合の最高額は ${formatYen(res.revealedTopYen)}`);
      return;
    }
    const total = res.paidYen + res.feesYen;
    if (state.yen < total) { toast.error(`資金不足（必要 ${formatYen(total)}）`); return; }
    const tier = lot.tier;
    update((d) => {
      d.yen -= total;
      d.purchased[lot.id] = true;
      d.containerDrought = tier === "T4" || tier === "T5" ? 0 : d.containerDrought + 1;
      // 中身の付与
      if (tier === "T3") {
        const name = lot.contents.replace("不動車両：", "");
        const def = MARKET_CHASSIS_POOL.find((c) => c.name === name) ?? MARKET_CHASSIS_POOL[0]!;
        d.cars.push(makeCar({
          chassisId: def.chassisId, condition: 0.15, frameBendMm: 3.2, rustLevel: 0.85,
          odometerKm: 98_000, shift: "MT", source: "コンテナ", pricePaidYen: total, weekBought: d.week,
        }));
      } else if (tier === "T5") {
        if (lot.contents.includes("プロトタイプ")) {
          const c = makeCar({
            chassisId: "mazda_fd3s", condition: 0.5, frameBendMm: 0.2, rustLevel: 0.1,
            odometerKm: 1_200, shift: "MT", source: "コンテナ（伝説）", pricePaidYen: total, weekBought: d.week, stiffnessOverride: 1.15,
          });
          c.name = "行方不明の最高速プロトタイプ車体";
          d.cars.push(c);
        } else if (lot.contents.includes("ROM")) {
          d.parts.push(makePart({ defId: "ecu_v2", grade: "S", condition: 0.95, pricePaidYen: total, source: "コンテナ（伝説）", weekBought: d.week, nameOverride: "ワークス流出ROM（フルコンECU）" }));
          d.data.D5 = (d.data.D5 ?? 0) + 30;
        } else if (lot.contents.includes("タービン")) {
          d.parts.push(makePart({ defId: "turbo_assy", grade: "LEGENDARY", condition: 1, pricePaidYen: total, source: "コンテナ（伝説）", weekBought: d.week, nameOverride: "LEGENDARY級タービン（デッドストック）" }));
        } else if (lot.contents.includes("タイヤ")) {
          d.tire.stock.slick = (d.tire.stock.slick ?? 0) + 8;
        } else {
          d.materials.push("風洞用の実寸天秤（設備）");
          d.yen += 1_200_000;
        }
      } else if (tier === "T4") {
        if (lot.contents.includes("タービン")) d.parts.push(makePart({ defId: "turbo_assy", grade: "A", condition: 0.92, pricePaidYen: total, source: "コンテナ", weekBought: d.week }));
        else if (lot.contents.includes("ドライサンプ")) d.parts.push(makePart({ defId: "block_closed", grade: "A", condition: 0.9, pricePaidYen: total, source: "コンテナ", weekBought: d.week, nameOverride: "競技用ドライサンプ一式（クローズドデッキ）" }));
        else d.yen += 600_000;
      } else if (tier === "T2") {
        const pool = MARKET_PART_POOL.filter((p) => p.minAct <= act);
        for (let k = 0; k < 3; k++) {
          const def = pool[Math.floor(seededRoll(d.saveSeed, lot.id, `t2-${k}`) * pool.length) % pool.length]!;
          const cond = 0.4 + seededRoll(d.saveSeed, lot.id, `t2c-${k}`) * 0.35;
          d.parts.push(makePart({ defId: def.defId, grade: gradeFromCondition(cond, "A"), condition: cond, pricePaidYen: Math.round(total / 3), source: "コンテナ", weekBought: d.week }));
        }
      } else {
        d.yen += lot.valueYen; // T1=転売 / T0=負（産廃処理費）
      }
      pushLog(d, `W${d.week} コンテナ開封 [${tier}]: ${lot.contents}（支払 ${formatYen(total)} / 評価 ${formatYen(lot.valueYen)}）`);
    });
    toast.success(`コンテナ開封！ [${tier}] ${lot.contents}`);
  }, [state.yen, act, update]);

  /* ローカル */
  const buyLocal = useCallback((o: LocalOffer) => {
    if (o.cost.kind === "yen" && state.yen < o.cost.yen) { toast.error("資金不足"); return; }
    if (o.cost.kind === "data" && (state.data[o.cost.dataKind] ?? 0) < o.cost.amount) { toast.error(`DATA ${o.cost.dataKind} が足りない`); return; }
    if (o.cost.kind === "race" || o.cost.kind === "loan") { toast.info("フェーズ2（首都高）で解禁"); return; }
    update((d) => {
      if (o.cost.kind === "yen") d.yen -= o.cost.yen;
      if (o.cost.kind === "data") d.data[o.cost.dataKind] = (d.data[o.cost.dataKind] ?? 0) - o.cost.amount;
      d.purchased[o.id] = true;
      const sub = o.subject;
      if (sub.kind === "part") {
        d.parts.push(makePart({ defId: sub.defId, grade: o.maxGrade, condition: 0.95, pricePaidYen: 0, source: `地元 ${o.venueName}`, weekBought: d.week }));
      } else if (sub.kind === "blueprint") {
        d.parts.push(makePart({ defId: sub.defId, grade: "A", condition: 0.9, pricePaidYen: 0, source: "地元（図面から自製）", weekBought: d.week }));
      } else if (sub.kind === "chassis") {
        d.cars.push(makeCar({
          chassisId: sub.chassisId, condition: 0.7, frameBendMm: 0.5, rustLevel: 0.15,
          odometerKm: 60_000, shift: "MT", source: `地元 ${o.venueName}`, pricePaidYen: 0, weekBought: d.week,
        }));
      } else {
        d.parts.push(makePart({ defId: "ecu_v2", grade: "A", condition: 0.95, pricePaidYen: 0, source: "地元（流出ROM）", weekBought: d.week, nameOverride: "全日本GT 流出ROM（点火マップQ0.95）" }));
      }
      pushLog(d, `W${d.week} 地元取引成立: ${o.title}（${o.from}）`);
    });
    toast.success(`取引成立: ${o.title}`);
  }, [state.yen, state.data, update]);

  /* ── ガレージ ── */
  const setHero = useCallback((id: string) => update((d) => { d.heroCarId = id; }), [update]);

  const equip = useCallback((slot: PartSlot, partId: string | null) => {
    update((d) => {
      if (partId) d.equipped[slot] = partId;
      else delete d.equipped[slot];
    });
  }, [update]);

  const sellCar = useCallback((id: string) => {
    const car = state.cars.find((c) => c.id === id);
    if (!car) return;
    const v = carValueYen(car);
    update((d) => {
      d.cars = d.cars.filter((c) => c.id !== id);
      if (d.heroCarId === id) d.heroCarId = d.cars[0]?.id ?? null;
      if (d.restoreJob?.carId === id) d.restoreJob = null;
      d.yen += v;
      pushLog(d, `W${d.week} 売却: ${car.name} → ${formatYen(v)}`);
    });
    toast.success(`${car.name} を ${formatYen(v)} で売却`);
  }, [state.cars, update]);

  const sellPart = useCallback((id: string) => {
    const part = state.parts.find((p) => p.id === id);
    if (!part) return;
    const v = partValueYen(part);
    update((d) => {
      d.parts = d.parts.filter((p) => p.id !== id);
      (Object.keys(d.equipped) as PartSlot[]).forEach((s) => { if (d.equipped[s] === id) delete d.equipped[s]; });
      d.yen += v;
      pushLog(d, `W${d.week} 部品売却: ${part.name} → ${formatYen(v)}`);
    });
    toast.success(`${part.name} を ${formatYen(v)} で売却`);
  }, [state.parts, update]);

  const atToMt = useCallback((id: string) => {
    const car = state.cars.find((c) => c.id === id);
    if (!car || car.shift !== "AT") return;
    const res = atToMtSwap(0.9, hash32(state.saveSeed, car.id, "at2mt"));
    const cost = res.partsCostYen + res.certificationYen;
    if (state.yen < cost) { toast.error(`資金不足（必要 ${formatYen(cost)} = 部品+公認）`); return; }
    update((d) => {
      const c = d.cars.find((x) => x.id === id);
      if (!c) return;
      d.yen -= cost;
      c.shift = "MT";
      c.addedMassKg += res.massDeltaKg;
      c.driveabilityBonus += res.driveabilityDelta;
      pushLog(d, `W${d.week} AT→MT公認換装: ${c.name}（${formatYen(cost)} / −18kg）${res.electricalGremlin ? " — たまに電装が不調らしい" : ""}`);
    });
    toast.success(`AT→MT 換装完了（公認取得）: ${car.name}`);
  }, [state.cars, state.saveSeed, state.yen, update]);

  /* ── タイヤ・セットアップ ── */
  const buyTire = useCallback((compoundId: string, priceYen: number, fitNow: boolean) => {
    if (state.yen < priceYen) { toast.error("資金不足"); return; }
    update((d) => {
      d.yen -= priceYen;
      if (fitNow) { d.tire.compoundId = compoundId; d.tire.wear = 0; }
      else d.tire.stock[compoundId] = (d.tire.stock[compoundId] ?? 0) + 1;
    });
    toast.success(fitNow ? "新品タイヤを装着" : "タイヤを在庫へ追加");
  }, [state.yen, update]);

  const fitTire = useCallback((compoundId: string) => {
    if ((state.tire.stock[compoundId] ?? 0) <= 0) { toast.error("在庫がない"); return; }
    update((d) => {
      d.tire.stock[compoundId] = (d.tire.stock[compoundId] ?? 0) - 1;
      d.tire.compoundId = compoundId;
      d.tire.wear = 0;
    });
  }, [state.tire.stock, update]);

  const setSetup = useCallback((p: Partial<GameState["setup"]>) => {
    update((d) => { d.setup = { ...d.setup, ...p }; });
  }, [update]);

  /* ── レストア ── */
  const startRestore = useCallback((carId: string, plan: RestorePlan) => {
    if (state.restoreJob) { toast.error("別の個体がレストアドックに入庫中"); return; }
    const car = state.cars.find((c) => c.id === carId);
    if (!car) return;
    const subject = subjectFromCar(car, state.saveSeed);
    const seed = restoreSeedFor(state.saveSeed, carId, state.week);
    update((d) => {
      d.restoreJob = { carId, subject, plan, progress: initRestore(subject, plan), seed, chargedYen: 0 };
      pushLog(d, `W${d.week} レストア開始: ${car.name}（サビ ${(car.rustLevel * 100).toFixed(0)}% / 歪み ${car.frameBendMm.toFixed(1)}mm）`);
    });
    toast.success("レストアドックへ入庫");
  }, [state.restoreJob, state.cars, state.saveSeed, state.week, update]);

  const advanceRestore = useCallback((): RestoreResult | null => {
    const job = state.restoreJob;
    if (!job) return null;
    const next = completeState(job.progress, job.subject, job.plan, job.seed);
    const delta = next.costYen - job.progress.costYen;
    if (state.yen < delta) {
      toast.error(`資金不足で工程を進められない（必要 ${formatYen(delta)}）`);
      return null;
    }
    const done = next.state === "DONE";
    const res = done ? finalizeRestore(next, job.plan) : null;
    update((d) => {
      if (!d.restoreJob) return;
      d.yen -= delta;
      d.restoreJob.progress = next;
      d.restoreJob.chargedYen += delta;
      if (res) {
        const c = d.cars.find((x) => x.id === job.carId);
        if (c) {
          c.stiffnessFactor = res.stiffnessFactor;
          c.frameBendMm = res.residualBendMm;
          c.rustLevel = res.residualRust;
          c.condition = 1;
          c.restored = true;
          c.immobile = false;
          c.addedMassKg += res.addedMassKg;
          c.driveabilityBonus = res.driveabilityBonus;
        }
        d.rep = Math.min(100, d.rep + res.repGain);
        if (!d.hasCmm) d.hasCmm = true;
        pushLog(d, `W${d.week} レストア完成: ${c?.name ?? ""} 剛性 ×${res.stiffnessFactor.toFixed(2)}（総費用 ${formatYen(res.totalCostYen)}）`);
        d.restoreJob = null;
      }
    });
    if (res) toast.success(`レストア完成！剛性 ×${res.stiffnessFactor.toFixed(2)}（新車=1.00 超え）`);
    return res;
  }, [state.restoreJob, state.yen, update]);

  const cancelRestore = useCallback(() => {
    update((d) => {
      if (d.restoreJob) pushLog(d, `W${d.week} レストアを中止（支払済 ${formatYen(d.restoreJob.chargedYen)}）`);
      d.restoreJob = null;
    });
  }, [update]);

  /* ── 筑波 ── */
  const attackTsukuba = useCallback((): AttackOutcome | null => {
    const car = heroOf(state);
    if (!car) { toast.error("走らせる車がない（ガレージでヒーロー車を指定）"); return null; }
    if (car.immobile) { toast.error("走行不能 — レストアが必要"); return null; }
    if (state.yen < TSUKUBA_ENTRY_YEN) { toast.error(`参加費 ${formatYen(TSUKUBA_ENTRY_YEN)} が足りない`); return null; }
    const built = buildVehicleSpec(car, equippedPartsOf(state), state.tire, state.setup);
    const result = lapOf(built, conditionsFor(state, isRainyWeek(state.saveSeed, state.week)));
    const est = result.estimatedLapTimeS;
    const official = state.officialDoneWeek !== state.week;
    const prize = prizeForLap(est);
    const gates = ACT_GATES.filter((g) => !state.clearedGates.includes(g.act) && est <= g.gateS);
    const yenPrize = (official ? prize.yen : Math.round(prize.yen * 0.2)) + gates.length * 300_000;
    const repGain = (official ? prize.rep : 0) + gates.length * 5;
    const d5Gain = official ? 12 + Math.max(0, Math.min(30, Math.round(80 - est))) : 6;
    const newBest = state.bestLapS === null || est < state.bestLapS;
    update((d) => {
      d.yen += yenPrize - TSUKUBA_ENTRY_YEN;
      d.rep = Math.min(100, d.rep + repGain);
      d.data.D5 = (d.data.D5 ?? 0) + d5Gain;
      if (official) d.officialDoneWeek = d.week;
      d.tire.wear = Math.min(1, d.tire.wear + 0.22);
      if (newBest) d.bestLapS = est;
      for (const g of gates) d.clearedGates.push(g.act);
      d.history = [{
        week: d.week, carName: car.name, lapS: est, idealS: result.idealLapTimeS,
        prizeYen: yenPrize, repGain, official,
        gateClearedAct: gates.length > 0 ? Math.max(...gates.map((g) => g.act)) : null,
      }, ...d.history].slice(0, 40);
      d.lastResultWeek = d.week;
      pushLog(d, `W${d.week} 筑波${official ? "公式計測" : "スポーツ走行"}: ${formatLapTime(est)}（賞金 ${formatYen(yenPrize)} / REP+${repGain}）${gates.length ? ` ★Actゲート ${gates.map((g) => g.act).join(",")} 突破` : ""}`);
    });
    toast.success(`${official ? "公式計測" : "スポーツ走行"}: ${formatLapTime(est)} — 賞金 ${formatYen(yenPrize)}`);
    return { result, built, official, yenPrize, repGain, d5Gain, gateActs: gates.map((g) => g.act), newBest };
  }, [state, update]);

  /* ── 週送り ── */
  const advanceWeek = useCallback(() => {
    update((d) => {
      d.week += 1;
      d.yen -= WEEKLY_OVERHEAD_YEN;
      d.phantomDrought += 1;
      const arriving = d.deliveries.filter((x) => x.arrivesWeek <= d.week);
      d.deliveries = d.deliveries.filter((x) => x.arrivesWeek > d.week);
      for (const a of arriving) {
        if (a.car) {
          d.cars.push(a.car);
          if (!d.heroCarId) d.heroCarId = a.car.id;
          pushLog(d, `W${d.week} 通関到着: ${a.car.name}（ガレージへ）`);
        } else if (a.part) {
          d.parts.push(a.part);
          pushLog(d, `W${d.week} 通関到着: ${a.part.name} [${a.part.grade}]`);
        } else if (a.materialLabel) {
          if (a.materialLabel.startsWith("CMM:")) {
            d.hasCmm = true;
            d.materials.push(a.materialLabel.slice(4));
            pushLog(d, `W${d.week} 自社計測ライン稼働 — 鑑定Lv2（±0.03・無料）が解禁`);
          } else {
            d.materials.push(a.materialLabel);
            pushLog(d, `W${d.week} 通関到着: 素材 ${a.materialLabel}`);
          }
        }
      }
      // 市場の品揃えは週で全入替。前週の購入・鑑定記録は捨てる
      d.purchased = {};
      d.inspected = {};
      d.binState = {};
      pushLog(d, `W${d.week} 開始（工場維持費 −${formatYen(WEEKLY_OVERHEAD_YEN)} / 到着品 ${arriving.length} 点）`);
      if (d.yen < 0) pushLog(d, "⚠ 資金が赤字だ。筑波の賞金か、不用品の売却で立て直そう");
    });
    toast.info(`Week ${state.week + 1} — 市場の品揃えが入れ替わった`);
  }, [update, state.week]);

  const reset = useCallback(() => {
    setState(initialState());
    toast.info("新規工場を開業した");
  }, []);

  return {
    state, act: act as Act, rainy, market, hero,
    inspectListing, bidAa, bidNetAuc, buyMiracle, pullYard, pullBin, buyImport,
    bidContainer, buyLocal, setHero, equip, sellCar, sellPart, atToMt,
    buyTire, fitTire, setSetup, startRestore, advanceRestore, cancelRestore,
    attackTsukuba, advanceWeek, reset,
  };
}

export type Game = ReturnType<typeof useGame>;
