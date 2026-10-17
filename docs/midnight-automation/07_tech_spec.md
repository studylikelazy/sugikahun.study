# 07. 技術実装仕様（Technical Design Document）

対象バージョン：`v1.0`（Vertical Slice 設計確定）
前提：本リポジトリ（`studylikelazy/sugikahun.study`）の既存スタック（Vite 7 / React 19 / TypeScript 5.6 / Tailwind 4 / pnpm）を継承する。

---

## 1. 技術選定

| 層 | 採用 | 理由 | 却下した案 |
|---|---|---|---|
| 言語 | TypeScript 5.6（`strict`） | 既存資産、型でコンテンツ定義を守れる | C#, Rust（学習・採用コスト） |
| シミュレーション | 素のTS + TypedArray（SoA）、**Web Worker 上で実行** | GC圧を抑えつつ決定論を担保。将来 WASM 化の退避路あり | ECSライブラリ（抽象化のオーバーヘッド） |
| 重い計算 | Rust → **WASM**（QSSソルバ、CFD風の近似、セーブ圧縮）【Phase 3】 | ホットパスのみ限定導入 | 全面WASM（デバッグ性が落ちる） |
| 描画（工場） | **WebGL2 自前バッチレンダラ**（インスタンシング） | 1万超のタイル＋スプライトを1–3ドローコールで | Canvas2D（枚数で破綻）、PixiJS（依存重量とカスタムライティングの制約） |
| 描画（走行） | WebGL2 の**専用疑似3Dパス** | 台形ポリゴン＋スプライト＋ポストFX | Three.js/Babylon（オーバースペック、質感が合わない） |
| UI | React 19 + Tailwind + shadcn/ui（既存） | 情報密度の高い管理UIに最適。DOMの方が生産性が高い | ゲーム内GUIの自前実装 |
| 音 | WebAudio API（AudioWorklet でエンジン合成） | サンプル合成とリアルタイム制御の両立 | HTMLAudio（制御不能） |
| 保存 | IndexedDB ＋ 自前バイナリ ＋ `CompressionStream('gzip')` | 大規模セーブ（数十MB）に耐える | localStorage（容量・同期I/O） |
| デスクトップ配布 | **Tauri v2** | 小さなバイナリ、Steam配布可、ファイルI/Oとコントローラ対応 | Electron（サイズ）、ネイティブ移植（工数） |
| オンライン | Cloudflare Workers + D1 + R2（非同期のみ） | 既存のデプロイ知見（`cloudflare_*.md`）を継承 | 常時接続サーバ |
| CI | GitHub Actions（既存 `deploy-pages.yml` を拡張） | 既存 | — |

### 1.1 Babylon.js の扱い

既存の `@babylonjs/core`（約2.1MB／gzip 519KB）は**本番バンドルから外す**。
ガレージの3D閲覧モードを実装する場合のみ、**動的 import による遅延ロード**とする（既定は2Dの分解図）。

---

## 2. 実行アーキテクチャ

```
┌─────────────────────── Main Thread (UI) ──────────────────────────┐
│ React 19                                                           │
│  ├ HUD / インスペクタ / 研究ツリー / 帳簿（DOM）                   │
│  ├ 入力収集（キーボード/パッド/ホイール）→ InputCommand            │
│  └ RenderHost（WebGL2 canvas のライフサイクル）                    │
│                                                                    │
│ RenderLoop (requestAnimationFrame)                                 │
│  ├ 直近2スナップショットの線形補間 → 描画                           │
│  └ FactoryRenderer / DriveRenderer の切替（§6.5）                  │
└───────────┬────────────────────────────────┬──────────────────────┘
            │ postMessage(Command[])          │ SharedArrayBuffer（可能なら）
            │ ← Snapshot(Transferable)        │ or 構造化複製フォールバック
┌───────────▼────────────────────────────────▼──────────────────────┐
│                     Sim Worker（決定論・20Hz）                      │
│  TickScheduler → PowerNet → FluidNet → Machines → Belts →          │
│  Inserters → Quality → Research → Economy → Pressure → Snapshot    │
└───────────┬───────────────────────────────────────────────────────┘
            │
┌───────────▼─────────────┐   ┌──────────────────────────────┐
│ Drive Worker（120Hz）    │   │ Audio（AudioWorklet）         │
│  走行物理のみ。工場とは    │   │  エンジン合成・空間処理       │
│  独立tickで並走           │   └──────────────────────────────┘
└─────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ Persistence Worker：バイナリ化 → gzip → IndexedDB（非同期）         │
└──────────────────────────────────────────────────────────────────┘
```

