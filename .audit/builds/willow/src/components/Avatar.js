(function () {
  function Avatar({ name, src }) {
    return { name, src };
  }

  globalThis.ShopWillow ??= {};
  globalThis.ShopWillow.Avatar = Avatar;
})();
