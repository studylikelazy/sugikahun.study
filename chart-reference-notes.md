# チャート表現の参照メモ

実際の取引画面に近い可読性を持たせるため、メインチャートにはローソク足の4本値（始値・高値・安値・終値）を表示する。ローソク足の実体は始値と終値、ヒゲは高値と安値を示すため、上下動の方向だけを表すラインチャートよりも、各時間帯の価格変動と買い・売りの力関係を読み取りやすい。[1] [2]

画面では短期～中期の読み替えができる時間足セレクター、上昇・下落に対応したローソク足の色、同じ時系列に対応する出来高バー、直近価格とOHLC の情報列を組み合わせる。ユーザーのゲーム市場は架空のものなので、表示データはニュース連動のシミュレーション値を維持する。

## References

[1]: https://info.monex.co.jp/technical-analysis/indicators/011.html "ローソク足チャート | マネックス証券"
[2]: https://www.cmegroup.com/education/courses/technical-analysis/chart-types-candlestick-line-bar.html "Chart Types: candlestick, line, bar | CME Group"
