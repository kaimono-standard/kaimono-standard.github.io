// 記事案の候補を、1つの視点だけで Codex に独立レビューさせる（他のレビュアーの結果は渡さない）。
// 使い方: node .claude/skills/article-ideas/scripts/codex-review.mjs _ideas/<日付> --lens contrarian [--round 1] [--model <id>]
// 入力: <dir>/candidates.json と <dir>/context.md。出力: <dir>/reviews/round<N>-<lens>-codex.json
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(SKILL_DIR, "../../..");
const LENSES = ["demand", "monetization", "verifiability", "editorial", "contrarian"];

const fail = (message) => { console.error(`✗ ${message}`); process.exit(1); };
const opt = (name, def) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : def; };

const dirArg = process.argv[2];
if (!dirArg || dirArg.startsWith("--")) fail("使い方: node codex-review.mjs _ideas/<日付> --lens <視点> [--round 1]");
const dir = resolve(REPO_DIR, dirArg);
const lens = opt("--lens", "contrarian");
const round = Number(opt("--round", "1"));
if (!LENSES.includes(lens)) fail(`--lens は ${LENSES.join(" / ")} のどれか`);
if (!Number.isInteger(round) || round < 1) fail("--round は 1 以上の整数");
const candidatesPath = resolve(dir, "candidates.json");
if (!existsSync(candidatesPath)) fail(`${candidatesPath} がありません`);
const candidates = JSON.parse(readFileSync(candidatesPath, "utf8"));
if (!Array.isArray(candidates.candidates) || !candidates.candidates.length) fail("candidates.json に candidates がありません");
const context = existsSync(resolve(dir, "context.md")) ? readFileSync(resolve(dir, "context.md"), "utf8") : "（context.md なし）";
const rubric = readFileSync(resolve(SKILL_DIR, "references/review-rubric.md"), "utf8");
const modelFlag = opt("--model") ? ["-m", opt("--model")] : [];

const schema = {
  type: "object", additionalProperties: false,
  properties: {
    lens: { type: "string" },
    round: { type: "integer" },
    reviews: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          id: { type: "string" },
          score: { type: "integer", minimum: 1, maximum: 5 },
          reason: { type: "string" },
          kill: { type: ["string", "null"] },
          improve: { type: "string" },
        },
        required: ["id", "score", "reason", "kill", "improve"],
      },
    },
  },
  required: ["lens", "round", "reviews"],
};

const prompt = `あなたは比較メディア「買いもの標準」の企画会議のレビュアーです。担当する視点は「${lens}」だけです。他の視点の良し悪しで点を動かさないでください。

次の採点基準のうち、「共通の点の付け方」と「${lens}」の節に従って、候補すべてを採点してください。
- 各候補に 1〜5 点、理由（1〜2行、事実ベース）、kill（成り立たない理由があるときだけ文字列、なければ null）、improve（点を上げるための具体的な直し方を1行）を付ける
- 候補の evidence（根拠URLと signal）と、サイトの現状（既存記事・執筆者・季節）を判断材料にする。リポジトリの外は見えない前提で、書かれている情報から判断する
- 根拠が弱い、書かれていない、と思ったらそう書く。推測で補って高い点を付けない
${lens === "contrarian" ? "- 反対意見役として、各案の一番弱いところを必ず1つ reason に書く。点数は「その弱点を直せるか」で付ける" : ""}

出力はスキーマ通りの JSON のみ。lens は "${lens}"、round は ${round}。

# 採点基準
${rubric}

# サイトの現状
${context}

# 候補（candidates.json）
\`\`\`json
${JSON.stringify(candidates, null, 2)}
\`\`\``;

const reviewsDir = resolve(dir, "reviews");
mkdirSync(reviewsDir, { recursive: true });
const schemaPath = resolve(reviewsDir, "schema.json");
writeFileSync(schemaPath, JSON.stringify(schema), "utf8");
const outPath = resolve(reviewsDir, `round${round}-${lens}-codex.json`);
writeFileSync(resolve(reviewsDir, `round${round}-${lens}-codex-prompt.txt`), prompt, "utf8");

console.log(`codex exec で「${lens}」のレビュー中（候補 ${candidates.candidates.length} 件）…`);
const res = spawnSync("codex", ["exec", "-s", "read-only", "-C", REPO_DIR, "--ephemeral", "--skip-git-repo-check", "--output-schema", schemaPath, "-o", outPath, ...modelFlag, "-"], {
  input: prompt, encoding: "utf8", stdio: ["pipe", "ignore", "ignore"], shell: process.platform === "win32", maxBuffer: 64 * 1024 * 1024,
});
if (res.status !== 0) fail(`codex exec が失敗しました (exit ${res.status})`);
if (!existsSync(outPath)) fail(`${outPath} がありません`);

const result = JSON.parse(readFileSync(outPath, "utf8"));
const ids = new Set(candidates.candidates.map((c) => c.id));
const missing = [...ids].filter((id) => !result.reviews.some((r) => r.id === id));
if (missing.length) console.warn(`⚠ 採点が抜けた候補: ${missing.join(", ")}`);
for (const r of result.reviews) console.log(`${r.id}\t${r.score}${r.kill ? "\tKILL: " + r.kill : ""}\t${r.reason}`);
console.log(`\n書き出し: ${outPath}`);
