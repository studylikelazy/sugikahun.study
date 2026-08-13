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
type NavigationSection = "markets" | "portfolio" | "newsflow";

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

type AssetProfile = {
  oneLine: string;
  archetype: string;
  audience: string;
  sensitivity: "HIGH" | "MID" | "LOW";
  risk: "HIGH" | "MID" | "LOW";
  strengths: [string, string, string];
  watch: string;
};

type GachaPack = {
  id: "signal" | "sector" | "style";
  label: string;
  kicker: string;
  cost: number;
  description: string;
  accent: string;
  icon: Reward["icon"];
  rewards: Reward[];
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
  { tag: "TECH / POSITIVE", title: "クラウド利用、思ったより伸びそう", copy: "企業のAI利用が予想より広がり、サーバーへの投資も少し早まりそうだ。AIインフラ関連に注目が集まっている。", source: "Pulse Wire", direction: "up", impact: 82, effect: { orca: 0.008, atlas: 0.003 } },
  { tag: "MACRO / CAUTION", title: "長期金利の上昇で、成長株は少し慎重に", copy: "金利が上がると、将来の成長が期待される銘柄ほど評価がゆれやすくなる。今は少し様子を見たい場面。", source: "Macro Desk", direction: "down", impact: 67, effect: { orca: -0.005, helio: -0.004, nova: -0.003 } },
  { tag: "ENERGY / POSITIVE", title: "地域の電力網づくり、計画が前進", copy: "送電網を強くする予算の方向性が見え、電力をためる・届ける企業への期待が高まっている。", source: "Sector Brief", direction: "up", impact: 74, effect: { nori: 0.007, sola: 0.002 } },
  { tag: "CRYPTO / POSITIVE", title: "決済ネットワークが、少し使いやすく", copy: "ネットワークの処理能力が上がり、取引が増える期待が出ている。関連プロトコルに資金が向かいやすい流れ。", source: "Chain Monitor", direction: "up", impact: 88, effect: { atlas: 0.009, nova: 0.005 } },
  { tag: "HEALTH / POSITIVE", title: "治療研究に、明るい途中経過", copy: "試験データが想定より良く、次の開発ステップへ進みやすくなった。ヘルスケア分野への注目が高まっている。", source: "Clinical Ledger", direction: "up", impact: 76, effect: { helio: 0.008 } },
  { tag: "MOBILITY / CAUTION", title: "部材の遅れで、生産ペースに注意", copy: "部品の到着が少し遅れ、短期的には納車台数へ影響するかもしれない。次の販売見通しがポイント。", source: "Supply Chain Now", direction: "down", impact: 72, effect: { sola: -0.007 } },
  { tag: "CRYPTO / CAUTION", title: "短期トレードの整理で、値動きが大きめ", copy: "借りた資金を使う取引の解消が増え、取引が少ない時間帯は価格が動きやすい。いったん落ち着きを待ちたい局面。", source: "Chain Monitor", direction: "down", impact: 63, effect: { atlas: -0.006, nova: -0.008 } },
  { tag: "FINANCE / POSITIVE", title: "効率よく稼ぐための計画を発表", copy: "手数料の伸ばし方とコストの見直しが示され、金融サービスの利益がよくなる期待が出ている。", source: "Capital Brief", direction: "up", impact: 71, effect: { vector: 0.007, lumen: 0.002 } },
  { tag: "MATERIALS / CAUTION", title: "資源価格が一服、素材株は様子見", copy: "需要の見通しを見直す動きで、資源価格がやや弱い。素材関連には短期的な売りが出ている。", source: "Commodity Wire", direction: "down", impact: 69, effect: { terra: -0.008 } },
  { tag: "GRID / POSITIVE", title: "電力をためて届ける新案件が前進", copy: "地域インフラの新しい案件が出てきて、電力網に関わる企業の受注への期待が高まっている。", source: "Sector Brief", direction: "up", impact: 79, effect: { quanta: 0.009, nori: 0.003 } },
  { tag: "CRYPTO / POSITIVE", title: "ネットワーク更新で、取引がもっと軽く", copy: "処理の速さと手数料の使いやすさが良くなる見込み。関連するネットワークに前向きな空気が広がっている。", source: "Chain Monitor", direction: "up", impact: 84, effect: { rift: 0.011, etheris: 0.004, aura: 0.003 } },
  { tag: "RWA / POSITIVE", title: "デジタル化した資産の利用が広がる", copy: "現実の資産をデジタルで扱うサービスの利用範囲が広がり、この分野へ資金が入り始めている。", source: "Ledger Review", direction: "up", impact: 73, effect: { mint: 0.009, nova: 0.002 } },
];

const STARTING_EVENTS: MarketEvent[] = [
  { id: "seed-1", tag: "TECH / POSITIVE", title: "クラウド利用、思ったより伸びそう", copy: "企業のAI利用が予想より広がり、サーバーへの投資も少し早まりそうだ。AIインフラ関連に注目が集まっている。", source: "Pulse Wire", direction: "up", impact: 82, effect: { orca: 0.008, atlas: 0.003 }, age: 1 },
  { id: "seed-2", tag: "MACRO / CAUTION", title: "長期金利の上昇で、成長株は少し慎重に", copy: "金利が上がると、将来の成長が期待される銘柄ほど評価がゆれやすくなる。今は少し様子を見たい場面。", source: "Macro Desk", direction: "down", impact: 67, effect: { orca: -0.005, helio: -0.004 }, age: 4 },
  { id: "seed-3", tag: "CRYPTO / POSITIVE", title: "決済ネットワークが、少し使いやすく", copy: "ネットワークの処理能力が上がり、取引が増える期待が出ている。関連プロトコルに資金が向かいやすい流れ。", source: "Chain Monitor", direction: "up", impact: 88, effect: { atlas: 0.009, nova: 0.005 }, age: 8 },
];

const REWARDS: Reward[] = [
  { id: "pulse", name: "Open Signal", rarity: "COMMON", detail: "分析アーカイブの初期シグナル。プロフィールに記録されます。", accent: "#b7c2c9", icon: "signal" },
  { id: "wire", name: "Wire Reader", rarity: "RARE", detail: "ニュースを読む交易者のための限定アーカイブバッジ。", accent: "#7ed8ff", icon: "news" },
  { id: "radar", name: "Second Horizon", rarity: "EPIC", detail: "二次的な市場波及を追うための観測レコード。", accent: "#cf9cff", icon: "radar" },
  { id: "thesis", name: "Thesis 01", rarity: "LEGEND", detail: "仮説を持続させた記録。純粋にコレクション用のレアバッジ。", accent: "#f6c96a", icon: "badge" },
];

const RARITY_META: Record<Reward["rarity"], { label: string; rate: string; color: string; border: string; background: string }> = {
  COMMON: { label: "COMMON", rate: "60%", color: "#bdd7ef", border: "#4f9bff55", background: "#4f9bff12" },
  RARE: { label: "RARE", rate: "30%", color: "#72d3ff", border: "#38bdf855", background: "#38bdf812" },
  EPIC: { label: "EPIC", rate: "9%", color: "#b9a4ff", border: "#9b7dff55", background: "#9b7dff12" },
  LEGEND: { label: "LEGEND", rate: "1%", color: "#ffd178", border: "#f6c96a66", background: "#f6c96a12" },
};

