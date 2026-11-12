# Numberblocks Generator, tablet build

An installable, offline-capable web app build of **Numberblocks Generator** by
[brizluca](https://scratch.mit.edu/users/brizluca/) on Scratch
([project 1291946676](https://scratch.mit.edu/projects/1291946676/)). All game content and code are
brizluca's; Numberblocks is owned by Alphablocks Ltd / BBC. Scratch projects are shared under
CC BY-SA 2.0.

## What this changes

The original crashes low-memory tablets while loading: it has 2,173 SVG costumes, and the stock
Scratch renderer decodes every one of them up front (about 2 GB of browser memory). This build
packages the project with the TurboWarp packager and adds `build/lazy-svg.js`, which decodes a
costume only when it is first drawn. Page memory drops from about 2.1 GB to about 0.8 GB, with
identical rendering.

## Use it on a tablet

Open the hosted URL in Chrome, then menu > **Add to Home screen**. It opens fullscreen in
landscape and works offline after the first load.

## Rebuild (picks up brizluca's latest version)

```bash
npm install
npm run build
npm run serve
```

Output goes to `docs/` (served by GitHub Pages).
