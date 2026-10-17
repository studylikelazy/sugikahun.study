/**
 * MIDNIGHT AUTOMATION: C1 to TSUKUBA — フェーズ1「経営ループが回る」
 * 市場 → レストア → 組付け → 筑波計測 → 報酬、を週単位で回すプレイ可能な垂直スライス。
 * ロジックの正本は shared/midnight/*、設計は docs/midnight-automation/HANDOFF.md。
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useGame } from "../midnight/actions";
import Market from "../midnight/Market";
import Restore from "../midnight/Restore";
import Build from "../midnight/Build";
import Tsukuba from "../midnight/Tsukuba";
import Garage from "../midnight/Garage";
import { ACT_GATES, WEEKLY_OVERHEAD_YEN, formatYen } from "../midnight/state";
import { Btn, Panel } from "../midnight/ui";
import { formatLapTime } from "@shared/midnight/lap-solver";

type Tab = "garage" | "market" | "restore" | "build" | "tsukuba";

const TABS: { id: Tab; label: string; sub: string }[] = [
  { id: "garage", label: "GARAGE", sub: "所持品" },
  { id: "market", label: "MARKET", sub: "買う" },
  { id: "restore", label: "RESTORE", sub: "直す" },
  { id: "build", label: "BUILD", sub: "組む" },
  { id: "tsukuba", label: "TSUKUBA", sub: "計測する" },
];

export default function Midnight() {
  const g = useGame();
  const [tab, setTab] = useState<Tab>("garage");
  const [confirmReset, setConfirmReset] = useState(false);
  const { state } = g;

  const nextGate = ACT_GATES.find((x) => !state.clearedGates.includes(x.act));

  const objective = useMemo(() => {
    if (state.cars.length === 0) return "① MARKET の中古車AAで1台落札しよう（査定点と検査員メモを読む。入札は上限額を正直に）";
    const hero = state.cars.find((c) => c.id === state.heroCarId) ?? state.cars[0];
    if (hero?.immobile) return "② 出走車が走行不能だ。RESTORE DOCK で再生しよう（完成予測＝実施工。計画のゲーム）";
    if (state.history.length === 0) return "③ TSUKUBA で初計測して現在地を知ろう（公式計測は週に1回・賞金フル）";
    const gateTxt = nextGate ? `次ゲート Act${nextGate.act}「${nextGate.title}」${formatLapTime(nextGate.gateS)}` : "全ゲート突破！";
    if (state.officialDoneWeek === state.week) return `④ 今週の公式計測は消化済（${gateTxt}）。BUILD の感度ビューで次の一手を決め、市場で仕入れて「週を送る」`;
    return `④ BUILD で組んで TSUKUBA 公式計測へ（${gateTxt} / 賞金で仕入れを回す）`;
  }, [state, nextGate]);

  return (
    <div className="min-h-screen bg-[#0B0D10] text-[#E6EDF3]">
      <div className="mx-auto max-w-6xl px-3 pb-10 sm:px-4">
        {/* ヘッダー */}
        <header className="sticky top-0 z-10 -mx-3 border-b border-white/10 bg-[#0B0D10]/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div>
              <div className="text-lg font-black tracking-[0.12em]">
                MIDNIGHT <span className="text-[#FF7A1A]">AUTOMATION</span>
              </div>
              <div className="text-[10px] tracking-[0.2em] text-[#7C8B9E]">C1 TO TSUKUBA — フェーズ1「経営ループ」</div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
              <span>WEEK <b className="font-mono text-base">{state.week}</b></span>
              <span>資金 <b className={`font-mono text-base ${state.yen < 0 ? "text-red-300" : ""}`}>{formatYen(state.yen)}</b></span>
              <span>REP <b className="font-mono">{state.rep}</b></span>
              <span>Act {g.act}{nextGate && <span className="text-[#7C8B9E]"> → 次 {formatLapTime(nextGate.gateS)}</span>}</span>
              <span>{state.bestLapS ? <>BEST <b className="font-mono text-[#39D7E6]">{formatLapTime(state.bestLapS)}</b></> : "BEST --:--"}</span>
              <span className="font-mono text-[11px] text-[#9FB0C3]">D2:{state.data.D2 ?? 0} D3:{state.data.D3 ?? 0} D5:{state.data.D5 ?? 0}</span>
              {state.hasCmm && <span className="text-[#39D7E6]">CMM稼働中</span>}
              {g.rainy && <span className="text-[#39D7E6]">☔ 雨の週</span>}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Btn kind="primary" onClick={g.advanceWeek}>週を送る →（維持費 {formatYen(WEEKLY_OVERHEAD_YEN)}）</Btn>
              {confirmReset ? (
                <>
                  <Btn kind="danger" onClick={() => { g.reset(); setConfirmReset(false); }}>本当に最初から</Btn>
                  <Btn onClick={() => setConfirmReset(false)}>やめる</Btn>
                </>
              ) : (
                <Btn kind="ghost" onClick={() => setConfirmReset(true)}>新規開業</Btn>
              )}
              <Link href="/" className="text-[12px] font-bold text-[#7C8B9E] hover:text-white">← KOBO</Link>
            </div>
          </div>

          <nav className="mt-3 flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded border px-3 py-1.5 text-[12px] font-black tracking-wider ${tab === t.id ? "border-[#FF7A1A] bg-[#FF7A1A]/15 text-[#FFB27A]" : "border-white/15 bg-white/5 text-[#9FB0C3] hover:text-white"}`}
              >
                {t.label} <span className="text-[10px] font-normal opacity-80">{t.sub}</span>
                {t.id === "restore" && state.restoreJob && " ●"}
                {t.id === "tsukuba" && state.officialDoneWeek !== state.week && state.cars.length > 0 && " ●"}
              </button>
            ))}
          </nav>
        </header>

        {/* 次の一手 */}
        <div className="mt-4 rounded-md border border-[#39D7E6]/30 bg-[#39D7E6]/5 px-3 py-2 text-[13px]">
          <span className="font-black text-[#39D7E6]">次の一手 </span>{objective}
        </div>

        <main className="mt-4">
          {tab === "garage" && <Garage g={g} goTab={(t) => setTab(t as Tab)} />}
          {tab === "market" && <Market g={g} />}
          {tab === "restore" && <Restore g={g} />}
          {tab === "build" && <Build g={g} />}
          {tab === "tsukuba" && <Tsukuba g={g} />}
        </main>

        <Panel title="工場長の声 — ログ" className="mt-4">
          <div className="max-h-48 space-y-1 overflow-y-auto text-[12px] text-[#9FB0C3]">
            {state.log.map((l, i) => <p key={i} className={i === 0 ? "text-[#E6EDF3]" : ""}>{l}</p>)}
          </div>
        </Panel>

        <footer className="mt-6 text-center text-[11px] leading-relaxed text-[#5F6E80]">
          進行はこのブラウザに自動保存される（localStorage: midnight-automation-v1）。設計書は docs/midnight-automation/ 、物理は shared/midnight/lap-solver.ts。
        </footer>
      </div>
    </div>
  );
}
