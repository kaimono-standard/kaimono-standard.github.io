// 記事案（article-ideas の ideas.md）を、順番に記事にするための作業キューにする。
// 使い方:
//   node .claude/skills/article-series/scripts/queue.mjs init _ideas/<日付> [--order 6,1,5] [--force]
//   node .claude/skills/article-series/scripts/queue.mjs status [_ideas/<日付>]
//   node .claude/skills/article-series/scripts/queue.mjs next [_ideas/<日付>]
//   node .claude/skills/article-series/scripts/queue.mjs start <番号> --slug <slug> [_ideas/<日付>]
//   node .claude/skills/article-series/scripts/queue.mjs set <番号> <状態> [--note "理由"] [_ideas/<日付>]
//   node .claude/skills/article-series/scripts/queue.mjs sync [_ideas/<日付>]
// キューは _ideas/<日付>/queue.json（git 管理外）。日付を省くと一番新しい queue.json を使う。
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(SKILL_DIR, "../../..");
const IDEAS_DIR = resolve(REPO_DIR, "_ideas");
const DRAFTS_DIR = resolve(REPO_DIR, "_drafts");
const STATUSES = ["queued", "in_progress", "submitted", "rejected", "published", "blocked", "skipped"];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const fail = (message) => { console.error(`✗ ${message}`); process.exit(1); };
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : undefined; };
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const [command, ...rest] = positional;
const todayJst = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");

// 日付ディレクトリ：引数にあればそれ、無ければ queue.json がある一番新しい日付
const ideasDirFrom = (arg, { needQueue = true } = {}) => {
  if (arg) return resolve(REPO_DIR, arg);
  if (!existsSync(IDEAS_DIR)) fail("_ideas がありません。先に article-ideas で記事案を出す");
  const dates = readdirSync(IDEAS_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && (!needQueue || existsSync(resolve(IDEAS_DIR, d, "queue.json")))).sort();
  if (!dates.length) fail(needQueue ? "queue.json がありません。先に init を実行する" : "_ideas/<日付> がありません");
  return resolve(IDEAS_DIR, dates.at(-1));
};

const editorIdsByName = () => {
  try {
    const book = readJson(resolve(REPO_DIR, "_editorial/editors.json"));
    return Object.fromEntries(book.editors.map((e) => [e.public.name, e.id]));
  } catch { return {}; }
};

// ideas.md の「### N. タイトル」ごとの節を読む。「## 見送った」以降は対象外
const parseIdeas = (markdown) => {
  const main = markdown.split(/^## 見送/m)[0];
  const sections = main.split(/^### /m).slice(1);
  const editors = editorIdsByName();
  return sections.map((section) => {
    const [heading, ...lines] = section.split(/\r?\n/);
    const match = heading.match(/^(\d+)\.\s*(.+)$/);
    if (!match) fail(`見出しの形が違います: ### ${heading}`);
    const fields = Object.fromEntries(lines
      .map((l) => l.match(/^- ([^：]+)：(.*)$/))
      .filter(Boolean)
      .map(([, k, v]) => [k.trim(), v.trim()]));
    const head = Object.fromEntries((`型：${fields["型"] || ""}`).split(/\s*／\s*/).map((p) => p.split("：").map((s) => s.trim())));
    const editorName = (head["担当"] || "").replace(/（.*$/, "");
    const quotes = (text) => [...(text || "").matchAll(/「([^」]+)」/g)].map((m) => m[1]);
    const links = (text) => [...(text || "").matchAll(/\[([^\]]+)\]\((https?:[^)]+)\)/g)].map(([, label, url]) => ({ label, url }));
    return {
      n: Number(match[1]),
      title: match[2].trim(),
      article_type: /新旧/.test(head["型"] || "") ? "version" : "comparison",
      editor: editors[editorName] || null,
      editor_name: editorName,
      genre: head["ジャンル"] || "",
      target_queries: quotes(fields["狙う検索語"]),
      why_now: fields["なぜ今"] || "",
      evidence: links(fields["根拠"]),
      product_examples: fields["候補製品の例"] || "",
      feasibility: fields["実現性"] || "",
      cautions: fields["注意"] || "",
      objection: fields["反対意見と答え"] || "",
      score: Number((fields["評価"] || fields["評価（2回目）"] || "").match(/合計(\d+)/)?.[1] || 0),
      status: "queued",
      slug: null,
      notes: [],
      updated_at: null,
    };
  });
};

