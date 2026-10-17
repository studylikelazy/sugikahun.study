/** RESTORE DOCK — 13工程のスルー率ではなく「何を残したか」のゲーム（spec/S4） */
import { useMemo, useState } from "react";
import {
  DEFAULT_PLAN, NEXT_STATE, RESTORE_STATES, STATE_LABEL, TICKS_PER_GAME_DAY,
  completeState, runRestore, type RestorePlan, type RestoreResult,
} from "@shared/midnight/restore";
import { formatYen } from "./state";
import { subjectFromCar, restoreSeedFor, type Game } from "./actions";
import { Bar, Btn, Chip, Empty, Panel, SELECT_CLS, Stat } from "./ui";

const FAIL_LABEL: Record<string, string> = {
  boltSnapped: "固着ボルト破断", blowThrough: "薄板の吹き抜け", hydrogenEmbrittle: "水素脆化（恒久）",
  filmUnevenness: "膜厚ムラ（恒久）", panelMisfit: "パネル寸法不良", stockLost: "素材ロス",
  overPull: "引きすぎ", badWeldSpots: "打点不良", orangePeel: "肌荒れ", wiringFault: "配線ミス", earlyDefect: "初期不良",
};

export default function Restore({ g }: { g: Game }) {
  const { state } = g;
  const [carId, setCarId] = useState<string>("");
  const [plan, setPlan] = useState<RestorePlan>({ ...DEFAULT_PLAN });
  const [last, setLast] = useState<RestoreResult | null>(null);

  const job = state.restoreJob;
  const jobCar = job ? state.cars.find((c) => c.id === job.carId) : null;
  const car = jobCar ?? state.cars.find((c) => c.id === (carId || state.heroCarId || "")) ?? state.cars[0] ?? null;

  const subject = useMemo(() => (car && !job ? subjectFromCar(car, state.saveSeed) : null), [car, job, state.saveSeed]);
  const seed = car ? restoreSeedFor(state.saveSeed, car.id, state.week) : 0;
  const preview = useMemo(
    () => (subject && !job ? runRestore(subject, plan, seed) : null),
    [subject, plan, seed, job],
  );

  if (state.cars.length === 0) {
    return <Panel title="RESTORE DOCK"><Empty text="レストアする車がない。市場で不動車（サビ過多・状態35%未満）や程度の悪い個体を買おう。コンテナの不動車両や納屋物件が本命。" /></Panel>;
  }

  const stepCostPreview = job
    ? completeState(job.progress, job.subject, job.plan, job.seed).costYen - job.progress.costYen
    : 0;

  return (
    <div className="grid gap-4">
      <Panel title="RESTORE DOCK — 新車（剛性1.00）を超える素性は、ここでしか作れない" right={car && <Chip tone={car.immobile ? "red" : "cyan"}>{car.immobile ? "走行不能" : "自走可"}</Chip>}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1">
            <span className="mb-1 block text-[10px] font-black tracking-[0.14em] text-[#7C8B9E]">対象車両</span>
            <select
              className={SELECT_CLS}
              disabled={Boolean(job)}
              value={car?.id ?? ""}
              onChange={(e) => { setCarId(e.target.value); setLast(null); }}
            >
              {state.cars.map((c) => <option key={c.id} value={c.id}>{c.name}{c.restored ? "（レストア済）" : ""}</option>)}
            </select>
          </label>
          {car && (
            <div className="grid flex-2 grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="状態" value={`${(car.condition * 100).toFixed(0)}%`} />
              <Stat label="サビ" value={`${(car.rustLevel * 100).toFixed(0)}%`} sub="0.80以上は不動" />
              <Stat label="フレーム歪み" value={`${car.frameBendMm.toFixed(2)} mm`} sub="0.2mmが理想" />
              <Stat label="現剛性" value={`×${car.stiffnessFactor.toFixed(2)}`} sub="新車=1.00" />
            </div>
          )}
        </div>
      </Panel>

      {job && jobCar ? (
        <Panel title={`施工中 — ${jobCar.name}`}
          right={<Btn kind="danger" onClick={() => { g.cancelRestore(); }}>中止（支払済は戻らない）</Btn>}>
          <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <ol className="space-y-1">
              {RESTORE_STATES.filter((s) => s !== "DONE").map((s) => {
                const idx = RESTORE_STATES.indexOf(s);
                const cur = RESTORE_STATES.indexOf(job.progress.state);
                const st = idx < cur ? "done" : idx === cur ? "now" : "todo";
                return (
                  <li key={s} className={`flex items-center gap-2 rounded border px-2 py-1.5 text-[12px] ${st === "now" ? "border-[#FF7A1A]/60 bg-[#FF7A1A]/10 text-[#FFB27A]" : st === "done" ? "border-white/5 text-[#5F6E80]" : "border-white/10 text-[#9FB0C3]"}`}>
                    <span className="font-mono text-[10px]">{s}</span>
                    <span className="font-bold">{STATE_LABEL[s]}</span>
                    {st === "done" && <span className="ml-auto text-green-500">✓</span>}
                    {st === "now" && <span className="ml-auto font-mono text-[11px]">{(job.progress.ticksRequired / TICKS_PER_GAME_DAY).toFixed(1)} 日</span>}
                  </li>
                );
              })}
            </ol>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="残存サビ" value={`${(job.progress.rust * 100).toFixed(1)}%`} />
                <Stat label="残存歪み" value={`${job.progress.bendMm.toFixed(2)} mm`} />
                <Stat label="支払済" value={formatYen(job.chargedYen)} sub={`経過 ${(job.progress.elapsedTicks / TICKS_PER_GAME_DAY).toFixed(1)} 日`} />
                <Stat label="次工程コスト" value={formatYen(stepCostPreview)} sub={`→ ${STATE_LABEL[NEXT_STATE[job.progress.state]]}`} />
              </div>
              <Btn kind="primary" className="w-full" disabled={state.yen < stepCostPreview} onClick={() => {
                const r = g.advanceRestore();
                if (r) setLast(r);
              }}>
                「{STATE_LABEL[job.progress.state]}」を実施する（{formatYen(stepCostPreview)}）
              </Btn>
              {job.progress.failures.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {job.progress.failures.map((f, i) => <Chip key={`${f}-${i}`} tone="red">{FAIL_LABEL[f] ?? f}</Chip>)}
                </div>
              )}
              <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-white/10 bg-black/30 p-2 text-[11px] text-[#9FB0C3]">
                {job.progress.log.length === 0 ? <p>まだ記録なし</p> : job.progress.log.map((l, i) => <p key={i}>{l}</p>)}
              </div>
            </div>
          </div>
        </Panel>
      ) : (
        <>
          {subject && car && (
            <Panel title="診断プレビュー（入庫前の机上計算 — 実施工と同じ決定論）">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="欠損部品" value={`${subject.missingParts.length} 点`} sub="5軸で削り出し" />
                <Stat label="損傷パネル" value={`${subject.damagedPanels} 枚`} />
                <Stat label="固着" value={subject.seizedEngine ? "あり" : "なし"} />
                <Stat label="出典" value={subject.source} />
              </div>
            </Panel>
          )}
          <Panel title="工程プラン — プレビューが実績になる。運ではなく計画のゲーム">
            <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
              <div className="grid gap-3 sm:grid-cols-2">
                <Slider label={`S3 研削材 ${plan.blastMediaKg} kg`} value={plan.blastMediaKg} min={60} max={300} step={10} onChange={(v) => setPlan({ ...plan, blastMediaKg: v })} hint="多いほどサビが落ちる" />
                <Slider label={`S3 ブラスト圧 ×${plan.blastPressure.toFixed(2)}`} value={plan.blastPressure} min={0.7} max={1.4} step={0.05} onChange={(v) => setPlan({ ...plan, blastPressure: v })} hint="上げすぎは吹き抜け" />
                <Slider label={`S5 電着電圧 ×${plan.edVoltage.toFixed(2)}`} value={plan.edVoltage} min={0.8} max={1.3} step={0.05} onChange={(v) => setPlan({ ...plan, edVoltage: v })} hint="膜厚の均一度に効く" />
                <Slider label={`S5 浸漬時間比 ×${plan.edDipRatio.toFixed(2)}`} value={plan.edDipRatio} min={0.6} max={1.5} step={0.05} onChange={(v) => setPlan({ ...plan, edDipRatio: v })} hint="標準=1.00" />
                <Slider label={`S5 液温ずれ ${plan.edTempErrorC} ℃`} value={plan.edTempErrorC} min={-10} max={10} step={1} onChange={(v) => setPlan({ ...plan, edTempErrorC: v })} hint="0 が理想" />
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black tracking-[0.14em] text-[#7C8B9E]">S6 補修パネル素材</span>
                  <select className={SELECT_CLS} value={plan.panelMaterial} onChange={(e) => setPlan({ ...plan, panelMaterial: e.target.value as RestorePlan["panelMaterial"] })}>
                    <option value="steel">鋼板（安・標準）</option>
                    <option value="aluminium">アルミ（軽・剛性やや低）</option>
                    <option value="carbon">カーボン（軽・剛性+・高価）</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black tracking-[0.14em] text-[#7C8B9E]">S8 フレーム修正治具</span>
                  <select className={SELECT_CLS} value={plan.jig} onChange={(e) => setPlan({ ...plan, jig: e.target.value as RestorePlan["jig"] })}>
                    <option value="simple">簡易（精度0.65）</option>
                    <option value="jig3d">3D治具（精度1.00）</option>
                    <option value="jig3dLaser">3D+レーザー（精度1.18）</option>
                  </select>
                </label>
                <Slider label={`S9 スポット増し ${plan.spotWelds} 点`} value={plan.spotWelds} min={0} max={420} step={20} onChange={(v) => setPlan({ ...plan, spotWelds: v })} hint="剛性の主役" />
                <Slider label={`S9 構造用接着 ${plan.adhesiveM} m`} value={plan.adhesiveM} min={0} max={32} step={2} onChange={(v) => setPlan({ ...plan, adhesiveM: v })} hint="重さほぼなし" />
                <Slider label={`S9 ケージ等級係数 ${plan.cageGrade.toFixed(1)}`} value={plan.cageGrade} min={0} max={1} step={0.1} onChange={(v) => setPlan({ ...plan, cageGrade: v })} hint="0=なし / 1.0=LEGENDARY相当" />
              </div>
              <div className="space-y-3">
                {preview ? (
                  <>
                    <div className="rounded border border-[#39D7E6]/40 bg-[#39D7E6]/5 p-3">
                      <div className="text-[10px] font-black tracking-[0.16em] text-[#39D7E6]">完成予測（実施工と一致）</div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <Stat label="最終剛性" value={`×${preview.stiffnessFactor.toFixed(2)}`} sub={preview.stiffnessFactor >= 1.37 ? "完全レストア級" : preview.stiffnessFactor > 1 ? "新車超え" : "新車以下"} />
                        <Stat label="総費用" value={formatYen(preview.totalCostYen)} sub={`${preview.totalDays.toFixed(0)} 日 / ${preview.energyKwh} kWh`} />
                        <Stat label="残存歪み" value={`${preview.residualBendMm.toFixed(2)} mm`} sub={`残存サビ ${(preview.residualRust * 100).toFixed(1)}%`} />
                        <Stat label="追加質量" value={`${preview.addedMassKg >= 0 ? "+" : ""}${preview.addedMassKg.toFixed(1)} kg`} sub={`価値 ×${preview.valueMultiplier.toFixed(2)} / REP+${preview.repGain}`} />
                      </div>
                      <div className="mt-2"><Bar value={Math.min(1, preview.stiffnessFactor / 1.42)} /></div>
                      {preview.failures.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {preview.failures.map((f, i) => <Chip key={`${f}-${i}`} tone="red">{FAIL_LABEL[f] ?? f}</Chip>)}
                        </div>
                      )}
                    </div>
                    <Btn kind="primary" className="w-full" onClick={() => car && g.startRestore(car.id, { ...plan })}>
                      このプランで入庫する（総額 {formatYen(preview.totalCostYen)} を工程ごとに支払い）
                    </Btn>
                    <p className="text-[11px] leading-relaxed text-[#7C8B9E]">目標: 剛性 ×1.37（スポット420点＋接着32m＋高等級ケージ＋残存歪み0.2mm）。剛性は実効μに直結する（歪んだ車体は、どれだけ部品を作っても報われない）。資金は工程ごとに引かれるので、筑波と並行しても回せる。</p>
                  </>
                ) : <Empty text="対象車両を選ぶと完成予測が出る。" />}
              </div>
            </div>
          </Panel>
        </>
      )}

      {last && (
        <Panel title="★ レストア完成" right={<Btn kind="ghost" onClick={() => setLast(null)}>閉じる</Btn>}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="最終剛性" value={`×${last.stiffnessFactor.toFixed(2)}`} sub={last.stiffnessFactor > 1 ? "新車を超えた" : ""} />
            <Stat label="総費用" value={formatYen(last.totalCostYen)} sub={`${last.totalDays.toFixed(0)} 日`} />
            <Stat label="防錆係数" value={`${(last.corrosionResistance * 100).toFixed(0)}%`} sub="サビ再発を抑える" />
            <Stat label="装着ボーナス" value={`+${last.driveabilityBonus.toFixed(2)}`} sub="ドライバビリティ" />
          </div>
          <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded border border-white/10 bg-black/30 p-2 text-[11px] text-[#9FB0C3]">
            {last.log.map((l, i) => <p key={i}>{l}</p>)}
          </div>
        </Panel>
      )}
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, hint }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-[10px] font-black tracking-[0.14em] text-[#7C8B9E]">
        <span>{label}</span>{hint && <span className="font-normal normal-case tracking-normal">{hint}</span>}
      </span>
      <input type="range" className="w-full accent-[#FF7A1A]" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
