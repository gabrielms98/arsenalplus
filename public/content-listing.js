// Arsenal+ — listing pages (search results, categories, related products):
// fills in prices for out-of-stock cards by fetching each product page's meta
// tags (cached), and adds a client-side price range filter to the toolbar
// (the store's own precoRange filter is broken server-side).
(() => {
  const AP = globalThis.ArsenalPlus;

  const CACHE_KEY = 'priceCache';
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
  const CACHE_MAX_ENTRIES = 500;
  const FETCH_DELAY = 400; // ms between network fetches — be polite to the shop
  const FILTER_STORE = 'arsenalplus_filter';

  // ---- Card discovery ----------------------------------------------------

  const allCards = () => [...document.querySelectorAll('.product')];

  const cardLink = (card) => {
    const a = card.querySelector('a[href*="/produto/"]');
    return a ? a.href : null;
  };

  const cardsNeedingPrice = () =>
    allCards().filter(
      (card) =>
        !card.querySelector('.new-price') &&
        AP.productIdFromUrl(cardLink(card) || '')
    );

  // ---- Price fill --------------------------------------------------------

  const fillCard = (card, { amount, currency }) => {
    if (card.querySelector('.arsenalplus-price')) return;

    const container = document.createElement('div');
    container.className = 'product-price arsenalplus-price arsenalplus-card-price';

    const price = document.createElement('ins');
    price.className = 'new-price';
    price.textContent = `${currency} ${amount}`;

    const badge = document.createElement('span');
    badge.className = 'arsenalplus-badge';
    badge.textContent = 'A+';
    badge.title = 'Preço recuperado pelo Arsenal+ (produto indisponível)';

    container.append(price, badge);

    // Available cards keep their price right before the card button; mirror that.
    const details = card.querySelector('.product-details') || card;
    const btn = details.querySelector('a.btn');
    if (btn) btn.insertAdjacentElement('beforebegin', container);
    else details.append(container);
  };

  let fillRun = 0; // invalidates an in-flight run when the toggle flips off

  const fillMissingPrices = async () => {
    const run = ++fillRun;
    const cards = cardsNeedingPrice();
    if (!cards.length) return;

    const { [CACHE_KEY]: cache = {} } = await chrome.storage.local.get(CACHE_KEY);
    let cacheDirty = false;
    const now = Date.now();

    for (const card of cards) {
      if (run !== fillRun) break;
      const url = cardLink(card);
      const id = AP.productIdFromUrl(url);

      let entry = cache[id];
      if (!entry || now - entry.ts > CACHE_TTL) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const price = AP.extractPriceFromHtml(await res.text());
          if (!price) continue;
          entry = { ...price, ts: now };
          cache[id] = entry;
          cacheDirty = true;
        } catch {
          continue;
        } finally {
          await new Promise((r) => setTimeout(r, FETCH_DELAY));
        }
      }

      if (run !== fillRun) break;
      fillCard(card, entry);
      applyFilter(); // newly priced card must respect an active filter
    }

    if (cacheDirty) {
      pruneCache(cache, now);
      await chrome.storage.local.set({ [CACHE_KEY]: cache });
    }
  };

  // Keeps the cache bounded: drop expired entries, then oldest-first down to
  // the cap. Runs on every write, so the cache never grows past ~35KB.
  const pruneCache = (cache, now) => {
    for (const [id, entry] of Object.entries(cache)) {
      if (now - entry.ts > CACHE_TTL) delete cache[id];
    }
    const ids = Object.keys(cache);
    if (ids.length > CACHE_MAX_ENTRIES) {
      ids.sort((a, b) => cache[a].ts - cache[b].ts);
      for (const id of ids.slice(0, ids.length - CACHE_MAX_ENTRIES)) {
        delete cache[id];
      }
    }
  };

  const removeFilledPrices = () => {
    document
      .querySelectorAll('.arsenalplus-card-price')
      .forEach((el) => el.remove());
  };

  // ---- Price range filter ------------------------------------------------

  const getFilter = () => {
    try {
      return JSON.parse(sessionStorage.getItem(FILTER_STORE)) || {};
    } catch {
      return {};
    }
  };

  const setFilter = (f) => {
    try {
      sessionStorage.setItem(FILTER_STORE, JSON.stringify(f));
    } catch {
      /* private mode etc. — filter just won't survive navigation */
    }
  };

  const cardPrice = (card) => {
    const el = card.querySelector('.new-price');
    return el ? AP.parsePrice(el.textContent) : null;
  };

  // Card titles render as "Ref.: 285315<br>NAME"; the link's title attribute
  // carries the clean name with an " Arsenal Sports" suffix.
  const cardName = (card) => {
    const a = card.querySelector('.product-details .product-name a');
    if (!a) return '';
    const title = a.getAttribute('title');
    if (title) return title.replace(/\s*Arsenal Sports\s*$/i, '').trim();
    return a.textContent.replace(/Ref\.:\s*\S+/i, '').trim();
  };

  const applyFilter = () => {
    // Only where the filter UI lives (listing pages) — keeps a persisted
    // filter from silently hiding related-product cards on product pages.
    if (!document.querySelector('.arsenalplus-filter')) return;

    const { min, max, onlyReplicas, noPistols } = getFilter();
    const priceActive = min != null || max != null;
    const active = priceActive || onlyReplicas || noPistols;
    let hidden = 0;

    for (const card of allCards()) {
      const price = cardPrice(card);
      const name = cardName(card);
      // Cards with unknown price stay visible — they may still be loading.
      const out =
        (priceActive &&
          price != null &&
          ((min != null && price < min) || (max != null && price > max))) ||
        (!!onlyReplicas && !!name && !AP.isReplicaName(name)) ||
        (!!noPistols && !!name && AP.isPistolName(name));
      const target = card.closest('.product-wrap') || card;
      target.classList.toggle('arsenalplus-filtered-out', out);
      if (out) hidden++;
    }

    const count = document.querySelector('.arsenalplus-filter-count');
    if (count) {
      count.textContent = active && hidden ? `${hidden} ocultos` : '';
    }
  };

  const setupFilterUI = () => {
    const toolbox = document.querySelector('.toolbox-sort');
    if (!toolbox || document.querySelector('.arsenalplus-filter')) return;

    const { min, max } = getFilter();

    const wrap = document.createElement('div');
    wrap.className = 'toolbox-item arsenalplus-filter';

    const label = document.createElement('label');
    label.textContent = 'Preço:';

    const makeInput = (placeholder, value) => {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.placeholder = placeholder;
      input.className = 'arsenalplus-filter-input';
      if (value != null) input.value = value;
      return input;
    };

    const minInput = makeInput('mín', min);
    const maxInput = makeInput('máx', max);

    const dash = document.createElement('span');
    dash.textContent = '–';

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'arsenalplus-filter-clear';
    clear.textContent = '×';
    clear.title = 'Limpar filtros (Arsenal+)';

    const count = document.createElement('span');
    count.className = 'arsenalplus-filter-count';

    // Quick filters on what the card *is*, not its price: "Só réplicas" hides
    // parts, magazines, gear and consumables; "Sem pistolas" hides handguns.
    const makeCheck = (key, text, title, checked) => {
      const lbl = document.createElement('label');
      lbl.className = 'arsenalplus-check';
      lbl.title = title;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!checked;
      input.addEventListener('change', () => {
        setFilter({ ...getFilter(), [key]: input.checked || null });
        applyFilter();
      });
      lbl.append(input, document.createTextNode(text));
      return lbl;
    };

    const { onlyReplicas, noPistols } = getFilter();
    const onlyReplicasCheck = makeCheck(
      'onlyReplicas',
      'Só réplicas',
      'Ocultar peças, magazines e acessórios (Arsenal+)',
      onlyReplicas
    );
    const noPistolsCheck = makeCheck(
      'noPistols',
      'Sem pistolas',
      'Ocultar pistolas e revólveres (Arsenal+)',
      noPistols
    );

    let debounce;
    const onInput = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const parse = (v) => (v === '' ? null : Math.max(0, Number(v)));
        setFilter({
          ...getFilter(),
          min: parse(minInput.value),
          max: parse(maxInput.value),
        });
        applyFilter();
      }, 300);
    };
    minInput.addEventListener('input', onInput);
    maxInput.addEventListener('input', onInput);
    clear.addEventListener('click', () => {
      minInput.value = '';
      maxInput.value = '';
      onlyReplicasCheck.querySelector('input').checked = false;
      noPistolsCheck.querySelector('input').checked = false;
      setFilter({});
      applyFilter();
    });

    wrap.append(
      label,
      minInput,
      dash,
      maxInput,
      onlyReplicasCheck,
      noPistolsCheck,
      clear,
      count
    );
    toolbox.insertAdjacentElement('afterend', wrap);

    applyFilter(); // restore a filter persisted from the previous page
  };

  // ---- Wiring ------------------------------------------------------------

  // Hooks for content-gbbr.js: after it swaps in merged result cards, it
  // re-runs the price fill and the filters over them.
  AP.listing = { fillMissingPrices, applyFilter };

  setupFilterUI();

  chrome.storage.sync
    .get({ showHiddenPrices: true })
    .then(({ showHiddenPrices }) => {
      if (showHiddenPrices) fillMissingPrices();
    });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.showHiddenPrices) {
      if (changes.showHiddenPrices.newValue) {
        fillMissingPrices();
      } else {
        fillRun++; // stop any in-flight fill
        removeFilledPrices();
        applyFilter();
      }
    }
  });
})();
