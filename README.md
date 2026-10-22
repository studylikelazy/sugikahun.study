# sugikahun.study

ゲーム実装をすべて削除した、最小構成の静的サイトです。

## 構成

| パス | 役割 |
|---|---|
| `client/index.html` | エントリHTML |
| `client/src/main.tsx` | Reactマウント |
| `client/src/App.tsx` | 表示内容（現在はプレースホルダーのみ） |
| `client/src/index.css` | 最小スタイル |
| `vite.config.ts` | Vite設定（GitHub Pages の base 切替を含む） |
| `.github/workflows/deploy-pages.yml` | `main` push で GitHub Pages へデプロイ |

## コマンド

```bash
pnpm install
pnpm dev      # 開発サーバー
pnpm check    # tsc --noEmit
pnpm build    # dist/public へ出力
```

新しいアプリを作るときは `client/src/` 以下に追加し、`client/src/App.tsx` から読み込んでください。
