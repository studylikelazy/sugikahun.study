# 引継ぎプロンプト ― 『MIDNIGHT AUTOMATION: C1 to TSUKUBA』を遊べるようにする

> **使い方**：新しい Arena コーディングセッションを開き、下の「プロンプト本文」を丸ごと貼り付けてください。
> `## 付録` 以降は、エージェントがリポジトリ内で参照するための資料です（貼り付け不要）。

> **復元メモ（2026-10-17・復元時に追記）**：本書は PR #3 執筆セッションで作成されたが未 push のまま失われ、
> ユーザーが保持していた差分から原文のまま復元したもの。セッション横断の現況メモは
> リポジトリ直下の [`HANDOFF.md`](../../HANDOFF.md) を参照（`pnpm check` の TS2802 は復元時に修復済み）。

---

## プロンプト本文（ここから下をコピー）

`studylikelazy/sugikahun.study` で『**MIDNIGHT AUTOMATION: C1 to TSUKUBA**』を**実際に遊べる状態**にしてください。

設計書と検証済みの参照実装はすでに `main` にあります。**ゼロから設計し直さないでください。**
既存の仕様と数値に従って、UI と状態管理を実装する仕事です。

### まず読むもの（この順に）

1. `docs/midnight-automation/HANDOFF.md` ← **このファイル**。環境の罠と実装方針が全部書いてある
2. `docs/midnight-automation/spec/README.md` ― 仕様書6本の索引と発注仕様 対応表29項目
3. `docs/midnight-automation/spec/S1_architecture_and_gameloop.md` ― シーン遷移と `WorldState`
4. `docs/midnight-automation/spec/S6_ui_ux_screens.md` ― **全画面のモックが文字で描いてある。これを実装する**

### ゲームの一行説明

> 工場自動化SIM（Factorioライク）×首都高オープンワールド×JDMエンジニアリング。
> **車の量産ではない。たった1台の至高のマシンを作るため、裏で巨大な実験インフラを自動化する。**
> 昼は町外れの巨大工廠で実験ラインを組み、夜は首都高を走る。最終目標は**筑波TC2000で 0:49.999**。

### 今回のスコープ：フェーズ1「経営ループが回る」

**一度に全部作らないでください。** 以下のループが最後まで通ることだけを目標にします。

```
① 市場で買う（4大市場）→ ② レストアする（13工程）→ ③ 組む（パーツ装着）
   → ④ 筑波でタイム計測 → ⑤ 賞金とREPを得る → ①へ
```

**この5つのうち ①②④ のゲームロジックは実装・テスト済みです。**
`shared/midnight/` の関数を呼ぶだけで動きます。あなたの仕事は主に **UI と週次の状態遷移**です。

フェーズ2以降（**今回はやらない**）：工場グリッド（コンベア・機械配置）、夜の首都高走行、派閥制覇、PROJECT 49。
設計はすべて `spec/S2`・`04`・`spec/S5` にあるので、フェーズ1が通ってから着手します。

### 絶対に壊してはいけないもの

- **`shared/midnight/` の107テスト**（lap-solver 22 / market 53 / restore 32）。
  作業の最後に必ず全通過を確認してください。
- **Actラダーの数値**（`spec/S5` §7.1）。ソルバの較正済みパラメータなので変更禁止。
  Act6 推定 **0:49.582** / ゲート **0:49.999** / 理論 0:49.238。
- **既存の `client/src/pages/Home.tsx`**（2,521行・別ゲーム「kobo-nippon-motor-grid」）。
  これは現在 GitHub Pages で公開中です。**新しいゲームは別ルート `/midnight` に作ってください。**
  `App.tsx` に `<Route path="/midnight" component={Midnight} />` を追加する形です。
- `package.json` の依存追加は原則なし（React 19 / Tailwind v4 / shadcn / Babylon / framer-motion / wouter が既にあります）。

### 作るもの（画面単位）

`spec/S6` に文字モックがあります。**モックの情報量と語彙をそのまま再現してください**（「査定点4.5」「歪0.2mm」等）。

