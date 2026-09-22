// 編集者台帳（_editorial/editors.json）の読み込みと、執筆者紹介ページ editors.html の生成。
// 使い方: node editors.mjs page   … editors.html を台帳の public 情報から作り直す
//         node editors.mjs list   … 編集者の id と担当の傾向を一覧表示する
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_DIR, fail } from "./lib.mjs";

export const EDITORS_PATH = resolve(REPO_DIR, "_editorial/editors.json");

export const loadEditors = () => {
  if (!existsSync(EDITORS_PATH)) fail(`${EDITORS_PATH} がありません（編集者台帳は git 管理外。このPCにだけある）`);
  return JSON.parse(readFileSync(EDITORS_PATH, "utf8"));
};

export const editorById = (id) => {
  const book = loadEditors();
  const editor = book.editors.find((e) => e.id === id);
  if (!editor) fail(`編集者 "${id}" が台帳にありません。候補: ${book.editors.map((e) => e.id).join(", ")}`);
  return { editor, hardLines: book.hard_lines };
};

// 記事ヘッダーの署名。アバターの色は CSP で inline style が使えないので styles.css の .ed-<id> で付ける
export const bylineHtml = (editor, dateJa) =>
  `<div class="review-byline"><span class="review-avatar ed-${editor.id}" aria-hidden="true">${editor.public.avatar}</span><div><strong><a href="editors.html#${editor.id}">${editor.public.name}</a>（買いもの標準 編集部）</strong><small>公開・更新：${dateJa}</small></div></div>`;

const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const editorCard = (e) => `<article class="card editor-card" id="${e.id}"><div class="editor-head"><span class="review-avatar ed-${e.id}" aria-hidden="true">${e.public.avatar}</span><div><h3>${escapeHtml(e.public.name)}</h3><p class="editor-tagline">${escapeHtml(e.public.tagline)}</p></div></div><p>${escapeHtml(e.public.profile)}</p><ul class="editor-topics">${e.public.topics.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul></article>`;

const renderPage = (book) => {
  const about = readFileSync(resolve(REPO_DIR, "about.html"), "utf8");
  const header = about.slice(about.indexOf("<a class=\"skip-link\""), about.indexOf("<main"));
  const footer = about.slice(about.indexOf("</main>") + "</main>".length);
  const people = book.editors.map((e) => ({ "@type": "Person", name: e.public.name, url: `https://kaimono-standard.echoant.com/editors.html#${e.id}` }));
  const ld = { "@context": "https://schema.org", "@type": "Organization", name: "買いもの標準 編集部", url: "https://kaimono-standard.echoant.com/", member: [{ "@type": "Person", name: book.chief_editor.name, jobTitle: "編集責任者" }, ...people] };
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>執筆者紹介｜買いもの標準</title><meta name="description" content="買いもの標準 編集部の執筆者と、それぞれが記事で重視している視点を紹介します。"><meta name="theme-color" content="#ffffff"><link rel="canonical" href="https://kaimono-standard.echoant.com/editors.html"><link rel="stylesheet" href="styles.css"><link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="manifest" href="site.webmanifest"><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body>
${header}<main id="main"><p class="breadcrumb"><a href="index.html">ホーム</a> / <a href="about.html">運営方針</a> / 執筆者紹介</p><header class="article-head"><p class="eyebrow">編集部</p><h1>執筆者紹介</h1><p class="lead">同じ商品でも、暮らし方によって先に見るところは変わります。記事ごとに、読む人に近い視点を持つ執筆者が担当しています。</p></header>
<div class="grid two">${book.editors.map(editorCard).join("")}</div>
<h2>編集責任者</h2><p>${escapeHtml(book.chief_editor.name)}が製品選定の基準と記事の最終確認に責任を持ちます。掲載する数値はメーカー公式ページで確認できるものに限り、確認日を記事に明記します。詳しくは<a href="about.html">運営方針</a>をご覧ください。</p>
</main>${footer}`;
};

// 他のスクリプトから import されたときは何もしない
const cmd = process.argv[2];
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const book = loadEditors();
  if (cmd === "page") {
    const css = readFileSync(resolve(REPO_DIR, "styles.css"), "utf8");
    const missing = book.editors.filter((e) => !css.includes(`.ed-${e.id}`));
    if (missing.length) fail(`styles.css にアバター色 ${missing.map((e) => `.ed-${e.id}`).join(" ")} がありません`);
    writeFileSync(resolve(REPO_DIR, "editors.html"), renderPage(book), "utf8");
    console.log(`editors.html を書き出しました（${book.editors.length}名）`);
  } else if (cmd === "list") {
    for (const e of book.editors) console.log(`${e.id}\t${e.public.name}\t${e.public.topics.join(" / ")}\n\t→ ${e.internal.crossover}`);
  }
}
