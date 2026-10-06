# ADR-0010: 全公開ゲームページへのGoogle Analytics導入

## ステータス
承認済み・実装済み

## 日付
2026-10-06

## コンテキスト
既存のGoogle Analytics 4導入方針では、ゲームアーケードおよび公開ゲームページでアクセス状況を計測することとしている。しかし、地図記号クイズの `terrain-quest/index.html` にはGA4タグがなく、ゲームごとの計測に漏れがあることが分かった。

## 決定
- 公開するゲームページには、既存のGA4 Measurement ID `G-FDT7JTRCNE` を使用したタグを設置する。
- `terrain-quest/index.html` にも同じGA4タグを設置する。
- Firebaseデモなど、既存方針で計測対象外とされているページの扱いは変更しない。

## 理由
- ゲームごとの利用状況を比較でき、アクセス計測の抜けを防げる。
- 既存のMeasurement IDを再利用し、サイト内で計測先を統一できる。

## 実装チェック
- [x] `terrain-quest/index.html` の `<head>` に `G-FDT7JTRCNE` のGA4タグを追加する。
- [x] 既存のタグ設置済みページと同じ初期化形式であることを確認する。
