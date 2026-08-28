// Arsenal+ shared helpers. Loaded before the content scripts (manifest order)
// and imported by the service worker via importScripts(), so no window/DOM here
// beyond what each caller passes in.
globalThis.ArsenalPlus = {
  getMeta(doc, prop) {
    const el = doc.querySelector(`meta[property="${prop}"]`);
    const content = el && el.getAttribute('content');
    return content ? content.trim() : null;
  },

  // "USD 1.290,00" | "380,00" -> 1290.00 | 380.00 (null if unparseable)
  parsePrice(text) {
    if (!text) return null;
    const m = String(text).match(/\d[\d.]*(?:,\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0].replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  },

  isZeroAmount(amount) {
    return !amount || /^0+([.,]0+)?$/.test(amount);
  },

  // "USD Consulte" — price on request. The product can't be bought online,
  // so the tracker treats it the same as unavailable.
  isConsultPrice(text) {
    return /consulte/i.test(String(text || ''));
  },

  // ".../produto/foo-bar-35880.html" -> "35880"
  productIdFromUrl(url) {
    const m = String(url).match(/-(\d+)\.html/);
    return m ? m[1] : null;
  },

  // Regex parsing (not DOMParser) so the same code runs in the service worker.
  // The site emits these metas with property before content, consistently.
  extractPriceFromHtml(html) {
    const amount = html.match(
      /<meta\s+property="product:price:amount"\s+content="([^"]*)"/
    );
    if (!amount || this.isZeroAmount(amount[1]) || this.isConsultPrice(amount[1]))
      return null;
    const currency = html.match(
      /<meta\s+property="product:price:currency"\s+content="([^"]*)"/
    );
    return { amount: amount[1], currency: (currency && currency[1]) || 'USD' };
  },

  // Out-of-stock product pages render the "Avise-me" form (<div class="reply">);
  // in-stock pages don't. Verified against both page variants. Pages whose
  // price (meta or displayed) reads "Consulte" count as unavailable too.
  isAvailableHtml(html) {
    if (html.includes('class="reply"')) return false;
    const meta = html.match(
      /<meta\s+property="product:price:amount"\s+content="([^"]*)"/
    );
    if (meta && this.isConsultPrice(meta[1])) return false;
    const shown = html.match(/<ins[^>]*class="[^"]*new-price[^"]*"[^>]*>([^<]*)/);
    return !(shown && this.isConsultPrice(shown[1]));
  },
};