| 優先 | 画面 | 参照 | 既存ロジック |
|---|---|---|---|
| 1 | **MARKET**（4市場タブ＋AA出品票＋コンテナ入札） | `S6` §6、`S3` 全体 | `generateWeeklyMarket()` ほか |
| 2 | **RESTORE DOCK**（13状態の進行＋工程選択） | `S6`、`S4` §8 | `initRestore()` / `completeState()` |
| 3 | **BUILD/SETUP**（パーツ装着＋**感度ビュー**） | `S6` §5 | `solveLap()` の差分を取るだけ |
| 4 | **TSUKUBA RESULT**（ラップ＋区間別の支配限界） | `S6` §8 | `LapResult.segmentLimits` |
| 5 | **ガレージ/週送り**（資金・REP・週カウンタ） | `S1` §3.1 | — |

**感度ビューは本作の背骨です。** 「いま何を直せば何秒速くなるか」を常に見せる。
実装は単純で、`solveLap()` をパラメータを少しずらして複数回呼び、差分を並べるだけです
（Act6 実測：μ₀+0.05 → **−0.986秒**、DF+50kgf → −0.585秒、+100PS → **−0.072秒**）。
この「パワーを足してもほとんど速くならない」という事実の提示が、プレイヤーの意思決定の核になります。

### 進め方

1. 現状把握 → `shared/midnight/` の API を読む（`## 付録A` に一覧があります）
2. **先に状態管理を決める**：`WorldState`（`S1` §3.1）を単一のストアに。`localStorage` 保存。
   セーブキーは既存ゲームと衝突させないこと（例：`midnight-automation-v1`）
3. 画面を上の優先順で実装。**1画面できるたびに `pnpm check` と107テストを通す**
4. 最後に `pnpm build` が通ることを確認（GitHub Pages のデプロイが `main` への push で走るため）

### 完了の定義

- `/midnight` を開いて、**市場で車を買い → レストアし → パーツを組み → 筑波のタイムが出る**まで一周できる
- 週送りで市場の内容が変わる（`market.ts` は `saveSeed`+`week` の決定論生成）
- リロードしても進行が残る
- `pnpm check` 通過、107テスト全通過、`pnpm build` 成功

---

## 付録A：既存の参照実装 API（`shared/midnight/`）

**すべて依存ゼロ・純粋関数・決定論**です。React から直接呼べます。

### `types.ts`（403行）― 型と定数の正本

```ts
Grade = "C" | "B" | "A" | "S" | "LEGENDARY"
GRADE_TOLERANCE_MM   // ±0.100 / ±0.050 / ±0.020 / ±0.008 / ±0.003 mm
GRADE_QUALITY_FACTOR // 0.90 / 1.00 / 1.06 / 1.12 / 1.18
LEGENDARY_MASS_MATCH_G = 0.001
TICKS_PER_GAME_DAY = 28_800   // 1ゲーム日
VehicleSpec, TrackDef, PartInstance, ChassisDef, PressureState, ...
```

### `tsukuba.ts`（187行）

```ts
TSUKUBA_TC2000: TrackDef   // 16区間・全長 2,045 m
```

### `lap-solver.ts`（441行・テスト22件）― ラップタイム

```ts
solveLap(track: TrackDef, spec: VehicleSpec, cond?: SolverConditions): LapResult

interface LapResult {
  idealLapTimeS: number;        // 理論ラップ
  estimatedLapTimeS: number;    // 推定ラップ（これを表示する）
  sectorTimesS: Array<{ id: string; timeS: number }>;
  vMaxKph: number; vMinKph: number; upshiftCount: number;
  segmentLimits: Array<{ id: string; limit: LimitKind; minKph: number }>;
  // limit = "lateral" | "power" | "traction" | "braking" | "topSpeed"
}

interface SolverConditions { airDensity; surfaceGrip; fuelMassKg }
STANDARD_CONDITIONS
formatLapTime(seconds): string   // "0:49.582"
```

