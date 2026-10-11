// Regenerates the packaging artwork in build/ from the Folio icon artwork (app/icons/icon.svg):
//   build/icon.png            1024×1024 app icon (Linux / fallback)
//   build/icon.icns           macOS app icon (Big Sur–style tile; ic10…icp4 PNG chunks)
//   build/folio.icns          macOS document icon for .folio files
//   build/folio.ico           Windows document icon for .folio files (BMP entries ≤128 px, PNG at 256 px)
//   build/background.png      DMG window background (540×380) and background@2x.png (1080×760)
// Usage: node build/tools/make-assets.mjs   (needs Playwright's Chromium; not part of the normal build)
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { icnsFile, icoFile } from './icon-formats.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = (f) => path.join(root, 'build', f);

/** Loads Playwright from the project or from a global install. */
async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  const require = createRequire(import.meta.url);
  for (const dir of [process.env.PLAYWRIGHT_DIR, '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) {
    try { return require(dir); } catch {}
  }
  throw new Error('Playwright is required: npm i -g playwright && npx playwright install chromium');
}

// ---- Artwork -------------------------------------------------------------------------------

const iconSvg = await readFile(path.join(root, 'app/icons/icon.svg'), 'utf8');
/** The page glyph (everything inside the outer <g>) of the Folio icon, in its 512 box. */
const glyph = iconSvg.slice(iconSvg.indexOf('<g'), iconSvg.lastIndexOf('</g>') + 4);
const gradient = `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a5a55"/><stop offset="1" stop-color="#132e2b"/></linearGradient>`;

/** macOS app tile: 824 px rounded square centred on a 1024 canvas with a soft shadow. */
const macIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>${gradient}
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity=".32"/></filter>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#bg)" filter="url(#drop)"/>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#sheen)"/>
  <rect x="101.5" y="101.5" width="821" height="821" rx="183.5" fill="none" stroke="#fff" stroke-opacity=".10" stroke-width="3"/>
  <g transform="translate(100 100) scale(1.609375)">${glyph}</g>
</svg>`;

/** Document icon: a sheet with a folded corner carrying the Folio tile (and the word FOLIO when large). */
function docIcon({ label }) {
  const tile = label ? { s: 330, y: 300 } : { s: 470, y: 300 };
  const tx = 512 - tile.s / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>${gradient}
    <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf8"/><stop offset="1" stop-color="#f3ecdc"/></linearGradient>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity=".28"/></filter>
  </defs>
  <path d="M220 64h436l172 172v680a44 44 0 0 1-44 44H220a44 44 0 0 1-44-44V108a44 44 0 0 1 44-44z" fill="url(#paper)" stroke="#000" stroke-opacity=".16" stroke-width="6" filter="url(#drop)"/>
  <path d="M656 64v128a44 44 0 0 0 44 44h128z" fill="#e2d4b2" stroke="#000" stroke-opacity=".12" stroke-width="4" stroke-linejoin="round"/>
  <g transform="translate(${tx} ${tile.y})">
    <rect width="${tile.s}" height="${tile.s}" rx="${tile.s * 0.22}" fill="url(#bg)"/>
    <g transform="scale(${tile.s / 512})">${glyph}</g>
  </g>
  ${label ? `<text x="512" y="808" text-anchor="middle" font-family="Folio Serif" font-size="118" letter-spacing="22" fill="#1d4f4a">FOLIO</text>
  <rect x="452" y="842" width="120" height="8" rx="4" fill="#b08d57"/>` : ''}
</svg>`;
}

/** DMG background; icon slots are at (130, 200) and (410, 200) in window points. */
const dmgBackground = `<div class="bg">
  <div class="title">Folio <em>Publisher</em></div>
  <div class="rule"></div>
  <svg class="arrow" viewBox="0 0 140 40"><path d="M6 20h112" stroke="#b08d57" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 9"/><path d="M114 9l18 11-18 11" fill="none" stroke="#b08d57" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
  <div class="hint">Drag Folio Publisher onto Applications to install</div>
  <div class="foot">If macOS blocks the first launch: <b>System Settings › Privacy &amp; Security › Open Anyway</b></div>
</div>`;
const dmgCss = `
  html, body { margin: 0; }
  .bg { position: relative; width: 540px; height: 380px; overflow: hidden; font-family: 'Folio Serif', serif; color: #1d3b39;
    background: radial-gradient(circle at 50% 0%, #fffdf7 0%, #f4f0e8 55%, #ebe3d2 100%); }
  .bg::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 6px; background: linear-gradient(90deg, #1d4f4a, #2a5a55 60%, #b08d57); }
  .title { position: absolute; top: 38px; width: 100%; text-align: center; font-size: 34px; letter-spacing: .5px; }
  .title em { color: #8a6a3a; font-style: italic; font-family: 'Folio Serif Italic', serif; }
  .rule { position: absolute; top: 92px; left: 250px; width: 40px; height: 2px; background: #b08d57; border-radius: 1px; }
  .arrow { position: absolute; left: 200px; top: 180px; width: 140px; height: 40px; }
  .hint { position: absolute; top: 112px; width: 100%; text-align: center; font-size: 15px; font-style: italic; font-family: 'Folio Serif Italic', serif; color: #4b5d5a; }
  .foot { position: absolute; bottom: 20px; left: 16px; right: 16px; white-space: nowrap; text-align: center; font-size: 11.5px; line-height: 1.45; color: #5d6b68; font-family: system-ui, sans-serif; }
  .foot b { font-weight: 600; color: #1d3b39; }`;

