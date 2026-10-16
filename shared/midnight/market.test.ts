/**
 * 調達市場（4市場）の回帰テスト — 設計書 10 / 08 §11 のバランス表を機械検証する。
 *   pnpm vitest run shared/midnight
 *
 * ここで守っているのは「乱数が理不尽にならないための条件」である：
 * 決定論であること、床と天井があること、鑑定で分散が縮むこと、
 * S/BP が市場に流れないこと、ハズレが素材として戻ってくること。
 */

import { describe, expect, it } from "vitest";
import {
  type AuctionListing,
  type MarketContext,
  type YardLot,
  MARKET_CHASSIS_POOL,
  MARKET_PART_POOL,
  PHANTOM_PITY_MAX,
  YARD_LOTS_MAX,
  YARD_LOTS_MIN,
  chassisPenalty,
  generateWeeklyMarket,
  hash32,
  inspect,
  marketIndexAt,
  mulberry32,
  phantomProbability,
  planBids,
  resolveAuction,
  salvage,
  slotIndexAt,
  yardExpectedValueYen,
} from "./market";

const SEED = 20261016;

function ctx(over: Partial<MarketContext> = {}): MarketContext {
  return { saveSeed: SEED, week: 1, act: 3, reputation: 0, heat: 0, phantomDrought: 0, ...over };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
}

function weeks(n: number, over: Partial<MarketContext> = {}): ReturnType<typeof generateWeeklyMarket>[] {
  return Array.from({ length: n }, (_, w) => generateWeeklyMarket(ctx({ week: w + 1, ...over })));
}

/* ───────────────────────── 決定論 ───────────────────────── */