const COMPANY_PROFILES: Record<string, AssetProfile> = {
  orca: { oneLine: "企業のAI活用を支える、計算基盤の設計者。", archetype: "AI INFRA", audience: "大企業・開発者", sensitivity: "HIGH", risk: "HIGH", strengths: ["推論需要", "クラウド投資", "開発者採用"], watch: "設備投資の鈍化" },
  vector: { oneLine: "決済・資産管理の流れを支える、デジタル金融プレイヤー。", archetype: "FINANCE", audience: "事業者・個人", sensitivity: "MID", risk: "MID", strengths: ["金利環境", "手数料収入", "資本効率"], watch: "信用コストの上昇" },
  nori: { oneLine: "発電と貯蔵をつなぎ、次世代の電力網を支える。", archetype: "ENERGY", audience: "電力会社・自治体", sensitivity: "MID", risk: "MID", strengths: ["送電網投資", "電力需要", "政策支援"], watch: "資源コストの上昇" },
  helio: { oneLine: "治療の選択肢を増やす、研究開発型のヘルスケア企業。", archetype: "HEALTH", audience: "医療機関・患者", sensitivity: "HIGH", risk: "HIGH", strengths: ["治験進捗", "承認イベント", "研究成果"], watch: "開発スケジュールの遅延" },
  sola: { oneLine: "移動をもっと軽くする、都市型モビリティの新世代。", archetype: "MOBILITY", audience: "都市生活者", sensitivity: "HIGH", risk: "MID", strengths: ["販売台数", "供給網", "航続性能"], watch: "部材調達の混乱" },
  lumen: { oneLine: "日々の買い物データから、新しい消費体験を作る。", archetype: "CONSUMER", audience: "若年層・生活者", sensitivity: "MID", risk: "MID", strengths: ["消費データ", "会員数", "店舗拡大"], watch: "景気減速" },
  terra: { oneLine: "未来の建設と製造を支える、素材のアップデーター。", archetype: "MATERIALS", audience: "製造業・建設業", sensitivity: "MID", risk: "MID", strengths: ["資源価格", "在庫水準", "設備需要"], watch: "商品市況の反落" },
  quanta: { oneLine: "電気を途切れさせない、スマートグリッドの挑戦者。", archetype: "UTILITY", audience: "自治体・事業者", sensitivity: "LOW", risk: "LOW", strengths: ["インフラ案件", "長期契約", "送電網更新"], watch: "入札の遅延" },
  atlas: { oneLine: "速く、誰でも使えるネットワークを目指す基盤プロトコル。", archetype: "LAYER 1", audience: "開発者・コミュニティ", sensitivity: "HIGH", risk: "HIGH", strengths: ["利用者数", "ネットワーク更新", "開発者活動"], watch: "取引量の低下" },
  nova: { oneLine: "オンチェーン上の資金の流れをなめらかにする。", archetype: "DEFI", audience: "トレーダー・開発者", sensitivity: "HIGH", risk: "HIGH", strengths: ["流動性", "金利水準", "プロトコル利用"], watch: "清算の増加" },
  rift: { oneLine: "大きなネットワークをもっと軽くする、拡張レイヤー。", archetype: "LAYER 2", audience: "開発者・ゲーマー", sensitivity: "HIGH", risk: "HIGH", strengths: ["処理速度", "手数料", "アプリ数"], watch: "競合の台頭" },
  etheris: { oneLine: "アプリと資産をつなぐ、プログラム可能なチェーン。", archetype: "SMART CHAIN", audience: "開発者・クリエイター", sensitivity: "MID", risk: "HIGH", strengths: ["ステーキング", "アプリ利用", "アップグレード"], watch: "ネットワーク混雑" },
  mint: { oneLine: "リアルな価値を、デジタルに持ち運べる形へ。", archetype: "RWA", audience: "投資家・事業者", sensitivity: "MID", risk: "MID", strengths: ["発行額", "提携", "利用領域"], watch: "規制環境の変化" },
  aura: { oneLine: "交換をもっと身近にする、コミュニティ主導のDEX。", archetype: "DEX", audience: "トレーダー・コミュニティ", sensitivity: "HIGH", risk: "HIGH", strengths: ["取引量", "流動性", "新規ペア"], watch: "短期資金の流出" },
};

const GACHA_PACKS: GachaPack[] = [
  { id: "signal", label: "SIGNAL DROP", kicker: "EVERYDAY", cost: 100, description: "ニュースを読むための、基本コレクション。", accent: "#f6c96a", icon: "signal", rewards: REWARDS },
  { id: "sector", label: "SECTOR FILE", kicker: "THEME", cost: 150, description: "業界ごとの推しポイントを集めるファイル。", accent: "#7ed8ff", icon: "news", rewards: [
    { id: "grid", name: "Grid Runner", rarity: "COMMON", detail: "インフラ領域を知るためのセクターノート。", accent: "#7ed8ff", icon: "news" },
    { id: "health", name: "Health Scout", rarity: "RARE", detail: "研究進捗を読むためのファイルバッジ。", accent: "#7ed8ff", icon: "radar" },
    { id: "chain", name: "Chain Atlas", rarity: "EPIC", detail: "ネットワーク地図を集めたスペシャル記録。", accent: "#7ed8ff", icon: "badge" },
    { id: "sector-legend", name: "Sector Zero", rarity: "LEGEND", detail: "業界のつながりを見通す、限定アーカイブ。", accent: "#7ed8ff", icon: "badge" },
  ] },
  { id: "style", label: "PULSE ID", kicker: "STYLE", cost: 220, description: "自分のトレードスタイルを彩るプロフィール記録。", accent: "#cf9cff", icon: "badge", rewards: [
    { id: "reader", name: "News Reader", rarity: "COMMON", detail: "ニュースを読むプレイヤーのIDカード。", accent: "#cf9cff", icon: "news" },
    { id: "calm", name: "Calm Operator", rarity: "RARE", detail: "落ち着いた判断を記録するスタイルバッジ。", accent: "#cf9cff", icon: "signal" },
    { id: "drift", name: "Trend Drifter", rarity: "EPIC", detail: "流れを追う感覚を映したプロフィール記録。", accent: "#cf9cff", icon: "radar" },
    { id: "midnight", name: "Midnight Thesis", rarity: "LEGEND", detail: "自分の仮説を持つ人のための限定ID。", accent: "#cf9cff", icon: "badge" },
  ] },
];

const formatMoney = (value: number, precision = 2) =>
  new Intl.NumberFormat("ja-JP", { style: "currency", currency: "USD", minimumFractionDigits: precision, maximumFractionDigits: precision }).format(value);

const formatPrice = (asset: Asset) => formatMoney(asset.price, asset.kind === "Crypto" ? 3 : 2);

const TIMEFRAMES: Timeframe[] = ["1M", "5M", "15M", "1H", "1D"];

