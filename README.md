# 🎮 Game Arcade

ブラウザで動くミニゲーム集です。

🌐 **公開URL**: https://junpeimay-games.web.app/

## ゲーム一覧

| ゲーム | 説明 | プレイ |
|--------|------|--------|
| 🐍 スネーク | 食べ物を食べて長くなれ！ | [遊ぶ](https://junpeimay-games.web.app/snake/) |
| ⭕ 戦略的〇×ゲーム | 相手の駒を1回だけ上書きできる思考型マルバツゲーム | [遊ぶ](https://junpeimay-games.web.app/tictactoe/) |
| 🧩 8x8ブロックパズル | ブロックを配置して縦横ライン消去！同時消しボーナス付き | [遊ぶ](https://junpeimay-games.web.app/block-puzzle/) |
| 🗺️ まちの地図記号クイズ | 地図上の記号を選び、4択で意味を学ぶ。正解記号ごとに100点、既知の記号は10点 | [遊ぶ](https://junpeimay-games.web.app/terrain-quest/) |

## 操作方法

- **キーボード**: 矢印キー / WASD / クリック
- **スマホ・タブレット**: タッチ / スワイプ / 方向ボタン / タップ

## 技術スタック

- HTML / CSS / JavaScript（ライブラリなし）
- Canvas API / DOM API / IndexedDB
- Firebase Hosting でホスティング

## リリース・バージョン

PRはConventional Commits形式のタイトル（`feat:` / `fix:` など）にし、squash mergeしてください。`main` へのマージ後、Release Pleaseが変更内容からバージョンと `CHANGELOG.md` を更新するRelease PRを作ります。そのRelease PRをマージすると、バージョンタグとGitHub Releaseが作成されます。詳細は [`docs/releasing.md`](docs/releasing.md) を参照してください。

## ライセンス

[MIT License](LICENSE)
