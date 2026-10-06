# リリースとバージョン管理

このリポジトリは [Release Please](https://github.com/googleapis/release-please) と Conventional Commits を使い、GitHub Release と変更履歴を管理します。

## リリースの流れ

1. PRタイトルは `feat: 地図記号を追加` や `fix: スコア保存を修正` のような Conventional Commits 形式にします。破壊的変更は `feat!:` または `BREAKING CHANGE:` で示します。
2. PRを `main` に squash merge します。PRタイトルが squash commit message として使われるようにしてください。
3. `main` へのpushでRelease Pleaseが変更を集計し、バージョンと `CHANGELOG.md` を更新するRelease PRを作成または更新します。
4. Release PRを確認してマージします。Release PleaseがSemVerタグを作成し、そのタグに対応するGitHub Releaseとリリースノートを公開します。

`feat` はminor、`fix` はpatch、破壊的変更はmajorのバージョン更新になります。リリース前の変更はRelease PRにまとめられ、通常の機能PRをマージしただけでは即時公開されません。

## バージョンの管理場所

- `.release-please-manifest.json` は現在のバージョンを保持します。Release PleaseがRelease PRで更新するため、手作業で更新しません。
- `CHANGELOG.md` は公開済みリリースの変更履歴です。
- GitHub Releaseのタグがリリース済みバージョンを識別します。

初期バージョンは `0.1.0` です。初回導入後に作成するPRからConventional Commits形式を適用してください。

## GitHub設定

GitHubリポジトリ設定の **Settings → Actions → General → Workflow permissions** で、ActionsがPull Requestを作成できるようにしてください。Release Please workflowは `GITHUB_TOKEN` に `contents: write`、`pull-requests: write`、`issues: write` を付与します。
