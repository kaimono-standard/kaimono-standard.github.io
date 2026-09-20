// facts.json と編集ルール・完成例をまとめて Codex に渡し、article.tpl.html を書かせる。
// 使い方: node codex-draft.mjs _drafts/<slug> [--model <id>]
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_DIR, SKILL_DIR, draftDir, fail, hasLink, readFacts } from "./lib.mjs";

const dir = draftDir(process.argv[2]);
const modelFlag = process.argv.indexOf("--model") > -1 ? ["-m", process.argv[process.argv.indexOf("--model") + 1]] : [];
const facts = readFacts(dir);

const ready = facts.products.filter((p) => hasLink(p.rakuten) && p.official_url && p.specs && Object.keys(p.specs).length);
if (facts.products.length !== 5) fail(`製品は5つ必要です（現在 ${facts.products.length}）`);
if (ready.length !== 5) fail(`公式URL・specs・rakuten が揃っていない製品があります: ${facts.products.filter((p) => !ready.includes(p)).map((p) => p.key).join(", ")}`);

const rules = readFileSync(resolve(SKILL_DIR, "references/editorial-rules.md"), "utf8");
const exemplar = readFileSync(resolve(SKILL_DIR, "assets/exemplar.tpl.html"), "utf8");
const related = facts.related || ["electric-kettle-comparison.html|電気ケトル5機種を比較", "oven-toaster-comparison.html|オーブントースター5機種を比較"];

const prompt = `あなたは「買いもの標準」編集部の執筆者です。次の台帳（facts.json）だけを根拠に、完成例と同じ構成・同じクラス名・同じ粒度で、商品比較記事のHTMLテンプレートを1本書いてください。

出力はHTML全文のみ（<!doctype html> から </html> まで）。コードフェンスや前置き・後書きは不要です。ファイルには書き込まず、最終メッセージとして返してください。

# 編集ルール
${rules}

# 完成例（オーブントースター記事のテンプレート。構成・クラス名・プレースホルダの使い方をこのまま踏襲する）
\`\`\`html
${exemplar}
\`\`\`

# 今回の台帳（facts.json）
\`\`\`json
${JSON.stringify(facts, null, 2)}
\`\`\`

# 追加指示
- canonical / og:url は https://kaimono-standard.echoant.com/${facts.slug}.html
- datePublished / dateModified / 署名の日付 / 「確認日」は ${facts.date}
- サイドバー「関連する比較」は次の2本: ${related.map((r) => r.split("|").join(" → ")).join(" / ")}
- 製品の順番、結論ブロックの順番、比較表の行、出典の順番は台帳の products の順に揃える
- 比較表の列は「製品」「${(facts.table_columns || []).join("」「")}」「掲載時価格」
- 台帳に無い数値・時期・評価語を書かない。unverified の項目は「公式仕様に記載はありません」と書くか触れない`;

const promptPath = resolve(dir, "draft-prompt.txt");
writeFileSync(promptPath, prompt, "utf8");
const outPath = resolve(dir, "article.tpl.html");

// --prompt-only: Codex 自身が執筆するときに使う。プロンプトだけ書き出して終了する（実行者が article.tpl.html を書き、--finalize で整形・検査する）
// --finalize:    既に書かれた article.tpl.html を整形・検査するだけ
const mode = process.argv.includes("--prompt-only") ? "prompt" : process.argv.includes("--finalize") ? "finalize" : "exec";
if (mode === "prompt") {
  console.log(`プロンプトを書き出しました: ${promptPath}（${prompt.length} 文字）`);
  console.log(`この内容に従って ${outPath} を書き、次に --finalize を付けて再実行してください`);
  process.exit(0);
}
if (mode === "exec") {
  console.log(`codex exec を実行中（プロンプト ${prompt.length} 文字）…`);
  const res = spawnSync("codex", ["exec", "-s", "read-only", "-C", REPO_DIR, "--ephemeral", "--skip-git-repo-check", "-o", outPath, ...modelFlag, "-"], {
    input: prompt, encoding: "utf8", stdio: ["pipe", "ignore", "ignore"], shell: process.platform === "win32", maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0) fail(`codex exec が失敗しました (exit ${res.status})。Codex の中から実行している場合は --prompt-only で自分で書く`);
}
if (!existsSync(outPath)) fail(`${outPath} がありません`);

let html = readFileSync(outPath, "utf8").trim();
html = html.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/, "").trim();
const start = html.indexOf("<!doctype html>");
if (start < 0) fail("出力に <!doctype html> が含まれていません。draft-prompt.txt を確認して再実行してください");
html = html.slice(start);
if (!html.endsWith("</html>")) html = html.slice(0, html.lastIndexOf("</html>") + 7);
writeFileSync(outPath, html + "\n", "utf8");

const count = (re) => (html.match(re) || []).length;
console.log(`書き出し: ${outPath} (${html.length} 文字)`);
console.log(`製品ブロック ${count(/class="review-product"/g)} / 出典リンク ${count(/<li><a href="https?:/g)} / プレースホルダ ${count(/\{\{(IMG|ITEM|PRICE):\w+\}\}/g)}`);
