# 楽天アフィリエイト管理画面からのリンク取得

`affiliate.rakuten.co.jp` は Chrome にログイン済みであることが前提。ログアウトしていたら（トップにログアウトボタンが出ない）、ユーザーにログインを頼む。パスワード入力は代行しない。

## なぜ管理画面を経由するか

商品リンクは `https://hb.afl.rakuten.co.jp/ichiba/<リンクID>/?pc=<商品URL>&link_type=picttext&ut=<固定値>` の形で、**リンクIDは店舗（me_id）ごと**に発行される。画像も `hbb.afl.rakuten.co.jp/hgb/<同じID>/?me_id=…&item_id=…&pc=<サムネイルURL>…` で、同じIDを使う。だから必要なのは製品ごとに「ID・me_id・item_id・商品URL・サムネイルURL・価格」の6つで、それを取るには管理画面の「商品リンク作成」ページを一度開けばよい。

`ut` は全リンク共通の定数（`config.js` の既存URLに入っているもの）。`render` 側で付与するので取得不要。

## 手順

1. `tabs_context_mcp` → `navigate` で `https://affiliate.rakuten.co.jp/` を開き、ログイン状態をスクリーンショットで確認
2. 下の **ヘルパー登録** JS を `javascript_tool` で1回実行（ページを移動すると消えるので、タブはこのページに置いたまま iframe で作業する）
3. 製品ごとに **検索** → 候補を選んで **取得** を実行し、結果を `links.tsv` に追記
4. 全製品分が揃ったら `merge-links.mjs` で `facts.json` に取り込み、タブを閉じる

## ヘルパー登録（1回だけ）

`javascript_tool` の出力は `?` `&` `=` を含むとブロックされるので、ヘルパーは `{Q}` `{A}` `{E}` に置換して返す。`links.tsv` に書くときは元に戻す。

```js
window.__load=(url,test,ms=20000)=>new Promise((res,rej)=>{const f=document.createElement('iframe');f.style.cssText='width:1200px;height:800px;position:fixed;left:-2000px;top:0';f.src=url;document.body.appendChild(f);const t0=Date.now();const iv=setInterval(()=>{try{const d=f.contentDocument;if(d&&test(d)){clearInterval(iv);res({d,f});}else if(Date.now()-t0>ms){clearInterval(iv);f.remove();rej('timeout');}}catch(e){}},300);});
window.__san=s=>s.replace(/[?&=]/g,c=>({'?':'{Q}','&':'{A}','=':'{E}'}[c]));
window.__search=async(q)=>{document.querySelectorAll('iframe').forEach(f=>f.remove());const {d,f}=await window.__load('https://affiliate.rakuten.co.jp/search?sitem='+encodeURIComponent(q),d=>d.querySelectorAll('a[href*="link/pc/item"]').length>0||/該当|0件/.test(d.body.innerText));const as=[...d.querySelectorAll('a[href*="link/pc/item"]')].slice(0,12);window.__links=as.map(a=>a.href);const rows=as.map((a,i)=>{const u=new URL(a.href);const url=u.searchParams.get('me_url')||'';return i+'|'+url.split('/')[3]+'|'+u.searchParams.get('price')+'|'+(u.searchParams.get('goods_name')||'').slice(0,60)});f.remove();return window.__san(rows.join('\n')||'NO RESULTS');};
window.__pick=async(i)=>{document.querySelectorAll('iframe').forEach(f=>f.remove());const {d,f}=await window.__load(window.__links[i],d=>[...d.querySelectorAll('textarea')].some(t=>t.value&&t.value.includes('hbb.afl')));const v=[...d.querySelectorAll('textarea')].map(e=>e.value).find(v=>v.includes('hbb.afl'));const id=v.match(/ichiba\/([0-9a-f.]+)\//)[1];const img=v.match(/hbb\.afl\.rakuten\.co\.jp\/hgb\/[^"]+/)[0];const p=(d.body.innerText.match(/価格：[^\n]+/)||[''])[0];const u=new URL(window.__links[i]);const me=img.match(/me_id=(\d+)/)[1];const item=img.match(/item_id=(\d+)/)[1];const thumb=decodeURIComponent(img.match(/pc=([^&]+)/)[1]).replace(/\?_ex=.*$/,'');f.remove();return window.__san([id,me,item,u.searchParams.get('me_url').replace(/\?.*$/,''),thumb,p].join('\t'));};
'helpers ready'
```

## 検索

```js
await window.__search('象印 オーブントースター EQ-SC22')
```

出力は `index|店舗|価格|商品名` の一覧。ここから1つ選ぶ。選択基準は SKILL.md の「店舗の選び方」。型番が複数世代並ぶジャンルでは、商品名に現行型番が入っている行を選ぶ。

## 取得

```js
await window.__pick(3)
```

出力はタブ区切り1行：`ID  me_id  item_id  商品URL  サムネイルURL  価格：…（税込…）(日付)`。`{Q}` 等を戻し、価格は「9,201円」の部分だけ残して、`links.tsv` に次の形式で追記する。

```
key	id	me_id	item_id	item_url	thumb	price
toasterZojirushi	57b73c89.a9ad4f57.57b73c8a.901a6902	1270903	11744612	https://item.rakuten.co.jp/r-kojima/4974305232779/	https://thumbnail.image.rakuten.co.jp/@0_mall/r-kojima/cabinet/n0000001849/4974305232779_1.jpg	9,201円
```

`__pick` は20秒でタイムアウトする。`Runtime.evaluate timed out` が出たら、`document.querySelectorAll('iframe').forEach(f=>f.remove())` を実行してから同じ `__pick` をやり直す（1回で復帰する）。