**重要**：夜パート中も Sim Worker は停止しない（`01` §3.1 の体験要件）。
Drive Worker と Sim Worker は独立tickで動き、**ゲーム内時刻だけを同期**する。

### 2.1 スレッド間プロトコル

```ts
// UI → Sim
type Command =
  | { t: "build"; proto: EntityProtoId; x: number; y: number; rot: 0|1|2|3; layer: Layer }
  | { t: "remove"; x: number; y: number; layer: Layer }
  | { t: "configure"; entity: EntityId; patch: ConfigPatch }
  | { t: "setSpeed"; multiplier: 0 | 0.5 | 1 | 3 | 10 }
  | { t: "research"; node: ResearchNodeId }
  | { t: "save" } | { t: "load"; slot: number };

// Sim → UI（1描画フレームにつき最大1件、差分のみ）
type Snapshot = {
  tick: number;
  dirtyChunks: Uint32Array;      // 再描画が必要なチャンクID
  entityDeltas: ArrayBuffer;     // SoA 断片（Transferable）
  hud: HudSummary;               // 資金、DATAレート、警告（小さなJSON）
};
```

- 送信は **Transferable** を徹底し、コピーを発生させない。
- `SharedArrayBuffer` が使える環境（COOP/COEP 設定済み、§11.2）では、
  描画用のSoAバッファを共有してゼロコピー化する。使えない場合は差分転送に自動フォールバック。

---

## 3. 決定論シミュレーション

### 3.1 時間

| 定数 | 値 |
|---|---|
| `TICK_HZ` | 20（1 tick = 50 ms） |
| `TICKS_PER_GAME_MINUTE` | 20 |
| `TICKS_PER_GAME_DAY` | 28,800 |
| 時間倍率 | `0.5 / 1 / 3 / 10`（倍率はtickの**実行回数**を変えるだけで、tick内容は不変） |

```ts
// 固定ステップ。描画フレームレートから完全に独立。
let acc = 0;
function hostLoop(dtMs: number) {
  acc += dtMs * speedMultiplier;
  let steps = 0;
  while (acc >= 50 && steps < MAX_STEPS_PER_FRAME) { sim.tick(); acc -= 50; steps++; }
  if (steps === MAX_STEPS_PER_FRAME) acc = 0;  // 取り戻しを諦める（スパイラル防止）
}
```

### 3.2 数値の決定論

| 対象 | 表現 |
|---|---|
| 工場シム（位置・量・時間） | **Q16.16 固定小数点**（`number` 上で整数演算、`|0` でトランケート） |
| 確率 | 整数乱数（§3.3）と整数しきい値の比較のみ |
| 走行物理 | `float64`。ただし**同一ビルド・同一入力で同一結果**になるよう、`Math.sin/cos` 等は自前の多項式近似テーブルを使う |
| QSSソルバ | `float64`。結果はラップタイムに丸めて記録（`±0.001 s`） |

> 走行物理のクロスプラットフォーム完全一致は**保証しない**。
> オンラインのゴースト検証は「入力再生＋チェックポイント通過位置の許容誤差照合」で行う（§11.3）。

### 3.3 乱数

```ts
// xoshiro128** : 高速・良質・整数のみ
class Rng {
  constructor(private s0: number, private s1: number, private s2: number, private s3: number) {}
  next(): number { /* 32bit unsigned */ }
  int(maxExclusive: number): number { return (this.next() % maxExclusive) >>> 0; }
}
```

**ストリーム分割**：`RNG(seed, streamId)` の形で、用途ごとに独立したストリームを持つ。

| ストリーム | 用途 |
|---|---|
| `0x01` | 品質生成（等級判定） |
| `0x02` | 故障・信頼性 |
| `0x03` | イベント（近隣圧、ニュース、相場） |
| `0x04` | 夜の交通・ライバル出現 |
| `0x05` | 天候・気温 |