> **注意**：フィールド名は `segmentLimits`（`segments` ではない）、
> `surfaceGrip` / `fuelMassKg`（`trackGrip` / `fuelKg` ではない）。過去に取り違えた箇所です。

**車両スペックの実例**は `shared/midnight/lap-solver.test.ts` の `Fixture` にAct別で全部あります。
UIの初期値はそこからコピーするのが最短です。

### `market.ts`（1,345行・テスト53件）― 4大市場

```ts
generateWeeklyMarket(ctx: MarketContext): WeeklyMarket

interface MarketContext {
  saveSeed: number; week: number; act: Act;
  reputation: number;   // 0–100。ローカル市場の解放条件
  heat: number;         // 0–100。高いと裏ルートが閉まる
  phantomDrought: number;      // 幻級ピティ
  containerDrought?: number;   // コンテナピティ
  rainy?: boolean;
}

// WeeklyMarket の中身
//   domestic.aa        AaLot[]           業者AA（出品票つき）
//   domestic.netauc    NetAucListing[]   ヤフオク型
//   domestic.miracle   MiracleCarListing[]  低走行ドノーマルAT（0.6%）
//   domestic.yard      YardLot[]         解体ヤード（セルフもぎ取り）
//   domestic.bluebin   BlueBinLot[]      青カゴジャンク
//   imports            ImportListing[]   保税ヤード・納屋・チタン
//   containers         ContainerLot[]    ブラインド入札
//   local              LocalOffer[]      REPで買う（大黒/辰巳/芝浦/大田区）

// 取引
inspect(lot, level: 0|1|2)                    // 鑑定（¥8,000 で誤差帯 25%→10%）
resolveAuction(listing, bidYen)               // 二位価格
resolveContainerBid(lot, bidYen)              // 一位価格（コンテナのみ）
posteriorTier(port, weightKg, xray)           // ベイズ事後確率
containerPriorEvYen(port, weightKg, xray)     // 期待値
salvage(lot) / yardExpectedValueYen(lot)
chassisPenalty({frameBendMm, rustLevel})      // → {stiffnessFactor, writeOff}
effectiveMu(mu0, stiffnessFactor)             // 剛性→グリップ

// プール
MARKET_CHASSIS_POOL        // 実在車名8台
REQUIRED_CHASSIS_CODES     // ["BNR32","JZA80","S30"]
```

### `restore.ts`（592行・テスト32件）― レストア13工程

```ts
RESTORE_STATES   // S0..S12 の13状態
STATE_LABEL      // 日本語ラベル
initRestore(subject, plan?): RestoreProgress
stepTicks(state, subject, plan, ctx): number    // その工程の所要tick
completeState(...)                               // 1工程を完了させる
runRestore(subject, plan?, seed?): RestoreResult // 一括実行（結果プレビュー用）
finalizeRestore(progress, plan): RestoreResult
nikoichi(a, b): NikoichiResult                   // ニコイチ合体溶接
atToMtSwap(harnessGradeFactor, seed?)            // AT→MT公認換装
DEFAULT_PLAN
```

**実測値**（対象：サビ0.86 / 歪み3.2mm / 欠損7点 ＝ S30Z の典型）：
全部盛りで**剛性1.439**・9.5ゲーム日・¥2,318,800・199kWh。既定プランで1.179。補強なしで0.93。
恒久的失敗は**水素脆化と膜厚ムラの2つだけ**（他は手戻りで回復可能）。

---

## 付録B：環境の罠（これで何度も詰まりました）

### `node_modules` が展開されていない

`pnpm` コマンドが使えない環境に当たることがあります。その場合の回避策：

