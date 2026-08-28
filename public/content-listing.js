// Arsenal+ — listing pages (search results, categories, related products):
// fills in prices for out-of-stock cards by fetching each product page's meta
// tags (cached), and adds a client-side price range filter to the toolbar
// (the store's own precoRange filter is broken server-side).
(() => {
  const AP = globalThis.ArsenalPlus;

  const CACHE_KEY = 'priceCache';
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
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

    if (cacheDirty) await chrome.storage.local.set({ [CACHE_KEY]: cache });
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

  const applyFilter = () => {
    const { min, max } = getFilter();
    const active = min != null || max != null;
    let hidden = 0;

    for (const card of allCards()) {
      const price = cardPrice(card);
      // Cards with unknown price stay visible — they may still be loading.
      const out =
        active &&
        price != null &&
        ((min != null && price < min) || (max != null && price > max));
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
    clear.title = 'Limpar filtro de preço';

    const count = document.createElement('span');
    count.className = 'arsenalplus-filter-count';

    let debounce;
    const onInput = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const parse = (v) => (v === '' ? null : Math.max(0, Number(v)));
        setFilter({ min: parse(minInput.value), max: parse(maxInput.value) });
        applyFilter();
      }, 300);
    };
    minInput.addEventListener('input', onInput);
    maxInput.addEventListener('input', onInput);
    clear.addEventListener('click', () => {
      minInput.value = '';
      maxInput.value = '';
      setFilter({});
      applyFilter();
    });

    wrap.append(label, minInput, dash, maxInput, clear, count);
    toolbox.insertAdjacentElement('afterend', wrap);

    applyFilter(); // restore a filter persisted from the previous page
  };

  // ---- Wiring ------------------------------------------------------------

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