品質生成は **`hash(serial, machineId, tick)` を seed とする決定論的ドロー**にする。
これにより、セーブ・ロードを繰り返して良い等級が出るまで粘る「セーブスカム」を**構造的に封じる**。

### 3.4 ゴールデンテスト

`fixtures/determinism/*.save` を読み込み、10,000 tick 進めた後の
**全エンティティ状態のFNV-1aハッシュ**が期待値と一致することをCIで検証する（§10.2）。

---

## 4. シミュレーションのデータ構造

### 4.1 Structure-of-Arrays

```ts
// entities/machines.ts （例：加工機）
const MAX_MACHINES = 65536;
const machine = {
  protoId:    new Uint16Array(MAX_MACHINES),
  x:          new Int16Array(MAX_MACHINES),
  y:          new Int16Array(MAX_MACHINES),
  recipeId:   new Uint16Array(MAX_MACHINES),
  progress:   new Int32Array(MAX_MACHINES),   // Q16.16
  inputSlots: new Int32Array(MAX_MACHINES * 4),
  outputSlot: new Int32Array(MAX_MACHINES),
  toolWear:   new Uint16Array(MAX_MACHINES),  // 0..65535 → 0..1
  flags:      new Uint8Array(MAX_MACHINES),   // enabled | blocked | starved | nopower
  nextTick:   new Int32Array(MAX_MACHINES),   // イベントスケジューラ用
};
```

- 配列は**チャンク（32×32 タイル）単位の索引**を持つ。描画・近傍探索はチャンク経由。
- 削除は tombstone ＋ フリーリスト（インデックスの再利用）。

### 4.2 アクティブ／スリープ

> 1万台の機械を毎tick全走査しない。

| 状態 | 扱い |
|---|---|
| `ACTIVE` | 毎tick更新リストに在籍 |
| `SLEEP` | `nextTick` に達するまで更新しない。**イベントスケジューラ**（4096スロットのタイムホイール + オーバーフロー用バイナリヒープ）で起床 |
| `BLOCKED` | 出力詰まり。下流のスロットが空いたときに**下流から起こされる**（プッシュ型の起床通知） |

これにより、安定した工場では**毎tickの更新対象が全体の5〜12%**に収まる。

### 4.3 ベルトの圧縮表現

Factorio と同様、**アイテムを個別エンティティにしない**。レーン単位の列として持つ。

```ts
// 1レーン = リング状の (itemId, gapToAhead) 列
type Lane = {
  itemId: Uint16Array;   // ring buffer
  gap:    Uint16Array;   // 前方アイテムとの距離 [1/256 タイル]
  head: number;          // ring index
  count: number;
  headPos: number;       // レーン終端から先頭アイテムまでの距離 [1/256 タイル]
  speed: number;         // [1/256 タイル / tick]
};

function updateLane(l: Lane, laneLen: number) {
  if (l.count === 0) return;
  // 1) 先頭だけを進める
  const room = laneLen - l.headPos;        // 終端までの余地
  const adv = Math.min(l.speed, room);
  l.headPos += adv;
  if (adv === 0) { markBlocked(l); return; }  // 完全圧縮＝以降は更新不要
  // 2) 後続は「隙間がある分だけ」詰める（圧縮波の伝播）
  let i = l.head, moved = adv;
  while (moved > 0 && --l.count >= 0) {
    const g = l.gap[i];
    if (g <= ITEM_PITCH) break;            // すでに密着：以降は動かない
    const d = Math.min(moved, g - ITEM_PITCH);
    l.gap[i] = g - d; moved = d;           // 伝播は減衰する
    i = (i + 1) & RING_MASK;
  }
}
```

**計算量**：完全圧縮のベルトは O(1)、疎なベルトのみ O(動いたアイテム数)。
実測目標：ベルト 20,000 タイル ＋ アイテム 120,000 個で **1 tick あたり 1.6 ms 以内**。

### 4.4 マニピュレータの状態機械

```
IDLE → PICK(把持待ち) → SWING_OUT(移動) → DROP(放出) → SWING_BACK → IDLE
```
各遷移はtick数固定。`SLEEP` 中は `nextTick` でスケジュール。
フィルタ（アイテム種＋**等級**）は 64bit マスクで判定（`itemId | grade<<12`）。

