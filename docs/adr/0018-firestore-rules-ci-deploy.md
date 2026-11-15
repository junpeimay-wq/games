# ADR-0018: FirestoreルールとインデックスはCIでデプロイする

## ステータス
承認済み

## 日付
2026-11-15

## コンテキスト
Firebase Hosting は GitHub Actions で main へのマージ時に自動デプロイされる一方、Firestore のセキュリティルール（`firebase-demo/firestore.rules`）とインデックス（`firebase-demo/firestore.indexes.json`）はデプロイ経路がなく、手動で反映する運用だった。

レトロ格闘ファイトを追加した際（PR #34）、リポジトリのルールの `validScore` には `retro-fight` を追加したが、本番ルールへは反映されなかった。その結果、本番ではレトロ格闘ファイトのスコア記録がすべて `Missing or insufficient permissions` で失敗していた（2026-11-15 に発覚）。他のゲームの記録は正常であり、本番の scores コレクションにレトロ格闘ファイトのドキュメントは1件も存在しなかった。

ルールはコードとしてリポジトリで管理されているのに、デプロイ経路だけが手動だったため、変更の反映漏れが「新ゲームの記録だけ静かに失敗する」という形で表面化した。

## 決定
- Firestore ルールとインデックスは、GitHub Actions の専用ワークフロー（`.github/workflows/firestore-rules-deploy.yml`）で CI デプロイする。Hosting の既存ワークフローには手を入れない。
- トリガーは、main への push で `firebase-demo/firestore.rules` または `firebase-demo/firestore.indexes.json` が変更された場合とする。手動実行（workflow_dispatch）も可能にする。
- デプロイの前に、firebase-demo のテストスイート（`npm ci && npm test`、Firestore エミュレータによるルールテストを含む）を必須のゲートとし、テストが失敗した場合はデプロイを実行しない。これは AGENTS.md と ADR-0002 の「ルール変更は firebase-demo のテストで検証する」方針を CI で強制するものである。
- デプロイには Hosting で使っている既存のシークレット `FIREBASE_SERVICE_ACCOUNT_JUNPEIMAY_GAMES` を流用し、`firebase deploy --only firestore:rules,firestore:indexes` を実行する。

## 理由
- ルールとインデックスの反映漏れを構造的に防げる。ルールを変更する PR がマージされれば、テスト合格後に本番へ自動で届く。
- テストをゲートにすることで、壊れたルールや意図しない権限緩和が本番へ出るリスクを、デプロイ自動化と引き換えに増やさずに済む。

## トレードオフ
- ルール変更のたびにエミュレータテストの実行時間だけデプロイが遅くなる。即時反映が必要な緊急時も同じ経路を通るため、その場合は手動デプロイという従来の手段を併用する。
- サービスアカウントには Firestore ルールとインデックスのデプロイ権限が必要である。不足している場合はワークフローのデプロイステップが失敗するため、その時点で権限追加が要ることが分かる。
- このワークフローのマージ自体はトリガー対象ファイルを変更しないため、本番ルールの初回同期には workflow_dispatch による手動実行が1回必要である。

## 関連
- ADR-0012（Firebase Hosting 自動デプロイ）、ADR-0002（認証・DB の開発ワークフロー）。
- `firebase-demo/firestore.rules`、`firebase-demo/firestore.indexes.json`、`.github/workflows/firestore-rules-deploy.yml`。
- 発覚のきっかけとなった PR #34（レトロ格闘ファイト追加）。
