# HANDOFF — セッション引き継ぎメモ

> **作成経緯（重要）**: 本来の HANDOFF は前セッション（`arena/50c3c062-sugikahun-study`）で
> ローカルコミットまで作られていたが、PR #3 のマージでセッションが終了し **push されなかった**。
> 新セッションの作業環境は GitHub からの新規 clone のため、その未 push コミットは物理的に残っていなかった
> （reflog / stash / dangling object / リモート全ブランチを確認済み。旧ブランチ tip `bd8387f` は PR #3 の
> head と同一で、HANDOFF は含まれていない）。
> よって本ファイルは **2026-10-17 時点のリポジトリ実状態から再構成したもの**である。
> 教訓: **セッションをまたぐ成果物は、作った瞬間にコミット＋push する**（ローカルコミットはセッションを越えない）。
>
> **【続報 2026-10-17】原文は回収できた。** ユーザーが保持していた前セッションの差分から、
> 本来の HANDOFF は [`docs/midnight-automation/HANDOFF.md`](docs/midnight-automation/HANDOFF.md)（371行・
> 実装引継ぎプロンプト）＋ 両 README へのリンク追加だったことが判明し、原文のまま復元済み。
> 本ファイル（ルート）はセッション横断の現況メモ、docs 側は「遊べるようにする」ための実装指示書、と役割を分ける。

最終更新: 2026-10-17 / 対象: `main` = `2d9e49c`（PR #3 マージ直後）

---

## 1. 現在地（30秒で把握する）

| 項目 | 状態 |
|---|---|
| 公開中のアプリ | **KOBO Motorworks**（日本×JDM 自動化ゲーム、PR #1 でリビルド）。入口は `client/src/pages/Home.tsx` |
| デプロイ | GitHub Pages（`.github/workflows/deploy-pages.yml`、`main` push で自動）。PR #3 マージ時の実行は **success** |
| 最新の大きな成果物 | 『MIDNIGHT AUTOMATION: C1 to TSUKUBA』の**設計書一式＋参照実装**（PR #3 でマージ済み）。**まだ画面には繋がっていない** |
| 次にやること | 下記「4. 次のタスク候補」参照。設計は確定済みなので、次は実装フェーズ（M0/M1） |

歴史メモ: ルートの `MEMORY.md` / `PLAN.md` / `STRUCTURE.md` / `todo.md` は旧作 **MARKET PULSE** 時代の記録。
PR #1 でアプリ本体は JDM テーマへ作り替わったが、これらの文書は更新されていない（経緯の記録として残置）。

---

## 2. PR / ブランチ履歴

| PR | 内容 | 状態 |
|---|---|---|
| #1 | 日本×JDMの自動化ゲーム（KOBO Motorworks）へリビルド＋Pages ワークフロー追加 | MERGED |
| #2 | Pages ワークフローの pnpm バージョン検出修正 | MERGED |
| #3 | **MIDNIGHT AUTOMATION** 詳細設計書（GDD）＋技術実装仕様＋参照実装（26ファイル・追加のみ） | MERGED（2026-10-17） |
| #4（本セッション） | 本 HANDOFF の再構成＋原文 `docs/midnight-automation/HANDOFF.md` の復元＋`pnpm check` 修復（下記 5-1） | — |

作業ブランチは Arena セッション毎に `arena/<id>-sugikahun-study` が切られる。`main` へは直接 push せず PR 経由。

---

## 3. MIDNIGHT AUTOMATION の中身（PR #3 の成果物）

コンセプト: 工場自動化SIM × 首都高オープンワールド × JDMエンジニアリング。
最終目標は **筑波 TC2000 を 0:49.999 以内**（理論 0:49.238 / 推定 0:49.582。実在の非フォーミュラ最速 49.445 秒は割らない設計）。

### 設計書 — `docs/midnight-automation/`

- `01`〜`10`＋`README.md`：企画書・背景・バランス表・設計判断ログ（D-01〜D-21）
- **`spec/S1`〜`S6`：発注された詳細設計書6本（納品物の本体）**。対応表29項目は `spec/README.md`、未達なし
- 読む順（実装担当）: `spec/S1` → `S5` → `S2` → `S3` → `S4` → `S6`
- ロードマップ/マイルストーン（M0 技術検証〜M6 1.0）は `09_roadmap_risks_legal.md`

### 参照実装 — `shared/midnight/`（依存ゼロ、決定論）

| ファイル | 内容 | テスト |
|---|---|---|
| `types.ts` / `tsukuba.ts` | 型・定数（`LEGENDARY_MASS_MATCH_G = 0.001` 等）／TC2000 16区間 | — |
| `lap-solver.ts` | 準定常ラップソルバ（S5） | 22件 |
| `market.ts` | 4大市場の決定論生成器（S3、実在車名8台） | 53件 |
| `restore.ts` | レストア13工程ステートマシン（S4） | 32件 |

**仕様書の数値を変えるとテストが落ちる**関係で書かれている。数値を変える時は仕様書とテストを同時に直すこと。
現時点では `client/`・`server/` のどこからも import されておらず、サイトの表示には影響しない。

---

## 4. 次のタスク候補（優先順）