### 4.5 流体ネットワーク

- パイプの連結成分を **FluidSegment** として管理（union-find で構築、変更時のみ再構築）。
- 各セグメントは `volume / amount / temperature` を持ち、毎tick：
  1. 流入（ポンプ・機械出力）、2. 流出（機械入力）、3. セグメント間の移送（等圧化の緩和式）
  `transfer = k × (p_a − p_b)`、`k = min(断面積, 0.4)`
- 温度は質量加重平均で混合。熱損失は `dT = −κ(T − T_env)·dt`。

### 4.6 電力ネットワーク

```
毎tick:
  demand   = Σ(稼働機械の powerKw) + Σ(充電)
  supply   = 受電(契約上限まで) + 自家発電 + 蓄電放電 + 太陽光(時刻・天候)
  if demand > supply: satisfaction = supply / demand   // 全機械が比例的に減速
  if instantaneous > contract × 1.3: trip()            // 主幹遮断
  demandWindow.push(demand)                            // 600 tick(=30ゲーム分) の移動平均
  if demandWindow.avg > contract: contract = ceil(avg) // 契約の自動改定（基本料金UP）
```

移動平均は **循環バッファ＋ランニングサム**で O(1)。

### 4.7 圧力スケジューラ

```ts
// 同時に走る「重大イベント」は最大1つ（05 §7.1）
type PressureEvent = { kind: "inspection"|"crackdown"|"breakdown"|"finance"; severity: 1|2|3; etaTick: number };
function schedulePressure(state): PressureEvent | null {
  if (state.activeMajorEvent) return null;
  if (state.nuisance >= 70 && cooldownOk("inspection")) return make("inspection", 3, now + 3*DAY);
  ...
}
```

---

## 5. 品質システムの実装

```ts
function rollGrade(ctx: CraftCtx): Grade {
  const sigma = base(ctx.machineProto)
    * (1 + 0.60 * ctx.toolWear)
    * (1 + 0.025 * Math.max(0, ctx.envTempC - 22))
    * (1 + 0.30 * ctx.fluidContamination)
    * (1 - 0.35 * ctx.calibration)
    * gradePenalty(ctx.inputGrade);
  const mu = ctx.driftRate * ctx.ticksSinceCalibration;

  // 決定論ドロー：セーブスカム不可（§3.3）
  const rng = Rng.fromHash(ctx.serial, ctx.machineId, STREAM_QUALITY);
  const e = mu + gaussianFixed(rng, sigma);          // Box-Muller を固定小数点化
  return gradeFromError(Math.abs(e), ctx.recipeTolerances);
}
```

`gaussianFixed` は **Q16.16 の整数演算**で実装（ルックアップテーブル 1024 エントリの逆CDF）。
部品の `measured` 値（重量・寸法）は同じドローから導出し、**ブループリント選別**（`02` §9.4）で参照する。

---

## 6. レンダリング

### 6.1 工場レンダラ（WebGL2）

| パス | 内容 |
|---|---|
| 1. タイル | インスタンシングで床・構造物（1ドローコール／アトラス1枚） |
| 2. エンティティ | Yソートしたスプライトバッチ。インスタンス属性＝`(x, y, frame, tint, flags)` |
| 3. ベルトアイテム | **専用バッチ**。GPU側でレーン位置から座標を算出（頂点シェーダで補間） |
| 4. ライト | 加算バッファに点光源・炉の赤熱・火花を描画 → 乗算合成 |
| 5. パーティクル | GPUパーティクル（Transform Feedback なしの疑似：インスタンス＋時刻ベース） |
| 6. オーバーレイ | 稼働／フロー／電力／騒音／温度の半透明レイヤー |
| 7. UI | React（DOM）を上に重ねる |

- カリングはチャンク単位（視錐台＝矩形）。
- `dirtyChunks` によりインスタンスバッファを**部分更新**（`bufferSubData`）。
- 描画対象の上限：可視エンティティ 12,000、ベルトアイテム 30,000。

### 6.2 スナップショット補間

Sim は 20 Hz、描画は 60–144 Hz。直近2スナップショットを `alpha = (now - t0) / 50ms` で補間する。
ベルトアイテムは位置が線形なので補間が自然に効く。機械のアニメは `progress` から位相を算出。

