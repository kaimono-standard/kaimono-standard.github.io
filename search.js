// 「商品を探す」ページの検索。search-index.js の索引をブラウザ内で照合します（サーバー不要）。
(function () {
  const form = document.querySelector("[data-search]");
  const index = window.SEARCH_INDEX;
  if (!form || !Array.isArray(index)) return;

  const input = form.querySelector("input[type=search]");
  const results = document.querySelector("[data-search-results]");
  const status = document.querySelector("[data-search-status]");
  const sections = [...document.querySelectorAll("[data-search-hide]")];
  const MAX_PRODUCTS = 5;

  // 全角→半角、小文字化、ひらがな→カタカナ、記号除去。型番の「EQ-SC22」「eq sc22」を同一視するため。
  const normalize = (text) => String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .replace(/[\s\-‐‑–—−・/／,，.．()（）「」『』]/g, "");

  const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const productText = (p) => normalize([p.name, p.brand, p.model, p.note].join(" "));
  const entries = index.map((entry) => ({
    entry,
    title: normalize(entry.title),
    body: normalize([entry.summary, entry.category, entry.type, ...(entry.keywords || [])].join(" ")),
    products: (entry.products || []).map((p) => ({ product: p, text: productText(p) })),
  }));

  const tokenize = (query) => query.normalize("NFKC").trim().split(/\s+/).map(normalize).filter(Boolean);

  // 全トークンが記事のどこかに一致することが条件。製品の絞り込みには、
  // タイトル・本文に含まれないトークン（ブランド名や型番など）だけを使う。
  const score = (item, tokens) => {
    let total = 0;
    const unresolved = [];
    for (const token of tokens) {
      const inTitle = item.title.includes(token);
      const inBody = item.body.includes(token);
      const hits = item.products.filter((p) => p.text.includes(token)).length;
      if (!inTitle && !inBody && hits === 0) return null;
      if (!inTitle && !inBody) unresolved.push(token);
      total += (inTitle ? 3 : 0) + (inBody ? 1 : 0) + Math.min(hits, 3) * 2;
    }
    const matchedProducts = unresolved.length
      ? item.products.filter((p) => unresolved.every((token) => p.text.includes(token))).map((p) => p.product)
      : [];
    if (unresolved.length && matchedProducts.length === 0) return null;
    return { total, matchedProducts };
  };

  const search = (query) => {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];
    return entries
      .map((item) => ({ item, result: score(item, tokens) }))
      .filter(({ result }) => result)
      .sort((a, b) => b.result.total - a.result.total)
      .map(({ item, result }) => ({ entry: item.entry, products: result.matchedProducts }));
  };

  const renderProduct = (entry, product) => {
    const href = product.anchor ? `${entry.url}#${product.anchor}` : entry.url;
    return `<a class="search-hit" href="${escapeHtml(href)}"><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.note || "")}</span></a>`;
  };

  const renderEntry = ({ entry, products }) => {
    const hits = products.slice(0, MAX_PRODUCTS).map((p) => renderProduct(entry, p)).join("");
    const more = products.length > MAX_PRODUCTS ? `<span class="search-more">ほか${products.length - MAX_PRODUCTS}製品</span>` : "";
    return `<article class="search-result"><div class="directory-list-meta"><span>${escapeHtml(entry.type)}</span><span class="search-category">${escapeHtml(entry.category)}</span><time datetime="${escapeHtml(entry.updated)}">${escapeHtml(entry.updated.replace(/-/g, "."))}</time></div><h3><a href="${escapeHtml(entry.url)}">${escapeHtml(entry.title)}</a></h3><p>${escapeHtml(entry.summary)}</p>${hits ? `<div class="search-hits" aria-label="該当する製品">${hits}${more}</div>` : ""}</article>`;
  };

  const renderEmpty = (query) => `<div class="search-empty"><strong>「${escapeHtml(query)}」に一致する記事はありません</strong><p>型番の一部（例：EQ-SC）やブランド名、「送料」「返品」などの条件で試してください。取り上げてほしい商品は<a href="about.html">運営方針ページ</a>の窓口からお知らせください。</p></div>`;

  const setUrl = (query) => {
    const url = new URL(location.href);
    if (query) url.searchParams.set("q", query); else url.searchParams.delete("q");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  };

  const render = () => {
    const query = input.value.trim();
    const active = query.length > 0;
    sections.forEach((el) => { el.hidden = active; });
    results.hidden = !active;
    form.classList.toggle("is-active", active);
    setUrl(query);
    if (!active) { results.innerHTML = ""; status.textContent = ""; return; }
    const found = search(query);
    const productCount = found.reduce((sum, r) => sum + r.products.length, 0);
    status.textContent = found.length ? `${found.length}件の記事${productCount ? `・${productCount}製品` : ""}が該当` : "該当なし";
    results.innerHTML = found.length ? found.map(renderEntry).join("") : renderEmpty(query);
  };

  form.addEventListener("submit", (event) => { event.preventDefault(); render(); });
  input.addEventListener("input", render);
  input.addEventListener("keydown", (event) => { if (event.key === "Escape") { input.value = ""; render(); } });
  form.querySelector("[data-search-clear]")?.addEventListener("click", () => { input.value = ""; render(); input.focus(); });
  document.querySelectorAll("[data-search-chip]").forEach((chip) => {
    chip.addEventListener("click", () => { input.value = chip.dataset.searchChip; render(); input.focus(); });
  });

  // サイドバーの見出しリンクは通常表示に戻してから移動する
  document.querySelectorAll('.directory-sidebar nav a[href^="#"]').forEach((link) => {
    link.addEventListener("click", () => { if (input.value) { input.value = ""; render(); } });
  });

  const initial = new URLSearchParams(location.search).get("q");
  if (initial) input.value = initial;
  render();
})();
