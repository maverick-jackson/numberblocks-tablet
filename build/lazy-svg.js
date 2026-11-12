// Lazy SVG costumes: the stock renderer decodes every SVG costume into an <img>
// and gives each one its own 2D canvas at project load (2000+ here). That runs
// low-RAM tablets out of memory. This defers both until a costume is first drawn
// or hit-tested, and parks the SVG text in a Blob (outside the JS heap) meanwhile.
(function () {
  const r = vm.renderer;
  const probe = r.createSVGSkin('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2" viewBox="0 0 2 2"></svg>');
  const SVGSkinProto = Object.getPrototypeOf(r._allSkins[probe]);
  const BaseProto = Object.getPrototypeOf(SVGSkinProto);
  r.destroySkin(probe);

  const origSetSVG = SVGSkinProto.setSVG;
  const origGetTexture = SVGSkinProto.getTexture;
  const origDispose = SVGSkinProto.dispose;
  const PREFIX = 'data:image/svg+xml;utf8,';

  SVGSkinProto.setSVG = function (svg, rotationCenter) {
    let capturedSrc = null;
    const placeholder = { onload: null, naturalWidth: 0, naturalHeight: 0 };
    Object.defineProperty(placeholder, 'src', { set(v) { capturedSrc = v; }, get() { return capturedSrc; } });
    this._svgImage = placeholder;
    origSetSVG.call(this, svg, rotationCenter);
    // The original onload only needs the viewBox size, which is already known.
    if (placeholder.onload) placeholder.onload();
    if (this._lazyUrl) URL.revokeObjectURL(this._lazyUrl);
    this._lazyUrl = null;
    this._lazyBlob = capturedSrc && capturedSrc.startsWith(PREFIX)
      ? new Blob([decodeURIComponent(capturedSrc.slice(PREFIX.length))], { type: 'image/svg+xml' })
      : null;
    this._lazyFallbackSrc = this._lazyBlob ? null : capturedSrc;
    // Drop the onload closure: it pins the parsed SVG document and serialized text.
    placeholder.onload = null;
    capturedSrc = null;
    this._svgImage = { naturalWidth: 0, naturalHeight: 0 };
    this._lazyReady = false;
    this._canvas = null;
    this._context = null;
  };

  // Start decoding the SVG; calls back once the costume can be drawn.
  SVGSkinProto._lazyLoad = function () {
    if (this._lazyReady !== false || !(this._lazyBlob || this._lazyFallbackSrc)) return;
    const img = document.createElement('img');
    img.onload = () => {
      if (this._lazyUrl) { URL.revokeObjectURL(this._lazyUrl); this._lazyUrl = null; }
      this._canvas = document.createElement('canvas');
      this._context = this._canvas.getContext('2d');
      this._svgImage = img;
      this._lazyReady = true;
      this.resetMIPs();
      this.emitWasAltered();
      const waiters = this._lazyWaiters;
      this._lazyWaiters = null;
      if (waiters) for (const fn of waiters) fn();
    };
    if (this._lazyBlob) {
      this._lazyUrl = URL.createObjectURL(this._lazyBlob);
      img.src = this._lazyUrl;
    } else {
      img.src = this._lazyFallbackSrc;
    }
    this._lazyBlob = null;
    this._lazyFallbackSrc = null;
  };

  SVGSkinProto.getTexture = function (scale) {
    this._lazyLoad();
    if (this._lazyReady === false) return BaseProto.getTexture.call(this, scale);
    return origGetTexture.call(this, scale);
  };

  // When a sprite switches to a costume that is not decoded yet, keep showing
  // the old costume until the new one is ready, instead of a blank frame.
  const origUpdateSkin = r.updateDrawableSkinId;
  const pending = {};
  r.updateDrawableSkinId = function (drawableID, skinId) {
    const skin = this._allSkins[skinId];
    const drawable = this._allDrawables[drawableID];
    if (skin && skin._lazyReady === false && drawable && drawable.skin && drawable.skin._lazyReady !== false) {
      pending[drawableID] = skinId;
      (skin._lazyWaiters || (skin._lazyWaiters = [])).push(() => {
        if (pending[drawableID] !== skinId) return;
        delete pending[drawableID];
        if (this._allDrawables[drawableID] && this._allSkins[skinId]) origUpdateSkin.call(this, drawableID, skinId);
      });
      skin._lazyLoad();
      if (skin._lazyReady === false) return;
    }
    delete pending[drawableID];
    return origUpdateSkin.call(this, drawableID, skinId);
  };

  // Once the project is running, quietly decode each sprite's current costume
  // so sprites that get shown later (menus, digits) do not appear a frame late.
  let warmed = false;
  vm.runtime.on('PROJECT_RUN_START', () => {
    if (warmed) return;
    warmed = true;
    setTimeout(() => {
      const skins = [];
      for (const t of vm.runtime.targets) {
        if (!t.isOriginal || t.isStage) continue;
        const c = t.getCostumes()[t.currentCostume];
        const skin = c && r._allSkins[c.skinId];
        if (skin && skin._lazyReady === false) skins.push(skin);
      }
      const step = () => {
        for (const skin of skins.splice(0, 4)) skin._lazyLoad();
        if (skins.length) setTimeout(step, 50);
      };
      step();
    }, 1500);
  });

  SVGSkinProto.dispose = function () {
    if (this._lazyUrl) URL.revokeObjectURL(this._lazyUrl);
    this._lazyBlob = null;
    return origDispose.call(this);
  };
})();
