# S1. 全体アーキテクチャ ＆ ゲームループ定義

> 対象：Tech Lead / Lead Designer ／ 前提：`07_tech_spec.md`（基盤）, `01_vision_and_core_loop.md`（意図）
> 本書は **シーン遷移・データ構造・昼夜の移行条件** を実装可能な粒度で確定する。

---

## 1. レイヤ構成

```
┌─────────────────────────────────────────────────────────────┐
│ PRESENTATION  React 19 + Tailwind（HUD/画面）                 │
│               WebGL2 Renderer ×2（FactoryRenderer / RoadRenderer）│
├─────────────────────────────────────────────────────────────┤
│ APPLICATION   SceneDirector / InputRouter / AudioDirector      │
│               CommandBus（UI→Sim は命令のみ。状態直接変更は禁止） │
├─────────────────────────────────────────────────────────────┤
│ SIMULATION    Web Worker ×3（決定論・20 Hz 固定ステップ）        │
│   worker:factory   工場（ECS/SoA・ベルト圧縮・流体・電力・回路）  │
│   worker:vehicle   走行（60 Hz 内挿・車両ダイナミクス・交通AI）   │
│   worker:economy   市場・研究・レストア・時間（1 Hz で足りる）    │
├─────────────────────────────────────────────────────────────┤
│ DATA          ContentDB（JSON・読み取り専用）                   │
│               WorldState（SoA・SharedArrayBuffer）              │
│               SaveStore（IndexedDB・バイナリ・圧縮）             │
└─────────────────────────────────────────────────────────────┘
```

**鉄則**：`worker:factory` と `worker:vehicle` は**同時に走らない**。
昼は factory が 20 Hz、夜は vehicle が 20 Hz（描画は 60 Hz 内挿）。
economy は常時 1 Hz。これにより性能予算（`07` §9）を二重取りしない。

---

## 2. シーングラフと遷移

### 2.1 シーン一覧

| ID | 名称 | 描画系 | 主入力 | sim |
|---|---|---|---|---|
| `S_TITLE` | タイトル | UI | マウス | — |
| `S_FACTORY` | 工廠（クォータービュー） | FactoryRenderer | マウス＋ホットバー | factory |
| `S_GARAGE` | ガレージ（ヒーローカー） | FactoryRenderer（寄り） | マウス | factory |
| `S_RESTORE` | レストアドック | FactoryRenderer（寄り） | マウス | factory+economy |
| `S_MARKET` | 調達端末（4市場） | UI | マウス | economy |
| `S_SHUTTER` | **巨大シャッター（遷移）** | 両方（クロスフェード） | なし（演出） | 両方 |
| `S_DRIVE_C1` | 首都高（C1/B/K1） | RoadRenderer | ゲームパッド/キー | vehicle |
| `S_PA` | PA（大黒・辰巳・芝浦） | RoadRenderer（停車） | マウス＋歩行 | vehicle+economy |
| `S_TSUKUBA` | 筑波 TC2000 | RoadRenderer（サーキット） | パッド | vehicle |
| `S_DEBRIEF` | 解析（ラップ/テレメトリ） | UI | マウス | economy |

### 2.2 遷移図

```
          ┌──────────────────────── S_TITLE ───────────────────────┐
          ▼                                                        │
     ┌─ S_FACTORY ◄──┬──► S_GARAGE ◄──► S_RESTORE                  │
     │      ▲        │        ▲                                    │
     │      │        └──► S_MARKET（いつでもオーバーレイ）           │
     │      │                                                      │
     │  [シャッターを開ける]  ←条件：§4 の夜間移行条件               │
     │      ▼                                                      │
     │  S_SHUTTER ──(1.8 s)──► S_DRIVE_C1 ◄──► S_PA                │
     │      ▲                       │                              │
     │      └───(帰庫)──────────────┘                              │
     │                              │                              │
     │                        [週末・エントリー済]                   │
     │                              ▼                              │
     └──────── S_DEBRIEF ◄──── S_TSUKUBA                           │
                   └───────────────────────────────────────────────┘
```

### 2.3 シャッター遷移の仕様（本作の看板演出）

```
t=0.00  プレイヤーが S_FACTORY で「シャッター」をクリック（またはガレージで E 長押し）
t=0.00  worker:factory に SUSPEND_REQUEST。工場は現 tick を完了して静止（状態は保持）
t=0.10  FactoryRenderer が車両の周囲 24×24 タイルだけを残してフェード（被写界深度）
t=0.35  シャッター開く音（油圧＋チェーン・実録）。輝度 +180%、外光が差し込む
t=0.60  RoadRenderer が裏で初期化完了（C1 合流レーン・直近 1.2 km のタイルを先読み済み）
t=0.90  カメラが2Dクォータービュー → 車両後方の疑似3Dへ 0.9 秒かけて補間（曲線は ease-in-out）
t=1.40  worker:vehicle へ RESUME。入力受付開始（この瞬間からアクセルが効く）
t=1.80  HUD 切替完了。ロードは一切挟まない
```

