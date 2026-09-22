// ブラウザ無しで Amazon.co.jp の検索結果から ASIN 候補を列挙する。
// 使い方: node amazon-asin.mjs "<検索語>" [--max 12]
// 出力: index|ASIN|sponsored|価格|商品名（先頭90字）
// 選定基準は SKILL.md 3b の通り：正規の型番と一致し、スポンサー枠・並行輸入・中古・セット品・
// Amazon限定型番（末尾 AM / AZ など）を除いた出品だけを facts.json の amazon.asin に入れる。

const args = process.argv.slice(2);
const q = args.find((a) => !a.startsWith("--"));
if (!q) { console.error('使い方: node amazon-asin.mjs "<検索語>" [--max N]'); process.exit(1); }
const i = args.indexOf("--max");
const max = i > -1 ? Number(args[i + 1]) : 12;

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ja,en-US;q=0.8,en;q=0.7",
};
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
const strip = (h) => decode(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const res = await fetch(`https://www.amazon.co.jp/s?k=${encodeURIComponent(q)}`, { headers });
if (!res.ok) { console.error(`✗ HTTP ${res.status}（Amazon がブロックした場合は時間を置くか Chrome で確認）`); process.exit(2); }
const html = await res.text();
if (/captcha|ロボットではない/i.test(html) && !/data-asin="[A-Z0-9]{10}"/.test(html)) { console.error("✗ CAPTCHA ページ。時間を置くか Chrome で確認"); process.exit(2); }

// 検索結果カードごとに切り出す
const cards = html.split(/(?=<div[^>]+data-asin="[A-Z0-9]{10}"[^>]+data-component-type="s-search-result")/).slice(1);
const rows = [];
for (const c of cards) {
  const asin = c.match(/data-asin="([A-Z0-9]{10})"/)?.[1];
  if (!asin) continue;
  const title = strip((c.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [, ""])[1]).slice(0, 90);
  const sponsored = /スポンサー|Sponsored|puis-sponsored-label/.test(c) ? "SP" : "";
  const price = (c.match(/class="a-offscreen">([^<]+)</) || [, "-"])[1];
  rows.push(`${rows.length}|${asin}|${sponsored}|${price}|${title}`);
  if (rows.length >= max) break;
}
console.log(rows.join("\n") || "NO RESULTS");
