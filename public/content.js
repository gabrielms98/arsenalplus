// Arsenal+ — shows the product price when the page hides it (out-of-stock items).
// The price is always present in the <head> as Open Graph product meta tags,
// even when the storefront replaces the price block with the "Avise-me" form.
(() => {
  const getMeta = (prop) => {
    const el = document.querySelector(`meta[property="${prop}"]`);
    const content = el && el.getAttribute('content');
    return content ? content.trim() : null;
  };

  const getAmount = () => {
    const amount = getMeta('product:price:amount');
    // No amount (not a product page) or a zero price: nothing useful to show.
    if (!amount || /^0+([.,]0+)?$/.test(amount)) return null;
    return amount;
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

  // Summary of the current product for the popup UI.
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
      name: getMeta('product:name') || document.title,
      sku: getMeta('product:sku'),
      brand: getMeta('product:brand'),
      amount,
      currency: getCurrency(),
      validUntil: getMeta('product:priceValidUntil'),
      priceSource,
    };
  };

  chrome.storage.sync
    .get({ showHiddenPrices: true })
    .then(({ showHiddenPrices }) => {
      if (showHiddenPrices) injectPrice();
    });

  // React immediately when the toggle changes in the popup.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.showHiddenPrices) {
      if (changes.showHiddenPrices.newValue) injectPrice();
      else removePrice();
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'getProductInfo') {
      sendResponse(getProductInfo());
    }
  });
})();
