# 🏆 Firebase Global Ranking - セットアップガイド

このディレクトリは **Firebase Authentication + Firestore** を使ったグローバルランキング機能のデモです。

## 前提

- Google アカウント
- GitHubリポジトリ（GitHub Pages で公開済み）

---

## ステップ1: Firebase プロジェクトの作成

1. [Firebase Console](https://console.firebase.google.com/) を開く
2. **「プロジェクトを作成」** をクリック
3. プロジェクト名を入力（例: `junpeimay-games`）
4. Google アナリティクスは任意（既存のアカウントに接続可）
5. **「プロジェクトを作成」** → 完了後「続行」

---

## ステップ2: ウェブアプリを登録して `firebaseConfig` を取得

1. プロジェクトのトップ画面で **`</>`（ウェブ）** アイコンをクリック
2. アプリのニックネームを入力（例: `games-arcade`）
3. 「Firebase Hosting も設定する」は **チェックしない**
4. **「アプリを登録」** をクリック
5. 表示される `firebaseConfig` の内容を **`firebase-config.js`** に貼り付ける

```js
// firebase-config.js のこの部分を書き換える
const firebaseConfig = {
  apiKey:            "取得したAPIキー",
  authDomain:        "your-project.firebaseapp.com",
  projectId:         "your-project-id",
  storageBucket:     "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123:web:abc123"
};
```

---

## ステップ3: Google 認証を有効化

1. Firebase Console 左メニュー **「Authentication」** を開く
2. **「始める」** をクリック
3. **「Sign-in method」** タブ → **「Google」** を選択
4. **「有効にする」** トグルをオンにし、プロジェクトのサポートメールを入力
5. **「保存」**

### 承認済みドメインの追加（GitHub Pages 用）

1. 「Authentication」→ **「設定」** タブを開く
2. **「承認済みドメイン」** セクション → **「ドメインを追加」**
3. `junpeimay-wq.github.io` を入力して追加

---

## ステップ4: Firestore データベースを作成

1. Firebase Console 左メニュー **「Firestore Database」** を開く
2. **「データベースを作成」** をクリック
3. **「本番環境で開始」** または **「テストモードで開始」** を選択
   - まずはテストモード（30日間は誰でも読み書き可能）でOK
4. ロケーションは **`asia-northeast1`**（東京）を選択
5. **「有効にする」**

### Firestore セキュリティルール（推奨）

Firestore Console の **「ルール」** タブで以下を設定：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /scores/{docId} {
      // 読み取りは全員OK
      allow read: always;
      // 書き込みはログイン済みユーザーが自分のUIDで投稿する場合のみ
      allow create: if request.auth != null
                    && request.resource.data.uid == request.auth.uid
                    && request.resource.data.score is number
                    && request.resource.data.score >= 0;
    }
  }
}
```

---

## ステップ5: 動作確認

```bash
# ローカルサーバーで起動（file:// では Firebase Auth が動作しません）
cd ~/games && python3 -m http.server 8080
```

ブラウザで `http://localhost:8080/firebase-demo/` を開く。

---

## ステップ6: GitHub へ push して公開

```bash
cd ~/games
git add .
git commit -m "feat: Firebaseグローバルランキング機能の追加"
git push
```

公開URL: `https://junpeimay-wq.github.io/games/firebase-demo/`

---

## Firestore データ構造

```
scores（コレクション）
  └─ {自動ID}
       ├─ uid:       string    ユーザーID（Firebase Auth UID）
       ├─ name:      string    表示名（Googleアカウント名）
       ├─ photoURL:  string    アバター画像URL
       ├─ game:      string    ゲーム識別子 (snake / tictactoe / block-puzzle)
       ├─ score:     number    スコア
       └─ createdAt: timestamp 送信日時
```

---

## トラブルシューティング

| エラー | 原因 | 対処 |
|--------|------|------|
| `auth/unauthorized-domain` | 承認済みドメイン未追加 | ステップ3の承認済みドメインを確認 |
| `Missing or insufficient permissions` | Firestoreルールが厳しい | ステップ4のルールを確認 |
| `Cannot use import` | `file://` で開いている | `python3 -m http.server 8080` を使う |