**要件**：遷移中に**ローディング画面を出さない**。先読みが間に合わない場合はシャッターの開閉速度を
動的に遅らせて辻褄を合わせる（最大 +1.2 s）。これは `07` §9 の性能予算で担保する。

---

## 3. データ構造

### 3.1 WorldState（セーブの実体 / SoA）

```ts
interface WorldState {
  meta:      { seed: number; version: number; createdAt: number; playTimeTicks: number };
  clock:     { tick: number; day: number; phase: "day" | "night"; weekIndex: number };
  player:    { yen: number; rep: number; heat: number; licenses: number };
  factory:   FactorySoA;        // §3.2
  hero:      HeroCarState;      // §3.3
  garage:    VehicleInstance[]; // 最大 3（Act5 で 5）
  restore:   RestoreJob[];      // S4
  market:    MarketState;       // S3（在庫は保存せず seed から再生成）
  research:  { unlocked: Set<ResearchId>; data: Record<DataKind, number> };
  pressure:  { nuisance: number; heat: number; debt: number };
  records:   { tsukubaBestS: number | null; sectorBest: number[]; c1BestS: number | null };
}
```

**市場在庫はセーブしない**：`hash32(seed, 市場, 週)` から毎回再生成する（S3 §2）。
セーブサイズと「リロードで引き直し」の両方をここで殺す。

### 3.2 FactorySoA（型付き配列の束）

| 配列 | 型 | 要素数 | 内容 |
|---|---|---|---|
| `tileType` | `Uint8Array` | W×H | 床・基礎・壁・水路 |
| `entityId` | `Int32Array` | W×H | タイル→エンティティ（-1 = 空） |
| `beltLane` | `Uint16Array` | belt×16 | **圧縮表現**：連続ベルトを1本の「レーン」として扱う（`07` §4.2） |
| `itemKind` | `Uint16Array` | item | アイテム種別 |
| `itemGrade` | `Uint8Array` | item | 等級（0=C … 4=LEGENDARY） |
| `itemQ` | `Float32Array` | item | 実測公差 [mm]（等級の生データ） |
| `machineState` | `Uint8Array` | machine | idle/working/blocked/starved/broken |
| `machineProgress` | `Uint16Array` | machine | 0–65535（レシピ進捗） |
| `toolWear` | `Float32Array` | machine | 0–1 |
| `fluidAmount` | `Float32Array` | pipeNet | 流体網ごとの保有量 |
| `powerDraw` | `Float32Array` | machine | kW |
| `signalRed/Green` | `Int32Array` | wireNet×64 | 回路信号 |

### 3.3 HeroCarState

```ts
interface HeroCarState {
  chassis: ChassisInstance;            // S4 でレストアされた個体（歪み・サビ・剛性）
  parts: Record<PartSlot, PartInstance | null>;
  setup: SetupSheet;                   // 03 §10
  wear:  { engineH: number; tireKm: number; brakeKj: number; oilDeg: number };
  temps: { waterC: number; oilC: number; intakeC: number; ecuKnock: number };
  legal: { plate: boolean; inspectionDaysLeft: number; soundDb: number };
}
```

### 3.4 ContentDB（読み取り専用・JSON）

`items.json` / `recipes.json`（S2）/ `machines.json` / `research.json` /
`chassis.json` / `parts.json` / `markets.json`（S3）/ `tracks.json` / `rivals.json`。
**すべてホットリロード可能**。バランス調整でコードを触らない。

---

## 4. 時間制度と昼夜の移行条件

### 4.1 1ゲーム日の構造

| フェーズ | ゲーム内時刻 | 実時間（既定） | tick | 主な活動 |
|---|---|---|---|---|
| 早朝 | 06:00–09:00 | 1.5 分 | 3,600 | 市場更新（月曜のみ）、納品、夜のログ解析完了 |
| 昼 | 09:00–18:00 | 6.0 分 | 10,800 | 工場建設・研究・レストア・セットアップ |
| 夕 | 18:00–22:00 | 2.0 分 | 4,800 | 整備、積み込み、ヒート自然減衰 |
| **夜** | 22:00–03:00 | 4.5 分 | 6,000 | **首都高**。走行・バトル・PA取引 |
| 深夜 | 03:00–06:00 | 0.5 分 | 3,600 | 強制帰庫、ログ吸い出し |

1ゲーム日 ＝ 28,800 tick ＝ 実時間 約14.5 分（`08` §8 の `TICKS_PER_GAME_DAY` と一致）。

### 4.2 夜へ出られる条件（AND）

| # | 条件 | 失敗時のUI |
|---|---|---|
| 1 | ゲーム内時刻が **18:00–03:00** | シャッターがロック「まだ明るい」 |
| 2 | ヒーローカーが **走行可能状態**（必須スロットが全て埋まり `broken` でない） | 不足部品を赤表示 |
| 3 | 車検・ナンバーが有効（`legal.plate === true`） | 「ナンバーが無い。筑波へは運べるが公道は無理だ」 |
| 4 | 燃料 ≥ 10 L、水温 < 60 ℃（冷間始動は可） | 給油導線を提示 |
| 5 | 工場の**危険警告がゼロ**（`NUISANCE` 95以上／電力遮断中／火災） | 「この状態で出かけるのか？」確認 |

