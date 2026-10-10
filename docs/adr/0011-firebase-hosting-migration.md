# ADR-0011: GitHub Pages から Firebase Hosting への移行

## ステータス

承認済み・実装済み

## 日付

2026-10-10

## コンテキスト

これまで静的ホスティングとして GitHub Pages を利用してきた。しかし、Search Console 等における `Content-Type` ヘッダー制御やキャッシュ制御、リダイレクト設定を行えない制約があった。また、すでに Firebase (Authentication / Firestore / GA4) を運用しており、インフラ管理を一元化するニーズがある。

## 決定

- Web サイトのホスティング先を GitHub Pages から Firebase Hosting (`junpeimay-games.web.app` / `junpeimay-games.firebaseapp.com`) へ移行する。
- リポジトリルートに `firebase.json` を配置し、`hosting` 設定を統一管理する。
- `sitemap.xml` に対して `Content-Type: application/xml; charset=utf-8` を明示的に返すヘッダールールを設定する。
- ルートの `firebase.json` で公開対象とレスポンスヘッダーを管理し、GitHub Actionsを用いてデプロイを自動化・管理する。

## 実装チェック

- [x] ルートに `firebase.json` を配置し、Firebase Hostingの公開対象を設定する。
- [x] `sitemap.xml` に `Content-Type: application/xml; charset=utf-8` を返すヘッダールールを設定する。
- [x] `main` へのPushでFirebase HostingへデプロイするGitHub Actionsを追加する。
- [x] 公開ページのcanonical、README、Jekyll設定をFirebase HostingのURLへ更新する。

## 理由

- レスポンスヘッダー (`Content-Type`, `Cache-Control` 等) を細かくカスタマイズでき、Search Console の誤判定問題を解決できる。
- 既存の Firebase Authentication / Firestore と同じプロジェクト (`junpeimay-games`) でホスティングを一元管理できる。
- 無料枠 (Spark プラン) 内で十分な帯域とストレージが提供される。

## トレードオフ

- GitHub Pages の自動公開フックとは別に、Firebase へのデプロイフロー (CLI または GH Actions) を維持・管理する必要がある。
- ドメイン URL が `.github.io` から `.web.app` / `.firebaseapp.com` (または設定したカスタムドメイン) へ変わるため、外部リンクや Search Console の所有権設定・リダイレクトに配慮が必要。
