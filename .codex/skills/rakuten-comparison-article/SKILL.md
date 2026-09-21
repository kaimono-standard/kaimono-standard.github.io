---
name: rakuten-comparison-article
description: 買いもの標準（D:\ラクヨコ）に「○○5機種を比較」型の楽天市場・商品比較記事を1本追加する、Codex 単独で完走するための手順。「○○の比較記事を書いて」「記事を増やしたい」「新しいカテゴリを追加」「ケトル記事と同じ形式で」と言われたとき、商品ジャンル名だけを投げられたとき、既存記事の製品差し替えを頼まれたときに使う。メーカー公式仕様の裏取り → 楽天の商品リンク取得（Chrome または楽天ウェブサービスAPI） → 台帳からの執筆 → 事実照合 → サイトへの配線 → ビルドまでを、Claude と同じ品質基準で行う。
---

# 楽天市場 商品比較記事の追加（Codex 単独版）

Claude 版スキル（`.claude/skills/rakuten-comparison-article/`）と**同じルール・同じスクリプト・同じ完成例**を使う。違いは「調べる・リンクを取る・書く・照合する」を全部 Codex 自身がやること。参照ファイルとスクリプトは Claude 版のディレクトリにあるものをそのまま使う（二重管理しない）。

```
SKILL = .claude/skills/rakuten-comparison-article
  references/fact-sheet.md        台帳 facts.json の項目と記入例（最初に読む）
  references/editorial-rules.md   記事の構成・文体・禁則（執筆前に読む）
  references/affiliate-console.md 楽天の商品リンク取得（Chrome 管理画面 と API 代替）
  references/wiring.md            配線先ファイルの一覧
  assets/exemplar.tpl.html        完成例（この構成・クラス名を踏襲する）
  assets/example-facts.json       台帳の完成形
  scripts/fetch-page.mjs          公式ページを本文テキストで読む
  scripts/rakuten-api.mjs         楽天ウェブサービスAPIで商品リンクを取る（Chrome が無いとき）
  scripts/merge-links.mjs         links.tsv → facts.json
  scripts/codex-draft.mjs         執筆プロンプト生成（--prompt-only）／下書き整形（--finalize）
  scripts/wire.mjs                配線（記事HTML・config・sitemap・build・検索索引・記事一覧・更新履歴）
  scripts/codex-factcheck.mjs     事実照合プロンプト生成（--prompt-only）／結果表示（--report）
  scripts/verify.mjs              機械検証（--online で画像・商品URLの到達性も）
```

このサイトの収益は楽天市場とAmazonの商品リンクからしか発生しない。だから **5製品すべてに計測付きリンク（楽天＋Amazon）** が付いていて、**記事の数値が全部メーカー公式で裏取りされている** ことが完成条件。どちらか欠けたら未完成。

## 0. 始める前に

- 作業ディレクトリは `_drafts/<slug>/`（gitignore 済み）。slug は `oven-toaster-comparison` のような英語ケバブケース＋`-comparison`
- 既存記事と被らないか `ls *-comparison.html` で確認する。近いジャンルがあるときは範囲をずらす（例：「全自動コーヒーメーカー」が既にあるので「全自動コーヒーマシン」はエスプレッソ系に限定した）
- `references/fact-sheet.md` と `references/editorial-rules.md` を最初に読む。editorial-rules の禁則（実機レビュー風の表現、台帳に無い数値、「楽天アフィリエイト」という語、「結論：」型の見出し）は記事の信用に直結する
- Web 検索は Codex の検索機能で行い、ページの中身は `fetch-page.mjs` で読む。JS 描画や 403 のページは Codex のブラウザ機能（Chrome）で開く

## 1. 企画：5製品を決める

基準は Claude 版と同じ：

- **現行品**（メーカー公式の製品一覧にある）で、楽天市場に複数店舗の新品がある
- **用途の軸が5つばらける**（例：ケーブル内蔵／薄型高出力／ワイヤレス／残量表示／価格）。同じ軸を2つ入れない
- **ブランドが被らない**。どうしても4ブランドしか現行流通がない場合だけ重複を許し、報告で明記する
- **価格帯が広い**（上下で3倍前後）
- 楽天で流通が薄い製品（部品・中古ばかり、販売店1店）は外す

決めたら `_drafts/<slug>/facts.json` を `assets/example-facts.json` の形で作り、まず `topic / scope / category_label / date / audience_axes / table_columns / buying_points / keywords / related / products[].{key,anchor,brand,name,model,pick_reason,official_url}` を埋める。`key` は `<ジャンル><ブランド>` のキャメルケースでサイト内一意（`config.js` の既存キーと被らないこと）。

## 2. 仕様の裏取り（メーカー公式だけ）

