(function () {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  const SOURCES = [
    { id: 'inbox', label: 'Inbox' },
    { id: 'empty', label: 'Empty' },
    { id: 'failed', label: 'Failed' },
    { id: 'loading', label: 'Loading' },
  ];

  function fetchNotifications(scenario, options = {}) {
    const delayMs = options.delayMs ?? 700;
    const now = options.now ?? Date.now();
    const signal = options.signal;

    return new Promise((resolve, reject) => {
      const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      if (signal?.aborted) {
        abort();
        return;
      }

      let timer = null;
      const finish = (fn) => {
        signal?.removeEventListener('abort', onAbort);
        fn();
      };
      const onAbort = () => {
        if (timer != null) clearTimeout(timer);
        finish(abort);
      };
      signal?.addEventListener('abort', onAbort);

      if (scenario === 'loading') return;

      timer = setTimeout(() => {
        if (scenario === 'failed') {
          finish(() => reject(new Error('offline')));
          return;
        }
        if (scenario === 'empty') {
          finish(() => resolve([]));
          return;
        }
        if (scenario === 'inbox') {
          finish(() => resolve(inboxPayload(now)));
          return;
        }
        finish(() => reject(new Error('unknown notification source')));
      }, delayMs);
    });
  }

  function inboxPayload(now) {
    return [
      {
        id: 'ship-1842',
        actor: { name: 'Willow Studio', src: monogram('W', '#d7e6fb') },
        summary: 'Your willow basket shipped',
        detail: 'Order 1842 left the studio and is on the way.',
        createdAt: new Date(now - 3 * HOUR).toISOString(),
        read: false,
      },
      {
        id: 'yarn-fog',
        actor: { name: 'Northwind Yarn', src: monogram('N', '#f3d7c4') },
        summary: 'A skein you saved is back',
        detail: 'Fog linen is in stock again.',
        createdAt: new Date(now - 5 * HOUR).toISOString(),
        read: false,
      },
      {
        id: 'pourer-drop',
        actor: { name: 'Kiln Counter', src: null },
        summary: 'Price drop on the ceramic pourer',
        detail: 'It is 18% less than when you last viewed it.',
        createdAt: new Date(now - 26 * HOUR).toISOString(),
        read: false,
      },
      {
        id: 'apron-review',
        actor: { name: 'Apron Desk', src: monogram('A', '#e3efd4') },
        summary: 'How was the linen apron?',
        detail: 'A short review helps the next shopper.',
        createdAt: new Date(now - 4 * DAY).toISOString(),
        read: true,
      },
      {
        id: 'october-hours',
        actor: { name: 'Shop Willow', src: null },
        summary: 'October studio hours',
        detail: 'The studio is open Thursday through Saturday.',
        createdAt: new Date(now - 20 * DAY).toISOString(),
        read: true,
      },
    ];
  }

  function monogram(letter, color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${color}"/><text x="32" y="42" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="#1c1915">${letter}</text></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  globalThis.ShopWillow ??= {};
  globalThis.ShopWillow.SOURCES = SOURCES;
  globalThis.ShopWillow.fetchNotifications = fetchNotifications;
})();
