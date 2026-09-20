// links.tsv（管理画面から取った行）を facts.json の products[].rakuten に取り込む。
// 使い方: node merge-links.mjs _drafts/<slug>
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OFFICIAL_SHOPS, draftDir, fail, readFacts, writeFacts } from "./lib.mjs";

const dir = draftDir(process.argv[2]);
const tsvPath = resolve(dir, "links.tsv");
if (!existsSync(tsvPath)) fail(`${tsvPath} がありません（references/affiliate-console.md の手順で作成）`);

const rows = readFileSync(tsvPath, "utf8").trim().split(/\r?\n/).filter((l) => l && !l.startsWith("key\t"));
const byKey = new Map();
for (const line of rows) {
  const [key, id, me_id, item_id, item, thumb, price] = line.split("\t").map((s) => s.trim());
  if (!/^[0-9a-f]{8}\.[0-9a-f]{8}\.[0-9a-f]{8}\.[0-9a-f]{8}$/.test(id || "")) fail(`${key}: リンクIDの形式が不正 (${id})`);
  if (!/^https:\/\/item\.rakuten\.co\.jp\/[^/]+\/[^/?]+\/$/.test(item || "")) fail(`${key}: 商品URLは https://item.rakuten.co.jp/<shop>/<code>/ の形（variantId は除去）にする (${item})`);
  if (!/^https:\/\/thumbnail\.image\.rakuten\.co\.jp\//.test(thumb || "")) fail(`${key}: サムネイルURLが不正 (${thumb})`);
  if (!/^[\d,]+円/.test(price || "")) fail(`${key}: 価格は「9,201円」の形 (${price})`);
  const shop = item.split("/")[3];
  byKey.set(key, { id, me_id, item_id, item, thumb, price, shop, shop_is_official: OFFICIAL_SHOPS.includes(shop) });
}

const facts = readFacts(dir);
const missing = [];
facts.products = facts.products.map((p) => {
  const r = byKey.get(p.key);
  if (!r) { missing.push(p.key); return p; }
  return { ...p, rakuten: { ...(p.rakuten || {}), ...r } };
});
writeFacts(dir, facts);
console.log(`取り込み: ${facts.products.length - missing.length}/${facts.products.length}`);
if (missing.length) console.log(`未取得: ${missing.join(", ")}`);
