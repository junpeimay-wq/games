# Changelog

## [0.2.0](https://github.com/junpeimay-wq/games/compare/v0.1.0...v0.2.0) (2026-10-06)


### Features

* 8x8ブロックパズル（同時消しボーナス・IndexedDB保存）の新規開発とADR-0001追加 ([f3385f6](https://github.com/junpeimay-wq/games/commit/f3385f6ff9d22c1cae6297e2d8bdeb6fe0ddad2b))
* CPUのAI思考アルゴリズムを強化（積極的な上書きとリーチ構築）およびADR-0002追加 ([3178d3f](https://github.com/junpeimay-wq/games/commit/3178d3f4231e16336737fea08fdedbdc06268c91))
* Firebase Auth+Firestoreグローバルランキング基盤デモを追加およびADR-0001追加 ([6389628](https://github.com/junpeimay-wq/games/commit/638962807a26b9c04c4e5350478912afc6c14bc3))
* IndexedDBによるハイスコアの保存機能を追加 ([d14d48b](https://github.com/junpeimay-wq/games/commit/d14d48bdfe8c951bf3b4c80deb3d497d9a2264a2))
* ゲーム一覧ページとサムネイル追加 ([aca749f](https://github.com/junpeimay-wq/games/commit/aca749f1bd053cf51e5cf7d4080c67618462002b))
* スマホ・タブレット対応（スワイプ＋方向ボタン） ([bed34cb](https://github.com/junpeimay-wq/games/commit/bed34cbae423fabbd7aa207a0f3d02df8c0c8057))
* ドラッグ＆ドロップ操作、回転機能、中心基準配置、1x1ブロック廃止の追加およびADR-0003追加 ([cfa014d](https://github.com/junpeimay-wq/games/commit/cfa014dc3a1571d7141300bac1567312ec8049fa))
* 上書き可能回数を1回に変更およびADR-0003追加 ([fad2088](https://github.com/junpeimay-wq/games/commit/fad208854053ebe46f7e173e4ccaa3a1430e825b))
* 候補スロット内直接タップ回転とドラッグ＆ドロップ配置の分離追加およびADR-0004追加 ([bfb44d1](https://github.com/junpeimay-wq/games/commit/bfb44d1d581a789873f25e5f5a6f360a48302565))
* 全ページにGoogle Analytics (GA4) タグ (G-FDT7JTRCNE) を導入およびADR-0005追加 ([6c85aa3](https://github.com/junpeimay-wq/games/commit/6c85aa3047a33e880c26fb6c68e055089545b7bc))
* 地図記号クイズとリリース自動化を追加 ([#6](https://github.com/junpeimay-wq/games/issues/6)) ([703e0c2](https://github.com/junpeimay-wq/games/commit/703e0c2f71fcac5d73ee1d682732986e321923a6))
* 戦略的〇×ゲーム（上書きルール追加）の新規開発とADR-0001追加 ([5531583](https://github.com/junpeimay-wq/games/commit/553158372572cc4921adfb983bdbfc0c97c07203))


### Bug Fixes

* CPUの序盤における無意味な初手上書きの回避と温存アルゴリズム追加およびADR-0005追加 ([0227559](https://github.com/junpeimay-wq/games/commit/0227559ec445aa8791b847e054efe15385b49fe7))
* snakeをサブモジュールから通常ファイルに変更 ([a88e1a3](https://github.com/junpeimay-wq/games/commit/a88e1a363d846eadf33f51e78810a5eb86148375))
* ブロックが盤面からはみ出す際の警告・配置キャンセル処理の追加およびADR-0002追加 ([46287ca](https://github.com/junpeimay-wq/games/commit/46287cac8c860352504b4c4e6a7ee2a02c184503))
* 上書き勝利を含むリーチ検出機能をCPU AIに追加およびADR-0004追加 ([96f48e3](https://github.com/junpeimay-wq/games/commit/96f48e3cdaa50f604d237685bd5718a7fb2de4aa))

## Changelog

Notable changes to this project are recorded here. Entries and version numbers are maintained by Release Please.
