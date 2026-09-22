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

