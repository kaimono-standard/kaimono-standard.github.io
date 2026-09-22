---
name: rakuten-comparison-article
description: 買いもの標準（このリポジトリ）に「○○5機種を比較」型の楽天市場・商品比較記事を1本追加するための手順。ユーザーが「記事を増やしたい」「○○の比較記事を書いて」「新しいカテゴリを追加」「ケトル記事と同じ形式で」「トースターみたいな記事を」と言ったとき、商品ジャンル名だけを投げてきたとき、あるいは既存の比較記事の製品差し替え・更新を頼まれたときに必ず使う。メーカー公式仕様の裏取り → 楽天アフィリエイト管理画面でのリンク取得 → Codex への下書き委任 → 事実照合 → サイトへの配線までを、トークンを節約しつつ事実ベースで完走する。
---

# 楽天市場 商品比較記事の追加

このサイトの収益は**楽天市場とAmazonの商品リンク**からしか発生しない（ラクヨコは成果対象外の可能性が高い）。だから比較記事は「読者の役に立つ」と同時に「全リンクが計測付き」でなければ意味がない。この skill は、その2点を落とさずに1本を仕上げる最短ルート。

役割分担の原則：**調べる・確かめる・つなぐ**は Claude（Web取得・ブラウザ・リポジトリ操作が要る）、**長文を書く・長文を読んで照合する**は Codex（`codex exec`）に渡す。Codex に渡す入力は必ず `facts.json` という「検証済みの事実だけが入った台帳」に限定する。Codex は台帳の外のことを書けないので、下書きが事実から逸れにくい。

## 全体の流れ

| # | 工程 | 担当 | 成果物 |
|---|---|---|---|
| 1 | 企画：ジャンルと5製品を決める | Claude | `_drafts/<slug>/facts.json`（骨組み） |
| 2 | 仕様の裏取り（メーカー公式） | Claude | `facts.json` の `specs` / `official_url` |
| 3 | 楽天アフィリエイトリンク・画像・価格の取得 | Claude（Chrome） | `links.tsv` → `facts.json` にマージ |
| 4 | 記事本文の下書き | **Codex** | `article.tpl.html` |
| 5 | プレースホルダ解決（プレビュー） | script | `_drafts/<slug>/preview.html` |
| 6 | 事実照合（台帳に無い主張の検出） | **Codex** | `factcheck.json` |
| 7 | 機械検証・承認キューへ提出 | Claude | `review.json`（承認待ち） |
| 8 | 承認 → 配線・ビルド・コミット・push | **ユーザー**（承認画面） | 公開 |

作業ディレクトリは `_drafts/<slug>/`（gitignore 済み）。slug は `oven-toaster-comparison` のような英語ケバブケース＋`-comparison`。

## 1. 企画

5製品は次の基準で選ぶ。理由を一行ずつ `facts.json` の `pick_reason` に残す（後で記事の「向いている人」になる）。

- **現行品**であること。メーカー公式の製品一覧にまだ載っていて、楽天市場で複数店舗が新品を扱っている。旧型番が安く併売されているジャンルは、その旨を注意書きにする材料になる
- **用途の軸がばらける**こと。例：安全重視／速さ／大容量／デザイン／価格。同じ軸の製品を2つ入れない
- **ブランドが被らない**こと（アイリスオーヤマが2つ、など避ける）
- **価格帯が広い**こと。上下で3倍以上開いていると「価格を抑えたい人」の枠が自然に埋まる
- 楽天で流通が薄い製品（検索結果が部品・中古ばかり、販売店が1店だけ）は、仕様が良くても外す。実際にパナソニック SR-MP300・Instant Pot・スタンレーはこれで落とした

**担当執筆者を決める。** `node scripts/editors.mjs list` で候補を見て、ジャンルではなく「この記事を読みに来る人に一番近い視点の人」を選び、`facts.json` の `editor` に id を入れる（例：型落ちとの違いを知りたい人向けなら `mie`、電気代まで含めて選びたい人向けなら `kazu`）。台帳は `_editorial/editors.json`（git 管理外）。同じ人に偏りすぎないよう、直近の記事の担当も見て決める。執筆者を増やしたら `node scripts/editors.mjs page` で editors.html を作り直し、styles.css に `.ed-<id>` のアバター色を足す。

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

