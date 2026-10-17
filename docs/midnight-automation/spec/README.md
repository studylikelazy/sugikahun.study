# 詳細設計書 ― 6本の実装仕様

> 『MIDNIGHT AUTOMATION: C1 to TSUKUBA』
> 発注された6本の仕様書。**これが納品物の本体**であり、`../01`〜`../10` は背景となる企画書である。

| # | 仕様書 | 内容 | 主な読者 |
|---|---|---|---|
| **S1** | [全体アーキテクチャ ＆ ゲームループ定義](S1_architecture_and_gameloop.md) | レイヤ構成、10シーンと遷移、**シャッター遷移 1.8 秒のタイムライン**、WorldState／FactorySoA／HeroCarState、1ゲーム日 28,800 tick の昼夜構造、夜へ出る5条件、決定論・セーブ・性能予算 | Tech Lead |
| **S2** | [R&Dファクトリー 機械・レシピ・リソース](S2_rnd_factory_machines_recipes.md) | 固体／流体／DATA の全リソース、搬送設備、**風洞・破壊ベンチ・オートクレーブ・メインフレーム**の数式、レシピ24件、電力／熱／騒音、**公差と Legendary 品質の生成式** | Lead Designer / Sim |
| **S3** | [4大市場の抽選ロジックと取引データテーブル](S3_four_markets_tables.md) | **AA 出品票（評価点分布・検査員メモ13種）**、ネトオク、解体ヤード、青カゴ、輸入（保税）、**コンテナのドロップ表とベイズ事後確率**、ローカル（REP）、ニコイチ／AT→MT ライン | Sim Programmer |
| **S4** | [レストア工程のステートマシン](S4_restoration_state_machine.md) | **13状態**の遷移・所要 tick・失敗分岐、ブラスト／電着／フレーム修正／5軸削り出しの数式、**新車を凌駕する剛性 1.44 の導出**、UI | Sim Programmer |
| **S5** | [車両物理・筑波ラップタイム計算式](S5_vehicle_physics_laptime.md) | 準定常ソルバの全方程式、TC2000 16区間、**Act0〜6 の確定ラダーと検証値**、感度表、区間別の支配限界、**なぜ 1,020 PS が要るのか** | Sim Programmer |
| **S6** | [UI/UX 画面遷移・操作レイアウト](S6_ui_ux_screens.md) | 画面遷移図、**シャッターによるシームレス統合**、Factory 俯瞰画面、BUILD／感度ビュー、市場・出品票・競り、コックピット HUD、テレメトリ | UI / Frontend |

---

## 参照実装

| ファイル | 内容 | テスト |
|---|---|---|
| [`shared/midnight/types.ts`](../../../shared/midnight/types.ts) | 全体の型・定数（等級・tick・公差） | — |
| [`shared/midnight/tsukuba.ts`](../../../shared/midnight/tsukuba.ts) | TC2000 の16区間定義（2,045 m） | — |
| [`shared/midnight/lap-solver.ts`](../../../shared/midnight/lap-solver.ts) | 準定常ラップソルバ（S5） | **22 件** |
| [`shared/midnight/market.ts`](../../../shared/midnight/market.ts) | 4大市場の決定論生成器（S3） | **52 件** |
| [`shared/midnight/restore.ts`](../../../shared/midnight/restore.ts) | レストア工程ステートマシン（S4） | **32 件** |

**合計 106 件・全通過。** 仕様書の数値を変えるとテストが落ちる——両者はそういう関係にある。

---

## 最終目標の確認

```
筑波サーキット TC2000（2,045 m）を 0:49.999 以内。

  達成条件  1,000 PS 超の完全内製ビレットエンジン
          ＋ ドライカーボン一体成型モノコック
          ＋ 風洞で詰めた巨大エアロ
          ＋ 全パーツ Legendary 品質（公差 ±0.003 mm・重量差 0.001 g 以下）

  到達値    理論 0:49.238 ／ 推定 0:49.582（ゲートまで +0.42 秒）
  実在記録  筑波アンリミテッド非フォーミュラ最速 49.445 秒 — これは割らない
```

4条件のうち**1つでも欠けると 49 秒台に入らない**ことは S5 §9 で数値的に示してある。