describe("決定論", () => {
  it("同じ文脈なら市場は完全に同一（リロードしても品揃えは変わらない）", () => {
    const a = generateWeeklyMarket(ctx({ week: 12, reputation: 60 }));
    const b = generateWeeklyMarket(ctx({ week: 12, reputation: 60 }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("セーブシードが違えば品揃えは変わる", () => {
    const a = generateWeeklyMarket(ctx({ week: 12 }));
    const b = generateWeeklyMarket({ ...ctx({ week: 12 }), saveSeed: SEED + 1 });
    expect(JSON.stringify(a.yard)).not.toBe(JSON.stringify(b.yard));
  });

  it("mulberry32 と hash32 が再現可能", () => {
    expect(hash32("a", 1)).toBe(hash32("a", 1));
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    for (let i = 0; i < 16; i++) expect(r1()).toBe(r2());
  });
});

/* ───────────────────────── 相場 ───────────────────────── */

describe("相場指数", () => {
  it("0.82〜1.18 に収まり、週あたりの変動が 0.08 を超えない（相場が暴れない）", () => {
    let prev = marketIndexAt(SEED, 0);
    for (let w = 1; w <= 400; w++) {
      const v = marketIndexAt(SEED, w);
      expect(v).toBeGreaterThanOrEqual(0.82 - 1e-9);
      expect(v).toBeLessThanOrEqual(1.18 + 1e-9);
      expect(Math.abs(v - prev)).toBeLessThanOrEqual(0.08);
      prev = v;
    }
  });

  it("スロット別のブーム補正は 0.7〜1.3 に収まる", () => {
    for (const p of MARKET_PART_POOL) {
      for (let w = 0; w < 60; w++) {
        const v = slotIndexAt(SEED, w, p.slot);
        expect(v).toBeGreaterThanOrEqual(0.7);
        expect(v).toBeLessThanOrEqual(1.3);
      }
    }
  });
});

/* ───────────────────────── ヤード ───────────────────────── */

describe("ヤード（状態のガチャ）", () => {
  it("毎週 8〜16 ロットが並ぶ", () => {
    for (const m of weeks(60)) {
      expect(m.yard.length).toBeGreaterThanOrEqual(YARD_LOTS_MIN);
      expect(m.yard.length).toBeLessThanOrEqual(YARD_LOTS_MAX);
    }
  });

  it("【床】どの週にも必ず「使える個体」（状態0.6以上）が1つ以上ある", () => {
    for (const m of weeks(300)) {
      expect(Math.max(...m.yard.map((l) => l.trueCondition))).toBeGreaterThanOrEqual(0.6);
    }
  });

  it("状態の平均は 0.40〜0.53（＝半分以上はハズレ）", () => {
    const all = weeks(300).flatMap((m) => m.yard.map((l) => l.trueCondition));
    const mean = all.reduce((a, b) => a + b, 0) / all.length;
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(0.53);
    expect(Math.min(...all)).toBeGreaterThanOrEqual(0.05);
    expect(Math.max(...all)).toBeLessThanOrEqual(0.95);
  });

  it("鑑定は真値を変えず、表示帯だけを狭める（±0.25 → ±0.03）", () => {
    const lot = weeks(1)[0]!.yard[0]!;
    expect(lot.shownConditionMax - lot.shownConditionMin).toBeGreaterThan(0.2);
    const l1 = inspect(lot, 1);
    const l2 = inspect(lot, 2);
    expect(l1.trueCondition).toBe(lot.trueCondition);
    expect(l2.trueCondition).toBe(lot.trueCondition);
    expect(l1.shownConditionMax - l1.shownConditionMin).toBeLessThanOrEqual(0.2 + 1e-9);
    expect(l2.shownConditionMax - l2.shownConditionMin).toBeLessThanOrEqual(0.06 + 1e-9);
    expect(l2.trueCondition).toBeGreaterThanOrEqual(l2.shownConditionMin);
    expect(l2.trueCondition).toBeLessThanOrEqual(l2.shownConditionMax);
  });

  it("瑕疵は未鑑定では見えず、計測ライン（レベル2）で全部開示される", () => {
    const flawed = weeks(40)
      .flatMap((m) => m.yard)
      .find((l) => l.hiddenFlaws.length >= 2)!;
    expect(flawed.shownFlaws).toHaveLength(0);
    expect(inspect(flawed, 2).shownFlaws.sort()).toEqual([...flawed.hiddenFlaws].sort());
  });

  it("解体の収率は状態に単調増加し、割れ・贋作は部品として使えない", () => {
    const lots = weeks(80).flatMap((m) => m.yard);
    const good = lots.filter((l) => l.trueCondition > 0.8);
    const bad = lots.filter((l) => l.trueCondition < 0.25);
    const rate = (xs: YardLot[]): number => median(xs.map((l) => salvage(l).materialG / l.massG));
    expect(rate(good)).toBeGreaterThan(rate(bad));
    for (const l of lots) {
      if (l.hiddenFlaws.includes("crack") || l.hiddenFlaws.includes("counterfeit")) {
        expect(salvage(l).usablePart).toBe(false);
      }
      expect(salvage(l).data.D2).toBeGreaterThan(0);
    }
  });

  it("期待値は提示価格と同じ桁に収まる（＝一方的に損も得もしない賭けになっている）", () => {
    const lots = weeks(120).flatMap((m) => m.yard);
    const ratio = median(lots.map((l) => yardExpectedValueYen(l) / l.askYen));
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(4);
  });
});

/* ───────────────────────── オークション ───────────────────────── */

describe("深夜オークション（出現と競合のガチャ）", () => {
  it("出品数は 10 + 2×Act（Act が上がるほど市場が厚くなる）", () => {
    for (const act of [0, 3, 6] as const) {
      expect(generateWeeklyMarket(ctx({ act })).auction).toHaveLength(10 + 2 * act);
    }
  });

  it("レアリティ分布は 並70% / 希少25% / 幻5%（±4pt）", () => {
    const all = weeks(400).flatMap((m) => m.auction);
    const p = (r: AuctionListing["rarity"]): number => (all.filter((l) => l.rarity === r).length / all.length) * 100;
    expect(p("common")).toBeGreaterThan(66);
    expect(p("common")).toBeLessThan(74);
    expect(p("scarce")).toBeGreaterThan(21);
    expect(p("scarce")).toBeLessThan(29);
    expect(p("phantom")).toBeGreaterThan(3);
    expect(p("phantom")).toBeLessThan(7);
  });

  it("【天井】幻級を逃し続けると出現率が上がり、15% で頭打ちになる", () => {
    let prev = phantomProbability(0);
    for (let d = 1; d <= 30; d++) {
      const p = phantomProbability(d);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    expect(phantomProbability(0)).toBeCloseTo(0.05, 6);
    expect(phantomProbability(100)).toBe(PHANTOM_PITY_MAX);
    const dry = weeks(200, { phantomDrought: 20 }).flatMap((m) => m.auction);
    const fresh = weeks(200, { phantomDrought: 0 }).flatMap((m) => m.auction);
    const rate = (xs: AuctionListing[]): number => xs.filter((l) => l.rarity === "phantom").length / xs.length;
    expect(rate(dry)).toBeGreaterThan(rate(fresh) * 1.8);
  });

  it("二位価格方式：上限額を正直に入れても、払うのは競合＋1%だけ", () => {
    const l = weeks(1)[0]!.auction[0]!;
    const honest = resolveAuction(l, l.competitorTopYen * 10);
    expect(honest.won).toBe(true);
    expect(honest.paidYen).toBeLessThanOrEqual(Math.max(l.startYen, l.competitorTopYen * 1.01) + 100);
    expect(resolveAuction(l, l.competitorTopYen).won).toBe(false);
    expect(resolveAuction(l, l.competitorTopYen).paidYen).toBe(0);
  });

  it("入札額が高いほど勝率が単調に上がる", () => {
    const all = weeks(60).flatMap((m) => m.auction);
    const winRate = (mult: number): number => all.filter((l) => resolveAuction(l, l.fairYen * mult).won).length / all.length;
    const rates = [0.5, 0.8, 1.0, 1.3, 1.6].map(winRate);
    for (let i = 1; i < rates.length; i++) expect(rates[i]!).toBeGreaterThanOrEqual(rates[i - 1]!);
    expect(rates[0]!).toBeLessThan(0.2);
    expect(rates[4]!).toBeGreaterThan(0.85);
  });

  it("贋作率は出品者評価で決まる（★5 は 2% 未満、★1 は 8〜22%）", () => {
    const all = weeks(400).flatMap((m) => m.auction);
    const fakeRate = (stars: number): number => {
      const xs = all.filter((l) => l.sellerStars === stars);
      return xs.filter((l) => l.isFake).length / xs.length;
    };
    expect(fakeRate(5)).toBeLessThan(0.02);
    expect(fakeRate(1)).toBeGreaterThan(0.08);
    expect(fakeRate(1)).toBeLessThan(0.22);
  });
});

/* ───────────────────────── 市場間の関係 ───────────────────────── */

describe("4市場の役割分担", () => {
  it("価格の序列：ヤード ＜ オークション ＜ カタログ", () => {
    const ms = weeks(120);
    const yardRatio = median(ms.flatMap((m) => m.yard.map((l) => l.askYen / l.nominalYen)));
    const aucRatio = median(ms.flatMap((m) => m.auction.filter((l) => l.rarity === "common").map((l) => l.fairYen / l.nominalYen)));
    const catRatio = median(ms.flatMap((m) => m.catalog.filter((c) => !c.madeToOrder).map((c) => c.priceYen / MARKET_PART_POOL.find((p) => p.defId === c.defId)!.nominalYen)));
    expect(yardRatio).toBeLessThan(aucRatio);
    expect(aucRatio).toBeLessThan(catRatio);
    expect(catRatio).toBeGreaterThan(0.9);
    expect(catRatio).toBeLessThan(1.1);
  });

  it("【工場を守る】S・BP 等級は買えない。BP はコネクションの一点物のみ", () => {
    const ms = weeks(200, { reputation: 100 });
    for (const m of ms) {
      for (const c of m.catalog) expect(["C", "B", "A"]).toContain(c.maxGrade);
      for (const a of m.auction) expect(["C", "B", "A", "S"]).toContain(a.maxGrade);
    }
    const conn = ms.flatMap((m) => m.connection);
    expect(conn.some((o) => o.maxGrade === "BP")).toBe(true);
    expect(ms.flatMap((m) => m.auction).some((a) => a.maxGrade === "BP")).toBe(false);
  });

  it("カタログは乱数に依らず常に全品が買える（金で確実性を買える）", () => {
    const sizes = new Set(weeks(50).map((m) => m.catalog.length));
    expect(sizes.size).toBe(1);
    for (const m of weeks(5)) for (const c of m.catalog) expect(c.priceYen).toBeGreaterThan(0);
  });
});

/* ───────────────────────── コネクション ───────────────────────── */

describe("コネクション（評判で開く市場）", () => {
  it("評判が足りなければ 1件も出ない", () => {
    for (const m of weeks(80, { reputation: 0 })) expect(m.connection).toHaveLength(0);
    for (const m of weeks(80, { reputation: 29 })) expect(m.connection).toHaveLength(0);
  });

  it("評判が高いほど提示が増える", () => {
    const count = (rep: number): number => weeks(120, { reputation: rep }).reduce((a, m) => a + m.connection.length, 0);
    expect(count(30)).toBeGreaterThan(0);
    expect(count(100)).toBeGreaterThan(count(30));
  });

  it("ヒートが高い週は裏ルートが店を閉める", () => {
    for (const m of weeks(40, { reputation: 100, heat: 85 })) expect(m.connection).toHaveLength(0);
  });

  it("対価は金銭だけではない（データ・勝負・貸与）", () => {
    const kinds = new Set(weeks(200, { reputation: 100 }).flatMap((m) => m.connection.map((o) => o.cost.kind)));
    expect(kinds.has("yen")).toBe(true);
    expect(kinds.has("data")).toBe(true);
    expect(kinds.has("race")).toBe(true);
    expect(kinds.has("loan")).toBe(true);
  });
});

/* ───────────────────────── ベース車 ───────────────────────── */

describe("ベース車の入手", () => {
  it("カタログの認定中古は無事故・無歪み・ナンバー付き", () => {
    for (const car of weeks(80).flatMap((m) => m.baseCars.filter((c) => c.market === "catalog"))) {
      expect(car.frameBendMm).toBe(0);
      expect(car.accidentHistory).toBe(false);
      expect(car.hasPlate).toBe(true);
      expect(car.odometerKm).toBeLessThanOrEqual(40_000);
    }
  });

  it("ヤードには矯正不能（歪み>6mm）の地雷が実際に存在する", () => {
    const yardCars = weeks(80).flatMap((m) => m.baseCars.filter((c) => c.market === "yard"));
    expect(yardCars.some((c) => chassisPenalty(c).writeOff)).toBe(true);
    expect(yardCars.every((c) => c.rustLevel >= 0.25)).toBe(true);
  });

  it("オークションには「当たり」（ワンオーナー・実走2万km台）が出る", () => {
    const cars = weeks(120).flatMap((m) => m.baseCars.filter((c) => c.market === "auction"));
    const hit = cars.filter((c) => c.oneOwner && c.odometerKm < 40_000 && c.frameBendMm <= 1);
    expect(hit.length).toBeGreaterThan(0);
    expect(hit.length / cars.length).toBeLessThan(0.25);
  });

  it("価格の序列：ヤード ＜ オークション ＜ カタログ", () => {
    const base = (id: string): number => MARKET_CHASSIS_POOL.find((c) => c.chassisId === id)!.newPriceYen;
    const ratio = (market: string): number =>
      median(weeks(120).flatMap((m) => m.baseCars.filter((c) => c.market === market).map((c) => c.askYen / base(c.chassisId))));
    expect(ratio("yard")).toBeLessThan(ratio("auction"));
    expect(ratio("auction")).toBeLessThan(ratio("catalog"));
  });

  it("車体の傷みは剛性と修復費に効く（部品ではなく車体が性能上限を決める）", () => {
    const clean = chassisPenalty({ frameBendMm: 0, rustLevel: 0 });
    expect(clean.stiffnessFactor).toBe(1);
    expect(clean.repairYen).toBe(0);
    const bent = chassisPenalty({ frameBendMm: 4, rustLevel: 0.5 });
    expect(bent.stiffnessFactor).toBeLessThan(0.85);
    expect(bent.repairYen).toBeGreaterThan(200_000);
    expect(chassisPenalty({ frameBendMm: 7, rustLevel: 0.2 }).writeOff).toBe(true);
  });
});

/* ───────────────────────── 自動化 ───────────────────────── */

describe("入札エージェント（Act4）", () => {
  const listings = generateWeeklyMarket(ctx({ act: 6 })).auction;

  it("予算を超えない", () => {
    const plan = planBids(listings, [{ maxFairMultiple: 1.1, minCondition: 0, minSellerStars: 1, maxWins: 99 }], 500_000);
    expect(plan.reduce((a, d) => a + d.bidYen, 0)).toBeLessThanOrEqual(500_000);
  });

  it("maxWins と条件（状態・出品者評価・スロット）を守る", () => {
    const plan = planBids(listings, [{ slot: "turbo", maxFairMultiple: 1.2, minCondition: 0.5, minSellerStars: 4, maxWins: 2 }], 99_000_000);
    expect(plan.length).toBeLessThanOrEqual(2);
    for (const d of plan) {
      const l = listings.find((x) => x.id === d.listingId)!;
      expect(l.slot).toBe("turbo");
      expect(l.sellerStars).toBeGreaterThanOrEqual(4);
      expect(l.shownConditionMax).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("相場に対して割安な出品から順に拾う", () => {
    const plan = planBids(listings, [{ maxFairMultiple: 1.0, minCondition: 0, minSellerStars: 1, maxWins: 3 }], 99_000_000);
    const ratios = plan.map((d) => {
      const l = listings.find((x) => x.id === d.listingId)!;
      return l.fairYen / l.nominalYen;
    });
    for (let i = 1; i < ratios.length; i++) expect(ratios[i]!).toBeGreaterThanOrEqual(ratios[i - 1]!);
  });
});

/* ───────────────────────── 性能 ───────────────────────── */

describe("性能", () => {
  it("300週ぶんの市場生成が 1.5 秒以内（週またぎの処理が重くならない）", () => {
    const t0 = Date.now();
    weeks(300, { reputation: 100, act: 6 });
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});
