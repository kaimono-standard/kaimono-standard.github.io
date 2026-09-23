# facts.json — 検証済み事実の台帳

`_drafts/<slug>/facts.json`。Codex はこのファイルの内容だけを使って記事を書くので、**ここに無いことは記事に出ない**（出たら事実照合で弾かれる）。逆に言えば、公式で確認できたことは細かくてもここに入れておくと記事が豊かになる。

## 全体

```json
{
  "slug": "oven-toaster-comparison",
  "topic": "オーブントースター",
  "scope": "食パン2枚焼きの現行モデル",
  "category_label": "キッチン家電",
  "date": "2026-09-20",
  "audience_axes": ["オートメニューで迷わない", "パンの焼き上がりを優先", "立ち上がりの速さ", "広い庫内と長時間調理", "価格を抑えたい"],
  "table_columns": ["消費電力", "庫内（幅×奥行）", "温度調節", "タイマー"],
  "buying_points": [
    { "title": "加熱方式", "body": "スチーム、グラファイト、近赤外線など方式が異なる。トースト中心か総菜の温め直しにも使うかで向き不向きが変わる。" }
  ],
  "table_footnote": "バルミューダは温度ダイヤルではなくモード選択。庫内寸法は各社公式表記を幅×奥行に揃えた。",
  "products": [ ... ]
}
```

| 項目 | 役割 |
|---|---|
| `topic` / `scope` | タイトルとリード文の材料。scope は「現行」「2枚焼き」「500ml前後」など選定範囲 |
| `audience_axes` | 結論ブロックの5行。製品と同じ順で1対1 |
| `table_columns` | 比較表の列（製品名と掲載時価格は自動で付く）。4列前後。各製品の `specs` に同名キーが必要 |
| `buying_points` | 「選び方の4つのポイント」。4つ。ジャンル共通の一般論でよいが、数値を出すなら台帳内の数値だけ |
| `table_footnote` | 比較表の注記。測定条件の違い、モデル差など |

## 製品

```json
{
  "key": "toasterPanasonic",
  "anchor": "panasonic",
  "brand": "パナソニック",
  "name": "パナソニック オーブントースター ビストロ NT-D700",
  "model": "NT-D700",
  "pick_reason": "15オートメニューで、冷凍パンや総菜も含めてメニュー選択だけで済ませたい人向け",
  "official_url": "https://panasonic.jp/toaster/products/NT-D700/spec.html",
  "official_label": "パナソニック NT-D700 公式仕様",
  "specs": {
    "消費電力": "1300W",
    "庫内（幅×奥行）": "26.0×25.0cm",
    "庫内": "幅26.0×奥行25.0×高さ9.5cm",
    "温度調節": "120〜260℃",
    "タイマー": "30秒〜25分",
    "質量": "約4.3kg",
    "外形": "幅34.1×奥行32.8×高さ26.9cm"
  },
  "features": ["上ヒーターは遠赤外線と近赤外線の組み合わせ", "15のオートメニュー（厚切り・冷凍パン、焼きいも、もち、総菜の温め直し）", "デジタルタイマー"],
  "release": "",
  "unverified": ["トースト1枚の所要時間"],
  "caution_hint": "5機種で最も重い部類。奥行32.8cm",
  "rakuten": {
    "id": "57ba07de.a02a930e.57ba07df.a8c22535",
    "me_id": "1414582",
    "item_id": "10000094",
    "item": "https://item.rakuten.co.jp/panasonic-store/nt-d700-w/",
    "thumb": "https://thumbnail.image.rakuten.co.jp/@0_mall/panasonic-store/cabinet/banner/thumb/nt-d700_251112.jpg",
    "price": "29,972円",
    "shop": "panasonic-store",
    "shop_is_official": true,
    "variant_note": "リンク先は2色から選ぶ形式"
  }
}
```

| 項目 | 役割・注意 |
|---|---|
| `key` | `config.js` のキー。`<ジャンル><ブランド>` のキャメルケースで、サイト内で一意 |
| `anchor` | 記事内の見出し id。`zojirushi` `tfal` `iris` のようにブランド小文字。同一記事内で一意 |
| `specs` | **公式で確認した値のみ**。`table_columns` と同名のキーは表に入る。それ以外は本文用 |
| `features` | 公式ページの機能説明を短文で。形容詞は公式表現の範囲に留める（「おいしく焼ける」は書かない） |
| `release` | 公式プレスリリース／公式ストアで確認できた場合のみ「2026年9月発売」のように。無ければ空 |
| `unverified` | 書きたかったが確認できなかった項目。Codex はこれを見て「記載なし」扱いにする |
| `caution_hint` | 注意書きの種。比較表から導ける事実（最重量、旧型番併売、選択式リンク等）を書く |
| `amazon` | 任意。`{ "query": "検索語", "asin": "B0XXXXXXXX" }`。`asin` があれば商品ページへ、無ければ `query`（省略時は brand＋model）の検索結果へリンクする。Amazon 限定型番（末尾 AM / AZ など）しか無いときは asin を入れず検索リンクにする |
| `rakuten` | `merge-links.mjs` が `links.tsv` から埋める。`shop_is_official` はボタン文言（「○○公式楽天市場店で見る」）に使う |

