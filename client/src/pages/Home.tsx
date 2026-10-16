import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BadgeJapaneseYen,
  BatteryCharging,
  Boxes,
  CarFront,
  Check,
  CircleGauge,
  Clock3,
  Cog,
  Factory,
  Hammer,
  Map,
  MapPin,
  LockKeyhole,
  PackageCheck,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Settings2,
  Ship,
  Sparkles,
  Truck,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

type View = "map" | "factory" | "garage";
type DetailTab = "region" | "machine";
type MachineId =
  | "supply"
  | "press"
  | "engine"
  | "tire"
  | "assembly"
  | "dispatch";
type Stock = {
  steel: number;
  rubber: number;
  chassis: number;
  engines: number;
  tireSets: number;
  cars: number;
};
type MachineLevels = Record<MachineId, number>;
type MachineSwitches = Record<MachineId, boolean>;

type GameData = {
  version: 1;
  cash: number;
  stock: Stock;
  levels: MachineLevels;
  machineOn: MachineSwitches;
  unlockedRegions: string[];
  activeModel: string;
  lifetimeCars: number;
  shipments: number;
  reputation: number;
  tick: number;
  contractClaimed: boolean;
};

type Region = {
  id: string;
  city: string;
  mapName: string;
  prefecture: string;
  zone: string;
  role: string;
  detail: string;
  effect: string;
  cost: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  anchor: "start" | "middle" | "end";
  activeStart?: boolean;
  icon: LucideIcon;
  linkedMachine: MachineId;
};

type VehicleModel = {
  id: string;
  name: string;
  series: string;
  style: string;
  tagline: string;
  spec: string;
  payout: number;
  unlockAt: number;
  paint: string;
  paintName: string;
  body: "coupe" | "rally" | "roadster";
};

const SAVE_KEY = "kobo-nippon-motor-grid-v1";
const MAX_LEVEL = 5;
const FRESH_STOCK: Stock = {
  steel: 16,
  rubber: 8,
  chassis: 0,
  engines: 0,
  tireSets: 0,
  cars: 0,
};
const BASE_LEVELS: MachineLevels = {
  supply: 1,
  press: 1,
  engine: 1,
  tire: 1,
  assembly: 1,
  dispatch: 1,
};
const BASE_SWITCHES: MachineSwitches = {
  supply: true,
  press: true,
  engine: true,
  tire: true,
  assembly: true,
  dispatch: true,
};

const REGIONS: Region[] = [
  {
    id: "sapporo",
    city: "SAPPORO",
    mapName: "札幌",
    prefecture: "北海道",
    zone: "HOKKAIDO",
    role: "ALLOY SUPPLY",
    detail:
      "北の製鉄所から高純度スチールを直送。Tsukubaの素材ヤードへ供給します。",
    effect: "鋼材 +1 / cycle",
    cost: 280_000,
    x: 650,
    y: 78,
    dx: 17,
    dy: -7,
    anchor: "start",
    icon: Boxes,
    linkedMachine: "supply",
  },
  {
    id: "sendai",
    city: "SENDAI",
    mapName: "仙台",
    prefecture: "宮城県",
    zone: "TOHOKU",
    role: "TUNING LAB",
    detail:
      "東北のチューニングラボ。輸出先との共同開発で、完成車の評価額を高めます。",
    effect: "輸出額 +¥18,000 / car",
    cost: 210_000,
    x: 555,
    y: 208,
    dx: 17,
    dy: -5,
    anchor: "start",
    icon: Zap,
    linkedMachine: "dispatch",
  },
  {
    id: "gunma",
    city: "GUNMA",
    mapName: "群馬",
    prefecture: "群馬県",
    zone: "KANTO",
    role: "BODY WORKS",
    detail:
      "職人の手仕事が残るボディ工場。プレス工程に余裕を生み、車体の供給数が増えます。",
    effect: "シャシー +1 / batch",
    cost: 185_000,
    x: 503,
    y: 246,
    dx: -12,
    dy: -17,
    anchor: "end",
    icon: Hammer,
    linkedMachine: "press",
  },
  {
    id: "tsukuba",
    city: "TSUKUBA",
    mapName: "つくば",
    prefecture: "茨城県",
    zone: "KANTO",
    role: "CENTRAL ASSEMBLY",
    detail:
      "研究学園都市に構える中枢工場。各地のパーツを集め、JDMを一台ずつ組み上げます。",
    effect: "CENTRAL PLANT / ONLINE",
    cost: 0,
    x: 523,
    y: 264,
    dx: 18,
    dy: 13,
    anchor: "start",
    activeStart: true,
    icon: Factory,
    linkedMachine: "assembly",
  },
  {
    id: "tokyo",
    city: "TOKYO",
    mapName: "東京",
    prefecture: "東京都",
    zone: "KANTO",
    role: "ORDER EXCHANGE",
    detail:
      "東京のストリートカルチャーと販売網。熱量の高いオーダーが集まります。",
    effect: "販売ボーナス +¥15,000 / car",
    cost: 0,
    x: 500,
    y: 284,
    dx: 17,
    dy: -1,
    anchor: "start",
    activeStart: true,
    icon: Activity,
    linkedMachine: "dispatch",
  },
  {
    id: "yokohama",
    city: "YOKOHAMA",
    mapName: "横浜",
    prefecture: "神奈川県",
    zone: "KANTO",
    role: "EXPORT TERMINAL",
    detail:
      "横浜港から世界へ。ここが開いていると完成車をまとめて輸出できます。",
    effect: "完成車の輸出が可能",
    cost: 0,
    x: 486,
    y: 302,
    dx: -14,
    dy: 17,
    anchor: "end",
    activeStart: true,
    icon: Ship,
    linkedMachine: "dispatch",
  },
  {
    id: "shizuoka",
    city: "SHIZUOKA",
    mapName: "静岡",
    prefecture: "静岡県",
    zone: "CHUBU",
    role: "RUBBER WORKS",
    detail:
      "富士山のふもとのゴム加工拠点。タイヤセルに安定した素材を送ります。",
    effect: "ゴム供給ライン接続",
    cost: 0,
    x: 459,
    y: 304,
    dx: -7,
    dy: -15,
    anchor: "middle",
    activeStart: true,
    icon: CircleGauge,
    linkedMachine: "tire",
  },
  {
    id: "nagoya",
    city: "NAGOYA",
    mapName: "名古屋",
    prefecture: "愛知県",
    zone: "CHUBU",
    role: "ENGINE WORKS",
    detail:
      "中部のエンジン工房。手組みのターボユニットをTsukubaへ送り出します。",
    effect: "エンジン組立ライン接続",
    cost: 0,
    x: 426,
    y: 322,
    dx: -14,
    dy: 14,
    anchor: "end",
    activeStart: true,
    icon: Cog,
    linkedMachine: "engine",
  },
  {
    id: "osaka",
    city: "OSAKA",
    mapName: "大阪",
    prefecture: "大阪府",
    zone: "KANSAI",
    role: "R&D GARAGE",
    detail:
      "関西の開発ガレージ。熟練エンジニアが全国の設備投資を後押しします。",
    effect: "設備アップグレード費 -15%",
    cost: 360_000,
    x: 391,
    y: 342,
    dx: -14,
    dy: 19,
    anchor: "end",
    icon: Wrench,
    linkedMachine: "assembly",
  },
  {
    id: "hiroshima",
    city: "HIROSHIMA",
    mapName: "広島",
    prefecture: "広島県",
    zone: "CHUGOKU",
    role: "DRIVETRAIN LAB",
    detail:
      "中国地方の駆動系ラボ。組み上げたエンジンにもう一段の余裕を加えます。",
    effect: "エンジン +1 / batch",
    cost: 240_000,
    x: 341,
    y: 356,
    dx: -12,
    dy: -14,
    anchor: "end",
    icon: Cog,
    linkedMachine: "engine",
  },
  {
    id: "fukuoka",
    city: "FUKUOKA",
    mapName: "福岡",
    prefecture: "福岡県",
    zone: "KYUSHU",
    role: "WEST COAST HUB",
    detail:
      "九州の輸出ハブ。西日本のマーケットとつながり、出荷価格を押し上げます。",
    effect: "輸出価格 +15%",
    cost: 300_000,
    x: 278,
    y: 388,
    dx: -14,
    dy: 14,
    anchor: "end",
    icon: Truck,
    linkedMachine: "dispatch",
  },
];

