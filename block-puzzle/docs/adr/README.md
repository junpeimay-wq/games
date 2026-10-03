# Architecture Decision Records - 8x8ブロックパズル

このディレクトリは8x8ブロックパズルに関する設計上の意思決定を記録します。

## 一覧

| ADR | タイトル | ステータス |
|-----|---------|-----------|
| [0001](0001-block-puzzle-rules.md) | 8x8ブロックパズル（Block Puzzle）のルールと構造の定義 | 承認済み |
| [0002](0002-placement-validation-warning.md) | はみ出し配置時の警告とキャンセル処理の導入 | 承認済み |
| [0003](0003-drag-drop-and-rotation.md) | 直感的なドラッグ＆ドロップ操作、回転機能の導入、および1マスブロックの廃止 | 承認済み |
| [0004](0004-in-slot-rotation-and-drag.md) | 候補欄内での直接タップ回転とドラッグ＆ドロップ配置の分離 | 承認済み |
| [0005](0005-google-analytics-integration.md) | Google Analytics (GA4) アクセス解析タグの導入 | 承認済み |

## 新しいADRの追加方法

```
docs/adr/NNNN-タイトル.md
```

番号を連番にして追加し、このREADMEの一覧も更新してください。
