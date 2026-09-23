// 記事案を考える前に、サイトの現状を1枚にまとめて標準出力に書く（Markdown）。
// 使い方: node .claude/skills/article-ideas/scripts/context.mjs [--weeks 8] > _ideas/<日付>/context.md
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(SKILL_DIR, "../../..");
const weeksArg = process.argv.indexOf("--weeks");
const weeks = weeksArg > -1 ? Number(process.argv[weeksArg + 1]) : 8;

const read = (rel) => readFileSync(resolve(REPO_DIR, rel), "utf8");
const readJson = (path) => { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } };

// 既存記事（search-index.js は window.SEARCH_INDEX = [...] 形式）
const loadIndex = () => {
  const sandbox = { window: {} };
  vm.runInNewContext(read("search-index.js"), sandbox);
  return sandbox.window.SEARCH_INDEX || [];
};

// 公開済み記事の担当執筆者（署名の editors.html#<id> を数える。無ければ有無さん）
const editorCounts = (index) => {
  const book = readJson(resolve(REPO_DIR, "_editorial/editors.json"));
  const names = Object.fromEntries((book?.editors || []).map((e) => [e.id, e.public.name]));
  const counts = Object.fromEntries(Object.keys(names).map((id) => [id, 0]));
  let chief = 0;
  for (const entry of index) {
    const file = resolve(REPO_DIR, entry.url);
    if (!existsSync(file)) continue;
    const id = readFileSync(file, "utf8").match(/editors\.html#([a-z]+)/)?.[1];
    if (id && id in counts) counts[id] += 1; else if (/商品比較|新旧比較|悩み解決/.test(entry.type)) chief += 1;
  }
  return { names, counts, chief };
};

// 下書きの状態（承認待ち・差し戻しなど）
const drafts = () => {
  const dir = resolve(REPO_DIR, "_drafts");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(resolve(dir, d.name, "review.json")))
    .map((d) => readJson(resolve(dir, d.name, "review.json")))
    .filter((r) => r && r.status !== "published");
};

// 最新の閲覧レポート
const latestReport = () => {
  const dir = resolve(REPO_DIR, "_reports");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => /^analytics-\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort();
  return files.length ? { name: files.at(-1), body: readFileSync(resolve(dir, files.at(-1)), "utf8") } : null;
};

// 今日から weeks 週間に入る月の季節・イベント
const seasons = () => {
  const cal = readJson(resolve(SKILL_DIR, "assets/season-calendar.json"));
  const now = new Date();
  const end = new Date(now.getTime() + weeks * 7 * 86400000);
  const months = [];
  for (let d = new Date(now.getFullYear(), now.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) months.push(d.getMonth() + 1);
  return { months, cal };
};

const index = loadIndex();
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
const lines = [`# サイトの現状（${today}）`, ""];

lines.push(`## 既存記事（${index.length}本）`, "", "| 型 | カテゴリ | タイトル | 更新 | 製品のブランド |", "|---|---|---|---|---|");
for (const e of index) {
  const brands = [...new Set((e.products || []).map((p) => (p.brand || "").split(" ")[0]).filter(Boolean))].join("、");
  lines.push(`| ${e.type} | ${e.category} | ${e.title} | ${e.updated} | ${brands} |`);
}

const { names, counts, chief } = editorCounts(index);
lines.push("", "## 担当執筆者ごとの公開本数", "", ...Object.entries(counts).map(([id, n]) => `- ${names[id]}（${id}）: ${n}本`), `- 有無（編集責任者の署名）: ${chief}本`);

const pending = drafts();
lines.push("", "## 下書き・承認待ち", "", ...(pending.length ? pending.map((r) => `- ${r.status}: ${r.title}（${r.editor_name || "-"}）${r.reject_note ? ` 差し戻し理由: ${r.reject_note}` : ""}`) : ["- なし"]));

const report = latestReport();
lines.push("", "## 最新の閲覧レポート", "");
if (report) {
  const age = Math.round((Date.now() - new Date(report.name.slice(10, 20)).getTime()) / 86400000);
  lines.push(`（${report.name}、${age}日前）${age > 7 ? " ※7日以上前。先に npm run analytics を実行する" : ""}`, "", report.body.replace(/^# .*\n/, ""));
} else {
  lines.push("- まだない。npm run analytics を実行する");
}

const { months, cal } = seasons();
lines.push("", `## これから${weeks}週間の季節・イベント（例年の目安。日付は公式発表で確かめる）`, "");
for (const m of months) lines.push(`- ${m}月: ${(cal?.months?.[m] || []).join(" / ")}`);
for (const a of cal?.always || []) lines.push(`- 通年: ${a}`);

console.log(lines.join("\n"));
