// Arsenal+ service worker — periodically re-checks watched products and
// notifies when one comes back in stock.
importScripts('common.js');

const CHECK_ALARM = 'arsenalplus-check';
const CHECK_PERIOD_MINUTES = 60;
const FETCH_DELAY = 500; // ms between product fetches — be polite to the shop

const ensureAlarm = () => {
  chrome.alarms.create(CHECK_ALARM, {
    periodInMinutes: CHECK_PERIOD_MINUTES,
    delayInMinutes: 1,
  });
};

chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CHECK_ALARM) checkWatchlist();
});

// "Verificar agora" from the popup.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'checkWatchlist') {
    checkWatchlist().then(sendResponse);
    return true; // async response
  }
});

async function checkWatchlist() {
  const { watchlist = {} } = await chrome.storage.local.get('watchlist');
  const items = Object.values(watchlist);
  let backInStock = 0;

  for (const item of items) {
    try {
      const res = await fetch(item.url);
      if (!res.ok) continue;
      const html = await res.text();

      const available = ArsenalPlus.isAvailableHtml(html);
      const price = ArsenalPlus.extractPriceFromHtml(html);
      const wasAvailable = item.available;

      item.available = available;
      if (price) {
        item.amount = price.amount;
        item.currency = price.currency;
      }
      item.lastChecked = Date.now();

      if (available && !wasAvailable) {
        backInStock++;
        // Notification id = product URL, so onClicked can open it directly.
        chrome.notifications.create(item.url, {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Produto disponível! — Arsenal+',
          message: `${item.name}\n${item.currency} ${item.amount ?? ''}`.trim(),
          priority: 2,
        });
      }
    } catch {
      // network hiccup — keep previous state, try again next cycle
    }
    await new Promise((r) => setTimeout(r, FETCH_DELAY));
  }

  await chrome.storage.local.set({ watchlist });
  return { checked: items.length, backInStock, at: Date.now() };
}

chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith('http')) {
    chrome.tabs.create({ url: id });
    chrome.notifications.clear(id);
  }
});
