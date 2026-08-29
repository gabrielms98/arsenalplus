(() => {
  const AP = globalThis.ArsenalPlus;

  const FETCH_DELAY = 400;

  const partPreset = (key, label, title, queries) => ({
    key,
    label,
    title: `${title} — peças de todo o catálogo (Arsenal+)`,
    queries,
    keep: (name) => AP.matchesPartType(name, key),
    doneText: (n) => `${n} itens — ${label.toLowerCase()}, catálogo inteiro.`,
  });

  const PRESETS = [
    {
      key: 'gbbr',
      label: 'Rifles GBB',
      title:
        'Todos os rifles GBB do catálogo — a busca da loja não os acha de ' +
        'uma vez: uns se chamam "GBBR", outros só "GBB" (Arsenal+)',
      queries: ['gbbr', 'gbb rifle', 'gbb smg', 'gbb shotgun', 'gbb carbine', 'gbb sniper'],
      keep: (name) => AP.isLongGunName(name),
      doneText: (n) =>
        `${n} rifles GBB — resultado combinado de 6 buscas, sem peças nem pistolas.`,
    },
    partPreset('magazine', 'Magazines', 'Todos os magazines', ['magazine']),
    partPreset('bolt', 'Bolts', 'Bolts, bolt carriers, bolt catches e afins', ['bolt']),
    partPreset('nozzle', 'Nozzles', 'Todos os nozzles', ['nozzle']),
    partPreset('hopup', 'Hop-up', 'Câmaras de hop-up e buckings', ['hop', 'bucking']),
    partPreset('barrel', 'Canos', 'Canos internos e externos (inner/outer barrel)', ['barrel']),
    partPreset('trigger', 'Gatilhos', 'Gatilhos e trigger sets', ['trigger']),
    partPreset('stock', 'Coronhas', 'Coronhas (stocks) e tubos de coronha', ['stock']),
    partPreset('handguard', 'Handguards', 'Todos os handguards', ['handguard']),
    partPreset('foregrip', 'Grips frontais', 'Foregrips verticais e angulares', ['grip']),
    partPreset('pistolgrip', 'Pistol grips', 'Pistol grips, motor grips e empunhaduras', ['grip']),
    partPreset('slide', 'Slides', 'Slides de pistola e peças de slide', ['slide']),
  ];

  const grid = document.querySelector('.product_list');
  const toolbox = document.querySelector('nav.toolbox');
  if (!grid || !toolbox) return;

  const searchUrl = (q, page) =>
    `${location.origin}/produtos/filter?q=${encodeURIComponent(q)}` +
    (page > 1 ? `&pagina=${page}` : '');

  const parsePage = (html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const cards = [...doc.querySelectorAll('.product_list .product-wrap')];
    const pages = [...doc.querySelectorAll('.toolbox-pagination a')].map(
      (a) => Number(((a.getAttribute('href') || '').match(/pagina=(\d+)/) || [])[1]) || 1
    );
    return { cards, lastPage: Math.max(1, ...pages) };
  };

  const pageCache = new Map();
  let fetchedOnce = false;

  const fetchPage = async (url) => {
    if (pageCache.has(url)) return pageCache.get(url);
    if (fetchedOnce) await new Promise((r) => setTimeout(r, FETCH_DELAY));
    fetchedOnce = true;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = parsePage(await res.text());
    pageCache.set(url, parsed);
    return parsed;
  };

  const cardLink = (card) => {
    const a = card.querySelector('a[href*="/produto/"]');
    return a ? a.getAttribute('href') : '';
  };

  const cardName = (card) => {
    const a = card.querySelector('a[href*="/produto/"][title]');
    return a
      ? a.getAttribute('title').replace(/\s*Arsenal Sports\s*$/i, '').trim()
      : '';
  };

  const collect = async (preset, onProgress) => {
    const kept = new Map();
    let pagesDone = 0;
    let pagesTotal = preset.queries.length;

    for (const q of preset.queries) {
      let lastPage = 1;
      for (let page = 1; page <= lastPage; page++) {
        const parsed = await fetchPage(searchUrl(q, page));
        if (page === 1) {
          lastPage = parsed.lastPage;
          pagesTotal += lastPage - 1;
        }
        for (const card of parsed.cards) {
          const id = AP.productIdFromUrl(cardLink(card));
          if (!id || kept.has(id)) continue;
          const name = cardName(card);
          if (preset.keep(name)) kept.set(id, { name, card });
        }
        pagesDone++;
        onProgress(pagesDone, pagesTotal, kept.size);
      }
    }

    return [...kept.values()].sort((a, b) => a.name.localeCompare(b.name));
  };

  const pagination = () => document.querySelector('.toolbox-pagination');

  let originalCards = null;

  const showItems = (items) => {
    if (!originalCards) {
      originalCards = document.createDocumentFragment();
      while (grid.firstChild) originalCards.append(grid.firstChild);
    } else {
      grid.textContent = '';
    }
    for (const { card } of items) grid.append(document.importNode(card, true));
    const pager = pagination();
    if (pager) pager.style.display = 'none';
    AP.listing?.applyFilter();
    AP.listing?.fillMissingPrices();
  };

  const restore = () => {
    grid.textContent = '';
    grid.append(originalCards);
    originalCards = null;
    const pager = pagination();
    if (pager) pager.style.display = '';
    AP.listing?.applyFilter();
  };

  const IDLE_TEXT =
    'Arsenal+: filtros do catálogo inteiro — cada um combina as buscas ' +
    'que cobrem o tipo e filtra pelo nome.';

  const bar = document.createElement('div');
  bar.className = 'arsenalplus-presets';

  const label = document.createElement('span');
  label.className = 'arsenalplus-presets-label';
  label.textContent = 'Arsenal+';

  const status = document.createElement('span');
  status.className = 'arsenalplus-presets-status';
  status.textContent = IDLE_TEXT;

  const results = new Map();
  const chips = new Map();
  let active = null;
  let running = false;

  const setActive = (key) => {
    active = key;
    for (const [k, chip] of chips) chip.classList.toggle('active', k === key);
  };

  const activate = async (preset) => {
    if (running) return;

    if (active === preset.key) {
      setActive(null);
      restore();
      status.textContent = IDLE_TEXT;
      return;
    }

    if (!results.has(preset.key)) {
      running = true;
      for (const chip of chips.values()) chip.disabled = true;
      try {
        results.set(
          preset.key,
          await collect(preset, (done, total, found) => {
            status.textContent =
              `Buscando ${preset.label.toLowerCase()}… página ${done} de ${total} ` +
              `— ${found} encontrados.`;
          })
        );
      } catch {
        status.textContent =
          'Falha ao buscar — verifique a conexão e tente de novo.';
        return;
      } finally {
        running = false;
        for (const chip of chips.values()) chip.disabled = false;
      }
    }

    const items = results.get(preset.key);
    setActive(preset.key);
    showItems(items);
    status.textContent = preset.doneText(items.length);
  };

  bar.append(label);
  for (const preset of PRESETS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'arsenalplus-preset-btn';
    chip.textContent = preset.label;
    chip.title = preset.title;
    chip.addEventListener('click', () => activate(preset));
    chips.set(preset.key, chip);
    bar.append(chip);
  }
  bar.append(status);

  toolbox.insertAdjacentElement('afterend', bar);
})();
