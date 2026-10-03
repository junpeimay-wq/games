# ADR-0001: グローバルランキング基盤としてのFirebase (Auth + Firestore) 採用

## ステータス
承認済み

## 日付
2026-10-03

## コンテキスト
各ゲームのハイスコアはIndexedDBによるローカル保存のみであり、端末をまたいだスコア共有やグローバルランキングが実現できていなかった。

## 決定
- **認証**: Firebase Authentication（Googleログイン）を採用
- **DB**: Firebase Firestore（`scores` コレクション）を採用
- **SDK読み込み**: ビルドツールなし・CDN経由のES Modules（`<script type="module">`）
- **ホスティング**: GitHub Pages（git push で自動公開）をそのまま継続

### ファイル構成
| ファイル | 役割 |
|---------|------|
| `firebase-config.js` | Firebase初期化・`auth`/`db` のexport |
| `game.js` | UI操作・認証・Firestore読み書き |
| `index.html` | エントリーポイント（`type="module"` でgame.jsをimport） |
| `style.css` | デザイン |

### Firestoreデータ構造
```
scores（コレクション）
  └─ {docId}
       ├─ uid:       string  (ユーザーID)
       ├─ name:      string  (表示名)
       ├─ photoURL:  string  (アバターURL)
       ├─ game:      string  (ゲーム識別子)
       ├─ score:     number  (スコア)
       └─ createdAt: timestamp
```

## 理由
- GitHub Pages + Firebase の組み合わせはサーバーレスでコスト0（Spark無料枠内）
- CDN ES Modulesによりnpm/バンドラー不要でシンプルな構成を維持できる
- Google認証により匿名スパム投稿を防ぎつつ、Googleアカウントで手軽にログインできる

## トレードオフ
- firebaseConfigのAPIキーがフロントに公開される（Firestoreセキュリティルールで対策）
- ローカルでの `file://` プロトコルでの直接開きではCORSエラーが発生するため、ローカルHTTPサーバーが必要