const VEHICLES: VehicleModel[] = [
  {
    id: "hachi-r",
    name: "HACHI-R",
    series: "KOBO / 01",
    style: "FR TOUGE COUPE",
    tagline: "峠を知り尽くした、原点の一台。",
    spec: "FR · 2.0L TURBO · 6MT",
    payout: 148_000,
    unlockAt: 0,
    paint: "#d95640",
    paintName: "Akane Red",
    body: "coupe",
  },
  {
    id: "kitsune-gt",
    name: "KITSUNE GT",
    series: "KOBO / 04",
    style: "AWD RALLY SPEC",
    tagline: "雨の峠も、まっすぐ駆け抜ける。",
    spec: "AWD · 2.4L TURBO · 6MT",
    payout: 196_000,
    unlockAt: 2,
    paint: "#c5c7b2",
    paintName: "Mist Silver",
    body: "rally",
  },
  {
    id: "mizu-8",
    name: "MIZU-8",
    series: "KOBO / 08",
    style: "LIGHTWEIGHT ROADSTER",
    tagline: "軽さを楽しむためだけに生まれた。",
    spec: "FR · 1.6L NA · 5MT",
    payout: 174_000,
    unlockAt: 5,
    paint: "#718d70",
    paintName: "Moss Green",
    body: "roadster",
  },
];

const MACHINES: Array<{
  id: MachineId;
  name: string;
  english: string;
  area: string;
  icon: LucideIcon;
  input: string;
  output: string;
  baseCost: number;
}> = [
  {
    id: "supply",
    name: "素材ヤード",
    english: "RAW MATERIAL",
    area: "01 / INBOUND",
    icon: Boxes,
    input: "港湾・鉱材",
    output: "鋼材",
    baseCost: 85_000,
  },
  {
    id: "press",
    name: "ボディプレス",
    english: "BODY PRESS",
    area: "02 / STAMPING",
    icon: Hammer,
    input: "鋼材 ×2",
    output: "シャシー",
    baseCost: 118_000,
  },
  {
    id: "engine",
    name: "エンジン工房",
    english: "ENGINE BAY",
    area: "03 / POWERTRAIN",
    icon: Cog,
    input: "鋼材 ×3",
    output: "エンジン",
    baseCost: 148_000,
  },
  {
    id: "tire",
    name: "タイヤセル",
    english: "TIRE CELL",
    area: "04 / RUBBER",
    icon: CircleGauge,
    input: "ゴム ×2",
    output: "タイヤセット",
    baseCost: 92_000,
  },
  {
    id: "assembly",
    name: "最終組立",
    english: "FINAL ASSEMBLY",
    area: "05 / TSUKUBA",
    icon: CarFront,
    input: "パーツ一式",
    output: "完成車",
    baseCost: 175_000,
  },
  {
    id: "dispatch",
    name: "横浜輸出港",
    english: "EXPORT DOCK",
    area: "06 / SHIPPING",
    icon: Ship,
    input: "完成車",
    output: "¥ / REP",
    baseCost: 110_000,
  },
];

const BASE_UPGRADE_COSTS: Record<MachineId, number> = {
  supply: 85_000,
  press: 118_000,
  engine: 148_000,
  tire: 92_000,
  assembly: 175_000,
  dispatch: 110_000,
};

function createFreshGame(): GameData {
  return {
    version: 1,
    cash: 680_000,
    stock: { ...FRESH_STOCK },
    levels: { ...BASE_LEVELS },
    machineOn: { ...BASE_SWITCHES },
    unlockedRegions: ["tsukuba", "tokyo", "yokohama", "shizuoka", "nagoya"],
    activeModel: "hachi-r",
    lifetimeCars: 0,
    shipments: 0,
    reputation: 0,
    tick: 0,
    contractClaimed: false,
  };
}

function loadGame(): GameData {
  if (typeof window === "undefined") return createFreshGame();
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return createFreshGame();
    const parsed = JSON.parse(raw) as Partial<GameData>;
    if (
      parsed.version !== 1 ||
      typeof parsed.cash !== "number" ||
      !parsed.stock
    )
      return createFreshGame();
    const fresh = createFreshGame();
    return {
      ...fresh,
      ...parsed,
      stock: { ...fresh.stock, ...parsed.stock },
      levels: { ...fresh.levels, ...parsed.levels },
      machineOn: { ...fresh.machineOn, ...parsed.machineOn },
      unlockedRegions: Array.isArray(parsed.unlockedRegions)
        ? parsed.unlockedRegions
        : fresh.unlockedRegions,
    };
  } catch {
    return createFreshGame();
  }
}

function advanceGame(game: GameData): GameData {
  const tick = game.tick + 1;
  const stock = { ...game.stock };
  const unlocked = game.unlockedRegions;
  const level = game.levels;
  const on = game.machineOn;

  if (on.supply)
    stock.steel += 1 + level.supply + (unlocked.includes("sapporo") ? 1 : 0);
  if (tick % 2 === 0 && on.tire)
    stock.rubber += 1 + (unlocked.includes("shizuoka") ? 1 : 0);

  const pressPeriod = Math.max(2, 5 - level.press);
  if (on.press && tick % pressPeriod === 0 && stock.steel >= 2) {
    stock.steel -= 2;
    stock.chassis += 1 + (unlocked.includes("gunma") ? 1 : 0);
  }

  const enginePeriod = Math.max(2, 6 - level.engine);
  if (on.engine && tick % enginePeriod === 0 && stock.steel >= 3) {
    stock.steel -= 3;
    stock.engines += 1 + (unlocked.includes("hiroshima") ? 1 : 0);
  }

  const tirePeriod = Math.max(2, 6 - level.tire);
  if (on.tire && tick % tirePeriod === 0 && stock.rubber >= 2) {
    stock.rubber -= 2;
    stock.tireSets += 1;
  }

  const assemblyPeriod = Math.max(2, 7 - level.assembly);
  if (
    on.assembly &&
    tick % assemblyPeriod === 0 &&
    stock.chassis > 0 &&
    stock.engines > 0 &&
    stock.tireSets > 0
  ) {
    stock.chassis -= 1;
    stock.engines -= 1;
    stock.tireSets -= 1;
    stock.cars += 1;
    return { ...game, tick, stock, lifetimeCars: game.lifetimeCars + 1 };
  }

  return { ...game, tick, stock };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(Math.floor(value));
}

function formatYen(value: number): string {
  return `¥${formatNumber(value)}`;
}

