// 記事の公開承認画面。自分のPCからだけ開ける（127.0.0.1 で待ち受け）。
// 使い方: npm run review  →  http://127.0.0.1:8790/
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { REPO_DIR, SLUG_RE, listReviews, previewPath, readReview, reviewDetail, updateReview } from "./review-store.mjs";
import { dequeue, enqueue, publisherState, resumeQueue } from "./publisher.mjs";

const PORT = Number(process.env.REVIEW_PORT || 8790);
const HOST = "127.0.0.1";
const UI_PATH = resolve(REPO_DIR, "admin/review.html");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json" };
const NOTE_MAX = 2000;

const send = (res, status, body, type = "application/json; charset=utf-8") => {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const ok = (res, data) => send(res, 200, { success: true, data, error: null });
const bad = (res, status, error) => send(res, status, { success: false, data: null, error });

const readBody = (req) => new Promise((resolveBody, reject) => {
  let raw = "";
  req.on("data", (chunk) => { raw += chunk; if (raw.length > 64 * 1024) { reject(new Error("本文が大きすぎます")); req.destroy(); } });
  req.on("end", () => { try { resolveBody(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("JSON として読めません")); } });
});

// 他のサイトから承認を送りつけられないように、書き込みは同じオリジンの専用ヘッダー付きだけ受ける
const isTrustedWrite = (req) => req.headers["x-review-client"] === "1" && (!req.headers.origin || req.headers.origin === `http://${HOST}:${PORT}`);

// プレビュー：/site/<path> はリポジトリのファイル、/site/<slug>.html は承認キューにあれば下書きの preview.html
const serveSite = (res, rel) => {
  const slug = rel.replace(/\.html$/, "");
  // 公開済みの記事は下書きではなく、サイトに置かれた実物を見せる
  const review = SLUG_RE.test(slug) && rel.endsWith(".html") ? readReview(slug) : null;
  if (review && review.status !== "published" && existsSync(previewPath(slug))) return send(res, 200, readFileSync(previewPath(slug)), TYPES[".html"]);
  const file = resolve(REPO_DIR, rel);
  const type = TYPES[extname(file)];
  if (!type || !file.startsWith(REPO_DIR + sep) || rel.split("/").some((p) => p.startsWith(".") || p.startsWith("_")) || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, "not found", "text/plain; charset=utf-8");
  return send(res, 200, readFileSync(file), type);
};

const actions = {
  approve: (review) => {
    if (!["pending", "failed"].includes(review.status)) throw new Error(`「${review.status}」の記事は承認できません`);
    const next = updateReview(review.slug, { status: "approved", approved_at: new Date().toISOString(), error: null });
    enqueue(review.slug);
    return next;
  },
  cancel: (review) => {
    if (review.status !== "approved" || !dequeue(review.slug)) throw new Error("公開処理が始まっているため取り消せません");
    return updateReview(review.slug, { status: "pending", approved_at: null });
  },
  reject: (review, body) => {
    if (!["pending", "failed"].includes(review.status)) throw new Error(`「${review.status}」の記事は差し戻せません`);
    const note = String(body.note || "").trim().slice(0, NOTE_MAX);
    if (!note) throw new Error("差し戻しの理由を書いてください");
    return updateReview(review.slug, { status: "rejected", reject_note: note, rejected_at: new Date().toISOString() });
  },
};

const handle = async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const path = decodeURIComponent(url.pathname);
  if (req.method === "GET" && path === "/") return send(res, 200, readFileSync(UI_PATH), TYPES[".html"]);
  if (req.method === "GET" && path.startsWith("/site/")) return serveSite(res, path.slice("/site/".length));
  if (req.method === "GET" && path === "/api/items") return ok(res, { items: listReviews(), publisher: publisherState() });
  const item = path.match(/^\/api\/items\/([a-z0-9-]+)(?:\/(approve|cancel|reject))?$/);
  if (!item) return bad(res, 404, "見つかりません");
  const [, slug, action] = item;
  const review = readReview(slug);
  if (!review) return bad(res, 404, `${slug} は承認キューにありません`);
  if (req.method === "GET" && !action) return ok(res, reviewDetail(slug));
  if (req.method !== "POST" || !action) return bad(res, 405, "この操作はできません");
  if (!isTrustedWrite(req)) return bad(res, 403, "この画面以外からの操作は受け付けません");
  try {
    return ok(res, actions[action](review, await readBody(req)));
  } catch (e) {
    return bad(res, 409, e.message);
  }
};

createServer((req, res) => handle(req, res).catch((e) => { console.error(e); bad(res, 500, "サーバーでエラーが起きました。ターミナルのログを確認してください"); }))
  .listen(PORT, HOST, () => {
    console.log(`承認画面: http://${HOST}:${PORT}/`);
    resumeQueue();
  });
