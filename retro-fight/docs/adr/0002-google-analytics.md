# ADR-0002: レトロ格闘ファイトへのGoogle Analytics導入

## ステータス
承認済み・実装済み

## 日付
2026-11-14

## コンテキスト
アーケードと公開ゲームページの利用状況を一貫して計測する方針のため、新規ゲームのページにも公開時点でGA4タグが必要である。

## 決定
- `retro-fight/index.html` の `<head>` に、既存のMeasurement ID `G-FDT7JTRCNE` を設定したGA4タグを設置する。
- タグは `gtag.js` を非同期で読み込み、ページビューを計測する。
- 全公開ゲームに共通する計測方針は [共通ADR-0010](../../../docs/adr/0010-google-analytics-on-all-game-pages.md) に従う。

## 理由
- 他の公開ゲームと同じGA4プロパティでアクセス状況を比較できる。
- 非同期読み込みにより、ゲームの操作開始をタグの読込完了に依存させない。

## 実装チェック
- [x] `retro-fight/index.html` の `<head>` にGA4タグを追加する。
- [x] 既存ページと同じMeasurement IDと初期化形式を使う。
