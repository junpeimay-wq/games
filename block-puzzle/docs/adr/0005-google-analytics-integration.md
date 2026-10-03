# ADR-0005: Google Analytics (GA4) アクセス解析タグの導入

## ステータス
承認済み

## 日付
2026-10-03

## コンテキスト
GitHub Pages 上で公開されているゲームアーケードおよび各ゲームページのアクセス状況（ユーザー数・セッション・滞在時間等）を計測・分析する仕組みが必要だった。

## 決定
Google Analytics 4（GA4）のタグ（Measurement ID: `G-FDT7JTRCNE`）を全 HTML ページの `<head>` に組み込む。

### 対象ファイル
- `games/index.html` (アーケードポータル)
- `games/snake/index.html` (スネーク)
- `games/tictactoe/index.html` (戦略的〇×)
- `games/block-puzzle/index.html` (8x8ブロックパズル)

## 理由
- 非同期の `gtag.js` スクリプトにより、ゲーム描画や操作性にパフォーマンス上の影響を与えずにアクセス計測が行える。
- アーケード全体の遊ばれ方や人気コンテンツの分析が可能になる。
