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

  // ---- Product-name classification ---------------------------------------
  // The store has no usable attribute data (its own AEG/GBB filter has zero
  // tagged products), so features classify products by display name. Rule
  // order matters and was validated against the live catalog (395 products
  // across six GBB searches): part nouns win over gun words, and gun words win
  // over the "FOR <platform>" accessory pattern — one real rifle is literally
  // named "VFC GBBR FOR AK105". Plain "barrel"/"stock"/"handguard"/"rail" must
  // NOT be part nouns: they appear inside rifle names ("SHORT BARREL",
  // "FOLDING STOCK", "M-LOK HANDGUARD RAIL").
  NAME_PART:
    /magazine|nozzle|valve|hop.?up|bucking|inner barrel|out+er barrel|barrel kit|gas block|charging handle|bolt catch|trigger guard|trigger box|stock tube|buffer|adapter|receiver|flash hider|speed ?loader|hand ?stop|\bgrip\b|\bshells?\b|\bpcs\b|\bkit\b|gas route|speed safety|retrofit/i,
  NAME_LONG_GUN: /\b(rifle|smg|shotgun|carbine|sniper|dmr|pdw)\b/i,
  NAME_BLOWBACK_GUN: /blowback airsoft/i,
  NAME_ACCESSORY_FOR: /\bfor\b|\bpara\b/i,
  NAME_PISTOL: /\b(pistol|pistola|revolver|rev[oó]lver)\b/i,

  isPartName(name) {
    if (!name) return false;
    if (this.NAME_PART.test(name)) return true;
    if (
      this.NAME_LONG_GUN.test(name) ||
      this.NAME_BLOWBACK_GUN.test(name) ||
      this.NAME_PISTOL.test(name)
    ) {
      return false;
    }
    return this.NAME_ACCESSORY_FOR.test(name);
  },

  // Complete replica of any kind (rifle, SMG, shotgun, sniper or pistol).
  isReplicaName(name) {
    if (!name || this.isPartName(name)) return false;
    return (
      this.NAME_LONG_GUN.test(name) ||
      this.NAME_BLOWBACK_GUN.test(name) ||
      this.NAME_PISTOL.test(name)
    );
  },

  // Pistol/revolver only — AR-style "pistols" and pistol-carbine kits keep a
  // long-gun word in the name and don't count as pistols.
  isPistolName(name) {
    if (!name || this.isPartName(name)) return false;
    return this.NAME_PISTOL.test(name) && !this.NAME_LONG_GUN.test(name);
  },

  // Long gun (the GBBR merged-search keep rule). The queries feeding it
  // already guarantee a GBB context in the name. "blowback airsoft" alone
  // covers long guns named without a gun word ("GBBR M4A1 BLOWBACK AIRSOFT
  // BLACK") but must yield to pistols ("BLOWBACK AIRSOFT PISTOL").
  isLongGunName(name) {
    if (!name || this.isPartName(name)) return false;
    if (this.NAME_LONG_GUN.test(name)) return true;
    return this.NAME_BLOWBACK_GUN.test(name) && !this.NAME_PISTOL.test(name);
  },
};