### 6.3 走行レンダラ（疑似3D）

```
// 区間投影（OutRun 系の古典手法 + 現代的ポストFX）
for each segment i from camera forward (最大 300 segments):
    dz     = seg.z - camZ
    scale  = camDepth / dz                  // camDepth = 1 / tan(fov/2)
    sx     = W/2 + scale * (seg.worldX + curveAccum - camX) * W/2
    sy     = H/2 - scale * (seg.worldY - camY) * H/2
    sw     = scale * roadWidth * W/2
    → 直前セグメントの (sx, sy, sw) と結んで台形を1枚描く
curveAccum += seg.curve * (dz方向の進行量)   // カーブの横ずれを累積
```

| 要素 | 実装 |
|---|---|
| 路面テクスチャ | 台形ごとにUVを射影補正（GPUで perspective-correct に） |
| 車両スプライト | ワールド→スクリーンの同一投影でスケール。Zソート |
| 建物・柱 | ビルボード。視差3層 |
| 雨の反射 | 路面に反転したネオンをUV歪みで合成（SSRは使わない） |
| ヘッドライト | 円錐マスクを加算合成。対向車のグレアはブルームで |
| ポストFX | ブルーム（しきい値 + 2回ダウンサンプル）、色収差、ビネット、任意スキャンライン |

**物理は平面座標**（`03` §13）で解き、描画用の `z` はコース中心線上の距離に変換する。

### 6.4 ガレージの3D【任意】

- 既定は**2Dの分解図**（ドット絵＋レイヤー）。
- 「3Dビューア」を有効にした場合のみ Babylon を動的importし、低ポリの車両モデルを表示。
  バンドルには含めない（`import()` による遅延チャンク）。

### 6.5 レンダラ切替（シャッター演出）

```ts
// 同一 canvas / 同一 WebGL context を共有し、レンダラだけを差し替える。
// ロード画面なし。クロスフェードは 2 枚の FBO を合成するだけ。
async function enterNight() {
  await driveRenderer.warmup();          // テクスチャ常駐済みなら即座
  transition.play("shutter", 2.4);       // 2.4秒
  activeRenderer = driveRenderer;        // sim worker は止めない
}
```
走行用アセットは**常駐**させる（VRAM 見積り：工場 180MB + 走行 140MB + UI 40MB ≒ 360MB）。

---

## 7. オーディオ実装

```
AudioContext
 ├ MusicBus    → Gain(ducking) ─┐
 ├ UiBus       → Gain ──────────┤
 ├ FactoryBus  → Gain → Convolver(工場IR) ─┤→ Limiter → Destination
 └ EngineBus   → AudioWorklet(EngineSynth) → Biquad(排気EQ) → Convolver(環境IR) ┘
```

### 7.1 EngineSynth（AudioWorklet）

```
パラメータ（毎 128 サンプルで更新）：rpm, load, boost, gear, cylinders, firingOrder,
                                  exhaustVolume, pipeDiameter, catalyst, turboRpm
処理：
  1. 爆発パルス列を位相累積で生成（気筒数と爆発間隔から）
  2. 各パルスに対し、rpmレイヤーのサンプル粒（grain）を重畳
  3. 排気系の共鳴（2次IIR × 3段）を通す
  4. タービン音（サイン＋ノイズ、turboRpm に追従）を加算
  5. 負荷に応じたオン／オフ系の重みをクロスフェード
```

- ボイス管理：工場SEは**距離・優先度で最大64ボイス**。同種音は3ボイスまで（それ以上は音量加算で代替）。
- 音声アセットは Opus（web）／Vorbis（desktop）。ストリーミングは音楽のみ。

---

## 8. セーブデータ

### 8.1 形式

```
[Header 64B]
  magic "MACT" | formatVersion u16 | gameVersion u32 | tick u32
  rngState 16B | createdAt u64 | checksum(FNV-1a 64) u64 | chunkCount u16
[Chunk ×N]
  id u16 | flags u8 | byteLength u32 | payload (varint + TypedArray raw)
```

