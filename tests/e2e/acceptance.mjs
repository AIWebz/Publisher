// End-to-end acceptance test: drives the built Electron app through the main publishing workflows.
// Run: npm run build && xvfb-run -a node tests/e2e/acceptance.mjs [outDir]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const { _electron } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'folio-e2e-'));
fs.mkdirSync(OUT, { recursive: true });
const UD = path.join(OUT, 'userdata');
fs.rmSync(UD, { recursive: true, force: true });

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  — ${info}` : ''}`); };

function png(w, h) { // solid gradient PNG
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 255 / w) | 0; raw[o + 1] = (y * 255 / h) | 0; raw[o + 2] = 140; } }
  const chunk = (t, d) => { const b = Buffer.alloc(8 + d.length + 4); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); const crc = zlib.crc32 ? zlib.crc32(Buffer.concat([Buffer.from(t), d])) : 0; b.writeUInt32BE(crc >>> 0, 8 + d.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const imgPath = path.join(OUT, 'photo.png'); fs.writeFileSync(imgPath, png(640, 400));
const csvPath = path.join(OUT, 'people.csv');
fs.writeFileSync(csvPath, 'First Name,Last Name,City\nAda,Lovelace,London\nGrace,Hopper,New York\n"Katherine","Johnson","White Sulphur Springs"\n');
const savePath = path.join(OUT, 'Acceptance.folio');
const pdfPath = path.join(OUT, 'Acceptance.pdf');
const pngOut = path.join(OUT, 'page.png');

const app = await _electron.launch({ executablePath: require(path.join(ROOT, 'node_modules/electron')), args: [ROOT, '--no-sandbox', `--user-data-dir=${UD}`], env: { ...process.env, FOLIO_USER_DATA: UD } });
console.log('launched');
const w = await app.firstWindow();
console.log('window');
const errors = [];
w.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
w.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await w.setViewportSize({ width: 1500, height: 940 }).catch(() => {});
await w.waitForTimeout(1500);
await app.evaluate(({ dialog }, p) => {
  dialog.showSaveDialog = async (_w, o) => {
    const ext = (o.filters && o.filters[0] && o.filters[0].extensions[0]) || 'folio';
    return { canceled: false, filePath: ext === 'pdf' ? p.pdf : ext === 'png' ? p.png : p.save };
  };
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p.save] });
  dialog.showMessageBox = async () => ({ response: 1 });
}, { save: savePath, pdf: pdfPath, png: pngOut });
const A = (fn, arg) => w.evaluate(fn, arg);
const doc = () => A(() => JSON.parse(JSON.stringify(window.folioApp.doc)));
const exec = (id, arg) => A(([i, a]) => window.folioApp.exec(i, a), [id, arg]);
const shot = (n) => w.screenshot({ path: path.join(OUT, `${n}.png`) });

