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
for (const [label, value] of [["SITE_URL", siteUrl], ["CONTACT_URL", contactUrl], ...(affiliateUrl ? [["RAKUYOKO_AFFILIATE_HOME_URL", affiliateUrl]] : [])]) {
  try { new URL(value); } catch { console.error(`${label}が有効なURLではありません。`); process.exit(1); }
}

const root = resolve(".");
const output = resolve("dist");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const files = ["index.html", "articles.html", "electric-kettle-comparison.html", "oven-toaster-comparison.html", "electric-pressure-cooker-comparison.html", "coffee-maker-comparison.html", "stainless-bottle-comparison.html", "rakuyoko-rselect-under-700.html", "rakuyoko-minimum-order.html", "rakuyoko-shipping.html", "rakuyoko-returns-guide.html", "rakuyoko-safe.html", "rakuyoko-payment.html", "guide.html", "returns.html", "compare.html", "affiliate.html", "sources.html", "about.html", "404.html", "styles.css", "app.js", "config.js", "search-index.js", "search.js", "favicon.svg", "site.webmanifest", "robots.txt", "sitemap.xml", "_headers", ".nojekyll"];
for (const file of files) await cp(resolve(root, file), resolve(output, file));

const textFiles = files.filter((file) => /\.(?:html|js|xml|txt)$/.test(file));
for (const file of textFiles) {
  const path = resolve(output, file);
  let content = await readFile(path, "utf8");
  content = content.replaceAll("https://example.com", siteUrl);
  if (file === "config.js" && affiliateUrl) content = content.replace('home: ""', `home: ${JSON.stringify(affiliateUrl)}`);
  if (file === "about.html") {
    content = content.replace("連絡用メールアドレスはドメイン取得後に記載します。公開時にこの案内を正式な問い合わせ先へ差し替えます。", `問い合わせ窓口：<a href="${contactUrl}">GitHub Issues</a>`);
  }
  await writeFile(path, content, "utf8");
}
console.log(`公開用ファイルを生成しました: ${output}`);
