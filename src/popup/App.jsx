import { useEffect, useState } from 'react';

const SOURCE_LABELS = {
  site: 'Preço exibido pela loja',
  extension: 'Preço oculto — recuperado pelo Arsenal+',
  hidden: 'Preço oculto na página (ative o Arsenal+ para exibir)',
};

export default function App() {
  const [enabled, setEnabled] = useState(null);
  // undefined = loading, null = no product info, object = product page
  const [product, setProduct] = useState(undefined);
  const [onSite, setOnSite] = useState(true);

  useEffect(() => {
    chrome.storage.sync
      .get({ showHiddenPrices: true })
      .then(({ showHiddenPrices }) => setEnabled(showHiddenPrices));

    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        // Throws if the content script isn't there (i.e. not on arsenalsports.com).
        const info = await chrome.tabs.sendMessage(tab.id, { type: 'getProductInfo' });
        setProduct(info ?? null);
      } catch {
        setOnSite(false);
        setProduct(null);
      }
    })();
  }, []);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    chrome.storage.sync.set({ showHiddenPrices: next });
    // The product card's status line depends on the toggle; refresh it.
    setTimeout(refreshProduct, 100);
  };

  const refreshProduct = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const info = await chrome.tabs.sendMessage(tab.id, { type: 'getProductInfo' });
      setProduct(info ?? null);
    } catch {
      /* not on the site; keep current state */
    }
  };

  return (
    <div className="popup">
      <header className="header">
        <img src="icons/icon48.png" alt="" width="24" height="24" />
        <h1>Arsenal+</h1>
      </header>

      <label className="setting">
        <span>Mostrar preços ocultos</span>
        <button
          type="button"
          role="switch"
          aria-checked={!!enabled}
          className={`switch ${enabled ? 'on' : ''}`}
          disabled={enabled === null}
          onClick={toggle}
        >
          <span className="knob" />
        </button>
      </label>

      <section className="card">
        {product === undefined && <p className="muted">Carregando…</p>}

        {product === null && (
          <p className="muted">
            {onSite
              ? 'Nenhum produto nesta página.'
              : 'Abra uma página de produto em arsenalsports.com para ver os detalhes aqui.'}
          </p>
        )}

        {product && (
          <>
            <p className="product-name" title={product.name}>
              {product.name}
            </p>
            <p className="price">
              {product.currency} {product.amount}
            </p>
            <p className={`source source-${product.priceSource}`}>
              {SOURCE_LABELS[product.priceSource]}
            </p>
            <p className="meta">
              {product.brand && <span>{product.brand}</span>}
              {product.sku && <span>SKU {product.sku}</span>}
              {product.validUntil && <span>válido até {product.validUntil}</span>}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
