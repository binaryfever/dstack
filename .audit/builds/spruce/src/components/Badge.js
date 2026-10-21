(function () {
  function Badge({ count }) {
    if (!count) return null;
    const el = document.createElement('span');
    el.className = 'badge color-primary';
    el.textContent = count > 99 ? '99+' : String(count);
    return el;
  }
  globalThis.ShopSpruce ??= {};
  globalThis.ShopSpruce.Badge = Badge;
})();