| Chunk | 内容 | 想定サイズ（終盤） |
|---|---|---|
| `0x01 WORLD` | タイル、Lot、建屋 | 2.0 MB |
| `0x02 ENTITIES` | 機械・ベルト・流体・電力のSoA | 18 MB |
| `0x03 ITEMS` | ベルト上・倉庫のアイテム | 6 MB |
| `0x04 CAR` | HERO CAR と全部品インスタンス | 0.4 MB |
| `0x05 PROGRESS` | 研究、章、実績、記録 | 0.2 MB |
| `0x06 ECONOMY` | 資金、契約、相場履歴 | 0.3 MB |
| `0x07 WORLD_STATE` | 近隣圧、ヒート、ライバル、天候 | 0.1 MB |
| `0x08 BLUEPRINTS` | 設計図ライブラリ | 0.5 MB |
| `0x09 REPLAYS` | 直近のラップ入力列（任意） | 1.0 MB |

全体を `CompressionStream('gzip')` で圧縮 → **実測目標 28 MB → 6〜8 MB**。
IndexedDB に Blob として保存。書き込みは Persistence Worker で非同期に行い、**ゲームは止めない**。

### 8.2 オートセーブとバージョニング

- オートセーブ：10ゲーム分ごと、**3世代ローテーション**＋章突破時に恒久スロット。
- 書き込み中のクラッシュ対策：`slot.tmp` に書き、完了後に rename（IDBはトランザクションで原子性）。
- マイグレーション：`migrations: Record<fromVersion, (save) => save>` をチェーン実行。
  **後方互換は2メジャーバージョン分**保証。壊れたセーブは読み込まず、理由を表示して複製を保全。

### 8.3 リプレイ

```ts
type Replay = {
  seed: number; buildId: string; carSpecHash: string; trackId: string;
  inputs: Int16Array;      // 120Hz の (steer, throttle, brake, gearEvent) 量子化列
  checkpoints: Float32Array; // 100 m 毎の (t, v, x, y)
  lapTimeMs: number;
};
```
再生は入力列を同じ物理に流し込む。チェックポイント誤差が閾値を超えたら
「このリプレイはこのビルドでは再現できません」と明示（改竄ではなく互換の問題として扱う）。

---

## 9. 性能予算

| 項目 | 目標 | 上限（これを超えたら対処） |
|---|---|---|
| Sim 1 tick（終盤・1万エンティティ） | 平均 4 ms | 8 ms（＝20Hzの16%） |
| ベルト更新 | 1.0 ms | 1.6 ms |
| 機械更新 | 1.2 ms | 2.4 ms |
| 流体＋電力 | 0.6 ms | 1.2 ms |
| 描画（工場, 1440p） | 6 ms | 12 ms |
| 描画（走行, 1440p） | 7 ms | 14 ms |
| スナップショット転送 | 0.4 ms | 1.0 ms |
| 起動 → タイトル | 3 s | 6 s |
| セーブロード（終盤） | 4 s | 9 s |
| メモリ（JSヒープ） | 700 MB | 1.2 GB |
| VRAM | 360 MB | 700 MB |

### 9.1 計測方法

- `performance.mark/measure` をシステムごとに常設し、**開発ビルドではHUDにフレームグラフ**を表示。
- CIで `bench/*.save` を 10,000 tick 実行し、**システム別の平均tick時間を記録**。
  前回比 +10% 以上の劣化でPRを fail させる（§10.3）。

### 9.2 最適化の優先順位（やる順番）

1. アクティブ／スリープの徹底（最も効く）
2. ベルトの圧縮表現
3. チャンク単位のダーティ管理（描画更新の削減）
4. SoA化とキャッシュ効率（ホットフィールドの隣接配置）
5. WASM化（QSSソルバ → 流体 → ベルトの順に検討）

---

## 10. テスト戦略

### 10.1 ユニット／プロパティテスト（Vitest）

| 対象 | 内容 |
|---|---|
| レシピ収支 | 全レシピについて、入力・出力・時間から理論レートを算出し、実機で±1%以内 |
| ベルト | 任意の長さ・速度・投入パターンで「アイテムが消失・増殖しない」（プロパティテスト） |
| 流体 | 総量保存、温度の質量加重平均の整合 |
| 電力 | デマンド移動平均、遮断条件、満足度の比例配分 |
| 品質 | 10万回ドローで理論分布と KS 検定（p > 0.01） |
| QSSソルバ | 既知の単純コース（円＋直線）で解析解と一致（±0.5%） |
| セーブ | ラウンドトリップ（保存→読込→ハッシュ一致）、全マイグレーションの連鎖適用 |