## 最上級表現の扱い

「最軽量」「最も高価」「唯一」は、比較表の数値から機械的に導ける場合だけ台帳に `caution_hint` や `features` として書く。同値があるなら「象印と並んで最も重い」のように併記する。Codex が独自に最上級を作らないよう、`editorial-rules.md` でも禁じている。

## editor（担当執筆者）

トップレベルに `"editor": "<id>"` を置く。id は `_editorial/editors.json` の `editors[].id`。`codex-draft.mjs` はこの人物の視点・文体・署名で下書きを書かせ、未設定なら止まる。

## context_facts（背景の事実・任意）

特定の製品の仕様ではない、記事の前提になる公的な事実（制度の期限、取り付けに工事が要るかどうか等）。官公庁・業界団体・メーカーの説明ページに書いてある文だけを入れる。事実照合の根拠になる。

```json
"context_facts": [
  { "fact": "一般照明用の蛍光ランプの製造・輸出入は2027年までに段階的に廃止される。使用や在庫の売買は禁止されない", "url": "https://www.env.go.jp/content/000200659.pdf", "label": "環境省・経済産業省 資料", "quote": "…" }
]
```

本文で使うときは、その段落の中で出典にリンクする（`<a href="url" target="_blank" rel="noopener">label</a>`）。出典欄（#sources）は製品の公式ページだけにする。

## brief（企画メモ・任意）

記事案（`article-ideas` の `ideas.md`）から引き継ぐ書き方の方針。`codex-draft.mjs` は台帳とは別の節として Codex に渡し、`codex-factcheck.mjs` は照合に渡さない（brief の中身は記事の事実の根拠にならない）。

```json
"brief": {
  "angle": "蛍光灯から交換する人向け。前半で工事の要否の確かめ方、後半で5機種の比較",
  "target_queries": ["LEDシーリングライト 比較 8畳", "蛍光灯 シーリングライト 交換 自分で"],
  "reader": "今の照明器具を自分で付け替えたい人",
  "must": ["直付け器具は工事が必要と明記する"],
  "avoid": ["今の蛍光灯がすぐ使えなくなると読める書き方"]
}
```

`must` に書いた内容を記事で事実として述べるなら、その根拠は台帳（`features` や `caution_hint`）に別に入れる。


## 新旧比較（article_type: "version"）

5機種比較と同じ台帳に、次の違いがある。

- `"article_type": "version"` をトップレベルに置く
- `products` は **2つだけ**。1つ目が新型、2つ目が旧型。それぞれ `release`（発売時期。メーカー公式の表記）を必ず入れる
- `table_columns` は新旧で比べる項目。両方の `specs` に同じキーで入れる。表記ゆれは台帳の段階で揃える（「約1.0kg」と「約1kg」を混ぜない）。値が片方にしかない項目は、無いほうに `"公式仕様に記載なし"` と入れる
- `changes`：変わった項目の一覧。`[{"item": "質量", "new": "約2.1kg", "old": "約2.4kg"}]` の形。値は `specs` と完全に一致させる（`verify.mjs` が「違い」の印の数を specs から数えて照合する）
- `successor_evidence`：新型が旧型の後継として見られている根拠。条件は `editorial-rules-version.md` の「対象にしてよい組み合わせ」
  - 公式：`{"kind": "official", "url": "...", "label": "象印 2026年新製品ニュースリリース", "quote": "従来品EQ-SA22…"}`
  - 世間の見方：`{"kind": "media", "url": "<専門メディアの記事>", "label": "AV Watch（2026年9月の新製品記事）", "quote": "…の後継モデル…", "supporting": [{"url": "<独立した2つ目の情報源>", "label": "...", "quote": "..."}]}`。`url` と `supporting` を合わせて互いに独立した2件以上。`url`（出典欄に載る）は専門メディアにする
  - `kind` を省くと `official` として扱う。どちらも満たせなければこの型の記事にしない
- slug は `<ブランド>-<新型型番>-<旧型型番>-difference`（英小文字とハイフン）。例：`zojirushi-eq-sc22-eq-sa22-difference`
- `editor` は、型落ちとの違いを知りたい読者に近い人（最初の候補は `mie`）

## official_is_seller_store（例外）

`official_url` は原則メーカーの自社サイト。ナッツ・ドライフルーツ専門店のように**製造者・販売者が自社の楽天市場店にしか商品ページを持たない**場合だけ、その楽天市場の商品ページを `official_url` にして `"official_is_seller_store": true` を付ける。ラベルの製造者／販売者名と店舗の運営者が一致していることを確認してから付ける（`official_label` に「販売者：〇〇」と書く）。自社サイトがあるならそちらを使う。`verify.mjs` はこの印が付いた URL だけ楽天市場のドメインでも出典として通す。