## 3b. Amazon リンク

各製品ブロックには楽天のボタンの直後に「Amazonで見る」ボタンが付く（アソシエイトID `kaimonostd-22`、`lib.mjs` の `AMAZON_TAG`）。`wire.mjs` が `facts.json` の `amazon` から `config.js` の `amazonLinks` に登録する。

- 既定は **型番の検索結果リンク**（`amazon.query`。省略時は brand＋model）。検索語は「ブランド 製品名 型番」のように、検索結果の先頭にその製品が出る語にする
- Amazon の商品ページ（`/dp/ASIN`）に直接飛ばすのは、Chrome で `https://www.amazon.co.jp/s?k=<型番>` を開き、**正規の型番と一致する出品**（スポンサー枠・並行輸入・中古・セット品・Amazon限定型番 `…AM` `…AZ` を除く）の ASIN が確認できたときだけ。`amazon.asin` に入れる
- Amazon の価格・在庫は記事に書かない（PA-API 経由でない価格表示は規約違反）
- 広告表記の文言は editorial-rules.md の通り（Amazon の表記文は規約で固定）

## 4. Codex に下書きを書かせる

`facts.json` が埋まったら、記事本文は Codex に任せる。Claude が書くとトークンを最も消費する工程で、かつ「台帳の中身を所定の型に流し込む」作業なので委任向き。

```bash
node .claude/skills/rakuten-comparison-article/scripts/codex-draft.mjs _drafts/<slug>
```

このスクリプトは `references/editorial-rules.md`（文体・構成・禁則）、`assets/exemplar.tpl.html`（同じ粒度の完成例）、`facts.json` を1つのプロンプトにまとめて `codex exec` を読み取り専用サンドボックスで呼び、`_drafts/<slug>/article.tpl.html` を書かせる。プレースホルダ（`{{IMG:key}}` `{{ITEM:key}}` `{{PRICE:key}}`）はそのまま残させ、リンクは次工程で機械的に埋める。

目安：プロンプト約3万字、所要2分前後。Codex の途中経過は表示せず、成果物だけを受け取る（渡したプロンプトは `_drafts/<slug>/draft-prompt.txt` に残る）。

出力を受け取ったら、Claude は**構成が exemplar と同じか**（結論5行 → 比較表 → 選び方4点 → 用途別5製品 → 出典 → サイドバー）だけを目視する。文章の細部はこの段階で直さない（事実照合の後でまとめて直す方が安い）。

## 5. プレビューを作る（サイトにはまだ配線しない）

```bash
node .claude/skills/rakuten-comparison-article/scripts/wire.mjs _drafts/<slug> --preview
```

`article.tpl.html` のプレースホルダを解決して `_drafts/<slug>/preview.html` を書くだけ。`config.js` や記事一覧などの共有ファイルには触らない。**公開はユーザーが承認画面で承認したときに行う**ので、この段階でサイトに配線してはいけない（承認前の記事が別の記事のコミットに紛れ込む）。

## 6. Codex に事実照合させる

```bash
node .claude/skills/rakuten-comparison-article/scripts/codex-factcheck.mjs _drafts/<slug> --preview
```

`preview.html` と `facts.json` を Codex に渡し、「台帳に根拠がない数値・仕様・時期・最上級表現」を JSON で列挙させる（`--output-schema` で形式を固定）。典型的に引っかかるもの：

- 台帳にない数値（例：「約4分で沸く」）
- 「最も軽い」「最大」など、比較表の数値と突き合わせると成り立たない最上級（4.3kg が2機種あるのに「最も重い」等）
- 「〜と言われています」「一般的に〜」など出典のない一般論
- 発売時期・新色追加などの時期情報

Claude は指摘を1件ずつ見て、台帳で裏付けられるなら台帳を直し、裏付けられないなら `article.tpl.html` の**表現を弱めるか削る**。「公式仕様に記載なし」に言い換えるのが定石。直したら手順5からやり直し、指摘ゼロになるまで繰り返す（通常1〜2回）。

