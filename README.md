# Arsenal+

Extensão de Chrome com melhorias para [arsenalsports.com](https://www.arsenalsports.com/).

## Funcionalidades

- **Preço oculto**: quando um produto está indisponível, a loja esconde o preço e mostra
  só o formulário "Avise-me quando chegar" — mas o preço continua presente nos metadados
  da página (`<meta property="product:price:amount">`). A extensão lê esses metadados e
  exibe o preço no lugar onde ele apareceria normalmente, com um selo **Arsenal+**
  indicando que foi a extensão que o recuperou.
- **Popup (React)**: clicando no ícone da extensão abre um painel com um toggle para
  ligar/desligar a exibição de preços ocultos (aplicado na hora, sem recarregar a página)
  e um cartão com o produto da aba atual: nome, preço, marca, SKU e de onde o preço veio
  (loja, recuperado pela extensão, ou oculto).

## Desenvolvimento

```bash
npm install
npm run build     # gera dist/
npm run dev       # build em modo watch
```

## Instalação (modo desenvolvedor)

1. Rode `npm run build`.
2. Abra `chrome://extensions` no Chrome.
3. Ative o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** ("Load unpacked") e selecione a pasta **`dist/`**.
5. Visite qualquer página de produto em arsenalsports.com.

Depois de alterar arquivos, rode o build de novo (ou deixe `npm run dev` rodando) e
clique em ↻ na extensão em `chrome://extensions`.

## Estrutura

```
├── public/            # copiado como está para dist/
│   ├── manifest.json
│   ├── content.js     # roda nas páginas do site (injeta o preço)
│   ├── styles.css     # estilo do selo Arsenal+ na página
│   └── icons/
├── popup.html         # entrada do popup (Vite)
├── src/popup/         # UI do popup em React
│   ├── main.jsx
│   ├── App.jsx
│   └── popup.css
└── vite.config.js
```

## Como funciona

- `content.js` roda em todas as páginas do site. Em páginas de produto, ele lê
  `product:price:amount` e `product:price:currency` do `<head>`.
- Se a página já mostra o preço (produto em estoque), a extensão não faz nada.
- Se não, injeta um bloco `<div class="product-price"><ins class="new-price">` —
  as mesmas classes que o site usa — logo após o logo da marca, então o visual
  fica idêntico ao preço nativo.
- O popup conversa com o `content.js` via `chrome.tabs.sendMessage` para mostrar os
  dados do produto, e o toggle é persistido em `chrome.storage.sync`; o `content.js`
  escuta `chrome.storage.onChanged` e adiciona/remove o preço imediatamente.