// ---- Rendering -----------------------------------------------------------------------------

const fontFace = async (family, file) => {
  const data = (await readFile(path.join(root, 'app/fonts', file))).toString('base64');
  return `@font-face { font-family: '${family}'; src: url(data:font/woff2;base64,${data}) format('woff2'); }`;
};
const fonts = (await fontFace('Folio Serif', 'PlayfairDisplay-normal-400-latin.woff2'))
  + (await fontFace('Folio Serif Italic', 'PlayfairDisplay-italic-400-latin.woff2'));

const pw = await loadPlaywright();
const browser = await pw.chromium.launch();
const page = await browser.newPage();
const hiDpiPage = await browser.newPage({ deviceScaleFactor: 2 });

/** Renders HTML at w×h CSS px to a transparent PNG buffer (`scale` 2 doubles the pixel size). */
async function renderHtml(body, w, h, { css = '', scale = 1 } = {}) {
  const p = scale === 2 ? hiDpiPage : page;
  await p.setViewportSize({ width: w, height: h });
  await p.setContent(`<!doctype html><html><head><style>${fonts} html,body{margin:0;background:transparent;overflow:hidden}
    ${css}</style></head><body style="width:${w}px;height:${h}px">${body}</body></html>`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(50);
  return p.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
}
/** Renders an SVG square at `size` px. */
const renderSvg = (svg, size) => renderHtml(svg.replace('<svg ', `<svg width="${size}" height="${size}" `), size, size, { css: 'svg{display:block}' });

/** Decodes a PNG to raw RGBA pixels using the browser. */
async function rgba(png) {
  const arr = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    return Array.from(g.getImageData(0, 0, c.width, c.height).data);
  }, png.toString('base64'));
  return Uint8Array.from(arr);
}

// App icon (Linux / generic): the full-bleed rounded tile at 1024 px.
await writeFile(out('icon.png'), await renderSvg(iconSvg, 1024));

// macOS app icon.
const ICNS_TYPES = [['icp4', 16], ['icp5', 32], ['ic11', 32], ['icp6', 64], ['ic12', 64], ['ic07', 128], ['ic08', 256], ['ic13', 256], ['ic09', 512], ['ic14', 512], ['ic10', 1024]];
async function icns(svgFor) {
  const cache = new Map();
  const chunks = [];
  for (const [type, size] of ICNS_TYPES) {
    if (!cache.has(size)) cache.set(size, await renderSvg(svgFor(size), size));
    chunks.push({ type, data: cache.get(size) });
  }
  return icnsFile(chunks);
}
await writeFile(out('icon.icns'), await icns(() => macIcon));

// Document icons.
const docFor = (size) => docIcon({ label: size >= 64 });
await writeFile(out('folio.icns'), await icns(docFor));
const icoEntries = [];
for (const size of [16, 24, 32, 48, 64, 128, 256]) {
  const png = await renderSvg(docFor(size), size);
  icoEntries.push(size >= 256 ? { size, png } : { size, rgba: await rgba(png) });
}
await writeFile(out('folio.ico'), icoFile(icoEntries));

// DMG background (1x and 2x; electron-builder merges them into a HiDPI TIFF on macOS).
await writeFile(out('background.png'), await renderHtml(dmgBackground, 540, 380, { css: dmgCss }));
await writeFile(out('background@2x.png'), await renderHtml(dmgBackground, 540, 380, { css: dmgCss, scale: 2 }));

await browser.close();
console.log('Wrote build/icon.png, icon.icns, folio.icns, folio.ico, background.png, background@2x.png');
