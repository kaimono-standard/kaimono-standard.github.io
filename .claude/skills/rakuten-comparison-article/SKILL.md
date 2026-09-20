---
name: rakuten-comparison-article
description: 買いもの標準（このリポジトリ）に「○○5機種を比較」型の楽天市場・商品比較記事を1本追加するための手順。ユーザーが「記事を増やしたい」「○○の比較記事を書いて」「新しいカテゴリを追加」「ケトル記事と同じ形式で」「トースターみたいな記事を」と言ったとき、商品ジャンル名だけを投げてきたとき、あるいは既存の比較記事の製品差し替え・更新を頼まれたときに必ず使う。メーカー公式仕様の裏取り → 楽天アフィリエイト管理画面でのリンク取得 → Codex への下書き委任 → 事実照合 → サイトへの配線までを、トークンを節約しつつ事実ベースで完走する。
---

# 楽天市場 商品比較記事の追加

このサイトの収益は**楽天市場の商品リンク**からしか発生しない（ラクヨコは成果対象外の可能性が高い）。だから比較記事は「読者の役に立つ」と同時に「全リンクが計測付き」でなければ意味がない。この skill は、その2点を落とさずに1本を仕上げる最短ルート。

役割分担の原則：**調べる・確かめる・つなぐ**は Claude（Web取得・ブラウザ・リポジトリ操作が要る）、**長文を書く・長文を読んで照合する**は Codex（`codex exec`）に渡す。Codex に渡す入力は必ず `facts.json` という「検証済みの事実だけが入った台帳」に限定する。Codex は台帳の外のことを書けないので、下書きが事実から逸れにくい。

## 全体の流れ

| # | 工程 | 担当 | 成果物 |
|---|---|---|---|
| 1 | 企画：ジャンルと5製品を決める | Claude | `_drafts/<slug>/facts.json`（骨組み） |
| 2 | 仕様の裏取り（メーカー公式） | Claude | `facts.json` の `specs` / `official_url` |
| 3 | 楽天アフィリエイトリンク・画像・価格の取得 | Claude（Chrome） | `links.tsv` → `facts.json` にマージ |
| 4 | 記事本文の下書き | **Codex** | `article.tpl.html` |
| 5 | プレースホルダ解決・サイトへの配線 | script | `<slug>.html`、config/sitemap/build/検索索引/記事一覧/更新履歴 |
| 6 | 事実照合（台帳に無い主張の検出） | **Codex** | `factcheck.json` |
| 7 | 機械検証・修正・ビルド | Claude | 検証ログ、`npm run build` 通過 |
| 8 | 報告（コミットは頼まれたときだけ） | Claude | 要約 |

作業ディレクトリは `_drafts/<slug>/`（gitignore 済み）。slug は `oven-toaster-comparison` のような英語ケバブケース＋`-comparison`。

## 1. 企画

5製品は次の基準で選ぶ。理由を一行ずつ `facts.json` の `pick_reason` に残す（後で記事の「向いている人」になる）。

- **現行品**であること。メーカー公式の製品一覧にまだ載っていて、楽天市場で複数店舗が新品を扱っている。旧型番が安く併売されているジャンルは、その旨を注意書きにする材料になる
- **用途の軸がばらける**こと。例：安全重視／速さ／大容量／デザイン／価格。同じ軸の製品を2つ入れない
- **ブランドが被らない**こと（アイリスオーヤマが2つ、など避ける）
- **価格帯が広い**こと。上下で3倍以上開いていると「価格を抑えたい人」の枠が自然に埋まる
- 楽天で流通が薄い製品（検索結果が部品・中古ばかり、販売店が1店だけ）は、仕様が良くても外す。実際にパナソニック SR-MP300・Instant Pot・スタンレーはこれで落とした

`facts.json` の形式は `references/fact-sheet.md` を読む（完成形は `assets/example-facts.json`）。最初は製品名・型番・公式URL候補・`pick_reason` だけ埋めればよい。