```bash
node .claude/skills/rakuten-comparison-article/scripts/fetch-page.mjs "<公式製品ページURL>" --grep "仕様|サイズ|重量|質量|消費電力|容量"
node .claude/skills/rakuten-comparison-article/scripts/fetch-page.mjs "<URL>" --raw --grep "<table"   # 仕様表が table のとき
```

- 公式ページの数値を **表記そのまま**（単位・小数点・「約」）で `specs` に写す。`table_columns` と同名のキーは比較表に入る
- 公式サイトで取れない値は、メーカー公式オンラインストア（楽天の公式店ページ含む）で確認してもよい。その場合は `table_footnote` か `caution_hint` に「○○公式楽天市場店の記載」と書く
- 小売サイト・比較サイト・検索エンジンの要約は出典にしない。そこでしか見つからない値は `unverified` に入れて記事では「記載なし」扱い
- 発売時期はメーカーのプレスリリース／新着情報で確認できたときだけ `release` に書く
- 公式サイトが 403 や JS 描画で読めないときは Codex のブラウザで開いて本文を読む（`get text` 相当）。それでも無理なら公式ストアで代替
- 最上級（最軽量・最大など）は表の数値から一意に導けるときだけ `caution_hint` に書く。同値があれば「○○と並んで」

## 3. 楽天の商品リンクを取る

**A. Chrome（管理画面）が使えるとき** — `references/affiliate-console.md` の手順そのまま。Codex のブラウザ機能で `https://affiliate.rakuten.co.jp/` を開き、ログイン済みを確認してから、同ファイルの「ヘルパー登録」JS をページで実行し、製品ごとに `await window.__search('...')` → `await window.__pick(i)` を評価する。出力（タブ区切り1行）を `links.tsv` に追記する。JS の評価ができない場合は B へ。

**B. 楽天ウェブサービスAPI** — `.env` に `RAKUTEN_APP_ID` と `RAKUTEN_AFFILIATE_ID` が要る（未設定ならユーザーに用意を頼む。手順は affiliate-console.md 末尾）。

```bash
node .claude/skills/rakuten-comparison-article/scripts/rakuten-api.mjs search "<型番 ブランド>" --hits 12
node .claude/skills/rakuten-comparison-article/scripts/rakuten-api.mjs pick "<itemCode>" --key <key> --dir _drafts/<slug>
```

店舗の優先順位：メーカー公式楽天市場店 → 大手家電量販店 → 送料込みで価格が中央値付近の店。中古・アウトレット・ふるさと納税・部品は除外。`「〜円～」` の選択式（色・容量）や期間限定セール価格は `caution_hint` に書く（例：「掲載時の3,190円は公式店の期間限定セール価格（公式価格3,990円）」）。

5製品そろったら取り込む：

```bash
node .claude/skills/rakuten-comparison-article/scripts/merge-links.mjs _drafts/<slug>
```

新しい公式店を使ったら `scripts/lib.mjs` の `OFFICIAL_SHOPS` に shopCode を追加する（ボタン文言「○○公式楽天市場店で見る」に効く）。

## 3b. Amazon リンク

各製品に「Amazonで見る」ボタンも付く（`wire.mjs` が `facts.json` の `amazon` から `config.js` の `amazonLinks` に登録。アソシエイトIDは `lib.mjs` の `AMAZON_TAG`）。

- `facts.json` の各製品に `"amazon": { "query": "ブランド 製品名 型番" }` を入れる。検索結果の先頭にその製品が出る語にする（既定は brand＋model だが、無印良品のように型番が弱い製品は必ず query を書く）
- 商品ページ直リンクにしたいときだけ、Amazon の検索結果（ブラウザか `fetch-page.mjs "https://www.amazon.co.jp/s?k=<型番>" --grep "data-asin"`）で正規型番と一致する出品の ASIN を確認して `"asin"` に入れる。スポンサー枠・並行輸入・中古・セット品・Amazon限定型番（`…AM` `…AZ`）は使わない
- Amazon の価格・在庫は記事に書かない

## 4. 執筆（Codex 自身が書く）

```bash
node .claude/skills/rakuten-comparison-article/scripts/codex-draft.mjs _drafts/<slug> --prompt-only
```

`_drafts/<slug>/draft-prompt.txt` に、編集ルール・完成例・台帳・追加指示がまとまる。**これを読み、そのプロンプトの指示通りに `_drafts/<slug>/article.tpl.html` を書く**。守ること：

