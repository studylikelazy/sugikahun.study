/**
 * Pulse Terminal style: editorial trading desk with ink-navy surfaces,
 * restrained signal-lime/coral data states, Space Grotesk + IBM Plex Mono hierarchy.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Archive,
  Banknote,
  Bell,
  Box,
  CandlestickChart,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Crosshair,
  Gem,
  Globe2,
  Info,
  LineChart,
  Minus,
  Newspaper,
  Plus,
  Radio,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type AssetKind = "Stock" | "Crypto";
type Asset = {
  id: string;
  code: string;
  name: string;
  kind: AssetKind;
  price: number;
  change: number;
  history: number[];
  signal: string;
  sector: string;
};

type Candle = { time: string; open: number; high: number; low: number; close: number; volume: number };
type Timeframe = "1M" | "5M" | "15M" | "1H" | "1D";

type MarketEvent = {
  id: string;
  tag: string;
  title: string;
  copy: string;
  source: string;
  direction: "up" | "down" | "neutral";
  impact: number;
  effect: Record<string, number>;
  age: number;
};

type Holding = { quantity: number; avgCost: number };
type Reward = {
  id: string;
  name: string;
  rarity: "COMMON" | "RARE" | "EPIC" | "LEGEND";
  detail: string;
  accent: string;
  icon: "signal" | "news" | "radar" | "badge";
};

const HERO_IMAGE = "/manus-storage/market-pulse-hero_2e8a32ff.png";
const GACHA_IMAGE = "/manus-storage/market-pulse-gacha_73e0409e.png";
const TEXTURE_IMAGE = "/manus-storage/market-pulse-texture_11d38308.png";
const LOGO_IMAGE = "/manus-storage/market-pulse-logo_3ff09442.png";

const INITIAL_ASSETS: Asset[] = [
  { id: "orca", code: "ORCA", name: "Orca Systems", kind: "Stock", price: 184.26, change: 1.84, history: [176.2, 177.8, 175.1, 178.4, 180.3, 179.1, 181.6, 182.2, 181.1, 183.4, 184.26], signal: "AI インフラ", sector: "Technology" },
  { id: "vector", code: "VCTR", name: "Vector Finance", kind: "Stock", price: 96.34, change: 1.16, history: [92.8, 93.4, 94.1, 93.2, 94.9, 95.2, 94.6, 95.8, 96.0, 95.6, 96.34], signal: "決算修正", sector: "Financials" },
  { id: "nori", code: "NORI", name: "Nori Energy", kind: "Stock", price: 72.48, change: -0.64, history: [74.6, 74.1, 73.8, 73.4, 74.2, 73.5, 72.8, 73.1, 72.9, 72.7, 72.48], signal: "金利感応", sector: "Energy" },
  { id: "helio", code: "HLIO", name: "Helio Health", kind: "Stock", price: 128.73, change: 0.92, history: [124.3, 125.1, 125.8, 126.1, 125.6, 127.4, 126.9, 128.2, 127.7, 128.1, 128.73], signal: "治験進捗", sector: "Healthcare" },
  { id: "sola", code: "SOLA", name: "Sola Mobility", kind: "Stock", price: 41.92, change: 2.45, history: [39.8, 40.1, 39.7, 40.3, 40.8, 40.4, 41.2, 41.4, 41.1, 41.6, 41.92], signal: "販売台数", sector: "Mobility" },
  { id: "lumen", code: "LMN", name: "Lumen Retail", kind: "Stock", price: 58.17, change: 0.38, history: [56.5, 56.8, 57.1, 56.7, 57.3, 57.0, 57.4, 57.8, 57.6, 57.9, 58.17], signal: "消費データ", sector: "Consumer" },
  { id: "terra", code: "TERR", name: "Terra Materials", kind: "Stock", price: 213.64, change: -1.46, history: [218.9, 217.6, 216.4, 217.2, 215.8, 216.7, 215.1, 214.8, 215.9, 214.2, 213.64], signal: "資源価格", sector: "Materials" },
  { id: "quanta", code: "QNTA", name: "Quanta Grid", kind: "Stock", price: 36.82, change: 2.84, history: [33.7, 34.0, 33.9, 34.8, 35.2, 34.6, 35.4, 35.9, 36.1, 35.8, 36.82], signal: "送電網", sector: "Utilities" },
  { id: "atlas", code: "ATL", name: "Atlas Protocol", kind: "Crypto", price: 3.842, change: 3.18, history: [3.44, 3.51, 3.48, 3.59, 3.62, 3.55, 3.68, 3.73, 3.69, 3.77, 3.842], signal: "ネットワーク", sector: "Layer 1" },
  { id: "nova", code: "NVA", name: "Nova Credit", kind: "Crypto", price: 1.286, change: -1.22, history: [1.34, 1.35, 1.33, 1.32, 1.35, 1.31, 1.30, 1.31, 1.29, 1.30, 1.286], signal: "流動性", sector: "DeFi" },
  { id: "rift", code: "RIFT", name: "Rift Network", kind: "Crypto", price: 0.746, change: 4.62, history: [0.67, 0.69, 0.68, 0.70, 0.71, 0.70, 0.72, 0.73, 0.72, 0.74, 0.746], signal: "スケーリング", sector: "Layer 2" },
  { id: "etheris", code: "ETHS", name: "Etheris", kind: "Crypto", price: 18.467, change: -0.31, history: [18.9, 18.8, 18.7, 18.6, 18.8, 18.7, 18.6, 18.5, 18.6, 18.52, 18.467], signal: "ステーキング", sector: "Smart Chain" },
  { id: "mint", code: "MINT", name: "Mint Ledger", kind: "Crypto", price: 6.214, change: 1.72, history: [5.92, 5.98, 5.94, 6.04, 6.08, 6.02, 6.11, 6.14, 6.12, 6.17, 6.214], signal: "トークン化", sector: "RWA" },
  { id: "aura", code: "AURA", name: "Aura Swap", kind: "Crypto", price: 0.392, change: -2.09, history: [0.42, 0.41, 0.414, 0.405, 0.41, 0.402, 0.398, 0.403, 0.397, 0.401, 0.392], signal: "取引量", sector: "DEX" },
];

const EVENT_POOL: Omit<MarketEvent, "id" | "age">[] = [
  { tag: "TECH / POSITIVE", title: "クラウド需要の見通しを上方修正", copy: "企業向け推論需要が予想を上回り、サーバー投資の前倒しが示唆された。AI インフラ関連に買いが広がる。", source: "Pulse Wire", direction: "up", impact: 82, effect: { orca: 0.008, atlas: 0.003 } },
  { tag: "MACRO / CAUTION", title: "長期金利の上昇でグロースに圧力", copy: "債券利回りの上振れを受け、遠い将来の成長期待で評価される銘柄ほど割引率の影響を受けやすい局面。", source: "Macro Desk", direction: "down", impact: 67, effect: { orca: -0.005, helio: -0.004, nova: -0.003 } },
  { tag: "ENERGY / POSITIVE", title: "送電網投資の地域計画が承認", copy: "系統増強の予算枠が明確になり、エネルギー貯蔵と配電関連の需要見通しが改善。", source: "Sector Brief", direction: "up", impact: 74, effect: { nori: 0.007, sola: 0.002 } },
  { tag: "CRYPTO / POSITIVE", title: "主要決済網に検証ノードが追加", copy: "ネットワークの処理能力向上が確認され、オンチェーン取引量の増加期待が強まっている。", source: "Chain Monitor", direction: "up", impact: 88, effect: { atlas: 0.009, nova: 0.005 } },
  { tag: "HEALTH / POSITIVE", title: "中間解析で有効性シグナルを確認", copy: "試験データが想定を上回り、次段階の開発スケジュールが前進。ヘルスケア・セクターへの注目が高まる。", source: "Clinical Ledger", direction: "up", impact: 76, effect: { helio: 0.008 } },
  { tag: "MOBILITY / CAUTION", title: "部材の到着遅延が生産計画を圧迫", copy: "供給網の混雑が短期的な納車台数に影響する可能性。販売台数の予測修正が焦点。", source: "Supply Chain Now", direction: "down", impact: 72, effect: { sola: -0.007 } },
  { tag: "CRYPTO / CAUTION", title: "短期資金の清算が増加", copy: "レバレッジ解消が観測され、流動性が薄い時間帯の価格変動が拡大。材料の消化を待つ局面。", source: "Chain Monitor", direction: "down", impact: 63, effect: { atlas: -0.006, nova: -0.008 } },
  { tag: "FINANCE / POSITIVE", title: "資本効率の改善計画を公表", copy: "手数料収入とコスト構造の見直しが示され、金融セクターの収益性見通しが改善。", source: "Capital Brief", direction: "up", impact: 71, effect: { vector: 0.007, lumen: 0.002 } },
  { tag: "MATERIALS / CAUTION", title: "資源先物が反落、在庫水準を注視", copy: "需要見通しの再評価を受けて資源価格が軟調。素材関連には短期的な利益確定が出ている。", source: "Commodity Wire", direction: "down", impact: 69, effect: { terra: -0.008 } },
  { tag: "GRID / POSITIVE", title: "蓄電・送電案件の入札が前進", copy: "地域インフラの新規案件が開示され、系統関連の受注期待が高まる。", source: "Sector Brief", direction: "up", impact: 79, effect: { quanta: 0.009, nori: 0.003 } },
  { tag: "CRYPTO / POSITIVE", title: "ロールアップ更新が処理能力を改善", copy: "ネットワーク更新の進展により、取引処理と手数料効率の改善が見込まれる。", source: "Chain Monitor", direction: "up", impact: 84, effect: { rift: 0.011, etheris: 0.004, aura: 0.003 } },
  { tag: "RWA / POSITIVE", title: "トークン化商品の発行額が増加", copy: "オンチェーン商品化の利用範囲が拡大し、実資産連動領域の資金流入が観測された。", source: "Ledger Review", direction: "up", impact: 73, effect: { mint: 0.009, nova: 0.002 } },
];

const STARTING_EVENTS: MarketEvent[] = [
  { id: "seed-1", tag: "TECH / POSITIVE", title: "クラウド需要の見通しを上方修正", copy: "企業向け推論需要が予想を上回り、サーバー投資の前倒しが示唆された。AI インフラ関連に買いが広がる。", source: "Pulse Wire", direction: "up", impact: 82, effect: { orca: 0.008, atlas: 0.003 }, age: 1 },
  { id: "seed-2", tag: "MACRO / CAUTION", title: "長期金利の上昇でグロースに圧力", copy: "債券利回りの上振れを受け、遠い将来の成長期待で評価される銘柄ほど割引率の影響を受けやすい局面。", source: "Macro Desk", direction: "down", impact: 67, effect: { orca: -0.005, helio: -0.004 }, age: 4 },
  { id: "seed-3", tag: "CRYPTO / POSITIVE", title: "主要決済網に検証ノードが追加", copy: "ネットワークの処理能力向上が確認され、オンチェーン取引量の増加期待が強まっている。", source: "Chain Monitor", direction: "up", impact: 88, effect: { atlas: 0.009, nova: 0.005 }, age: 8 },
];

const REWARDS: Reward[] = [
  { id: "pulse", name: "Open Signal", rarity: "COMMON", detail: "分析アーカイブの初期シグナル。プロフィールに記録されます。", accent: "#b7c2c9", icon: "signal" },
  { id: "wire", name: "Wire Reader", rarity: "RARE", detail: "ニュースを読む交易者のための限定アーカイブバッジ。", accent: "#7ed8ff", icon: "news" },
  { id: "radar", name: "Second Horizon", rarity: "EPIC", detail: "二次的な市場波及を追うための観測レコード。", accent: "#cf9cff", icon: "radar" },
  { id: "thesis", name: "Thesis 01", rarity: "LEGEND", detail: "仮説を持続させた記録。純粋にコレクション用のレアバッジ。", accent: "#f6c96a", icon: "badge" },
];

const formatMoney = (value: number, precision = 2) =>
  new Intl.NumberFormat("ja-JP", { style: "currency", currency: "USD", minimumFractionDigits: precision, maximumFractionDigits: precision }).format(value);

const formatPrice = (asset: Asset) => formatMoney(asset.price, asset.kind === "Crypto" ? 3 : 2);

const TIMEFRAMES: Timeframe[] = ["1M", "5M", "15M", "1H", "1D"];

function createCandles(asset: Asset, timeframe: Timeframe): Candle[] {
  const count = timeframe === "1M" ? 44 : timeframe === "5M" ? 38 : timeframe === "15M" ? 34 : timeframe === "1H" ? 30 : 26;
  const scale = asset.kind === "Crypto" ? 0.0085 : 0.0048;
  const codeSeed = asset.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const openingPrice = asset.price / (1 + asset.change / 100);
  let previousClose = openingPrice * (0.978 + (codeSeed % 8) / 1000);
  const unit = timeframe === "1M" ? "m" : timeframe === "5M" ? "m" : timeframe === "15M" ? "m" : timeframe === "1H" ? "h" : "d";
  const interval = timeframe === "1M" ? 1 : timeframe === "5M" ? 5 : timeframe === "15M" ? 15 : timeframe === "1H" ? 1 : 1;

  return Array.from({ length: count }, (_, index) => {
    const open = previousClose;
    const momentum = Math.sin((index + codeSeed) * 1.39) * scale * 0.85 + Math.cos((index + codeSeed) * 0.58) * scale * 0.45;
    const correction = (asset.price - previousClose) / asset.price / Math.max(3, count - index);
    const close = index === count - 1 ? asset.price : Math.max(asset.kind === "Crypto" ? 0.05 : 2, open * (1 + momentum + correction));
    const wick = Math.abs(Math.sin((index + codeSeed) * 2.17)) * scale * 0.9 + scale * 0.34;
    const high = Math.max(open, close) * (1 + wick);
    const low = Math.min(open, close) * (1 - wick * 0.9);
    const volume = Math.round((asset.kind === "Crypto" ? 680000 : 230000) * (0.64 + Math.abs(momentum) * 85 + (index % 5) * 0.08));
    previousClose = close;
    const clock = timeframe === "1D" ? `D-${count - index - 1}` : `${String(9 + Math.floor((index * interval) / 60)).padStart(2, "0")}:${String((30 + index * interval) % 60).padStart(2, "0")}`;
    return { time: index === count - 1 ? "NOW" : clock, open, high, low, close, volume };
  });
}

function DirectionIcon({ direction, size = 14 }: { direction: MarketEvent["direction"]; size?: number }) {
  return direction === "up" ? <ArrowUpRight size={size} /> : direction === "down" ? <ArrowDownRight size={size} /> : <Minus size={size} />;
}

function RewardIcon({ type }: { type: Reward["icon"] }) {
  const iconProps = { size: 27, strokeWidth: 1.6 };
  if (type === "news") return <Newspaper {...iconProps} />;
  if (type === "radar") return <Crosshair {...iconProps} />;
  if (type === "badge") return <ShieldCheck {...iconProps} />;
  return <Activity {...iconProps} />;
}

export default function Home() {
  const [assets, setAssets] = useState<Asset[]>(INITIAL_ASSETS);
  const [events, setEvents] = useState<MarketEvent[]>(STARTING_EVENTS);
  const [selectedId, setSelectedId] = useState("orca");
  const [cash, setCash] = useState(100000);
  const [holdings, setHoldings] = useState<Record<string, Holding>>({});
  const [tradeQuantity, setTradeQuantity] = useState(10);
  const [tab, setTab] = useState<"all" | AssetKind>("all");
  const [credits, setCredits] = useState(350);
  const [gachaOpen, setGachaOpen] = useState(false);
  const [gachaResult, setGachaResult] = useState<Reward | null>(null);
  const [archive, setArchive] = useState<Reward[]>([]);
  const [tick, setTick] = useState(1);
  const [timeframe, setTimeframe] = useState<Timeframe>("5M");

  const selected = assets.find((asset) => asset.id === selectedId) ?? assets[0];
  const filteredAssets = tab === "all" ? assets : assets.filter((asset) => asset.kind === tab);
  const marketValue = useMemo(
    () => Object.entries(holdings).reduce((total, [id, holding]) => total + (assets.find((asset) => asset.id === id)?.price ?? 0) * holding.quantity, 0),
    [assets, holdings],
  );
  const positionPnL = useMemo(
    () => Object.entries(holdings).reduce((total, [id, holding]) => total + ((assets.find((asset) => asset.id === id)?.price ?? 0) - holding.avgCost) * holding.quantity, 0),
    [assets, holdings],
  );
  const equity = cash + marketValue;
  const activeCatalysts = useMemo(() => events.filter((event) => event.effect[selected.id] !== undefined).slice(0, 3), [events, selected.id]);
  const candles = useMemo(() => createCandles(selected, timeframe), [selected, timeframe]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setAssets((current) =>
        current.map((asset) => {
          const weightedEffect = events.reduce((sum, event) => sum + (event.effect[asset.id] ?? 0) * Math.max(0.18, 1 - event.age * 0.11), 0);
          const microMove = (Math.random() - 0.48) * (asset.kind === "Crypto" ? 0.006 : 0.003);
          const move = weightedEffect * 0.25 + microMove;
          const nextPrice = Math.max(asset.kind === "Crypto" ? 0.08 : 5, asset.price * (1 + move));
          const opening = asset.history[0];
          return { ...asset, price: nextPrice, change: ((nextPrice - opening) / opening) * 100, history: [...asset.history.slice(-23), nextPrice] };
        }),
      );
      setEvents((current) => {
        const template = EVENT_POOL[Math.floor(Math.random() * EVENT_POOL.length)];
        const nextEvent: MarketEvent = { ...template, id: `event-${Date.now()}`, age: 0 };
        return [nextEvent, ...current.map((event) => ({ ...event, age: event.age + 1 }))].slice(0, 5);
      });
      setTick((value) => value + 1);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [events]);

  const trade = (side: "buy" | "sell") => {
    const quantity = Math.max(1, Math.floor(tradeQuantity || 1));
    const value = selected.price * quantity;
    const existing = holdings[selected.id] ?? { quantity: 0, avgCost: 0 };

    if (side === "buy") {
      if (value > cash) return toast.error("残高が不足しています", { description: `必要額: ${formatPrice(selected)} × ${quantity}` });
      const newQuantity = existing.quantity + quantity;
      setCash((current) => current - value);
      setHoldings((current) => ({
        ...current,
        [selected.id]: { quantity: newQuantity, avgCost: (existing.avgCost * existing.quantity + value) / newQuantity },
      }));
      setCredits((current) => current + 25);
      toast.success(`${selected.code} を ${quantity} 単位購入`, { description: `取引の記録で Archive Credit +25` });
    } else {
      if (existing.quantity < quantity) return toast.error("保有数量が不足しています", { description: `${selected.code} の保有: ${existing.quantity} 単位` });
      setCash((current) => current + value);
      setHoldings((current) => ({ ...current, [selected.id]: { ...existing, quantity: existing.quantity - quantity } }));
      setCredits((current) => current + 15);
      toast.success(`${selected.code} を ${quantity} 単位売却`, { description: `取引の記録で Archive Credit +15` });
    }
  };

  const pullArchive = () => {
    if (credits < 100) return toast.error("Archive Credit が足りません", { description: "売買を記録すると Credit を獲得できます。" });
    const roll = Math.random();
    const reward = roll > 0.985 ? REWARDS[3] : roll > 0.89 ? REWARDS[2] : roll > 0.59 ? REWARDS[1] : REWARDS[0];
    setCredits((current) => current - 100);
    setGachaResult(reward);
    setArchive((current) => [reward, ...current]);
  };

  const selectedHolding = holdings[selected.id] ?? { quantity: 0, avgCost: 0 };
  const eventStrength = activeCatalysts.reduce((sum, event) => sum + Math.abs(event.effect[selected.id] ?? 0), 0);

  return (
    <main className="market-shell min-h-screen bg-[#081115] text-[#e9efea] lg:grid lg:grid-cols-[278px_minmax(0,1fr)]">
      <aside className="market-sidebar border-b border-white/10 bg-[#0b1519]/95 px-5 py-5 lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:w-[278px] lg:border-b-0 lg:border-r lg:px-6 lg:py-7">
        <div className="flex items-center justify-between lg:block">
          <div className="flex items-center gap-3">
            <img className="h-10 w-10 rounded-[10px] bg-[#c9f34a] object-cover p-1 shadow-[0_0_24px_rgba(201,243,74,.15)]" src={LOGO_IMAGE} alt="MARKET PULSE" />
            <div>
              <p className="font-display text-[15px] font-bold tracking-[0.14em] text-white">MARKET PULSE</p>
              <p className="font-mono text-[9px] tracking-[0.18em] text-[#859398]">SIMULATION DESK</p>
            </div>
          </div>
          <div className="flex items-center gap-2 lg:mt-12 lg:block">
            <span className="live-dot inline-flex items-center gap-2 rounded-full border border-[#c9f34a]/25 bg-[#c9f34a]/[.08] px-2.5 py-1 font-mono text-[9px] tracking-[0.14em] text-[#c9f34a]"><span className="h-1.5 w-1.5 rounded-full bg-[#c9f34a]" />LIVE SIM</span>
          </div>
        </div>

        <div className="relative mt-8 hidden overflow-hidden border-y border-white/[.09] py-5 lg:block">
          <p className="eyebrow text-[#c9f34a]">MARKET PULSE / 01</p>
          <p className="mt-2 font-display text-[28px] font-bold leading-[.88] tracking-[-.09em] text-white">READ<br />THE<br /><span className="text-[#c9f34a]">PULSE.</span></p>
          <svg viewBox="0 0 230 38" className="mt-5 h-8 w-[230px] text-[#c9f34a]" fill="none" aria-hidden="true"><path d="M0 22h26l11-12 12 22 18-29 15 20h35l11-9 10 13 14-22 13 17h45" stroke="currentColor" strokeWidth="1.6" /><path d="M0 31h230" stroke="currentColor" strokeOpacity=".22" strokeWidth="1" /></svg>
          <p className="mt-3 max-w-[190px] font-mono text-[9px] leading-relaxed text-[#718187]">価格の変化を、ニュースの因果から読むための市場レール。</p>
        </div>

        <nav className="mt-6 hidden space-y-1 lg:block">
          {[
            [LineChart, "MARKETS", true],
            [WalletCards, "PORTFOLIO", false],
            [Newspaper, "NEWSFLOW", false],
          ].map(([Icon, label, isActive]) => {
            const IconComponent = Icon as typeof LineChart;
            return <button key={label as string} className={`group flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-xs transition ${isActive ? "bg-white/[.07] text-white" : "text-[#839297] hover:bg-white/[.04] hover:text-white"}`}><IconComponent size={16} className={isActive ? "text-[#c9f34a]" : ""} /><span className="font-display text-[11px] font-medium tracking-[.12em]">{label as string}</span>{isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#c9f34a]" />}</button>;
          })}
        </nav>

        <div className="mt-7 hidden lg:block">
          <div className="mb-3 flex items-center justify-between"><p className="eyebrow">MARKET PULSE</p><span className="font-mono text-[10px] text-[#aab7b4]">{tick.toString().padStart(2, "0")}:00</span></div>
          <div className="space-y-3">
            <PulseRow label="EQUITY" value={formatMoney(equity)} tone="lime" />
            <PulseRow label="CASH" value={formatMoney(cash)} tone="neutral" />
            <PulseRow label="OPEN P/L" value={`${positionPnL >= 0 ? "+" : ""}${formatMoney(positionPnL)}`} tone={positionPnL >= 0 ? "lime" : "coral"} />
          </div>
        </div>

        <div className="mt-6 hidden rounded-2xl border border-[#d19b4b]/25 bg-[#d19b4b]/[.07] p-4 lg:block">
          <div className="flex items-start justify-between"><div><p className="eyebrow text-[#f5c56b]">ARCHIVE GACHA</p><p className="mt-2 text-sm font-medium text-white">市場に影響しない<br />分析コレクション</p></div><Archive size={18} className="text-[#f5c56b]" /></div>
          <div className="mt-4 flex items-center justify-between border-t border-[#d19b4b]/15 pt-3"><span className="font-mono text-[10px] text-[#c7aaa0]">{credits} CREDIT</span><button onClick={() => { setGachaOpen(true); setGachaResult(null); }} className="text-[10px] font-semibold tracking-[.12em] text-[#f5c56b] hover:text-white">OPEN <ChevronRight size={12} className="inline" /></button></div>
        </div>

        <div className="mt-auto hidden border-t border-white/10 pt-5 lg:block"><p className="font-mono text-[9px] leading-relaxed text-[#718187]">FICTIONAL MARKET · NO REAL MONEY<br />ニュースも含め全てゲーム内シミュレーションです。</p></div>
      </aside>

      <section className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-[#081115]/90 px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-10">
          <div className="flex items-center gap-3"><img src={LOGO_IMAGE} alt="" className="h-9 w-9 rounded-lg bg-[#c9f34a] p-1" /><div><p className="eyebrow">THE OPEN / MARKET PULSE</p><h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-white">値動きの理由を読む。</h1></div></div>
          <div className="flex items-center gap-3"><button className="relative rounded-full p-2 text-[#9babaf] transition hover:bg-white/5 hover:text-white" aria-label="通知"><Bell size={18} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#c9f34a]" /></button><div className="hidden h-8 border-l border-white/10 sm:block" /><div className="hidden text-right sm:block"><p className="font-mono text-[9px] tracking-[.14em] text-[#718187]">SESSION</p><p className="font-mono text-[11px] text-white">JP / SIM-01</p></div></div>
        </header>

        <div className="px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
          <section className="relative overflow-hidden rounded-2xl border border-white/[.13] bg-[#111d21] shadow-[0_30px_60px_rgba(0,0,0,.2)]">
            <img src={HERO_IMAGE} alt="市場データを表現した抽象的な夜の金融ニュースルーム" className="absolute inset-0 h-full w-full object-cover opacity-55" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,17,21,.98)_0%,rgba(8,17,21,.88)_40%,rgba(8,17,21,.33)_100%)]" />
            <div className="relative grid min-h-[245px] gap-6 p-6 min-[680px]:grid-cols-[1fr_310px] sm:p-8 lg:p-9">
              <div className="max-w-xl self-end"><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-3 py-1 font-mono text-[9px] tracking-[.16em] text-[#c6d1d0]"><Radio size={11} className="text-[#c9f34a]" /> MARKET IS MOVING</div><p className="eyebrow text-[#c9f34a]">SELECTED INSTRUMENT / PRICE TAPE</p><div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1"><h2 className="font-display text-5xl font-bold leading-none tracking-[-.08em] text-white sm:text-6xl">{selected.code}</h2><p className="mb-1 text-sm text-[#b5c3c4]">{selected.name}</p></div><div className="mt-5 flex items-end gap-4"><p className="font-mono text-4xl tracking-[-.08em] text-white">{formatPrice(selected)}</p><ChangePill change={selected.change} size="lg" /></div><div className="mt-5 flex items-center gap-3"><span className="font-mono text-[9px] tracking-[.12em] text-[#789095]">CAUSE</span><span className="h-px w-12 bg-[#c9f34a]" /><span className="truncate font-mono text-[10px] text-[#d6e3d2]">{activeCatalysts[0]?.tag ?? "AWAITING SIGNAL"}</span></div></div>
              <div className="self-end rounded-xl border border-white/[.13] bg-[#071012]/75 p-4 backdrop-blur-sm"><div className="flex items-center justify-between"><p className="eyebrow">DOMINANT CATALYST</p><Zap size={15} className="text-[#c9f34a]" /></div><p className="mt-3 font-display text-lg font-medium leading-snug text-white">{activeCatalysts[0]?.title ?? "材料を待機中"}</p><div className="mt-4 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#c9f34a]" style={{ width: `${Math.min(94, 24 + eventStrength * 5500)}%` }} /></div><span className="font-mono text-[10px] text-[#c9f34a]">{activeCatalysts[0]?.impact ?? 0}%</span></div></div>
            </div>
          </section>

          <div className="mt-6 grid gap-6 min-[760px]:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_370px]">
            <div className="min-w-0 space-y-6">
              <section className="panel-card relative overflow-hidden p-0">
                <div className="absolute left-0 top-0 h-full w-1 bg-[#c9f34a]" />
                <div className="flex flex-col justify-between gap-4 border-b border-white/[.09] px-5 py-5 sm:flex-row sm:items-center"><div className="flex items-center gap-4"><div className="hidden font-mono text-[10px] tracking-[.15em] text-[#c9f34a] sm:block">01</div><div><p className="eyebrow">PRICE ACTION / OHLC + VOLUME</p><p className="mt-1 font-display text-xl font-medium tracking-[-.03em] text-white">{selected.name}<span className="ml-2 font-mono text-xs font-normal text-[#7c8c91]">{selected.kind.toUpperCase()}</span></p></div></div><div className="flex items-center gap-2"><span className="rounded-md bg-white/[.05] px-2 py-1 font-mono text-[9px] text-[#a7b6b6]">CANDLE</span><span className="rounded-md border border-[#c9f34a]/20 bg-[#c9f34a]/[.07] px-2 py-1 font-mono text-[9px] text-[#c9f34a]">TICK / 5S</span></div></div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.07] bg-black/10 px-5 py-3"><div className="flex items-center gap-1 overflow-x-auto rounded-md border border-white/[.08] bg-white/[.025] p-1">{TIMEFRAMES.map((period) => <button key={period} onClick={() => setTimeframe(period)} className={`shrink-0 rounded px-2.5 py-1.5 font-mono text-[10px] transition ${timeframe === period ? "bg-[#c9f34a] text-[#10200e]" : "text-[#85959a] hover:bg-white/[.07] hover:text-white"}`}>{period}</button>)}</div><div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px]"><span className="text-[#738287]">O <b className="font-medium text-[#d8e1dc]">{formatMoney(candles.at(-1)?.open ?? selected.price, selected.kind === "Crypto" ? 3 : 2)}</b></span><span className="text-[#738287]">H <b className="font-medium text-[#d8e1dc]">{formatMoney(candles.at(-1)?.high ?? selected.price, selected.kind === "Crypto" ? 3 : 2)}</b></span><span className="text-[#738287]">L <b className="font-medium text-[#d8e1dc]">{formatMoney(candles.at(-1)?.low ?? selected.price, selected.kind === "Crypto" ? 3 : 2)}</b></span><span className="text-[#738287]">C <b className={`font-medium ${selected.change >= 0 ? "text-[#c9f34a]" : "text-[#ff917f]"}`}>{formatPrice(selected)}</b></span></div></div>
                <div className="h-[330px] px-2 pb-3 pt-4 min-[760px]:h-[390px] sm:px-4"><CandlestickPanel candles={candles} crypto={selected.kind === "Crypto"} /></div>
              </section>

              <section className="panel-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/[.09] px-5 py-4"><div><p className="eyebrow">MARKET BOARD</p><p className="mt-1 text-sm text-[#a6b5b7]">ニュースで動く、架空の銘柄群</p></div><div className="flex rounded-lg border border-white/[.08] bg-black/10 p-1">{(["all", "Stock", "Crypto"] as const).map((filter) => <button key={filter} onClick={() => setTab(filter)} className={`rounded-md px-2.5 py-1.5 font-mono text-[9px] transition ${tab === filter ? "bg-white/[.1] text-white" : "text-[#718187] hover:text-white"}`}>{filter === "all" ? "ALL" : filter.toUpperCase()}</button>)}</div></div>
                <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left"><thead><tr className="border-b border-white/[.06] font-mono text-[9px] tracking-[.12em] text-[#708085]"><th className="px-5 py-3 font-normal">INSTRUMENT</th><th className="px-4 py-3 font-normal">THESIS</th><th className="px-4 py-3 text-right font-normal">LAST</th><th className="px-5 py-3 text-right font-normal">DAY</th></tr></thead><tbody>{filteredAssets.map((asset) => <tr key={asset.id} onClick={() => setSelectedId(asset.id)} className={`group cursor-pointer border-b border-white/[.055] transition last:border-0 ${selected.id === asset.id ? "bg-[#c9f34a]/[.06]" : "hover:bg-white/[.035]"}`}><td className="px-5 py-3.5"><div className="flex items-center gap-3"><span className={`h-2 w-2 rounded-full ${asset.change >= 0 ? "bg-[#c9f34a]" : "bg-[#ff775f]"}`} /><div><p className="font-display text-sm font-medium text-white">{asset.code}<span className="ml-2 font-mono text-[9px] font-normal text-[#697a7f]">{asset.kind}</span></p><p className="text-[11px] text-[#829196]">{asset.name}</p></div></div></td><td className="px-4 py-3.5"><span className="rounded-sm bg-white/[.055] px-2 py-1 font-mono text-[9px] text-[#afbbbc]">{asset.signal}</span></td><td className="px-4 py-3.5 text-right font-mono text-sm text-white">{formatPrice(asset)}</td><td className="px-5 py-3.5 text-right"><ChangePill change={asset.change} /></td></tr>)}</tbody></table></div>
              </section>
            </div>

            <div className="space-y-6">
              <section className="panel-card p-5"><div className="flex items-center justify-between"><div><p className="eyebrow">ORDER TICKET</p><p className="mt-1 font-display text-lg font-medium text-white">{selected.code}</p></div><CandlestickChart size={19} className="text-[#c9f34a]" /></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-lg bg-white/[.04] p-3"><p className="eyebrow">AVAILABLE</p><p className="mt-1 font-mono text-sm text-white">{formatMoney(cash, 0)}</p></div><div className="rounded-lg bg-white/[.04] p-3"><p className="eyebrow">HELD</p><p className="mt-1 font-mono text-sm text-white">{selectedHolding.quantity} <span className="text-[10px] text-[#819196]">UNIT</span></p></div></div><div className="mt-4"><label className="eyebrow">QUANTITY</label><div className="mt-2 flex overflow-hidden rounded-lg border border-white/[.12] bg-black/20"><button onClick={() => setTradeQuantity((value) => Math.max(1, value - 1))} className="grid w-11 place-items-center border-r border-white/[.1] text-[#a7b6b6] transition hover:bg-white/[.06] hover:text-white"><Minus size={15} /></button><input value={tradeQuantity} onChange={(event) => setTradeQuantity(Number(event.target.value))} type="number" min={1} className="min-w-0 flex-1 bg-transparent px-3 py-3 text-center font-mono text-sm text-white outline-none" /><button onClick={() => setTradeQuantity((value) => value + 1)} className="grid w-11 place-items-center border-l border-white/[.1] text-[#a7b6b6] transition hover:bg-white/[.06] hover:text-white"><Plus size={15} /></button></div></div><div className="mt-4 flex items-center justify-between font-mono text-[10px]"><span className="text-[#7a898d]">EST. NOTIONAL</span><span className="text-white">{formatMoney(selected.price * Math.max(1, tradeQuantity || 1))}</span></div><div className="mt-4 grid grid-cols-2 gap-2"><Button onClick={() => trade("buy")} className="h-11 bg-[#c9f34a] font-display text-[11px] font-semibold tracking-[.08em] text-[#10200e] hover:bg-[#d8fa73]">BUY {selected.code}</Button><Button onClick={() => trade("sell")} variant="outline" className="h-11 border-[#ff775f]/35 bg-[#ff775f]/[.08] font-display text-[11px] font-semibold tracking-[.08em] text-[#ff9a8a] hover:bg-[#ff775f]/[.16] hover:text-white">SELL</Button></div><p className="mt-3 flex gap-1.5 text-[10px] leading-relaxed text-[#718187]"><Info size={13} className="mt-0.5 shrink-0" />ゲーム内通貨のみ。注文はこのシミュレーション市場の価格に反映されません。</p></section>

              <section className="panel-card relative overflow-hidden border-l-2 border-l-[#c9f34a]"><div className="flex items-center justify-between border-b border-white/[.09] px-5 py-4"><div><p className="eyebrow">CAUSE → PRICE</p><p className="mt-1 font-display text-lg font-medium text-white">因果メモ</p><p className="mt-0.5 text-[11px] text-[#7d8d91]">価格に効いている材料を優先表示</p></div><Newspaper size={17} className="text-[#c9f34a]" /></div><div className="divide-y divide-white/[.07]">{activeCatalysts.length > 0 ? activeCatalysts.map((event) => <CatalystCard key={event.id} event={event} assetId={selected.id} />) : <div className="p-5 text-sm text-[#8a999d]">この銘柄への直接的なニュース影響はありません。</div>}</div></section>

              <section className="panel-card overflow-hidden"><div className="flex items-center justify-between px-5 py-4"><div><p className="eyebrow">YOUR POSITION</p><p className="mt-1 text-sm text-[#a9b7b8]">保有は市場を動かさない</p></div><WalletCards size={17} className="text-[#9cadac]" /></div><div className="grid grid-cols-3 border-t border-white/[.09]"><MiniStat label="MARKET" value={formatMoney(marketValue, 0)} /><MiniStat label="CASH" value={formatMoney(cash, 0)} /><MiniStat label="P/L" value={`${positionPnL >= 0 ? "+" : ""}${formatMoney(positionPnL, 0)}`} tone={positionPnL >= 0 ? "lime" : "coral"} /></div></section>
            </div>
          </div>

          <section className="mt-6 grid gap-6 min-[760px]:grid-cols-[1.2fr_.8fr]">
            <section className="panel-card overflow-hidden"><div className="flex items-center justify-between border-b border-white/[.09] px-5 py-5"><div><p className="eyebrow">LIVE NEWSFLOW</p><p className="mt-1 font-display text-lg font-medium text-white">市場を動かす要因</p></div><span className="font-mono text-[10px] text-[#839398]">UPDATED / 5 SEC</span></div><div className="divide-y divide-white/[.07]">{events.map((event) => <article key={event.id} className="group grid gap-4 px-5 py-4 sm:grid-cols-[95px_1fr_auto]"><div><p className={`font-mono text-[9px] tracking-[.12em] ${event.direction === "up" ? "text-[#c9f34a]" : event.direction === "down" ? "text-[#ff917f]" : "text-[#a6b2b2]"}`}>{event.tag}</p><p className="mt-2 flex items-center gap-1 font-mono text-[10px] text-[#718187]"><Clock3 size={11} /> {event.age * 5 + 4}s ago</p></div><div><h3 className="font-display text-base font-medium text-white transition group-hover:text-[#d8fa73]">{event.title}</h3><p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-[#89989b]">{event.copy}</p></div><div className="flex items-start gap-2 sm:flex-col sm:items-end"><span className="font-mono text-[9px] text-[#718187]">{event.source}</span><span className={`flex items-center gap-1 font-mono text-xs ${event.direction === "up" ? "text-[#c9f34a]" : event.direction === "down" ? "text-[#ff917f]" : "text-white"}`}><DirectionIcon direction={event.direction} />{event.impact}</span></div></article>)}</div></section>

            <section className="relative overflow-hidden rounded-2xl border border-[#d19b4b]/25 bg-[#16130f] p-6"><img src={GACHA_IMAGE} alt="分析アーカイブのカプセル" className="absolute -right-14 -top-12 h-64 w-64 object-cover opacity-45 mix-blend-screen" /><div className="relative flex h-full flex-col"><div className="flex items-center justify-between"><div><p className="eyebrow text-[#f5c56b]">SEALED ANALYSIS ARCHIVE</p><p className="mt-1 font-mono text-[9px] tracking-[.1em] text-[#8e704c]">RECORD / {String(archive.length + 2001).padStart(4, "0")}</p></div><Gem size={18} className="text-[#f5c56b]" /></div><h2 className="mt-4 max-w-[240px] font-display text-2xl font-semibold leading-tight text-white">読むほど、記録が増える。</h2><p className="mt-3 max-w-[330px] text-xs leading-relaxed text-[#b49e86]">獲得物はプロフィール用の分析記録です。確率・市場価格・ニュース影響に一切作用しません。</p><div className="mt-auto flex items-center justify-between border-t border-[#d19b4b]/20 pt-5"><div><p className="font-mono text-[9px] tracking-[.12em] text-[#a78a6d]">AVAILABLE</p><p className="mt-1 font-mono text-xl text-[#f6cb72]">{credits} <span className="text-[10px]">CREDIT</span></p></div><Button onClick={() => { setGachaOpen(true); setGachaResult(null); }} className="bg-[#f6c96a] font-display text-[11px] font-semibold tracking-[.08em] text-[#1c1408] hover:bg-[#ffe09a]">UNSEAL RECORD</Button></div></div></section>
          </section>
        </div>
      </section>

      <button onClick={() => { setGachaOpen(true); setGachaResult(null); }} className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full border border-[#d19b4b]/35 bg-[#21170d] px-4 py-3 text-xs font-semibold tracking-[.08em] text-[#f6c96a] shadow-xl lg:hidden"><Archive size={15} /> {credits} CR</button>

      {gachaOpen && <div role="dialog" aria-modal="true" aria-label="Archive Gacha" className="fixed inset-0 z-50 grid place-items-center bg-[#030708]/75 p-4 backdrop-blur-md"><div className="gacha-modal relative w-full max-w-lg overflow-hidden rounded-2xl border border-[#d19b4b]/35 bg-[#15120d] p-6 shadow-2xl sm:p-8"><button onClick={() => setGachaOpen(false)} className="absolute right-4 top-4 rounded-full p-2 text-[#a98d70] transition hover:bg-white/10 hover:text-white" aria-label="閉じる"><X size={18} /></button>{!gachaResult ? <><img src={GACHA_IMAGE} alt="Archive gacha capsule" className="mx-auto h-40 w-40 rounded-full object-cover opacity-90 mix-blend-screen" /><div className="mt-2 text-center"><p className="eyebrow text-[#f6c96a]">ARCHIVE PULL</p><h2 className="mt-3 font-display text-3xl font-semibold text-white">市場には触れない報酬。</h2><p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#b8a08a]">100 Credit で分析アーカイブを1件開封します。内容はコレクション演出のみで、価格・ニュース・約定条件を変えません。</p><div className="mt-6 flex items-center justify-center gap-2 font-mono text-sm text-[#f6c96a]"><CircleDollarSign size={16} /> {credits} / 100 CREDIT</div><Button onClick={pullArchive} className="mt-6 h-12 w-full bg-[#f6c96a] font-display text-xs font-semibold tracking-[.13em] text-[#1d1509] hover:bg-[#ffe09a]">100 CREDIT で開封</Button><p className="mt-3 text-[10px] text-[#8c735c]">過去のアーカイブ: {archive.length} 件</p></div></> : <div className="py-6 text-center"><div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl border" style={{ color: gachaResult.accent, borderColor: `${gachaResult.accent}66`, backgroundColor: `${gachaResult.accent}12` }}><RewardIcon type={gachaResult.icon} /></div><p className="mt-7 font-mono text-[10px] tracking-[.18em]" style={{ color: gachaResult.accent }}>{gachaResult.rarity}</p><h2 className="mt-2 font-display text-3xl font-semibold text-white">{gachaResult.name}</h2><p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[#b8a08a]">{gachaResult.detail}</p><div className="mt-7 rounded-lg border border-white/10 bg-black/15 px-4 py-3 text-left text-[11px] leading-relaxed text-[#928273]"><span className="font-semibold text-[#d9b37a]">MARKET-SAFE:</span> この報酬は見た目・記録用途のみ。市場の価格計算・ニュース選択・取引結果には影響しません。</div><Button onClick={() => setGachaOpen(false)} className="mt-6 h-11 w-full bg-white text-[#172116] hover:bg-[#e6efe6]">ARCHIVE に保存</Button></div>}</div></div>}
    </main>
  );
}

function PulseRow({ label, value, tone }: { label: string; value: string; tone: "lime" | "coral" | "neutral" }) {
  const colors = { lime: "text-[#c9f34a]", coral: "text-[#ff917f]", neutral: "text-[#e7efea]" };
  return <div><div className="mb-1.5 flex items-center justify-between"><span className="font-mono text-[9px] tracking-[.13em] text-[#6c7d82]">{label}</span><span className={`font-mono text-[11px] ${colors[tone]}`}>{value}</span></div><div className="h-px bg-white/[.09]"><div className={`h-full ${tone === "coral" ? "bg-[#ff775f]" : tone === "lime" ? "bg-[#c9f34a]" : "bg-[#8fa09e]"}`} style={{ width: tone === "lime" ? "72%" : tone === "coral" ? "43%" : "56%" }} /></div></div>;
}

function ChangePill({ change, size = "sm" }: { change: number; size?: "sm" | "lg" }) {
  const up = change >= 0;
  return <span className={`inline-flex items-center gap-1 rounded-md font-mono ${size === "lg" ? "px-2.5 py-1 text-sm" : "px-2 py-1 text-[10px]"} ${up ? "bg-[#c9f34a]/[.11] text-[#c9f34a]" : "bg-[#ff775f]/[.11] text-[#ff917f]"}`}>{up ? <TrendingUp size={size === "lg" ? 15 : 12} /> : <TrendingDown size={size === "lg" ? 15 : 12} />}{up ? "+" : ""}{change.toFixed(2)}%</span>;
}

function CatalystCard({ event, assetId }: { event: MarketEvent; assetId: string }) {
  const effect = event.effect[assetId] ?? 0;
  const isUp = effect >= 0;
  return <div className="p-5"><div className="flex items-start justify-between gap-3"><div><p className={`font-mono text-[9px] tracking-[.12em] ${isUp ? "text-[#c9f34a]" : "text-[#ff917f]"}`}>{event.tag}</p><h3 className="mt-2 font-display text-sm font-medium leading-snug text-white">{event.title}</h3></div><span className={`mt-1 flex shrink-0 items-center gap-1 font-mono text-[11px] ${isUp ? "text-[#c9f34a]" : "text-[#ff917f]"}`}><DirectionIcon direction={isUp ? "up" : "down"} />{isUp ? "+" : ""}{(effect * 100).toFixed(1)}%</span></div><div className="mt-4 flex items-center gap-3"><div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[.08]"><div className={`h-full rounded-full ${isUp ? "bg-[#c9f34a]" : "bg-[#ff775f]"}`} style={{ width: `${event.impact}%` }} /></div><span className="font-mono text-[9px] text-[#849398]">IMPACT {event.impact}</span></div></div>;
}

function MiniStat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "lime" | "coral" }) {
  return <div className="min-w-0 border-r border-white/[.09] px-3 py-4 last:border-r-0"><p className="truncate font-mono text-[8px] tracking-[.11em] text-[#718187]">{label}</p><p className={`mt-1 truncate font-mono text-[11px] ${tone === "lime" ? "text-[#c9f34a]" : tone === "coral" ? "text-[#ff917f]" : "text-white"}`}>{value}</p></div>;
}

function CandlestickPanel({ candles, crypto }: { candles: Candle[]; crypto: boolean }) {
  const min = Math.min(...candles.map((candle) => candle.low));
  const max = Math.max(...candles.map((candle) => candle.high));
  const range = Math.max(max - min, max * 0.01);
  const frame = { width: 1040, height: 410, left: 64, right: 18, top: 16, priceHeight: 254, volumeTop: 305, volumeHeight: 68 };
  const chartWidth = frame.width - frame.left - frame.right;
  const step = chartWidth / candles.length;
  const maxVolume = Math.max(...candles.map((candle) => candle.volume));
  const y = (value: number) => frame.top + ((max - value) / range) * frame.priceHeight;
  const priceDigits = crypto ? 3 : 2;
  const last = candles.at(-1);

  return <div className="h-full overflow-x-auto"><svg viewBox={`0 0 ${frame.width} ${frame.height}`} className="h-full min-w-[650px] w-full" role="img" aria-label="ローソク足と出来高を表示する価格チャート"><defs><linearGradient id="chartFade" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#c9f34a" stopOpacity=".07" /><stop offset="1" stopColor="#c9f34a" stopOpacity="0" /></linearGradient></defs><rect x={frame.left} y={frame.top} width={chartWidth} height={frame.priceHeight} fill="url(#chartFade)" />{[0, 1, 2, 3, 4].map((index) => { const value = max - (range * index) / 4; const axisY = y(value); return <g key={index}><line x1={frame.left} x2={frame.width - frame.right} y1={axisY} y2={axisY} stroke="#ffffff" strokeOpacity=".07" strokeWidth="1" /><text x={frame.width - frame.right + 6} y={axisY + 3} fill="#6f8085" fontFamily="IBM Plex Mono" fontSize="10">{value.toFixed(priceDigits)}</text></g>; })}<line x1={frame.left} x2={frame.width - frame.right} y1={frame.volumeTop - 12} y2={frame.volumeTop - 12} stroke="#ffffff" strokeOpacity=".12" strokeWidth="1" /><text x={frame.left} y={frame.volumeTop - 18} fill="#718187" fontFamily="IBM Plex Mono" fontSize="9" letterSpacing="1.3">VOLUME</text>{candles.map((candle, index) => { const rising = candle.close >= candle.open; const color = rising ? "#c9f34a" : "#ff775f"; const center = frame.left + index * step + step / 2; const bodyTop = Math.min(y(candle.open), y(candle.close)); const bodyHeight = Math.max(2, Math.abs(y(candle.open) - y(candle.close))); const volumeHeight = (candle.volume / maxVolume) * frame.volumeHeight; return <g key={`${candle.time}-${index}`}><line x1={center} x2={center} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1.35" /><rect x={center - step * 0.3} y={bodyTop} width={Math.max(3, step * 0.6)} height={bodyHeight} rx=".6" fill={color} /><rect x={center - step * 0.3} y={frame.volumeTop + frame.volumeHeight - volumeHeight} width={Math.max(3, step * 0.6)} height={volumeHeight} fill={color} fillOpacity=".55" />{(index === 0 || index === candles.length - 1 || index % 8 === 0) && <text x={center} y={frame.volumeTop + frame.volumeHeight + 20} fill="#6f8085" fontFamily="IBM Plex Mono" fontSize="9" textAnchor="middle">{candle.time}</text>}</g>; })}{last && <g><line x1={frame.left} x2={frame.width - frame.right} y1={y(last.close)} y2={y(last.close)} stroke={last.close >= last.open ? "#c9f34a" : "#ff775f"} strokeOpacity=".65" strokeDasharray="3 4" /><rect x={frame.width - frame.right - 44} y={y(last.close) - 9} width="42" height="18" rx="3" fill={last.close >= last.open ? "#c9f34a" : "#ff775f"} /><text x={frame.width - frame.right - 23} y={y(last.close) + 3.5} fill="#10200e" fontFamily="IBM Plex Mono" fontSize="8" fontWeight="600" textAnchor="middle">LAST</text></g>}</svg></div>;
}
