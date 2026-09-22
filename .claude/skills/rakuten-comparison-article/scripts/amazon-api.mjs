// Amazon Creators API（PA-API 5 の後継。2026年5月に PA-API は終了）で Amazon.co.jp の商品情報を取る。
// 必要な環境変数（リポジトリ直下の .env。gitignore 済み）:
//   AMAZON_CREATORS_CREDENTIAL_ID     … アソシエイト・セントラル > ツール > Creators API で発行（プライマリアカウントのみ）
//   AMAZON_CREATORS_CREDENTIAL_SECRET
// 利用条件（Amazon 公式ドキュメント）: 日本のアソシエイトに登録済みで、過去30日に適格な売上が10件以上。満たさないと API がエラーを返す。
//
// 使い方:
//   node amazon-api.mjs search "<キーワード>" [--count 10]
//       候補を index|ASIN|価格|商品名 の形で表示する（スポンサー枠は混ざらない）
//   node amazon-api.mjs pick <ASIN> --key <facts.jsonのkey> --dir _drafts/<slug>
//       商品を取得し、facts.json の該当製品の amazon に asin・title・url・image・price を書き込む
//   node amazon-api.mjs get <ASIN> [--raw]
//       1件を表示する（--raw でAPIの応答をそのまま出す。応答形式の確認用）
//
// 価格の扱い：Amazon の価格は変わりやすく、表示するなら取得日時を併記する決まりがある。記事本文には書かず、
// facts.json に取得日時つきで残して、比較や選定の参考にだけ使う（editorial-rules.md）。
import { resolve } from "node:path";
import { AMAZON_TAG, REPO_DIR, fail, readEnv, readFacts, writeFacts } from "./lib.mjs";

const TOKEN_URL = "https://api.amazon.co.jp/auth/o2/token"; // FE リージョン（JP）。認証バージョン 3.3
const API_BASE = "https://creatorsapi.amazon/catalog/v1";
const MARKETPLACE = "www.amazon.co.jp";
const RESOURCES = ["itemInfo.title", "itemInfo.byLineInfo", "itemInfo.manufactureInfo", "images.primary.large", "offersV2.listings.price", "offersV2.listings.availability", "offersV2.listings.merchantInfo"];

const env = readEnv();
const CLIENT_ID = env.AMAZON_CREATORS_CREDENTIAL_ID;
const CLIENT_SECRET = env.AMAZON_CREATORS_CREDENTIAL_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) fail("AMAZON_CREATORS_CREDENTIAL_ID と AMAZON_CREATORS_CREDENTIAL_SECRET を .env に設定してください（アソシエイト・セントラル > ツール > Creators API）");

const [cmd, ...rest] = process.argv.slice(2);
const opt = (name, def) => { const i = rest.indexOf(name); return i > -1 ? rest[i + 1] : def; };

const getToken = async () => {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: "creatorsapi::default" }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) fail(`トークンを取得できません（HTTP ${res.status}）: ${body.error_description || body.error || "応答が不正"}`);
  return body.access_token;
};

const call = async (operation, payload) => {
  const token = await getToken();
  const res = await fetch(`${API_BASE}/${operation}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-marketplace": MARKETPLACE },
    body: JSON.stringify({ partnerTag: AMAZON_TAG, marketplace: MARKETPLACE, resources: RESOURCES, ...payload }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body.errors?.[0]?.message || body.message || JSON.stringify(body).slice(0, 300);
    const hint = res.status === 401 || res.status === 403 ? "（売上件数の条件を満たしていない、または認証情報が違う可能性）" : "";
    fail(`${operation} が失敗しました（HTTP ${res.status}）${hint}: ${reason}`);
  }
  return body;
};

// 応答の入れ物は searchResult / itemsResult の下か直下か、版によって揺れがあるので両方を見る
const itemsOf = (body) => body.searchResult?.items || body.itemsResult?.items || body.items || [];

const summarize = (item) => {
  const listing = item.offersV2?.listings?.[0];
  return {
    asin: item.asin,
    title: item.itemInfo?.title?.displayValue || "",
    brand: item.itemInfo?.byLineInfo?.brand?.displayValue || "",
    model: item.itemInfo?.manufactureInfo?.model?.displayValue || "",
    url: item.detailPageURL || `https://www.amazon.co.jp/dp/${item.asin}/?tag=${AMAZON_TAG}`,
    image: item.images?.primary?.large?.url || "",
    price: listing?.price?.money?.displayAmount || "",
    availability: listing?.availability?.type || listing?.availability?.message || "",
    merchant: listing?.merchantInfo?.name || "",
  };
};

const ASIN_RE = /^[A-Z0-9]{10}$/;

if (cmd === "search") {
  const keywords = rest.find((a) => !a.startsWith("--"));
  if (!keywords) fail('使い方: node amazon-api.mjs search "<キーワード>"');
  const body = await call("searchItems", { keywords, itemCount: Number(opt("--count", 10)) });
  itemsOf(body).map(summarize).forEach((it, i) => console.log(`${i}|${it.asin}|${it.price || "-"}|${it.merchant || "-"}|${it.title.slice(0, 90)}`));
} else if (cmd === "get" || cmd === "pick") {
  const asin = rest.find((a) => !a.startsWith("--"));
  if (!ASIN_RE.test(asin || "")) fail("ASIN（英数字10桁）を指定してください");
  const body = await call("getItems", { itemIds: [asin], itemIdType: "ASIN" });
  if (rest.includes("--raw")) { console.log(JSON.stringify(body, null, 2)); process.exit(0); }
  const item = itemsOf(body)[0];
  if (!item) fail(`${asin} の商品情報が返りませんでした`);
  const info = summarize(item);
  console.log(JSON.stringify(info, null, 2));
  if (cmd === "pick") {
    const key = opt("--key"), dirArg = opt("--dir");
    if (!key || !dirArg) fail("pick には --key と --dir が必要です");
    const dir = resolve(REPO_DIR, dirArg);
    const facts = readFacts(dir);
    const target = facts.products.find((p) => p.key === key);
    if (!target) fail(`facts.json に key "${key}" の製品がありません`);
    const amazon = { ...(target.amazon || {}), asin: info.asin, title: info.title, url: info.url, image: info.image, price: info.price, price_checked_at: new Date().toISOString(), source: "creators-api" };
    writeFacts(dir, { ...facts, products: facts.products.map((p) => (p.key === key ? { ...p, amazon } : p)) });
    console.log(`✓ facts.json の ${key}.amazon を更新（ASIN ${info.asin}）`);
  }
} else {
  fail("使い方: node amazon-api.mjs search|get|pick …（先頭のコメント参照）");
}