function createCandles(asset: Asset, timeframe: Timeframe): Candle[] {
  const count = timeframe === "1M" ? 44 : timeframe === "5M" ? 38 : timeframe === "15M" ? 34 : timeframe === "1H" ? 30 : 26;
  const scale = asset.kind === "Crypto" ? 0.024 : 0.012;
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [activePack, setActivePack] = useState<GachaPack | null>(null);
  const [activeSection, setActiveSection] = useState<NavigationSection>("markets");
  const [archiveFilter, setArchiveFilter] = useState<"ALL" | Reward["rarity"]>("ALL");
  const [chartCandles, setChartCandles] = useState<Candle[]>(() => createCandles(INITIAL_ASSETS[0], "5M"));

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
  const positions = useMemo(() => Object.entries(holdings).filter(([, holding]) => holding.quantity > 0).map(([id, holding]) => {
    const asset = assets.find((item) => item.id === id);
    const value = (asset?.price ?? 0) * holding.quantity;
    return { asset, ...holding, value, pnl: value - holding.avgCost * holding.quantity };
  }).filter((position) => position.asset), [assets, holdings]);
  const activeCatalysts = useMemo(() => events.filter((event) => event.effect[selected.id] !== undefined).slice(0, 3), [events, selected.id]);
  const selectedProfile = COMPANY_PROFILES[selected.id];
  const visibleArchive = archiveFilter === "ALL" ? archive : archive.filter((reward) => reward.rarity === archiveFilter);

  useEffect(() => {
    if (!profileOpen) return;
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileOpen(false);
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [profileOpen]);

  useEffect(() => {
    setChartCandles(createCandles(selected, timeframe));
  }, [selectedId, timeframe]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setAssets((current) =>
        current.map((asset) => {
          const weightedEffect = events.reduce((sum, event) => sum + (event.effect[asset.id] ?? 0) * Math.max(0.18, 1 - event.age * 0.11), 0);
          const microMove = (Math.random() - 0.5) * (asset.kind === "Crypto" ? 0.028 : 0.014);
          const move = weightedEffect * 0.82 + microMove;
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

  useEffect(() => {
    if (tick === 1) return;
    setChartCandles((current) => {
      const previous = current.at(-1);
      if (!previous) return current;
      const nextClose = selected.price;
      const volatility = selected.kind === "Crypto" ? 0.008 : 0.004;
      const excursion = Math.max(Math.abs(nextClose - previous.close), nextClose * volatility * 0.55);
      const completed = { ...previous, time: timeframe === "1D" ? `D-${tick}` : `${String(9 + Math.floor(tick / 12)).padStart(2, "0")}:${String((tick * 5) % 60).padStart(2, "0")}` };
      const next: Candle = {
        time: "NOW",
        open: previous.close,
        high: Math.max(previous.close, nextClose) + excursion * (0.35 + Math.random() * 0.35),
        low: Math.max(selected.kind === "Crypto" ? 0.05 : 2, Math.min(previous.close, nextClose) - excursion * (0.35 + Math.random() * 0.35)),
        close: nextClose,
        volume: Math.round(previous.volume * (0.78 + Math.random() * 0.52)),
      };
      return [...current.slice(1, -1), completed, next];
    });
  }, [tick, selected.price, selected.kind, timeframe]);

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

  const pullArchive = (pack: GachaPack) => {
    if (credits < pack.cost) return toast.error("Archive Credit が足りません", { description: "売買を記録すると Credit を獲得できます。" });
    const roll = Math.random();
    const reward = roll > 0.99 ? pack.rewards[3] : roll > 0.9 ? pack.rewards[2] : roll > 0.6 ? pack.rewards[1] : pack.rewards[0];
    setCredits((current) => current - pack.cost);
    setGachaResult(reward);
    setArchive((current) => [reward, ...current]);
    toast.success(`${RARITY_META[reward.rarity].label} を獲得`, { description: `${reward.name} をアーカイブに保存しました。` });
  };

  const selectedHolding = holdings[selected.id] ?? { quantity: 0, avgCost: 0 };
  const eventStrength = activeCatalysts.reduce((sum, event) => sum + Math.abs(event.effect[selected.id] ?? 0), 0);
  const navigateTo = (section: NavigationSection) => {
    setActiveSection(section);
    document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="market-shell min-h-screen bg-[#081115] text-[#e9efea] lg:grid lg:grid-cols-[278px_minmax(0,1fr)]">
      <aside className="market-sidebar border-b border-white/10 bg-[#0b1519]/95 px-5 py-5 lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:w-[278px] lg:border-b-0 lg:border-r lg:px-6 lg:py-7">
        <div className="flex items-center justify-between lg:block">
          <div className="flex items-center gap-3">
            <img className="h-10 w-10 rounded-[10px] bg-[#4f9bff] object-cover p-1 shadow-[0_0_24px_rgba(79,155,255,.22)]" src={LOGO_IMAGE} alt="MARKET PULSE" />
            <div>
              <p className="font-display text-[15px] font-bold tracking-[0.14em] text-white">MARKET PULSE</p>
              <p className="font-mono text-[9px] tracking-[0.18em] text-[#859398]">SIMULATION DESK</p>
            </div>
          </div>
          <div className="flex items-center gap-2 lg:mt-12 lg:block">
            <span className="live-dot inline-flex items-center gap-2 rounded-full border border-[#4f9bff]/30 bg-[#4f9bff]/[.1] px-2.5 py-1 font-mono text-[9px] tracking-[0.14em] text-[#8fc5ff]"><span className="h-1.5 w-1.5 rounded-full bg-[#4f9bff]" />LIVE SIM</span>
          </div>
        </div>

        <div className="relative mt-8 hidden overflow-hidden border-y border-white/[.09] py-5 lg:block">
          <p className="eyebrow text-[#74b5ff]">MARKET PULSE / 01</p>
          <p className="mt-2 font-display text-[28px] font-bold leading-[.88] tracking-[-.09em] text-white">READ<br />THE<br /><span className="text-[#74b5ff]">PULSE.</span></p>
          <svg viewBox="0 0 230 38" className="mt-5 h-8 w-[230px] text-[#74b5ff]" fill="none" aria-hidden="true"><path d="M0 22h26l11-12 12 22 18-29 15 20h35l11-9 10 13 14-22 13 17h45" stroke="currentColor" strokeWidth="1.6" /><path d="M0 31h230" stroke="currentColor" strokeOpacity=".22" strokeWidth="1" /></svg>
          <p className="mt-3 max-w-[190px] font-mono text-[9px] leading-relaxed text-[#718187]">価格の変化を、ニュースの因果から読むための市場レール。</p>
        </div>

        <nav className="mt-6 hidden space-y-1 lg:block" aria-label="市場画面の移動">
          <SideNavButton active={activeSection === "markets"} icon={<LineChart size={16} />} label="MARKETS" onClick={() => navigateTo("markets")} />
          <SideNavButton active={activeSection === "portfolio"} icon={<WalletCards size={16} />} label="PORTFOLIO" onClick={() => navigateTo("portfolio")} />
          <SideNavButton active={activeSection === "newsflow"} icon={<Newspaper size={16} />} label="NEWSFLOW" onClick={() => navigateTo("newsflow")} />
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
          <div className="flex items-center gap-3"><img src={LOGO_IMAGE} alt="" className="h-9 w-9 rounded-lg bg-[#4f9bff] p-1" /><div><p className="eyebrow">THE OPEN / MARKET PULSE</p><h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-white">知る。選ぶ。動く。</h1></div></div>
          <div className="flex items-center gap-3"><button className="relative rounded-full p-2 text-[#9babaf] transition hover:bg-white/5 hover:text-white" aria-label="通知"><Bell size={18} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#4f9bff]" /></button><div className="hidden h-8 border-l border-white/10 sm:block" /><div className="hidden text-right sm:block"><p className="font-mono text-[9px] tracking-[.14em] text-[#718187]">SESSION</p><p className="font-mono text-[11px] text-white">JP / SIM-01</p></div></div>
        </header>

        <div className="px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
          <section id="markets" className="relative scroll-mt-24 overflow-hidden rounded-2xl border border-[#4f9bff]/25 bg-[#111d21] shadow-[0_30px_60px_rgba(0,0,0,.2)]">
            <img src={HERO_IMAGE} alt="市場データを表現した抽象的な夜の金融ニュースルーム" className="absolute inset-0 h-full w-full object-cover opacity-55" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,17,21,.98)_0%,rgba(8,17,21,.88)_40%,rgba(8,17,21,.33)_100%)]" />
            <div className="relative grid min-h-[245px] gap-6 p-6 min-[680px]:grid-cols-[1fr_310px] sm:p-8 lg:p-9">
              <div className="max-w-xl self-end"><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-3 py-1 font-mono text-[9px] tracking-[.16em] text-[#c6d1d0]"><Radio size={11} className="text-[#4f9bff]" /> MARKET IS MOVING</div><p className="eyebrow text-[#74b5ff]">SELECTED INSTRUMENT / PRICE TAPE</p><div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1"><h2 className="font-display text-5xl font-bold leading-none tracking-[-.08em] text-white sm:text-6xl">{selected.code}</h2><p className="mb-1 text-sm text-[#b5c3c4]">{selected.name}</p></div><div className="mt-5 flex items-end gap-4"><p className="font-mono text-4xl tracking-[-.08em] text-white">{formatPrice(selected)}</p><ChangePill change={selected.change} size="lg" /></div><div className="mt-4 rounded-lg border border-[#4f9bff]/25 bg-[#4f9bff]/[.09] px-3 py-2"><p className="font-mono text-[10px] leading-relaxed text-[#cbe4ff]"><span className="font-semibold text-[#7eb9ff]">いまの動き：</span>{selected.change >= 0 ? "上がっています" : "下がっています"}。主な理由は「{activeCatalysts[0]?.title ?? "新しい材料を待っています"}」</p></div><div className="mt-4 flex items-center gap-3"><span className="font-mono text-[9px] tracking-[.12em] text-[#789095]">CAUSE</span><span className="h-px w-12 bg-[#4f9bff]" /><span className="truncate font-mono text-[10px] text-[#d6e3d2]">{activeCatalysts[0]?.tag ?? "AWAITING SIGNAL"}</span></div></div>
              <div className="self-end rounded-xl border border-[#4f9bff]/25 bg-[#071012]/75 p-4 backdrop-blur-sm"><div className="flex items-center justify-between"><p className="eyebrow">DOMINANT CATALYST</p><Zap size={15} className="text-[#74b5ff]" /></div><p className="mt-3 font-display text-lg font-medium leading-snug text-white">{activeCatalysts[0]?.title ?? "材料を待機中"}</p><div className="mt-4 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#4f9bff]" style={{ width: `${Math.min(94, 24 + eventStrength * 5500)}%` }} /></div><span className="font-mono text-[10px] text-[#74b5ff]">{activeCatalysts[0]?.impact ?? 0}%</span></div></div>
            </div>
          </section>

          <section className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-white/[.09] bg-white/[.025] px-4 py-3"><span className="mr-1 font-mono text-[9px] tracking-[.14em] text-[#60a5fa]">PLAY LOOP</span><span className="rounded-md bg-white/[.06] px-2.5 py-1 font-mono text-[10px] text-white">1. ニュースを読む</span><ChevronRight size={13} className="text-[#718187]" /><span className="rounded-md bg-white/[.06] px-2.5 py-1 font-mono text-[10px] text-white">2. 特徴を知る</span><ChevronRight size={13} className="text-[#718187]" /><span className="rounded-md bg-[#4f9bff]/[.14] px-2.5 py-1 font-mono text-[10px] text-[#74b5ff]">3. 売買する</span><span className="ml-auto font-mono text-[9px] text-[#718187]">読み終えたら、決めよう。</span></section>

          <div id="portfolio" className="scroll-mt-24"><AssetOverview cash={cash} marketValue={marketValue} equity={equity} pnl={positionPnL} positions={positions} /></div>

          <div className="mt-5 grid gap-6 min-[760px]:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_370px]">
            <div className="min-w-0 space-y-6">
              <section className="panel-card relative overflow-hidden p-0">
                <div className="absolute left-0 top-0 h-full w-1 bg-[#4f9bff]" />
                <div className="flex flex-col justify-between gap-4 border-b border-white/[.09] px-5 py-5 sm:flex-row sm:items-center"><div className="flex items-center gap-4"><div className="hidden font-mono text-[10px] tracking-[.15em] text-[#74b5ff] sm:block">01</div><div><p className="eyebrow">PRICE ACTION / OHLC + VOLUME</p><p className="mt-1 font-display text-xl font-medium tracking-[-.03em] text-white">{selected.name}<span className="ml-2 font-mono text-xs font-normal text-[#7c8c91]">{selected.kind.toUpperCase()}</span></p></div></div><div className="flex items-center gap-2"><span className="rounded-md bg-white/[.05] px-2 py-1 font-mono text-[9px] text-[#a7b6b6]">CANDLE</span><span className="rounded-md border border-[#4f9bff]/25 bg-[#4f9bff]/[.09] px-2 py-1 font-mono text-[9px] text-[#74b5ff]">TICK / 5S</span></div></div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.07] bg-black/10 px-5 py-3"><div className="flex items-center gap-1 overflow-x-auto rounded-md border border-white/[.08] bg-white/[.025] p-1">{TIMEFRAMES.map((period) => <button key={period} onClick={() => setTimeframe(period)} className={`shrink-0 rounded px-2.5 py-1.5 font-mono text-[10px] transition ${timeframe === period ? "bg-[#4f9bff] text-white" : "text-[#85959a] hover:bg-white/[.07] hover:text-white"}`}>{period}</button>)}</div><div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px]"><span className="text-[#738287]">O <b className="font-medium text-[#d8e1dc]">{formatMoney(chartCandles.at(-1)?.open ?? selected.price, selected.kind === "Crypto" ? 3 : 2)}</b></span><span className="text-[#738287]">H <b className="font-medium text-[#d8e1dc]">{formatMoney(chartCandles.at(-1)?.high ?? selected.price, selected.kind === "Crypto" ? 3 : 2)}</b></span><span className="text-[#738287]">L <b className="font-medium text-[#d8e1dc]">{formatMoney(chartCandles.at(-1)?.low ?? selected.price, selected.kind === "Crypto" ? 3 : 2)}</b></span><span className="text-[#738287]">C <b className={`font-medium ${selected.change >= 0 ? "text-[#5ee8b0]" : "text-[#ff9e9e]"}`}>{formatPrice(selected)}</b></span></div></div>
                <div className="h-[330px] px-2 pb-3 pt-4 min-[760px]:h-[390px] sm:px-4"><BlueCandlestickPanel candles={chartCandles} crypto={selected.kind === "Crypto"} /></div>
              </section>

              <section className="panel-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/[.09] px-5 py-4"><div><p className="eyebrow">MARKET BOARD</p><p className="mt-1 text-sm text-[#a6b5b7]">ニュースで動く、架空の銘柄群</p></div><div className="flex rounded-lg border border-white/[.08] bg-black/10 p-1">{(["all", "Stock", "Crypto"] as const).map((filter) => <button key={filter} onClick={() => setTab(filter)} className={`rounded-md px-2.5 py-1.5 font-mono text-[9px] transition ${tab === filter ? "bg-white/[.1] text-white" : "text-[#718187] hover:text-white"}`}>{filter === "all" ? "ALL" : filter.toUpperCase()}</button>)}</div></div>
                <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left"><thead><tr className="border-b border-white/[.06] font-mono text-[9px] tracking-[.12em] text-[#708085]"><th className="px-5 py-3 font-normal">INSTRUMENT</th><th className="px-4 py-3 font-normal">THESIS</th><th className="px-4 py-3 text-right font-normal">LAST</th><th className="px-5 py-3 text-right font-normal">DAY</th></tr></thead><tbody>{filteredAssets.map((asset) => <tr key={asset.id} onClick={() => setSelectedId(asset.id)} className={`group cursor-pointer border-b border-white/[.055] transition last:border-0 ${selected.id === asset.id ? "bg-[#4f9bff]/[.08]" : "hover:bg-[#4f9bff]/[.035]"}`}><td className="px-5 py-3.5"><div className="flex items-center gap-3"><span className={`h-2 w-2 rounded-full ${asset.change >= 0 ? "bg-[#36d399]" : "bg-[#ff7474]"}`} /><div><p className="font-display text-sm font-medium text-white">{asset.code}<span className="ml-2 font-mono text-[9px] font-normal text-[#697a7f]">{asset.kind}</span></p><p className="text-[11px] text-[#829196]">{asset.name}</p></div></div></td><td className="px-4 py-3.5"><span className="rounded-sm bg-white/[.055] px-2 py-1 font-mono text-[9px] text-[#afbbbc]">{asset.signal}</span></td><td className="px-4 py-3.5 text-right font-mono text-sm text-white">{formatPrice(asset)}</td><td className="px-5 py-3.5 text-right"><ChangePill change={asset.change} /></td></tr>)}</tbody></table></div>
              </section>
            </div>

            <div className="space-y-6">
              <section className="panel-card p-5"><div className="flex items-center justify-between"><div><p className="eyebrow">ORDER TICKET</p><p className="mt-1 font-display text-lg font-medium text-white">{selected.code}</p></div><CandlestickChart size={19} className="text-[#60a5fa]" /></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-lg border border-[#4f9bff]/15 bg-[#4f9bff]/[.08] p-3"><p className="eyebrow text-[#74b5ff]">手元資金</p><p className="mt-1 font-mono text-sm text-white">{formatMoney(cash, 0)}</p></div><div className="rounded-lg bg-white/[.04] p-3"><p className="eyebrow">この銘柄の保有</p><p className="mt-1 font-mono text-sm text-white">{selectedHolding.quantity} <span className="text-[10px] text-[#819196]">UNIT</span></p></div></div><div className="mt-4"><label className="eyebrow">QUANTITY</label><div className="mt-2 flex overflow-hidden rounded-lg border border-white/[.12] bg-black/20"><button onClick={() => setTradeQuantity((value) => Math.max(1, value - 1))} className="grid w-11 place-items-center border-r border-white/[.1] text-[#a7b6b6] transition hover:bg-white/[.06] hover:text-white"><Minus size={15} /></button><input value={tradeQuantity} onChange={(event) => setTradeQuantity(Number(event.target.value))} type="number" min={1} className="min-w-0 flex-1 bg-transparent px-3 py-3 text-center font-mono text-sm text-white outline-none" /><button onClick={() => setTradeQuantity((value) => value + 1)} className="grid w-11 place-items-center border-l border-white/[.1] text-[#a7b6b6] transition hover:bg-white/[.06] hover:text-white"><Plus size={15} /></button></div></div><div className="mt-4 flex items-center justify-between font-mono text-[10px]"><span className="text-[#7a898d]">この注文で使う金額</span><span className="text-white">{formatMoney(selected.price * Math.max(1, tradeQuantity || 1))}</span></div><div className="mt-4 grid grid-cols-2 gap-2"><Button onClick={() => trade("buy")} className="h-11 bg-[#4f9bff] font-display text-[11px] font-semibold tracking-[.08em] text-white hover:bg-[#72b2ff]">BUY {selected.code}</Button><Button onClick={() => trade("sell")} variant="outline" className="h-11 border-[#ff7474]/35 bg-[#ff7474]/[.08] font-display text-[11px] font-semibold tracking-[.08em] text-[#ff9e9e] hover:bg-[#ff7474]/[.16] hover:text-white">SELL</Button></div><p className="mt-3 flex gap-1.5 text-[10px] leading-relaxed text-[#718187]"><Info size={13} className="mt-0.5 shrink-0" />ゲーム内通貨のみ。注文はこのシミュレーション市場の価格に反映されません。</p></section>

              <ProfilePreview profile={selectedProfile} asset={selected} onOpen={() => setProfileOpen(true)} />

              <section className="panel-card relative overflow-hidden border-l-2 border-l-[#4f9bff]"><div className="flex items-center justify-between border-b border-white/[.09] px-5 py-4"><div><p className="eyebrow">CAUSE → PRICE</p><p className="mt-1 font-display text-lg font-medium text-white">因果メモ</p><p className="mt-0.5 text-[11px] text-[#7d8d91]">価格に効いている材料を優先表示</p></div><Newspaper size={17} className="text-[#74b5ff]" /></div><div className="divide-y divide-white/[.07]">{activeCatalysts.length > 0 ? activeCatalysts.map((event) => <CatalystCard key={event.id} event={event} assetId={selected.id} />) : <div className="p-5 text-sm text-[#8a999d]">この銘柄への直接的なニュース影響はありません。</div>}</div></section>

              <section className="panel-card overflow-hidden"><div className="flex items-center justify-between px-5 py-4"><div><p className="eyebrow">YOUR POSITION</p><p className="mt-1 text-sm text-[#a9b7b8]">保有は市場を動かさない</p></div><WalletCards size={17} className="text-[#9cadac]" /></div><div className="grid grid-cols-3 border-t border-white/[.09]"><MiniStat label="MARKET" value={formatMoney(marketValue, 0)} /><MiniStat label="CASH" value={formatMoney(cash, 0)} /><MiniStat label="P/L" value={`${positionPnL >= 0 ? "+" : ""}${formatMoney(positionPnL, 0)}`} tone={positionPnL >= 0 ? "lime" : "coral"} /></div></section>
            </div>
          </div>

          <section className="mt-6 grid gap-6 min-[760px]:grid-cols-[1.2fr_.8fr]">
            <section id="newsflow" className="panel-card scroll-mt-24 overflow-hidden"><div className="flex items-center justify-between border-b border-white/[.09] px-5 py-5"><div><p className="eyebrow">LIVE NEWSFLOW</p><p className="mt-1 font-display text-lg font-medium text-white">市場を動かす要因</p></div><span className="font-mono text-[10px] text-[#839398]">UPDATED / 5 SEC</span></div><div className="divide-y divide-white/[.07]">{events.map((event) => <article key={event.id} className="group grid gap-4 px-5 py-4 sm:grid-cols-[95px_1fr_auto]"><div><p className={`font-mono text-[9px] tracking-[.12em] ${event.direction === "up" ? "text-[#74b5ff]" : event.direction === "down" ? "text-[#ff9e9e]" : "text-[#a6b2b2]"}`}>{event.tag}</p><p className="mt-2 flex items-center gap-1 font-mono text-[10px] text-[#718187]"><Clock3 size={11} /> {event.age * 5 + 4}s ago</p></div><div><h3 className="font-display text-base font-medium leading-relaxed text-white transition group-hover:text-[#a9d2ff]">{event.title}</h3><p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-[#89989b]">{event.copy}</p></div><div className="flex items-start gap-2 sm:flex-col sm:items-end"><span className="font-mono text-[9px] text-[#718187]">{event.source}</span><span className={`flex items-center gap-1 font-mono text-xs ${event.direction === "up" ? "text-[#74b5ff]" : event.direction === "down" ? "text-[#ff9e9e]" : "text-white"}`}><DirectionIcon direction={event.direction} />{event.impact}</span></div></article>)}</div></section>

            <section className="relative overflow-hidden rounded-2xl border border-[#d19b4b]/25 bg-[#16130f] p-6"><img src={GACHA_IMAGE} alt="分析アーカイブのカプセル" className="absolute -right-14 -top-12 h-64 w-64 object-cover opacity-45 mix-blend-screen" /><div className="relative flex h-full flex-col"><div className="flex items-center justify-between"><div><p className="eyebrow text-[#f5c56b]">SEALED ANALYSIS ARCHIVE</p><p className="mt-1 font-mono text-[9px] tracking-[.1em] text-[#8e704c]">3 PACKS / RECORD {String(archive.length + 2001).padStart(4, "0")}</p></div><Gem size={18} className="text-[#f5c56b]" /></div><h2 className="mt-4 max-w-[250px] font-display text-2xl font-semibold leading-tight text-white">集め方も、自分で選ぶ。</h2><p className="mt-3 max-w-[330px] text-xs leading-relaxed text-[#b49e86]">ニュース、業界、スタイル。好きなテーマで記録を集めよう。市場の価格やニュースには影響しません。</p><div className="mt-4 flex gap-1.5">{GACHA_PACKS.map((pack) => <span key={pack.id} className="rounded-md border px-2 py-1 font-mono text-[8px] tracking-[.08em]" style={{ color: pack.accent, borderColor: `${pack.accent}40`, backgroundColor: `${pack.accent}0d` }}>{pack.kicker}</span>)}</div><div className="mt-auto flex items-center justify-between border-t border-[#d19b4b]/20 pt-5"><div><p className="font-mono text-[9px] tracking-[.12em] text-[#a78a6d]">AVAILABLE</p><p className="mt-1 font-mono text-xl text-[#f6cb72]">{credits} <span className="text-[10px]">CREDIT</span></p></div><Button onClick={() => { setGachaOpen(true); setGachaResult(null); setActivePack(null); }} className="bg-[#f6c96a] font-display text-[11px] font-semibold tracking-[.08em] text-[#1c1408] hover:bg-[#ffe09a]">CHOOSE PACK</Button></div></div></section>
          </section>
          <ArchiveVault archive={visibleArchive} activeFilter={archiveFilter} onFilter={setArchiveFilter} totalCount={archive.length} />
        </div>
      </section>

      <button onClick={() => { setGachaOpen(true); setGachaResult(null); setActivePack(null); }} className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full border border-[#d19b4b]/35 bg-[#21170d] px-4 py-3 text-xs font-semibold tracking-[.08em] text-[#f6c96a] shadow-xl lg:hidden"><Archive size={15} /> {credits} CR</button>

      {gachaOpen && <div role="dialog" aria-modal="true" aria-label="Archive Gacha" className="fixed inset-0 z-50 grid place-items-center bg-[#030708]/75 p-4 backdrop-blur-md"><div className="gacha-modal relative w-full max-w-2xl overflow-hidden rounded-2xl border border-[#d19b4b]/35 bg-[#15120d] p-6 shadow-2xl sm:p-8"><button onClick={() => setGachaOpen(false)} className="absolute right-4 top-4 rounded-full p-2 text-[#a98d70] transition hover:bg-white/10 hover:text-white" aria-label="閉じる"><X size={18} /></button>{!gachaResult ? <div><div className="text-center"><p className="eyebrow text-[#f6c96a]">ARCHIVE PACKS</p><h2 className="mt-3 font-display text-3xl font-semibold text-white">今日は、何を集める？</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#b8a08a]">気になるパックを選ぶだけ。全部、プロフィールを彩るコレクションです。</p></div><div className="mt-7 grid gap-3 sm:grid-cols-3">{GACHA_PACKS.map((pack) => <button key={pack.id} onClick={() => setActivePack(pack)} className={`group rounded-xl border p-4 text-left transition hover:-translate-y-0.5 ${activePack?.id === pack.id ? "bg-white/[.08]" : "bg-black/10 hover:bg-white/[.05]"}`} style={{ borderColor: activePack?.id === pack.id ? pack.accent : `${pack.accent}4a` }}><div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-lg" style={{ backgroundColor: `${pack.accent}18`, color: pack.accent }}><RewardIcon type={pack.icon} /></span><span className="font-mono text-[9px]" style={{ color: pack.accent }}>{pack.kicker}</span></div><p className="mt-4 font-display text-base font-semibold text-white">{pack.label}</p><p className="mt-1 min-h-[38px] text-[11px] leading-relaxed text-[#a58d76]">{pack.description}</p><p className="mt-4 font-mono text-xs" style={{ color: pack.accent }}>{pack.cost} CREDIT</p></button>)}</div>{activePack && <div className="mt-5 flex flex-col items-center justify-between gap-3 rounded-xl border border-[#d19b4b]/20 bg-black/15 p-4 sm:flex-row"><p className="text-center text-xs text-[#b8a08a]">選択中: <span className="font-semibold text-white">{activePack.label}</span>。市場には影響しません。</p><Button onClick={() => pullArchive(activePack)} className="h-11 bg-[#f6c96a] px-6 font-display text-[11px] font-semibold tracking-[.08em] text-[#1d1509] hover:bg-[#ffe09a]">{activePack.cost} CREDIT で開封</Button></div>}<p className="mt-4 text-center text-[10px] text-[#8c735c]">過去のアーカイブ: {archive.length} 件</p></div> : <div className="py-6 text-center"><div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl border" style={{ color: gachaResult.accent, borderColor: `${gachaResult.accent}66`, backgroundColor: `${gachaResult.accent}12` }}><RewardIcon type={gachaResult.icon} /></div><p className="mt-7 font-mono text-[10px] tracking-[.18em]" style={{ color: gachaResult.accent }}>{gachaResult.rarity}</p><h2 className="mt-2 font-display text-3xl font-semibold text-white">{gachaResult.name}</h2><p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[#b8a08a]">{gachaResult.detail}</p><div className="mt-7 rounded-lg border border-white/10 bg-black/15 px-4 py-3 text-left text-[11px] leading-relaxed text-[#928273]"><span className="font-semibold text-[#d9b37a]">MARKET-SAFE:</span> この報酬は見た目・記録用途のみ。市場の価格計算・ニュース選択・取引結果には影響しません。</div><Button onClick={() => setGachaOpen(false)} className="mt-6 h-11 w-full bg-white text-[#172116] hover:bg-[#e6efe6]">ARCHIVE に保存</Button></div>}</div></div>}
      {profileOpen && <ProfileModal asset={selected} profile={selectedProfile} onClose={() => setProfileOpen(false)} />}
    </main>
  );
}

function PulseRow({ label, value, tone }: { label: string; value: string; tone: "lime" | "coral" | "neutral" }) {
  const colors = { lime: "text-[#74b5ff]", coral: "text-[#ff9e9e]", neutral: "text-[#e7efea]" };
  return <div><div className="mb-1.5 flex items-center justify-between"><span className="font-mono text-[9px] tracking-[.13em] text-[#6c7d82]">{label}</span><span className={`font-mono text-[11px] ${colors[tone]}`}>{value}</span></div><div className="h-px bg-white/[.09]"><div className={`h-full ${tone === "coral" ? "bg-[#ff7474]" : tone === "lime" ? "bg-[#4f9bff]" : "bg-[#8fa09e]"}`} style={{ width: tone === "lime" ? "72%" : tone === "coral" ? "43%" : "56%" }} /></div></div>;
}

function SideNavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={`group flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-xs transition ${active ? "bg-[#4f9bff]/[.16] text-white shadow-[inset_0_0_0_1px_rgba(79,155,255,.22)]" : "text-[#839297] hover:bg-[#4f9bff]/[.07] hover:text-white"}`}><span className={active ? "text-[#74b5ff]" : "text-[#7e9299]"}>{icon}</span><span className="font-display text-[11px] font-medium tracking-[.12em]">{label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#4f9bff]" />}</button>;
}

function ChangePill({ change, size = "sm" }: { change: number; size?: "sm" | "lg" }) {
  const up = change >= 0;
  return <span className={`inline-flex items-center gap-1 rounded-md font-mono ${size === "lg" ? "px-2.5 py-1 text-sm" : "px-2 py-1 text-[10px]"} ${up ? "bg-[#36d399]/[.13] text-[#5ee8b0]" : "bg-[#ff7474]/[.12] text-[#ff9e9e]"}`}>{up ? <TrendingUp size={size === "lg" ? 15 : 12} /> : <TrendingDown size={size === "lg" ? 15 : 12} />}{up ? "+" : ""}{change.toFixed(2)}%</span>;
}

function CatalystCard({ event, assetId }: { event: MarketEvent; assetId: string }) {
  const effect = event.effect[assetId] ?? 0;
  const isUp = effect >= 0;
  return <div className="p-5"><div className="flex items-start justify-between gap-3"><div><p className={`font-mono text-[9px] tracking-[.12em] ${isUp ? "text-[#5ee8b0]" : "text-[#ff9e9e]"}`}>{event.tag}</p><h3 className="mt-2 font-display text-sm font-medium leading-snug text-white">{event.title}</h3></div><span className={`mt-1 flex shrink-0 items-center gap-1 font-mono text-[11px] ${isUp ? "text-[#5ee8b0]" : "text-[#ff9e9e]"}`}><DirectionIcon direction={isUp ? "up" : "down"} />{isUp ? "+" : ""}{(effect * 100).toFixed(1)}%</span></div><div className="mt-4 flex items-center gap-3"><div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[.08]"><div className={`h-full rounded-full ${isUp ? "bg-[#36d399]" : "bg-[#ff7474]"}`} style={{ width: `${event.impact}%` }} /></div><span className="font-mono text-[9px] text-[#849398]">IMPACT {event.impact}</span></div></div>;
}

function MiniStat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "lime" | "coral" }) {
  return <div className="min-w-0 border-r border-white/[.09] px-3 py-4 last:border-r-0"><p className="truncate font-mono text-[8px] tracking-[.11em] text-[#718187]">{label}</p><p className={`mt-1 truncate font-mono text-[11px] ${tone === "lime" ? "text-[#c9f34a]" : tone === "coral" ? "text-[#ff917f]" : "text-white"}`}>{value}</p></div>;
}

function AssetOverview({ cash, marketValue, equity, pnl, positions }: { cash: number; marketValue: number; equity: number; pnl: number; positions: Array<{ asset?: Asset; quantity: number; avgCost: number; value: number; pnl: number }> }) {
  return <section className="mt-5 overflow-hidden rounded-2xl border border-[#4f9bff]/25 bg-[linear-gradient(100deg,rgba(79,155,255,.14),rgba(13,26,30,.92)_58%,rgba(79,155,255,.05))] shadow-[0_18px_36px_rgba(0,0,0,.12)]"><div className="grid gap-0 min-[760px]:grid-cols-[1.15fr_.85fr]"><div className="p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="eyebrow text-[#74b5ff]">MY MONEY / いま使えるお金</p><p className="mt-1 font-display text-lg font-semibold text-white">合計資産</p></div><Banknote size={22} className="text-[#74b5ff]" /></div><p className="mt-3 font-mono text-4xl font-medium tracking-[-.07em] text-white">{formatMoney(equity, 0)}</p><div className="mt-5 grid grid-cols-3 gap-2"><MoneyTile label="手元資金" value={formatMoney(cash, 0)} accent="blue" /><MoneyTile label="保有資産" value={formatMoney(marketValue, 0)} accent="blue" /><MoneyTile label="含み損益" value={`${pnl >= 0 ? "+" : ""}${formatMoney(pnl, 0)}`} accent={pnl >= 0 ? "green" : "red"} /></div></div><div className="border-t border-white/[.09] bg-black/[.12] p-5 min-[760px]:border-l min-[760px]:border-t-0 sm:p-6"><div className="flex items-center justify-between"><div><p className="eyebrow">PORTFOLIO / 保有中</p><p className="mt-1 text-sm text-[#c3d0cc]">いま持っている銘柄の価値</p></div><span className="rounded-full bg-[#4f9bff]/[.12] px-2.5 py-1 font-mono text-[9px] text-[#74b5ff]">{positions.length} HOLDING</span></div>{positions.length === 0 ? <div className="mt-4 rounded-lg border border-dashed border-white/[.14] px-4 py-4 text-sm leading-relaxed text-[#93a4a5]">まだ保有している銘柄はありません。気になる銘柄を選んで、少額から試してみよう。</div> : <div className="mt-4 space-y-2">{positions.slice(0, 3).map((position) => position.asset && <div key={position.asset.id} className="flex items-center justify-between rounded-lg bg-white/[.045] px-3 py-2.5"><div><p className="font-display text-sm font-semibold text-white">{position.asset.code}<span className="ml-2 font-mono text-[9px] font-normal text-[#849599]">{position.quantity} UNIT</span></p><p className="font-mono text-[10px] text-[#8d9c9f]">平均 {formatMoney(position.avgCost, position.asset.kind === "Crypto" ? 3 : 2)}</p></div><div className="text-right"><p className="font-mono text-sm text-[#74b5ff]">{formatMoney(position.value, 0)}</p><p className={`font-mono text-[10px] ${position.pnl >= 0 ? "text-[#36d399]" : "text-[#ff7474]"}`}>{position.pnl >= 0 ? "+" : ""}{formatMoney(position.pnl, 0)}</p></div></div>)}</div>}</div></div></section>;
}

function MoneyTile({ label, value, accent }: { label: string; value: string; accent: "blue" | "green" | "red" }) {
  const colors = { blue: "border-[#4f9bff]/28 bg-[#4f9bff]/[.08] text-[#74b5ff]", green: "border-[#36d399]/28 bg-[#36d399]/[.08] text-[#36d399]", red: "border-[#ff7474]/28 bg-[#ff7474]/[.08] text-[#ff9292]" };
  return <div className={`min-w-0 rounded-lg border p-2.5 ${colors[accent]}`}><p className="font-mono text-[8px] tracking-[.1em] opacity-75">{label}</p><p className="mt-1 truncate font-mono text-[11px] font-medium text-white">{value}</p></div>;
}

function ArchiveVault({ archive, activeFilter, onFilter, totalCount }: { archive: Reward[]; activeFilter: "ALL" | Reward["rarity"]; onFilter: (filter: "ALL" | Reward["rarity"]) => void; totalCount: number }) {
  const filters: Array<"ALL" | Reward["rarity"]> = ["ALL", "COMMON", "RARE", "EPIC", "LEGEND"];
  return <section className="mt-6 overflow-hidden rounded-2xl border border-[#4f9bff]/25 bg-[#0b1519] shadow-[0_18px_36px_rgba(0,0,0,.12)]"><div className="flex flex-col justify-between gap-4 border-b border-white/[.08] px-5 py-5 sm:flex-row sm:items-center sm:px-6"><div><p className="eyebrow text-[#74b5ff]">MY ARCHIVE / 入手アイテム管理</p><h2 className="mt-1 font-display text-xl font-semibold text-white">獲得アーカイブ</h2><p className="mt-1 text-xs text-[#8ea0a4]">ガチャで入手した記録を、レアリティごとに確認できます。</p></div><div className="rounded-lg border border-[#4f9bff]/20 bg-[#4f9bff]/[.08] px-3 py-2 font-mono text-xs text-[#8fc5ff]">TOTAL {totalCount} ITEM</div></div><div className="flex flex-wrap gap-2 border-b border-white/[.07] px-5 py-3 sm:px-6">{filters.map((filter) => { const meta = filter === "ALL" ? { label: "ALL", color: "#8fc5ff", border: "#4f9bff55", background: "#4f9bff12" } : RARITY_META[filter]; return <button key={filter} type="button" onClick={() => onFilter(filter)} className={`rounded-md border px-2.5 py-1.5 font-mono text-[10px] transition ${activeFilter === filter ? "shadow-[inset_0_0_0_1px_currentColor]" : "opacity-65 hover:opacity-100"}`} style={{ color: meta.color, borderColor: meta.border, backgroundColor: activeFilter === filter ? meta.background : "transparent" }}>{meta.label}{filter !== "ALL" && <span className="ml-1 opacity-75">{RARITY_META[filter].rate}</span>}</button>; })}</div>{archive.length === 0 ? <div className="grid min-h-36 place-items-center px-6 py-10 text-center"><div><Archive size={22} className="mx-auto text-[#4f9bff]" /><p className="mt-3 font-display text-base font-medium text-white">アーカイブはまだ空です。</p><p className="mt-1 text-xs text-[#84969a]">パックを開封すると、ここでレアリティ別に管理できます。</p></div></div> : <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6">{archive.map((reward, index) => { const meta = RARITY_META[reward.rarity]; return <article key={`${reward.id}-${index}`} className="group relative overflow-hidden rounded-xl border bg-white/[.025] p-4 transition hover:-translate-y-0.5" style={{ borderColor: meta.border }}><div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: meta.color }} /><div className="flex items-start justify-between gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg" style={{ backgroundColor: meta.background, color: meta.color }}><RewardIcon type={reward.icon} /></span><span className="rounded-md border px-2 py-1 font-mono text-[9px] tracking-[.08em]" style={{ color: meta.color, borderColor: meta.border, backgroundColor: meta.background }}>{meta.label}</span></div><h3 className="mt-4 font-display text-base font-semibold text-white">{reward.name}</h3><p className="mt-1 text-[11px] leading-relaxed text-[#94a5a8]">{reward.detail}</p><p className="mt-4 font-mono text-[9px] text-[#6f8388]">ARCHIVE #{String(totalCount - index).padStart(3, "0")}</p></article>; })}</div>}</section>;
}

function ProfilePreview({ profile, asset, onOpen }: { profile: AssetProfile; asset: Asset; onOpen: () => void }) {
  const isCrypto = asset.kind === "Crypto";
  return <section className="panel-card overflow-hidden"><div className="flex items-start justify-between border-b border-white/[.09] px-5 py-4"><div><p className="eyebrow">{isCrypto ? "PROTOCOL SNAPSHOT" : "COMPANY SNAPSHOT"}</p><p className="mt-1 font-display text-lg font-medium text-white">{asset.code} を知る</p></div><Box size={18} className="text-[#c9f34a]" /></div><div className="p-5"><p className="text-sm leading-relaxed text-[#d9e4dd]">{profile.oneLine}</p><div className="mt-4 flex flex-wrap gap-1.5"><span className="rounded-md bg-[#c9f34a]/[.1] px-2 py-1 font-mono text-[9px] text-[#c9f34a]">{profile.archetype}</span><span className="rounded-md bg-white/[.06] px-2 py-1 font-mono text-[9px] text-[#b7c5c2]">{profile.audience}</span></div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-lg bg-white/[.04] p-2.5"><p className="eyebrow">NEWS REACT</p><p className={`mt-1 font-mono text-xs ${profile.sensitivity === "HIGH" ? "text-[#f6c96a]" : "text-[#d9e4dd]"}`}>{profile.sensitivity}</p></div><div className="rounded-lg bg-white/[.04] p-2.5"><p className="eyebrow">RISK FEEL</p><p className={`mt-1 font-mono text-xs ${profile.risk === "HIGH" ? "text-[#ff917f]" : "text-[#d9e4dd]"}`}>{profile.risk}</p></div></div><button onClick={onOpen} className="mt-4 flex w-full items-center justify-between rounded-lg border border-white/[.12] bg-white/[.03] px-3 py-2.5 text-left transition hover:border-[#c9f34a]/40 hover:bg-[#c9f34a]/[.06]"><span className="font-display text-xs font-medium text-white">特徴と注意ポイントを見る</span><ChevronRight size={15} className="text-[#c9f34a]" /></button></div></section>;
}

function ProfileModal({ asset, profile, onClose }: { asset: Asset; profile: AssetProfile; onClose: () => void }) {
  const isCrypto = asset.kind === "Crypto";
  return <div role="dialog" aria-modal="true" aria-label={`${asset.name} の特徴`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} className="fixed inset-0 z-[70] grid place-items-center bg-[#030708]/80 p-4 backdrop-blur-md"><section onMouseDown={(event) => event.stopPropagation()} className="gacha-modal relative max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#c9f34a]/30 bg-[#0e1a1e] shadow-2xl"><div className="absolute -right-14 -top-14 h-44 w-44 rounded-full bg-[#c9f34a]/10 blur-3xl" /><button type="button" onClick={onClose} className="absolute right-4 top-4 z-10 rounded-full border border-white/[.1] bg-[#0b1519]/90 p-2 text-[#d5e2d9] transition hover:border-[#c9f34a]/45 hover:bg-[#c9f34a] hover:text-[#12200f]" aria-label="企業情報を閉じる"><X size={18} /></button><div className="relative border-b border-white/[.09] p-6 sm:p-7"><p className="eyebrow text-[#c9f34a]">{isCrypto ? "PROTOCOL PROFILE" : "COMPANY PROFILE"}</p><div className="mt-3 flex items-end gap-3"><h2 className="font-display text-4xl font-bold tracking-[-.07em] text-white">{asset.code}</h2><p className="mb-1 text-sm text-[#a9b9b7]">{asset.name}</p></div><p className="mt-4 max-w-lg text-base leading-relaxed text-[#dce8df]">{profile.oneLine}</p></div><div className="relative grid gap-5 p-6 sm:grid-cols-[1.1fr_.9fr] sm:p-7"><div><p className="eyebrow">WHAT TO WATCH</p><div className="mt-3 space-y-2">{profile.strengths.map((strength, index) => <div key={strength} className="flex items-center gap-3 rounded-lg bg-white/[.045] px-3 py-2.5"><span className="grid h-5 w-5 place-items-center rounded-full bg-[#c9f34a] font-mono text-[9px] font-semibold text-[#12200f]">{index + 1}</span><span className="text-sm text-white">{strength}</span></div>)}</div></div><div className="rounded-xl border border-white/[.09] bg-black/15 p-4"><p className="eyebrow">QUICK FACTS</p><div className="mt-3 space-y-3"><FactRow label="TYPE" value={profile.archetype} accent="lime" /><FactRow label="FOR" value={profile.audience} /><FactRow label="NEWS REACT" value={profile.sensitivity} accent={profile.sensitivity === "HIGH" ? "amber" : "neutral"} /><FactRow label="RISK FEEL" value={profile.risk} accent={profile.risk === "HIGH" ? "coral" : "neutral"} /></div></div><div className="sm:col-span-2 rounded-xl border border-[#ff775f]/20 bg-[#ff775f]/[.06] p-4"><p className="eyebrow text-[#ff917f]">KEEP IN MIND</p><p className="mt-2 text-sm text-[#ffe0da]">注意: {profile.watch}</p><p className="mt-1 text-[11px] leading-relaxed text-[#a99a96]">この内容は、ゲーム内の架空市場を理解するためのプロフィールです。実在の企業・投資判断に関する情報ではありません。</p></div><button type="button" onClick={onClose} className="sm:col-span-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#c9f34a] px-4 py-3 font-display text-xs font-semibold tracking-[.1em] text-[#12200f] transition hover:bg-[#ddfb78]"><X size={15} /> 市場に戻る</button><p className="sm:col-span-2 -mt-3 text-center font-mono text-[9px] text-[#74858a]">背景クリック または ESC キーでも閉じられます</p></div></section></div>;
}

function FactRow({ label, value, accent = "neutral" }: { label: string; value: string; accent?: "lime" | "amber" | "coral" | "neutral" }) {
  const colors = { lime: "text-[#c9f34a]", amber: "text-[#f6c96a]", coral: "text-[#ff917f]", neutral: "text-white" };
  return <div className="flex items-center justify-between gap-3 border-b border-white/[.07] pb-2 last:border-0 last:pb-0"><span className="font-mono text-[9px] tracking-[.11em] text-[#77888c]">{label}</span><span className={`text-right font-mono text-[10px] ${colors[accent]}`}>{value}</span></div>;
}

function BlueCandlestickPanel({ candles, crypto }: { candles: Candle[]; crypto: boolean }) {
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
  const upColor = "#69adff";
  const downColor = "#2d65b9";
  const lastLabelY = last ? Math.max(frame.top, Math.min(frame.top + frame.priceHeight - 18, y(last.close) - 9)) : frame.top;
  return <div className="h-full overflow-x-auto"><svg viewBox={`0 0 ${frame.width} ${frame.height}`} className="h-full min-w-[650px] w-full" role="img" aria-label="青基調のローソク足と出来高を表示する価格チャート"><defs><linearGradient id="blueChartFade" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#4f9bff" stopOpacity=".16" /><stop offset="1" stopColor="#4f9bff" stopOpacity="0" /></linearGradient></defs><rect x={frame.left} y={frame.top} width={chartWidth} height={frame.priceHeight} fill="url(#blueChartFade)" />{[0, 1, 2, 3, 4].map((index) => { const value = max - (range * index) / 4; const axisY = y(value); return <g key={index}><line x1={frame.left} x2={frame.width - frame.right} y1={axisY} y2={axisY} stroke="#8fc5ff" strokeOpacity=".13" strokeWidth="1" /><text x={frame.width - frame.right + 6} y={axisY + 3} fill="#77a3cd" fontFamily="IBM Plex Mono" fontSize="10">{value.toFixed(priceDigits)}</text></g>; })}<line x1={frame.left} x2={frame.width - frame.right} y1={frame.volumeTop - 12} y2={frame.volumeTop - 12} stroke="#8fc5ff" strokeOpacity=".2" strokeWidth="1" /><text x={frame.left} y={frame.volumeTop - 18} fill="#78a3cb" fontFamily="IBM Plex Mono" fontSize="9" letterSpacing="1.3">VOLUME</text><text x={frame.width - frame.right - 80} y={frame.volumeTop - 18} fill="#8fc5ff" fontFamily="IBM Plex Mono" fontSize="9">UP / LIGHT</text><text x={frame.width - frame.right} y={frame.volumeTop - 18} fill="#4c7fb9" fontFamily="IBM Plex Mono" fontSize="9" textAnchor="end">DOWN / DEEP</text>{candles.map((candle, index) => { const rising = candle.close >= candle.open; const color = rising ? upColor : downColor; const center = frame.left + index * step + step / 2; const bodyTop = Math.min(y(candle.open), y(candle.close)); const bodyHeight = Math.max(2, Math.abs(y(candle.open) - y(candle.close))); const volumeHeight = (candle.volume / maxVolume) * frame.volumeHeight; return <g key={`${candle.time}-${index}`}><line x1={center} x2={center} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1.4" /><rect x={center - step * 0.3} y={bodyTop} width={Math.max(3, step * 0.6)} height={bodyHeight} rx=".6" fill={color} /><rect x={center - step * 0.3} y={frame.volumeTop + frame.volumeHeight - volumeHeight} width={Math.max(3, step * 0.6)} height={volumeHeight} fill={color} fillOpacity=".72" />{(index === 0 || index === candles.length - 1 || index % 8 === 0) && <text x={center} y={frame.volumeTop + frame.volumeHeight + 20} fill="#77a3cd" fontFamily="IBM Plex Mono" fontSize="9" textAnchor="middle">{candle.time}</text>}</g>; })}{last && <g><line x1={frame.left} x2={frame.width - frame.right} y1={y(last.close)} y2={y(last.close)} stroke="#8fc5ff" strokeOpacity=".85" strokeDasharray="3 4" /><rect x="4" y={lastLabelY} width="48" height="18" rx="3" fill="#4f9bff" /><text x="28" y={lastLabelY + 12.5} fill="#ffffff" fontFamily="IBM Plex Mono" fontSize="8" fontWeight="600" textAnchor="middle">LAST</text></g>}</svg></div>;
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
