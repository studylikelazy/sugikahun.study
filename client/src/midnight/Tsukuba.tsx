/** TSUKUBA — 公式計測会。通貨の唯一の「入水口」。結果がそのまま次の一手を示す（spec/S5・05） */
import { useState } from "react";
import { formatLapTime } from "@shared/midnight/lap-solver";
import { ACT_GATES, formatYen, LIMIT_LABEL, TSUKUBA_ENTRY_YEN, prizeForLap } from "./state";
import { heroOf, type AttackOutcome, type Game } from "./actions";
import { Btn, Chip, Empty, Panel, Stat } from "./ui";

const SEG_NAME: Record<string, string> = {
  home_straight: "ホームストレート", t1_brake: "第1コーナー進入", turn1: "第1コーナー", t1_exit: "第1コーナー出口",
  esses: "S字", chicane_to_hp1: "第1ヘアピン進入", hairpin1: "第1ヘアピン", hp1_exit: "第1ヘアピン出口",
  dunlop: "ダンロップ", r80: "80R", r70: "70R", hp2_brake: "第2ヘアピン進入", hairpin2: "第2ヘアピン",
  back_straight: "バックストレート", final_a: "最終コーナー前半", final_b: "最終コーナー後半",
};

export default function Tsukuba({ g }: { g: Game }) {
  const { state } = g;
  const hero = heroOf(state);
  const [out, setOut] = useState<AttackOutcome | null>(null);
  const officialLeft = state.officialDoneWeek !== state.week;
  const nextGate = ACT_GATES.find((x) => !state.clearedGates.includes(x.act));

  const attack = () => {
    const r = g.attackTsukuba();
    if (r) setOut(r);
  };

  return (
    <div className="grid gap-4">
      <Panel title="筑波サーキット コース2000（TC2000）— 2,045 m / 14コーナー">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Chip tone={g.rainy ? "cyan" : "orange"}>{g.rainy ? "路面: ウェット（grip 0.72）" : "路面: ドライ（標準）"}</Chip>
              {officialLeft
                ? <Chip tone="gold">今週の公式計測: 未消化（賞金フル）</Chip>
                : <Chip>公式計測は消化済 — 以後はスポーツ走行（賞金20%・REPなし）</Chip>}
              <Chip>参加費 {formatYen(TSUKUBA_ENTRY_YEN)}</Chip>
              <Chip>燃料 {state.setup.fuelKg} kg</Chip>
            </div>
            {hero ? (
              <p className="text-[13px]">
                出走車: <b>{hero.name}</b>（{hero.code} / {hero.shift}）
                {hero.immobile && <span className="ml-2 text-red-300">⚠ 走行不能 — レストアが必要</span>}
                <span className="ml-2 text-[#7C8B9E]">車とセッティングは BUILD タブで</span>
              </p>
            ) : (
              <p className="text-[13px] text-[#9FB0C3]">出走車なし — 市場で1台落札しよう。</p>
            )}
            <div className="grid max-w-xl grid-cols-3 gap-2">
              <Stat label="ベストラップ" value={state.bestLapS ? formatLapTime(state.bestLapS) : "--:--"} sub={`Act ${g.act}`} />
              <Stat label="タイヤ摩耗" value={`${(state.tire.wear * 100).toFixed(0)}%`} sub="1計測で +22%" />
              <Stat label="次ゲート" value={nextGate ? formatLapTime(nextGate.gateS) : "制覇"} sub={nextGate ? `Act${nextGate.act}「${nextGate.title}」` : "全ゲート突破"} />
            </div>
          </div>
          <div className="text-center">
            <Btn kind="primary" className="px-6 py-3 text-base" disabled={!hero || hero.immobile || state.yen < TSUKUBA_ENTRY_YEN} onClick={attack}>
              {officialLeft ? "▶ 公式計測 タイムアタック" : "▶ スポーツ走行（計測）"}
            </Btn>
            <p className="mt-1 text-[11px] text-[#7C8B9E]">参加費 {formatYen(TSUKUBA_ENTRY_YEN)} / テレメトリ D5 が貯まる</p>
          </div>
        </div>
      </Panel>

      {out && (
        <Panel title={out.official ? "★ 公式計測 リザルト" : "スポーツ走行 リザルト"}
          right={<span className="font-mono text-[13px] font-bold text-[#EBCB8A]">賞金 {formatYen(out.yenPrize)} / REP +{out.repGain} / D5 +{out.d5Gain}</span>}>
          <div className="grid gap-4 lg:grid-cols-[auto_1fr] lg:items-start">
            <div className="text-center">
              <div className="text-[10px] font-black tracking-[0.2em] text-[#7C8B9E]">LAP TIME</div>
              <div className="font-mono text-5xl font-black text-[#E6EDF3]">{formatLapTime(out.result.estimatedLapTimeS)}</div>
              <div className="mt-1 font-mono text-[12px] text-[#9FB0C3]">理論 {formatLapTime(out.result.idealLapTimeS)}（差 +{(out.result.estimatedLapTimeS - out.result.idealLapTimeS).toFixed(2)}s は扱いにくさ）</div>
              {out.newBest && <div className="mt-1 text-[13px] font-black text-[#D9A441]">★ ベスト更新</div>}
              {out.gateActs.length > 0 && <div className="mt-1 text-[13px] font-black text-[#FF7A1A]">★★ Actゲート {out.gateActs.join(", ")} 突破！ ボーナス {formatYen(out.gateActs.length * 300_000)} / REP +{out.gateActs.length * 5}</div>}
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Stat label="vMax" value={`${Math.round(out.result.vMaxKph)}`} sub="km/h" />
                <Stat label="vMin" value={`${Math.round(out.result.vMinKph)}`} sub="km/h" />
                <Stat label="シフト" value={`${out.result.upshiftCount} 回`} />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {out.result.sectorTimesS.map((s) => <Stat key={s.id} label={`セクター ${s.id}`} value={`${s.timeS.toFixed(2)}`} sub="sec" />)}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-black tracking-[0.16em] text-[#7C8B9E]">区間ごとの支配的限界 — どこが「次の一手」か</div>
              <div className="grid gap-1 sm:grid-cols-2">
                {out.result.segmentLimits.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded border border-white/10 bg-black/30 px-2 py-1 text-[11px]">
                    <span className="flex-1 font-bold">{SEG_NAME[s.id] ?? s.id}</span>
                    <span className="font-mono text-[#9FB0C3]">{Math.round(s.minKph)} km/h</span>
                    <Chip tone={s.limit === "lateral" ? "cyan" : s.limit === "power" ? "orange" : s.limit === "traction" ? "gold" : "default"}>{LIMIT_LABEL[s.limit] ?? s.limit}</Chip>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-[#7C8B9E]">横Gが支配的な区間だらけなら、パワーを足しても速くならない — タイヤ・空力・剛性（実効μ）に投資するのが正解。BUILD タブの感度ビューで −s に換算してから金を動かそう。</p>
            </div>
          </div>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="Act ゲート（S5 確定値）と賞金">
          <div className="space-y-1">
            {ACT_GATES.map((gt) => {
              const cleared = state.clearedGates.includes(gt.act);
              const isNext = nextGate?.act === gt.act;
              const pr = prizeForLap(gt.gateS);
              return (
                <div key={gt.act} className={`flex items-center gap-2 rounded border px-2 py-1.5 text-[12px] ${isNext ? "border-[#FF7A1A]/60 bg-[#FF7A1A]/10" : cleared ? "border-white/5 text-[#5F6E80]" : "border-white/10"}`}>
                  <span className="w-12 font-black">Act{gt.act}</span>
                  <span className="flex-1">{gt.title}</span>
                  <span className="font-mono font-bold">{formatLapTime(gt.gateS)}</span>
                  <span className="font-mono text-[11px] text-[#9FB0C3]">賞金目安 {formatYen(pr.yen)} / REP+{pr.rep}</span>
                  {cleared ? <Chip tone="cyan">突破済</Chip> : isNext ? <Chip tone="orange">次</Chip> : <Chip>未達</Chip>}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-[#7C8B9E]">ゲート突破ごとにボーナス ¥300,000 / REP +5（初回のみ）。最終目標 0:49.999 は実在記録（49.445秒）を超えない線。</p>
        </Panel>

        <Panel title="計測履歴">
          {state.history.length === 0 ? <Empty text="まだ計測記録がない。まず1回走って、現在地を知ろう。" /> : (
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {state.history.map((h, i) => (
                <div key={`${h.week}-${i}`} className="flex items-center gap-2 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-[12px]">
                  <span className="font-mono text-[11px] text-[#7C8B9E]">W{h.week}</span>
                  <span className="flex-1 truncate font-bold">{h.carName}</span>
                  <span className="font-mono font-bold">{formatLapTime(h.lapS)}</span>
                  <span className="font-mono text-[11px] text-[#9FB0C3]">{h.official ? "公式" : "スポーツ"} / {formatYen(h.prizeYen)}{h.repGain > 0 ? ` / REP+${h.repGain}` : ""}</span>
                  {h.gateClearedAct !== null && <Chip tone="gold">Act{h.gateClearedAct}突破</Chip>}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
