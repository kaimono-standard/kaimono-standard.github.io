import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const required = ["SITE_URL", "CONTACT_URL"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`公開設定が不足しています: ${missing.join(", ")}`);
  console.error(".env.exampleを参照し、環境変数を設定してください。");
  process.exit(1);
}

const siteUrl = process.env.SITE_URL.replace(/\/$/, "");
const contactUrl = process.env.CONTACT_URL;
const affiliateUrl = process.env.RAKUYOKO_AFFILIATE_HOME_URL || "";
const gaId = (process.env.GA_MEASUREMENT_ID || "").trim();
if (gaId && !/^G-[A-Z0-9]{4,12}$/.test(gaId)) { console.error("GA_MEASUREMENT_ID は G-XXXXXXXXXX の形式で指定してください。"); process.exit(1); }
for (const [label, value] of [["SITE_URL", siteUrl], ["CONTACT_URL", contactUrl], ...(affiliateUrl ? [["RAKUYOKO_AFFILIATE_HOME_URL", affiliateUrl]] : [])]) {
  try { new URL(value); } catch { console.error(`${label}が有効なURLではありません。`); process.exit(1); }
}

// 軽量なCSS圧縮（コメント・改行・記号周りの空白を落とすだけ。値の中の空白は保つ）
const minifyCss = (css) => css
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").map((line) => line.trim()).filter(Boolean).join("\n")
  .replace(/\s*([{};,>])\s*/g, "$1")
  .replace(/:\s+/g, ":")
  .replace(/;}/g, "}")
  .replace(/\n/g, "");

const root = resolve(".");
const output = resolve("dist");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const files = ["index.html", "articles.html", "sleep-earbuds-anker-guide.html", "electric-kettle-comparison.html", "closet-storage-case-comparison.html", "steam-humidifier-comparison.html", "sony-wh-ch730n-wh-ch720n-difference.html", "snack-nuts-comparison.html", "beginner-protein-comparison.html", "anker-liberty-5-liberty-4-difference.html", "logicool-mx-master-4-mx-master-3s-difference.html", "anker-liberty-5-pro-liberty-4-pro-difference.html", "solo-living-circulator-comparison.html", "dishwasher-safe-tumbler-comparison.html", "trackball-comparison.html", "engineer-keyboard-comparison.html", "dried-fruit-comparison.html", "carry-on-suitcase-comparison.html", "mobile-battery-comparison.html", "automatic-coffee-machine-comparison.html", "hand-blender-comparison.html", "oven-toaster-comparison.html", "electric-pressure-cooker-comparison.html", "coffee-maker-comparison.html", "stainless-bottle-comparison.html", "rakuyoko-rselect-under-700.html", "rakuyoko-minimum-order.html", "rakuyoko-shipping.html", "rakuyoko-returns-guide.html", "rakuyoko-safe.html", "rakuyoko-payment.html", "guide.html", "returns.html", "compare.html", "affiliate.html", "sources.html", "about.html", "editors.html", "404.html", "styles.css", "app.js", "config.js", "search-index.js", "search.js", "favicon.svg", "site.webmanifest", "robots.txt", "sitemap.xml", "_headers", ".nojekyll", "CNAME", "google3723ec5dfc7ec3ff.html"];
for (const file of files) await cp(resolve(root, file), resolve(output, file));

// アクセス解析（GA4）。ID が無いビルドでは何も入れない（ローカル確認・プレビューで計測しない）
const GA_TAG = `<script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script><script src="analytics.js"></script>`;
const GA_DISCLOSURE_FROM = "<h2>アクセス解析</h2><p>現在、外部アクセス解析サービスは導入していません。導入する場合は、利用サービスと収集範囲を本ページへ追記します。計算フォームへの入力内容は当サイトへ送信されません。</p>";
const GA_DISCLOSURE_TO = "<h2>アクセス解析</h2><p>記事の改善のため、Google LLC の Google アナリティクスを利用しています。閲覧したページ、参照元、おおよその地域、端末やブラウザの種類、商品リンクのクリック（店名と製品の区別）が、Cookie などを通じて Google に送信されます。氏名など個人を特定する情報は送信しません。計算フォームへの入力内容は送信されません。送信を止めたい場合は、ブラウザの設定で Cookie を無効にするか、<a href=\"https://tools.google.com/dlpage/gaoptout?hl=ja\" rel=\"noopener\">Google アナリティクス オプトアウト アドオン</a>を利用してください。Google によるデータの扱いは<a href=\"https://policies.google.com/technologies/partner-sites?hl=ja\" rel=\"noopener\">Google のポリシー</a>に記載されています。</p>";
if (gaId) {
  await writeFile(resolve(output, "analytics.js"), `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config",${JSON.stringify(gaId)});
`, "utf8");
}

const textFiles = files.filter((file) => /\.(?:html|js|xml|txt|css)$/.test(file));
for (const file of textFiles) {
  const path = resolve(output, file);
  let content = await readFile(path, "utf8");
  content = content.replaceAll("https://example.com", siteUrl);
  if (gaId && file.endsWith(".html")) content = content.replace("</head>", `${GA_TAG}</head>`);
  if (gaId && file === "about.html") {
    if (!content.includes(GA_DISCLOSURE_FROM)) { console.error("about.html のアクセス解析の文が見つかりません。開示文を差し替えられないのでビルドを止めます。"); process.exit(1); }
    content = content.replace(GA_DISCLOSURE_FROM, GA_DISCLOSURE_TO);
  }
  if (file === "styles.css") content = minifyCss(content);
  await writeFile(path, content, "utf8");
}
// GA4 を入れるビルドでは CSP にも Google の配信元を足す（_headers を解釈するホスティングに移したとき用）
if (gaId) {
  const headersPath = resolve(output, "_headers");
  const headers = await readFile(headersPath, "utf8");
  await writeFile(headersPath, headers
    .replace("script-src 'self'", "script-src 'self' https://www.googletagmanager.com")
    .replace("img-src 'self' data:", "img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com")
    .replace("connect-src 'self'", "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com"), "utf8");
}
console.log(`公開用ファイルを生成しました: ${output}`);
