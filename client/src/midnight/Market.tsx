/** MARKET — 市場スクリーン（HANDOFF §5-1）。番号に表れた誤差が、そのまま金に変わる場所。 */
import { useState } from "react";
import {
  containerPriorEvYen, inspect, phantomProbability, posteriorTier, yardExpectedValueYen,
  CONTAINER_TIERS,
  type AaLot, type NetAucListing, type YardLot,
} from "@shared/midnight/market";
import { formatYen, SLOT_LABEL } from "./state";
import type { Game } from "./actions";
import { Bar, Btn, Chip, ConditionBand, Empty, GradeBadge, INPUT_CLS, Panel } from "./ui";

type Sub = "aa" | "net" | "yard" | "bin" | "imp" | "cont" | "local";

export default function Market({ g }: { g: Game }) {
  const { state, market, act, rainy } = g;
  const [sub, setSub] = useState<Sub>("aa");
  const idx = market.marketIndex;

  const tabs: { id: Sub; label: string; note: string }[] = [
    { id: "aa", label: "中古車AA", note: "二位価格競り" },
    { id: "net", label: "ネトオク", note: "パーツ競り" },
    { id: "yard", label: "解体ヤード", note: "もぎ取り" },
    { id: "bin", label: "青カゴ", note: "山掘り" },
    { id: "imp", label: "輸入（保税ヤード）", note: "高額・確実" },
    { id: "cont", label: "コンテナ", note: "一位価格" },
    { id: "local", label: "地元（PA/町工場）", note: "REP解放" },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-[#FF7A1A]/30 bg-[#FF7A1A]/5 px-3 py-2 text-[12px]">
        <Chip tone="orange">W{state.week} 相場</Chip>
        <span>相場指数 <b className={`font-mono ${idx > 1.03 ? "text-red-300" : idx < 0.97 ? "text-green-300" : "text-[#E6EDF3]"}`}>{idx.toFixed(2)}</b>
          <span className="text-[#7C8B9E]"> （1.00=平常、&gt;1 は高い）</span></span>
        <span>為替 <b className="font-mono">{market.fx.toFixed(3)}</b></span>
        {rainy && <Chip tone="cyan">☔ 雨の週（ヤード劣化 / 筑波ウェット grip 0.72）</Chip>}
        <span className="text-[#9FB0C3]">幻級出現率 <b className="font-mono">{(phantomProbability(state.phantomDrought) * 100).toFixed(0)}%</b>（ハズレ週数 {state.phantomDrought}）</span>
        {act >= 3 && <Chip tone="gold">コンテナ保証 {state.containerDrought}/20</Chip>}
        <span className="ml-auto text-[#7C8B9E]">資金 <b className="font-mono text-[#E6EDF3]">{formatYen(state.yen)}</b></span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`rounded border px-3 py-1.5 text-[12px] font-bold ${sub === t.id ? "border-[#FF7A1A] bg-[#FF7A1A]/15 text-[#FFB27A]" : "border-white/15 bg-white/5 text-[#9FB0C3] hover:text-white"}`}
          >
            {t.label} <span className="text-[10px] opacity-70">{t.note}</span>
          </button>
        ))}
      </div>

      {sub === "aa" && <AaSection g={g} />}
      {sub === "net" && <NetSection g={g} />}
      {sub === "yard" && <YardSection g={g} />}
      {sub === "bin" && <BinSection g={g} />}
      {sub === "imp" && <ImpSection g={g} />}
      {sub === "cont" && <ContSection g={g} />}
      {sub === "local" && <LocalSection g={g} />}
      <p className="text-[11px] leading-relaxed text-[#5F6E80]">在庫は週ごとに全入替（seed×週で決定的＝リロードしても同じ品が並ぶ）。AA・ネトオクは二位価格方式 — 自分の上限額を正直に入れるのが最適。コンテナだけ一位価格（入札額をそのまま払う）。鑑定は真値を変えず、表示の幅だけを狭める。</p>
    </div>
  );
}

function InspectButtons({ g, id }: { g: Game; id: string }) {
  const level = g.state.inspected[id] ?? 0;
  return (
    <div className="flex flex-wrap gap-1.5">
      <Btn disabled={level >= 1} onClick={() => g.inspectListing(id, 1)}>Lv1鑑定 ¥8,000</Btn>
      <Btn
        kind="gold"
        disabled={level >= 2 || !g.state.hasCmm}
        title={g.state.hasCmm ? "自社計測ライン（無料）" : "Lv2は輸入の計測器 or 初レストアで解禁"}
        onClick={() => g.inspectListing(id, 2)}
      >Lv2計測</Btn>
    </div>
  );
}

