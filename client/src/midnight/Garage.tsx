/** GARAGE — 所持品の棚卸し。出口（売却）と素材倉庫 */
import { formatYen, SLOT_LABEL } from "./state";
import { carValueYen, partValueYen, type Game } from "./actions";
import { Bar, Btn, Chip, Empty, GradeBadge, Panel } from "./ui";

const DATA_LABEL: Record<string, string> = {
  D1: "D1 材料試験", D2: "D2 分解・構造", D3: "D3 熱・疲労", D4: "D4 動力ベンチ", D5: "D5 テレメトリ", D6: "D6 首都高",
};

export default function Garage({ g, goTab }: { g: Game; goTab: (t: string) => void }) {
  const { state } = g;
  return (
    <div className="grid gap-4">
      <Panel title="車両">
        {state.cars.length === 0 ? <Empty text="車がない。市場の AA（業者オークション）でまず1台落札しよう。初期資金で買える範囲（AE86 等）が入口。" /> : (
          <div className="grid gap-2 lg:grid-cols-2">
            {state.cars.map((car) => {
              const isHero = state.heroCarId === car.id;
              const inRestore = state.restoreJob?.carId === car.id;
              return (
                <article key={car.id} className={`rounded border p-3 ${isHero ? "border-[#FF7A1A]/60 bg-[#FF7A1A]/5" : "border-white/10 bg-black/30"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-black text-[#E6EDF3]">{car.name}</div>
                      <div className="text-[11px] text-[#7C8B9E]">{car.code} / {car.engine} / {car.layout} / {car.shift}</div>
                    </div>
                    <div className="flex gap-1">
                      {isHero && <Chip tone="orange">出走車</Chip>}
                      {car.restored && <Chip tone="cyan">レストア済</Chip>}
                      {car.immobile && <Chip tone="red">走行不能</Chip>}
                      {inRestore && <Chip tone="gold">施工中</Chip>}
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 text-[11px]">
                    <div className="flex items-center gap-2"><span className="w-20 text-[#7C8B9E]">状態</span><Bar value={car.condition} width="w-24" /><span className="font-mono">{(car.condition * 100).toFixed(0)}%</span></div>
                    <div className="flex items-center gap-2"><span className="w-20 text-[#7C8B9E]">サビ</span><Bar value={car.rustLevel} invert width="w-24" /><span className="font-mono">{(car.rustLevel * 100).toFixed(0)}%</span>
                      <span className="ml-2 text-[#7C8B9E]">歪み</span><span className="font-mono">{car.frameBendMm.toFixed(2)} mm</span>
                      <span className="ml-2 text-[#7C8B9E]">剛性</span><span className="font-mono">×{car.stiffnessFactor.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-[#7C8B9E]">走行 / 入手</span><span className="font-mono">{car.odometerKm.toLocaleString()} km / {car.source} W{car.weekBought} {formatYen(car.pricePaidYen)}</span></div>
                    <div className="flex justify-between"><span className="text-[#7C8B9E]">売却査定</span><span className="font-mono font-bold">{formatYen(carValueYen(car))}</span></div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {!isHero && <Btn onClick={() => g.setHero(car.id)}>出走車にする</Btn>}
                    <Btn onClick={() => goTab("restore")} disabled={inRestore}>レストアへ</Btn>
                    {car.shift === "AT" && <Btn kind="gold" onClick={() => g.atToMt(car.id)}>AT→MT公認換装 ¥488,000</Btn>}
                    <Btn kind="danger" onClick={() => g.sellCar(car.id)}>売却</Btn>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="パーツ在庫（装着は BUILD タブ）">
          {state.parts.length === 0 ? <Empty text="在庫なし。ネトオク・解体ヤード・青カゴで調達しよう。" /> : (
            <div className="max-h-96 space-y-1 overflow-y-auto">
              {[...state.parts]
                .sort((a, b) => (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : b.nominalYen - a.nominalYen))
                .map((p) => {
                  const equipped = state.equipped[p.slot] === p.id;
                  return (
                    <div key={p.id} className="flex flex-wrap items-center gap-2 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-[12px]">
                      <span className="w-20 shrink-0 text-[10px] font-black tracking-wide text-[#7C8B9E]">{SLOT_LABEL[p.slot] ?? p.slot}</span>
                      <span className="min-w-40 flex-1 font-bold">{p.name}</span>
                      <GradeBadge grade={p.grade} />
                      <span className="flex items-center gap-1"><Bar value={p.condition} width="w-16" /><span className="font-mono text-[11px]">{(p.condition * 100).toFixed(0)}%</span></span>
                      <span className="text-[11px] text-[#7C8B9E]">{p.source}</span>
                      {p.isFake && <Chip tone="red">贋作</Chip>}
                      {p.broken && !p.isFake && <Chip tone="red">故障</Chip>}
                      {equipped && <Chip tone="orange">装着中</Chip>}
                      <Btn onClick={() => g.sellPart(p.id)}>売却 {formatYen(partValueYen(p))}</Btn>
                    </div>
                  );
                })}
            </div>
          )}
        </Panel>

        <div className="grid gap-4">
          <Panel title="試験データ（DATA 倉庫）">
            <div className="grid grid-cols-2 gap-2">
              {Object.keys(DATA_LABEL).map((k) => (
                <div key={k} className="rounded border border-white/10 bg-black/30 px-2 py-1.5">
                  <div className="text-[10px] font-black tracking-wide text-[#7C8B9E]">{DATA_LABEL[k]}</div>
                  <div className="font-mono text-base font-bold">{state.data[k] ?? 0}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[#7C8B9E]">D2/D3 は解体から、D5 は筑波の走行から貯まる。地元市場では DATA が通貨になることがある。</p>
          </Panel>

          <Panel title="到着予定（通関中）">
            {state.deliveries.length === 0 ? <Empty text="通関待ちはない。輸入で発注した品はここに並ぶ。" /> : (
              <div className="space-y-1">
                {state.deliveries.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-[12px]">
                    <span className="flex-1 font-bold">{d.label}</span>
                    <Chip tone="cyan">W{d.arrivesWeek} 到着</Chip>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="素材倉庫">
            {state.materials.length === 0 ? <Empty text="素材なし（輸入でチタン/インコネルを買うと入る）。" /> : (
              <div className="flex flex-wrap gap-1">
                {state.materials.map((m, i) => <Chip key={`${m}-${i}`}>{m}</Chip>)}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
