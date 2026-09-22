// article.tpl.html を <slug>.html に解決し、サイトの各所へ登録する（冪等）。
// 使い方: node wire.mjs _drafts/<slug> [--preview]
// --preview: サイトには触らず、解決済みHTMLを _drafts/<slug>/preview.html に書くだけ（承認待ちの確認用）
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { affiliateUrl, amazonUrl, draftDir, escapeHtml, fail, hasLink, imageUrl, insertOnce, readFacts, readRepo, writeRepo } from "./lib.mjs";

const dir = draftDir(process.argv[2]);
const facts = readFacts(dir);
const { slug, date } = facts;
const tplPath = resolve(dir, "article.tpl.html");
if (!existsSync(tplPath)) fail(`${tplPath} がありません（codex-draft.mjs を先に実行）`);
const byKey = Object.fromEntries(facts.products.map((p) => [p.key, p]));

// 1. プレースホルダ解決 → <slug>.html
let html = readFileSync(tplPath, "utf8").replace(/\{\{AMAZON:(\w+)\}\}/g, (_, key) => {
  const p = byKey[key];
  if (!p) fail(`プレースホルダ AMAZON:${key} に対応する製品がありません`);
  return amazonUrl(p, false);
}).replace(/\{\{(IMGRAW|IMG|ITEM|PRICE):(\w+)\}\}/g, (_, kind, key) => {
  const p = byKey[key];
  if (!hasLink(p?.rakuten)) fail(`プレースホルダ ${kind}:${key} に対応する製品/rakuten がありません`);
  return { IMG: imageUrl(p.rakuten), IMGRAW: imageUrl(p.rakuten).replace(/&amp;/g, "&"), ITEM: p.rakuten.item, PRICE: p.rakuten.price }[kind];
});
if (process.argv.includes("--preview")) {
  writeFileSync(resolve(dir, "preview.html"), html, "utf8");
  console.log(`+ ${resolve(dir, "preview.html")} を書き出し（サイトには未配線）`);
  process.exit(0);
}
writeRepo(`${slug}.html`, html);
console.log(`+ ${slug}.html を書き出し`);

