// 共通ユーティリティ。各スクリプトから import する。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_DIR = resolve(SKILL_DIR, "../../..");
export const UT = "eyJwYWdlIjoiaXRlbSIsInR5cGUiOiJwaWN0dGV4dCIsInNpemUiOiIyNDB4MjQwIiwibmFtIjoxLCJuYW1wIjoicmlnaHQiLCJjb20iOjEsImNvbXAiOiJkb3duIiwicHJpY2UiOjEsImJvciI6MSwiY29sIjoxLCJiYnRuIjoxLCJwcm9kIjowLCJhbXAiOmZhbHNlfQ%3D%3D";

export const OFFICIAL_SHOPS = ["panasonic-store", "siroca", "braunhousehold", "bruno-official", "tiger-online", "tiger-official-store", "irisplaza-r", "bellevie-harima", "twinbird", "zojirushi-direct", "thermos-shop", "delonghi", "fujisangyo", "brewmatic-jura", "anker", "machinoomise", "ugreen-gear", "belkin-shop", "elecom", "samsonite", "ace-store", "mujirushi-ryohin", "373shinshu", "kojima-ya", "pokkasapporo", "hario-onlinestore", "asvel", "pfudirect", "realforce", "logicool", "keychron", "koizumi-onlineshop", "x-plosion", "realstyle4u", "calinuts"];

export const fail = (message) => { console.error(`✗ ${message}`); process.exit(1); };

export const draftDir = (arg) => {
  if (!arg) fail("使い方: node <script> _drafts/<slug>");
  const dir = resolve(REPO_DIR, arg);
  if (!existsSync(resolve(dir, "facts.json"))) fail(`${dir}/facts.json がありません`);
  return dir;
};

export const readFacts = (dir) => JSON.parse(readFileSync(resolve(dir, "facts.json"), "utf8"));
export const writeFacts = (dir, facts) => writeFileSync(resolve(dir, "facts.json"), JSON.stringify(facts, null, 2) + "\n", "utf8");
export const readRepo = (file) => readFileSync(resolve(REPO_DIR, file), "utf8");
export const writeRepo = (file, content) => writeFileSync(resolve(REPO_DIR, file), content, "utf8");

// 楽天アフィリエイトの計測付きURLと画像URL。config.js / 記事の既存表記と同じ形にする。
// 管理画面で取ったリンク（id / me_id / item_id）と、楽天ウェブサービスAPIで取ったリンク（affiliate_url のみ）の両方に対応する。
// API経由の場合は計測付きURLをそのまま使い、画像は hgb ラッパーを通さず楽天のサムネイルを直接参照する。
export const hasConsoleLink = (r) => /^[0-9a-f]{8}\.[0-9a-f]{8}\.[0-9a-f]{8}\.[0-9a-f]{8}$/.test(r?.id || "");
export const hasLink = (r) => Boolean(r && (hasConsoleLink(r) || /^https:\/\/hb\.afl\.rakuten\.co\.jp\//.test(r.affiliate_url || "")));
export const affiliateUrl = (r) => hasConsoleLink(r)
  ? `https://hb.afl.rakuten.co.jp/ichiba/${r.id}/?pc=${encodeURIComponent(r.item)}&link_type=picttext&ut=${UT}`
  : r.affiliate_url;
export const imageUrl = (r) => hasConsoleLink(r) && r.me_id && r.item_id
  ? `https://hbb.afl.rakuten.co.jp/hgb/${r.id}/?me_id=${r.me_id}&amp;item_id=${r.item_id}&amp;pc=${encodeURIComponent(r.thumb + "?_ex=240x240")}&amp;s=240x240&amp;t=picttext`
  : `${r.thumb}?_ex=240x240`;

// リポジトリ直下の .env（gitignore 済み）から KEY=VALUE を読む。process.env が優先。
export const readEnv = () => {
  const out = { ...process.env };
  const path = resolve(REPO_DIR, ".env");
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
};

// Amazon アソシエイト。facts の amazon.asin があれば商品ページ、無ければ型番の検索結果ページ。withTag=false は data-fallback 用（タグ無し）。
export const AMAZON_TAG = "kaimonostd-22";
export const amazonQuery = (p) => p.amazon?.query || [p.brand, p.model].filter(Boolean).join(" ");
export const amazonUrl = (p, withTag = true) => {
  const tag = withTag ? `tag=${AMAZON_TAG}` : "";
  if (/^[A-Z0-9]{10}$/.test(p.amazon?.asin || "")) return `https://www.amazon.co.jp/dp/${p.amazon.asin}/${tag ? "?" + tag : ""}`;
  return `https://www.amazon.co.jp/s?k=${encodeURIComponent(amazonQuery(p))}${tag ? "&" + tag : ""}`;
};

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 挿入位置の改行コードは LF / CRLF どちらでも探す（Windows で編集されたファイルが混ざるため）
export const insertOnce = (content, marker, needle, insertion, label) => {
  if (content.includes(needle)) { console.log(`= ${label}: 登録済み`); return content; }
  const crlf = (s) => s.replace(/\r?\n/g, "\r\n");
  const [m, ins] = content.includes(marker) ? [marker, insertion] : [crlf(marker), crlf(insertion)];
  if (!content.includes(m)) fail(`${label}: 挿入位置 ${JSON.stringify(marker.slice(0, 60))} が見つかりません`);
  console.log(`+ ${label}`);
  return content.replace(m, m + ins);
};
