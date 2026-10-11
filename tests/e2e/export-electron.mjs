// Folio Publisher — export engine end-to-end test in Electron (run under xvfb-run).
//   NODE_PATH=$(npm root -g) xvfb-run -a node tests/e2e/export-electron.mjs [outDir]
// Builds a minimal harness window (not the app) that loads the bundled export engine and
// desktop/ipc-export.js, then checks real PDFs (page count + MediaBox) and rasterised PNGs.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'folio-export-e2e-')));
const HARNESS = path.join(OUT, 'harness');
fs.rmSync(HARNESS, { recursive: true, force: true });
fs.mkdirSync(HARNESS, { recursive: true });

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failures++; };

// ---- bundle the engine for the harness page ----
const esbuild = require(path.join(ROOT, 'node_modules/esbuild'));
await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/engines/export/index.js')],
  bundle: true, format: 'iife', globalName: 'FolioExport', outfile: path.join(HARNESS, 'export.js'), logLevel: 'error'
});

const fontsCss = 'file://' + path.join(ROOT, 'app/fonts/fonts.css');
fs.writeFileSync(path.join(HARNESS, 'index.html'), `<!doctype html>
<html><head><meta charset="utf-8"><title>Export harness</title>
<link rel="stylesheet" href="${fontsCss}">
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #333; font-family: sans-serif; }
  #app { padding: 20px; color: #eee; }
  .pg-title { position: absolute; left: 40px; top: 40px; font: 700 64px/1 'Bodoni Moda', serif; color: #111; }
  .pg-sub { position: absolute; left: 40px; top: 140px; font: 28px/1.2 'Bodoni Moda', serif; color: #a03020; }
</style></head>
<body><div id="app">Harness app UI (must not print)</div>
<script src="export.js"></script>
<script>
  window.FONTS_CSS = ${JSON.stringify(fontsCss)};
  const COLORS = ['#fde2c8', '#c8e6fd', '#d8fdc8', '#f0c8fd', '#fdf7c8', '#c8fdf0', '#fdc8d0', '#e0e0e0'];
  // renderPage(container, pageIndex, opts) — stands in for the core renderer.
  window.renderPage = (container, i, opts = {}) => {
    container.style.width = '400px'; container.style.height = '600px';
    container.style.overflow = 'hidden';
    container.style.backgroundColor = COLORS[i % COLORS.length];
    const t = document.createElement('div'); t.className = 'pg-title'; t.textContent = 'Page ' + (i + 1);
    const s = document.createElement('div'); s.className = 'pg-sub'; s.textContent = opts.record ? 'Dear ' + opts.record.name : 'Folio';
    container.replaceChildren(t, s);
  };
  window.doc = (n) => ({ title: 'Harness', setup: { width: 400, height: 600, bleed: 12 }, pages: Array.from({ length: n }, () => ({})) });
</script></body></html>`);

fs.writeFileSync(path.join(HARNESS, 'main.js'), `'use strict';
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fsp = require('node:fs/promises');
let win = null;
async function writeAtomic(file, data) { const tmp = file + '.' + process.pid + '.tmp'; await fsp.writeFile(tmp, data); await fsp.rename(tmp, file); }
require(${JSON.stringify(path.join(ROOT, 'desktop/ipc-export.js'))})({ ipcMain, app, dialog, shell, BrowserWindow, getWindow: () => win, knownPaths: new Set(), writeAtomic });
app.whenReady().then(() => {
  win = new BrowserWindow({ width: 900, height: 700, show: true, webPreferences: {
    preload: ${JSON.stringify(path.join(ROOT, 'desktop/preload.js'))}, contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
`);

