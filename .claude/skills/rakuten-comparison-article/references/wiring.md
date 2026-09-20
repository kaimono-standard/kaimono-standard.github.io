# 配線先と確認方法

`wire.mjs` が触るファイルと、その意図。手で直した後に同じ場所を壊していないか見るときの地図。

| ファイル | 何をするか | 手動で見るポイント |
|---|---|---|
| `<slug>.html` | `article.tpl.html` のプレースホルダを解決して生成 | `{{` が残っていない |
| `config.js` | `affiliateLinks` に製品キーを追加。値は `hb.afl.rakuten.co.jp/ichiba/<id>/?pc=<商品URL>&link_type=picttext&ut=<定数>` | `node --check config.js` |
| `build.mjs` | `files` 配列に `<slug>.html` を追加（無いと `dist/` に入らず本番で404） | ケトル記事の隣にある |
| `sitemap.xml` | `<url>` を追加。`https://example.com/` はビルド時に本番URLへ置換される | example.com のまま書く |
| `search-index.js` | 配列の先頭に記事エントリ（製品5点、brand の英字別名、keywords）を追加 | `node --check search-index.js` |
| `articles.html` | 商品比較グリッド `.article-cards` の先頭にカード。画像は製品1〜3の `IMG` | 「公開記事 N本」の数字は手で +1 |
| `sources.html` | 変更履歴 `<tbody>` の先頭に「比較記事を追加（○○）」の行 | 日付 |
| `index.html` | **触らない**。「編集部の新着」を差し替えたいときだけ手で | — |

## ブラウザでの最終確認

`dist/` を配信して開く（`_headers` は GitHub Pages では効かないので CSP は気にしなくてよい）。

```bash
SITE_URL=https://kaimono-standard.github.io CONTACT_URL=https://github.com/kaimono-standard/kaimono-standard.github.io/issues npm run build
cd dist && python -m http.server 8765
```

`javascript_tool` で：

```js
await new Promise(r=>setTimeout(r,2500));
const imgs=[...document.images].map(i=>(i.complete&&i.naturalWidth>0?'OK':'LAZY/FAIL')+' '+i.alt);
const st=[...document.querySelectorAll('[data-affiliate]')].map(a=>a.dataset.affiliate+':'+a.dataset.linkStatus);
imgs.join('\n')+'\n'+[...new Set(st)].join(' ')
```

- `linkStatus` が全部 `affiliate` であること。`direct` が混ざっていたら `config.js` のキー名が記事側と食い違っている
- ヒーローの5枚が `OK` なら画像URLは正しい。製品ブロック側は `loading="lazy"` なので画面外だと `LAZY/FAIL` になるが、ヒーローと同じURLなので問題ない

確認が終わったら `taskkill //F //IM python.exe` でサーバーを止め、タブを閉じる。
