// 生成した記事と配線の機械検証。使い方: node verify.mjs <slug>
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_DIR, fail, readRepo } from "./lib.mjs";

const slug = (process.argv[2] || "").replace(/\.html$/, "");
if (!slug) fail("使い方: node verify.mjs <slug>");
if (!existsSync(resolve(REPO_DIR, `${slug}.html`))) fail(`${slug}.html がありません`);
const html = readRepo(`${slug}.html`);
const problems = [];
const ok = (label) => console.log(`✓ ${label}`);
const ng = (label) => { problems.push(label); console.log(`✗ ${label}`); };

// プレースホルダ・未確定記号
const leftovers = html.match(/\{\{[^}]*\}\}|TODO|\?\?\?|○○/g);
leftovers ? ng(`未解決の記号: ${[...new Set(leftovers)].join(" ")}`) : ok("プレースホルダなし");

// 読者向けの本文に運営側の仕組み（アフィリエイト管理画面など）を書かない
const bodyText = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
const internal = bodyText.match(/楽天アフィリエイト[^。<]{0,20}|アフィリエイト管理画面|商品リンクから取得/g);
internal ? ng(`運営側の表現が本文に残っている: ${[...new Set(internal)].join(" / ")}`) : ok("運営側の表現（楽天アフィリエイト等）なし");

// 見出し・段落の頭の「結論：」「ポイント：」のようなラベル＋全角コロン（仕様の <li><strong>項目：</strong> は対象外）
const labelColon = html.match(/<(?:h[1-4]|p)(?: [^>]*)?>\s*[^<：]{1,8}：/g);
labelColon ? ng(`見出し・段落頭のラベル＋コロン: ${[...new Set(labelColon.map((m) => m.replace(/<[^>]+>\s*/, "")))].join(" / ")}`) : ok("見出し・段落頭のラベル＋コロンなし");

// アフィリエイトキー
const keys = [...new Set([...html.matchAll(/data-affiliate="([^"]+)"/g)].map((m) => m[1]))];
const cfg = readRepo("config.js");
const missing = keys.filter((k) => !new RegExp(`\\b${k}: "https://`).test(cfg));
keys.length === 5 ? ok(`data-affiliate キー 5種: ${keys.join(", ")}`) : ng(`data-affiliate キーが ${keys.length} 種（5種のはず）`);
missing.length ? ng(`config.js に未設定: ${missing.join(", ")}`) : ok("config.js に全キー設定済み");
const anchors = [...html.matchAll(/<a\b[^>]*data-affiliate=[^>]*>/g)].map((m) => m[0]);
const badAnchors = anchors.filter((a) => !/rel="nofollow sponsored noopener"/.test(a) || !/data-fallback="https:\/\/item\.rakuten\.co\.jp\//.test(a) || !/target="_blank"/.test(a));
badAnchors.length ? ng(`rel/data-fallback/target が不足しているリンク ${badAnchors.length} 本`) : ok(`商品リンク ${anchors.length} 本すべて rel="nofollow sponsored noopener" + data-fallback`);

// 構成
const count = (re) => (html.match(re) || []).length;
const checks = [
  ["製品ブロック", count(/class="review-product"/g), 5],
  ["結論ブロックの行", count(/class="summary-list"[\s\S]*?<\/div>/) ? (html.match(/class="summary-list"[\s\S]*?<\/div>/)[0].match(/<a href="#/g) || []).length : 0, 5],
  ["比較表の行", (html.match(/<tbody>[\s\S]*?<\/tbody>/) || [""])[0].split("<tr>").length - 1, 5],
  ["出典リンク", ((html.match(/id="sources"[\s\S]*?<\/ul>/) || [""])[0].match(/<li>/g) || []).length, 5],
  ["ヒーロー画像", ((html.match(/review-product-row[\s\S]*?<\/div>/) || [""])[0].match(/<img /g) || []).length, 5],
];
for (const [label, n, want] of checks) n === want ? ok(`${label} ${n}`) : ng(`${label} ${n}（${want} のはず）`);
count(/class="fit-note"/g) === 5 && count(/class="caution-note"/g) === 5 ? ok("fit-note / caution-note 各5") : ng("fit-note または caution-note が5つない");
/review-page/.test(html) ? ok('body.review-page') : ng("body に review-page クラスがない");

// 出典が公式ドメインか（小売・比較サイトが混ざっていないか）
const sources = [...(html.match(/id="sources"[\s\S]*?<\/ul>/) || [""])[0].matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1]);
const suspicious = sources.filter((u) => /kakaku\.com|amazon\.|yodobashi|biccamera|rakuten\.co\.jp|my-best|note\.com|wikipedia/.test(u));
suspicious.length ? ng(`出典に一次情報でないURL: ${suspicious.join(", ")}`) : ok("出典はすべてメーカー系ドメイン");

// 配線
readRepo("build.mjs").includes(`"${slug}.html"`) ? ok("build.mjs 登録済み") : ng("build.mjs 未登録");
readRepo("sitemap.xml").includes(`/${slug}.html<`) ? ok("sitemap.xml 登録済み") : ng("sitemap.xml 未登録");
readRepo("search-index.js").includes(`${slug}.html"`) ? ok("search-index.js 登録済み") : ng("search-index.js 未登録");
readRepo("articles.html").includes(`href="${slug}.html"`) ? ok("articles.html 登録済み") : ng("articles.html 未登録");

// 最上級表現は目視用に列挙
const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const superlatives = [...text.matchAll(/.{0,25}(最も|最軽量|最大|最小|最少|最高|最長|最短|いちばん|唯一|最速).{0,25}/g)].map((m) => m[0].trim());
console.log(`\n最上級表現 ${superlatives.length} 件（比較表の数値と照合すること）:`);
superlatives.forEach((s) => console.log(`  - …${s}…`));

console.log(problems.length ? `\n✗ ${problems.length} 件の問題` : "\n✓ 機械検証 OK");
process.exit(problems.length ? 1 : 0);