## 公式店の目的の型番が検索結果に出ないとき

管理画面の検索はショップ名や型番で引っかからないことがある（ブラウン公式店の MQ7035XBG で発生）。リンクIDは店舗ごとに同じなので、次で代用できる。

1. 同じ店舗の別商品を `__pick` して **リンクID と me_id** を得る
2. タブを目的の商品ページ（`item.rakuten.co.jp/<shop>/<code>/`）へ移動し、JS で `item_id` と画像パスを読む
   ```js
   const h=document.documentElement.innerHTML;
   [...new Set([...h.matchAll(/"itemId"\s*:\s*"?(\d{6,})/g)].map(m=>m[1]))].join(',')+' | '+(document.querySelector('meta[property="og:image"]')||{}).content
   ```
   `og:image` の `https://shop.r10s.jp/<shop>/...` は、サムネイルでは `https://thumbnail.image.rakuten.co.jp/@0_mall/<shop>/...` に置き換える
3. 価格は商品ページの表示を使い、`links.tsv` に1行組み立てる
4. 管理画面に戻ったらヘルパーを登録し直す（ページ移動で消える）

## 既知の店舗ID（再利用可）

同じ店舗なら ID は同じなので、`config.js` の既存URLから流用できる。item_id と商品URL・サムネイルだけ新しく取る。

| 店舗 | ID |
|---|---|
| r-kojima（コジマ） | 57b73c89.a9ad4f57.57b73c8a.901a6902 |
| irisplaza-r（アイリス公式） | 57b73cab.fc9d3f8d.57b73cac.d7bbcabb |
| bellevie-harima（T-fal公認） | 57b73b8e.0a6efe33.57b73b8f.82ca1d5b |
| importshopaqua | 57b73c97.9136d5e4.57b73c98.90aa48c5 |
| tiger-official-store（タイガー公式） | 57b73c8d.5c4b1523.57b73c8e.0a8c127f |
| panasonic-store（パナソニック公式） | 57ba07de.a02a930e.57ba07df.a8c22535 |
| siroca（シロカ公式） | 57ba2370.4b27da6d.57ba2371.aa648b28 |
| ksdenki（ケーズデンキ） | 57b9fe40.3116098f.57b9fe41.218e2a21 |
| yamada-denki | 57ba27c2.98672d9a.57ba27c3.6483c883 |
| tiger-online（タイガー楽天市場店） | 57ba2b73.9991fcb8.57ba2b74.fb963689 |
| braunhousehold（ブラウン公式） | 57bbc715.777d061e.57bbc716.48ac6b20 |
| bruno-official（BRUNO公式） | 57bbc7a8.26c14f52.57bbc7a9.0469692e |
| edion（エディオン） | 57bbc770.6f7c7534.57bbc771.17bdda71 |
| pfudirect（PFU公式・HHKB） | 57c9a25d.9253880a.57c9a25e.04ec0403 |
| realforce（REALFORCE公式） | 57c9a326.7b6424dd.57c9a327.193e989b |
| logicool（ロジクール公式） | 57c9a36b.cabf9efd.57c9a36c.442545da |
| keychron（Keychron Japan公式） | 57c9a3c9.8b1e24c8.57c9a3ca.a32bfe66 |

## 管理画面が使えないとき：楽天ウェブサービスAPIで代替する

Chrome（ログイン済みの管理画面）が使えない環境——Codex 単独で回すときや、ブラウザ操作が不安定なとき——は、楽天ウェブサービスの商品検索APIで同じ情報を取る。計測付きURL（`affiliateUrl`）とサムネイルが返るので、記事の収益計測は管理画面経由と同じように働く。違いは画像の参照方法だけ（hgb ラッパーを通さず、サムネイルを直接参照する）。

準備（1回だけ）：

1. https://webservice.rakuten.co.jp/ で「アプリID」を発行（楽天IDでログインし、アプリ名とURLを登録するだけ）
2. 楽天アフィリエイト管理画面の「アフィリエイトID」（`xxxxxxxx.xxxxxxxx.xxxxxxxx.xxxxxxxx` の形）を控える
3. リポジトリ直下の `.env`（gitignore 済み）に書く：
   ```
   RAKUTEN_APP_ID=発行したアプリID
   RAKUTEN_AFFILIATE_ID=アフィリエイトID
   ```

手順：

```bash
# 候補を見る（index|shopCode|価格|送料|商品名|itemCode）
node .claude/skills/rakuten-comparison-article/scripts/rakuten-api.mjs search "象印 オーブントースター EQ-SC22" --hits 12
# 店舗を絞る
node .claude/skills/rakuten-comparison-article/scripts/rakuten-api.mjs search "EQ-SC22" --shop zojirushi-direct
# 選んだ商品を links.tsv に追記
node .claude/skills/rakuten-comparison-article/scripts/rakuten-api.mjs pick "zojirushi-direct:10001234" --key toasterZojirushi --dir _drafts/<slug>
```

店舗の選び方は管理画面のときと同じ（公式店 → 大手量販店 → 送料込みで中央値付近）。`pick` は8列目に `affiliateUrl` を持つ行を `links.tsv` に足すので、あとは `merge-links.mjs` で取り込むだけ。`facts.json` 側には `link_source: "rakuten-webservice-api"` が付き、`wire.mjs` は `config.js` にその URL をそのまま登録する。

管理画面の行（リンクID あり）と API の行（8列目あり）を1つの `links.tsv` に混ぜてもよい。
