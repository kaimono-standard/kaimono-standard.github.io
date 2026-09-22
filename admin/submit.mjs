// 下書きを承認キューに載せる。サイトのファイルには触らない（配線は承認されたときに publisher が行う）。
// 使い方: node admin/submit.mjs _drafts/<slug>
// 前提: facts.json / article.tpl.html があり、wire.mjs --preview と codex-factcheck.mjs --preview を済ませていること
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { DRAFTS_DIR, REPO_DIR, SLUG_RE, previewPath, readReview, reviewPath } from "./review-store.mjs";

const fail = (message) => { console.error(`✗ ${message}`); process.exit(1); };
const slug = basename(process.argv[2] || "");
if (!SLUG_RE.test(slug)) fail("使い方: node admin/submit.mjs _drafts/<slug>");
const dir = resolve(DRAFTS_DIR, slug);
const factsPath = resolve(dir, "facts.json");
if (!existsSync(factsPath)) fail(`${factsPath} がありません`);
if (!existsSync(previewPath(slug))) fail("preview.html がありません。先に wire.mjs --preview を実行する");
if (existsSync(resolve(REPO_DIR, `${slug}.html`))) fail(`${slug}.html はすでにサイトにあります。更新記事の承認はまだ対応していません`);

const existing = readReview(slug);
if (existing && ["approved", "publishing", "committed", "published"].includes(existing.status)) fail(`${slug} は「${existing.status}」なので出し直せません`);

const verify = spawnSync("node", [".claude/skills/rakuten-comparison-article/scripts/verify.mjs", slug, "--preview"], { cwd: REPO_DIR, encoding: "utf8" });
if (verify.status !== 0) fail(`機械検証に通りません:\n${verify.stdout}${verify.stderr}`);

const factcheckPath = resolve(dir, "factcheck.json");
if (!existsSync(factcheckPath)) fail("factcheck.json がありません。先に codex-factcheck.mjs --preview を実行する");
const factcheck = JSON.parse(readFileSync(factcheckPath, "utf8"));
const high = (factcheck.issues || []).filter((i) => i.severity === "high");
if (high.length) fail(`事実照合で重大な指摘が ${high.length} 件残っています`);

const facts = JSON.parse(readFileSync(factsPath, "utf8"));
const html = readFileSync(previewPath(slug), "utf8");
const pick = (re) => (html.match(re) || [])[1] || "";
let editorName = facts.editor || "";
try {
  const book = JSON.parse(readFileSync(resolve(REPO_DIR, "_editorial/editors.json"), "utf8"));
  editorName = book.editors.find((e) => e.id === facts.editor)?.public.name || editorName;
} catch { /* 台帳が無くても承認画面は id で表示できる */ }

const review = {
  slug,
  status: "pending",
  type: facts.article_type || "comparison",
  title: pick(/<h1>([^<]+)<\/h1>/) || facts.topic || slug,
  description: pick(/<meta name="description" content="([^"]+)"/),
  lead: pick(/<p class="review-lead">([^<]+)<\/p>/),
  category: facts.category_label || "",
  editor: facts.editor || "",
  editor_name: editorName,
  stated_date: facts.date || "",
  verify_output: verify.stdout.slice(-3000),
  submitted_at: new Date().toISOString(),
  approved_at: null,
  published_at: null,
  resubmitted_from: existing?.status === "rejected" ? existing.reject_note : null,
};
writeFileSync(reviewPath(slug), JSON.stringify(review, null, 2) + "\n", "utf8");
console.log(`✓ 承認キューに追加: ${review.title}（担当 ${editorName || "-"}、記載日 ${review.stated_date}）`);