```bash
# 型検査（ファイル単位で明示オプション。tsconfig.json は使わない）
mkdir -p /tmp/tscheck && cd /tmp/tscheck && npm install typescript@5.6.3 --no-save
cd /home/user/sugikahun.study
/tmp/tscheck/node_modules/.bin/tsc shared/midnight/*.ts \
  --strict --target es2022 --module commonjs --moduleResolution node \
  --outDir /tmp/out4 --skipLibCheck --noUncheckedIndexedAccess

# テスト実行（vitest の最小shimを node_modules/vitest に置いてコンパイル後に実行）
cd /tmp/out4 && node lap-solver.test.js && node market.test.js && node restore.test.js
```

**`pnpm install` が通るならそちらが正道です。** 上は通らなかった場合の手段。

### `/tmp` はセッションを跨いで消える

`/tmp/tscheck` も `/tmp/out4` も毎セッション作り直しになります。
**リポジトリ内に検証用スクリプトを置かないでください**（過去に `/tmp/*.cjs` で運用した経緯があります）。

### git のローカルブランチがリセットされることがある

作業ブランチがベースコミットに戻っている場合：

```bash
git fetch origin <branch> && git reset --mixed FETCH_HEAD
```

**`git reset --hard` は絶対に使わないこと**（作業ツリーが飛びます）。

### GitHub Pages

- `main` への push で `.github/workflows/deploy-pages.yml` が走り、`dist/public` を公開
- 公開URL：https://studylikelazy.github.io/sugikahun.study/
- `vite.config.ts` が `GITHUB_PAGES=true` のとき `base: "/sugikahun.study/"` を設定します。
  **ルーティングを足すときはこの base を壊さないこと**（`wouter` の `WouterRouter` に base が渡っています）
- ビルドは `vite build` のみで `tsc` は走りません。型エラーがあってもデプロイは通ってしまうので、
  **`pnpm check` を自分で回してください**

### ライブプレビュー

開発サーバは `0.0.0.0` にバインドすること（`pnpm dev` は `vite --host` なので既にOK）。

---

## 付録C：設計書マップ（どこに何が書いてあるか）

### 納品物 ― `docs/midnight-automation/spec/`

| 仕様書 | 中身 |
|---|---|
| `S1_architecture_and_gameloop.md` | 11シーンと遷移、**シャッター遷移1.8秒**、`WorldState`/`FactorySoA`/`HeroCarState`、1日28,800tick、夜へ出る5条件、`FactionState`、`canEnterProject49()` |
| `S2_rnd_factory_machines_recipes.md` | 固体/流体/DATA、搬送設備、**風洞・破壊ベンチ・オートクレーブ・メインフレーム**の数式、レシピ24件、電力/熱/騒音、公差とLEGENDARY生成式 |
| `S3_four_markets_tables.md` | AA出品票、検査員メモ13種、コンテナ6ティア×5港、ベイズ事後確率、輸入7品目、ローカル4拠点、**§10に実生成例** |
| `S4_restoration_state_machine.md` | 13状態の遷移図・所要tick・失敗8種、各工程の数式、**剛性1.44の導出**、ドックUI |
| `S5_vehicle_physics_laptime.md` | 準定常ソルバの全方程式、TC2000 16区間、**§7.1 確定ラダー**、感度表、§9.5 PROJECT 49の固定条件 |
| `S6_ui_ux_screens.md` | **全画面の文字モック**。FACTORY / BUILD / MARKET / DRIVE / RESULT / TERRITORY / PROJECT 49 |

### 背景の企画書 ― `docs/midnight-automation/`

`README`（目次・用語集・**判断ログ D-01〜D-21**）／`01` ビジョンとコアループ／`02` 工場自動化／
`03` 車両工学（**§2 がベースシャシーの正本**）／`04` 夜の首都高（**§4.5 派閥・§4.6 PROJECT 49・§4.7 ヒートゲージ**）／
`05` 筑波・進行・経済（**§8.0 PROJECT 49 解禁**）／`06` 世界観・アート・音／`07` 技術仕様／
`08` データスキーマ（**数値の単一の正**）／`09` ロードマップ・法務（**§5.1 実名ライセンス計画**）／`10` 市場と調達

**数値が食い違ったら `08` が正**。車種は `03` §2 が正。アイテムIDは `08` §2 が正。

