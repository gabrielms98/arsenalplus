// Arsenal+ — product pages: shows the hidden price of out-of-stock items and
// adds the watchlist button. The price is always present in the <head> as Open
// Graph product meta tags, even when the storefront replaces the price block
// with the "Avise-me" form.
(() => {
  const AP = globalThis.ArsenalPlus;
  const getMeta = (prop) => AP.getMeta(document, prop);

  const getAmount = () => {
    const amount = getMeta('product:price:amount');
    return AP.isZeroAmount(amount) ? null : amount;
  };

  const getCurrency = () =>
    getMeta('product:price:currency') || getMeta('product:priceCurrency') || 'USD';

  // The main product column is the .product-details that contains .product-meta
  // (SKU/BRAND line). Related-product cards have .product-details too, but no
  // .product-meta, so this only ever matches the main product.
  const findDetails = () => {
    const productMeta = document.querySelector('.product-details .product-meta');
    return productMeta ? productMeta.closest('.product-details') : null;
  };

  // In-stock pages render <div class="product-price"><ins class="new-price">…
  // themselves; :not(.arsenalplus-price) keeps our own block out of the check.
  const hasNativePrice = (details) =>
    !!details.querySelector('.product-price:not(.arsenalplus-price) .new-price');

  const productUrl = () => getMeta('product:url') || location.href;
  const productId = () => AP.productIdFromUrl(productUrl());

  const injectPrice = () => {
    const amount = getAmount();
    if (!amount) return;

    const details = findDetails();
    if (!details) return;
    if (hasNativePrice(details)) return;
    if (details.querySelector('.arsenalplus-price')) return;

    const container = document.createElement('div');
    container.className = 'product-price arsenalplus-price';

    const price = document.createElement('ins');
    price.className = 'new-price';
    price.textContent = `${getCurrency()} ${amount}`;

    const badge = document.createElement('span');
    badge.className = 'arsenalplus-badge';
    badge.textContent = 'Arsenal+';
    const validUntil = getMeta('product:priceValidUntil');
    badge.title =
      'Preço extraído dos metadados da página' +
      (validUntil ? ` (válido até ${validUntil})` : '');

    container.append(price, badge);

    // Drop it right where the native price block would be: after the first
    // .product-price (the one holding the brand logo).
    const brandBlock = details.querySelector('.product-price');
    const productMeta = details.querySelector('.product-meta');
    (brandBlock || productMeta).insertAdjacentElement('afterend', container);
  };

  const removePrice = () => {
    document.querySelectorAll('.arsenalplus-price').forEach((el) => el.remove());
  };

  // ---- Watchlist button -------------------------------------------------

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
        available: details ? hasNativePrice(details) : false,
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

  // ---- Popup messaging ---------------------------------------------------

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
    };
  };

  // ---- Wiring ------------------------------------------------------------

  chrome.storage.sync
    .get({ showHiddenPrices: true })
    .then(({ showHiddenPrices }) => {
      if (showHiddenPrices) injectPrice();
      return setupWatchButton();
    });

  chrome.storage.onChanged.addListener((changes, area) => {
    // React immediately when the toggle changes in the popup.
    if (area === 'sync' && changes.showHiddenPrices) {
      if (changes.showHiddenPrices.newValue) injectPrice();
      else removePrice();
    }
    // Keep the watch button in sync when the popup edits the watchlist.
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