function formatSimulationClock(tick: number): string {
  const minutes = (19 * 60 + 42 + Math.floor(tick / 10)) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function formatCountdown(tick: number): string {
  const seconds = Math.max(0, 8 * 60 * 60 + 42 * 60 + 16 - tick);
  return [
    Math.floor(seconds / 3600),
    Math.floor((seconds % 3600) / 60),
    seconds % 60,
  ]
    .map(value => String(value).padStart(2, "0"))
    .join(":");
}

function machineUpgradeCost(game: GameData, id: MachineId): number {
  const level = game.levels[id];
  const researchDiscount = game.unlockedRegions.includes("osaka") ? 0.85 : 1;
  return Math.round(
    BASE_UPGRADE_COSTS[id] * Math.pow(level, 1.34) * researchDiscount
  );
}

function vehicleValue(game: GameData, model: VehicleModel): number {
  let value = model.payout + game.levels.dispatch * 12_000;
  if (game.unlockedRegions.includes("tokyo")) value += 15_000;
  if (game.unlockedRegions.includes("sendai")) value += 18_000;
  if (game.unlockedRegions.includes("fukuoka"))
    value = Math.round(value * 1.15);
  return value;
}

function periodFor(game: GameData, id: MachineId): number {
  if (id === "press") return Math.max(2, 5 - game.levels.press);
  if (id === "engine" || id === "tire") return Math.max(2, 6 - game.levels[id]);
  if (id === "assembly") return Math.max(2, 7 - game.levels.assembly);
  if (id === "dispatch") return 4;
  return 1;
}

function JapanMap({
  game,
  selectedId,
  onSelect,
}: {
  game: GameData;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [compactMap, setCompactMap] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= 980
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 980px)");
    const update = () => setCompactMap(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const activeCount = game.unlockedRegions.length;
  const route =
    "M278 388 C306 371 326 362 341 356 C359 346 374 342 391 342 C405 333 415 326 426 322 C441 314 450 308 459 304 C475 296 488 289 500 284 C511 269 518 263 523 264 C535 246 547 224 555 208 C573 177 601 131 650 78";
  const activeRoute =
    "M459 304 C446 310 435 317 426 322 C450 306 478 294 500 284 C508 276 517 269 523 264";

  return (
    <section className="panel map-panel">
      <div className="panel-heading map-heading">
        <div>
          <div className="eyebrow">JAPAN / FIELD NETWORK</div>
          <h2>全国拠点マップ</h2>
        </div>
        <div className="map-heading-meta">
          <span className="live-pill">
            <i /> ROUTES LIVE
          </span>
          <span className="active-count">
            {String(activeCount).padStart(2, "0")} / {REGIONS.length} ZONES
          </span>
        </div>
      </div>

      <div className="map-canvas">
        <div className="map-grid-glow" />
        <div className="map-map-stamp">
          <span>JP</span>
          <small>
            日本列島
            <br />
            MOTOR GRID
          </small>
        </div>
        <div className="map-time-chip">
          <Radio size={11} /> LIVE LOGISTICS{" "}
          <b>{formatSimulationClock(game.tick)} JST</b>
        </div>
        <svg
          viewBox={compactMap ? "220 35 515 420" : "0 0 820 490"}
          role="img"
          aria-label="日本の工場・輸送拠点マップ"
        >
          <defs>
            <pattern
              id="map-grid"
              width="34"
              height="34"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 34 0 L 0 0 0 34"
                fill="none"
                stroke="rgba(179,194,147,.08)"
                strokeWidth=".7"
              />
              <circle cx="0" cy="0" r="1" fill="rgba(211,226,165,.18)" />
            </pattern>
            <linearGradient id="land-fill" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#52614b" />
              <stop offset="1" stopColor="#35463a" />
            </linearGradient>
            <linearGradient id="route-fill" x1="0" x2="1">
              <stop offset="0" stopColor="#d9e992" stopOpacity=".25" />
              <stop offset=".45" stopColor="#d9e992" stopOpacity=".9" />
              <stop offset="1" stopColor="#f4a081" stopOpacity=".42" />
            </linearGradient>
            <filter
              id="node-glow"
              x="-200%"
              y="-200%"
              width="400%"
              height="400%"
            >
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect width="820" height="490" fill="url(#map-grid)" />
          <g className="map-contours" fill="none">
            <ellipse cx="503" cy="284" rx="86" ry="58" />
            <ellipse cx="503" cy="284" rx="123" ry="88" />
            <ellipse cx="503" cy="284" rx="165" ry="119" />
            <path d="M89 106 C196 69 245 98 330 75 S493 31 748 62" />
            <path d="M59 429 C184 390 217 437 325 420 S528 398 765 437" />
          </g>
          <text className="sea-label" x="695" y="235">
            PACIFIC OCEAN
          </text>
          <text className="sea-label sea-label-west" x="164" y="281">
            SEA OF JAPAN
          </text>
          <g className="islands">
            <path
              className="island"
              d="M620 62 C632 49 648 42 665 48 L687 59 L700 76 L691 91 L680 102 L659 100 L645 91 L627 98 L614 84 L612 73 Z"
            />
            <path
              className="island"
              d="M596 116 C608 120 615 131 611 143 C607 154 596 162 585 173 C573 184 563 198 552 210 C543 220 537 233 525 245 C516 255 510 267 502 281 C495 294 486 303 478 315 C470 327 466 340 455 349 C445 359 434 367 419 372 C403 377 390 373 378 367 C365 361 353 355 341 357 C329 359 317 358 304 353 C292 347 283 339 277 328 C271 318 274 307 284 297 C296 287 307 278 315 265 C322 252 331 241 342 230 C354 219 361 205 375 197 C389 190 400 178 412 169 C424 160 440 155 454 147 C468 140 482 135 496 126 C508 117 523 117 537 115 C553 113 565 112 579 114 Z"
            />
            <path
              className="island"
              d="M284 357 C295 361 300 372 295 384 L287 397 L283 412 L270 423 L255 418 L248 403 L252 389 L260 377 L270 365 Z"
            />
            <path
              className="island"
              d="M324 381 C337 375 355 375 369 383 L380 393 L366 401 L348 405 L331 400 L320 392 Z"
            />
            <path
              className="island island-small"
              d="M172 457 C180 451 190 452 196 458 L191 464 L178 466 Z"
            />
            <path
              className="island island-small"
              d="M210 446 C216 441 222 443 225 448 L219 452 L212 452 Z"
            />
            <path
              className="island island-small"
              d="M234 437 C239 432 245 434 247 439 L242 443 L236 442 Z"
            />
            <path
              className="island-detail"
              d="M595 128 C581 145 569 160 550 177 C539 189 530 205 518 218 C507 233 497 248 487 262 C478 275 467 289 458 303 C447 319 437 332 421 344 C406 355 389 358 375 350"
            />
            <path
              className="island-detail"
              d="M594 144 C578 159 567 171 555 188 C540 205 529 220 517 234 C505 248 497 263 488 276"
            />
          </g>
          <path className="route-muted" d={route} />
          <path className="route-halo" d={activeRoute} />
          <path className="route-active" d={activeRoute} />
          <path className="route-flow" d={activeRoute} />
          <g className="port-dash">
            <path d="M486 302 C472 315 465 322 458 329" />
          </g>
          <g className="map-label-region">
            <text x="340" y="290">
              HONSHU
            </text>
            <text x="252" y="430">
              KYUSHU
            </text>
            <text x="640" y="112">
              HOKKAIDO
            </text>
          </g>
          {REGIONS.map(region => {
            const active = game.unlockedRegions.includes(region.id);
            const selected = selectedId === region.id;
            return (
              <g
                key={region.id}
                className={`map-marker ${active ? "is-open" : "is-locked"} ${selected ? "is-selected" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`${region.city}, ${region.prefecture}${active ? ", 稼働中" : ", 未開設"}`}
                onClick={() => onSelect(region.id)}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(region.id);
                  }
                }}
              >
                <circle
                  className="marker-aura"
                  cx={region.x}
                  cy={region.y}
                  r={selected ? 17 : 12}
                />
                <circle
                  className="marker-outer"
                  cx={region.x}
                  cy={region.y}
                  r={selected ? 8 : 6.5}
                  filter={active && selected ? "url(#node-glow)" : undefined}
                />
                <circle
                  className="marker-core"
                  cx={region.x}
                  cy={region.y}
                  r={active ? 2.7 : 2.2}
                />
                {active && (
                  <circle
                    className="marker-pulse"
                    cx={region.x}
                    cy={region.y}
                    r="11"
                  />
                )}
                <text
                  className={`map-city-name ${active ? "name-open" : ""} ${selected ? "name-selected" : ""}`}
                  x={region.x + region.dx}
                  y={region.y + region.dy}
                  textAnchor={region.anchor}
                >
                  {region.mapName}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="map-selected-chip">
          <MapPin size={12} />
          <span>
            {REGIONS.find(region => region.id === selectedId)?.prefecture ??
              "日本"}
          </span>
          <b>
            {REGIONS.find(region => region.id === selectedId)?.city ?? "JAPAN"}
          </b>
        </div>
        <div className="map-radar">
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="map-footer">
        <div className="map-legend">
          <span>
            <i className="legend-dot active-dot" />
            稼働中
          </span>
          <span>
            <i className="legend-dot locked-dot" />
            未開設
          </span>
          <span>
            <i className="legend-line" />
            自動輸送ルート
          </span>
        </div>
        <div className="map-coordinate">
          35°41′N&nbsp;&nbsp; 139°45′E <span>·</span> TSUKUBA CONTROL
        </div>
      </div>
    </section>
  );
}

function MachineIcon({ id, size = 17 }: { id: MachineId; size?: number }) {
  const machine = MACHINES.find(item => item.id === id) ?? MACHINES[0];
  const Icon = machine.icon;
  return <Icon size={size} strokeWidth={1.7} />;
}

function ProductionLine({
  game,
  selectedMachine,
  onSelectMachine,
  detailed = false,
}: {
  game: GameData;
  selectedMachine: MachineId;
  onSelectMachine: (id: MachineId) => void;
  detailed?: boolean;
}) {
  const stockValue: Record<MachineId, number> = {
    supply: game.stock.steel,
    press: game.stock.chassis,
    engine: game.stock.engines,
    tire: game.stock.tireSets,
    assembly: game.stock.cars,
    dispatch: game.stock.cars,
  };
  const stockUnit: Record<MachineId, string> = {
    supply: "STEEL",
    press: "CHASSIS",
    engine: "ENGINES",
    tire: "TIRE SETS",
    assembly: "READY CARS",
    dispatch: "EXPORT QUEUE",
  };

  return (
    <section
      className={`panel production-panel ${detailed ? "production-detailed" : ""}`}
    >
      <div className="panel-heading production-heading">
        <div>
          <div className="eyebrow">
            AUTOMATED BUILD PIPELINE / TSUKUBA PLANT
          </div>
          <h2>
            {detailed ? "第01組立ライン" : "組立ライン"}
            <span className="line-code">LINE 01 · JDM COUPE</span>
          </h2>
        </div>
        <div className="line-health">
          <span
            className={
              Object.values(game.machineOn).every(Boolean)
                ? "health-led"
                : "health-led health-warn"
            }
          />
          {Object.values(game.machineOn).filter(Boolean).length} / 6 SYSTEMS
          ONLINE
        </div>
      </div>
      <div className="production-route-note">
        <span className="route-live-icon">
          <Activity size={13} />
        </span>
        <span>資材から輸出まで、自動で流れる生産ネットワーク</span>
        <span className="production-cycle">
          CYCLE {String(game.tick).padStart(4, "0")}
        </span>
      </div>
      <div className="station-track">
        {MACHINES.map((machine, index) => {
          const level = game.levels[machine.id];
          const enabled = game.machineOn[machine.id];
          const selected = selectedMachine === machine.id;
          const period = periodFor(game, machine.id);
          const progress =
            machine.id === "supply"
              ? (game.tick * 19) % 100
              : ((game.tick % period) / period) * 100;
          return (
            <div className="station-wrap" key={machine.id}>
              <button
                type="button"
                className={`station-card ${selected ? "station-selected" : ""} ${!enabled ? "station-off" : ""}`}
                onClick={() => onSelectMachine(machine.id)}
                aria-pressed={selected}
              >
                <div className="station-card-top">
                  <span>{machine.area}</span>
                  <span
                    className={`station-state ${enabled ? "" : "state-off"}`}
                  >
                    <i />
                    {enabled ? "RUN" : "OFF"}
                  </span>
                </div>
                <div className="station-icon-row">
                  <span className={`station-icon icon-${machine.id}`}>
                    <MachineIcon id={machine.id} size={18} />
                  </span>
                  <span className="level-tag">LV.{level}</span>
                </div>
                <div className="station-name">{machine.name}</div>
                <div className="station-english">{machine.english}</div>
                <div className="station-output">
                  <span>{stockUnit[machine.id]}</span>
                  <strong>
                    {String(stockValue[machine.id]).padStart(2, "0")}
                  </strong>
                </div>
                <div className="station-progress">
                  <span
                    style={{ width: `${enabled ? Math.max(7, progress) : 0}%` }}
                  />
                </div>
                <div className="station-foot">
                  <span>{machine.input}</span>
                  <ArrowRight size={11} />
                  <span>{machine.output}</span>
                </div>
              </button>
              {index < MACHINES.length - 1 && (
                <div
                  className={`station-connector ${enabled && game.machineOn[MACHINES[index + 1].id] ? "connector-live" : ""}`}
                >
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {detailed && <InventoryBoard game={game} />}
    </section>
  );
}

function InventoryBoard({ game }: { game: GameData }) {
  const items: Array<{
    label: string;
    key: keyof Stock;
    code: string;
    icon: LucideIcon;
    tone: string;
  }> = [
    { label: "鋼材", key: "steel", code: "STEEL", icon: Boxes, tone: "warm" },
    {
      label: "ゴム",
      key: "rubber",
      code: "RUBBER",
      icon: CircleGauge,
      tone: "olive",
    },
    {
      label: "シャシー",
      key: "chassis",
      code: "CHASSIS",
      icon: Hammer,
      tone: "silver",
    },
    {
      label: "エンジン",
      key: "engines",
      code: "ENGINE",
      icon: Cog,
      tone: "orange",
    },
    {
      label: "タイヤセット",
      key: "tireSets",
      code: "TIRES",
      icon: CircleGauge,
      tone: "dark",
    },
    {
      label: "完成車",
      key: "cars",
      code: "READY",
      icon: CarFront,
      tone: "red",
    },
  ];
  return (
    <div className="inventory-board">
      <div className="inventory-title">
        <div>
          <div className="eyebrow">INVENTORY / LIVE STOCK</div>
          <h3>工場在庫</h3>
        </div>
        <span className="inventory-total">
          <PackageCheck size={14} /> AUTO-SYNC
        </span>
      </div>
      <div className="inventory-grid">
        {items.map(item => {
          const Icon = item.icon;
          return (
            <div className="inventory-cell" key={item.code}>
              <span className={`inventory-icon tone-${item.tone}`}>
                <Icon size={15} />
              </span>
              <div>
                <span>{item.code}</span>
                <b>{item.label}</b>
              </div>
              <strong>
                {formatNumber(game.stock[item.key])}
                <small> u</small>
              </strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RegionInspector({
  game,
  region,
  onUnlock,
  onOpenMachine,
  onViewChange,
}: {
  game: GameData;
  region: Region;
  onUnlock: (region: Region) => void;
  onOpenMachine: (id: MachineId) => void;
  onViewChange: (view: View) => void;
}) {
  const active = game.unlockedRegions.includes(region.id);
  const Icon = region.icon;
  const canAfford = game.cash >= region.cost;
  return (
    <div className="inspector-body">
      <div className="inspector-kicker">
        <span>REGIONAL SITE / {region.zone}</span>
        <span className={`site-status ${active ? "site-open" : "site-locked"}`}>
          <i />
          {active ? "OPERATIONAL" : "UNOPENED"}
        </span>
      </div>
      <div className="region-hero">
        <div className={`region-emblem ${active ? "emblem-open" : ""}`}>
          <Icon size={23} strokeWidth={1.6} />
          <span>{region.prefecture.slice(0, 2)}</span>
        </div>
        <div>
          <div className="region-prefecture">{region.prefecture} / JAPAN</div>
          <h3>{region.city}</h3>
          <p>{region.role}</p>
        </div>
      </div>
      <p className="region-description">{region.detail}</p>
      <div className={`region-effect ${active ? "effect-live" : ""}`}>
        <div className="effect-label">
          <Sparkles size={12} /> NETWORK EFFECT
        </div>
        <strong>{region.effect}</strong>
        <span>
          {active
            ? "接続済み — 効果は自動で適用中"
            : "拠点開設後、ネットワークに自動で反映"}
        </span>
      </div>
      <div className="region-meta-grid">
        <div>
          <span>REGIONAL ZONE</span>
          <b>{region.zone}</b>
        </div>
        <div>
          <span>LINK TO TSUKUBA</span>
          <b>{active ? "CONNECTED" : "— — —"}</b>
        </div>
      </div>
      {active ? (
        <button
          type="button"
          className="action-button action-secondary full-action"
          onClick={() => {
            onOpenMachine(region.linkedMachine);
            onViewChange("factory");
          }}
        >
          <MachineIcon id={region.linkedMachine} size={15} />
          関連設備を調整する
          <ArrowRight size={15} />
        </button>
      ) : (
        <button
          type="button"
          className="action-button action-primary full-action"
          disabled={!canAfford}
          onClick={() => onUnlock(region)}
        >
          <MapPin size={15} />
          {canAfford
            ? `拠点を開設 · ${formatYen(region.cost)}`
            : `あと ${formatYen(region.cost - game.cash)} 必要`}
          <ArrowRight size={15} />
        </button>
      )}
      {!active && (
        <div className="unlock-note">
          <LockIcon /> 日本列島に新しい生産・販売ルートが開通します
        </div>
      )}
    </div>
  );
}

function LockIcon() {
  return <LockKeyhole className="lock-glyph" size={12} />;
}

function MachineInspector({
  game,
  machineId,
  onUpgrade,
  onToggle,
}: {
  game: GameData;
  machineId: MachineId;
  onUpgrade: (id: MachineId) => void;
  onToggle: (id: MachineId) => void;
}) {
  const machine = MACHINES.find(item => item.id === machineId) ?? MACHINES[4];
  const level = game.levels[machineId];
  const enabled = game.machineOn[machineId];
  const cost = machineUpgradeCost(game, machineId);
  const canUpgrade = game.cash >= cost && level < MAX_LEVEL;
  const effect = getMachineEffect(game, machineId);
  const Icon = machine.icon;
  return (
    <div className="inspector-body machine-inspector">
      <div className="inspector-kicker">
        <span>LINE CONTROL / TSUKUBA</span>
        <span
          className={`site-status ${enabled ? "site-open" : "site-locked"}`}
        >
          <i />
          {enabled ? "RUNNING" : "STOPPED"}
        </span>
      </div>
      <div className="machine-hero">
        <div className={`machine-big-icon icon-${machineId}`}>
          <Icon size={24} strokeWidth={1.6} />
        </div>
        <div>
          <div className="machine-subtitle">
            {machine.english} / {machine.area.split(" / ")[0]}
          </div>
          <h3>{machine.name}</h3>
          <p>
            TSUKUBA PLANT · UNIT 0
            {MACHINES.findIndex(item => item.id === machineId) + 1}
          </p>
        </div>
      </div>
      <div className="level-display">
        <div>
          <span>UPGRADE LEVEL</span>
          <b>
            LV.{level}
            <small> / {MAX_LEVEL}</small>
          </b>
        </div>
        <div className="level-pips">
          {Array.from({ length: MAX_LEVEL }, (_, index) => (
            <i key={index} className={index < level ? "pip-filled" : ""} />
          ))}
        </div>
      </div>
      <div className="machine-output-card">
        <div className="effect-label">
          <Zap size={12} /> CURRENT OUTPUT
        </div>
        <strong>{effect.current}</strong>
        <span>{effect.next}</span>
      </div>
      <div className="machine-control-row">
        <div>
          <span>自動運転</span>
          <small>
            {enabled ? "素材があれば生産を継続" : "この工程は停止中"}
          </small>
        </div>
        <button
          type="button"
          className={`toggle-switch ${enabled ? "toggle-on" : ""}`}
          role="switch"
          aria-checked={enabled}
          aria-label={`${machine.name}の自動運転を${enabled ? "停止" : "開始"}`}
          onClick={() => onToggle(machineId)}
        >
          <span />
        </button>
      </div>
      <button
        type="button"
        className="action-button action-primary full-action upgrade-button"
        disabled={!canUpgrade}
        onClick={() => onUpgrade(machineId)}
      >
        {level >= MAX_LEVEL ? <Check size={15} /> : <ArrowUpRight size={15} />}
        {level >= MAX_LEVEL
          ? "MAX LEVEL · 強化済み"
          : `設備をアップグレード · ${formatYen(cost)}`}
        {level < MAX_LEVEL && <ArrowRight size={15} />}
      </button>
      {level < MAX_LEVEL && (
        <div className="upgrade-note">
          <span>次のレベル</span>
          <b>{effect.nextShort}</b>
        </div>
      )}
      {level >= MAX_LEVEL && (
        <div className="upgrade-note">
          <Check size={13} />
          <b>この設備は最大レベルです</b>
        </div>
      )}
    </div>
  );
}

function getMachineEffect(
  game: GameData,
  id: MachineId
): { current: string; next: string; nextShort: string } {
  const level = game.levels[id];
  if (id === "supply")
    return {
      current: `+${1 + level + (game.unlockedRegions.includes("sapporo") ? 1 : 0)} 鋼材 / cycle`,
      next: `次の強化で鋼材供給が +1 / cycle`,
      nextShort: `鋼材 +${2 + level + (game.unlockedRegions.includes("sapporo") ? 1 : 0)} / cycle`,
    };
  if (id === "press")
    return {
      current: `約${periodFor(game, id)} cycle ごとにシャシー`,
      next: `生産周期を短縮。群馬拠点で追加成形`,
      nextShort: `周期 ${Math.max(2, 4 - level)} cycle`,
    };
  if (id === "engine")
    return {
      current: `約${periodFor(game, id)} cycle ごとにエンジン`,
      next: `ターボユニットの組立速度を改善`,
      nextShort: `周期 ${Math.max(2, 5 - level)} cycle`,
    };
  if (id === "tire")
    return {
      current: `約${periodFor(game, id)} cycle ごとにタイヤ`,
      next: `ラバーラインとタイヤ成形を高速化`,
      nextShort: `周期 ${Math.max(2, 5 - level)} cycle`,
    };
  if (id === "assembly")
    return {
      current: `約${periodFor(game, id)} cycle ごとに完成車`,
      next: `完成車の組立サイクルを短縮`,
      nextShort: `周期 ${Math.max(2, 6 - level)} cycle`,
    };
  return {
    current: `出荷額 +${formatYen(level * 12_000)} / car`,
    next: `熟練スタッフと港湾設備で輸出単価を改善`,
    nextShort: `出荷額 +${formatYen((level + 1) * 12_000)} / car`,
  };
}

function DetailInspector({
  game,
  region,
  selectedMachine,
  detailTab,
  onTab,
  onUnlock,
  onOpenMachine,
  onViewChange,
  onUpgrade,
  onToggle,
}: {
  game: GameData;
  region: Region;
  selectedMachine: MachineId;
  detailTab: DetailTab;
  onTab: (tab: DetailTab) => void;
  onUnlock: (region: Region) => void;
  onOpenMachine: (id: MachineId) => void;
  onViewChange: (view: View) => void;
  onUpgrade: (id: MachineId) => void;
  onToggle: (id: MachineId) => void;
}) {
  return (
    <section className="panel inspector-panel">
      <div className="inspector-tabs">
        <button
          type="button"
          className={detailTab === "region" ? "tab-active" : ""}
          onClick={() => onTab("region")}
        >
          <MapPin size={13} />
          拠点
        </button>
        <button
          type="button"
          className={detailTab === "machine" ? "tab-active" : ""}
          onClick={() => onTab("machine")}
        >
          <Cog size={13} />
          設備管理
        </button>
      </div>
      {detailTab === "region" ? (
        <RegionInspector
          game={game}
          region={region}
          onUnlock={onUnlock}
          onOpenMachine={onOpenMachine}
          onViewChange={onViewChange}
        />
      ) : (
        <MachineInspector
          game={game}
          machineId={selectedMachine}
          onUpgrade={onUpgrade}
          onToggle={onToggle}
        />
      )}
    </section>
  );
}

function ContractPanel({
  game,
  onShip,
  onClaim,
}: {
  game: GameData;
  onShip: () => void;
  onClaim: () => void;
}) {
  const goal = 3;
  const progress = Math.min(game.shipments, goal);
  const complete = game.shipments >= goal;
  const claimable = complete && !game.contractClaimed;
  const dispatchReady =
    game.stock.cars > 0 &&
    game.machineOn.dispatch &&
    game.unlockedRegions.includes("yokohama");
  return (
    <section className="panel contract-panel">
      <div className="contract-top">
        <div className="eyebrow">ACTIVE CONTRACT / 01</div>
        <span className="contract-timer">
          <Clock3 size={12} /> DUE {formatCountdown(game.tick)}
        </span>
      </div>
      <div className="contract-title-row">
        <span className="contract-stamp">峠</span>
        <div>
          <h3>WEEKEND TOUGE RUN</h3>
          <p>週末の峠ミーティングへ3台納車</p>
        </div>
      </div>
      <div className="contract-progress-label">
        <span>DELIVERY TARGET</span>
        <b>
          {String(progress).padStart(2, "0")} <i>/</i> 03
        </b>
      </div>
      <div className="contract-progress">
        <span style={{ width: `${(progress / goal) * 100}%` }} />
      </div>
      <div className="contract-reward">
        <span>
          <Sparkles size={13} /> CONTRACT REWARD
        </span>
        <b>
          ¥180,000 <i>+ 75 REP</i>
        </b>
      </div>
      {claimable ? (
        <button
          type="button"
          className="action-button action-primary full-action"
          onClick={onClaim}
        >
          <Check size={15} />
          報酬を受け取る
          <ArrowRight size={15} />
        </button>
      ) : game.contractClaimed ? (
        <div className="contract-complete">
          <Check size={14} /> CONTRACT COMPLETE <span>次の契約は準備中</span>
        </div>
      ) : (
        <button
          type="button"
          className="action-button action-secondary full-action ship-action"
          onClick={onShip}
          disabled={!dispatchReady}
        >
          <Ship size={15} />
          {game.stock.cars > 0
            ? `横浜へ ${game.stock.cars} 台まとめて出荷`
            : "完成車の出荷待ち"}
          <ArrowRight size={15} />
        </button>
      )}
      {!game.machineOn.dispatch && !game.contractClaimed && (
        <div className="contract-warning">
          輸出設備が停止中です。設備管理から再稼働してください。
        </div>
      )}
    </section>
  );
}

function GarageView({
  game,
  onSelectModel,
  onShip,
  onClaim,
}: {
  game: GameData;
  onSelectModel: (model: VehicleModel) => void;
  onShip: () => void;
  onClaim: () => void;
}) {
  const selected =
    VEHICLES.find(model => model.id === game.activeModel) ?? VEHICLES[0];
  const estimated = vehicleValue(game, selected);
  return (
    <div className="workspace-grid garage-layout">
      <section className="panel garage-panel">
        <div className="panel-heading garage-heading">
          <div>
            <div className="eyebrow">KOBO MOTORWORKS / DEVELOPMENT GARAGE</div>
            <h2>JDMモデル開発室</h2>
          </div>
          <span className="garage-live">
            <i /> TSUKUBA DESIGN STUDIO
          </span>
        </div>
        <div className={`showroom-stage body-${selected.body}`}>
          <div className="showroom-stamp">
            <span>工</span>
            <b>
              BUILT
              <br />
              IN JAPAN
            </b>
          </div>
          <div className="showroom-floor-lines" />
          <div className="showroom-car">
            <CarIllustration model={selected} />
          </div>
          <div className="showroom-copy">
            <span>{selected.series} / FACTORY SPEC</span>
            <h3>{selected.name}</h3>
            <p>{selected.tagline}</p>
          </div>
          <div className="showroom-spec">
            <span>POWERTRAIN</span>
            <b>{selected.spec}</b>
            <span>BASE EXPORT VALUE</span>
            <strong>{formatYen(estimated)}</strong>
          </div>
          <div className="showroom-sun" />
        </div>
        <div className="model-picker-heading">
          <div>
            <div className="eyebrow">HOMOLOGATED LINEUP</div>
            <h3>生産モデルを選択</h3>
          </div>
          <span>SHIPPED {String(game.shipments).padStart(2, "0")} UNITS</span>
        </div>
        <div className="model-grid">
          {VEHICLES.map(model => {
            const unlocked = game.shipments >= model.unlockAt;
            const active = model.id === game.activeModel;
            return (
              <button
                type="button"
                key={model.id}
                className={`model-card ${active ? "model-active" : ""} ${!unlocked ? "model-locked" : ""}`}
                disabled={!unlocked}
                onClick={() => onSelectModel(model)}
              >
                <span className="model-card-top">
                  <span>{model.series}</span>
                  {active ? (
                    <i className="model-check">
                      <Check size={12} />
                    </i>
                  ) : !unlocked ? (
                    <span className="model-lock">LOCKED</span>
                  ) : (
                    <ArrowUpRight size={14} />
                  )}
                </span>
                <span
                  className="model-color"
                  style={{ background: model.paint }}
                />
                <strong>{model.name}</strong>
                <span className="model-style">{model.style}</span>
                <span className="model-unlock-note">
                  {unlocked
                    ? `${formatYen(vehicleValue(game, model))} / car`
                    : `輸出 ${model.unlockAt} 台で解放`}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <aside className="side-stack garage-side-stack">
        <section className="panel shipment-panel">
          <div className="eyebrow">YOKOHAMA EXPORT / DOCK 02</div>
          <div className="shipment-count">
            <div>
              <span>READY TO SHIP</span>
              <b>{String(game.stock.cars).padStart(2, "0")}</b>
            </div>
            <CarFront size={29} strokeWidth={1.3} />
          </div>
          <div className="shipment-value">
            <span>現在のモデル · {selected.name}</span>
            <b>
              {formatYen(estimated)}
              <small> / unit</small>
            </b>
          </div>
          <div className="shipment-divider" />
          <div className="shipment-detail">
            <span>出荷累計</span>
            <b>{formatNumber(game.shipments)} 台</b>
          </div>
          <div className="shipment-detail">
            <span>ドライバーレピュテーション</span>
            <b>REP {formatNumber(game.reputation)}</b>
          </div>
          <button
            type="button"
            className="action-button action-primary full-action"
            onClick={onShip}
            disabled={game.stock.cars === 0 || !game.machineOn.dispatch}
          >
            <ArrowDownToLine size={15} />
            {game.stock.cars
              ? `${game.stock.cars}台を一括輸出`
              : "完成車の出荷待ち"}
            <ArrowRight size={15} />
          </button>
          {!game.machineOn.dispatch && (
            <div className="contract-warning">横浜輸出港が停止中です。</div>
          )}
        </section>
        <ContractPanel game={game} onShip={onShip} onClaim={onClaim} />
      </aside>
    </div>
  );
}

function CarIllustration({ model }: { model: VehicleModel }) {
  const isRally = model.body === "rally";
  const isRoadster = model.body === "roadster";
  return (
    <svg
      className={`car-art car-${model.body}`}
      viewBox="0 0 720 270"
      role="img"
      aria-label={`${model.name}の車体イラスト`}
    >
      <defs>
        <linearGradient id={`paint-${model.id}`} x1="0" x2="0.08" y1="0" y2="1">
          <stop offset="0" stopColor={model.paint} />
          <stop offset=".58" stopColor={model.paint} />
          <stop offset="1" stopColor="#7d3328" />
        </linearGradient>
        <linearGradient id={`glass-${model.id}`} x1="0" x2="0.3" y1="0" y2="1">
          <stop offset="0" stopColor="#314340" />
          <stop offset="1" stopColor="#111918" />
        </linearGradient>
        <linearGradient id={`shine-${model.id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#fff7df" stopOpacity="0" />
          <stop offset=".45" stopColor="#fff7df" stopOpacity=".6" />
          <stop offset="1" stopColor="#fff7df" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse
        cx="368"
        cy="224"
        rx="265"
        ry="17"
        fill="#050807"
        opacity=".68"
      />
      {isRally && (
        <path
          d="M123 150 L112 128 L184 128 L193 149 M550 150 L581 131 L616 131 L600 155"
          fill="#1b211e"
          stroke="#9ba49a"
          strokeWidth="5"
        />
      )}
      <path
        d="M75 190 C83 179 100 171 122 166 L208 153 L256 112 C275 96 302 86 338 83 L423 84 C453 85 481 99 501 121 L541 152 L623 163 C646 166 660 180 663 197 L657 215 L85 215 C77 210 72 200 75 190Z"
        fill={`url(#paint-${model.id})`}
        stroke="#f1d5ad"
        strokeOpacity=".45"
        strokeWidth="2"
      />
      <path
        d={
          isRoadster
            ? "M249 153 L283 115 C295 105 309 101 331 100 L392 100 C412 100 427 108 444 128 L462 153Z"
            : "M245 153 L281 116 C295 102 315 94 342 93 L416 94 C442 96 463 111 482 136 L495 153Z"
        }
        fill={`url(#glass-${model.id})`}
        stroke="#c3c6ad"
        strokeOpacity=".58"
        strokeWidth="2"
      />
      <path
        d="M354 95 L350 153 M430 101 L448 153"
        fill="none"
        stroke="#818d7f"
        strokeWidth="2"
        opacity=".75"
      />
      <path
        d="M267 157 C346 163 440 162 548 160"
        fill="none"
        stroke="#ffe5c7"
        strokeOpacity=".48"
        strokeWidth="2"
      />
      <path
        d="M86 185 L137 174 L147 183 L120 194 L82 196Z"
        fill="#f1dba6"
        opacity=".85"
      />
      <path d="M625 174 L652 182 L654 194 L626 191Z" fill="#eb684f" />
      <path
        d="M144 204 L604 204"
        fill="none"
        stroke="#54291f"
        strokeWidth="3"
        opacity=".72"
      />
      <path
        d="M307 173 L444 172 L520 178"
        fill="none"
        stroke={`url(#shine-${model.id})`}
        strokeWidth="2"
      />
      <path
        d="M116 212 L612 212"
        fill="none"
        stroke="#1b201d"
        strokeWidth="6"
      />
      <g>
        <circle
          cx="190"
          cy="207"
          r="41"
          fill="#0a0d0c"
          stroke="#84897b"
          strokeWidth="4"
        />
        <circle
          cx="190"
          cy="207"
          r="25"
          fill="#747a70"
          stroke="#c3c2ad"
          strokeWidth="3"
        />
        <circle
          cx="190"
          cy="207"
          r="11"
          fill="#232a25"
          stroke="#d4d1bd"
          strokeWidth="2"
        />
        {[0, 60, 120].map(angle => (
          <path
            key={angle}
            d="M190 184 L190 230"
            stroke="#d4d1bd"
            strokeWidth="3"
            transform={`rotate(${angle} 190 207)`}
          />
        ))}
        <circle
          cx="552"
          cy="207"
          r="41"
          fill="#0a0d0c"
          stroke="#84897b"
          strokeWidth="4"
        />
        <circle
          cx="552"
          cy="207"
          r="25"
          fill="#747a70"
          stroke="#c3c2ad"
          strokeWidth="3"
        />
        <circle
          cx="552"
          cy="207"
          r="11"
          fill="#232a25"
          stroke="#d4d1bd"
          strokeWidth="2"
        />
        {[0, 60, 120].map(angle => (
          <path
            key={angle}
            d="M552 184 L552 230"
            stroke="#d4d1bd"
            strokeWidth="3"
            transform={`rotate(${angle} 552 207)`}
          />
        ))}
      </g>
      <path
        d="M190 205 C218 187 267 173 327 168"
        fill="none"
        stroke="#fff0d5"
        strokeOpacity=".19"
        strokeWidth="1.5"
      />
      {isRally && (
        <>
          <path
            d="M270 182 L320 182 M336 182 L386 182 M402 182 L452 182"
            stroke="#eef0dd"
            strokeOpacity=".35"
            strokeWidth="5"
          />
          <rect x="589" y="149" width="17" height="5" fill="#222722" />
        </>
      )}
      {isRoadster && (
        <path
          d="M281 108 Q314 76 360 82 L407 88"
          fill="none"
          stroke="#d8dfc3"
          strokeWidth="5"
          strokeLinecap="round"
          opacity=".68"
        />
      )}
      <text
        x="399"
        y="190"
        fill="#f5ead0"
        fontFamily="ui-monospace, monospace"
        fontSize="10"
        letterSpacing="2"
        opacity=".82"
      >
        KOBO
      </text>
    </svg>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
  tone,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  tone: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className={`metric-icon metric-${tone}`}>
        <Icon size={16} strokeWidth={1.7} />
      </span>
      <span className="metric-copy">
        <span>{label}</span>
        <b>{value}</b>
        <small>{note}</small>
      </span>
      {onClick && <ArrowUpRight size={13} className="metric-link" />}
    </>
  );
  return onClick ? (
    <button
      type="button"
      className="metric-card metric-button"
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <div className="metric-card">{content}</div>
  );
}

function SettingsDialog({
  onClose,
  onReset,
}: {
  onClose: () => void;
  onReset: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="settings-top">
          <div className="settings-icon">
            <Settings2 size={18} />
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="閉じる"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <div className="eyebrow">KOBO MOTORWORKS / SYSTEM</div>
        <h2 id="settings-title">システム設定</h2>
        <p>進行状況はこのブラウザに自動保存されています。</p>
        <div className="settings-save-row">
          <span>
            <Check size={14} /> LOCAL SAVE ACTIVE
          </span>
          <small>自動保存 · {SAVE_KEY}</small>
        </div>
        <div className="settings-reset">
          <div>
            <b>新しい工場を始める</b>
            <span>資金・生産・ネットワークの進行状況をリセット</span>
          </div>
          <button
            type="button"
            className="reset-button"
            onClick={() => {
              if (confirmReset) onReset();
              else setConfirmReset(true);
            }}
          >
            {confirmReset ? (
              "もう一度押して初期化"
            ) : (
              <>
                <RotateCcw size={14} />
                進行状況をリセット
              </>
            )}
          </button>
        </div>
        <button
          type="button"
          className="action-button action-secondary full-action"
          onClick={onClose}
        >
          ゲームに戻る
          <ArrowRight size={15} />
        </button>
      </section>
    </div>
  );
}

export default function Home() {
  const [game, setGame] = useState<GameData>(() => loadGame());
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState<1 | 2 | 3>(1);
  const [view, setView] = useState<View>("map");
  const [selectedRegionId, setSelectedRegionId] = useState("tsukuba");
  const [selectedMachine, setSelectedMachine] = useState<MachineId>("assembly");
  const [detailTab, setDetailTab] = useState<DetailTab>("region");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(game));
    } catch {
      // The simulation remains playable when browser storage is unavailable.
    }
  }, [game]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(
      () => setGame(current => advanceGame(current)),
      1_100 / speed
    );
    return () => window.clearInterval(timer);
  }, [running, speed]);

  const selectedRegion = useMemo(
    () => REGIONS.find(region => region.id === selectedRegionId) ?? REGIONS[3],
    [selectedRegionId]
  );
  const selectedVehicle =
    VEHICLES.find(model => model.id === game.activeModel) ?? VEHICLES[0];
  const unitValue = vehicleValue(game, selectedVehicle);
  const operationalCount = Object.values(game.machineOn).filter(Boolean).length;

  const selectMachine = (id: MachineId) => {
    setSelectedMachine(id);
    setDetailTab("machine");
  };

  const unlockRegion = (region: Region) => {
    if (game.unlockedRegions.includes(region.id)) return;
    if (game.cash < region.cost) {
      toast.error("拠点開設に必要な資金が足りません");
      return;
    }
    setGame(current => {
      if (
        current.unlockedRegions.includes(region.id) ||
        current.cash < region.cost
      )
        return current;
      return {
        ...current,
        cash: current.cash - region.cost,
        unlockedRegions: [...current.unlockedRegions, region.id],
      };
    });
    toast.success(`${region.prefecture}に新しい生産ルートが開通しました`, {
      description: `${region.effect} · 日本ネットワーク拡張`,
    });
  };

  const upgradeMachine = (id: MachineId) => {
    if (game.levels[id] >= MAX_LEVEL) return;
    const cost = machineUpgradeCost(game, id);
    if (game.cash < cost) {
      toast.error("アップグレード資金が足りません");
      return;
    }
    setGame(current => {
      const currentCost = machineUpgradeCost(current, id);
      if (current.cash < currentCost || current.levels[id] >= MAX_LEVEL)
        return current;
      return {
        ...current,
        cash: current.cash - currentCost,
        levels: { ...current.levels, [id]: current.levels[id] + 1 },
      };
    });
    toast.success(
      `${MACHINES.find(machine => machine.id === id)?.name}を強化しました`,
      { description: `設備レベル ${game.levels[id]} → ${game.levels[id] + 1}` }
    );
  };

  const toggleMachine = (id: MachineId) => {
    const next = !game.machineOn[id];
    setGame(current => ({
      ...current,
      machineOn: { ...current.machineOn, [id]: !current.machineOn[id] },
    }));
    toast(next ? "設備を再稼働しました" : "設備を停止しました", {
      description: MACHINES.find(machine => machine.id === id)?.name,
    });
  };

  const shipCars = () => {
    if (game.stock.cars <= 0) {
      toast.error("輸出待ちの完成車がありません", {
        description: "組立ラインが完成車を生産するまでお待ちください。",
      });
      return;
    }
    if (
      !game.machineOn.dispatch ||
      !game.unlockedRegions.includes("yokohama")
    ) {
      toast.error("横浜輸出港が稼働していません");
      return;
    }
    const quantity = game.stock.cars;
    const perCar = vehicleValue(game, selectedVehicle);
    const total = quantity * perCar;
    setGame(current => {
      const count = current.stock.cars;
      if (
        count <= 0 ||
        !current.machineOn.dispatch ||
        !current.unlockedRegions.includes("yokohama")
      )
        return current;
      const currentModel =
        VEHICLES.find(model => model.id === current.activeModel) ?? VEHICLES[0];
      const payout = count * vehicleValue(current, currentModel);
      return {
        ...current,
        cash: current.cash + payout,
        stock: { ...current.stock, cars: 0 },
        shipments: current.shipments + count,
        reputation: current.reputation + count * 12,
      };
    });
    toast.success(`${quantity}台を横浜港から輸出しました`, {
      description: `${selectedVehicle.name} · 売上 ${formatYen(total)} · REP +${quantity * 12}`,
    });
  };

  const claimContract = () => {
    if (game.shipments < 3 || game.contractClaimed) return;
    setGame(current =>
      current.shipments < 3 || current.contractClaimed
        ? current
        : {
            ...current,
            cash: current.cash + 180_000,
            reputation: current.reputation + 75,
            contractClaimed: true,
          }
    );
    toast.success("峠ミーティングの契約を達成しました", {
      description: "報酬 ¥180,000 と REP +75 を受け取りました。",
    });
  };

  const selectModel = (model: VehicleModel) => {
    if (game.shipments < model.unlockAt) return;
    setGame(current => ({ ...current, activeModel: model.id }));
    toast.success(`${model.name}を生産モデルに設定しました`, {
      description: `${formatYen(vehicleValue(game, model))} / car · 生産ラインへ反映`,
    });
  };

  const resetGame = () => {
    window.localStorage.removeItem(SAVE_KEY);
    setGame(createFreshGame());
    setRunning(true);
    setSpeed(1);
    setView("map");
    setSelectedRegionId("tsukuba");
    setSelectedMachine("assembly");
    setDetailTab("region");
    setSettingsOpen(false);
    toast.success("新しい工場を開設しました", {
      description: "日本の自動車ネットワークを再スタート。",
    });
  };

  const tabs: Array<{
    id: View;
    label: string;
    sub: string;
    icon: LucideIcon;
  }> = [
    { id: "map", label: "日本マップ", sub: "NETWORK", icon: Map },
    { id: "factory", label: "工場ライン", sub: "PRODUCTION", icon: Factory },
    { id: "garage", label: "JDMガレージ", sub: "DEVELOPMENT", icon: CarFront },
  ];

  return (
    <div className="game-root">
      <aside className="side-rail">
        <button
          type="button"
          className="rail-logo"
          aria-label="KOBO Motorworks ホーム"
          onClick={() => setView("map")}
        >
          <span>工</span>
          <i />
        </button>
        <div className="rail-rule" />
        <nav className="rail-nav" aria-label="ゲームビュー">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                type="button"
                key={tab.id}
                className={`rail-button ${view === tab.id ? "rail-active" : ""}`}
                aria-label={tab.label}
                aria-current={view === tab.id ? "page" : undefined}
                onClick={() => setView(tab.id)}
              >
                <Icon size={18} strokeWidth={1.7} />
                <span>{tab.sub}</span>
                <i />
              </button>
            );
          })}
        </nav>
        <div className="rail-bottom">
          <div className="rail-jp-stamp">
            日<br />本
          </div>
          <button
            type="button"
            className="rail-button rail-settings"
            aria-label="設定"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={18} />
            <span>SETUP</span>
          </button>
        </div>
      </aside>

      <div className="app-column">
        <header className="topbar">
          <div className="wordmark">
            <div className="wordmark-seal">
              <span>工</span>
              <i />
            </div>
            <div>
              <b>KOBO MOTORWORKS</b>
              <small>JDM AUTOMATION SIMULATOR</small>
            </div>
          </div>
          <div className="topbar-location">
            <MapPin size={13} />
            <span>TSUKUBA PLANT</span>
            <i /> <b>IBARAKI, JAPAN</b>
          </div>
          <div className="topbar-controls">
            <div
              className={`factory-status ${running ? "status-running" : "status-paused"}`}
            >
              <i />
              {running ? "FACTORY LIVE" : "PAUSED"}
            </div>
            <div className="speed-control" aria-label="シミュレーション速度">
              {([1, 2, 3] as const).map(value => (
                <button
                  type="button"
                  className={speed === value ? "speed-active" : ""}
                  key={value}
                  onClick={() => setSpeed(value)}
                  aria-pressed={speed === value}
                >
                  {value}×
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`play-toggle ${running ? "is-playing" : ""}`}
              aria-label={running ? "一時停止" : "再生"}
              onClick={() => setRunning(value => !value)}
            >
              {running ? (
                <Pause size={15} fill="currentColor" />
              ) : (
                <Play size={15} fill="currentColor" />
              )}
            </button>
            <button
              type="button"
              className="top-settings"
              aria-label="設定"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 size={16} />
            </button>
          </div>
        </header>

        <main className="main-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow page-eyebrow">
                <span className="eyebrow-line" /> SEASON 01 / NIPPON AUTOMATION
                PROJECT
              </div>
              <h1>
                NIPPON <span>MOTOR GRID</span>
              </h1>
              <p>
                組んで、流して、日本を走らせる。{" "}
                <i>日本発、JDMオートメーション。</i>
              </p>
            </div>
            <div className="shift-card">
              <span className="shift-mark">01</span>
              <div>
                <small>FACTORY SHIFT</small>
                <b>
                  DAY 01 <i>·</i> TSUKUBA
                </b>
                <span>
                  茨城県つくば市 <i>35.90°N / 140.06°E</i>
                </span>
              </div>
              <div className="sun-stamp">日</div>
            </div>
          </section>

          <section className="metrics-row" aria-label="工場ステータス">
            <MetricCard
              icon={BadgeJapaneseYen}
              label="運転資金 / OPERATING FUNDS"
              value={formatYen(game.cash)}
              note="輸出・契約報酬で拡張"
              tone="money"
            />
            <MetricCard
              icon={CarFront}
              label="出荷待ち / READY TO SHIP"
              value={`${String(game.stock.cars).padStart(2, "0")} 台`}
              note={`${selectedVehicle.name} · ${formatYen(unitValue)} / unit`}
              tone="cars"
              onClick={() => setView("garage")}
            />
            <MetricCard
              icon={Factory}
              label="累計生産 / CARS BUILT"
              value={`${formatNumber(game.lifetimeCars)} 台`}
              note={`${operationalCount} / 6 生産設備が稼働中`}
              tone="built"
              onClick={() => setView("factory")}
            />
            <MetricCard
              icon={Truck}
              label="輸出実績 / SHIPPED"
              value={`${formatNumber(game.shipments)} 台`}
              note={`REP ${formatNumber(game.reputation)} · 横浜港`}
              tone="export"
              onClick={() => setView("garage")}
            />
          </section>

          <div className="view-switcher">
            <div className="view-tabs">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    type="button"
                    key={tab.id}
                    className={
                      view === tab.id ? "view-tab tab-current" : "view-tab"
                    }
                    onClick={() => setView(tab.id)}
                  >
                    <Icon size={15} />
                    <span>{tab.label}</span>
                    <small>{tab.sub}</small>
                    {view === tab.id && <i />}
                  </button>
                );
              })}
            </div>
            <div className="autosave-status">
              <span className="save-led" /> AUTO-SAVE <b>ON</b>
              <span className="view-separator" /> SHIFT CYCLE{" "}
              <strong>{String(game.tick).padStart(4, "0")}</strong>
            </div>
          </div>

          {view === "map" && (
            <>
              <div className="workspace-grid map-layout">
                <JapanMap
                  game={game}
                  selectedId={selectedRegionId}
                  onSelect={id => {
                    setSelectedRegionId(id);
                    setDetailTab("region");
                  }}
                />
                <aside className="side-stack">
                  <DetailInspector
                    game={game}
                    region={selectedRegion}
                    selectedMachine={selectedMachine}
                    detailTab={detailTab}
                    onTab={setDetailTab}
                    onUnlock={unlockRegion}
                    onOpenMachine={selectMachine}
                    onViewChange={setView}
                    onUpgrade={upgradeMachine}
                    onToggle={toggleMachine}
                  />
                  <ContractPanel
                    game={game}
                    onShip={shipCars}
                    onClaim={claimContract}
                  />
                </aside>
              </div>
              <ProductionLine
                game={game}
                selectedMachine={selectedMachine}
                onSelectMachine={selectMachine}
              />
            </>
          )}

          {view === "factory" && (
            <div className="workspace-grid factory-layout">
              <div className="factory-main-column">
                <ProductionLine
                  game={game}
                  selectedMachine={selectedMachine}
                  onSelectMachine={selectMachine}
                  detailed
                />
                <section className="panel flow-card">
                  <div className="panel-heading">
                    <div>
                      <div className="eyebrow">
                        SUPPLY / PARTS / FINISHED VEHICLES
                      </div>
                      <h2>工場在庫</h2>
                    </div>
                    <span className="inventory-total">
                      <PackageCheck size={14} /> AUTO-SYNC
                    </span>
                  </div>
                  <InventoryBoard game={game} />
                  <div className="flow-note">
                    <div className="flow-note-icon">
                      <BatteryCharging size={17} />
                    </div>
                    <div>
                      <b>素材はすべて自動で搬送</b>
                      <span>
                        設備をアップグレードするとサイクルが短縮。地域拠点の開設は日本マップから。
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setView("map");
                        setSelectedRegionId("sapporo");
                        setDetailTab("region");
                      }}
                    >
                      マップを開く
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </section>
              </div>
              <aside className="side-stack factory-side-stack">
                <DetailInspector
                  game={game}
                  region={selectedRegion}
                  selectedMachine={selectedMachine}
                  detailTab="machine"
                  onTab={tab => {
                    setDetailTab(tab);
                    if (tab === "region") setView("map");
                  }}
                  onUnlock={unlockRegion}
                  onOpenMachine={selectMachine}
                  onViewChange={setView}
                  onUpgrade={upgradeMachine}
                  onToggle={toggleMachine}
                />
                <ContractPanel
                  game={game}
                  onShip={shipCars}
                  onClaim={claimContract}
                />
              </aside>
            </div>
          )}

          {view === "garage" && (
            <>
              <GarageView
                game={game}
                onSelectModel={selectModel}
                onShip={shipCars}
                onClaim={claimContract}
              />
              <ProductionLine
                game={game}
                selectedMachine={selectedMachine}
                onSelectMachine={id => {
                  selectMachine(id);
                  setView("factory");
                }}
              />
            </>
          )}

          <footer className="game-footer">
            <div className="footer-brand">
              <span>工</span>
              <b>KOBO MOTORWORKS</b>
              <i>—</i>
              <small>BUILT BY THE LINE. DRIVEN BY YOU.</small>
            </div>
            <div className="footer-system">
              <span>
                <i /> SIMULATION ONLINE
              </span>
              <span>LOCAL SAVE ENABLED</span>
              <span>© KOBO AUTOMOTIVE / 2026</span>
            </div>
          </footer>
        </main>
      </div>
      {settingsOpen && (
        <SettingsDialog
          onClose={() => setSettingsOpen(false)}
          onReset={resetGame}
        />
      )}
    </div>
  );
}
