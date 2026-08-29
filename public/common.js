globalThis.ArsenalPlus = {
  getMeta(doc, prop) {
    const el = doc.querySelector(`meta[property="${prop}"]`);
    const content = el && el.getAttribute('content');
    return content ? content.trim() : null;
  },

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

  isConsultPrice(text) {
    return /consulte/i.test(String(text || ''));
  },

  productIdFromUrl(url) {
    const m = String(url).match(/-(\d+)\.html/);
    return m ? m[1] : null;
  },

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

  isAvailableHtml(html) {
    if (html.includes('class="reply"')) return false;
    const meta = html.match(
      /<meta\s+property="product:price:amount"\s+content="([^"]*)"/
    );
    if (meta && this.isConsultPrice(meta[1])) return false;
    const shown = html.match(/<ins[^>]*class="[^"]*new-price[^"]*"[^>]*>([^<]*)/);
    return !(shown && this.isConsultPrice(shown[1]));
  },

  normalizeName(name) {
    return String(name || '').replace(/\s+/g, ' ').trim();
  },

  NAME_PART:
    /magazine|nozzle|valve|hop.?up|bucking|inner barrel|out+er barrel|barrel kit|gas block|charging handle|bolt catch|trigger guard|trigger box|stock tube|buffer|adapter|receiver|flash hider|speed ?loader|hand ?stop|fore ?grip|front grip|hand grip|vertical grip|angled grip|bipod grip|grip pod|pistol grip|motor grip|grip (set|screw|safety|cover|panel|end)|\bshells?\b|\bpcs\b|\bkit\b|gas route|speed safety|retrofit/i,
  NAME_BARE_GRIP: /\bgrips?\b/i,
  NAME_LONG_GUN: /\b(rifle|smg|shotgun|carbine|sniper|dmr|pdw)\b/i,
  NAME_BLOWBACK_GUN: /blowback airsoft/i,
  NAME_ACCESSORY_FOR: /\bfor\b|\bpara\b/i,
  NAME_PISTOL: /\b(pistol|pistola|revolver|rev[oó]lver)\b/i,
  NAME_GUN_SALE:
    /blowback airsoft|airsoft (rifle|pistol|revolver|smg|carbine|shotgun|sniper|dmr|pdw|gun)\b|airgun (rifle|pistol|revolver)\b|pcp (rifle|pistol|carbine|combo)\b|air (rifle|pistol)\b/i,

  isGunSaleName(name) {
    const sold = this.normalizeName(name).split(this.NAME_ACCESSORY_FOR)[0];
    return this.NAME_GUN_SALE.test(sold);
  },

  isPartName(name) {
    name = this.normalizeName(name);
    if (!name) return false;
    if (this.NAME_PART.test(name)) return true;
    if (this.NAME_BARE_GRIP.test(name) && !this.isGunSaleName(name)) {
      return true;
    }
    if (
      this.NAME_LONG_GUN.test(name) ||
      this.NAME_BLOWBACK_GUN.test(name) ||
      this.NAME_PISTOL.test(name)
    ) {
      return false;
    }
    return this.NAME_ACCESSORY_FOR.test(name);
  },

  isReplicaName(name) {
    name = this.normalizeName(name);
    if (!name || this.isPartName(name)) return false;
    return (
      this.NAME_LONG_GUN.test(name) ||
      this.NAME_BLOWBACK_GUN.test(name) ||
      this.NAME_PISTOL.test(name)
    );
  },

  isPistolName(name) {
    name = this.normalizeName(name);
    if (!name || this.isPartName(name)) return false;
    return this.NAME_PISTOL.test(name) && !this.NAME_LONG_GUN.test(name);
  },

  isLongGunName(name) {
    name = this.normalizeName(name);
    if (!name || this.isPartName(name)) return false;
    if (this.NAME_LONG_GUN.test(name)) return true;
    return this.NAME_BLOWBACK_GUN.test(name) && !this.NAME_PISTOL.test(name);
  },

  PART_TYPES: {
    magazine: { re: /magazines?\b/i },
    bolt: {
      re: /bolt (carrier|handle|cap|knob|head|end|catch|lock|stop|releas|plate|set)|complete (\w+ )?bolt|custom bolt|spring and bolt|recoil bolt|\bbolt for\b|\bbolts?$/i,
    },
    nozzle: { re: /nozzles?\b/i },
    hopup: { re: /hop.?up|\bhop\b|bucking/i },
    barrel: { re: /barrels?\b/i },
    trigger: { re: /triggers?\b/i },
    stock: { re: /\bstocks?\b|buttstock/i },
    handguard: {
      re: /hand ?guards?\b/i,
      exclude: /handguard switch|wired to handguard/i,
    },
    foregrip: {
      re: /fore ?grip|front grip|hand grip|vertical grip|angled grip|bipod grip|grip pod/i,
    },
    pistolgrip: {
      re: /\bgrips?\b/i,
      exclude:
        /fore ?grip|front grip|hand grip|vertical grip|angled grip|bipod grip|grip pod|over ?grip|x-grip|grip line|tank grip/i,
    },
    slide: { re: /\bslides?\b/i, exclude: /slide check/i },
  },

  matchesPartType(name, key) {
    const type = this.PART_TYPES[key];
    name = this.normalizeName(name);
    if (!type || !name) return false;
    return (
      type.re.test(name) &&
      !(type.exclude && type.exclude.test(name)) &&
      !this.isGunSaleName(name)
    );
  },
};