// ---- PDF helpers ----
function pdfInfo(file) {
  let text = fs.readFileSync(file).toString('latin1');
  // Inflate compressed object streams too (in case the producer uses them).
  for (const m of text.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    try { text += zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { /* not deflate */ }
  }
  const pages = (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
  const boxes = [...text.matchAll(/\/MediaBox\s*\[\s*([\d.\s-]+)\]/g)].map((m) => m[1].trim().split(/\s+/).map(Number));
  return { pages, boxes };
}

// ---- run ----
const { _electron } = require('playwright');
const userData = path.join(OUT, 'userdata');
const app = await _electron.launch({
  executablePath: require(path.join(ROOT, 'node_modules/electron')),
  args: [path.join(HARNESS, 'main.js'), '--no-sandbox', `--user-data-dir=${userData}`]
});
const errors = [];
try {
  const win = await app.firstWindow();
  win.on('pageerror', (e) => errors.push(e.message));
  win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await win.waitForLoadState('load');
  await win.waitForFunction(() => !!window.FolioExport && !!window.folioDesktop);

  const pdfPath = (n) => path.join(OUT, n);
  const outFolder = path.join(OUT, 'folder');
  fs.rmSync(outFolder, { recursive: true, force: true });
  fs.mkdirSync(outFolder, { recursive: true });
  for (const f of ['three.pdf', 'booklet.pdf', 'cards.pdf', 'image.png']) fs.rmSync(pdfPath(f), { force: true });
  await app.evaluate(({ dialog }, [out, folder]) => {
    globalThis.__next = null;
    dialog.showSaveDialog = async () => ({ canceled: !globalThis.__next, filePath: globalThis.__next ? out + '/' + globalThis.__next : undefined });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, [OUT, outFolder]);
  const nextSave = (name) => app.evaluate((_e, n) => { globalThis.__next = n; }, name);

  // 1. Three single pages, paper = page size -> PDF with exactly 3 pages of 400x600px (300x450pt).
  await nextSave('three.pdf');
  const r1 = await win.evaluate(async () => {
    const E = window.FolioExport;
    const doc = window.doc(3);
    const layout = E.layoutFor(doc, { mode: 'single', paper: 'page' });
    const info = await E.preparePrintRoot({ doc, layout, renderPage: window.renderPage });
    const sheets = document.querySelectorAll('#print-root .print-sheet').length;
    const pageStyle = document.getElementById('print-page-style').textContent;
    const res = await window.folioDesktop.invoke('export:pdf', { widthIn: info.widthIn, heightIn: info.heightIn, suggestedName: 'three.pdf' });
    E.clearPrintRoot();
    return { sheets, pageStyle, res, cleared: !document.getElementById('print-root') };
  });
  check(r1.sheets === 3, `print root has 3 sheets (${r1.sheets})`);
  check(/@page \{ size: 400px 600px; margin: 0; \}/.test(r1.pageStyle), `@page rule ${r1.pageStyle}`);
  check(r1.res && r1.res.name === 'three.pdf', `export:pdf returned ${JSON.stringify(r1.res)}`);
  check(r1.cleared, 'clearPrintRoot removed #print-root');
  if (fs.existsSync(pdfPath('three.pdf'))) {
    const info = pdfInfo(pdfPath('three.pdf'));
    check(info.pages === 3, `three.pdf has 3 pages (${info.pages})`);
    check(info.boxes.length >= 1 && info.boxes.every((b) => Math.abs(b[2] - 300) < 0.6 && Math.abs(b[3] - 450) < 0.6), `three.pdf MediaBox 300x450pt (${JSON.stringify(info.boxes)})`);
  } else check(false, 'three.pdf written');

  // 2. Booklet of 6 pages (padded to 8) on 'page' paper -> 4 sheets of 800x600px (600x450pt).
  await nextSave('booklet.pdf');
  const r2 = await win.evaluate(async () => {
    const E = window.FolioExport;
    return E.exportPDF(window.doc(6), window.renderPage, { mode: 'booklet', paper: 'page', fileName: 'booklet' }, {
      printToPDF: (o) => window.folioDesktop.invoke('export:pdf', o)
    });
  });
  check(r2 && r2.name === 'booklet.pdf', `exportPDF booklet -> ${JSON.stringify(r2)}`);
  if (fs.existsSync(pdfPath('booklet.pdf'))) {
    const info = pdfInfo(pdfPath('booklet.pdf'));
    check(info.pages === 4, `booklet.pdf has 4 sheets (${info.pages})`);
    check(info.boxes.every((b) => Math.abs(b[2] - 600) < 0.6 && Math.abs(b[3] - 450) < 0.6), `booklet MediaBox 600x450pt (${JSON.stringify(info.boxes.slice(0, 2))})`);
  } else check(false, 'booklet.pdf written');

  // 3. Repeat on Letter with crop marks + bleed: 2 pages -> 2 Letter sheets (612x792pt).
  await nextSave('cards.pdf');
  const r3 = await win.evaluate(async () => {
    const E = window.FolioExport;
    const doc = window.doc(2);
    doc.setup.width = 192; doc.setup.height = 192;
    const l = E.layoutFor(doc, { mode: 'repeat', paper: 'letter', orientation: 'portrait', cropMarks: true, margins: 24 });
    const res = await E.exportPDF(doc, window.renderPage, { mode: 'repeat', paper: 'letter', orientation: 'portrait', cropMarks: true, margins: 24, fileName: 'cards' }, {
      printToPDF: (o) => window.folioDesktop.invoke('export:pdf', o)
    });
    return { res, perSheet: l.perSheet, marks: l.sheets[0].marks.length };
  });
  if (fs.existsSync(pdfPath('cards.pdf'))) {
    const info = pdfInfo(pdfPath('cards.pdf'));
    check(info.pages === 2, `cards.pdf has 2 sheets (${info.pages}); ${r3.perSheet} per sheet, ${r3.marks} marks`);
    check(info.boxes.every((b) => Math.abs(b[2] - 612) < 0.6 && Math.abs(b[3] - 792) < 0.6), 'cards MediaBox is Letter 612x792pt');
  } else check(false, 'cards.pdf written ' + JSON.stringify(r3));

  // 4. One PDF per merge record into a folder via export:pdf-batch.
  const r4 = await win.evaluate(async () => {
    const E = window.FolioExport;
    const records = [{ name: 'Ada' }, { name: 'Grace' }, { name: 'Linus' }];
    return E.exportPDF(window.doc(2), window.renderPage, { records, perRecordFiles: true, recordName: (r) => 'Letter to ' + r.name, pages: '1-2' }, { isDesktop: true });
  });
  const batchFiles = fs.readdirSync(outFolder).filter((f) => f.endsWith('.pdf')).sort();
  check(r4 && r4.count === 3, `pdf-batch result ${JSON.stringify(r4)}`);
  check(batchFiles.join('|') === 'Letter to Ada.pdf|Letter to Grace.pdf|Letter to Linus.pdf', `batch files ${batchFiles.join(', ')}`);
  check(batchFiles.every((f) => pdfInfo(path.join(outFolder, f)).pages === 2), 'each record PDF has 2 pages');
  const ada = fs.readFileSync(path.join(outFolder, 'Letter to Ada.pdf'));
  const linus = fs.readFileSync(path.join(outFolder, 'Letter to Linus.pdf'));
  check(!ada.equals(linus), 'record PDFs differ (personalised content)');

  // 5. rasterizeNode -> PNG of the right pixel size, text rendered, right font, not tainted.
  const r5 = await win.evaluate(async () => {
    const E = window.FolioExport;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-5000px;top:0;';
    document.body.appendChild(host);
    const mk = (font) => {
      const n = document.createElement('div');
      n.style.cssText = 'position:relative;width:400px;height:200px;background:#ffffff;';
      const t = document.createElement('div');
      t.textContent = 'Folio Ag';
      t.style.cssText = `position:absolute;left:20px;top:40px;font:700 80px/1 ${font};color:#000;`;
      n.appendChild(t);
      host.appendChild(n);
      return n;
    };
    await document.fonts.load("700 80px 'Bodoni Moda'");
    const stats = async (blob) => {
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let dark = 0; let sig = 0;
      for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; if (v < 200) { dark++; sig = (sig * 31 + i) % 1000000007; } }
      return { w: bmp.width, h: bmp.height, dark, sig };
    };
    const a = mk("'Bodoni Moda', serif");
    const b = mk('monospace');
    const blobA = await E.rasterizeNode(a, { dpi: 192, format: 'png', fontsCssUrl: window.FONTS_CSS });
    const blobB = await E.rasterizeNode(b, { dpi: 192, format: 'png', fontsCssUrl: window.FONTS_CSS });
    const blobNoFont = await E.rasterizeNode(a, { dpi: 192, format: 'png', fontsCssUrl: 'missing/fonts.css' });
    const jpg = await E.rasterizeNode(a, { dpi: 72, format: 'jpeg', quality: 0.8, fontsCssUrl: window.FONTS_CSS });
    const sa = await stats(blobA); const sb = await stats(blobB); const sn = await stats(blobNoFont);
    const head = [...new Uint8Array(await blobA.arrayBuffer()).slice(0, 8)];
    const jhead = [...new Uint8Array(await jpg.arrayBuffer()).slice(0, 3)];
    const bytes = new Uint8Array(await blobA.arrayBuffer());
    const base64 = btoa(String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, 60000))));
    host.remove();
    return { sa, sb, sn, head, jhead, type: blobA.type, jtype: jpg.type, bytes: bytes.length, b64: bytes.length <= 60000 ? base64 : null };
  });
  check(r5.type === 'image/png' && r5.head.join(',') === '137,80,78,71,13,10,26,10', 'rasterizeNode returns a PNG');
  check(r5.sa.w === 800 && r5.sa.h === 400, `PNG pixel size at 192 dpi is 800x400 (${r5.sa.w}x${r5.sa.h})`);
  check(r5.sa.dark > 2000, `text pixels present (${r5.sa.dark} dark px)`);
  check(r5.sa.sig !== r5.sb.sig && Math.abs(r5.sa.dark - r5.sb.dark) > 200, `embedded Bodoni Moda differs from monospace (${r5.sa.dark} vs ${r5.sb.dark})`);
  check(r5.sa.sig !== r5.sn.sig, `embedded web font differs from the unembedded fallback (${r5.sa.dark} vs ${r5.sn.dark})`);
  check(r5.jtype === 'image/jpeg' && r5.jhead.join(',') === '255,216,255', 'JPEG output');
  if (r5.b64) {
    const { getPngDpi } = await import(path.join(ROOT, 'src/engines/export/imagemeta.js'));
    check(getPngDpi(new Uint8Array(Buffer.from(r5.b64, 'base64'))) === 192, 'PNG carries 192 dpi pHYs');
  }

  // 6. exportImages: 2 pages with bleed -> folder of PNGs via export:save-files.
  fs.rmSync(outFolder, { recursive: true, force: true }); fs.mkdirSync(outFolder);
  const r6 = await win.evaluate(async () => {
    const E = window.FolioExport;
    const platform = {
      saveBinary: (o) => window.folioDesktop.invoke('export:save-binary', o),
      saveFilesToFolder: (files) => window.folioDesktop.invoke('export:save-files', { files })
    };
    const many = await E.exportImages(window.doc(3), window.renderPage, { pages: '1, 3', dpi: 96, includeBleed: true, fileName: 'Harness', fontsCssUrl: window.FONTS_CSS }, platform);
    return { many };
  });
  const imgs = fs.readdirSync(outFolder).sort();
  check(r6.many.files === 2 && imgs.join('|') === 'Harness - Page 1.png|Harness - Page 3.png', `image folder: ${imgs.join(', ')}`);
  if (imgs.length) {
    const png = fs.readFileSync(path.join(outFolder, imgs[0]));
    check(png.readUInt32BE(16) === 424 && png.readUInt32BE(20) === 624, `page PNG with 12px bleed is 424x624 (${png.readUInt32BE(16)}x${png.readUInt32BE(20)})`);
  }
  // same names again -> unique suffixes, never overwritten
  await win.evaluate(async () => window.folioDesktop.invoke('export:save-files', { files: [{ name: 'Harness - Page 1.png', data: 'x' }, { name: '../escape.txt', data: 'y' }] }));
  const after = fs.readdirSync(outFolder).sort();
  check(after.includes('Harness - Page 1 (2).png') && after.includes('escape.txt') && !fs.existsSync(path.join(OUT, 'escape.txt')), `no overwrite / no traversal: ${after.join(', ')}`);

  // 7. save-binary + reveal only for written paths; printers list.
  await nextSave('image.png');
  const r7 = await win.evaluate(async () => {
    const res = await window.folioDesktop.invoke('export:save-binary', { data: new Uint8Array([1, 2, 3]), suggestedName: 'image.png', filters: [{ name: 'PNG', extensions: ['png'] }] });
    const revealOther = await window.folioDesktop.invoke('export:reveal', '/etc/passwd');
    const printers = await window.folioDesktop.invoke('print:printers');
    return { res, revealOther, printers: Array.isArray(printers) };
  });
  check(r7.res && fs.existsSync(pdfPath('image.png')) && fs.readFileSync(pdfPath('image.png')).length === 3, 'save-binary wrote the bytes');
  check(r7.revealOther === false, 'reveal refuses paths it did not write');
  check(r7.printers, 'print:printers returns a list');

  // 8. preview renders sheets scaled into a container
  const r8 = await win.evaluate(async () => {
    const E = window.FolioExport;
    const c = document.createElement('div'); c.style.width = '500px'; document.body.appendChild(c);
    const p = E.buildPreview(c, window.doc(8), window.renderPage, { mode: 'booklet', paper: 'letter', width: 500 });
    await p.ready;
    const out = { count: p.sheetCount, figs: c.querySelectorAll('figure').length, pages: c.querySelectorAll('.pg-title').length, caption: c.querySelector('figcaption').textContent };
    p.destroy(); c.remove();
    return out;
  });
  check(r8.count === 4 && r8.figs === 4 && r8.pages === 8 && r8.caption === 'Sheet 1 · Front', `preview ${JSON.stringify(r8)}`);
} finally {
  await app.close();
}
const realErrors = errors.filter((e) => !/ERR_FILE_NOT_FOUND/.test(e)); // the missing-fonts case is deliberate
check(realErrors.length === 0, `no page errors ${realErrors.length ? JSON.stringify(realErrors) : ''}`);
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall export e2e checks passed');
process.exit(failures ? 1 : 0);
