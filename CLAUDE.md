# numberblocks-tablet

- Packaged copy of brizluca's Scratch project, not a rebuild. Do not recreate the game from scratch (declined 2026-11-12: recreation of an existing game with Numberblocks characters).
- `npm run build` writes `docs/`, which GitHub Pages serves. Commit `docs/` with every build.
- Do NOT minify SVGs (svgo): it fills in digit holes (zeros render solid). Verify any asset change by pixel-diffing screenshots at several `num` values against the previous build.
- `build/lazy-svg.js` keeps memory low by decoding costumes on first draw; it relies on scratch-render internals (`_allSkins`, `updateDrawableSkinId`), so recheck it after a packager upgrade.
- Load-time tests: TurboWarp's multi-file target fetches assets in a Web Worker, which page-level CDP throttling and request counting miss.
