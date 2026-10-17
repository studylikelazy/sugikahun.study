/**
 * 4大市場の回帰テスト — `docs/midnight-automation/spec/S3_four_markets_tables.md`
 *
 * 守りたい性質：
 *  - **決定論**：同じシード・同じ週なら、何度生成しても完全に同じ在庫が並ぶ。
 *  - **ランダム性の7原則**：床（必ず使える個体）／天井（ピティ）／鑑定で分散が縮む／
 *    期待値を隠さない／ハズレが素材になる／時間が解決する。
 *  - **工場の存在意義**：S / LEGENDARY は市場に流れない（ローカル市場の一点物のみ例外）。
 *  - AA・ネトオクは二位価格、コンテナだけ一位価格。
 */
import { describe, expect, it } from "vitest";
import {
  AA_SCORES,
  AA_SCORE_WEIGHTS,
  CONTAINER_TIERS,
  DOMESTIC_CHANNELS,
  MARKET_CHASSIS_POOL,
  MARKET_IDS,
  MARKET_PART_POOL,
  TIER_WEIGHTS,
  type ContainerLot,
  type MarketContext,
  chassisPenalty,
  containerPriorEvYen,
  effectiveMu,
  fxAt,
  generateWeeklyMarket,
  hash32,
  inspect,
  marketIndexAt,
  mulberry32,
  phantomProbability,
  planBids,
  posteriorTier,
  resolveAuction,
  resolveContainerBid,
  salvage,
  weightedPick,
  yardExpectedValueYen,
} from "./market";

const SEED = 20260117;

function ctx(over: Partial<MarketContext> = {}): MarketContext {
  return { saveSeed: SEED, week: 12, act: 4, reputation: 55, heat: 20, phantomDrought: 0, ...over };
}

