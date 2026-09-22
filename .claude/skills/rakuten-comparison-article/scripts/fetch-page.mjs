// ブラウザ無しでメーカー公式ページを読むための取得スクリプト。HTML を本文テキストに落として表示する。
// 使い方: node fetch-page.mjs <url> [--raw] [--max 12000] [--grep <正規表現>]
//   --raw   HTML をそのまま出す（仕様表が <table> の場合の確認用）
//   --grep  一致する行の前後だけを出す（例: --grep "仕様|重量|消費電力"）
// 403 や JS レンダリングで本文が取れないときは、Codex のブラウザ機能で開くか、公式オンラインストア（楽天の公式店など）で確認する。

const args = process.argv.slice(2);
const url = args.find((a) => /^https?:\/\//.test(a));
if (!url) { console.error("使い方: node fetch-page.mjs <url> [--raw] [--max N] [--grep <regex>]"); process.exit(1); }
const opt = (name, def) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : def; };
const raw = args.includes("--raw");
const max = Number(opt("--max", 12000));
const grep = opt("--grep", null);

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ja,en-US;q=0.8,en;q=0.7",
};

const decode = (s) => s
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

const toText = (html) => {
  let h = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<noscript[\s\S]*?<\/noscript>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  // 表はセルをタブ区切り、行を改行にして仕様表が読めるようにする
  h = h.replace(/<\/(td|th)>/gi, "\t").replace(/<\/(tr|li|p|div|h[1-6]|dt|dd|section|article|br)\s*>/gi, "\n").replace(/<br\s*\/?>/gi, "\n");
  h = h.replace(/<[^>]+>/g, "");
  return decode(h).split(/\r?\n/).map((l) => l.replace(/[ \t　]+/g, " ").trim()).filter(Boolean).join("\n");
};

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 30000);
let res;
try {
  res = await fetch(url, { headers, redirect: "follow", signal: controller.signal });
} catch (e) {
  console.error(`✗ 取得失敗: ${e.message}`); process.exit(2);
} finally { clearTimeout(timer); }

// 文字コードは Content-Type か <meta charset> で判定する（sony.jp など Shift_JIS のメーカーページがあるため）
const bytes = Buffer.from(await res.arrayBuffer());
const headerCharset = (res.headers.get("content-type") || "").match(/charset=([\w-]+)/i)?.[1];
const metaCharset = bytes.subarray(0, 4096).toString("latin1").match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
const charset = (headerCharset || metaCharset || "utf-8").toLowerCase().replace(/^(x-)?(sjis|shift-jis|ms932|windows-31j)$/, "shift_jis");
let html;
try { html = new TextDecoder(charset).decode(bytes); } catch { html = new TextDecoder("utf-8").decode(bytes); }
console.log(`# ${res.status} ${res.statusText} ${res.url}${res.url !== url ? `  (from ${url})` : ""}`);
if (res.status === 403 || res.status === 503) console.log("# 403/503: ブラウザで開く（Codex のブラウザ機能）か、公式オンラインストアで確認する");
const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
if (title) console.log(`# title: ${decode(title).replace(/\s+/g, " ").trim()}`);

let out = raw ? html : toText(html);
if (grep) {
  const re = new RegExp(grep, "i");
  const lines = out.split("\n");
  const keep = new Set();
  lines.forEach((l, i) => { if (re.test(l)) for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 6); j++) keep.add(j); });
  out = lines.filter((_, i) => keep.has(i)).join("\n");
}
if (out.length > max) out = out.slice(0, max) + `\n… (${out.length - max} 文字省略。--max で増やすか --grep で絞る)`;
console.log(out);
