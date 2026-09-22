// 生成した記事と配線の機械検証。使い方: node verify.mjs <slug> [--preview]
// --preview: 公開前（承認待ち）の _drafts/<slug>/preview.html を検査する。config.js と配線の検査は公開時に回す
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_DIR, fail, readRepo } from "./lib.mjs";

const slug = (process.argv[2] || "").replace(/\.html$/, "");
if (!slug) fail("使い方: node verify.mjs <slug>");
const preview = process.argv.includes("--preview");
const target = preview ? `_drafts/${slug}/preview.html` : `${slug}.html`;
if (!existsSync(resolve(REPO_DIR, target))) fail(`${target} がありません${preview ? "（wire.mjs --preview を先に実行）" : ""}`);
const html = readRepo(target);
// 記事の型で期待する数を変える（台帳が下書きフォルダに残っていれば読む）
const factsPath = resolve(REPO_DIR, `_drafts/${slug}/facts.json`);
const facts = existsSync(factsPath) ? JSON.parse(readRepo(`_drafts/${slug}/facts.json`)) : {};
const isVersion = facts.article_type === "version";
const N = isVersion ? 2 : 5;
const expectedRows = isVersion ? (facts.table_columns || []).length + 2 : 5; // 新旧は「発売」＋項目＋「価格」
const expectedSources = isVersion ? 3 : 5; // 新旧は新型・旧型・後継の根拠
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

// 見出しの頭の「結論：」「まとめ：」のような要約ラベル＋全角コロン（「出典：」や仕様の項目名は対象外）
const labelColon = html.match(/<(?:h[1-4]|p)(?: [^>]*)?>\s*(?:結論|まとめ|ポイント|要点|総評|結果|答え)：/g);
labelColon ? ng(`見出し頭の要約ラベル＋コロン: ${[...new Set(labelColon.map((m) => m.replace(/<[^>]+>\s*/, "")))].join(" / ")}`) : ok("見出し頭の要約ラベル（結論：等）なし");

