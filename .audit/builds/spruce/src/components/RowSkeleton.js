(function () {
  function RowSkeleton() {
    const row = document.createElement('div');
    row.className = 'row-skeleton';
    row.setAttribute('aria-hidden', 'true');
    return row;
  }
  globalThis.ShopSpruce ??= {};
  globalThis.ShopSpruce.RowSkeleton = RowSkeleton;
})();
