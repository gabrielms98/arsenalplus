import { useEffect, useState } from 'react';

const SOURCE_LABELS = {
  site: 'Preço exibido pela loja',
  extension: 'Preço oculto — recuperado pelo Arsenal+',
  hidden: 'Preço oculto na página (ative o Arsenal+ para exibir)',
};

const timeAgo = (ts) => {
  if (!ts) return 'nunca';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
};

export default function App() {
  const [enabled, setEnabled] = useState(null);
  // undefined = loading, null = no product info, object = product page
  const [product, setProduct] = useState(undefined);
  const [onSite, setOnSite] = useState(true);
  const [watchlist, setWatchlist] = useState({});
  const [checking, setChecking] = useState(false);

  const refreshProduct = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      // Throws if the content script isn't there (i.e. not on arsenalsports.com).
      const info = await chrome.tabs.sendMessage(tab.id, { type: 'getProductInfo' });
      setProduct(info ?? null);
    } catch {
      setOnSite(false);
      setProduct(null);
    }
  };

  useEffect(() => {
    chrome.storage.sync
      .get({ showHiddenPrices: true })
      .then(({ showHiddenPrices }) => setEnabled(showHiddenPrices));

    chrome.storage.local
      .get('watchlist')
      .then(({ watchlist = {} }) => setWatchlist(watchlist));

    const onStorage = (changes, area) => {
      if (area === 'local' && changes.watchlist) {
        setWatchlist(changes.watchlist.newValue || {});
      }
    };
    chrome.storage.onChanged.addListener(onStorage);

    refreshProduct();
    return () => chrome.storage.onChanged.removeListener(onStorage);
  }, []);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    chrome.storage.sync.set({ showHiddenPrices: next });
    // The product card's status line depends on the toggle; refresh it.
    setTimeout(refreshProduct, 100);
  };

  const toggleWatch = async (item) => {
    const next = { ...watchlist };
    if (next[item.id]) {
      delete next[item.id];
    } else {
      next[item.id] = {
        id: item.id,
        url: item.url,
        name: item.name,
        sku: item.sku,
        brand: item.brand,
        amount: item.amount,
        currency: item.currency,
        available: !!item.available,
        addedAt: Date.now(),
        lastChecked: null,
      };
    }
    setWatchlist(next);
    await chrome.storage.local.set({ watchlist: next });
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      await chrome.runtime.sendMessage({ type: 'checkWatchlist' });
    } finally {
      setChecking(false);
    }
  };

  const openUrl = (url) => chrome.tabs.create({ url });

  const watched = Object.values(watchlist).sort((a, b) => b.addedAt - a.addedAt);
  const lastChecked = watched.reduce(
    (acc, w) => (w.lastChecked > acc ? w.lastChecked : acc),
    0
  );

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
            <div className="product-row">
              <p className="product-name" title={product.name}>
                {product.name}
              </p>
              {product.id && (
                <button
                  type="button"
                  className={`star ${watchlist[product.id] ? 'on' : ''}`}
                  title={
                    watchlist[product.id]
                      ? 'Parar de acompanhar'
                      : 'Acompanhar (avisa quando voltar ao estoque)'
                  }
                  onClick={() => toggleWatch(product)}
                >
                  {watchlist[product.id] ? '★' : '☆'}
                </button>
              )}
            </div>
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

      <section className="watch-section">
        <div className="watch-header">
          <h2>Acompanhando ({watched.length})</h2>
          {watched.length > 0 && (
            <button
              type="button"
              className="check-now"
              disabled={checking}
              onClick={checkNow}
            >
              {checking ? 'Verificando…' : 'Verificar agora'}
            </button>
          )}
        </div>

        {watched.length === 0 && (
          <p className="muted">
            Use o botão ☆ em um produto para ser avisado quando ele voltar ao
            estoque.
          </p>
        )}

        {watched.map((item) => (
          <div key={item.id} className="watch-item">
            <span
              className={`dot ${item.available ? 'ok' : ''}`}
              title={item.available ? 'Disponível' : 'Indisponível'}
            />
            <button
              type="button"
              className="watch-name"
              title={item.name}
              onClick={() => openUrl(item.url)}
            >
              {item.name}
            </button>
            <span className="watch-price">
              {item.amount ? `${item.currency} ${item.amount}` : '—'}
            </span>
            <button
              type="button"
              className="watch-remove"
              title="Remover da lista"
              onClick={() => toggleWatch(item)}
            >
              ×
            </button>
          </div>
        ))}

        {watched.length > 0 && (
          <p className="muted small">
            Verificação automática a cada hora · última: {timeAgo(lastChecked)}
          </p>
        )}
      </section>
    </div>
  );
}