## 2. 仕様の裏取り

原則は「メーカー公式ページに書いてある数値だけを書く」。読者が公式ページを開いて同じ数字を確認できる状態がゴール。

- `WebFetch` で公式製品ページ／公式オンラインストア／公式スペックページを取り、数値をそのまま `specs` に写す。単位・小数点も公式表記に合わせる
- 403 で取れないサイト（アイリスオーヤマ、`irisplaza.co.jp`、一部PDF）は Chrome で開いて `get_page_text` か JS で読む。取扱説明書PDFの「仕様」ページも一次情報として使える
- 検索エンジンの要約や小売サイト（価格.com・ヨドバシ等）の数値は**裏取りの手がかり**であって出典にしない。それでしか確認できない数値は `unverified` に入れ、記事では「記載なし」と書く（例：Re・De Pot の消費電力）
- 「発売日」「新色追加」などの時期情報も、公式プレスリリースか公式ストアの記載がなければ書かない
- 各製品に必ず1つ `official_url` を持たせる。出典欄に載せるので、製品ページかスペックページの直リンクにする

## 3. 楽天アフィリエイトリンクの取得

`references/affiliate-console.md` の手順で、Chrome にログイン済みの楽天アフィリエイト管理画面から、製品ごとに **リンクID・商品URL・サムネイルURL・掲載時価格** を取る。管理画面の商品検索結果から「商品リンク作成」を iframe で開いて読み取る JS ヘルパーを用意してあるので、1製品につき「検索→候補を見て選ぶ→取得」の2〜3回の呼び出しで済む。

店舗の選び方：メーカー公式楽天市場店（`panasonic-store`、`siroca`、`tiger-online`、`irisplaza-r` 等）があればそれを優先。無ければ大手家電量販店か、送料込みで価格が中央値付近の店。中古・アウトレット・ふるさと納税・部品は除外。リンク先が容量や色の選択式なら `variant_note` に書く（記事の注意書きに使う）。

取得結果は `links.tsv` に追記し、`node .claude/skills/rakuten-comparison-article/scripts/merge-links.mjs _drafts/<slug>` で `facts.json` に取り込む。

## 4. Codex に下書きを書かせる

`facts.json` が埋まったら、記事本文は Codex に任せる。Claude が書くとトークンを最も消費する工程で、かつ「台帳の中身を所定の型に流し込む」作業なので委任向き。

```bash
node .claude/skills/rakuten-comparison-article/scripts/codex-draft.mjs _drafts/<slug>
```

このスクリプトは `references/editorial-rules.md`（文体・構成・禁則）、`assets/exemplar.tpl.html`（同じ粒度の完成例）、`facts.json` を1つのプロンプトにまとめて `codex exec` を読み取り専用サンドボックスで呼び、`_drafts/<slug>/article.tpl.html` を書かせる。プレースホルダ（`{{IMG:key}}` `{{ITEM:key}}` `{{PRICE:key}}`）はそのまま残させ、リンクは次工程で機械的に埋める。

目安：プロンプト約3万字、所要2分前後。Codex の途中経過は表示せず、成果物だけを受け取る（渡したプロンプトは `_drafts/<slug>/draft-prompt.txt` に残る）。

出力を受け取ったら、Claude は**構成が exemplar と同じか**（結論5行 → 比較表 → 選び方4点 → 用途別5製品 → 出典 → サイドバー）だけを目視する。文章の細部はこの段階で直さない（事実照合の後でまとめて直す方が安い）。

## 5. 配線

```bash
node .claude/skills/rakuten-comparison-article/scripts/wire.mjs _drafts/<slug>
```

やること：`article.tpl.html` のプレースホルダを解決して `<slug>.html` を作成、`config.js` にアフィリエイトキーを追加、`build.mjs` の配布リストと `sitemap.xml` に登録、`search-index.js` に記事と製品を追記、`articles.html` の商品比較グリッド先頭にカード（製品画像3点＋バッジ）を挿入、`sources.html` の変更履歴に1行追加。すべて冪等（同じ slug で再実行しても二重登録しない）。