// 2. config.js
let cfg = readRepo("config.js");
const newKeys = facts.products.filter((p) => !new RegExp(`\\b${p.key}:`).test(cfg));
if (newKeys.length) {
  const lines = newKeys.map((p) => `    ${p.key}: ${JSON.stringify(affiliateUrl(p.rakuten))}`).join(",\n");
  // affiliateLinks ブロックの最後の値の直後に足す（ブロックは `  },` で閉じ、その後に amazonLinks が続く）
  const updated = cfg.replace(/(affiliateLinks:\s*\{[\s\S]*?"\s*)\n(\s*\},)/, `$1,\n${lines}\n$2`);
  if (updated === cfg) fail("config.js の affiliateLinks の末尾が見つかりません");
  cfg = updated; writeRepo("config.js", cfg); console.log(`+ config.js: ${newKeys.map((p) => p.key).join(", ")}`);
} else console.log("= config.js: 登録済み");
// 2b. config.js の amazonLinks（型番の検索結果リンク。facts の amazon.asin があれば /dp/ リンク）
if (!/amazonLinks:\s*\{/.test(cfg)) fail("config.js に amazonLinks がありません");
const newAmz = facts.products.filter((p) => !new RegExp(`\\b${p.key}: "https://www\\.amazon\\.co\\.jp`).test(cfg));
if (newAmz.length) {
  const lines = newAmz.map((p) => `    ${p.key}: ${JSON.stringify(amazonUrl(p, true))}`).join(",\n");
  const updated = cfg.replace(/(amazonLinks:\s*\{[\s\S]*?"\s*)\n(\s*\}\s*\n\};)/, `$1,\n${lines}\n$2`);
  if (updated === cfg) fail("config.js の amazonLinks の末尾が見つかりません");
  cfg = updated; writeRepo("config.js", cfg); console.log(`+ config.js amazonLinks: ${newAmz.map((p) => p.key).join(", ")}`);
} else console.log("= config.js amazonLinks: 登録済み");
// 2c. 登録済みキーの URL が facts と違えば差し替える（検索リンク → /dp/ASIN への切り替え用）
const changedAmz = [];
for (const p of facts.products) {
  const re = new RegExp(`(\\b${p.key}: )"https://www\\.amazon\\.co\\.jp[^"]*"`);
  const want = JSON.stringify(amazonUrl(p, true));
  if (re.test(cfg) && !cfg.includes(`${p.key}: ${want}`)) { cfg = cfg.replace(re, `$1${want}`); changedAmz.push(p.key); }
}
if (changedAmz.length) { writeRepo("config.js", cfg); console.log(`~ config.js amazonLinks 更新: ${changedAmz.join(", ")}`); }

// 3. build.mjs / sitemap.xml
writeRepo("build.mjs", insertOnce(readRepo("build.mjs"), '"electric-kettle-comparison.html", ', `"${slug}.html"`, `"${slug}.html", `, "build.mjs"));
writeRepo("sitemap.xml", insertOnce(readRepo("sitemap.xml"), "  <url><loc>https://example.com/electric-kettle-comparison.html</loc></url>\n", `/${slug}.html<`, `  <url><loc>https://example.com/${slug}.html</loc></url>\n`, "sitemap.xml"));

// 4. search-index.js（配列の先頭に追加）
const title = (html.match(/<h1>([^<]+)<\/h1>/) || [])[1] || facts.topic;
const summary = (html.match(/<meta name="description" content="([^"]+)"/) || [])[1] || "";
const entry = {
  url: `${slug}.html`, type: "商品比較", category: facts.category_label, updated: date, title, summary: summary.replace(/メーカー公式仕様を確認して整理しました。?$/, "").trim(),
  keywords: facts.keywords || [facts.topic],
  products: facts.products.map((p) => ({ name: p.name, brand: [p.brand, ...(p.brand_aliases || [])].join(" "), model: p.model, anchor: p.anchor, note: (p.features || [])[0] || "" })),
};
writeRepo("search-index.js", insertOnce(readRepo("search-index.js"), "window.SEARCH_INDEX = [\n", `${slug}.html"`, "  " + JSON.stringify(entry, null, 2).split("\n").join("\n  ") + ",\n", "search-index.js"));

// 5. articles.html（商品比較グリッド先頭にカード）
const imgs = facts.products.slice(0, 3).map((p) => `<img loading="lazy" src="${imageUrl(p.rakuten)}" width="240" height="240" alt="${escapeHtml(p.name)}">`).join("");
const badge = facts.badge || "5機種比較";
const card = `          <a class="article-card" href="${slug}.html"><div class="article-card-media">${imgs}<span class="article-card-badge">${badge}</span></div><div class="article-card-body"><div class="directory-list-meta"><span>${escapeHtml(facts.category_label)}</span><time datetime="${date}">${date.replace(/-/g, ".")}</time></div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(facts.card_summary || entry.summary)}</p><span class="directory-read">記事を読む</span></div></a>\n`;
let articles = readRepo("articles.html");
if (!articles.includes(`href="${slug}.html"`)) articles = articles.replace(/(<dt>公開記事<\/dt><dd>)(\d+)(本<\/dd>)/, (_, a, n, b) => `${a}${Number(n) + 1}${b}`);
writeRepo("articles.html", insertOnce(articles, '<div class="article-cards" aria-label="商品比較記事一覧">\n', `href="${slug}.html"`, card, "articles.html"));

// 6. sources.html（変更履歴）
const row = `<tr><td>${date}</td><td>商品比較記事を追加（${escapeHtml(facts.topic)}）。仕様はメーカー公式ページ、価格は楽天市場で確認。</td><td class="status yes">反映済み</td></tr>`;
writeRepo("sources.html", insertOnce(readRepo("sources.html"), "<tbody>", `商品比較記事を追加（${escapeHtml(facts.topic)}）`, row, "sources.html"));

console.log("\n次: node .claude/skills/rakuten-comparison-article/scripts/codex-factcheck.mjs " + process.argv[2]);
