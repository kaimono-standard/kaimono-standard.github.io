// 閲覧データのレポート。GA4（閲覧・流入・商品リンクのクリック）と Search Console（検索語・表示回数・順位）を
// 1つのサービスアカウントで読み、_reports/analytics-<日付>.json と .md に書き出す。
// 使い方: node admin/analytics.mjs [--days 28]
// 必要な .env: GA4_PROPERTY_ID（数字）/ GSC_SITE_URL / GOOGLE_SERVICE_ACCOUNT_KEY（鍵 JSON のパス。_secrets/ は git 管理外）
// サービスアカウントのメールアドレスを、GA4 のプロパティ（閲覧者）と Search Console（制限付きユーザー）に追加しておくこと。
import { createSign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_DIR } from "./review-store.mjs";
import { readEnv } from "../.claude/skills/rakuten-comparison-article/scripts/lib.mjs";

const SCOPES = ["https://www.googleapis.com/auth/analytics.readonly", "https://www.googleapis.com/auth/webmasters.readonly"];
const ROW_LIMIT = 30;
const GSC_LAG_DAYS = 3; // Search Console は直近2〜3日のデータがまだ揃っていない

const fail = (message) => { console.error(`✗ ${message}`); process.exit(1); };
const env = readEnv();
const days = Number(process.argv[process.argv.indexOf("--days") + 1]) || 28;
if (!Number.isInteger(days) || days < 1 || days > 365) fail("--days は 1〜365 で指定してください");

const loadKey = () => {
  const keyPath = env.GOOGLE_SERVICE_ACCOUNT_KEY && resolve(REPO_DIR, env.GOOGLE_SERVICE_ACCOUNT_KEY);
  if (!keyPath || !existsSync(keyPath)) fail("GOOGLE_SERVICE_ACCOUNT_KEY（サービスアカウントの鍵 JSON のパス）を .env に設定してください");
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  if (!key.client_email || !key.private_key) fail("鍵 JSON に client_email / private_key がありません。サービスアカウントの鍵を JSON 形式で作り直してください");
  return key;
};

const base64url = (value) => Buffer.from(value).toString("base64url");
const getToken = async (key) => {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = key.token_uri || "https://oauth2.googleapis.com/token";
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({ iss: key.client_email, scope: SCOPES.join(" "), aud: tokenUri, iat: now, exp: now + 3600 }))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) fail(`Google の認証に失敗しました（HTTP ${res.status}）: ${body.error_description || body.error || "応答が不正"}`);
  return body.access_token;
};

const postJson = async (url, token, payload, label) => {
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: `${label}: HTTP ${res.status} ${body.error?.message || ""}`.trim() };
  return body;
};

const ymd = (date) => date.toISOString().slice(0, 10);
const daysAgo = (n) => ymd(new Date(Date.now() - n * 86400000));

// GA4 の応答を [{次元..., 指標...}] に平たくする
const gaRows = (body) => {
  if (body.error) return { error: body.error };
  const dims = (body.dimensionHeaders || []).map((h) => h.name);
  const mets = (body.metricHeaders || []).map((h) => h.name);
  return (body.rows || []).map((row) => ({
    ...Object.fromEntries(dims.map((d, i) => [d, row.dimensionValues[i].value])),
    ...Object.fromEntries(mets.map((m, i) => [m, Number(row.metricValues[i].value)])),
  }));
};

