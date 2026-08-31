(() => {
  const AP = globalThis.ArsenalPlus;

  const CACHE_KEY = 'priceCache';
  const CACHE_TTL = 24 * 60 * 60 * 1000;
  const CACHE_MAX_ENTRIES = 500;
  const FILTER_STORE = 'arsenalplus_filter';
  const BRANDS_KEY = 'brandList';
  const BRANDS_TTL = 7 * 24 * 60 * 60 * 1000;

  let brands = [];
  let brandsPromise = null;
  let selTypes = [];
  let selBrands = [];

  const loadBrands = () => {
    if (brandsPromise) return brandsPromise;
    brandsPromise = (async () => {
      const { [BRANDS_KEY]: cached } = await chrome.storage.local.get(BRANDS_KEY);
      if (cached && cached.list.length && Date.now() - cached.ts < BRANDS_TTL) {
        return cached.list;
      }
      try {
        const list = AP.parseBrands(await AP.net.text(`${location.origin}/marcas`));
        if (list.length) {
          await chrome.storage.local.set({ [BRANDS_KEY]: { list, ts: Date.now() } });
          return list;
        }
      } catch {}
      return (cached && cached.list) || [];
    })();
    return brandsPromise;
  };

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

  const fillCard = (card, { amount, currency }) => {
    if (card.querySelector('.arsenalplus-price')) return;

    const container = AP.ui.priceTag({
      amount,
      currency,
      className: 'arsenalplus-price arsenalplus-card-price',
      badge: AP.ui.badge('A+', 'Preço recuperado pelo Arsenal+ (produto indisponível)'),
    });

    const details = card.querySelector('.product-details') || card;
    const btn = details.querySelector('a.btn');
    if (btn) btn.insertAdjacentElement('beforebegin', container);
    else details.append(container);
  };

  let fillRun = 0;

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
          const price = AP.extractPriceFromHtml(await AP.net.head(url));
          if (!price) continue;
          entry = { ...price, ts: now };
          cache[id] = entry;
          cacheDirty = true;
        } catch {
          continue;
        }
      }

      if (run !== fillRun) break;
      fillCard(card, entry);
      applyFilter();
      applySort();
    }

    if (cacheDirty) {
      pruneCache(cache, now);
      await chrome.storage.local.set({ [CACHE_KEY]: cache });
    }
  };

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
    } catch {}
  };

  const cardPrice = (card) => {
    const el = card.querySelector('.new-price');
    return el ? AP.parsePrice(el.textContent) : null;
  };

  const cardName = (card) => {
    const a = card.querySelector('.product-details .product-name a');
    if (!a) return '';
    const title = a.getAttribute('title');
    if (title) return title.replace(/\s*Arsenal Sports\s*$/i, '').trim();
    return a.textContent.replace(/Ref\.:\s*\S+/i, '').trim();
  };

  const applyFilter = () => {
    if (!document.querySelector('.arsenalplus-filter')) return;

    const { min, max, onlyReplicas, noPistols } = getFilter();
    const priceActive = min != null || max != null;
    const brandActive = selBrands.length > 0 && brands.length > 0;
    const active =
      priceActive || onlyReplicas || noPistols || selTypes.length > 0 || brandActive;
    let hidden = 0;

    for (const card of allCards()) {
      const price = cardPrice(card);
      const name = cardName(card);
      const out =
        (priceActive &&
          price != null &&
          ((min != null && price < min) || (max != null && price > max))) ||
        (!!onlyReplicas && !!name && !AP.isReplicaName(name)) ||
        (!!noPistols && !!name && AP.isPistolName(name)) ||
        (selTypes.length > 0 && !selTypes.includes(AP.typeOf(name))) ||
        (brandActive && !selBrands.includes(AP.brandOf(name, brands)));
      const target = card.closest('.product-wrap') || card;
      target.classList.toggle('arsenalplus-filtered-out', out);
      if (out) hidden++;
    }

    const count = document.querySelector('.arsenalplus-filter-count');
    if (count) {
      count.textContent = active && hidden ? `${hidden} ocultos` : '';
    }

    blockNative();
  };

  const facets = { type: null, brand: null };

  const typeSummary = (sel) =>
    !sel.length
      ? 'Tipo'
      : sel.length === 1
        ? `Tipo: ${AP.PROPULSION_LABELS[sel[0]] || sel[0]}`
        : `${sel.length} tipos`;

  const brandSummary = (sel) =>
    !brands.length
      ? 'Marca…'
      : !sel.length
        ? 'Marca'
        : sel.length === 1
          ? `Marca: ${sel[0]}`
          : `${sel.length} marcas`;

  const refreshFacets = () => {
    if (!facets.type) return;
    const cards = allCards();

    const typeCounts = new Map();
    for (const card of cards) {
      const t = AP.typeOf(cardName(card));
      if (t) typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
    }
    facets.type.render(
      typeSummary(selTypes),
      [...typeCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => ({
          value: k,
          label: `${AP.PROPULSION_LABELS[k]} (${n})`,
          checked: selTypes.includes(k),
        }))
    );

    const brandCounts = new Map();
    for (const card of cards) {
      const name = cardName(card);
      if (selTypes.length > 0 && !selTypes.includes(AP.typeOf(name))) continue;
      const b = AP.brandOf(name, brands);
      if (b) brandCounts.set(b, (brandCounts.get(b) || 0) + 1);
    }
    facets.brand.render(
      brandSummary(selBrands),
      [...brandCounts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([b, n]) => ({ value: b, label: `${b} (${n})`, checked: selBrands.includes(b) }))
    );
  };

  const getSort = () => getFilter().sort || '';
  const setSort = (v) => setFilter({ ...getFilter(), sort: v || null });

  const isArsenalActive = () => {
    const { min, max, onlyReplicas, noPistols } = getFilter();
    return (
      getSort() !== '' ||
      selTypes.length > 0 ||
      selBrands.length > 0 ||
      min != null ||
      max != null ||
      !!onlyReplicas ||
      !!noPistols
    );
  };

  const priceKey = (card, dir) => {
    const p = cardPrice(card);
    return p == null ? dir * Infinity : p;
  };
  const idx = (w) => Number(w.dataset.apIdx) || 0;

  const SORTS = {
    priceAsc: (a, b) => priceKey(a, 1) - priceKey(b, 1),
    priceDesc: (a, b) => priceKey(b, -1) - priceKey(a, -1),
    nameAsc: (a, b) => cardName(a).localeCompare(cardName(b)),
    nameDesc: (a, b) => cardName(b).localeCompare(cardName(a)),
  };

  const stampOrder = () => {
    allCards().forEach((card, i) => {
      const wrap = card.closest('.product-wrap') || card;
      if (wrap.dataset.apIdx == null) wrap.dataset.apIdx = String(i);
    });
  };

  const gridEl = () =>
    document.querySelector('.product_list') ||
    (allCards()[0]?.closest('.product-wrap') || allCards()[0])?.parentNode ||
    null;

  const applySort = () => {
    if (!facets.type) return;
    const grid = gridEl();
    if (!grid) return;
    stampOrder();
    const cmp = SORTS[getSort()] || ((a, b) => idx(a) - idx(b));
    const wraps = allCards()
      .map((c) => c.closest('.product-wrap') || c)
      .filter((w) => w.parentNode === grid);
    wraps.sort(cmp).forEach((w) => grid.append(w));
  };

  const blockNative = () => {
    const on = selTypes.length > 0 || selBrands.length > 0;
    for (const a of document.querySelectorAll('.toolbox-pagination a')) {
      a.classList.toggle('arsenalplus-native-blocked', on);
      if (on && !a.dataset.apBlocked) {
        a.dataset.apBlocked = a.title || '1';
        a.title = 'Limpe os filtros Tipo/Marca do Arsenal+ para paginar';
      } else if (!on && a.dataset.apBlocked) {
        a.title = a.dataset.apBlocked === '1' ? '' : a.dataset.apBlocked;
        delete a.dataset.apBlocked;
      }
    }
  };

  const setupFilterUI = () => {
    const toolbox = document.querySelector('.toolbox-sort');
    if (!toolbox || document.querySelector('.arsenalplus-filter')) return;

    document.querySelectorAll('select.setSortOption').forEach((s) => {
      const item = s.closest('.toolbox-sort') || s.closest('.toolbox-item') || s;
      item.style.display = 'none';
    });

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

    const typeSelect = AP.ui.multiSelect({
      title: 'Filtrar por tipo / propulsão — múltipla escolha (Arsenal+)',
      onChange: (vals) => {
        selTypes = vals;
        refreshFacets();
        applyFilter();
      },
    });

    const brandSelect = AP.ui.multiSelect({
      title: 'Filtrar por marca — múltipla escolha (Arsenal+)',
      onChange: (vals) => {
        selBrands = vals;
        refreshFacets();
        applyFilter();
      },
      onOpen: () => {
        if (!brands.length) {
          loadBrands().then((list) => {
            brands = list;
            refreshFacets();
            applyFilter();
          });
        }
      },
    });

    facets.type = typeSelect;
    facets.brand = brandSelect;

    const sortLabel = AP.ui.el('label', { textContent: 'Ordenar:' });
    const sortSelect = AP.ui.el('select', {
      className: 'arsenalplus-sort',
      title: 'Ordenar — client-side, sem recarregar (Arsenal+)',
    });
    for (const [value, text] of [
      ['', 'Relevância'],
      ['priceAsc', 'Menor preço'],
      ['priceDesc', 'Maior preço'],
      ['nameAsc', 'Nome A-Z'],
      ['nameDesc', 'Nome Z-A'],
    ]) {
      sortSelect.append(AP.ui.el('option', { value, textContent: text }));
    }
    sortSelect.value = getSort();
    sortSelect.addEventListener('change', () => {
      setSort(sortSelect.value);
      applySort();
    });

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
      selTypes = [];
      selBrands = [];
      sortSelect.value = '';
      setFilter({});
      refreshFacets();
      applySort();
      applyFilter();
    });

    wrap.append(
      sortLabel,
      sortSelect,
      label,
      minInput,
      dash,
      maxInput,
      typeSelect,
      brandSelect,
      onlyReplicasCheck,
      noPistolsCheck,
      clear,
      count
    );
    toolbox.insertAdjacentElement('afterend', wrap);

    refreshFacets();
    applySort();
    applyFilter();
  };

  AP.listing = { fillMissingPrices, applyFilter, refreshFacets, applySort };

  document.addEventListener(
    'click',
    (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!isArsenalActive()) return;
      const link = e.target.closest && e.target.closest('a[href*="/produto/"]');
      if (!link || !link.closest('.product-wrap')) return;
      e.preventDefault();
      const tab = window.open(link.href, '_blank');
      if (tab) tab.opener = null;
    },
    true
  );

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
        fillRun++;
        removeFilledPrices();
        applyFilter();
      }
    }
  });
})();
