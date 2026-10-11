// Regression: after leaving a text box, a single click (or a double click) on it puts the cursor
// back in its text so typing continues. Run: npm run build && xvfb-run -a node tests/e2e/text-click.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { _electron } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const UD = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-click-'));
let failed = 0;
const check = (name, ok, info = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  — ${info}` : ''}`); };

const app = await _electron.launch({ executablePath: require(path.join(ROOT, 'node_modules/electron')), args: [ROOT, '--no-sandbox', `--user-data-dir=${UD}`] });
const w = await app.firstWindow();
await w.setViewportSize({ width: 1400, height: 900 }).catch(() => {});
await w.waitForTimeout(1500);
try {
  await w.evaluate(async () => { const A = window.folioApp; await A.exec('file.newBlank'); A.ui.backstage && A.ui.backstage.close(); });
  await w.waitForTimeout(400);
  await w.evaluate(() => window.folioApp.exec('insert.textBox'));
  const page = await w.locator('.viewport .layer-page').first().boundingBox();
  const x0 = page.x + 80, y0 = page.y + 80;
  await w.mouse.move(x0, y0); await w.mouse.down(); await w.mouse.move(x0 + 300, y0 + 120, { steps: 6 }); await w.mouse.up();
  await w.waitForTimeout(300);
  await w.keyboard.type('Hello');
  const story = () => w.evaluate(() => Object.values(window.folioApp.doc.stories).map((s) => s.html).join(' | '));
  const away = async () => { await w.mouse.click(page.x + 400, page.y + 500); await w.waitForTimeout(400); };

  await away();
  check('Clicking away leaves the text box', !(await w.evaluate(() => !!window.folioApp.editing)) && (await story()).includes('Hello'));
  await w.mouse.click(x0 + 60, y0 + 20); await w.waitForTimeout(300);
  await w.keyboard.type(' world'); await w.waitForTimeout(800);
  check('A single click puts the cursor back in the text', (await story()).includes('Hello world'), await story());

  await away();
  await w.mouse.dblclick(x0 + 60, y0 + 20); await w.waitForTimeout(300);
  await w.keyboard.type(' again'); await w.waitForTimeout(800);
  check('A double click puts the cursor back in the text', (await story()).includes('again'), await story());

  await away();
  const before = await w.evaluate(() => window.folioApp.doc.pages[0].elements[0].x);
  await w.mouse.move(x0 + 60, y0 + 20); await w.mouse.down(); await w.mouse.move(x0 + 160, y0 + 60, { steps: 8 }); await w.mouse.up();
  await w.waitForTimeout(300);
  const after = await w.evaluate(() => window.folioApp.doc.pages[0].elements[0].x);
  check('Dragging a text box still moves it', Math.abs(after - before) > 20, `${before} → ${after}`);
} catch (err) {
  check('Run without exceptions', false, err.stack);
} finally {
  await app.evaluate(({ app }) => app.exit(0));
}
console.log(failed ? `${failed} check(s) failed` : 'All text-click checks passed');
process.exit(failed ? 1 : 0);
