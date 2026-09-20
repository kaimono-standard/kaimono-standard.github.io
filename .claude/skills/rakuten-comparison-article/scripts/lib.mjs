// 共通ユーティリティ。各スクリプトから import する。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_DIR = resolve(SKILL_DIR, "../../..");
export const UT = "eyJwYWdlIjoiaXRlbSIsInR5cGUiOiJwaWN0dGV4dCIsInNpemUiOiIyNDB4MjQwIiwibmFtIjoxLCJuYW1wIjoicmlnaHQiLCJjb20iOjEsImNvbXAiOiJkb3duIiwicHJpY2UiOjEsImJvciI6MSwiY29sIjoxLCJiYnRuIjoxLCJwcm9kIjowLCJhbXAiOmZhbHNlfQ%3D%3D";

export const OFFICIAL_SHOPS = ["panasonic-store", "siroca", "braunhousehold", "bruno-official", "tiger-online", "tiger-official-store", "irisplaza-r", "bellevie-harima", "twinbird", "zojirushi-direct", "thermos-shop", "delonghi", "fujisangyo", "brewmatic-jura"];

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
export const affiliateUrl = (r) => `https://hb.afl.rakuten.co.jp/ichiba/${r.id}/?pc=${encodeURIComponent(r.item)}&link_type=picttext&ut=${UT}`;
export const imageUrl = (r) => `https://hbb.afl.rakuten.co.jp/hgb/${r.id}/?me_id=${r.me_id}&amp;item_id=${r.item_id}&amp;pc=${encodeURIComponent(r.thumb + "?_ex=240x240")}&amp;s=240x240&amp;t=picttext`;

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
