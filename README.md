# THE COFFEE MILK

GitHub Pages でそのまま遊べるブラウザゲームです。

## 遊び方
- 全5ラウンド。
- 毎ラウンド、TARGET に表示された色へコーヒー牛乳を近づけます。
- COFFEE / MILK はそれぞれ1回だけ使用可能。ボタンを押している間だけ注ぎます。
- 色の一致度と充填率を非線形評価し、`COLOR × VOLUME` がラウンド得点になります。
- 溢れたラウンドは0点です。
- 5ラウンド合計が最終スコアです。
- ROUND 5 は中身が見えません。満杯に近づいた時だけ鳴る高くなる音を手掛かりにします。

## ラウンド
1. BEAKER — 目盛り付き
2. STRAIGHT GLASS — 目盛りなし
3. SLIM GLASS — 試験管ほど細いグラス
4. COCKTAIL GLASS — 形状で容量感覚が狂う
5. BLIND GLASS — 中身が見えない

## 画面操作
- 右上 `TITLE`：ゲーム進行とスコアをリセットしてタイトルへ戻る
- 右上 `SOUND ON / OFF`：BGM・SEの切り替え

## GitHub Pages
このフォルダ内のファイルをリポジトリ直下へアップロードし、GitHub の `Settings > Pages` から公開してください。
