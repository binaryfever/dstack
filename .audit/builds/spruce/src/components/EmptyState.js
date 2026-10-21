(function () {
  function EmptyState({ illustration, sentence, action }) {
    const root = document.createElement('div');
    root.className = 'empty-state';
    if (illustration) root.appendChild(illustration);
    const p = document.createElement('p');
    p.textContent = sentence || '';
    root.appendChild(p);
    if (action) root.appendChild(action);
    return root;
  }
  globalThis.ShopSpruce ??= {};
  globalThis.ShopSpruce.EmptyState = EmptyState;
})();