`index.html` の「編集部の新着」カードは自動で触らない。差し替えたいときだけ手で編集する。

## 6. Codex に事実照合させる

```bash
node .claude/skills/rakuten-comparison-article/scripts/codex-factcheck.mjs _drafts/<slug>
```

生成済みの `<slug>.html` と `facts.json` を Codex に渡し、「台帳に根拠がない数値・仕様・時期・最上級表現」を JSON で列挙させる（`--output-schema` で形式を固定）。典型的に引っかかるもの：

- 台帳にない数値（例：「約4分で沸く」）
- 「最も軽い」「最大」など、比較表の数値と突き合わせると成り立たない最上級（4.3kg が2機種あるのに「最も重い」等）
- 「〜と言われています」「一般的に〜」など出典のない一般論
- 発売時期・新色追加などの時期情報

所要1分前後、Codex 側で約2.5万トークン。台帳にない所要時間や、同値があるのに単独で「最も軽い」と書いた箇所を high で拾えることは確認済み。

Claude は指摘を1件ずつ見て、台帳で裏付けられるなら台帳を直し、裏付けられないなら**記事の表現を弱めるか削る**。「公式仕様に記載なし」「〜の記載はありません」に言い換えるのが定石。指摘ゼロになるまで再実行する（通常1〜2回）。

## 7. 機械検証とビルド

```bash
node .claude/skills/rakuten-comparison-article/scripts/verify.mjs <slug>
npm run check && SITE_URL=https://kaimono-standard.github.io CONTACT_URL=https://github.com/kaimono-standard/kaimono-standard.github.io/issues npm run build
```

`verify.mjs` は、プレースホルダ残り、`config.js` に無いキー、`data-affiliate` の欠落、出典リンク数、製品ブロック数、`rel="nofollow sponsored"`、最上級表現の一覧（文脈付き）を出す。最上級はここで表の数値と目で照らす。

余裕があれば `python -m http.server` で配信して Chrome で開き、全 `[data-affiliate]` が `data-link-status="affiliate"` になり、画像が読み込めることを確認する（`references/wiring.md` に確認用 JS がある）。

## 8. 報告

ユーザーには次を短く伝える：記事URL、5製品と選定理由、公式で裏取りできなかった項目とその扱い、取得した価格の日付、配線したファイル一覧。**コミット・プッシュは頼まれたときだけ**。プッシュする場合は `gh run watch` でデプロイ完了と本番URLの 200 を確認してから報告する。

## やってはいけないこと

- 実機レビュー風の表現（「使ってみると」「音が静か」）。運営方針が「実購入レビューをしない」なので信頼を壊す
- 台帳にない数値を「だいたいこのくらい」で書く。読者は数値を信じて買う
- ラクヨコ導線を増やす。成果対象外の可能性が高く、楽天市場リンクで稼ぐ設計と矛盾する
- 記事だけ作って配線を忘れる。`wire.mjs` を通せば起きないが、手で HTML を直した後は `verify.mjs` を再実行する
- Codex に Web 検索や楽天管理画面の操作を任せる。Codex はリポジトリ内のファイルしか見えない前提で使う

## 参照ファイル

- `references/fact-sheet.md` — `facts.json` の項目と記入例
- `references/editorial-rules.md` — 記事の構成・文体・禁則（Codex にもそのまま渡す）
- `references/affiliate-console.md` — 楽天アフィリエイト管理画面の操作と JS ヘルパー
- `references/wiring.md` — 配線先ファイルの一覧と、ブラウザ確認用スニペット
- `assets/exemplar.tpl.html` — 完成例（オーブントースター記事のテンプレート）
- `scripts/` — `merge-links.mjs` `codex-draft.mjs` `wire.mjs` `codex-factcheck.mjs` `verify.mjs`