### 10.2 決定論ゴールデンテスト

```
pnpm test:determinism
  fixtures/determinism/{early,mid,late}.save を各10,000 tick 実行
  → 全SoAのFNV-1a 64ハッシュを expected.json と比較
```
**シミュレーションに触れるPRは必ずこのテストを更新理由つきで通す。**

### 10.3 回帰・ベンチ

| テスト | 内容 |
|---|---|
| ラップタイム回帰 | 基準車両×基準セットアップの理論ラップが、仕様変更で意図せず動いていないか（±0.05 s） |
| バランス回帰 | 各Actの「標準プレイ」シナリオを自動実行し、到達タイム・DATAレート・資金の推移を記録 |
| 性能ベンチ | §9.1 |
| スモーク | 起動 → 新規ゲーム → 100 tick → セーブ → ロード（Playwright） |

### 10.4 プレイテスト

`09` §7 に手順とKPIを記載。

---

## 11. ビルド・配信・オンライン

### 11.1 ビルド構成

```
vite build
 ├ chunk: main          React UI + ブートストラップ        ~280 KB gz
 ├ chunk: sim.worker    シミュレーション（WASM別ファイル）  ~190 KB gz
 ├ chunk: drive.worker  走行物理                           ~70 KB gz
 ├ chunk: renderer      WebGL2 レンダラ + シェーダ          ~120 KB gz
 ├ chunk: content       JSONコンテンツ（遅延、章ごと分割）  ~400 KB gz
 └ assets/              アトラス、音声（CDN 配信）
```

### 11.2 Web版の注意（COOP/COEP）

`SharedArrayBuffer` を使うには以下のヘッダが必要。Cloudflare Pages では `_headers` に記述する。

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```
**ただし** これを有効にすると外部埋め込み（iframe プレビュー等）が壊れる場合があるため、
`SharedArrayBuffer` が使えない環境では**自動的に差分転送モードへフォールバック**する実装を必須とする。
Web体験版（Act0〜1 相当）は SAB なしでも 60 fps を維持できる規模に制限する。

### 11.3 オンライン機能（非同期のみ）

| 機能 | 実装 |
|---|---|
| ゴースト共有 | リプレイ（§8.3）を R2 に保存、メタデータを D1 に。検証はチェックポイント整合 |
| ランキング | 週課アタック（`05` §8.3）。クラス・気温帯・支援設定でフィルタ |
| 設計図共有 | 文字列（base64 + gzip）での手動共有を基本。公式リポジトリは任意参加 |
| チート対策 | リプレイ検証＋物理的に不可能な値（出力／重量／μ）の静的チェック。**疑わしきは別枠表示**（BAN はしない） |
| プライバシー | 送信はオプトイン。個人を特定しうる情報は収集しない（`09` §8） |

### 11.4 デスクトップ版（Tauri v2）

- ファイルI/O（セーブの実ファイル化、設計図のインポート／エクスポート）
- Steamworks 連携（実績、クラウドセーブ）は Rust 側プラグイン
- コントローラ／ステアリングは Gamepad API ＋ Tauri 側の HID フォールバック

---

## 12. 既存プロトタイプからの移行計画

現状：`client/src/pages/Home.tsx`（2,521行）に KOBO Motorworks の全ロジックが同居。

| Phase | 内容 | 完了条件 |
|---|---|---|
| **P0：土台の分離** | ゲームロジックを `Home.tsx` から `src/game/` へ抽出。`advanceGame()` を純関数化し、テストを書く | `pnpm check` 通過、ロジックのユニットテスト 20件 |
| **P1：Worker化と決定論** | Sim Worker を立て、20Hz固定ステップ＋Q16.16＋RNGストリームを導入。UIはスナップショット購読に変更 | 決定論ゴールデンテストが通る |
| **P2：グリッド工場** | タイルグリッド、ベルト、マニピュレータ、加工機、WebGL2 レンダラ。既存の「地域×6機械」は**廃止** | Act0 相当が遊べる（チュートリアル 60分） |
| **P3：車両と走行** | 部品モデル、QSSソルバ、疑似3Dレンダラ、筑波1コース、C1の1/3区間 | Vertical Slice（`09` §2） |
| **P4：拡張** | 流体・電力・品質・研究・夜のシステム・セーブのバイナリ化 | Early Access |

**データの非互換**：既存セーブ（`kobo-nippon-motor-grid-v1`）は移行しない。
初回起動時に「旧版のデータは引き継げません」と明示し、旧データをエクスポート（JSON）だけ提供する。

### 12.1 ディレクトリ構成（目標）

```
client/src/
  app/              React シェル、ルーティング、テーマ
  ui/               HUD・インスペクタ・研究ツリー・帳簿（React）
  render/
    gl/             WebGL2 ラッパ（シェーダ、バッチ、アトラス）
    factory/        工場レンダラ
    drive/          疑似3Dレンダラ
    shared/         カメラ、補間、ポストFX
  audio/            AudioWorklet、ボイス管理、IR
  bridge/           Worker 通信、スナップショット購読