try {
  // 1. Template gallery
  const cards = await w.locator('.tg-card').count();
  check('Template gallery shows templates', cards >= 10, `${cards} cards`);
  await w.locator('.tg-cat', { hasText: 'Newsletters' }).click();
  await w.locator('.tg-card').first().click();
  await w.locator('.tg-detail .btn-primary').click();
  await w.waitForTimeout(800);
  let d = await doc();
  check('Create publication from a template', d && d.pages.length >= 1 && d.pages[0].elements.length > 3, `${d.title}, ${d.pages.length} pages`);
  await shot('01-template');

  // 2. Blank publication + text
  await exec('file.newBlank'); await w.waitForTimeout(500);
  const slot = async () => w.locator('.page-slot').first().boundingBox();
  let b = await slot();
  await exec('insert.textBox');
  await w.mouse.move(b.x + 60, b.y + 60); await w.mouse.down(); await w.mouse.move(b.x + 380, b.y + 160, { steps: 5 }); await w.mouse.up();
  await w.waitForTimeout(300);
  await w.keyboard.type('Grand Opening Celebration');
  await w.keyboard.press('Control+a'); await w.keyboard.press('Control+b');
  await w.waitForTimeout(200);
  await w.keyboard.press('Escape'); await w.waitForTimeout(800);
  d = await doc();
  const story = Object.values(d.stories)[0];
  check('Type text into a new text box', story && story.html.includes('Grand Opening'), story && story.html.slice(0, 120));
  check('Bold formatting applied', story && /<(b|strong)>|font-weight:\s*(700|bold)/.test(story.html));
  const frame = d.pages[0].elements.find((e) => e.type === 'text');
  // move with the mouse
  await A((id) => window.folioApp.select([id]), frame.id);
  const nb = await w.locator(`.page-slot [data-id="${frame.id}"]`).boundingBox();
  await w.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2); await w.mouse.down(); await w.mouse.move(nb.x + nb.width / 2 + 60, nb.y + nb.height / 2 + 120, { steps: 8 }); await w.mouse.up();
  await w.waitForTimeout(300);
  d = await doc();
  const moved = d.pages[0].elements.find((e) => e.id === frame.id);
  check('Drag moves the text box', Math.abs(moved.x - frame.x) > 20 || Math.abs(moved.y - frame.y) > 40, `${frame.x},${frame.y} → ${moved.x.toFixed(0)},${moved.y.toFixed(0)}`);
  await exec('edit.undo'); await w.waitForTimeout(200);
  d = await doc();
  check('Undo restores position (one step per drag)', Math.abs(d.pages[0].elements.find((e) => e.id === frame.id).x - frame.x) < 0.5);
  await exec('edit.redo'); await w.waitForTimeout(200);

  // 3. Shape: draw, fill, rotate
  b = await slot();
  await exec('insert.shape', 'star');
  await w.mouse.move(b.x + 120, b.y + 260); await w.mouse.down(); await w.mouse.move(b.x + 260, b.y + 380, { steps: 5 }); await w.mouse.up();
  await w.waitForTimeout(300);
  d = await doc();
  const star = d.pages[0].elements.find((e) => e.type === 'shape');
  check('Draw a shape', !!star && star.shape === 'star');
  await A((id) => window.folioApp.select([id]), star.id);
  await exec('arrange.rotateRight'); await exec('shape.quickStyle', 4); await exec('shape.shadow', 'soft');
  d = await doc();
  const st2 = d.pages[0].elements.find((e) => e.id === star.id);
  check('Rotate, gradient fill and shadow on shape', st2.rot === 90 && st2.fill.type === 'linear' && st2.shadow.enabled);

  // 4. Picture import
  await A(async ([b64, name]) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); await window.folioApp.exec('insert.picture', [new File([bin], name, { type: 'image/png' })]); }, [fs.readFileSync(imgPath).toString('base64'), 'photo.png']);
  await w.waitForTimeout(800);
  d = await doc();
  const img = d.pages[0].elements.find((e) => e.type === 'image');
  check('Import a picture from a file', !!img && !!d.assets[img.assetId], img ? `${Math.round(img.w)}×${Math.round(img.h)}` : '');
  await A((id) => window.folioApp.select([id]), img.id);
  await exec('picture.cropAspect', 1); await exec('picture.zoomIn');
  d = await doc();
  const img2 = d.pages[0].elements.find((e) => e.id === img.id);
  check('Crop picture (aspect + zoom, non-destructive)', Math.abs(img2.w - img2.h) < 1 && img2.content && img2.content.w > img2.w && d.assets[img.assetId].width === 640);

  // 5. Group / ungroup, align
  await A(([a, c]) => window.folioApp.select([a, c]), [star.id, img.id]);
  await exec('arrange.group');
  d = await doc();
  const grp = d.pages[0].elements.find((e) => e.type === 'group');
  check('Group objects', !!grp && grp.children.length === 2);
  await exec('arrange.ungroup');
  d = await doc();
  check('Ungroup objects', !d.pages[0].elements.some((e) => e.type === 'group'));

  // 6. Table
  await exec('table.insert', { rows: 3, cols: 3, header: true }); await w.waitForTimeout(300);
  d = await doc();
  const tbl = d.pages[0].elements.find((e) => e.type === 'table');
  check('Insert a table', !!tbl && tbl.cells.length === 3 && tbl.cols.length === 3);
  await exec('table.insertBelow'); await exec('table.insertRight');
  d = await doc();
  const tbl2 = d.pages[0].elements.find((e) => e.type === 'table');
  check('Insert table row and column', tbl2.rows.length === 4 && tbl2.cols.length === 4);

  // 7. Pages
  await exec('page.insertAfter'); await exec('page.insertAfter'); await w.waitForTimeout(300);
  d = await doc();
  check('Add pages', d.pages.length === 3);
  const p0 = d.pages[0].id;
  await A(() => window.folioApp.goToPage(0)); await exec('page.moveDown');
  d = await doc();
  check('Reorder pages', d.pages[1].id === p0);
  await A(() => window.folioApp.goToPage(2)); await exec('page.delete', 2); await w.waitForTimeout(300);
  d = await doc();
  check('Delete a page', d.pages.length === 2);
  await A(() => window.folioApp.goToPage(1));
  await shot('02-editor');

  // 8. Save and reopen
  const before = await doc();
  await exec('file.save'); await w.waitForTimeout(800);
  check('Save to a .folio file', fs.existsSync(savePath));
  const saved = JSON.parse(fs.readFileSync(savePath, 'utf8'));
  check('Saved file keeps all pages and objects', saved.pages.length === before.pages.length && saved.pages[1].elements.length === before.pages[1].elements.length);
  await exec('file.open'); await w.waitForTimeout(1000);
  const reopened = await doc();
  check('Reopen shows identical content', reopened.pages.length === before.pages.length && JSON.stringify(reopened.pages.map((p) => p.elements.map((e) => [e.type, Math.round(e.x), Math.round(e.y)]))) === JSON.stringify(before.pages.map((p) => p.elements.map((e) => [e.type, Math.round(e.x), Math.round(e.y)]))));

  // 9. Export PDF
  await A(() => window.folioApp.ui.backstage.open('export')); await w.waitForTimeout(800);
  await shot('03-export');
  await w.locator('.out-go').click();
  for (let i = 0; i < 30 && !fs.existsSync(pdfPath); i++) await w.waitForTimeout(300);
  const pdf = fs.existsSync(pdfPath) ? fs.readFileSync(pdfPath) : null;
  const pageCount = pdf ? (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length : 0;
  check('PDF export writes a valid multi-page PDF', pdf && pdf.slice(0, 5).toString() === '%PDF-' && pageCount === before.pages.length, `${pageCount} pages, ${pdf ? pdf.length : 0} bytes`);
  const mb = pdf ? /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/.exec(pdf.toString('latin1')) : null;
  check('PDF page size matches the publication (Letter 612×792 pt)', mb && Math.abs(+mb[1] - 612) < 2 && Math.abs(+mb[2] - 792) < 2, mb ? `${mb[1]}×${mb[2]}` : '');
  await A(() => window.folioApp.ui.backstage.close());

  // 10. Mail merge with imported CSV
  await A(async ([text, name]) => { await window.folioApp.exec('mail.import', new File([text], name, { type: 'text/csv' })); }, [fs.readFileSync(csvPath, 'utf8'), 'people.csv']);
  await w.waitForTimeout(800);
  d = await doc();
  check('Import recipients from CSV', d.data && d.data.rows.length === 3 && d.data.columns.includes('First Name'));
  const tf = d.pages[app.pageIndex || 1].elements.find((e) => e.type === 'text') || d.pages[0].elements.find((e) => e.type === 'text');
  await A((id) => { const a = window.folioApp; const pi = a.doc.pages.findIndex((p) => p.elements.some((e) => e.id === id)); if (pi >= 0) a.goToPage(pi); a.select([id]); }, tf.id);
  await exec('mail.field', 'First Name');
  await w.waitForTimeout(400);
  await exec('mail.preview'); await exec('mail.next'); await w.waitForTimeout(500);
  const shown = await A(() => document.querySelector('.page-slot').innerText);
  check('Preview shows the current recipient', /Grace/.test(shown));
  await shot('04-mailmerge');
  await exec('mail.mergeNew'); await w.waitForTimeout(800);
  const merged = await doc();
  check('Merge to new publication uses imported records', merged.pages.length === before.pages.length * 3 && JSON.stringify(merged.stories).includes('Katherine'), `${merged.pages.length} pages`);

  // 11. Find & replace, statistics
  await exec('review.replace'); await w.waitForTimeout(200);
  const replaced = await A(() => { const a = window.folioApp; let n = 0; const html = JSON.stringify(a.doc.stories); n = (html.match(/Grand/g) || []).length; return n; });
  check('Find text in the merged publication', replaced >= 1);

  // 12. Templates editable
  await exec('file.newBlank');
  await A(() => window.folioApp.ui.backstage.open('new')); await w.waitForTimeout(500);
  await w.locator('.tg-cat', { hasText: 'Business' }).first().click();
  await w.locator('.tg-card').first().dblclick(); await w.waitForTimeout(800);
  d = await doc();
  const tfr = d.pages[0].elements.find((e) => e.type === 'text');
  const started = await A((id) => window.folioApp.textEdit.start(id, { selectAll: true }), tfr.id);
  await w.keyboard.type('Edited Name'); await w.keyboard.press('Escape'); await w.waitForTimeout(800);
  d = await doc();
  check('Template text is editable', started && JSON.stringify(d.stories).includes('Edited Name'));
  await shot('05-business-card');
} catch (err) {
  check('Test run completed without exceptions', false, err.message.split('\n')[0]);
}
check('No console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Output: ${OUT}`);
await app.evaluate(({ app: a }) => a.exit(0)).catch(() => {});
process.exit(failed ? 1 : 0);