const loadQueue = (dir) => {
  const path = resolve(dir, "queue.json");
  if (!existsSync(path)) fail(`${path} がありません。先に init を実行する`);
  return { path, queue: readJson(path) };
};
const findItem = (queue, n) => queue.items.find((i) => i.n === Number(n)) || fail(`番号 ${n} の記事案はありません`);
const replaceItem = (queue, updated) => ({ ...queue, items: queue.items.map((i) => (i.n === updated.n ? updated : i)) });
const withNote = (item, note) => (note ? [...item.notes, `${todayJst()} ${note}`] : item.notes);
const ordered = (queue) => queue.order.map((n) => queue.items.find((i) => i.n === n)).filter(Boolean);

// 記事作成に渡す企画メモ（facts.json の brief）。事実の根拠ではなく書き方の方針
const briefOf = (item) => ({
  source: `_ideas/${item.date_dir}/ideas.md #${item.n}`,
  title_draft: item.title,
  target_queries: item.target_queries,
  product_examples: item.product_examples,
  cautions: item.cautions,
  objection_answer: item.objection,
});

const printItem = (item) => {
  console.log(`#${item.n} ${item.title}`);
  console.log(`  型: ${item.article_type} ／ 担当: ${item.editor_name}（${item.editor || "id不明"}）／ ジャンル: ${item.genre} ／ 評価 ${item.score}`);
  console.log(`  状態: ${item.status}${item.slug ? ` ／ slug: ${item.slug}` : ""}`);
  console.log(`  検索語: ${item.target_queries.join("、")}`);
  console.log(`  なぜ今: ${item.why_now}`);
  console.log(`  根拠: ${item.evidence.map((e) => `${e.label} ${e.url}`).join(" / ")}`);
  console.log(`  候補製品の例: ${item.product_examples}`);
  console.log(`  実現性: ${item.feasibility}`);
  console.log(`  注意: ${item.cautions}`);
  console.log(`  反対意見と答え: ${item.objection}`);
  if (item.notes.length) console.log(`  メモ: ${item.notes.join(" / ")}`);
};