## 7. 機械検証して承認キューに出す

```bash
node .claude/skills/rakuten-comparison-article/scripts/verify.mjs <slug> --preview
node admin/submit.mjs _drafts/<slug>
```

`verify.mjs --preview` は、プレースホルダ残り、運営側の表現の混入、見出しの要約ラベル、`data-affiliate` の欠落、出典リンク数、製品ブロック数、最上級表現の一覧を出す（config.js と配線の検査は公開時に回る）。最上級はここで表の数値と目で照らす。

`submit.mjs` は機械検証と事実照合（high の指摘ゼロ）を確認してから `_drafts/<slug>/review.json` を作り、記事を**承認待ち**にする。ここで Claude の作業は終わり。

## 8. 公開（ユーザーが承認画面で行う）

ユーザーは `npm run review` で承認画面（http://127.0.0.1:8790/）を開き、タイトル・担当・記載日・製品・照合結果・プレビューを見て「承認して公開」か「差し戻す」を選ぶ。

- 承認すると `admin/publisher.mjs` がその場で `wire.mjs`（配線）→ `verify.mjs`（配線込みの検証）→ `npm run check` → `npm run build` → 記事ごとにコミット → まとめて `git push` まで進める。公開処理中に承認された記事は待機し、終わり次第次の回で処理する
- 共有ファイル（config.js など）に未コミットの変更があると、他の作業を巻き込まないよう公開を止めて「公開に失敗」にする
- 記事の日付（`facts.date`）は記載用で、予約投稿ではない。公開されるのは承認した時点
- 差し戻された記事は、`review.json` の `reject_note` を読んで直し、手順5から出し直す（`submit.mjs` は差し戻し理由を `resubmitted_from` に残す）

ユーザーへの報告は、承認待ちに出した記事のタイトル・担当・5製品と選定理由・公式で裏取りできなかった項目だけでよい。

## やってはいけないこと

- 実機レビュー風の表現（「使ってみると」「音が静か」）。運営方針が「実購入レビューをしない」なので信頼を壊す
- 台帳にない数値を「だいたいこのくらい」で書く。読者は数値を信じて買う
- ラクヨコ導線を増やす。成果対象外の可能性が高く、楽天市場リンクで稼ぐ設計と矛盾する
- 承認前にサイトへ配線する（`wire.mjs` を `--preview` なしで実行する、`<slug>.html` を手で置く）。配線は承認時に publisher が行う
- 自分でコミット・push して公開する。公開はユーザーの承認だけが起点
- Codex に Web 検索や楽天管理画面の操作を任せる。Codex はリポジトリ内のファイルしか見えない前提で使う

## 参照ファイル

- `references/fact-sheet.md` — `facts.json` の項目と記入例
- `references/editorial-rules.md` — 記事の構成・文体・禁則（Codex にもそのまま渡す）
- `references/affiliate-console.md` — 楽天アフィリエイト管理画面の操作と JS ヘルパー
- `references/wiring.md` — 配線先ファイルの一覧と、ブラウザ確認用スニペット
- `assets/exemplar.tpl.html` — 完成例（オーブントースター記事のテンプレート）
- `scripts/` — `merge-links.mjs` `codex-draft.mjs` `wire.mjs` `codex-factcheck.mjs` `verify.mjs`、ブラウザ無し運用向けの `fetch-page.mjs`（公式ページを本文テキストで読む）と `rakuten-api.mjs`（楽天ウェブサービスAPIでリンク取得。`.env` に `RAKUTEN_APP_ID` / `RAKUTEN_AFFILIATE_ID`）
- `.codex/skills/rakuten-comparison-article/SKILL.md` — **Codex 単独版**。Claude の利用上限に達したときは Codex にこのスキルで同じ手順を回させる。同じ references / scripts / exemplar を使うので品質基準は同一。`codex-draft.mjs --prompt-only` → 自分で執筆 → `--finalize`、`codex-factcheck.mjs --prompt-only` → 自分で照合 → `--report`、`verify.mjs --online` がその用途
