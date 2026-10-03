# Architecture Decision Records - 戦略的〇×ゲーム

このディレクトリは戦略的〇×ゲームに関する設計上の意思決定を記録します。

## 一覧

| ADR | タイトル | ステータス |
|-----|---------|-----------|
| [0001](0001-strategic-tictactoe-rules.md) | 戦略的〇×ゲームの基本ルールと構造の定義 | 承認済み |
| [0002](0002-aggressive-cpu-ai.md) | アグレッシブなCPU思考アルゴリズムへの強化 | 承認済み |
| [0003](0003-single-overwrite-rule.md) | 上書き上限回数を1回に変更 | 承認済み |
| [0004](0004-overwrite-threat-detection.md) | プレイヤーの上書き勝利を含むリーチ検出の強化 | 承認済み |
| [0005](0005-overwrite-conservation-strategy.md) | 初手・序盤における上書き権利の温存戦略の導入 | 承認済み |
| [0006](0006-square-game-favicon.md) | 〇×ゲームの正方形ファビコン | 承認済み |

## 新しいADRの追加方法

```
docs/adr/NNNN-タイトル.md
```

番号を連番にして追加し、このREADMEの一覧も更新してください。
