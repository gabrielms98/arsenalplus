globalThis.ArsenalPlus = globalThis.ArsenalPlus || {};

globalThis.ArsenalPlus.ui = {
  el(tag, props, ...children) {
    const node = Object.assign(document.createElement(tag), props || {});
    for (const child of children) {
      if (child != null) node.append(child);
    }
    return node;
  },

  badge(text, title, extraClass) {
    return this.el('span', {
      className: 'arsenalplus-badge' + (extraClass ? ' ' + extraClass : ''),
      textContent: text,
      title: title || '',
    });
  },

  priceTag({ amount, currency, className = '', badge = null }) {
    return this.el(
      'div',
      { className: ('product-price ' + className).trim() },
      this.el('ins', { className: 'new-price', textContent: `${currency} ${amount}` }),
      badge
    );
  },

  chip({ label, title, className = 'arsenalplus-preset-btn', onClick }) {
    const btn = this.el('button', { type: 'button', className, textContent: label, title: title || '' });
    if (onClick) btn.addEventListener('click', () => onClick(btn));
    return btn;
  },

  productCard({ url, name, image, price, badge, className = '' }) {
    const link = () =>
      this.el('a', { href: url, title: `${name} Arsenal Sports` });

    const media = link();
    if (image) media.append(this.el('img', { src: image, alt: name, loading: 'lazy' }));

    const nameLink = link();
    nameLink.textContent = name;

    return this.el(
      'div',
      { className: ('product-wrap ' + className).trim() },
      this.el(
        'div',
        { className: 'product' },
        this.el('figure', { className: 'product-media' }, media),
        this.el(
          'div',
          { className: 'product-details' },
          badge,
          this.el('h3', { className: 'product-name' }, nameLink),
          price ? this.priceTag(price) : null
        )
      )
    );
  },
};
