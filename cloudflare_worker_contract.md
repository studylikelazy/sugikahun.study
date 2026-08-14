# MARKET PULSE Shared Room: Cloudflare Worker 接続契約

## 環境変数

Cloudflare Pagesでフロントエンドを公開する際、`VITE_ROOM_WS_URL` にWebSocketエンドポイントを設定する。例は `wss://market-pulse-room.<your-subdomain>.workers.dev` である。値を設定しない場合、共有ルーム画面は接続先の設定待ちとして安全に表示される。

## ルーム設計

ルームコードをDurable Objectの識別子に対応させ、1ルームあたり1つの状態管理単位を作る。WorkerはWebSocketの接続を受け、同一ルームへ `presence` と `activity` を配信する。各プレイヤーの資産、ガチャ排出、個別市場価格はDurable Objectへ保存しない。

## クライアントから送るメッセージ

```json
{"type":"join","roomCode":"PULSE-01","player":{"id":"local","name":"PULSE PLAYER","status":"online"}}
```

```json
{"type":"activity","roomCode":"PULSE-01","activity":{"id":"event-id","player":"PULSE PLAYER","action":"SIGNAL DROP から RARE を獲得","createdAt":0}}
```

## Workerから受け取るメッセージ

```json
{"type":"presence","participants":[{"id":"player-id","name":"PULSE PLAYER","status":"online"}]}
```

```json
{"type":"activity","activity":{"id":"event-id","player":"PULSE PLAYER","action":"ORCA を 10 UNIT 購入","createdAt":0}}
```

## GitHubとCloudflareの公開手順

1. リポジトリをGitHubへ送信する。
2. Cloudflare Pagesにリポジトリを接続し、`pnpm build` と `dist/public` をビルド設定に登録する。
3. Durable Objectsを含むWorkerを同じGitHubリポジトリから接続し、`VITE_ROOM_WS_URL` をPagesの環境変数として追加する。
4. プレビュー環境では別のルームエンドポイントを設定し、本番参加者と混在させない。
