// 承認された記事を1本ずつサイトに配線し、検証・ビルド・コミットしてから、まとめて push する。
// 公開処理の途中で承認された記事はキューで待たせ、今の処理が終わったら次の回で処理する。
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_DIR, listReviews, readReview, updateReview } from "./review-store.mjs";

const SKILL_SCRIPTS = ".claude/skills/rakuten-comparison-article/scripts";
// wire.mjs が書き換える共有ファイル。公開時にここへ未コミットの変更があると、他の作業を巻き込むので止める
const SHARED_FILES = ["config.js", "build.mjs", "sitemap.xml", "search-index.js", "articles.html", "sources.html"];
const BUILD_ENV = { SITE_URL: "https://kaimono-standard.echoant.com", CONTACT_URL: "https://github.com/kaimono-standard/kaimono-standard.github.io/issues" };
const LOG_LIMIT = 6000;
// REVIEW_DRY_RUN=1: 配線・検証・ビルドまで通したあと元に戻す（pull・コミット・push はしない）。動作確認用
const DRY_RUN = process.env.REVIEW_DRY_RUN === "1";

const state = { running: false, current: null, queue: [], lastRun: null };
export const publisherState = () => ({ running: state.running, current: state.current, queue: [...state.queue], lastRun: state.lastRun });

const run = (cmd, args, extraEnv = {}) => new Promise((resolveRun) => {
  const child = spawn(cmd, args, { cwd: REPO_DIR, env: { ...process.env, ...extraEnv }, shell: process.platform === "win32" && cmd === "npm" });
  // stdout は値の読み取り用、out はログ用（git の警告など stderr も含む）
  let out = "", stdout = "";
  child.stdout.on("data", (d) => { out += d; stdout += d; });
  child.stderr.on("data", (d) => { out += d; });
  child.on("error", (e) => resolveRun({ code: -1, out: `${out}\n${e.message}`, stdout }));
  child.on("close", (code) => resolveRun({ code, out, stdout }));
});

class StepError extends Error {
  constructor(step, out) { super(`${step} に失敗しました`); this.out = out; }
}

const must = async (step, cmd, args, env) => {
  const res = await run(cmd, args, env);
  if (res.code !== 0) throw new StepError(step, res.out);
  return res;
};

// 配線前の共有ファイルを覚えておき、失敗したらその内容に戻す（前の記事のコミットは残る）
const snapshot = (slug) => {
  const files = Object.fromEntries(SHARED_FILES.map((f) => [f, readFileSync(resolve(REPO_DIR, f))]));
  const articlePath = resolve(REPO_DIR, `${slug}.html`);
  const article = existsSync(articlePath) ? readFileSync(articlePath) : null;
  return () => {
    for (const [f, content] of Object.entries(files)) writeFileSync(resolve(REPO_DIR, f), content);
    if (article) writeFileSync(articlePath, article);
    else if (existsSync(articlePath)) rmSync(articlePath);
  };
};

