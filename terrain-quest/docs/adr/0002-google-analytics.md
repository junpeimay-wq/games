# ADR-0002: 地図記号クイズへのGoogle Analytics導入

## ステータス
承認済み・実装済み

## 日付
2026-10-06

## コンテキスト
アーケードと公開ゲームページの利用状況を一貫して計測する方針に対し、地図記号クイズのページでGA4タグが未設置だった。

## 決定
- `terrain-quest/index.html` の `<head>` に、既存のMeasurement ID `G-FDT7JTRCNE` を設定したGA4タグを設置する。
- タグは `gtag.js` を非同期で読み込み、ページビューを計測する。
- 全公開ゲームに共通する計測方針は [共通ADR-0010](../../../docs/adr/0010-google-analytics-on-all-game-pages.md) に従う。

## 理由
- 他の公開ゲームと同じGA4プロパティでアクセス状況を比較できる。
- 非同期読み込みにより、地図やクイズの操作開始をタグの読込完了に依存させない。

## 実装チェック
- [x] `terrain-quest/index.html` の `<head>` にGA4タグを追加する。
- [x] 既存ページと同じMeasurement IDと初期化形式を使う。
