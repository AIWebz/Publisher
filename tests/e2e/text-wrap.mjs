// End-to-end check of text wrapping around objects (Square both sides / one side, Top and Bottom,
// None, z-order, "Wrap text around objects" off, columns, undo).
// Run: npm run build && xvfb-run -a node tests/e2e/text-wrap.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { _electron } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'folio-wrap-'));
const UD = path.join(OUT, 'userdata');
let failed = 0;
const check = (name, ok, info = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  — ${info}` : ''}`); };

const app = await _electron.launch({ executablePath: require(path.join(ROOT, 'node_modules/electron')), args: [ROOT, '--no-sandbox', `--user-data-dir=${UD}`], env: { ...process.env, FOLIO_USER_DATA: UD } });
const w = await app.firstWindow();
const errors = [];
w.on('pageerror', (e) => errors.push(e.message));
await w.setViewportSize({ width: 1400, height: 900 }).catch(() => {});
await w.waitForTimeout(1500);

// Build a page: one text box (or two columns) with long text and a shape in front of it.
const setup = (opts) => w.evaluate(async (o) => {
  const A = window.folioApp;
  const words = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua '.repeat(30);
  if (!A.session) { await A.exec('file.newBlank'); A.ui.backstage && A.ui.backstage.close(); }
  A.transact('setup', (d) => {
    const page = d.pages[0];
    page.elements = [];
    const sid = 's_wrap';
    d.stories[sid] = { id: sid, html: `<p>${words}</p>` };
    page.elements.push({ id: 'tf', type: 'text', x: 60, y: 60, w: 480, h: 600, rot: 0, storyId: sid, columns: o.cols || 1, colGap: 20, padding: { top: 0, right: 0, bottom: 0, left: 0 }, style: { font: 'Inter', size: 11, lineHeight: 1.3 }, wrapAround: o.wrapAround !== false, autofit: 'none' });
    const sh = { id: 'sh', type: 'shape', shape: 'rect', x: o.x, y: 200, w: o.w, h: 120, rot: 0, fill: '#ddd', wrap: { type: o.type, side: o.side || 'both', dist: 0 } };
    if (o.behind) page.elements.unshift(sh); else page.elements.push(sh);
  });
  await new Promise((r) => setTimeout(r, 400));
}, opts);

const measure = () => w.evaluate(() => {
  const A = window.folioApp;
  const node = A.canvas.nodeFor('tf'), sh = A.canvas.nodeFor('sh');
  const sr = sh.getBoundingClientRect();
  const k = sr.width / 1; // screen px of the shape
  const flow = node.querySelector('.tx-flow');
  const walker = document.createTreeWalker(flow, NodeFilter.SHOW_TEXT);
  const r = document.createRange();
  let overlap = 0, left = 0, right = 0, inBand = 0, total = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    for (let i = 0; i < n.data.length; i++) {
      if (n.data[i] === ' ') continue;
      r.setStart(n, i); r.setEnd(n, i + 1);
      const b = r.getBoundingClientRect();
      if (!b.width) continue;
      total++;
      const cy = (b.top + b.bottom) / 2;
      if (cy > sr.top + 1 && cy < sr.bottom - 1) {
        inBand++;
        if (b.right > sr.left + 1 && b.left < sr.right - 1) overlap++;
        if (b.right <= sr.left + 1) left++; else if (b.left >= sr.right - 1) right++;
      }
    }
  }
  return { overlap, left, right, inBand, total, k };
});

try {
  await setup({ type: 'square', x: 200, w: 160 });
  let m = await measure();
  check('Square, both sides: no text over the object', m.overlap === 0 && m.total > 500, JSON.stringify(m));
  check('Square, both sides: text on the left and on the right', m.left > 10 && m.right > 10, `left ${m.left} right ${m.right}`);
  await w.screenshot({ path: path.join(OUT, 'square-both.png') });

  await setup({ type: 'square', x: 200, w: 160, side: 'left' });
  m = await measure();
  check('Left side only: text only on the left', m.overlap === 0 && m.left > 10 && m.right === 0, JSON.stringify(m));

  await setup({ type: 'square', x: 200, w: 160, side: 'right' });
  m = await measure();
  check('Right side only: text only on the right', m.overlap === 0 && m.right > 10 && m.left === 0, JSON.stringify(m));

  await setup({ type: 'topBottom', x: 200, w: 160 });
  m = await measure();
  check('Top and Bottom: no text beside the object', m.inBand === 0, JSON.stringify(m));

  await setup({ type: 'none', x: 200, w: 160 });
  m = await measure();
  check('None: text runs under the object', m.overlap > 0, JSON.stringify(m));

  await setup({ type: 'square', x: 200, w: 160, behind: true });
  m = await measure();
  check('Object behind the text box does not wrap', m.overlap > 0, JSON.stringify(m));

  await setup({ type: 'square', x: 200, w: 160, wrapAround: false });
  m = await measure();
  check('"Wrap text around objects" off: no wrapping', m.overlap > 0, JSON.stringify(m));

  await setup({ type: 'square', x: 230, w: 140, cols: 2 });
  m = await measure();
  check('Two columns with an object across the gutter: wraps in both columns', m.overlap === 0 && m.left > 10 && m.right > 10, JSON.stringify(m));
  await w.screenshot({ path: path.join(OUT, 'columns.png') });

  await setup({ type: 'square', x: 200, w: 160 });
  await w.evaluate(async () => { const A = window.folioApp; A.select(['sh']); await A.exec('wrap.none'); });
  await w.waitForTimeout(400);
  m = await measure();
  check('Wrap Text › None command re-flows', m.overlap > 0, JSON.stringify(m));
  await w.evaluate(() => window.folioApp.exec('edit.undo'));
  await w.waitForTimeout(400);
  m = await measure();
  check('Undo restores the wrap', m.overlap === 0, JSON.stringify(m));
  check('No page errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  check('Run without exceptions', false, err.stack);
} finally {
  await app.evaluate(({ app }) => app.exit(0));
}
console.log(failed ? `${failed} check(s) failed` : 'All text-wrap checks passed', OUT);
process.exit(failed ? 1 : 0);
