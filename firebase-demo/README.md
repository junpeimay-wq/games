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
3. **「本番環境で開始」** を選択
4. ロケーションは **`asia-northeast1`**（東京）を選択
5. **「有効にする」**

### Firestore セキュリティルール（推奨）

ルールの正本は [`firestore.rules`](firestore.rules) です。Firebase Console の **「ルール」** タブにその内容を設定するか、Firebase CLIでデプロイしてください。

```bash
cd ~/games/firebase-demo
npx firebase-tools login
npx firebase-tools deploy --only firestore --project YOUR_PROJECT_ID
```

Firestore Emulatorで許可・拒否のテストを実行できます（Node.js 22以上、npm、Javaが必要です）。

```bash
cd ~/games/firebase-demo
npm ci
npm test
```

このルールは公開読み取りを許可し、認証済みユーザー自身のゲーム別スコア文書について、初回登録と許可された更新だけを許可します。データ形式・ゲーム識別子（`snake` / `tictactoe` / `block-puzzle` / `terrain-quest`）・スコア・サーバー時刻を検証します。地図記号クイズはユーザーごとに1文書（`users/{uid}/mapSymbolProgress/progress`）を作り、その `symbols` マップに地図記号の種類ごとの回答数・正解数・習得状態を集約します。`lastUpdatedSymbol` により、1回の回答で更新できる記号種別は1つに制限され、回答数・正解数の進行もルールで検証されます。施設や地図上の地点ごとには記録せず、本人だけが読み書きできます。クイズ回答はスコア文書と合わせてトランザクションで記録されます。ブラウザーから送信される回答自体の正当性までは検証できないため、不正スコアも防ぎたい場合は、信頼できるサーバー側で回答を検証してください。未認証時の学習記録とスコアは端末の `localStorage` に保存されます。

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
  └─ {game}_{Firebase Auth UID}
       ├─ uid:       string    ユーザーID（Firebase Auth UID）
       ├─ name:      string    表示名（Googleアカウント名）
       ├─ photoURL:  string    アバター画像URL
       ├─ game:      string    ゲーム識別子 (snake / tictactoe / block-puzzle / terrain-quest)
       ├─ score:     number    スコア
       └─ updatedAt: timestamp ハイスコア更新日時
```

ゲームがハイスコアを更新した場合にのみ、ゲーム本編から自動送信します。認証前のユーザーには保存確認とGoogle認証を案内し、認証済みなら確認なしで記録します。Googleプロフィール画像はランキングのサムネイルに表示します。採点基準が異なるためランキングはゲーム別で表示し、全ゲーム合計は作成しません。

ランキングページ: [`../ranking/`](../ranking/index.html)（ゲームごとのTop 3）、各ゲーム専用ページはTop 10を表示します。

---

## トラブルシューティング

| エラー | 原因 | 対処 |
|--------|------|------|
| `auth/unauthorized-domain` | 承認済みドメイン未追加 | ステップ3の承認済みドメインを確認 |
| `Missing or insufficient permissions` | Firestoreルールが厳しい | ステップ4のルールを確認 |
| `Cannot use import` | `file://` で開いている | `python3 -m http.server 8080` を使う |
