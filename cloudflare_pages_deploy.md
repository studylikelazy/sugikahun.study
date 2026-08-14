# MARKET PULSE: Cloudflare公開設定

## 今回の失敗原因

Cloudflare Pagesのデプロイ設定で `npx wrangler deploy` が**デプロイコマンド**として実行されています。これは静的サイトを公開するPagesの処理後に、別用途のWorkerデプロイを起動する設定です。ログではWranglerがVite向けWorker設定を自動作成しようとして、Vite設定の解析で停止しています。

> Pagesの画面本体は、ビルド完了後にCloudflare Pagesが自動公開します。`npx wrangler deploy` はPagesのデプロイコマンドに設定しません。

## Pagesプロジェクトの設定

Cloudflare Dashboardの **Workers & Pages → 対象のPagesプロジェクト → Settings → Builds & deployments** で、以下を設定します。

| 項目 | 設定値 |
|---|---|
| Production branch | `main` |
| Build command | `pnpm run build` |
| Build output directory | `dist/public` |
| Deploy command | **未設定（空欄）** |
| Node.js | `22` またはCloudflareの既定値 |

公開後は、GitHubの `main` ブランチへのpushでPagesが自動ビルド・公開します。

## 環境変数

共有ルームを実接続する場合だけ、PagesプロジェクトのProductionとPreviewの両方に以下を追加します。

| 変数名 | 例 | 用途 |
|---|---|---|
| `VITE_ROOM_WS_URL` | `wss://market-pulse-room.example.workers.dev` | 共有ルームWebSocketの接続先 |

`VITE_ROOM_WS_URL` はフロントエンドへ埋め込まれる公開値です。認証トークンや秘密鍵は入れません。

## Workerは別に公開する

リアルタイム共有ルーム用のWorkerは、Pagesのデプロイコマンドには入れず、別のWorkerプロジェクトまたは別ディレクトリから公開します。Worker側にはDurable ObjectsとWebSocket処理が必要です。メッセージ形式は `cloudflare_worker_contract.md` を参照してください。

Workerの公開後、発行された `wss://` URLをPagesの `VITE_ROOM_WS_URL` に設定してから、Pagesを再デプロイします。