---

## 付録D：絶対に動かしてはいけない数値

### Actゲート

```
Act0 1:12.000 / Act1 1:06.000 / Act2 1:02.000 / Act3 0:58.000
Act4 0:55.000 / Act5 0:52.000 / Act6 **0:49.999**
```

### 確定ラダー（`spec/S5` §7.1・ソルバ較正済み）

| Act | PS | kg | μ₀ | DF@150 | Cd | 終減速 | シフト | 推定 | 余裕 |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 175 (NA) | 1,160 | 1.15 | 0 | 0.34 | 4.30 | 0.25s | **1:11.178** | 0.82 |
| 1 | 260 | 1,090 | 1.30 | 0 | 0.35 | 4.30 | 0.25 | **1:05.045** | 0.96 |
| 2 | 420 | 1,040 | 1.33 | 140 | 0.37 | 4.30 | 0.25 | **1:01.339** | 0.66 |
| 3 | 500 | 1,020 | 1.45 | 241 | 0.41 | 4.50 | 0.25 | **0:57.418** | 0.58 |
| 4 | 620 | 980 | 1.45 | 461 | 0.44 | 4.50 | 0.25 | **0:54.263** | 0.74 |
| 5 | 760 | 920 | 1.48 | 542 | 0.47 | 4.70 | 0.08 | **0:51.244** | 0.76 |
| 6 | **1,020** | 920 | 1.50 | **602** | 0.50 | 4.90 | 0.06 | **0:49.582** | 0.42 |

共通：ギア比 `[3.23, 2.11, 1.54, 1.21, 1.00, 0.84]`／タイヤ半径 0.312m／前面投影 1.85m²／
荷重感度 0.16／駆動効率 0.88／WB 2.52m／CL配分 前0.42・後0.58。

> ラダーの車重は**ベース車の素の重量ではなく「そのActでのヒーローカー到達スペック」**です。
> AE86 の 925kg などと直接対応させないでください。

### 感度（Act4 / Act6）

```
+100 PS      −0.316 / −0.072     車重 −10kg   −0.063 / −0.077
DF +50kgf    −0.500 / −0.585     μ₀ +0.05     −0.933 / −0.986  ← 最大
シフト −0.1s −0.309 / −0.135     剛性劣化(μ−2%) +0.555 / +0.606
```

Act6 の条件違い：冬2℃ **0:48.265** ／ 夏32℃ **0:50.154** ／ **雨(grip 0.72) 1:00.442**

### 区間（`tsukuba.ts`・合計 2,045 m）

```
home 282 / t1_brake 50 / turn1 181(R65) / t1_exit 60 / esses 160(R110) / chicane 55
hairpin1 70(R22) / hp1_exit 110 / dunlop 75(R45) / r80 135 / r70 90 / hp2_brake 60
hairpin2 65(R25) / back_straight 437 / final_a 95(R60) / final_b 120(R110)
```

**Act6 の16区間のうち、パワーが支配的なのはバックストレート1区間だけ**
（トラクション9／ブレーキ3／横G2）。最低速は第1ヘア 71 km/h、第2ヘア 76 km/h。

### 市場プール8台（実在車名・`03` §2 が正本）

| ID | 車名 | 型式 | エンジン | 駆動 | 重量 | 価格 | Act |
|---|---|---|---|---|---|---|---|
| `toyota_ae86` | トヨタ スプリンタートレノ GT-APEX | AE86 | 4A-GE | FR | 925 | ¥1,380,000 | 0 |
| `nissan_s15` | 日産 シルビア spec-R | S15 | SR20DET | FR | 1,200 | ¥2,480,000 | 0 |
| `mazda_fd3s` | マツダ RX-7 Type RS | FD3S | 13B-REW | FR | 1,250 | ¥3,380,000 | 2 |
| `mitsubishi_cn9a` | 三菱 ランサーエボリューション IV GSR | CN9A | 4G63 | AWD | 1,350 | ¥2,980,000 | 3 |
| `toyota_jza80` | トヨタ スープラ RZ | **JZA80** | 2JZ-GTE | FR | 1,510 | ¥4,580,000 | 4 |
| `nissan_bnr32` | 日産 スカイライン GT-R | **BNR32** | RB26DETT | AWD | 1,430 | ¥5,280,000 | 5 |
| `honda_na1` | ホンダ NSX-R | NA1 | C30A | MR | 1,230 | ¥7,980,000 | 6 |
| `nissan_s30z` | 日産 フェアレディZ 432 | **S30** | S20 | FR | 1,040 | ¥280,000 | 0 |

