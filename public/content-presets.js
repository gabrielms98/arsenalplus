(() => {
  const AP = globalThis.ArsenalPlus;

  const grid = document.querySelector('.product_list');
  const toolbox = document.querySelector('nav.toolbox');
  if (!grid || !toolbox) return;

  const FETCH_DELAY = 400;
  const NOVIDADES_TARGET = 36;
  const NOVIDADES_MAX_PAGES = 72;
  const NOVIDADES_SEEN_KEY = 'novidadesSeenMaxId';

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

  const fetchText = async (url) => {
    if (fetchedOnce) await new Promise((r) => setTimeout(r, FETCH_DELAY));
    fetchedOnce = true;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };

  const fetchPage = async (url) => {
    if (pageCache.has(url)) return pageCache.get(url);
    const parsed = parsePage(await fetchText(url));
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

  const productMeta = (html, prop) => {
    const m = html.match(
      new RegExp(`<meta\\s+property="${prop}"\\s+content="([^"]*)"`)
    );
    return m ? m[1].trim() : null;
  };

  const buildCard = ({ url, name, image, price, isNew }) => {
    const makeLink = () => {
      const a = document.createElement('a');
      a.href = url;
      a.title = `${name} Arsenal Sports`;
      return a;
    };

    const wrap = document.createElement('div');
    wrap.className = 'product-wrap arsenalplus-nov-card';
    const product = document.createElement('div');
    product.className = 'product';

    const figure = document.createElement('figure');
    figure.className = 'product-media';
    const media = makeLink();
    if (image) {
      const img = document.createElement('img');
      img.src = image;
      img.alt = name;
      img.loading = 'lazy';
      media.append(img);
    }
    figure.append(media);

    const details = document.createElement('div');
    details.className = 'product-details';

    if (isNew) {
      const badge = document.createElement('span');
      badge.className = 'arsenalplus-badge arsenalplus-new-badge';
      badge.textContent = 'NOVO';
      badge.title = 'Adicionado à loja desde sua última visita (Arsenal+)';
      details.append(badge);
    }

    const title = document.createElement('h3');
    title.className = 'product-name';
    const nameLink = makeLink();
    nameLink.textContent = name;
    title.append(nameLink);
    details.append(title);

    if (price) {
      const container = document.createElement('div');
      container.className = 'product-price';
      const ins = document.createElement('ins');
      ins.className = 'new-price';
      ins.textContent = `${price.currency} ${price.amount}`;
      container.append(ins);
      details.append(container);
    }

    product.append(figure, details);
    wrap.append(product);
    return wrap;
  };

  const collectNovidades = async (onProgress) => {
    const xml = await fetchText(`${location.origin}/sitemap`);
    const products = new Map();
    for (const m of xml.matchAll(
      /<loc>\s*([^<]*\/produto\/[^<]*-(\d+)\.html)\s*<\/loc>/g
    )) {
      products.set(Number(m[2]), m[1]);
    }
    const entries = [...products.entries()].sort((a, b) => b[0] - a[0]);
    const { [NOVIDADES_SEEN_KEY]: seenMax } =
      await chrome.storage.local.get(NOVIDADES_SEEN_KEY);

    const items = [];
    const total = Math.min(entries.length, NOVIDADES_MAX_PAGES);
    for (let i = 0; i < total && items.length < NOVIDADES_TARGET; i++) {
      const [id, url] = entries[i];
      const html = await fetchText(url);
      const crumbs = html.match(/<ul class="breadcrumb">[\s\S]*?<\/ul>/);
      if (crumbs && /airsoft/i.test(crumbs[0])) {
        const name = (productMeta(html, 'og:title') || '')
          .replace(/\s*\|\s*Arsenal Sports\s*$/i, '')
          .replace(/#(34|38|39);/g, (_, n) => String.fromCharCode(n))
          .trim();
        if (name) {
          items.push({
            name,
            card: buildCard({
              url,
              name,
              image: productMeta(html, 'og:image'),
              price: AP.extractPriceFromHtml(html),
              isNew: seenMax != null && id > seenMax,
            }),
          });
        }
      }
      onProgress(i + 1, total, items.length);
    }

    if (entries.length) {
      await chrome.storage.local.set({ [NOVIDADES_SEEN_KEY]: entries[0][0] });
    }
    return items;
  };

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
      key: 'novidades',
      label: 'Novidades',
      title:
        'Produtos de airsoft adicionados mais recentemente — a loja não ' +
        'ordena por data; o Arsenal+ lê o sitemap e ordena pelo ID do ' +
        'produto (Arsenal+)',
      collect: collectNovidades,
      doneText: (n) =>
        `${n} itens de airsoft mais recentes — "NOVO" marca o que entrou ` +
        'desde sua última visita.',
    },
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
      const onProgress = (done, total, found) => {
        status.textContent =
          `Buscando ${preset.label.toLowerCase()}… página ${done} de ${total} ` +
          `— ${found} encontrados.`;
      };
      try {
        results.set(
          preset.key,
          await (preset.collect
            ? preset.collect(onProgress)
            : collect(preset, onProgress))
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
