// 生成済み記事の主張を facts.json と突き合わせ、根拠のない箇所を Codex に列挙させる。
// 使い方: node codex-factcheck.mjs _drafts/<slug> [--model <id>]
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_DIR, draftDir, fail, readFacts } from "./lib.mjs";

const dir = draftDir(process.argv[2]);
const modelFlag = process.argv.indexOf("--model") > -1 ? ["-m", process.argv[process.argv.indexOf("--model") + 1]] : [];
const facts = readFacts(dir);
// --preview: 公開前の下書き（_drafts/<slug>/preview.html）を照合する
const articlePath = process.argv.includes("--preview") ? resolve(dir, "preview.html") : resolve(REPO_DIR, `${facts.slug}.html`);
if (!existsSync(articlePath)) fail(`${articlePath} がありません（wire.mjs を先に実行）`);

// 本文だけ渡す（head・ヘッダー・フッターは照合対象外）
const html = readFileSync(articlePath, "utf8");
const body = (html.match(/<main[\s\S]*?<\/main>/) || [html])[0]
  .replace(/<img[^>]*>/g, "")
  .replace(/https:\/\/hbb?\.afl\.rakuten\.co\.jp\/[^"\s]+/g, "(affiliate-url)");

const schema = {
  type: "object", additionalProperties: false,
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          quote: { type: "string", description: "記事中の問題箇所を原文のまま（20〜80字）" },
          reason: { type: "string", description: "台帳のどこにも根拠がない／数値が食い違う／最上級が成り立たない、など" },
          severity: { type: "string", enum: ["high", "medium", "low"] },
          suggestion: { type: "string", description: "台帳の範囲内での言い換え案。削除が適切なら「削除」" },
        },
        required: ["quote", "reason", "severity", "suggestion"],
      },
    },
    summary: { type: "string" },
  },
  required: ["issues", "summary"],
};
const schemaPath = resolve(dir, "factcheck-schema.json");
writeFileSync(schemaPath, JSON.stringify(schema), "utf8");

const prompt = `あなたは事実確認担当です。次の記事本文（HTML）に書かれている主張のうち、台帳（facts.json）で裏付けられないものをすべて挙げてください。

判定基準:
- 台帳の specs / features / release / caution_hint / variant_note / rakuten.price にある事実、およびそこから四則演算で導ける事実は OK
- 台帳に無い数値・時間・温度・容量・重量・色数・発売時期は NG（high）
- 「最も」「最軽量」「最大」「最小」「いちばん」「唯一」は、台帳の数値で一意に成り立つ場合のみ OK。同値があるのに単独最上級なら NG（high）
- unverified に挙がっている項目を断定していれば NG（high）
- 「おいしい」「静か」「人気」「定番」「〜と言われています」など根拠を示せない評価・伝聞は NG（medium）
- ジャンル一般の説明（数値を含まないもの）や、購入時の確認を促す表現は OK
- 文体・構成の好みは対象外。事実性だけを見る

問題がなければ issues は空配列にしてください。

# 台帳（facts.json）
\`\`\`json
${JSON.stringify(facts, null, 2)}
\`\`\`

# 記事本文
\`\`\`html
${body}
\`\`\``;

const outPath = resolve(dir, "factcheck.json");
const promptPath = resolve(dir, "factcheck-prompt.txt");
writeFileSync(promptPath, prompt, "utf8");

// --prompt-only: プロンプトと schema を書き出して終了（Codex 自身が照合し、結果を factcheck.json に書く）
// --report:      既にある factcheck.json を整形表示するだけ
const mode = process.argv.includes("--prompt-only") ? "prompt" : process.argv.includes("--report") ? "report" : "exec";
if (mode === "prompt") {
  console.log(`プロンプト: ${promptPath}（本文 ${body.length} 文字）\nスキーマ: ${schemaPath}`);
  console.log(`プロンプトに従って照合し、スキーマ通りのJSONを ${outPath} に書いてから --report を付けて再実行してください`);
  process.exit(0);
}
if (mode === "exec") {
  console.log(`codex exec を実行中（本文 ${body.length} 文字）…`);
  const res = spawnSync("codex", ["exec", "-s", "read-only", "-C", REPO_DIR, "--ephemeral", "--skip-git-repo-check", "--output-schema", schemaPath, "-o", outPath, ...modelFlag, "-"], {
    input: prompt, encoding: "utf8", stdio: ["pipe", "ignore", "ignore"], shell: process.platform === "win32", maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0) fail(`codex exec が失敗しました (exit ${res.status})。Codex の中から実行している場合は --prompt-only で自分で照合する`);
}
if (!existsSync(outPath)) fail(`${outPath} がありません`);

const result = JSON.parse(readFileSync(outPath, "utf8"));
if (!Array.isArray(result.issues)) fail("factcheck.json の形式が不正（issues 配列が必要）");
console.log(`\n指摘 ${result.issues.length} 件 — ${result.summary}`);
for (const [i, issue] of result.issues.entries()) {
  console.log(`\n${i + 1}. [${issue.severity}] 「${issue.quote}」\n   理由: ${issue.reason}\n   案: ${issue.suggestion}`);
}
process.exit(result.issues.some((i) => i.severity === "high") ? 2 : 0);