- **HERO CAR の既定は FD3S**。根拠は `03` §2.0（実在のアンリミテッド最速 49.445秒＝HKS TRB-03／RX-7ベース に、本作の 49.582 秒が肉薄して届かない設計）
- **`nissan_s30z` は `wreckOnly: true`**。AA・奇跡枠には出さず、解体ヤード／コンテナ／海外納屋のみ。
  サビ 0.80–0.95 の不動車としてのみ出現し、レストアすると剛性 1.37–1.44 に到達します

### その他

```
初期資金 ¥1,800,000 / 研究96ノード / マップ62km / C1外回り14.6km
コンテナのドロップ確率  T0 34% / T1 30% / T2 22% / T3 9% / T4 4.2% / T5 0.8%
剛性→グリップ  μ_eff = μ0 × clamp(0.88 + 0.12 × stiffnessFactor, 0.60, 1.05)
```

---

## 付録E：過去に却下した案（蒸し返さないこと）

| 却下したもの | 理由 |
|---|---|
| 変速損失を `shiftTimeS` の直接加算で表現 | ノード境界で丸めが出る。採用は `driveDutyRatio = 1 − coastM/stepM` による連続化 |
| 毎ノードで駆動力最大のギアを選ぶ | ハンチングする。採用は速度単調＋ヒステリシス 0.94 のギア状態機械 |
| `LINE_RADIUS_GAIN` 1.08/1.22・1.05/1.15・1.03/1.10・0.97/1.02 | 全滅。確定値は **1.00 / 1.06** |
| 区間長 2,309m（初版）・第1修正案 | 実全長と12.9%ずれる。確定は **2,045m** |
| Act6 の終減速 4.3 | vmax 292km/h で非現実的。確定は **4.9** |
| 架空マルク名で統一（判断ログ D-08） | **撤回済み**。ユーザー指示により実在車名を使用（D-19） |
| 単一シードでの比較テスト | `chassisId` を変えるとハッシュが変わって落ちる。**複数シード平均で比較すること** |

---

## 付録F：このプロジェクトの「らしさ」を守るための指針

実装中に迷ったら、この基準で判断してください。

1. **数字を隠さない。** 「査定点4.5」「歪0.2mm」「腐17%」をそのまま出す。
   プレイヤーがスプレッドシートを作りたくなる情報密度が正解です。
2. **情報そのものを商品にする。** ¥8,000 の鑑定を惜しんだ者が地雷を踏む。
   出品票の「エンジン異音」の4文字で価格が1.6倍変わる、という体験が市場パートの核です。
3. **パワーは解決策ではない。** 感度表が示すとおり、+100PS より μ₀+0.05 が13倍効きます。
   UIは常に「次に効くのはこれ」を提示し、安易な馬力アップを誘導しないこと。
4. **壊れたデータほど価値が高い。** 走行ログテープはトラブルが多いほど高騰します（`04` §6.1）。
   エンジンを壊して帰ってきた夜がいちばん研究が進む、という逆説を潰さないこと。
5. **最後の0.417秒。** Act6 推定 0:49.582 とゲート 0:49.999 の差は 0.417秒しかありません。
   4条件（ビレットエンジン／ドライカーボン／エアロ／全LEGENDARY）のどれか一つを手抜きすると消える幅です。
   この緊張を数値バランスで薄めないでください。
