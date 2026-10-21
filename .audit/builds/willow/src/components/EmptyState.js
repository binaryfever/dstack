(function () {
  function EmptyState({ illustration, sentence, action }) {
    return { illustration, sentence, action };
  }

  globalThis.ShopWillow ??= {};
  globalThis.ShopWillow.EmptyState = EmptyState;
})();
