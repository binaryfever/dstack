(function () {
  function AsyncList({ empty, loading, failed, populated, status, mount }) {
    const host = mount || document.createElement('div');
    host.replaceChildren();
    let child = populated;
    if (status === 'loading') child = loading;
    else if (status === 'empty') child = empty;
    else if (status === 'failed') child = failed;
    if (child) host.appendChild(child);
    return host;
  }
  globalThis.ShopSpruce ??= {};
  globalThis.ShopSpruce.AsyncList = AsyncList;
})();
