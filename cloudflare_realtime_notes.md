# Cloudflare公開向けリアルタイム共有ルーム設計

## 採用する構成

フロントエンドは現在のViteビルドをCloudflare Pagesへ公開し、共有ルームはCloudflare WorkersとDurable Objectsで管理する。ルームコードごとに1つのDurable Objectを割り当て、WebSocketで参加者の入退室、開封アクティビティ、取引アクティビティを共有する。個々のプレイヤーのローカル資産・価格計算は共有ルームから切り離し、共有対象を参加状況とイベントログに限定する。

## 公平性とデータ境界

共有ルームは価格、ニュース、ガチャ排出率、保有資産を変更しない。共有するイベントは、表示名、ルーム内の参加状態、パック開封、売買記録の要約のみとし、ゲームの結果は各プレイヤーの画面側で個別に維持する。

## GitHubと公開

Cloudflare PagesおよびWorkersはGitHubリポジトリ接続による自動デプロイに対応する。フロントエンドとWorkerを同一リポジトリで管理し、プレビュー用の環境変数と本番用のWebSocketエンドポイントを分離する。

## 参考にした公式資料

- Cloudflare Durable Objects WebSocket: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Cloudflare Pages Git integration: https://developers.cloudflare.com/pages/configuration/git-integration/
- Cloudflare Workers Git integration: https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/
