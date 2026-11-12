// Builds a tablet-friendly, installable (PWA) copy of brizluca's Scratch project
// "Numberblocks Generator" into ../docs. Usage: npm run build
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import Packager from '@turbowarp/packager';
import { execFileSync } from 'node:child_process';

const PROJECT_ID = '1291946676';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const cacheDir = path.join(root, 'build', '.cache');
const outDir = path.join(root, 'docs');
fs.mkdirSync(path.join(cacheDir, 'assets'), { recursive: true });

// 1. Fetch project.json and assets (assets are content-addressed, so cache them).
const meta = await (await fetch(`https://api.scratch.mit.edu/projects/${PROJECT_ID}`)).json();
const projectJson = await (await fetch(`https://projects.scratch.mit.edu/${PROJECT_ID}?token=${meta.project_token}`)).text();
const json = JSON.parse(projectJson);
const ids = new Set();
for (const t of json.targets) for (const a of [...t.costumes, ...t.sounds]) ids.add(a.md5ext);
const missing = [...ids].filter(id => !fs.existsSync(path.join(cacheDir, 'assets', id)));
console.log(`"${meta.title}" by ${meta.author.username}: ${ids.size} assets, ${missing.length} to download`);
for (let i = 0; i < missing.length; i += 32) {
  await Promise.all(missing.slice(i, i + 32).map(async id => {
    const res = await fetch(`https://assets.scratch.mit.edu/internalapi/asset/${id}/get/`);
    if (!res.ok) throw new Error(`asset ${id}: HTTP ${res.status}`);
    fs.writeFileSync(path.join(cacheDir, 'assets', id), Buffer.from(await res.arrayBuffer()));
  }));
}

// 2. Shrink assets for a faster first load: convert WAV to MP3 (SVGs stay
// untouched: minifying them changed how some digits render).
// Outputs are cached by asset id, so rebuilds only redo new assets.
const optDir = path.join(cacheDir, 'opt');
fs.mkdirSync(optDir, { recursive: true });
const files = new Map();
for (const t of json.targets) for (const a of [...t.costumes, ...t.sounds]) {
  const src = path.join(cacheDir, 'assets', a.md5ext);
  if (a.dataFormat === 'wav') {
    const name = a.assetId + '.mp3';
    const out = path.join(optDir, name);
    if (!fs.existsSync(out)) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-codec:a', 'libmp3lame', '-q:a', '4', out]);
    a.md5ext = name;
    a.dataFormat = 'mp3';
    files.set(name, out);
  } else {
    files.set(a.md5ext, src);
  }
}

// 3. Assemble the .sb3.
const sb3zip = new JSZip();
sb3zip.file('project.json', JSON.stringify(json));
for (const [name, file] of files) sb3zip.file(name, fs.readFileSync(file));
const sb3 = await sb3zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });

// 4. Package with TurboWarp, with the lazy SVG patch that keeps memory low.
const p = new Packager.Packager();
p.project = await Packager.loadProject(sb3);
p.options.target = 'zip-one-asset';
p.options.autoplay = true;
p.options.interpolation = true;
p.options.controls.fullscreen.enabled = true;
p.options.app.windowTitle = 'Numberblocks Generator';
p.options.loadingScreen.text = 'Numberblocks Generator by brizluca';
p.options.custom.js = fs.readFileSync(path.join(root, 'build', 'lazy-svg.js'), 'utf8');
const pkg = await p.package();

// 5. Unpack into docs/ and add the PWA bits.
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const out = await JSZip.loadAsync(pkg.data);
for (const [name, entry] of Object.entries(out.files)) {
  const dest = path.join(outDir, name);
  if (entry.dir) { fs.mkdirSync(dest, { recursive: true }); continue; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, await entry.async('nodebuffer'));
}
for (const f of fs.readdirSync(path.join(root, 'pwa'))) {
  if (f === 'thumb.png') continue;
  fs.copyFileSync(path.join(root, 'pwa', f), path.join(outDir, f));
}
// project.zip is what the player downloads; recompress it so the transfer is small.
const projectZipPath = path.join(outDir, 'project.zip');
const projectZip = await JSZip.loadAsync(fs.readFileSync(projectZipPath));
fs.writeFileSync(projectZipPath, await projectZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }));
const swPath = path.join(outDir, 'sw.js');
fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8')
  .replace('__VERSION__', () => `${meta.history.modified}-${Date.now()}`));

const head = `
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="icon" href="icon-192.png">
<meta name="theme-color" content="#000000">
<style>
html, body { position: fixed; inset: 0; overflow: hidden; overscroll-behavior: none; touch-action: none;
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
</style>
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<script>if (navigator.audioSession) navigator.audioSession.type = 'playback';</script>
<script>
if ('serviceWorker' in navigator) addEventListener('load', () => {
  navigator.serviceWorker.register('sw.js');
  // Once the game is running, have the service worker keep project.zip for offline play.
  const poll = setInterval(() => {
    if (!(window.vm && vm.runtime.frameLoop && vm.runtime.frameLoop.running)) return;
    clearInterval(poll);
    navigator.serviceWorker.ready.then(r => r.active && r.active.postMessage('cache-project'));
  }, 1000);
});
</script>
</head>`;
const indexPath = path.join(outDir, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('</head>')) throw new Error('index.html has no </head> anchor');
html = html.replace('</head>', () => head);
fs.writeFileSync(indexPath, html);
fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
console.log('built docs/');
