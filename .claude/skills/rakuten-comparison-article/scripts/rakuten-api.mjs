// 楽天ウェブサービス（楽天市場商品検索API）で商品リンクを取る。管理画面（Chrome）が使えないときの代替。
// 必要な環境変数（リポジトリ直下の .env に書く。gitignore 済み）:
//   RAKUTEN_APP_ID       … https://webservice.rakuten.co.jp/ で発行したアプリID
//   RAKUTEN_AFFILIATE_ID … 楽天アフィリエイトのアフィリエイトID（xxxxxxxx.xxxxxxxx.xxxxxxxx.xxxxxxxx）
//
// 使い方:
//   node rakuten-api.mjs search "<キーワード>" [--hits 12] [--shop <shopCode>]
//       候補を index|shopCode|価格|送料|商品名|itemCode の形で表示する
//   node rakuten-api.mjs pick <itemCode> --key <facts.jsonのkey> --dir _drafts/<slug>
//       その商品を再取得し、links.tsv に1行追記する（8列目に affiliateUrl）。merge-links.mjs で facts.json に取り込む
//
// API で取れる画像はサムネイル直リンクなので、記事側は hgb ラッパーを使わず直接参照する（lib.mjs の imageUrl が判定）。
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_DIR, fail, readEnv } from "./lib.mjs";

const env = readEnv();
const APP_ID = env.RAKUTEN_APP_ID;
const AFF_ID = env.RAKUTEN_AFFILIATE_ID;
if (!APP_ID || !AFF_ID) fail("RAKUTEN_APP_ID と RAKUTEN_AFFILIATE_ID を .env に設定してください（references/affiliate-console.md の「APIで代替する」を参照）");

const [cmd, ...rest] = process.argv.slice(2);
const opt = (name, def) => { const i = rest.indexOf(name); return i > -1 ? rest[i + 1] : def; };
const ENDPOINT = "https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601";

const call = async (params) => {
  const q = new URLSearchParams({ applicationId: APP_ID, affiliateId: AFF_ID, formatVersion: "2", imageFlag: "1", ...params });
  const res = await fetch(`${ENDPOINT}?${q}`);
  const json = await res.json();
  if (!res.ok || json.error) fail(`API エラー ${res.status}: ${json.error_description || json.error || JSON.stringify(json).slice(0, 200)}`);
  return json.Items || [];
};

const thumbOf = (it) => (it.mediumImageUrls?.[0] || "").replace(/\?.*$/, "");
const price = (it) => `${Number(it.itemPrice).toLocaleString("ja-JP")}円`;
// itemUrl は https://item.rakuten.co.jp/<shop>/<code>/ の形に正規化（クエリ・variantId を落とす）
const itemUrlOf = (it) => it.itemUrl.replace(/\?.*$/, "").replace(/\/?$/, "/");

if (cmd === "search") {
  const keyword = rest.find((a) => !a.startsWith("--") && a !== opt("--hits") && a !== opt("--shop"));
  if (!keyword) fail("検索語を指定してください");
  const params = { keyword, hits: String(opt("--hits", "12")) };
  if (opt("--shop")) params.shopCode = opt("--shop");
  const items = await call(params);
  if (!items.length) { console.log("NO RESULTS"); process.exit(0); }
  items.forEach((it, i) => console.log(`${i}|${it.shopCode}|${price(it)}|${it.postageFlag === 0 ? "送料込" : "送料別"}|${it.itemName.slice(0, 70)}|${it.itemCode}`));
  console.log("\n選ぶ: node rakuten-api.mjs pick <itemCode> --key <key> --dir _drafts/<slug>");
} else if (cmd === "pick") {
  const itemCode = rest.find((a) => !a.startsWith("--") && a !== opt("--key") && a !== opt("--dir"));
  const key = opt("--key"); const dir = opt("--dir");
  if (!itemCode || !key || !dir) fail("使い方: pick <itemCode> --key <key> --dir _drafts/<slug>");
  const [it] = await call({ itemCode, hits: "1" });
  if (!it) fail(`itemCode ${itemCode} が見つかりません`);
  if (!/^https:\/\/hb\.afl\.rakuten\.co\.jp\//.test(it.affiliateUrl || "")) fail("affiliateUrl が返っていません。RAKUTEN_AFFILIATE_ID を確認してください");
  const thumb = thumbOf(it);
  if (!/^https:\/\/thumbnail\.image\.rakuten\.co\.jp\//.test(thumb)) fail(`サムネイルURLが取れません (${thumb})`);
  const tsv = resolve(REPO_DIR, dir, "links.tsv");
  if (!existsSync(tsv)) writeFileSync(tsv, "key\tid\tme_id\titem_id\titem_url\tthumb\tprice\taffiliate_url\n", "utf8");
  const row = [key, "-", "-", "-", itemUrlOf(it), thumb, price(it), it.affiliateUrl].join("\t");
  appendFileSync(tsv, row + "\n", "utf8");
  console.log(`+ ${tsv}\n${row}\n店舗: ${it.shopName} (${it.shopCode}) / ${it.postageFlag === 0 ? "送料込" : "送料別"}`);
} else {
  fail("使い方: search \"<キーワード>\" | pick <itemCode> --key <key> --dir _drafts/<slug>");
}
