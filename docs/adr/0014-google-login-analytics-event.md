# ADR-0014: Googleログイン成功イベントの計測

## ステータス
承認済み・実装済み

## 日付
2026-10-17

## コンテキスト
Google AdsとGA4を連携してゲーム利用者の獲得状況を計測するため、Googleログインが成功したタイミングをGA4イベントとして記録する必要がある。既存のFirebase AuthenticationによるGoogleログイン処理は、ランキングページとスコア記録時の認証処理に分かれている。

## 決定
- Firebase Analytics SDKを既存のFirebaseアプリ初期化に追加する。
- Firebase設定に既存のGA4 Measurement ID `G-FDT7JTRCNE`を明示する。
- Googleログイン成功後に、カスタムイベント`google_login`を送信する。
- イベントにはメールアドレスやUIDなどの個人情報をパラメータとして含めない。
- ログイン失敗時やキャンセル時にはイベントを送信しない。
- Analyticsが利用できない環境や初期化失敗時も、ランキングやアバター表示など本体機能は継続する。

## 理由
- GoogleログインをGA4のキーイベントとしてGoogle Adsのコンバージョンに利用できる。
- 既存のFirebase Authentication処理と同じ成功地点で計測するため、実際に認証が完了した操作だけを記録できる。
- 個人情報をイベントパラメータに含めず、計測に必要な最小限のデータにする。
- Analyticsの障害やブラウザ制限でゲーム・ランキング本体を停止させないため、計測機能を任意依存として扱う。

## 実装チェック
- [x] `firebase-demo/firebase-config.js`でFirebase Analyticsを初期化する。
- [x] Firebase設定に`G-FDT7JTRCNE`のMeasurement IDを追加する。
- [x] ランキングページのGoogleログイン成功後に`google_login`を送信する。
- [x] スコア記録時のGoogle認証成功後に`google_login`を送信する。
- [x] Analytics初期化失敗時もランキング処理を継続する。
- [x] 既存テスト（23件）が成功することを確認する。
