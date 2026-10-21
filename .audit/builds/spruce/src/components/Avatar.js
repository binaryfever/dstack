(function () {
  function Avatar({ name, src }) {
    const el = document.createElement(src ? 'img' : 'span');
    el.className = 'avatar';
    el.setAttribute('alt', name || '');
    if (src) el.src = src;
    else el.textContent = (name || '?').slice(0, 1).toUpperCase();
    return el;
  }
  globalThis.ShopSpruce ??= {};
  globalThis.ShopSpruce.Avatar = Avatar;
})();