describe("決定論", () => {
  it("同じ ctx なら完全に同じ在庫が生成される", () => {
    const a = generateWeeklyMarket(ctx());
    const b = generateWeeklyMarket(ctx());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("週が変われば在庫も変わる", () => {
    const a = generateWeeklyMarket(ctx({ week: 12 }));
    const b = generateWeeklyMarket(ctx({ week: 13 }));
    expect(JSON.stringify(a.domestic.aa)).not.toBe(JSON.stringify(b.domestic.aa));
  });

  it("セーブシードが変われば在庫も変わる", () => {
    const a = generateWeeklyMarket(ctx({ saveSeed: 1 }));
    const b = generateWeeklyMarket(ctx({ saveSeed: 2 }));
    expect(JSON.stringify(a.domestic.aa)).not.toBe(JSON.stringify(b.domestic.aa));
  });

  it("hash32 / mulberry32 は安定した値を返す", () => {
    expect(hash32("a", 1)).toBe(hash32("a", 1));
    expect(mulberry32(42)()).toBe(mulberry32(42)());
    expect(mulberry32(42)()).not.toBe(mulberry32(43)());
  });
});

describe("市場の構成", () => {
  it("4大市場 ＋ 国内4チャネルが定義されている", () => {
    expect([...MARKET_IDS]).toEqual(["domestic", "import", "container", "local"]);
    expect([...DOMESTIC_CHANNELS]).toEqual(["aa", "netauc", "yard", "bluebin"]);
  });

  it("実在車名の対応が設計どおり（S30Z / BNR32 / JZA80）", () => {
    const refs = Object.fromEntries(MARKET_CHASSIS_POOL.map((c) => [c.chassisId, c.realWorldRef]));
    expect(refs["tachibana_s16"]).toBe("S30Z");
    expect(refs["nansei_gt33r"]).toBe("BNR32");
    expect(refs["suganuma_soara"]).toBe("JZA80");
  });

  it("部品プール・車体プールが Act でゲートされている", () => {
    const early = generateWeeklyMarket(ctx({ act: 0 }));
    const ids = new Set(early.domestic.netauc.map((l) => l.defId));
    for (const id of ids) {
      const def = MARKET_PART_POOL.find((p) => p.defId === id)!;
      expect(def.minAct).toBeLessThanOrEqual(0);
    }
  });
});

describe("相場", () => {
  it("相場指数は 0.82〜1.18 に収まり、週ごとに滑らかに動く", () => {
    let prev = marketIndexAt(SEED, 0);
    for (let w = 0; w <= 120; w++) {
      const v = marketIndexAt(SEED, w);
      expect(v).toBeGreaterThanOrEqual(0.82 - 1e-9);
      expect(v).toBeLessThanOrEqual(1.18 + 1e-9);
      expect(Math.abs(v - prev)).toBeLessThan(0.09);
      prev = v;
    }
  });

  it("為替は輸入市場専用の独立系列で ±6%", () => {
    for (let w = 0; w < 60; w++) {
      const fx = fxAt(SEED, w);
      expect(fx).toBeGreaterThanOrEqual(0.94 - 1e-9);
      expect(fx).toBeLessThanOrEqual(1.06 + 1e-9);
    }
  });
});

describe("国内中古市場：AA（業者オークション）", () => {
  it("評価点の分布が指定どおりに実現する（4点台が最多）", () => {
    const counts = new Map<string, number>();
    for (let w = 0; w < 200; w++) {
      for (const lot of generateWeeklyMarket(ctx({ week: w })).domestic.aa) {
        counts.set(lot.sheet.score, (counts.get(lot.sheet.score) ?? 0) + 1);
      }
    }
    let total = 0;
    for (const v of counts.values()) total += v;
    const share = (s: string): number => (counts.get(s) ?? 0) / total;
    expect(share("4")).toBeGreaterThan(0.2);
    expect(share("4")).toBeLessThan(0.36);
    // 修復歴（R / RA）は合計 15% 前後
    expect(share("R") + share("RA")).toBeGreaterThan(0.1);
    expect(share("R") + share("RA")).toBeLessThan(0.2);
    expect(share("S")).toBeLessThan(0.02);
  });

  it("評価点が高いほど真の状態も良い（検査員メモを均した期待値）", () => {
    const byScore = new Map<string, { sum: number; n: number }>();
    for (let w = 0; w < 150; w++) {
      for (const lot of generateWeeklyMarket(ctx({ week: w })).domestic.aa) {
        const e = byScore.get(lot.sheet.score) ?? { sum: 0, n: 0 };
        e.sum += lot.trueCondition;
        e.n += 1;
        byScore.set(lot.sheet.score, e);
      }
    }
    const avg = (s: string): number => {
      const e = byScore.get(s)!;
      return e.sum / e.n;
    };
    expect(avg("5")).toBeGreaterThan(avg("3"));
    expect(avg("4")).toBeGreaterThan(avg("2"));
  });

  it("修復歴ありは歪みが大きく、フェア価格が下がる", () => {
    let repaired = 0;
    let clean = 0;
    let rn = 0;
    let cn = 0;
    for (let w = 0; w < 80; w++) {
      for (const lot of generateWeeklyMarket(ctx({ week: w })).domestic.aa) {
        if (lot.sheet.repaired) { repaired += lot.frameBendMm; rn++; } else { clean += lot.frameBendMm; cn++; }
      }
    }
    expect(repaired / rn).toBeGreaterThan(clean / cn + 0.5);
  });

  it("「メーター交換」が付いた個体は真の走行距離が表示値より大きい", () => {
    let checked = 0;
    for (let w = 0; w < 60 && checked < 5; w++) {
      for (const lot of generateWeeklyMarket(ctx({ week: w })).domestic.aa) {
        if (lot.sheet.odoStatus === "replaced") {
          expect(lot.realOdometerKm).toBeGreaterThan(lot.sheet.odometerKm);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("出品票だけでは状態が ±0.25 でしか分からない", () => {
    const lot = generateWeeklyMarket(ctx()).domestic.aa[0]!;
    expect(lot.inspectionLevel).toBe(0);
    expect(lot.shownConditionMax - lot.shownConditionMin).toBeGreaterThan(0.3);
  });

  it("落札後の諸費用（手数料・成約料・陸送・名変）が必ず発生する", () => {
    for (const lot of generateWeeklyMarket(ctx()).domestic.aa) {
      expect(lot.feesYen).toBeGreaterThan(50_000);
      expect(lot.arrivesInDays).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("国内中古市場：ネトオク / ヤード / 青カゴ", () => {
  it("NC/NR がおおむね 2/3 を占める", () => {
    let nc = 0;
    let n = 0;
    for (let w = 0; w < 60; w++) {
      for (const l of generateWeeklyMarket(ctx({ week: w })).domestic.netauc) {
        if (l.noClaimNoReturn) nc++;
        n++;
      }
    }
    expect(nc / n).toBeGreaterThan(0.58);
    expect(nc / n).toBeLessThan(0.78);
  });

  it("出品者評価が低いほど贋作率が高い", () => {
    const fake = new Map<number, { f: number; n: number }>();
    for (let w = 0; w < 120; w++) {
      for (const l of generateWeeklyMarket(ctx({ week: w })).domestic.netauc) {
        const e = fake.get(l.sellerStars) ?? { f: 0, n: 0 };
        if (l.isFake) e.f++;
        e.n++;
        fake.set(l.sellerStars, e);
      }
    }
    const rate = (s: number): number => {
      const e = fake.get(s)!;
      return e.f / e.n;
    };
    expect(rate(1)).toBeGreaterThan(rate(5));
  });

  it("奇跡枠は稀にしか出ないが、出れば AT のドノーマル低走行である", () => {
    let found = 0;
    for (let w = 0; w < 400; w++) {
      for (const m of generateWeeklyMarket(ctx({ week: w })).domestic.miracle) {
        expect(m.shift).toBe("AT");
        expect(m.odometerKm).toBeLessThan(30_000);
        expect(m.swapCandidate).toBe(true);
        found++;
      }
    }
    expect(found).toBeGreaterThan(0);
    expect(found).toBeLessThan(80);
  });

  it("【床】解体ヤードには毎週かならず「使える個体」が 1 つは並ぶ", () => {
    for (let w = 0; w < 60; w++) {
      const lots = generateWeeklyMarket(ctx({ week: w })).domestic.yard;
      expect(lots.some((l) => l.trueCondition >= 0.6)).toBe(true);
    }
  });

  it("解体ヤードは4チャネル中で最も状態が悪い（平均 0.45 未満）", () => {
    let sum = 0;
    let n = 0;
    for (let w = 0; w < 60; w++) {
      for (const l of generateWeeklyMarket(ctx({ week: w })).domestic.yard) {
        sum += l.trueCondition;
        n++;
      }
    }
    expect(sum / n).toBeLessThan(0.48);
  });

  it("雨の週はもぎ取り時間が伸び、破損確率が上がる", () => {
    const dry = generateWeeklyMarket(ctx({ rainy: false })).domestic.yard[0]!;
    const wet = generateWeeklyMarket(ctx({ rainy: true })).domestic.yard[0]!;
    expect(wet.pullMinutes).toBeGreaterThanOrEqual(dry.pullMinutes);
  });

  it("青カゴは3段階で、高いカゴほど当たりが多い", () => {
    const bins = generateWeeklyMarket(ctx()).domestic.bluebin;
    expect(bins).toHaveLength(3);
    expect(bins[2]!.usableChance).toBeGreaterThan(bins[0]!.usableChance);
    expect(bins[2]!.rareChance).toBeGreaterThan(bins[0]!.rareChance);
    // まとめ買いは単価より安い
    expect(bins[0]!.bulkYen).toBeLessThan(bins[0]!.unitYen * bins[0]!.count);
  });
});

describe("輸入車市場", () => {
  it("Act2 未満では開かない。隔週でしか入荷しない", () => {
    expect(generateWeeklyMarket(ctx({ act: 1, week: 12 })).imports).toHaveLength(0);
    expect(generateWeeklyMarket(ctx({ act: 4, week: 13 })).imports).toHaveLength(0);
    expect(generateWeeklyMarket(ctx({ act: 4, week: 12 })).imports.length).toBeGreaterThan(0);
  });

  it("【確実性】状態が最初から完全開示され、通関リードタイムが必ずある", () => {
    for (const l of generateWeeklyMarket(ctx({ act: 5, week: 20 })).imports) {
      expect(l.trueCondition).toBeGreaterThan(0);
      expect(l.customsWeeks).toBeGreaterThanOrEqual(2);
      expect(l.customsWeeks).toBeLessThanOrEqual(6);
      // 消費税・通関諸費用・保税保管が乗るので、必ず表示価格より高くつく
      expect(l.landedYen).toBeGreaterThan(l.priceYen);
    }
  });

  it("左ハンドル車には公道化（保安基準適合）の費用がかかる", () => {
    let cars = 0;
    for (let w = 0; w <= 40; w += 2) {
      for (const l of generateWeeklyMarket(ctx({ act: 5, week: w })).imports) {
        if (l.leftHandDrive) {
          expect(l.complianceYen).toBeGreaterThanOrEqual(180_000);
          cars++;
        } else {
          expect(l.complianceYen).toBe(0);
        }
      }
    }
    expect(cars).toBeGreaterThan(0);
  });
});

describe("コンテナ市場", () => {
  it("Act3 未満では開かない", () => {
    expect(generateWeeklyMarket(ctx({ act: 2 })).containers).toHaveLength(0);
    expect(generateWeeklyMarket(ctx({ act: 3 })).containers.length).toBeGreaterThan(0);
  });

  it("ドロップ表の確率が設計値に収束する（T0 約34% / T5 約0.8%）", () => {
    const counts = new Map<string, number>();
    let n = 0;
    for (let w = 0; w < 900; w++) {
      for (const c of generateWeeklyMarket(ctx({ act: 6, week: w })).containers) {
        counts.set(c.tier, (counts.get(c.tier) ?? 0) + 1);
        n++;
      }
    }
    const share = (t: string): number => (counts.get(t) ?? 0) / n;
    expect(share("T0")).toBeGreaterThan(0.26);
    expect(share("T0")).toBeLessThan(0.46);
    expect(share("T5")).toBeLessThan(0.025);
    expect(share("T5")).toBeGreaterThan(0.0005);
    let total = 0;
    for (const t of CONTAINER_TIERS) total += TIER_WEIGHTS[t];
    expect(total).toBeCloseTo(100, 1);
  });

  it("T0 は損失（産廃処理費）になる", () => {
    let seen = 0;
    for (let w = 0; w < 60 && seen < 3; w++) {
      for (const c of generateWeeklyMarket(ctx({ act: 6, week: w })).containers) {
        if (c.tier === "T0") {
          expect(c.valueYen).toBeLessThan(0);
          seen++;
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("【情報を買えば勝てる】重量 1,200 kg で T3 の事後確率が跳ね上がる", () => {
    const flat = posteriorTier("busan", 1_200, null);
    expect(flat.T3).toBeGreaterThan(0.35);
    const withXray = posteriorTier("busan", 1_200, "車両らしき輪郭");
    expect(withXray.T3 + withXray.T5).toBeGreaterThan(flat.T3 + flat.T5);
    expect(withXray.T3 + withXray.T5).toBeGreaterThan(0.85);
  });

  it("事後確率は正規化されている", () => {
    for (const port of ["longBeach", "dubai", "kobe"] as const) {
      for (const w of [120, 800, 1_200, 5_000]) {
        const post = posteriorTier(port, w, null);
        let s = 0;
        for (const t of CONTAINER_TIERS) s += post[t];
        expect(s).toBeCloseTo(1, 6);
      }
    }
  });

  it("積出港で当たりの出やすさが変わる（ロングビーチ > 神戸）", () => {
    const lb = posteriorTier("longBeach", 400, null);
    const kobe = posteriorTier("kobe", 400, null);
    expect(lb.T4 + lb.T5).toBeGreaterThan(kobe.T4 + kobe.T5);
  });

  it("【一位価格】コンテナは入札額をそのまま払う（勝者の呪い）", () => {
    const lot: ContainerLot = {
      ...generateWeeklyMarket(ctx({ act: 6 })).containers[0]!,
      competitorTopYen: 500_000,
      valueYen: 300_000,
    };
    const lose = resolveContainerBid(lot, 400_000);
    expect(lose.won).toBe(false);
    const win = resolveContainerBid(lot, 900_000);
    expect(win.won).toBe(true);
    expect(win.paidYen).toBe(900_000); // 二位価格ではない
    expect(win.netYen).toBeLessThan(0); // 過大評価して勝つと損をする
  });

  it("期待値は隠さない（UI に出せる数値が返る）", () => {
    expect(containerPriorEvYen("longBeach", 1_200, "車両らしき輪郭")).toBeGreaterThan(
      containerPriorEvYen("kobe", 5_000, "空洞が多い"),
    );
  });
});

describe("ローカル市場", () => {
  it("REP が足りないと何も出ない", () => {
    expect(generateWeeklyMarket(ctx({ reputation: 0 })).local).toHaveLength(0);
  });

  it("HEAT 70 以上では全チャネルが閉まる", () => {
    expect(generateWeeklyMarket(ctx({ reputation: 90, heat: 75 })).local).toHaveLength(0);
  });

  it("REP が高いほど枠が増える", () => {
    let low = 0;
    let high = 0;
    for (let w = 0; w < 40; w++) {
      low += generateWeeklyMarket(ctx({ week: w, reputation: 25 })).local.length;
      high += generateWeeklyMarket(ctx({ week: w, reputation: 100 })).local.length;
    }
    expect(high).toBeGreaterThan(low);
  });

  it("【工場を守る】LEGENDARY はローカル市場の一点物にしか存在しない", () => {
    const weeks = Array.from({ length: 80 }, (_, w) => generateWeeklyMarket(ctx({ week: w, reputation: 100, act: 6 })));
    expect(weeks.flatMap((m) => m.local).some((o) => o.maxGrade === "LEGENDARY")).toBe(true);
    expect(weeks.flatMap((m) => m.domestic.netauc).some((l) => l.maxGrade === "LEGENDARY")).toBe(false);
    expect(weeks.flatMap((m) => m.imports).some((l) => l.maxGrade === "LEGENDARY")).toBe(false);
  });

  it("対価は金だけではない（データ・勝負・貸与が混ざる）", () => {
    const kinds = new Set<string>();
    for (let w = 0; w < 120; w++) {
      for (const o of generateWeeklyMarket(ctx({ week: w, reputation: 100 })).local) kinds.add(o.cost.kind);
    }
    expect(kinds.has("yen")).toBe(true);
    expect(kinds.has("data")).toBe(true);
    expect(kinds.has("race")).toBe(true);
  });
});

describe("鑑定・落札・解体", () => {
  it("【分散は買える】鑑定は真値を変えず、表示帯だけを狭める", () => {
    const lot = generateWeeklyMarket(ctx()).domestic.yard[0]!;
    const l1 = inspect(lot, 1);
    const l2 = inspect(lot, 2);
    expect(l1.trueCondition).toBe(lot.trueCondition);
    expect(l2.trueCondition).toBe(lot.trueCondition);
    expect(l1.shownConditionMax - l1.shownConditionMin).toBeLessThan(lot.shownConditionMax - lot.shownConditionMin);
    expect(l2.shownConditionMax - l2.shownConditionMin).toBeLessThan(l1.shownConditionMax - l1.shownConditionMin);
  });

  it("自社計測ライン（Lv2）は全ての瑕疵を開示する", () => {
    const lots = generateWeeklyMarket(ctx()).domestic.yard.filter((l) => l.hiddenFlaws.length > 0);
    expect(lots.length).toBeGreaterThan(0);
    const l = inspect(lots[0]!, 2);
    expect(l.shownFlaws).toEqual(l.hiddenFlaws);
  });

  it("【二位価格】AA・ネトオクは競合最高＋1% しか払わない", () => {
    const l = generateWeeklyMarket(ctx()).domestic.netauc[0]!;
    const lose = resolveAuction(l, Math.round(l.competitorTopYen * 0.9));
    expect(lose.won).toBe(false);
    const win = resolveAuction(l, l.competitorTopYen * 10);
    expect(win.won).toBe(true);
    expect(win.paidYen).toBeLessThan(l.competitorTopYen * 1.05 + 200);
  });

  it("【ハズレが素材になる】解体は必ず素材とデータを返す", () => {
    for (const l of generateWeeklyMarket(ctx()).domestic.yard) {
      const s = salvage(l);
      expect(s.materialG).toBeGreaterThan(0);
      expect(s.data.D2).toBeGreaterThan(0);
    }
  });

  it("期待値は状態の単調増加になっている", () => {
    const base = generateWeeklyMarket(ctx()).domestic.yard[0]!;
    const good = { ...base, shownConditionMin: 0.7, shownConditionMax: 0.9 };
    const bad = { ...base, shownConditionMin: 0.1, shownConditionMax: 0.3 };
    expect(yardExpectedValueYen(good)).toBeGreaterThan(yardExpectedValueYen(bad));
  });

  it("【天井】幻級のピティは上限 15% で頭打ちになる", () => {
    expect(phantomProbability(0)).toBeCloseTo(0.05, 6);
    expect(phantomProbability(5)).toBeCloseTo(0.1, 6);
    expect(phantomProbability(100)).toBeCloseTo(0.15, 6);
  });
});

describe("ベース車の素性 → 性能", () => {
  it("歪み 6mm 超は矯正不能（買ってはいけない個体）", () => {
    expect(chassisPenalty({ frameBendMm: 6.1, rustLevel: 0.3 }).writeOff).toBe(true);
    expect(chassisPenalty({ frameBendMm: 5.9, rustLevel: 0.3 }).writeOff).toBe(false);
  });

  it("歪み・腐食が大きいほど剛性が落ち、修理費と日数が増える", () => {
    const good = chassisPenalty({ frameBendMm: 0.2, rustLevel: 0.05 });
    const bad = chassisPenalty({ frameBendMm: 4.0, rustLevel: 0.7 });
    expect(bad.stiffnessFactor).toBeLessThan(good.stiffnessFactor);
    expect(bad.repairYen).toBeGreaterThan(good.repairYen);
    expect(bad.repairDays).toBeGreaterThan(good.repairDays);
  });

  it("剛性 → 実効グリップの変換が設計どおり（完全レストアで +4.4%・上限 1.05）", () => {
    expect(effectiveMu(1.5, 1.0)).toBeCloseTo(1.5, 6);
    expect(effectiveMu(1.5, 0.59) / 1.5).toBeCloseTo(0.9508, 3);
    expect(effectiveMu(1.5, 1.37) / 1.5).toBeCloseTo(1.0444, 3);
    // 青天井にはしない
    expect(effectiveMu(1.5, 3.0) / 1.5).toBeCloseTo(1.05, 6);
  });
});

describe("自動化（入札エージェント）", () => {
  it("予算内でルールに従った入札計画を返す", () => {
    const m = generateWeeklyMarket(ctx());
    const plan = planBids(m.domestic.netauc, [{ slot: "turbo", maxFairMultiple: 1.1, minCondition: 0.4, minSellerStars: 3, maxWins: 2 }], 1_200_000);
    let total = 0;
    for (const d of plan) total += d.bidYen;
    expect(total).toBeLessThanOrEqual(1_200_000);
    expect(plan.length).toBeLessThanOrEqual(2);
  });

  it("予算 0 なら何も入札しない", () => {
    const m = generateWeeklyMarket(ctx());
    expect(planBids(m.domestic.netauc, [{ maxFairMultiple: 1, minCondition: 0, minSellerStars: 1, maxWins: 99 }], 0)).toHaveLength(0);
  });
});

describe("ユーティリティと性能", () => {
  it("weightedPick は重み 0 の要素を選ばない", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 200; i++) expect(weightedPick(r, ["a", "b", "c"], [0, 1, 0])).toBe("b");
  });

  it("AA 評価点の重みは 11 段階・合計 100", () => {
    expect(AA_SCORES.length).toBe(AA_SCORE_WEIGHTS.length);
    let s = 0;
    for (const w of AA_SCORE_WEIGHTS) s += w;
    expect(s).toBeCloseTo(100, 6);
  });

  it("300 週ぶんの生成が 2 秒以内に終わる", () => {
    const t0 = Date.now();
    for (let w = 0; w < 300; w++) generateWeeklyMarket(ctx({ week: w, act: 6, reputation: 80 }));
    expect(Date.now() - t0).toBeLessThan(2_000);
  });
});
