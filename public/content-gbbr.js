// Arsenal+ — GBBR merged search. The store's search is a plain AND of name
// substrings and its propulsion filter has zero tagged products, so no single
// query can list every gas blowback long gun ("GBBR ..." vs "GBB ... RIFLE" vs
// "GBB ... SMG"). When a search mentions GBB, this offers to run the handful
// of queries that together cover the catalog, merge and de-duplicate the
// results, drop parts/magazines/pistols by name, and render everything as one
// page reusing the site's own card markup — so the price fill and the filters
// from content-listing.js keep working on it.
(() => {
  const AP = globalThis.ArsenalPlus;

  // Together these cover every naming style seen in the catalog. The four
  // extra queries are one page each; "gbbr" and "gbb rifle" carry the bulk.
  const QUERIES = [
    'gbbr',
    'gbb rifle',
    'gbb smg',
    'gbb shotgun',
    'gbb carbine',
    'gbb sniper',
  ];
  const FETCH_DELAY = 400; // ms between page fetches — be polite to the shop

  const query = new URLSearchParams(location.search).get('q') || '';
  if (location.pathname !== '/produtos/filter' || !/gbb/i.test(query)) return;

  const grid = document.querySelector('.product_list');
  const toolbox = document.querySelector('nav.toolbox');
  if (!grid || !toolbox) return;

  // ---- Fetch & parse -----------------------------------------------------

  const searchUrl = (q, page) =>
    `${location.origin}/produtos/filter?q=${encodeURIComponent(q)}` +
    (page > 1 ? `&pagina=${page}` : '');

  // DOMParser documents don't resolve relative URLs, so pagination links are
  // read from the raw href attribute.
  const parsePage = (html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const cards = [...doc.querySelectorAll('.product_list .product-wrap')];
    const pages = [...doc.querySelectorAll('.toolbox-pagination a')].map(
      (a) => Number(((a.getAttribute('href') || '').match(/pagina=(\d+)/) || [])[1]) || 1
    );
    return { cards, lastPage: Math.max(1, ...pages) };
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

  // Fetches every page of every query, keeping one card per product id and
  // only long guns. onProgress(pagesDone, pagesTotal, kept) after each page.
  const collectLongGuns = async (onProgress) => {
    const kept = new Map(); // id -> { name, card }
    let pagesDone = 0;
    let pagesTotal = QUERIES.length; // grows as pagination is discovered

    const take = (cards) => {
      for (const card of cards) {
        const id = AP.productIdFromUrl(cardLink(card));
        if (!id || kept.has(id)) continue;
        const name = cardName(card);
        if (AP.isLongGunName(name)) kept.set(id, { name, card });
      }
    };

    for (const q of QUERIES) {
      let lastPage = 1;
      for (let page = 1; page <= lastPage; page++) {
        if (pagesDone > 0) await new Promise((r) => setTimeout(r, FETCH_DELAY));
        const res = await fetch(searchUrl(q, page));
        if (!res.ok) continue;
        const parsed = parsePage(await res.text());
        if (page === 1) {
          lastPage = parsed.lastPage;
          pagesTotal += lastPage - 1;
        }
        take(parsed.cards);
        pagesDone++;
        onProgress(pagesDone, pagesTotal, kept.size);
      }
    }

    return [...kept.values()].sort((a, b) => a.name.localeCompare(b.name));
  };

  // ---- Render / restore --------------------------------------------------

  const pagination = () => document.querySelector('.toolbox-pagination');

  let originalCards = null; // DocumentFragment holding the native results
  let mergedCards = null; // cached across show/restore, fetched once

  const showMerged = (items) => {
    if (!originalCards) {
      originalCards = document.createDocumentFragment();
      while (grid.firstChild) originalCards.append(grid.firstChild);
    }
    for (const { card } of items) grid.append(document.importNode(card, true));
    // Inline style, not [hidden]: the site's own display rules on .toolbox
    // would win over the hidden attribute. Its links would paginate the raw
    // query, so it goes away while the merged view is up.
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

  // ---- Banner ------------------------------------------------------------

  const banner = document.createElement('div');
  banner.className = 'arsenalplus-gbbr';

  const status = document.createElement('span');
  status.className = 'arsenalplus-gbbr-status';
  status.textContent =
    'Arsenal+: a busca da loja não acha todos os rifles GBB de uma vez ' +
    '(uns se chamam "GBBR", outros só "GBB").';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'arsenalplus-gbbr-btn';
  btn.textContent = 'Buscar todos os rifles GBB';

  let running = false;
  let merged = false;

  const setMergedView = () => {
    merged = true;
    showMerged(mergedCards);
    status.textContent =
      `${mergedCards.length} rifles GBB — resultado combinado de ` +
      `${QUERIES.length} buscas, sem peças nem pistolas.`;
    btn.textContent = 'Voltar à busca normal';
  };

  btn.addEventListener('click', async () => {
    if (running) return;

    if (merged) {
      merged = false;
      restore();
      status.textContent = 'Arsenal+: resultados normais da loja.';
      btn.textContent = 'Buscar todos os rifles GBB';
      return;
    }

    if (mergedCards) {
      setMergedView();
      return;
    }

    running = true;
    btn.disabled = true;
    try {
      mergedCards = await collectLongGuns((done, total, found) => {
        status.textContent = `Buscando… página ${done} de ${total} — ${found} rifles encontrados.`;
      });
      setMergedView();
    } catch {
      status.textContent = 'Falha ao buscar — verifique a conexão e tente de novo.';
    } finally {
      running = false;
      btn.disabled = false;
    }
  });

  banner.append(status, btn);
  toolbox.insertAdjacentElement('afterend', banner);
})();
