/** BUILD / SETUP — 組付けと感度ビュー。「+100PS より μ」が見える場所（spec/S6） */
import { useMemo, useState } from "react";
import type { PartSlot } from "@shared/midnight/types";
import { MARKET_PART_POOL } from "@shared/midnight/market";
import { formatLapTime } from "@shared/midnight/lap-solver";
import { formatYen, SLOT_LABEL, TIRE_CATALOG } from "./state";
import { conditionsFor, equippedPartsOf, heroOf, type Game } from "./actions";
import { buildVehicleSpec, computeSensitivities, lapOf, type SensitivityRow } from "./spec";
import { Bar, Btn, Chip, Empty, GradeBadge, Panel, SELECT_CLS, Stat } from "./ui";

const SLOT_ORDER: PartSlot[] = [
  "piston", "conrod", "crank", "block", "camshaft", "head", "turbo", "intercooler",
  "injector", "ecu", "exhaust", "clutch", "gearbox", "lsd", "damper", "spring",
  "arm", "swaybar", "brake", "wing", "diffuser", "bodyPanel", "cage",
];

export default function Build({ g }: { g: Game }) {
  const { state } = g;
  const hero = heroOf(state);
  const [sens, setSens] = useState<SensitivityRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const built = useMemo(
    () => (hero ? buildVehicleSpec(hero, equippedPartsOf(state), state.tire, state.setup) : null),
    [hero, state],
  );
  const cond = conditionsFor(state, g.rainy);
  const base = useMemo(() => (built ? lapOf(built, cond) : null), [built, cond]);

  if (!hero || !built || !base) {
    return <Panel title="BUILD / SETUP"><Empty text="組む車がない。市場で1台落札して、ガレージでヒーロー車に指定しよう。" /></Panel>;
  }

  const tireDef = TIRE_CATALOG.find((t) => t.id === state.tire.compoundId) ?? TIRE_CATALOG[0]!;
  const ownedSlots = SLOT_ORDER.filter((s) => state.parts.some((p) => p.slot === s) || state.equipped[s]);

  const runSens = () => {
    setBusy(true);
    // ソルバ9周分。描画を先に出してから計算する
    setTimeout(() => {
      const { rows } = computeSensitivities(built, cond);
      setSens(rows);
      setBusy(false);
    }, 30);
  };

  return (
    <div className="grid gap-4">
      <Panel
        title={`BUILD — ${hero.name}（${hero.code} / ${hero.layout} / ${hero.shift}）`}
        right={
          <select className={`${SELECT_CLS} w-56`} value={hero.id} onChange={(e) => g.setHero(e.target.value)}>
            {state.cars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="推定ラップ（今週条件）" value={formatLapTime(base.estimatedLapTimeS)} sub={`理論 ${formatLapTime(base.idealLapTimeS)}`} />
          <Stat label="推定出力" value={`${Math.round(built.ps)} PS`} sub={`vMax ${Math.round(base.vMaxKph)} km/h`} />
          <Stat label="車重（燃料別）" value={`${Math.round(built.massKg)} kg`} sub={`剛性 ×${built.stiffness.toFixed(2)}`} />
          <Stat label="実効 μ" value={built.muEff.toFixed(2)} sub={`タイヤ ${built.tireMu.toFixed(2)} × 剛性係数`} />
          <Stat label="ダウンフォース" value={`${Math.round(built.downforceKgfAt150)} kgf`} sub="@150 km/h" />
          <Stat label="ベスト" value={state.bestLapS ? formatLapTime(state.bestLapS) : "--:--"} sub={`Act ${g.act}`} />
        </div>
        {hero.immobile && <p className="mt-2 rounded border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[12px] text-red-200">⚠ この車は走行不能（サビ {(hero.rustLevel * 100).toFixed(0)}% / 状態 {(hero.condition * 100).toFixed(0)}%）— RESTORE DOCK で再生するまで筑波には出られない（推定は計算上の値）。</p>}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="装着パーツ（在庫から選ぶ。パーツは市場で買う／もぎ取る）">
          {ownedSlots.length === 0 ? (
            <Empty text="まだ装着できるパーツを持っていない。ネトオク・解体ヤード・青カゴで調達しよう。" />
          ) : (
            <div className="space-y-2">
              {ownedSlots.map((slot) => {
                const cur = state.equipped[slot] ?? "";
                const curPart = state.parts.find((p) => p.id === cur);
                const poolNames = MARKET_PART_POOL.filter((p) => p.slot === slot).map((p) => p.name).join(" / ");
                return (
                  <div key={slot} className="flex flex-wrap items-center gap-2">
                    <span className="w-24 shrink-0 text-[11px] font-black tracking-wide text-[#9FB0C3]">{SLOT_LABEL[slot] ?? slot}</span>
                    <select
                      className={`${SELECT_CLS} min-w-48 flex-1`}
                      value={cur}
                      title={poolNames}
                      onChange={(e) => { g.equip(slot, e.target.value || null); setSens(null); }}
                    >
                      <option value="">— 装備なし —</option>
                      {state.parts.filter((p) => p.slot === slot).map((p) => (
                        <option key={p.id} value={p.id} disabled={p.broken || p.isFake}>
                          {p.name} [{p.grade}] 状態{(p.condition * 100).toFixed(0)}%{p.isFake ? "（贋作）" : p.broken ? "（故障）" : ""}
                        </option>
                      ))}
                    </select>
                    {curPart && <GradeBadge grade={curPart.grade} />}
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-[#7C8B9E]">装備していない部分は純正（ノーマル）のまま。市場品の等級は B が中心 — S/LEGENDARY は地元市場の一車物か、将来の自製（フェーズ2）。</p>
        </Panel>

        <div className="grid gap-4">
          <Panel title="タイヤ" right={<Chip tone={g.rainy ? "cyan" : "default"}>{g.rainy ? "今週はウェット" : "今週はドライ"}</Chip>}>
            <div className="flex items-center gap-2 text-[12px]">
              <span className="font-bold">{tireDef.name}</span>
              <span className="font-mono">μ {tireDef.mu.toFixed(2)}</span>
              <span className="flex-1"><Bar value={1 - state.tire.wear} /></span>
              <span className="font-mono text-[11px] text-[#9FB0C3]">摩耗 {(state.tire.wear * 100).toFixed(0)}%</span>
            </div>
            <p className="mt-1 text-[11px] text-[#7C8B9E]">1計測で約22%摩耗。摩耗はグリップを食う。</p>
            <div className="mt-2 space-y-1.5">
              {TIRE_CATALOG.map((t) => {
                const stock = state.tire.stock[t.id] ?? 0;
                const isNow = t.id === state.tire.compoundId;
                return (
                  <div key={t.id} className="flex flex-wrap items-center gap-2 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-[12px]">
                    <span className="font-bold">{t.name}</span>
                    <span className="font-mono text-[11px] text-[#9FB0C3]">μ {t.mu.toFixed(2)} / {t.note}{stock > 0 ? ` / 在庫 ${stock}` : ""}</span>
                    <span className="ml-auto flex gap-1.5">
                      {stock > 0 && !isNow && <Btn onClick={() => { g.fitTire(t.id); setSens(null); }}>装着（在庫）</Btn>}
                      {!isNow && <Btn kind="primary" disabled={state.yen < t.priceYen} onClick={() => { g.buyTire(t.id, t.priceYen, true); setSens(null); }}>買って装着 {formatYen(t.priceYen)}</Btn>}
                      {isNow && <Chip tone="orange">装着中</Chip>}
                      <Btn disabled={state.yen < t.priceYen} onClick={() => g.buyTire(t.id, t.priceYen, false)}>在庫+1</Btn>
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="セットアップ">
            <SliderSet label={`ファイナル ${state.setup.finalDrive.toFixed(2)}`} value={state.setup.finalDrive} min={3.6} max={5.2} step={0.05} onChange={(v) => { g.setSetup({ finalDrive: v }); setSens(null); }} hint="加速 vs 最高速" />
            <SliderSet label={`燃料 ${state.setup.fuelKg} kg`} value={state.setup.fuelKg} min={5} max={40} step={1} onChange={(v) => { g.setSetup({ fuelKg: v }); setSens(null); }} hint="計測は1周。絞るほど軽い" />
            <SliderSet label={`ウィング角 ${state.setup.wingAngleDeg.toFixed(1)}°`} value={state.setup.wingAngleDeg} min={0} max={14} step={0.5} onChange={(v) => { g.setSetup({ wingAngleDeg: v }); setSens(null); }} hint="ウィング装備時のみ" />
          </Panel>
        </div>
      </div>

      <Panel
        title="感度ビュー — 次の ¥はどこへ？（現在値を1項目ずつ動かした Δラップ）"
        right={<Btn kind="primary" disabled={busy} onClick={runSens}>{busy ? "計算中…" : sens ? "再計算" : "感度を計算"}</Btn>}
      >
        {sens === null ? (
          <Empty text="「感度を計算」を押すと、タイヤ/空力/剛性/重量/シフト/+100PS のどれが最も速くなるか、秒で並ぶ。低出力車ではPSが1位になることもある — 順位は現在地で変わる。筑波の本命は横Gとトラクション。" />
        ) : (
          <div className="space-y-1">
            {sens.map((r) => {
              const max = Math.max(...sens.map((x) => Math.max(0, x.gainS)), 0.001);
              const isPower = r.label.includes("+100 PS");
              return (
                <div key={r.label} className={`flex items-center gap-2 rounded border px-2 py-1.5 text-[12px] ${isPower ? "border-[#FF7A1A]/40 bg-[#FF7A1A]/5" : "border-white/10 bg-black/30"}`}>
                  <span className="w-44 shrink-0 font-bold">{r.label}{isPower && <span className="ml-1 text-[#FFB27A]">←</span>}</span>
                  <span className="flex-1"><Bar value={r.gainS > 0 ? r.gainS / max : 0} /></span>
                  <span className={`w-20 text-right font-mono font-bold ${r.gainS > 0.02 ? "text-green-300" : r.gainS < -0.02 ? "text-red-300" : "text-[#9FB0C3]"}`}>{r.gainS >= 0 ? "−" : "+"}{Math.abs(r.gainS).toFixed(2)} s</span>
                  <span className="hidden w-64 text-[11px] text-[#7C8B9E] md:block">{r.hint}</span>
                </div>
              );
            })}
            <p className="pt-1 text-[11px] text-[#7C8B9E]">−s が大きい順。これが「次の一手」の優先順位。筑波の支配要因は横Gとトラクション — パワーは数字ほど速くない。</p>
          </div>
        )}
      </Panel>
    </div>
  );
}

function SliderSet({ label, value, min, max, step, onChange, hint }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; hint?: string;
}) {
  return (
    <label className="mb-2 block">
      <span className="mb-1 flex justify-between text-[10px] font-black tracking-[0.14em] text-[#7C8B9E]">
        <span>{label}</span>{hint && <span className="font-normal normal-case tracking-normal">{hint}</span>}
      </span>
      <input type="range" className="w-full accent-[#FF7A1A]" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