const preflight = async () => {
  const branch = (await must("ブランチの確認", "git", ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();
  if (branch !== "main") throw new StepError("ブランチの確認", `現在のブランチが ${branch} です。main に切り替えてから承認してください`);
  const dirty = (await must("作業ツリーの確認", "git", ["status", "--porcelain", "--", ...SHARED_FILES])).stdout.trim();
  if (dirty && !DRY_RUN) throw new StepError("作業ツリーの確認", `共有ファイルに未コミットの変更があります。先にコミットするか片づけてください:\n${dirty}`);
  const staged = (await must("ステージ済みの確認", "git", ["diff", "--cached", "--name-only"])).stdout.trim();
  if (staged && !DRY_RUN) throw new StepError("ステージ済みの確認", `git add 済みのファイルがあります。公開のコミットに混ざるので、先にコミットするか git restore --staged で外してください:
${staged}`);
  if (!DRY_RUN) await must("最新の取得", "git", ["pull", "--ff-only"]);
};

const publishOne = async (slug) => {
  const review = readReview(slug);
  if (review.status === "committed") return true; // 前回 push だけ失敗した記事
  const logs = [];
  const step = async (label, cmd, args, env) => { logs.push(`$ ${label}`); logs.push((await must(label, cmd, args, env)).out); };
  updateReview(slug, { status: "publishing", error: null });
  const restore = snapshot(slug);
  try {
    await step("配線", "node", [`${SKILL_SCRIPTS}/wire.mjs`, `_drafts/${slug}`]);
    await step("機械検証", "node", [`${SKILL_SCRIPTS}/verify.mjs`, slug]);
    await step("構文チェック", "npm", ["run", "check"]);
    await step("ビルド", "npm", ["run", "build"], BUILD_ENV);
    if (DRY_RUN) {
      await run("git", ["reset", "-q", "--", `${slug}.html`, ...SHARED_FILES]);
      restore();
      updateReview(slug, { status: "failed", error: "お試し実行（REVIEW_DRY_RUN）なので公開せずに元に戻しました。ここまでの処理は成功しています", log: logs.join("\n").slice(-LOG_LIMIT) });
      return false;
    }
    await step("ステージ", "git", ["add", "--", `${slug}.html`, ...SHARED_FILES]);
    const nothingStaged = (await run("git", ["diff", "--cached", "--quiet", "--", `${slug}.html`, ...SHARED_FILES])).code === 0;
    if (nothingStaged) {
      // 配線済みでコミットもある（push だけ失敗した記事の再承認など）
      const last = (await must("コミットの確認", "git", ["log", "-1", "--format=%h", "--", `${slug}.html`])).stdout.trim();
      if (!last) throw new StepError("コミット", "配線後の差分がなく、既存のコミットも見つかりません");
      updateReview(slug, { status: "committed", commit: last, log: logs.join("\n").slice(-LOG_LIMIT) });
      return true;
    }
    const message = `feat: publish ${slug}\n\n承認画面から公開（担当: ${review.editor_name || review.editor || "-"}）\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
    // パスを指定してコミットし、この記事のファイル以外は絶対に含めない
    await step("コミット", "git", ["commit", "-m", message, "--", `${slug}.html`, ...SHARED_FILES]);
    const commit = (await must("コミットの確認", "git", ["rev-parse", "--short", "HEAD"])).stdout.trim();
    updateReview(slug, { status: "committed", commit, log: logs.join("\n").slice(-LOG_LIMIT) });
    return true;
  } catch (e) {
    await run("git", ["reset", "-q", "--", `${slug}.html`, ...SHARED_FILES]);
    restore();
    updateReview(slug, { status: "failed", error: e.message, log: [...logs, e.out || ""].join("\n").slice(-LOG_LIMIT) });
    return false;
  }
};

const runBatch = async (batch) => {
  try {
    await preflight();
  } catch (e) {
    for (const slug of batch) updateReview(slug, { status: "failed", error: e.message, log: (e.out || "").slice(-LOG_LIMIT) });
    return;
  }
  const committed = [];
  for (const slug of batch) {
    state.current = slug;
    if (await publishOne(slug)) committed.push(slug);
  }
  state.current = null;
  if (!committed.length) return;
  const push = await run("git", ["push", "origin", "main"]);
  const publishedAt = new Date().toISOString();
  for (const slug of committed) {
    updateReview(slug, push.code === 0
      ? { status: "published", published_at: publishedAt }
      : { status: "failed", error: "コミットは作成済みですが push に失敗しました。次に承認したときに一緒に push されます", log: push.out.slice(-LOG_LIMIT) });
  }
};

const drain = async () => {
  if (state.running) return;
  state.running = true;
  try {
    while (state.queue.length) {
      const batch = state.queue.splice(0);
      await runBatch(batch);
      state.lastRun = new Date().toISOString();
    }
  } finally {
    state.running = false;
    state.current = null;
  }
};

export const enqueue = (slug) => {
  if (!state.queue.includes(slug) && state.current !== slug) state.queue.push(slug);
  drain();
};

export const dequeue = (slug) => {
  const index = state.queue.indexOf(slug);
  if (index < 0) return false;
  state.queue = state.queue.filter((s) => s !== slug);
  return true;
};

// サーバー再起動時：承認済みのまま残っている記事をキューに戻す（処理中に落ちたものも含む）
export const resumeQueue = () => {
  for (const r of listReviews()) {
    if (r.status === "publishing") updateReview(r.slug, { status: "approved" });
    if (r.status === "approved" || r.status === "publishing" || r.status === "committed") state.queue.push(r.slug);
  }
  if (state.queue.length) drain();
};
