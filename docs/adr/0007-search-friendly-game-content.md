# ADR-0007: 検索向けのゲーム説明とページメタデータ

## ステータス
承認済み

## 日付
2026-10-04

## コンテキスト
Google検索でサイトが表示され始めたが、トップページのスニペットにはカード内の短い説明が並び、ゲーム個別ページには説明文や遊び方が不足していた。Firebaseデモは開発・ランキング確認用であり、一般向け検索最適化の対象ではない。

## 決定
- トップページと公開する各ゲーム・ランキングページに、ページの固有内容を正確に要約した日本語の `meta description` と絶対URLのcanonicalを設定する。
- トップとゲームのHTMLに、主要コンテンツが分かる `main` ランドマークと論理的な見出しを用いる。
- ゲーム個別ページには、実際のルール・操作方法・スコア条件を説明する、利用者にも見える独自の遊び方ガイドを掲載する。ランキングページはランキングの対象と採点基準を説明する。
- Firebaseデモはこの改善の検索対象から除外し、既存のサイトマップにも追加しない。ADRなど開発文書も一般向けページに含めない。
- Google向けの特殊なAI専用ファイルやマークアップは追加しない。クロール・インデックス・検索結果のスニペット表示や生成AI掲載はGoogleが判断し、変更によって保証されるものではない。

## 理由
- ページ固有の説明と本文を提供し、検索利用者と自動システムが各ページの内容・違いを理解しやすくする。
- meta descriptionは検索スニペットに採用される場合がある一方、Googleは検索語に応じてページ本文から別のスニペットを生成するため、本文自体にも有用な情報を掲載する。
- 既存のサイトマップに列挙された公開URLに範囲を限定し、開発用ページの露出を避ける。

## トレードオフ
- ルールや操作が変わった場合、表示上の遊び方ガイドとページ説明の更新が必要になる。
- canonicalは重複URLの正規化を示すヒントであり、検索エンジンが必ず指定URLを採用するとは限らない。
- 検索順位、スニペット、AI Overviewなどへの掲載は制御または保証できない。

## 参考
- [Google Search Central: Control your snippets in search results](https://developers.google.com/search/docs/appearance/snippet)
- [Google Search Central: SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Google Search Central: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
