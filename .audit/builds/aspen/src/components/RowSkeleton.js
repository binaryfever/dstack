(function () {
  function RowSkeleton() {
    const row = document.createElement('div');
    row.className = 'row-skeleton';
    row.setAttribute('aria-hidden', 'true');
    return row;
  }
  globalThis.ShopAspen ??= {};
  globalThis.ShopAspen.RowSkeleton = RowSkeleton;
})();
