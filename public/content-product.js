(() => {
  const AP = globalThis.ArsenalPlus;
  const getMeta = (prop) => AP.getMeta(document, prop);

  const getAmount = () => {
    const amount = getMeta('product:price:amount');
    return AP.isZeroAmount(amount) || AP.isConsultPrice(amount) ? null : amount;
  };

  const getCurrency = () =>
    getMeta('product:price:currency') || getMeta('product:priceCurrency') || 'USD';

  const findDetails = () => {
    const productMeta = document.querySelector('.product-details .product-meta');
    return productMeta ? productMeta.closest('.product-details') : null;
  };

  const hasNativePrice = (details) =>
    !!details.querySelector('.product-price:not(.arsenalplus-price) .new-price');

  const isAvailable = (details) => {
    const el = details.querySelector(
      '.product-price:not(.arsenalplus-price) .new-price'
    );
    return !!el && !AP.isConsultPrice(el.textContent);
  };

  const productUrl = () => getMeta('product:url') || location.href;
  const productId = () => AP.productIdFromUrl(productUrl());

  const injectPrice = () => {
    const amount = getAmount();
    if (!amount) return;

    const details = findDetails();
    if (!details) return;
    if (hasNativePrice(details)) return;
    if (details.querySelector('.arsenalplus-price')) return;

    const validUntil = getMeta('product:priceValidUntil');
    const container = AP.ui.priceTag({
      amount,
      currency: getCurrency(),
      className: 'arsenalplus-price',
      badge: AP.ui.badge(
        'Arsenal+',
        'Preço extraído dos metadados da página' +
          (validUntil ? ` (válido até ${validUntil})` : '')
      ),
    });

    const brandBlock = details.querySelector('.product-price');
    const productMeta = details.querySelector('.product-meta');
    (brandBlock || productMeta).insertAdjacentElement('afterend', container);
  };

  const removePrice = () => {
    document.querySelectorAll('.arsenalplus-price').forEach((el) => el.remove());
  };

  const getWatchlist = async () => {
    const { watchlist = {} } = await chrome.storage.local.get('watchlist');
    return watchlist;
  };

  const renderWatchButton = (btn, watching) => {
    btn.textContent = watching ? '★ Acompanhando' : '☆ Acompanhar';
    btn.title = watching
      ? 'Clique para parar de acompanhar este produto'
      : 'Avisar quando este produto voltar ao estoque (Arsenal+)';
    btn.classList.toggle('watching', watching);
  };

  const toggleWatch = async (btn) => {
    const id = productId();
    if (!id) return;
    const watchlist = await getWatchlist();
    if (watchlist[id]) {
      delete watchlist[id];
    } else {
      const details = findDetails();
      watchlist[id] = {
        id,
        url: productUrl(),
        name: getMeta('product:name') || document.title,
        sku: getMeta('product:sku'),
        brand: getMeta('product:brand'),
        amount: getAmount(),
        currency: getCurrency(),
        available: details ? isAvailable(details) : false,
        addedAt: Date.now(),
        lastChecked: null,
      };
    }
    await chrome.storage.local.set({ watchlist });
    renderWatchButton(btn, !!watchlist[id]);
  };

  const setupWatchButton = async () => {
    const details = findDetails();
    if (!details || !productId()) return;
    if (details.querySelector('.arsenalplus-watch')) return;

    const wrap = document.createElement('div');
    wrap.className = 'arsenalplus-watch';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'arsenalplus-watch-btn';
    renderWatchButton(btn, !!(await getWatchlist())[productId()]);
    btn.addEventListener('click', () => toggleWatch(btn));
    wrap.append(btn);

    const anchor =
      details.querySelector('.arsenalplus-price') ||
      details.querySelector('.product-price:last-of-type') ||
      details.querySelector('.product-meta');
    anchor.insertAdjacentElement('afterend', wrap);
  };

  const getProductInfo = () => {
    const amount = getAmount();
    if (!amount) return null;

    const details = findDetails();
    const priceSource =
      details && hasNativePrice(details)
        ? 'site'
        : document.querySelector('.arsenalplus-price')
          ? 'extension'
          : 'hidden';

    return {
      id: productId(),
      url: productUrl(),
      name: getMeta('product:name') || document.title,
      sku: getMeta('product:sku'),
      brand: getMeta('product:brand'),
      amount,
      currency: getCurrency(),
      validUntil: getMeta('product:priceValidUntil'),
      priceSource,
      available: details ? isAvailable(details) : false,
    };
  };

  chrome.storage.sync
    .get({ showHiddenPrices: true })
    .then(({ showHiddenPrices }) => {
      if (showHiddenPrices) injectPrice();
      return setupWatchButton();
    });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.showHiddenPrices) {
      if (changes.showHiddenPrices.newValue) injectPrice();
      else removePrice();
    }
    if (area === 'local' && changes.watchlist) {
      const btn = document.querySelector('.arsenalplus-watch-btn');
      const id = productId();
      if (btn && id) {
        renderWatchButton(btn, !!(changes.watchlist.newValue || {})[id]);
      }
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'getProductInfo') {
      sendResponse(getProductInfo());
    }
  });
})();
