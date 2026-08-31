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

  multiSelect({ title, className = 'arsenalplus-ms', onChange, onOpen }) {
    const btn = this.el('button', { type: 'button', className: `${className}-btn`, title: title || '' });
    const panel = this.el('div', { className: `${className}-panel`, hidden: true });
    const root = this.el('div', { className }, btn, panel);

    const close = (e) => {
      if (root.contains(e.target)) return;
      panel.hidden = true;
      document.removeEventListener('click', close);
    };

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        document.addEventListener('click', close);
        onOpen && onOpen();
      } else {
        document.removeEventListener('click', close);
      }
    });

    root.render = (summary, options) => {
      btn.textContent = summary;
      btn.classList.toggle(`${className}-btn--active`, options.some((o) => o.checked));
      panel.textContent = '';
      if (!options.length) {
        panel.append(this.el('div', { className: `${className}-empty`, textContent: '—' }));
        return;
      }
      for (const o of options) {
        const cb = this.el('input', { type: 'checkbox', value: o.value, checked: o.checked });
        cb.addEventListener('change', () =>
          onChange([...panel.querySelectorAll('input:checked')].map((i) => i.value))
        );
        panel.append(
          this.el('label', { className: `${className}-opt` }, cb, document.createTextNode(' ' + o.label))
        );
      }
    };
    return root;
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