1. **フェーズ1「経営ループが回る」の実装** — 指示書は復元された [`docs/midnight-automation/HANDOFF.md`](docs/midnight-automation/HANDOFF.md) が正本
   （市場→レストア→組付け→筑波計測→報酬の1周を `/midnight` ルートに作る。画面の優先順・API一覧・変更禁止の数値・完了の定義まで書いてある）。
   - 既存 `Home.tsx`（公開中）は触らず、`App.tsx` に `/midnight` ルートを追加する形。セーブキーは `midnight-automation-v1` 等で分離。
2. **テスト実行経路の整備**（下記 5-2）: `vitest.config.ts` 追加＋`package.json` に `test` スクリプト＋CI で `pnpm check` とテストを回す。
3. **旧文書の整理**: `MEMORY.md` / `PLAN.md` / `STRUCTURE.md` / `todo.md` は MARKET PULSE 前提のまま。
   現行アプリ（KOBO）と設計（MIDNIGHT）を指すよう更新するか、`docs/legacy/` へ退避して誤読を防ぐ。
4. `todo.md` の未完了項目: Cloudflare 再デプロイ検証、Pages 404 確認系が `[ ]` のまま残っている
   （現行は GitHub Pages が正で稼働中。Cloudflare を使うか否かの判断から）。

---

## 5. 既知の注意点・落とし穴

### 5-1. `pnpm check` が PR #3 時点の `main` で落ちていた → 本セッションで修復済み
- 症状: `shared/midnight/lap-solver.ts(404,35): error TS2802`（Map イテレーション）。
  原因は `tsconfig.json` に `target` が無く ES5 扱いだったこと。PR #3 の検証は当該ディレクトリ単体の
  `tsc --strict` だったため、リポジトリ全体の `pnpm check` の赤に気付けなかった。
- 修正: `tsconfig.json` に `"target": "ES2022"` を追加（`noEmit` 専用のため出力への影響なし）。
- ⚠️ `incremental` のキャッシュ（`node_modules/typescript/tsbuildinfo`）が古いと設定変更後も同じエラーが出続ける。
  設定を変えたのに直らない時はこのファイルを消してから再実行すること。

### 5-2. テストは `--root .` が必要
- `vite.config.ts` の `root` が `client/` のため、素の `pnpm vitest run` は `shared/midnight/*.test.ts` を見つけられない。
- 現行の正しい実行方法: `pnpm vitest run --root . shared/midnight`
- 恒久対処は 4-2（`vitest.config.ts` 切り分け）。

### 5-3. 実名（車名・型式）について
- 判断ログ **D-19** で実在車名の使用を確定（BNR32 / JZA80 / S30Z は発注指定、S30Z は `wreckOnly`）。
- 公開・運用フェーズではライセンス前提。フォールバック方針は `09` §5.1.2（型式コードのみ表記へ切替可能な3層データ化）。

### 5-4. その他
- `pnpm-lock.yaml` あり。依存追加時は lockfile をコミットに含める（Pages は `--frozen-lockfile`）。
- pnpm 未導入環境では `corepack enable && corepack prepare pnpm@latest --activate` で用意できる。
- 本番JSサイズは Babylon 由来で大きめという旧記録あり（`MEMORY.md`、MARKET PULSE 時代の数値）。現行ビルドの実測は下記。

---

## 6. 検証スナップショット（2026-10-17、本セッション実測）

環境: Node v22.22.3 / pnpm 10.4.1 / `pnpm install --frozen-lockfile` 済み

| コマンド | 結果 |
|---|---|
| `pnpm vitest run --root . shared/midnight` | ✅ **107 passed**（lap-solver 22 / restore 32 / market 53） |
| `pnpm check`（`tsc --noEmit`） | ✅ 通過（5-1 の修正後。修正前は TS2802 で失敗） |
| `pnpm build` | ✅ 成功。`dist/public/` に index.html 367.59 kB（gzip 105.66 kB）／JS 395.57 kB（gzip 120.20 kB）／CSS 133.82 kB |
| GitHub Pages デプロイ（`main` 最新） | ✅ success（PR #3 マージ時、36s） |

開発サーバー: `pnpm dev`（Vite）。プレビュー: `pnpm preview`。

---

## 7. 主要ファイル地図

```
client/src/pages/Home.tsx      現行アプリ（KOBO Motorworks）の実体
client/src/App.tsx             ルーティング（wouter、BASE_URL 対応）
server/                        本番用 Node サーバー（esbuild で dist/index.js）
shared/midnight/               MIDNIGHT AUTOMATION 参照実装＋テスト（未接続）
docs/midnight-automation/     企画書 01〜10＋詳細設計 spec/S1〜S6（正本は spec/）
docs/midnight-automation/HANDOFF.md  実装引継ぎプロンプト（原文・復元済み）。次フェーズの指示書
.github/workflows/deploy-pages.yml  GitHub Pages 自動デプロイ
MEMORY.md / PLAN.md / STRUCTURE.md / todo.md   旧 MARKET PULSE 時代の記録（未更新）
HANDOFF.md                     本ファイル。セッション終了時に更新して push すること
```
