(function () {
  function Badge({ count }) {
    if (!count) return null;
    return count > 99 ? '99+' : String(count);
  }

  globalThis.ShopWillow ??= {};
  globalThis.ShopWillow.Badge = Badge;
})();
