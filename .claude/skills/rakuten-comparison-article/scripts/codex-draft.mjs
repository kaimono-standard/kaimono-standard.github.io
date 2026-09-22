// facts.json と編集ルール・完成例をまとめて Codex に渡し、article.tpl.html を書かせる。
// 使い方: node codex-draft.mjs _drafts/<slug> [--model <id>]
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_DIR, SKILL_DIR, draftDir, fail, hasLink, readFacts } from "./lib.mjs";
import { bylineHtml, editorById } from "./editors.mjs";

const dir = draftDir(process.argv[2]);
const modelFlag = process.argv.indexOf("--model") > -1 ? ["-m", process.argv[process.argv.indexOf("--model") + 1]] : [];
const facts = readFacts(dir);

// 記事の型：comparison（5機種比較・既定）／version（新旧比較。products は [新型, 旧型] の2つ）
const TYPES = {
  comparison: { count: 5, exemplar: "assets/exemplar.tpl.html", label: "商品比較記事" },
  version: { count: 2, exemplar: "assets/exemplar-version.tpl.html", label: "新旧比較記事" },
};
const articleType = facts.article_type || "comparison";
const type = TYPES[articleType];
if (!type) fail(`article_type "${articleType}" は未対応です（${Object.keys(TYPES).join(" / ")}）`);
const ready = facts.products.filter((p) => hasLink(p.rakuten) && p.official_url && p.specs && Object.keys(p.specs).length);
if (facts.products.length !== type.count) fail(`この型の製品は${type.count}つ必要です（現在 ${facts.products.length}）`);
if (articleType === "version" && !facts.successor_evidence?.url) fail("新旧比較には successor_evidence（メーカーが後継・新モデルと示すページ）が必要です");
if (ready.length !== type.count) fail(`公式URL・specs・rakuten が揃っていない製品があります: ${facts.products.filter((p) => !ready.includes(p)).map((p) => p.key).join(", ")}`);

const baseRules = readFileSync(resolve(SKILL_DIR, "references/editorial-rules.md"), "utf8");
// 新旧比較は、型専用のルール＋共通ルールの「## 文体」以降（5機種比較の構成は渡さない）
const rules = articleType === "version"
  ? `${readFileSync(resolve(SKILL_DIR, "references/editorial-rules-version.md"), "utf8")}

# 共通ルール
${baseRules.slice(baseRules.indexOf("## 文体"))}`
  : baseRules;
const exemplar = readFileSync(resolve(SKILL_DIR, type.exemplar), "utf8");
if (!facts.editor) fail("facts.json に editor（編集者 id）がありません。node editors.mjs list で候補を確認する");
const { editor, hardLines } = editorById(facts.editor);
const [y, m, d] = facts.date.split("-").map(Number);
const byline = bylineHtml(editor, `${y}年${m}月${d}日`);
const related = facts.related || ["electric-kettle-comparison.html|電気ケトル5機種を比較", "oven-toaster-comparison.html|オーブントースター5機種を比較"];

const prompt = `あなたは「買いもの標準」編集部の執筆者「${editor.public.name}」です。下の「執筆者の視点と文体」の人物として、次の台帳（facts.json）だけを根拠に、完成例と同じ構成・同じクラス名・同じ粒度で、${type.label}のHTMLテンプレートを1本書いてください。

出力はHTML全文のみ（<!doctype html> から </html> まで）。コードフェンスや前置き・後書きは不要です。ファイルには書き込まず、最終メッセージとして返してください。

# 編集ルール
${rules}

# 執筆者の視点と文体
この記事は ${editor.public.name} が書く。完成例（別の執筆者の記事）の文体はまねず、構成・クラス名・プレースホルダだけを踏襲する。視点は「何を先に確認するか」「どんな生活の場面で使うか」で出し、使った・試したという体験は書かない。
\`\`\`json
${JSON.stringify({ public: editor.public, internal: editor.internal }, null, 2)}
\`\`\`
全執筆者に共通の決まり:
${hardLines.map((l) => `- ${l}`).join("\n")}

# 完成例（構成・クラス名・プレースホルダの使い方をこのまま踏襲する。［］の中は書き方の指示なので、台帳の内容に置き換える）
\`\`\`html
${exemplar}
\`\`\`

# 今回の台帳（facts.json）
\`\`\`json
${JSON.stringify(facts, null, 2)}
\`\`\`

# 追加指示
- 署名は次のHTMLをそのまま使う: ${byline}
- Article の JSON-LD の author は {"@type":"Person","name":"${editor.public.name}","url":"https://kaimono-standard.echoant.com/editors.html#${editor.id}"}
- canonical / og:url は https://kaimono-standard.echoant.com/${facts.slug}.html
- datePublished / dateModified / 署名の日付 / 「確認日」は ${facts.date}
- サイドバー「関連する比較」は次の2本: ${related.map((r) => r.split("|").join(" → ")).join(" / ")}
- 製品の順番、結論ブロックの順番、比較表の行、出典の順番は台帳の products の順に揃える
${articleType === "version"
  ? `- 仕様の違いの表の行は「発売」「${(facts.table_columns || []).join("」「")}」「楽天市場の掲載時価格」。products[0]（${facts.products[0].key}）が新型、products[1]（${facts.products[1].key}）が旧型。完成例の modelNew / modelOld はこの key に置き換える`
  : `- 比較表の列は「製品」「${(facts.table_columns || []).join("」「")}」「楽天市場の掲載時価格」`}
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