const commands = {
  init() {
    const dir = ideasDirFrom(rest[0], { needQueue: false });
    const ideasPath = resolve(dir, "ideas.md");
    if (!existsSync(ideasPath)) fail(`${ideasPath} がありません`);
    const queuePath = resolve(dir, "queue.json");
    if (existsSync(queuePath) && !args.includes("--force")) fail(`${queuePath} はすでにあります（作り直すなら --force。進み具合は消える）`);
    const dateDir = dir.split(/[\\/]/).at(-1);
    const items = parseIdeas(readFileSync(ideasPath, "utf8")).map((i) => ({ ...i, date_dir: dateDir }));
    if (!items.length) fail("ideas.md に「### N. タイトル」の記事案がありません");
    const unknown = items.filter((i) => !i.editor);
    if (unknown.length) fail(`担当の名前が editors.json にありません: ${unknown.map((i) => `#${i.n} ${i.editor_name}`).join(", ")}`);
    const order = opt("--order") ? opt("--order").split(",").map(Number) : items.map((i) => i.n);
    const missing = items.filter((i) => !order.includes(i.n)).map((i) => i.n);
    const extra = order.filter((n) => !items.some((i) => i.n === n));
    if (extra.length) fail(`--order に無い番号があります: ${extra.join(", ")}`);
    const queue = { created_at: todayJst(), ideas: `_ideas/${dateDir}/ideas.md`, order: [...order, ...missing], items };
    writeJson(queuePath, queue);
    console.log(`✓ キューを作成: ${queuePath}（${items.length}本）`);
    ordered(queue).forEach((i, k) => console.log(`  ${k + 1}. #${i.n} ${i.title}（${i.editor_name}）`));
  },
  status() {
    const { queue } = loadQueue(ideasDirFrom(rest[0]));
    const counts = Object.fromEntries(STATUSES.map((s) => [s, queue.items.filter((i) => i.status === s).length]));
    console.log(`キュー（${queue.ideas}）: ${STATUSES.filter((s) => counts[s]).map((s) => `${s} ${counts[s]}`).join(" / ")}`);
    ordered(queue).forEach((i, k) => console.log(`${k + 1}. [${i.status}] #${i.n} ${i.title}（${i.editor_name}）${i.slug ? ` ${i.slug}` : ""}${i.notes.length ? ` — ${i.notes.at(-1)}` : ""}`));
  },
  next() {
    const { queue } = loadQueue(ideasDirFrom(rest[0]));
    const current = ordered(queue).find((i) => i.status === "in_progress");
    const item = current || ordered(queue).find((i) => i.status === "queued");
    if (!item) { console.log("残りの記事案はありません"); return; }
    console.log(current ? "作業中の記事案（先にこれを仕上げる）:" : "次の記事案:");
    printItem(item);
  },
  start() {
    const [n, dirArg] = rest;
    const slug = opt("--slug");
    if (!slug || !SLUG_RE.test(slug)) fail("--slug に英小文字ケバブケースの slug を指定する（例: steam-humidifier-comparison）");
    if (existsSync(resolve(REPO_DIR, `${slug}.html`))) fail(`${slug}.html はすでにサイトにあります`);
    const { path, queue } = loadQueue(ideasDirFrom(dirArg));
    const other = queue.items.find((i) => i.status === "in_progress" && i.n !== Number(n));
    if (other) fail(`#${other.n} が作業中です。仕上げるか、set ${other.n} blocked で止めてから始める`);
    const item = findItem(queue, n);
    if (!["queued", "in_progress", "rejected", "blocked"].includes(item.status)) fail(`#${item.n} は「${item.status}」です`);
    const updated = { ...item, status: "in_progress", slug, updated_at: new Date().toISOString(), notes: withNote(item, `開始（${slug}）`) };
    writeJson(path, replaceItem(queue, updated));

    // 下書きの台帳に企画メモ・型・担当を入れる（既にあれば brief だけ差し替える）
    const draftDir = resolve(DRAFTS_DIR, slug);
    mkdirSync(draftDir, { recursive: true });
    const factsPath = resolve(draftDir, "facts.json");
    const base = existsSync(factsPath) ? readJson(factsPath) : {
      slug,
      ...(updated.article_type === "version" ? { article_type: "version" } : {}),
      editor: updated.editor,
      date: todayJst(),
      products: [],
    };
    writeJson(factsPath, { ...base, brief: briefOf(updated) });
    console.log(`✓ #${item.n} を開始: ${factsPath}`);
    printItem(updated);
  },
  set() {
    const [n, status, dirArg] = rest;
    if (!STATUSES.includes(status)) fail(`状態は ${STATUSES.join(" / ")} のどれか`);
    const note = opt("--note");
    if (["blocked", "skipped"].includes(status) && !note) fail(`${status} にするときは --note で理由を残す`);
    const { path, queue } = loadQueue(ideasDirFrom(dirArg));
    const item = findItem(queue, n);
    const updated = { ...item, status, updated_at: new Date().toISOString(), notes: withNote(item, note || status) };
    writeJson(path, replaceItem(queue, updated));
    console.log(`✓ #${item.n} → ${status}${note ? `（${note}）` : ""}`);
  },
  // 承認画面の状態（_drafts/<slug>/review.json）をキューに反映する
  sync() {
    const { path, queue } = loadQueue(ideasDirFrom(rest[0]));
    const map = { pending: "submitted", approved: "submitted", publishing: "submitted", committed: "submitted", published: "published", rejected: "rejected", failed: "submitted" };
    const next = queue.items.reduce((q, item) => {
      if (!item.slug) return q;
      const reviewPath = resolve(DRAFTS_DIR, item.slug, "review.json");
      if (!existsSync(reviewPath)) return q;
      const review = readJson(reviewPath);
      const status = map[review.status];
      if (!status || status === item.status) return q;
      const note = review.status === "rejected" ? `差し戻し: ${review.reject_note || "理由なし"}` : review.status === "failed" ? `公開に失敗: ${review.error || ""}` : status;
      console.log(`#${item.n} ${item.status} → ${status}${review.status === "rejected" ? `（${review.reject_note || ""}）` : ""}`);
      return replaceItem(q, { ...item, status, updated_at: new Date().toISOString(), notes: withNote(item, note) });
    }, queue);
    writeJson(path, next);
    console.log("✓ 同期しました");
  },
};

if (!commands[command]) fail("使い方: queue.mjs init|status|next|start|set|sync（ファイル先頭のコメントを参照）");
commands[command]();
