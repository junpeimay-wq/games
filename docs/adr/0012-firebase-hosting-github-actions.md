# ADR-0012: Firebase Hosting 自動デプロイと旧ユーザーサイトリポジトリの廃止

## ステータス

承認済み

## 日付

2026-10-10

## コンテキスト

[ADR-0011](0011-firebase-hosting-migration.md) により、ホスティング先を GitHub Pages から Firebase Hosting (`https://junpeimay-games.web.app`) へ移行した。これに伴い、`main` ブランチへの Push 時に Firebase Hosting へ自動デプロイする CI/CD ワークフローを構築する必要がある。また、旧ホストルート管理用リポジトリ `junpeimay-wq.github.io` は不要となった。

## 決定

- `.github/workflows/firebase-hosting-deploy.yml` を作成し、`main` ブランチへの Push 時に `FirebaseExtended/action-hosting-deploy` を用いて Firebase Hosting へ自動デプロイする。
- デプロイに必要なサービスアカウントキーは GitHub リポジトリの Secret `FIREBASE_SERVICE_ACCOUNT_JUNPEIMAY_GAMES` として設定・管理する。
- GitHub Pages 前提の管理用リポジトリ `junpeimay-wq.github.io` は廃止対象とする。

## 理由

- `main` ブランチへの修正が自動的に Firebase Hosting に即時反映されるため、手動デプロイの手間や漏れを防止できる。
- GitHub Pages を使用しなくなったため、補助リポジトリ `junpeimay-wq.github.io` を維持・管理する必要がなくなる。

## トレードオフ

- デプロイを有効化するには、GitHub リポジトリの Secret 設定 `FIREBASE_SERVICE_ACCOUNT_JUNPEIMAY_GAMES` が必要となる。
