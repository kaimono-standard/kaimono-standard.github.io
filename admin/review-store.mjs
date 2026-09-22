// 承認キューのデータ層。各記事の状態は _drafts/<slug>/review.json に置く（_drafts は git 管理外）。
// status: pending（承認待ち） → approved（承認済み・公開待ち） → publishing → published
//         pending → rejected（差し戻し）／ publishing → failed（公開処理が失敗。もう一度承認できる）
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_DIR = resolve(fileURLToPath(import.meta.url), "../..");
export const DRAFTS_DIR = resolve(REPO_DIR, "_drafts");
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const reviewPath = (slug) => resolve(DRAFTS_DIR, slug, "review.json");
export const previewPath = (slug) => resolve(DRAFTS_DIR, slug, "preview.html");

const readJson = (path) => {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch (e) { console.error(`読み込めません: ${path}: ${e.message}`); return null; }
};

export const readReview = (slug) => {
  if (!SLUG_RE.test(slug) || !existsSync(reviewPath(slug))) return null;
  return readJson(reviewPath(slug));
};

// 状態の更新は常に新しいオブジェクトを書き戻す
export const updateReview = (slug, patch) => {
  const current = readReview(slug);
  if (!current) throw new Error(`${slug} は承認キューにありません`);
  const next = { ...current, ...patch, updated_at: new Date().toISOString() };
  writeFileSync(reviewPath(slug), JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
};

export const listReviews = () => {
  if (!existsSync(DRAFTS_DIR)) return [];
  return readdirSync(DRAFTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && SLUG_RE.test(d.name) && existsSync(reviewPath(d.name)))
    .map((d) => readJson(reviewPath(d.name)))
    .filter(Boolean)
    .sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)));
};

// 詳細表示用：台帳から製品と出典、照合結果の要約を足す
export const reviewDetail = (slug) => {
  const review = readReview(slug);
  if (!review) return null;
  const facts = readJson(resolve(DRAFTS_DIR, slug, "facts.json")) || {};
  const factcheckPath = resolve(DRAFTS_DIR, slug, "factcheck.json");
  const factcheck = existsSync(factcheckPath) ? readJson(factcheckPath) : null;
  const products = (facts.products || []).map((p) => ({ name: p.name, brand: p.brand, model: p.model, price: p.rakuten?.price || "", official_url: p.official_url || "" }));
  return { ...review, products, factcheck, has_preview: existsSync(previewPath(slug)) };
};