> 条件2〜5は**ブロックではなく警告**にもできる（難易度 STREET では警告のみ）。
> ゲーム体験として「出られない夜」を作りすぎないこと。

### 4.3 昼へ戻る条件

- プレイヤーが拠点シャッターに侵入（通常帰庫）
- 03:00 到達 → **強制帰庫**（画面端に「夜明けが近い」警告が 02:40 から出る）
- 検挙（HEAT 100 到達でイベント）→ 拠点へ強制送還＋罰金＋翌夜ロック

### 4.4 時間加速とオフライン進行

| 倍率 | 条件 |
|---|---|
| ×1 / ×2 / ×4 | 常時（夜は ×1 固定） |
| ×16「夜通し運転」 | 工場に人がいない時のみ。研究は進まない（判断ログ D-10） |
| オフライン | 最大 8 時間ぶんの**素材生産のみ**。DATA は生成されない |

---

## 5. ゲームループ（1日の時系列と意思決定）

```
┌─ 朝 ─────────────────────────────────────────────────────────┐
│ ① 夜のログテープがスパコンに乗る → D5 生成（量は走りの質に比例） │
│ ② 市場更新（月曜）：AA出品票・コンテナ・ネトオクが入れ替わる      │
│ ③ レストアドックの工程が1段階進む（S4）                         │
└──────────────────────────────────────────────────────────────┘
┌─ 昼 ─────────────────────────────────────────────────────────┐
│ ④ 不足の特定：ラップ解析（S5）が「次に効く1手」を数値で提示       │
│ ⑤ ライン設計：風洞／破壊ベンチ／オートクレーブ／スパコンを繋ぐ    │
│ ⑥ 研究：DATA を投入して新レシピ・新素材を解放                    │
│ ⑦ 組付け：Legendary 部品が出たらヒーローカーへ（S2 §6）          │
└──────────────────────────────────────────────────────────────┘
┌─ 夜 ─────────────────────────────────────────────────────────┐
│ ⑧ シャッターを開けて C1 へ（§2.3）                              │
│ ⑨ 走る＝テレメトリ収集。壊れかけるほどログの価値が上がる          │
│ ⑩ PA で裏取引（REP が通貨）／バトルで派閥を削る                  │
└──────────────────────────────────────────────────────────────┘
┌─ 週末 ───────────────────────────────────────────────────────┐
│ ⑪ 筑波 TC2000：ゲート挑戦。失敗しても損失はタイヤとエントリー費   │
│ ⑫ セクター差分で「どこで負けたか」を突きつけられる → ①へ         │
└──────────────────────────────────────────────────────────────┘
```

**このループの狙い**：どの段階でも「次にやること」が**数値で**提示されている状態を保つ。
迷ったらラップ解析を開けば、`第2ヘアピン：トラクション限界` と書いてある。

---

## 6. 決定論とリプレイ

| 項目 | 方式 |
|---|---|
| 固定ステップ | 20 Hz（50 ms）。描画は補間のみ |
| 乱数 | すべて `hash32(seed, 用途, インデックス)` 由来。グローバル RNG 禁止 |
| 浮動小数 | 工場ロジックは**整数・固定小数**。物理は float64 で許容（再現性はシードで担保） |
| リプレイ | 入力列（tick, command）のみ保存。1周 ≈ 8 KB |
| ゴースト | 位置を 10 Hz で記録、スプライン補間。1周 ≈ 24 KB |

---

## 7. セーブ

| 項目 | 仕様 |
|---|---|
| 形式 | バイナリ（SoA をそのまま）＋ `CompressionStream("deflate-raw")` |
| 保存先 | IndexedDB（`midnight.saves`）。エクスポートは `.mnaut` ファイル |
| 容量目安 | 工場 2,000 機械 / 60,000 アイテムで **1.8 MB**（圧縮後 420 KB） |
| オートセーブ | 日跨ぎ・夜出発前・落札確定時・レストア工程完了時（**市場の引き直し防止**） |
| 互換 | `version` と移行関数の列。壊れたら読み込み拒否（黙って壊さない） |

---

## 8. 性能予算（60 fps 時・1フレーム 16.6 ms）

| 項目 | 予算 | 備考 |
|---|---|---|
| worker:factory 1 tick | 3.5 ms | 20 Hz なので3フレームに1回 |
| worker:vehicle 1 tick | 2.0 ms | 夜のみ |
| FactoryRenderer | 4.0 ms | インスタンシング・タイルアトラス |
| RoadRenderer | 6.0 ms | 疑似3D＋反射 |
| React 再描画 | 1.5 ms | HUD は `useSyncExternalStore` で差分のみ |
| 余裕 | 2〜3 ms | — |

**上限**：機械 4,000／ベルトレーン 1,200／同時アイテム 120,000／流体網 300。
超過時は「工場が重い」警告と、ライン単位の一時停止提案を出す。