// アフィリエイトキー
const keys = [...new Set([...html.matchAll(/data-affiliate="([^"]+)"/g)].map((m) => m[1]))];
const cfg = readRepo("config.js");
const missing = keys.filter((k) => !new RegExp(`\\b${k}: "https://`).test(cfg));
keys.length === N ? ok(`data-affiliate キー ${N}種: ${keys.join(", ")}`) : ng(`data-affiliate キーが ${keys.length} 種（${N}種のはず）`);
if (!preview) missing.length ? ng(`config.js に未設定: ${missing.join(", ")}`) : ok("config.js に全キー設定済み");
const anchors = [...html.matchAll(/<a\b[^>]*data-affiliate=[^>]*>/g)].map((m) => m[0]);
const badAnchors = anchors.filter((a) => !/rel="nofollow sponsored noopener"/.test(a) || !/data-fallback="https:\/\/item\.rakuten\.co\.jp\//.test(a) || !/target="_blank"/.test(a));
badAnchors.length ? ng(`rel/data-fallback/target が不足しているリンク ${badAnchors.length} 本`) : ok(`商品リンク ${anchors.length} 本すべて rel="nofollow sponsored noopener" + data-fallback`);

// Amazon ボタン
const amzKeys = [...new Set([...html.matchAll(/data-amazon="([^"]+)"/g)].map((m) => m[1]))];
const amzMissing = amzKeys.filter((k) => !new RegExp(`\\b${k}: "https://www\\.amazon\\.co\\.jp`).test(cfg));
amzKeys.length === N ? ok(`data-amazon キー ${N}種`) : ng(`data-amazon キーが ${amzKeys.length} 種（${N}種のはず）`);
if (!preview) amzMissing.length ? ng(`config.js amazonLinks に未設定: ${amzMissing.join(", ")}`) : ok("config.js amazonLinks に全キー設定済み");
/tag=kaimonostd-22/.test(html) ? ng("記事HTMLにAmazonタグが直書きされている（config.js 経由にする）") : ok("Amazonタグは config.js 経由");

// 構成
const count = (re) => (html.match(re) || []).length;
const checks = [
  ["製品ブロック", count(/class="review-product"/g), N],
  ["結論ブロックの行", count(/class="summary-list"[\s\S]*?<\/div>/) ? (html.match(/class="summary-list"[\s\S]*?<\/div>/)[0].match(/<a href="#/g) || []).length : 0, N],
  ["比較表の行", ((html.match(/<tbody>[\s\S]*?<\/tbody>/) || [""])[0].match(/<tr[ >]/g) || []).length, expectedRows],
  ["出典リンク", ((html.match(/id="sources"[\s\S]*?<\/ul>/) || [""])[0].match(/<li>/g) || []).length, expectedSources],
  ["ヒーロー画像", ((html.match(/review-product-row[\s\S]*?<\/div>/) || [""])[0].match(/<img /g) || []).length, N],
];
for (const [label, n, want] of checks) n === want ? ok(`${label} ${n}`) : ng(`${label} ${n}（${want} のはず）`);
count(/class="fit-note"/g) === N && count(/class="caution-note"/g) === N ? ok(`fit-note / caution-note 各${N}`) : ng(`fit-note または caution-note が${N}つない`);
if (isVersion) {
  // 「違い」の印が付いた行が、台帳の specs で新旧の値が違う項目の数と一致するか
  const [a, b] = facts.products || [];
  const diffKeys = (facts.table_columns || []).filter((c) => String(a?.specs?.[c] ?? "") !== String(b?.specs?.[c] ?? ""));
  const marked = count(/class="is-diff"/g);
  marked === diffKeys.length ? ok(`「違い」の印 ${marked}行（台帳と一致）`) : ng(`「違い」の印が ${marked}行、台帳で値が違う項目は ${diffKeys.length}（${diffKeys.join("・")}）`);
  /\{\{PRICEDIFF|差は\s*です/.test(html) ? ng("価格差が埋まっていない") : ok("価格差の一文あり");
}
/review-page/.test(html) ? ok('body.review-page') : ng("body に review-page クラスがない");

// 出典が公式ドメインか（小売・比較サイトが混ざっていないか）
const sources = [...(html.match(/id="sources"[\s\S]*?<\/ul>/) || [""])[0].matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1]);
const suspicious = sources.filter((u) => /kakaku\.com|amazon\.|yodobashi|biccamera|rakuten\.co\.jp|my-best|note\.com|wikipedia/.test(u));
suspicious.length ? ng(`出典に一次情報でないURL: ${suspicious.join(", ")}`) : ok("出典はすべてメーカー系ドメイン");

// 配線（公開時のみ）
if (!preview) {
readRepo("build.mjs").includes(`"${slug}.html"`) ? ok("build.mjs 登録済み") : ng("build.mjs 未登録");
readRepo("sitemap.xml").includes(`/${slug}.html<`) ? ok("sitemap.xml 登録済み") : ng("sitemap.xml 未登録");
readRepo("search-index.js").includes(`${slug}.html"`) ? ok("search-index.js 登録済み") : ng("search-index.js 未登録");
readRepo("articles.html").includes(`href="${slug}.html"`) ? ok("articles.html 登録済み") : ng("articles.html 未登録");
}

// --online: ブラウザ無しで画像と商品URLの到達性を確認する（Codex 単独運用向け）
if (process.argv.includes("--online")) {
  const decode = (s) => s.replace(/&amp;/g, "&");
  const imgSrcs = [...new Set([...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => decode(m[1])))];
  const thumbs = imgSrcs.map((u) => { const m = u.match(/[?&]pc=([^&]+)/); return m ? decodeURIComponent(m[1]) : u; });
  const items = [...new Set([...html.matchAll(/data-fallback="([^"]+)"/g)].map((m) => m[1]))];
  const ua = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36" };
  const head = async (u) => { try { const r = await fetch(u, { method: "GET", headers: { ...ua, Range: "bytes=0-0" }, redirect: "follow" }); return r.status; } catch (e) { return `ERR ${e.message}`; } };
  for (const u of thumbs) { const st = await head(u); (st === 200 || st === 206) ? ok(`画像 ${st} ${u.slice(0, 80)}`) : ng(`画像 ${st} ${u}`); }
  for (const u of items) { const st = await head(u); (st === 200 || st === 206) ? ok(`商品ページ ${st} ${u}`) : ng(`商品ページ ${st} ${u}`); }
}

// 最上級表現は目視用に列挙
const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const superlatives = [...text.matchAll(/.{0,25}(最も|最軽量|最大|最小|最少|最高|最長|最短|いちばん|唯一|最速).{0,25}/g)].map((m) => m[0].trim());
console.log(`\n最上級表現 ${superlatives.length} 件（比較表の数値と照合すること）:`);
superlatives.forEach((s) => console.log(`  - …${s}…`));

console.log(problems.length ? `\n✗ ${problems.length} 件の問題` : "\n✓ 機械検証 OK");
process.exit(problems.length ? 1 : 0);
