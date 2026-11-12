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

  SVGSkinProto.getTexture = function (scale) {
    if (this._lazyReady === false && (this._lazyBlob || this._lazyFallbackSrc)) {
      const img = document.createElement('img');
      img.onload = () => {
        if (this._lazyUrl) { URL.revokeObjectURL(this._lazyUrl); this._lazyUrl = null; }
        this._canvas = document.createElement('canvas');
        this._context = this._canvas.getContext('2d');
        this._svgImage = img;
        this._lazyReady = true;
        this.resetMIPs();
        this.emitWasAltered();
      };
      if (this._lazyBlob) {
        this._lazyUrl = URL.createObjectURL(this._lazyBlob);
        img.src = this._lazyUrl;
      } else {
        img.src = this._lazyFallbackSrc;
      }
      this._lazyBlob = null;
      this._lazyFallbackSrc = null;
    }
    if (this._lazyReady === false) return BaseProto.getTexture.call(this, scale);
    return origGetTexture.call(this, scale);
  };

  SVGSkinProto.dispose = function () {
    if (this._lazyUrl) URL.revokeObjectURL(this._lazyUrl);
    this._lazyBlob = null;
    return origDispose.call(this);
  };
})();