- 構成・クラス名・プレースホルダ（`{{IMG:key}}` `{{ITEM:key}}` `{{PRICE:key}}` `{{IMGRAW:先頭製品のkey}}`）は完成例と同一。リンクや画像URLは自分で書かない
- 台帳にある事実だけを書く。unverified は「公式仕様に記載はありません」か触れない
- 「結論：」のような要約ラベル＋コロンの見出しは使わない（見出しは「使い方から選ぶと、この5機種」）
- 「楽天アフィリエイト」という語を使わない。広告表記は完成例の2文（楽天市場とAmazonの商品リンク／Amazonアソシエイトの表記文）をそのまま使う
- 各製品ブロックの楽天ボタンの直後に `{{AMAZON:key}}` を data-fallback にした「Amazonで見る」ボタンを置く（完成例と同じ）
- 製品ブロック・比較表・結論・出典はすべて5つで、順番は台帳の `products` の順
- 「5機種」「5製品」は topic に合わせる（スーツケースなら「5製品」）

書いたら整形と簡易検査：

```bash
node .claude/skills/rakuten-comparison-article/scripts/codex-draft.mjs _drafts/<slug> --finalize
```

「製品ブロック 5 / 出典リンク 5 / プレースホルダ 30」になっていること。

## 5. 配線

```bash
node .claude/skills/rakuten-comparison-article/scripts/wire.mjs _drafts/<slug>
```

`<slug>.html`、`config.js`、`build.mjs`、`sitemap.xml`、`search-index.js`、`articles.html`（カード）、`sources.html`（変更履歴）に冪等で登録される。終わったら `articles.html` の「公開記事 N本」を手で +1 し、「最終確認」の日付を更新する。`index.html` の「編集部の新着」は頼まれたときだけ差し替える（featured を新記事にし、古いカードを1枚落とす）。

## 6. 事実照合

Codex の中から `codex exec` を呼べるなら、Claude 版と同じ：

```bash
node .claude/skills/rakuten-comparison-article/scripts/codex-factcheck.mjs _drafts/<slug>
```

呼べない（失敗する・固まる）ときは自分で照合する：

```bash
node .claude/skills/rakuten-comparison-article/scripts/codex-factcheck.mjs _drafts/<slug> --prompt-only
```

`factcheck-prompt.txt` の判定基準に従って、`<slug>.html` の本文の主張を 1文ずつ `facts.json` と突き合わせ、`factcheck-schema.json` の形式で `_drafts/<slug>/factcheck.json` に書く（`{"issues":[{"quote","reason","severity","suggestion"}],"summary"}`）。自分の文章なので甘くなりやすい——**数値・時期・最上級・unverified の断定** だけを機械的に探す。それから：

```bash
node .claude/skills/rakuten-comparison-article/scripts/codex-factcheck.mjs _drafts/<slug> --report
```

指摘は1件ずつ、台帳で裏付けられるなら台帳を直し、裏付けられないなら記事の表現を弱めるか削る（`<slug>.html` と `article.tpl.html` の両方を直す）。指摘ゼロになるまで繰り返す。

## 7. 機械検証とビルド

```bash
node .claude/skills/rakuten-comparison-article/scripts/verify.mjs <slug> --online
npm run check
```

ビルド（bash）：
```bash
SITE_URL=https://kaimono-standard.echoant.com CONTACT_URL=https://github.com/kaimono-standard/kaimono-standard.github.io/issues npm run build
```
ビルド（PowerShell）：
```powershell
$env:SITE_URL="https://kaimono-standard.echoant.com"; $env:CONTACT_URL="https://github.com/kaimono-standard/kaimono-standard.github.io/issues"; npm run build
```

`verify.mjs` が出す最上級表現の一覧は、比較表の数値と目で照らす。`--online` で画像5点と商品ページ5本が 200/206 になること（Chrome の代わり）。`dist/<slug>.html` に `{{` が残っていないことも見る。

## 8. 報告（コミットは頼まれたときだけ）

短く伝える：記事URL（`https://kaimono-standard.echoant.com/<slug>.html`）、5製品と選定理由と掲載時価格、公式で裏取りできなかった項目とその扱い、価格の確認日、配線したファイル一覧。コミット・プッシュは頼まれたときだけ。プッシュしたら `gh run watch` でデプロイ完了を待ち、本番URLが 200 を返すのを `curl` で確認してから報告する。コミットメッセージは `feat: add <topic> comparison (5 models)` の形。

## やってはいけないこと

- 実機レビュー風の表現（「使ってみると」「静か」「おいしい」）
- 台帳にない数値を書く。読者は数値を信じて買う
- 「楽天アフィリエイト」「管理画面」「商品リンクから取得」など運営側の仕組みを本文に書く（verify.mjs が止める）
- 「結論：」「まとめ：」型の見出し（verify.mjs が止める）
- ラクヨコへの導線を増やす
- 記事だけ作って配線を忘れる。手で HTML を直したら `verify.mjs` を再実行する
- 5製品がそろわないまま公開する。流通が薄い製品は差し替える