/* ---------- AA ---------- */
function AaSection({ g }: { g: Game }) {
  const lots = g.market.domestic.aa;
  const [bids, setBids] = useState<Record<string, number>>({});
  return (
    <Panel title="中古車AA — 査定点と検査員メモが全て。フレームの歪みはシートに載らない">
      {lots.length === 0 ? <Empty text="今週は目ぼしい出品がない。週を送ろう。" /> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {lots.map((raw) => {
            const level = (g.state.inspected[raw.id] ?? 0) as 0 | 1 | 2;
            const lot: AaLot = level ? inspect(raw, level) : raw;
            const bid = bids[raw.id] ?? lot.fairYen;
            const done = g.state.purchased[raw.id];
            const s = lot.sheet;
            return (
              <article key={raw.id} className="rounded border border-white/10 bg-black/30 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-black text-[#E6EDF3]">{lot.name}</div>
                    <div className="text-[11px] text-[#7C8B9E]">{s.yearModel}年 / {s.shift} / 色{s.colorCode} / 車検 残{s.inspectionMonthsLeft}ヶ月 / Lot No.{s.lotNo}</div>
                  </div>
                  <span className={`rounded border px-1.5 py-0.5 font-mono text-[12px] font-black ${s.score === "S" || s.score === "5" || s.score === "6" ? "border-[#D9A441]/60 text-[#D9A441]" : "border-white/20 text-[#E6EDF3]"}`}>評価 {s.score}</span>
                </div>
                <div className="mt-2 space-y-1 text-[11px]">
                  <div className="flex items-center justify-between"><span className="text-[#7C8B9E]">外装/内装</span><span className="font-mono">{s.exterior} / {s.interior}{s.repaired && <span className="ml-2 text-red-300">修復歴あり</span>}</span></div>
                  <div className="flex items-center justify-between"><span className="text-[#7C8B9E]">表示走行</span><span className="font-mono">{s.odometerKm.toLocaleString()} km{s.odoStatus === "replaced" ? "（メーター交換）" : s.odoStatus === "unknown" ? "（不明）" : ""}</span></div>
                  <div className="flex items-center justify-between"><span className="text-[#7C8B9E]">状態（表示帯）</span><ConditionBand min={lot.shownConditionMin} max={lot.shownConditionMax} level={level} /></div>
                  {level >= 2 && (
                    <div className="flex items-center justify-between">
                      <span className="text-[#7C8B9E]">計測: フレーム歪み / サビ</span>
                      <span className={`font-mono ${lot.frameBendMm > 3 ? "text-red-300" : "text-[#A8E6EC]"}`}>{lot.frameBendMm.toFixed(2)} mm / {(lot.rustLevel * 100).toFixed(0)}%</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between"><span className="text-[#7C8B9E]">開始 / 相場（fair）</span><span className="font-mono">{formatYen(lot.startYen)} / <b className="text-[#FFB27A]">{formatYen(lot.fairYen)}</b></span></div>
                  <div className="flex items-center justify-between"><span className="text-[#7C8B9E]">諸費用（落札時）/ 業者</span><span className="font-mono">{formatYen(lot.feesYen)} / {lot.competitorCount}者参戦</span></div>
                </div>
                {s.notes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.notes.map((n) => <Chip key={n} tone={["サビ有", "下回り腐食", "AT滑り", "白煙", "エンジン異音"].includes(n) ? "red" : "default"}>{n}</Chip>)}
                  </div>
                )}
                {done ? <p className="mt-3 text-[12px] font-bold text-green-400">✅ 落札済み（ガレージへ搬入）</p> : (
                  <>
                    <div className="mt-3 flex items-center gap-2">
                      <input type="number" className={`${INPUT_CLS} flex-1`} value={bid} onChange={(e) => setBids({ ...bids, [raw.id]: Number(e.target.value) })} />
                      <Btn kind="primary" disabled={bid <= 0 || g.state.yen < bid} title={g.state.yen < bid ? "資金不足" : "二位価格：払うのは競合最高額+1%"} onClick={() => g.bidAa(raw, bid)}>入札（上限）</Btn>
                    </div>
                    <p className="mt-1 text-[11px] text-[#7C8B9E]">{bid < lot.startYen ? "開始価格未満では競り落とせない" : bid >= lot.fairYen * 1.15 ? "相場を大きく超えている。勝っても損するかも" : bid >= lot.fairYen ? "相場以上。素性の良い個体なら正当" : "相場未満。業者の指値を抜けるかは読み次第"}</p>
                    <div className="mt-2"><InspectButtons g={g} id={raw.id} /></div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/* ---------- ネトオク ---------- */
function NetSection({ g }: { g: Game }) {
  const listings = g.market.domestic.netauc;
  const miracles = g.market.domestic.miracle;
  const [bids, setBids] = useState<Record<string, number>>({});
  return (
    <div className="grid gap-4">
      {miracles.length > 0 && (
        <Panel title="★ 奇跡枠 — 低走行・ドノーマル・無事故（ただしAT）" >
          {miracles.map((m) => (
            <article key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-[#D9A441]/50 bg-[#D9A441]/5 p-3">
              <div>
                <div className="font-black text-[#EBCB8A]">{m.name}</div>
                <div className="text-[11px] text-[#9FB0C3]">走行 {m.odometerKm.toLocaleString()} km / AT / 即決 {formatYen(m.askYen)} — AT→MT 公認換装の素材に</div>
              </div>
              {g.state.purchased[m.id] ? <span className="text-[12px] font-bold text-green-400">✅ 購入済み</span> : <Btn kind="gold" onClick={() => g.buyMiracle(m)}>即決で買う</Btn>}
            </article>
          ))}
        </Panel>
      )}
      <Panel title="ネトオク — 即決競り。出品者評価が低いほど安いが、贋作の気配が濃くなる">
        {listings.length === 0 ? <Empty text="今週は目ぼしい出品がない。" /> : (
          <div className="grid gap-2 lg:grid-cols-2">
            {listings.map((raw) => {
              const level = (g.state.inspected[raw.id] ?? 0) as 0 | 1 | 2;
              const l: NetAucListing = level ? inspect(raw, level) : raw;
              const bid = bids[raw.id] ?? l.fairYen;
              const done = g.state.purchased[raw.id];
              return (
                <article key={raw.id} className="rounded border border-white/10 bg-black/30 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[13px] font-black text-[#E6EDF3]">{l.name}</div>
                      <div className="text-[11px] text-[#7C8B9E]">{SLOT_LABEL[l.slot] ?? l.slot} / 定価 {formatYen(l.nominalYen)} / 等級上限 {l.maxGrade}</div>
                    </div>
                    {l.rarity === "phantom" ? <Chip tone="gold">幻級</Chip> : l.rarity === "scarce" ? <Chip tone="cyan">稀少</Chip> : <Chip>通常</Chip>}
                  </div>
                  <div className="mt-1.5 space-y-1 text-[11px]">
                    <div className="flex items-center justify-between"><span className="text-[#7C8B9E]">申告状態（表示帯）</span><ConditionBand min={l.shownConditionMin} max={l.shownConditionMax} level={level} /></div>
                    <div className="flex items-center justify-between"><span className="text-[#7C8B9E]">出品者評価</span><span className="font-mono">{"★".repeat(l.sellerStars)}{"☆".repeat(5 - l.sellerStars)}{l.noClaimNoReturn && <span className="ml-2 text-red-300">ノークレーム</span>}{l.autoExtend && <span className="ml-2 text-[#9FB0C3]">自動延長</span>}</span></div>
                    <div className="flex items-center justify-between"><span className="text-[#7C8B9E]">開始 / 相場</span><span className="font-mono">{formatYen(l.startYen)} / <b className="text-[#FFB27A]">{formatYen(l.fairYen)}</b></span></div>
                    {level >= 2 && (
                      <div className="flex items-center justify-between"><span className="text-[#7C8B9E]">計測: 真贋チェック</span><span className={`font-mono ${raw.isFake ? "text-red-300" : "text-[#A8E6EC]"}`}>{raw.isFake ? "刻印が甘い…贋作の疑い濃厚" : "本物の刻印を確認"}</span></div>
                    )}
                  </div>
                  {done ? <p className="mt-2 text-[12px] font-bold text-green-400">✅ 落札済み（結果はガレージで）</p> : (
                    <>
                      <div className="mt-2 flex items-center gap-2">
                        <input type="number" className={`${INPUT_CLS} flex-1`} value={bid} onChange={(e) => setBids({ ...bids, [raw.id]: Number(e.target.value) })} />
                        <Btn kind="primary" disabled={bid <= 0} onClick={() => g.bidNetAuc(raw, bid)}>入札（上限）</Btn>
                      </div>
                      <div className="mt-2"><InspectButtons g={g} id={raw.id} /></div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ---------- 解体ヤード ---------- */
const FLAW_LABEL: Record<string, string> = { crack: "亀裂", seized: "固着", missingParts: "欠品", counterfeit: "贋作" };
function YardSection({ g }: { g: Game }) {
  const lots = g.market.domestic.yard;
  return (
    <Panel title="解体ヤード — もぎ取り。壊しても素材代と分解DATA（D2/D3）が残る" right={g.rainy ? <Chip tone="cyan">雨で状態低下中</Chip> : undefined}>
      {lots.length === 0 ? <Empty text="今週のヤードは品薄だ。" /> : (
        <div className="grid gap-2 lg:grid-cols-2">
          {lots.map((raw) => {
            const level = (g.state.inspected[raw.id] ?? 0) as 0 | 1 | 2;
            const lot: YardLot = level ? inspect(raw, level) : raw;
            const ev = yardExpectedValueYen(lot);
            const done = g.state.purchased[raw.id];
            return (
              <article key={raw.id} className="rounded border border-white/10 bg-black/30 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[13px] font-black text-[#E6EDF3]">{lot.name}</div>
                    <div className="text-[11px] text-[#7C8B9E]">{SLOT_LABEL[lot.slot] ?? lot.slot} / 定価 {formatYen(lot.nominalYen)} / もぎ取り {lot.pullMinutes}分</div>
                  </div>
                  <span className="font-mono font-bold text-[#FFB27A]">{formatYen(lot.askYen)}</span>
                </div>
                <div className="mt-1.5 space-y-1 text-[11px]">
                  <div className="flex items-center gap-2"><span className="w-20 text-[#7C8B9E]">状態（表示帯）</span><ConditionBand min={lot.shownConditionMin} max={lot.shownConditionMax} level={level} /></div>
                  <div className="flex items-center gap-2"><span className="w-20 text-[#7C8B9E]">破損率</span><Bar value={lot.breakChance} invert width="w-24" /><span className="font-mono">{Math.round(lot.breakChance * 100)}%</span></div>
                  <div className="flex items-center justify-between"><span className="text-[#7C8B9E]">期待値（素材+DATA込み）</span><span className="font-mono">{formatYen(ev)}</span></div>
                  {lot.shownFlaws.length > 0 && <div className="flex gap-1">{lot.shownFlaws.map((f) => <Chip key={f} tone="red">{FLAW_LABEL[f] ?? f}</Chip>)}</div>}
                </div>
                {done ? <p className="mt-2 text-[12px] font-bold text-green-400">✅ 回収済み</p> : (
                  <div className="mt-2 flex gap-1.5">
                    <Btn kind="primary" onClick={() => g.pullYard(raw)}>もぎ取る {formatYen(lot.askYen)}</Btn>
                    <InspectButtons g={g} id={raw.id} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/* ---------- 青カゴ ---------- */
function BinSection({ g }: { g: Game }) {
  const bins = g.market.domestic.bluebin;
  const TIER = { blue: "青カゴ", red: "赤カゴ", black: "黒カゴ" } as const;
  return (
    <Panel title="カゴ山 — 1杯単位の掘り出し。大物率が見えている賭け">
      <div className="grid gap-2 lg:grid-cols-3">
        {bins.map((b) => {
          const bs = g.state.binState[b.id];
          const left = bs?.remaining ?? b.count;
          const bulkPrice = Math.floor(b.unitYen * left * 0.85);
          return (
            <article key={b.id} className="rounded border border-white/10 bg-black/30 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[13px] font-black">{TIER[b.tier]}</div>
                <span className="font-mono font-bold">{formatYen(b.unitYen)}/杯</span>
              </div>
              <div className="mt-1 text-[11px] text-[#7C8B9E]">残り {left} / {b.count} 点</div>
              <div className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
                <span>使える <b className="font-mono">{Math.round(b.usableChance * 100)}%</b></span>
                <span>大物 <b className="font-mono text-[#D9A441]">{(b.rareChance * 100).toFixed(1)}%</b></span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Btn kind="primary" disabled={left <= 0} onClick={() => g.pullBin(b, false)}>1杯掘る</Btn>
                <Btn disabled={left <= 1} onClick={() => g.pullBin(b, true)}>カゴごと {formatYen(bulkPrice)}（15%引）</Btn>
              </div>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}

/* ---------- 輸入 ---------- */
const IMPORT_KIND: Record<string, string> = {
  barnFind: "納屋発見の車体", overseasGrade: "海外A級車", titanium: "素材", inconel: "素材",
  worksPart: "ワークス流出部品", deadStock: "デッドストック新品", metrology: "計測器",
};
function ImpSection({ g }: { g: Game }) {
  const list = g.market.imports;
  return (
    <Panel title="輸入（本牧・大黒の保税ヤード）— 状態は完全開示。金の力で確実性を買う">
      {list.length === 0 ? <Empty text="今週の船便枠はない。Actが進むと品目が増える。" /> : (
        <div className="grid gap-2 lg:grid-cols-2">
          {list.map((l) => {
            const total = l.landedYen + l.complianceYen;
            const done = g.state.purchased[l.id];
            return (
              <article key={l.id} className="rounded border border-white/10 bg-black/30 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[13px] font-black">{l.name}</div>
                    <div className="text-[11px] text-[#7C8B9E]">{IMPORT_KIND[l.itemKind] ?? l.itemKind}{l.leftHandDrive ? " / 左ハンドル" : ""}{l.pricePerKgYen ? ` / ${formatYen(l.pricePerKgYen)}/kg` : ""}</div>
                  </div>
                  <GradeBadge grade={l.maxGrade} />
                </div>
                <div className="mt-1.5 space-y-1 text-[11px]">
                  <div className="flex items-center gap-2"><span className="w-20 text-[#7C8B9E]">真の状態</span><Bar value={l.trueCondition} width="w-24" /><span className="font-mono">{Math.round(l.trueCondition * 100)}%</span></div>
                  <div className="flex justify-between"><span className="text-[#7C8B9E]">着地価格（関税込）</span><span className="font-mono">{formatYen(l.landedYen)}</span></div>
                  {l.complianceYen > 0 && <div className="flex justify-between"><span className="text-[#7C8B9E]">公道化費用</span><span className="font-mono">{formatYen(l.complianceYen)}</span></div>}
                  <div className="flex justify-between"><span className="text-[#7C8B9E]">合計 / 到着</span><span className="font-mono font-bold">{formatYen(total)} / W{g.state.week + l.customsWeeks}（{l.customsWeeks}週後）</span></div>
                </div>
                {done ? <p className="mt-2 text-[12px] font-bold text-[#39D7E6]">🚢 発送済み（W{g.state.week + l.customsWeeks} 到着）</p> : (
                  <Btn className="mt-2" kind="primary" disabled={g.state.yen < total} onClick={() => g.buyImport(l)}>発注する</Btn>
                )}
              </article>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/* ---------- コンテナ ---------- */
function ContSection({ g }: { g: Game }) {
  const lots = g.market.containers;
  const [bids, setBids] = useState<Record<string, number>>({});
  if (g.act < 3) {
    return <Panel title="コンテナ市場"><Empty text="コンテナ市場は Act3（筑波 0:58.000 突破）で解禁。港の顔が見えるまでは入札させてもらえない。" /></Panel>;
  }
  return (
    <Panel title="コンテナ封印競り — 一位価格（入札額をそのまま払う）。港・重量から中身の確率を読む" right={<Chip tone="gold">ハズレ連続 {g.state.containerDrought}/20 で T4+補償</Chip>}>
      {lots.length === 0 ? <Empty text="今週は封印競りの開催がない。" /> : (
        <div className="grid gap-2 lg:grid-cols-2">
          {lots.map((lot) => {
            const post = posteriorTier(lot.port, lot.weightKg, lot.xray, g.state.containerDrought);
            const ev = containerPriorEvYen(lot.port, lot.weightKg, lot.xray, g.state.containerDrought);
            const bid = bids[lot.id] ?? ev;
            const done = g.state.purchased[lot.id];
            return (
              <article key={lot.id} className="rounded border border-white/10 bg-black/30 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[13px] font-black">{lot.portName}積出 コンテナ</div>
                    <div className="text-[11px] text-[#7C8B9E]">表示重量 {lot.weightKg.toLocaleString()}kg / 通関メモ「{lot.customsNote}」/ 入札者 {lot.competitorCount}</div>
                  </div>
                  {lot.sealBroken && <Chip tone="red">封印破れ（−1段）</Chip>}
                </div>
                <div className="mt-1 text-[11px] text-[#9FB0C3]">X線: {lot.xray ?? "未取得（Act4で解禁）"}</div>
                <div className="mt-2 grid grid-cols-6 gap-1">
                  {CONTAINER_TIERS.map((t) => (
                    <div key={t} className="rounded border border-white/10 bg-black/40 px-1 py-1 text-center">
                      <div className="text-[9px] font-black text-[#7C8B9E]">{t}</div>
                      <Bar value={post[t]} />
                      <div className="font-mono text-[10px]">{(post[t] * 100).toFixed(post[t] >= 0.1 ? 0 : 1)}%</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[11px]"><span className="text-[#7C8B9E]">事後期待値（EV）</span><span className="font-mono font-bold text-[#EBCB8A]">{formatYen(ev)}</span></div>
                {done ? <p className="mt-2 text-[12px] font-bold text-green-400">✅ 落札・開封済み（結果はガレージ/ログへ）</p> : (
                  <>
                    <div className="mt-2 flex items-center gap-2">
                      <input type="number" className={`${INPUT_CLS} flex-1`} value={bid} onChange={(e) => setBids({ ...bids, [lot.id]: Number(e.target.value) })} />
                      <Btn kind="gold" disabled={bid <= 0} onClick={() => g.bidContainer(lot, bid)}>入札（一位価格）</Btn>
                    </div>
                    <p className="mt-1 text-[11px] text-[#7C8B9E]">{bid > ev ? "EV超過 — 勝者の呪い圏内。競合も EV を読んでいる" : "EV以下。勝てれば統計的には勝ち"}</p>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/* ---------- ローカル ---------- */
function LocalSection({ g }: { g: Game }) {
  const offers = g.market.local;
  return (
    <Panel title="地元市場 — REPで開く裏ルート。S/LEGENDARY が買える唯一の市場" right={<Chip>REP {g.state.rep}</Chip>}>
      {offers.length === 0 ? (
        <Empty text="申し出がない。地元は REP 20（辰巳PA）から口を開く。筑波の公式計測で結果を出して REP を稼ごう。" />
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {offers.map((o) => {
            const done = g.state.purchased[o.id];
            const costLabel =
              o.cost.kind === "yen" ? formatYen(o.cost.yen)
              : o.cost.kind === "data" ? `DATA ${o.cost.dataKind} ×${o.cost.amount}`
              : o.cost.kind === "race" ? "対決で勝つ"
              : `工房の貸し ${o.cost.days}日`;
            const playable = o.cost.kind === "yen" || o.cost.kind === "data";
            const lacksData = o.cost.kind === "data" && (g.state.data[o.cost.dataKind] ?? 0) < o.cost.amount;
            const lacksYen = o.cost.kind === "yen" && g.state.yen < o.cost.yen;
            return (
              <article key={o.id} className="rounded border border-white/10 bg-black/30 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[13px] font-black">{o.title}</div>
                    <div className="text-[11px] text-[#7C8B9E]">{o.venueName} / {o.from} / {o.subject.kind === "chassis" ? "車体" : o.subject.kind === "blueprint" ? "図面" : o.subject.kind === "ignitionMap" ? "点火マップ" : "パーツ一点物"}{o.perk ? ` / ${o.perk}` : ""}</div>
                  </div>
                  <GradeBadge grade={o.maxGrade} />
                </div>
                <div className="mt-1 flex justify-between text-[11px]"><span className="text-[#7C8B9E]">対価</span><span className="font-mono font-bold">{costLabel}</span></div>
                {done ? <p className="mt-2 text-[12px] font-bold text-green-400">✅ 成立</p> : (
                  <Btn
                    className="mt-2" kind={playable ? "gold" : "default"}
                    disabled={!playable || lacksData || lacksYen}
                    title={!playable ? "フェーズ2（首都高）で解禁" : lacksData ? "DATA不足" : lacksYen ? "資金不足" : ""}
                    onClick={() => g.buyLocal(o)}
                  >
                    {playable ? "取引する" : "フェーズ2で解禁"}
                  </Btn>
                )}
              </article>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