sim/                ★ UI非依存・純TS（Workerから利用、テスト対象）
  core/             tick、スケジューラ、RNG、固定小数点
  entities/         machines, belts, inserters, pipes, power, storage
  systems/          quality, research, economy, pressure, weather
  vehicle/          部品集約、エンジン/駆動/空力/タイヤのモデル
  solver/           QSS ラップソルバ
  save/             シリアライズ、マイグレーション
content/            ★ JSON コンテンツ（items, recipes, machines, parts, tracks, research）
  schema/           Zod スキーマ + 型生成
shared/             定数・型（クライアント/サーバ共通）
server/             Cloudflare Workers（ランキング、ゴースト）
tools/              アトラス生成、バランス検証CLI、ベンチ
```

---

## 13. コンテンツ・パイプライン

| 項目 | 方針 |
|---|---|
| 定義 | すべて JSON（`content/*.json`）。コードにハードコードしない |
| 検証 | Zod スキーマでビルド時検証。ID参照の整合（存在しないレシピ・アイテム）を CI で fail |
| 型 | スキーマから `.d.ts` を生成し、`sim` 側は生成型のみを参照 |
| バランス | `tools/balance-check.ts` が「全レシピの理論レート表」「研究到達時間」「章ごとの想定資金曲線」を出力 |
| アトラス | `tools/atlas.ts` が PNG + JSON を生成（決定論的な配置＝差分が小さい） |
| MOD | 1.0 以降、`mods/<name>/content/*.json` の読み込みに対応【P2】。スクリプトMODは当面非対応 |

---

## 14. 技術リスク

| # | リスク | 影響 | 対策 |
|---|---|---|---|
| T-1 | JS/WASM でのシム性能不足 | 終盤の工場が重い | 早期にベンチ基盤（§9.1）、スリープ最適化、WASM退避路 |
| T-2 | 2つのレンダラの同時常駐でVRAM超過 | 低スペックで破綻 | アトラス圧縮（ASTC/BC7 はWebで不可 → PNG + ミップ制御）、品質プリセット |
| T-3 | 走行物理の浮動小数点非決定論 | ゴースト不整合 | 入力＋チェックポイント方式（§8.3）、完全一致は要求しない |
| T-4 | SharedArrayBuffer が使えない配信環境 | 性能低下 | 差分転送フォールバックを**最初から**実装 |
| T-5 | セーブ肥大（終盤 30MB超） | ロード遅延、ブラウザ制限 | チャンク分割保存、増分セーブ【P2】、不要履歴の間引き |
| T-6 | Workerデバッグの困難さ | 開発速度低下 | シムを**メインスレッドでも動かせる**モード（`?sim=main`）を常設 |
| T-7 | 品質システムが重い（1クラフトごとに乱数＋分布） | CPU | LUT化、バッチ処理、等級だけ必要な場合の簡略パス |
| T-8 | React 再描画が描画スレッドを食う | fps低下 | HUDは `useSyncExternalStore` ＋ 粗い更新頻度（10Hz）、ゲーム描画はReact外 |
