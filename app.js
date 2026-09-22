(function () {
  const config = window.SITE_CONFIG || { affiliateLinks: {} };
  // アクセス解析（GA4）が読み込まれているときだけ送る。商品リンクのクリックは店・製品キーつきの affiliate_click にまとめる
  const track = (name, params) => {
    if (typeof window.gtag === "function") window.gtag("event", name, { ...params, page_path: location.pathname });
  };
  const yen = (value) => Math.max(0, Math.round(value || 0)).toLocaleString("ja-JP") + "円";
  document.querySelectorAll("[data-updated]").forEach((el) => { el.textContent = config.updatedAt || "2026-09-20"; });
  document.querySelectorAll("[data-affiliate]").forEach((link) => {
    const key = link.dataset.affiliate;
    const affiliateUrl = config.affiliateLinks?.[key];
    link.href = affiliateUrl || link.dataset.fallback || "https://rakuyoko.rakuten.co.jp/";
    link.dataset.linkStatus = affiliateUrl ? "affiliate" : "direct";
    if (!affiliateUrl) link.title = "現在は通常リンクです";
    link.addEventListener("click", () => track("affiliate_click", { store: "rakuten", item: key, link_status: link.dataset.linkStatus }));
  });
  document.querySelectorAll("[data-amazon]").forEach((link) => {
    const key = link.dataset.amazon;
    const amazonUrl = config.amazonLinks?.[key];
    link.href = amazonUrl || link.dataset.fallback || "https://www.amazon.co.jp/";
    link.dataset.linkStatus = amazonUrl ? "affiliate" : "direct";
    link.addEventListener("click", () => track("affiliate_click", { store: "amazon", item: key, link_status: link.dataset.linkStatus }));
  });
  document.querySelectorAll("[data-basket-calculator]").forEach((form) => {
    const result = form.querySelector("[data-basket-result]");
    const render = () => {
      const subtotal = Number(form.elements.price.value || 0);
      const coupon = Number(form.elements.coupon.value || 0);
      const points = Number(form.elements.points?.value || 0);
      const regionFee = form.elements.remote?.checked ? 1900 : 0;
      const afterCoupon = Math.max(0, subtotal - coupon);
      const effective = Math.max(0, afterCoupon - points) + regionFee;
      result.classList.remove("caution", "danger");
      if (subtotal > 16666) {
        result.classList.add("danger");
        result.innerHTML = `<strong>注文上限を${yen(subtotal - 16666)}超えています</strong><br>クーポン適用前の商品合計を16,666円以下に分けてください。`;
      } else if (subtotal < 2100) {
        result.classList.add("danger");
        result.innerHTML = `<strong>商品をあと${yen(2100 - subtotal)}追加</strong><br>商品合計が注文下限2,100円に達していません。参考実質負担は${yen(effective)}です。`;
      } else if (afterCoupon < 2100) {
        result.classList.add("caution");
        result.innerHTML = `<strong>クーポン後はあと${yen(2100 - afterCoupon)}不足</strong><br>公式条件では、クーポン適用後・ポイント利用前の金額が2,100円以上必要です。`;
      } else {
        result.innerHTML = `<strong>公式の注文金額条件を満たします</strong><br>商品合計${yen(subtotal)}／クーポン後${yen(afterCoupon)}。参考実質負担は${yen(effective)}です。`;
      }
    };
    form.addEventListener("input", render);
    render();
  });
  const compareForm = document.querySelector("#compare-calculator");
  if (compareForm) {
    const renderCompare = () => {
      const read = (prefix) => ["price", "shipping", "coupon", "points"].map((n) => Number(compareForm.elements[`${prefix}-${n}`].value || 0));
      const a = read("r"), b = read("o");
      const rTotal = Math.max(0, a[0] + a[1] - a[2] - a[3]);
      const oTotal = Math.max(0, b[0] + b[1] - b[2] - b[3]);
      const delta = Math.abs(rTotal - oTotal);
      const winner = rTotal === oTotal ? "実質負担は同額" : rTotal < oTotal ? "ラクヨコ側が安い" : "比較先が安い";
      document.querySelector("#compare-result").innerHTML = `<strong>${winner}</strong><br>ラクヨコ ${yen(rTotal)} / 比較先 ${yen(oTotal)}（差 ${yen(delta)}）`;
    };
    compareForm.addEventListener("input", renderCompare); renderCompare();
  }
  const returnForm = document.querySelector("#return-checker");
  if (returnForm) {
    const renderReturn = () => {
      const days = Number(returnForm.elements.days.value || 0);
      const rselect = returnForm.elements.rselect.checked;
      const customerReason = returnForm.elements.reason.value === "customer";
      const output = document.querySelector("#return-result");
      output.classList.remove("caution", "danger");
      if (days > 30) { output.classList.add("danger"); output.textContent = "公式案内の返品リクエスト期間（発送日から30日以内）を超えています。"; }
      else if (customerReason && !rselect) { output.classList.add("caution"); output.textContent = "通常商品で自己都合の場合は対象外の可能性があります。商品ページの返品条件を確認してください。"; }
      else if (customerReason && rselect) output.textContent = "Rセレクトは公式案内上、自己都合返品の対象です。個別条件を確認して申請してください。";
      else output.textContent = "返品リクエスト期間内です。商品の状態・理由など個別条件を確認して申請してください。";
    };
    returnForm.addEventListener("input", renderReturn); renderReturn();
  }
})();