const ga4Reports = async (token) => {
  if (!/^\d+$/.test(env.GA4_PROPERTY_ID || "")) return { error: "GA4_PROPERTY_ID（数字のプロパティID）が .env にありません" };
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_PROPERTY_ID}:runReport`;
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: "yesterday" }];
  const report = async (label, dimensions, metrics, extra = {}) => gaRows(await postJson(url, token, {
    dateRanges, dimensions: dimensions.map((name) => ({ name })), metrics: metrics.map((name) => ({ name })), limit: ROW_LIMIT, ...extra,
  }, `GA4 ${label}`));
  const clickFilter = { dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: "affiliate_click" } } } };
  return {
    totals: await report("合計", [], ["activeUsers", "sessions", "screenPageViews", "engagementRate"]),
    pages: await report("ページ", ["pagePath"], ["screenPageViews", "activeUsers", "userEngagementDuration"], { orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }] }),
    channels: await report("流入元", ["sessionDefaultChannelGroup"], ["sessions", "activeUsers"], { orderBys: [{ metric: { metricName: "sessions" }, desc: true }] }),
    devices: await report("端末", ["deviceCategory"], ["activeUsers"]),
    affiliate_clicks_by_page: await report("商品リンクのクリック", ["pagePath"], ["eventCount"], { ...clickFilter, orderBys: [{ metric: { metricName: "eventCount" }, desc: true }] }),
    // 店別の内訳は GA4 の管理画面でカスタムディメンション store（イベントパラメータ store）を登録すると取れる
    affiliate_clicks_by_store: await report("店別のクリック", ["customEvent:store"], ["eventCount"], clickFilter),
  };
};

const gscReports = async (token) => {
  if (!env.GSC_SITE_URL) return { error: "GSC_SITE_URL が .env にありません" };
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(env.GSC_SITE_URL)}/searchAnalytics/query`;
  const range = { startDate: daysAgo(days + GSC_LAG_DAYS), endDate: daysAgo(GSC_LAG_DAYS) };
  const rows = (body) => body.error ? { error: body.error } : (body.rows || []).map((r) => ({ key: r.keys.join(" / "), clicks: r.clicks, impressions: r.impressions, ctr: Math.round(r.ctr * 1000) / 10, position: Math.round(r.position * 10) / 10 }));
  const query = async (dimensions) => rows(await postJson(url, token, { ...range, dimensions, rowLimit: ROW_LIMIT }, `Search Console ${dimensions.join("×")}`));
  return { range, queries: await query(["query"]), pages: await query(["page"]), query_page: await query(["query", "page"]) };
};

// Markdown の要約（Claude が読んで次の企画を決める用）
const table = (rows, columns) => {
  if (!Array.isArray(rows)) return `（取得できませんでした: ${rows.error}）\n`;
  if (!rows.length) return "（データなし）\n";
  return [`| ${columns.join(" | ")} |`, `| ${columns.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${columns.map((c) => r[c] ?? "").join(" | ")} |`)].join("\n") + "\n";
};

const key = loadKey();
const token = await getToken(key);
const [ga4, gsc] = [await ga4Reports(token), await gscReports(token)];
const generatedAt = new Date().toISOString();
const report = { generated_at: generatedAt, days, ga4, gsc };

const md = [
  `# 閲覧データ（直近${days}日、${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })} 取得）`, "",
  "## GA4 合計", ga4.error ? `（${ga4.error}）\n` : table(ga4.totals, ["activeUsers", "sessions", "screenPageViews", "engagementRate"]),
  "## よく読まれたページ", ga4.error ? "" : table(ga4.pages, ["pagePath", "screenPageViews", "activeUsers", "userEngagementDuration"]),
  "## 流入元", ga4.error ? "" : table(ga4.channels, ["sessionDefaultChannelGroup", "sessions", "activeUsers"]),
  "## 端末", ga4.error ? "" : table(ga4.devices, ["deviceCategory", "activeUsers"]),
  "## 商品リンクのクリック（ページ別）", ga4.error ? "" : table(ga4.affiliate_clicks_by_page, ["pagePath", "eventCount"]),
  "## 商品リンクのクリック（店別）", ga4.error ? "" : table(ga4.affiliate_clicks_by_store, ["customEvent:store", "eventCount"]),
  `## 検索語（Search Console ${gsc.range?.startDate || ""}〜${gsc.range?.endDate || ""}）`, gsc.error ? `（${gsc.error}）\n` : table(gsc.queries, ["key", "clicks", "impressions", "ctr", "position"]),
  "## 検索からのページ", gsc.error ? "" : table(gsc.pages, ["key", "clicks", "impressions", "ctr", "position"]),
].join("\n");

const outDir = resolve(REPO_DIR, "_reports");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }); // 日本時間の日付
writeFileSync(resolve(outDir, `analytics-${stamp}.json`), JSON.stringify(report, null, 2) + "\n", "utf8");
writeFileSync(resolve(outDir, `analytics-${stamp}.md`), md + "\n", "utf8");
console.log(md);
console.log(`\n書き出し: _reports/analytics-${stamp}.json / .md`);
