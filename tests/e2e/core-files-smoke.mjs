// End-to-end check of files, recovery and the desktop shell (Electron under a display):
//   xvfb-run -a node tests/e2e/core-files-smoke.mjs [outDir]
// Needs a built app (`npm run build`). Native dialogs are stubbed in the main process.
// Proves: save to .folio and reopen in a new tab identical; Save As; closing a dirty document prompts;
// a recovery copy appears after an edit and is offered after a renderer crash and after a relaunch
// without a clean close; the recent list is updated; a .folio passed on argv opens; window close runs
// the per-document save flow and removes recovery copies.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ELECTRON = require(path.join(ROOT, 'node_modules/electron'));

function loadPlaywright() {
  for (const t of ['playwright', process.env.PLAYWRIGHT_DIR, '/opt/node22/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright'].filter(Boolean)) {
    try { return require(t); } catch { /* next */ }
  }
  throw new Error('Playwright not found (npm i -g playwright or set PLAYWRIGHT_DIR)');
}
const { _electron } = loadPlaywright();

const OUT = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'folio-files-e2e-')));
const PROFILE = path.join(OUT, 'profile');
const DOCS = path.join(OUT, 'docs');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(DOCS, { recursive: true });

let failures = 0;
function check(cond, msg, detail) {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}${!cond && detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(extraArgs = []) {
  const electronApp = await _electron.launch({
    executablePath: ELECTRON,
    args: [ROOT, ...extraArgs, '--no-sandbox'],
    cwd: DOCS,
    env: { ...process.env, FOLIO_USER_DATA: PROFILE },
    timeout: 60000
  });
  const errors = [];
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  };
  electronApp.on('window', watch);
  const page = await electronApp.firstWindow();
  watch(page);
  await bootWait(page);
  return { electronApp, page, errors };
}

async function bootWait(page) {
  await page.waitForLoadState('load');
  await page.waitForFunction(() => {
    const a = window.folio?.app;
    return !!(a && a.files && a.platform && a.platform.isDesktop);
  }, null, { timeout: 30000 });
  await sleep(400);
}

/** Stub native dialogs: next save path / next open path. */
async function stubDialogs(electronApp) {
  await electronApp.evaluate(({ dialog }) => {
    globalThis.__save = null;
    globalThis.__open = null;
    globalThis.__saveCalls = 0;
    dialog.showSaveDialog = async () => { globalThis.__saveCalls++; const p = globalThis.__save; globalThis.__save = null; return { canceled: !p, filePath: p || undefined }; };
    dialog.showOpenDialog = async () => { const p = globalThis.__open; globalThis.__open = null; return { canceled: !p, filePaths: p ? [p] : [] }; };
    dialog.showErrorBox = () => {};
  });
}
const nextSave = (app, p) => app.evaluate((_e, v) => { globalThis.__save = v; }, p);
const nextOpen = (app, p) => app.evaluate((_e, v) => { globalThis.__open = v; }, p);
const saveCalls = (app) => app.evaluate(() => globalThis.__saveCalls);

/** Click a button in the topmost in-app dialog. */
async function answerDialog(page, label, timeout = 8000) {
  const dlg = page.locator('.dlg').last();
  await dlg.waitFor({ state: 'visible', timeout });
  const title = await dlg.locator('.dlg-head h2').textContent();
  await dlg.locator('.dlg-foot button', { hasText: label }).first().click();
  await sleep(250);
  return title;
}

const recoveryFiles = () => { try { return fs.readdirSync(path.join(PROFILE, 'recovery')).filter((n) => n.endsWith('.folio')); } catch { return []; } };

// ------------------------------------------------------------------------------------------------
let run = await launch();
let { electronApp, page } = run;
await stubDialogs(electronApp);

// Start from a fresh untitled document with one shape.
await page.evaluate(() => {
  const app = window.folio.app;
  if (!app.session) app.newDocument({ title: 'Garden Party' });
  app.transact('Title', (doc) => { doc.title = 'Garden Party'; });
  app.transact('Insert Shape', (doc) => {
    doc.pages[0].elements.push({ id: 'e2e_rect', type: 'shape', name: 'Box', shape: 'rect', x: 96, y: 96, w: 200, h: 120, rot: 0, opacity: 1,
      locked: false, hidden: false, wrap: 'none', fill: { type: 'solid', color: '@accent' }, stroke: { color: '@ink', width: 0, dash: 'solid' } });
  });
});
check(await page.evaluate(() => window.folio.app.session.dirty), 'edited document is dirty');

// 1) Save (first save asks where) via the keyboard shortcut.
const saveTo = path.join(DOCS, 'Garden.folio');
await nextSave(electronApp, saveTo);
await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
await page.keyboard.press('Control+S');
await page.waitForFunction(() => !window.folio.app.session.dirty, null, { timeout: 10000 }).catch(() => {});
check(fs.existsSync(saveTo), 'Ctrl+S saved Garden.folio');
const saved = fs.existsSync(saveTo) ? fs.readFileSync(saveTo, 'utf8') : '';
const st1 = await page.evaluate(() => ({ dirty: window.folio.app.session.dirty, path: window.folio.app.session.filePath, name: window.folio.app.session.displayName }));
check(!st1.dirty && st1.path === saveTo, 'session is clean and bound to the file', st1);
check(saved && JSON.parse(saved).format === 'folio-publication' && JSON.parse(saved).pages[0].elements.some((e) => e.id === 'e2e_rect'), 'file is a Folio publication containing the shape');

// 2) Second save is silent (known path): no dialog.
await page.evaluate(() => window.folio.app.transact('Move', (doc) => { doc.pages[0].elements.find((e) => e.id === 'e2e_rect').x = 150; }));
const callsBefore = await saveCalls(electronApp);
await page.evaluate(() => window.folio.app.files.save());
check((await saveCalls(electronApp)) === callsBefore, 'second save writes without a dialog');
check(JSON.parse(fs.readFileSync(saveTo, 'utf8')).pages[0].elements.find((e) => e.id === 'e2e_rect').x === 150, 'second save wrote the change');

// 3) Reopen a copy in a NEW tab and compare serialised documents.
const copyPath = path.join(DOCS, 'Garden copy.folio');
fs.copyFileSync(saveTo, copyPath);
await nextOpen(electronApp, copyPath);
const tabsBefore = await page.evaluate(() => window.folio.app.sessions.length);
await page.evaluate(() => window.folio.app.exec('file.open'));
await page.waitForFunction((n) => window.folio.app.sessions.length === n + 1, tabsBefore, { timeout: 10000 }).catch(() => {});
const reopened = await page.evaluate(() => ({ n: window.folio.app.sessions.length, text: JSON.stringify(window.folio.app.session.doc), path: window.folio.app.session.filePath, dirty: window.folio.app.session.dirty }));
check(reopened.n === tabsBefore + 1, 'open created a new document tab', reopened.n);
check(reopened.path === copyPath && !reopened.dirty, 'reopened tab is bound to the copy and clean');
check(reopened.text === fs.readFileSync(copyPath, 'utf8'), 'reopened document serialises identically to the saved file');

// 4) Save As to a new file.
const asPath = path.join(DOCS, 'Garden v2.folio');
await nextSave(electronApp, asPath);
await page.evaluate(() => window.folio.app.exec('file.saveAs'));
await sleep(500);
check(fs.existsSync(asPath), 'Save As wrote a new file');
check((await page.evaluate(() => window.folio.app.session.filePath)) === asPath, 'tab path is the Save As target');

// 5) Recent list updated (newest first).
const recent = await page.evaluate(() => window.folio.app.files.recentList());
check(recent[0] && recent[0].path === asPath && recent.some((r) => r.path === saveTo), 'recent list has the saved files, newest first', recent.map((r) => r.path));

// 6) Closing a dirty document prompts; Cancel keeps it open.
await page.evaluate(() => window.folio.app.transact('Move', (doc) => { doc.pages[0].elements[0].y += 10; }));
const closeP = page.evaluate(() => window.folio.app.exec('file.close'));
const title = await answerDialog(page, 'Cancel');
await closeP;
check(/Save changes/.test(title || ''), 'closing a dirty document asks to save', title);
const stillOpen = await page.evaluate((p) => window.folio.app.sessions.some((s) => s.filePath === p), asPath);
check(stillOpen, 'Cancel keeps the document open');

// 7) Recovery copy appears ~3 s after an edit.
const dirtyId = await page.evaluate(() => window.folio.app.session.id);
await sleep(3800);
check(recoveryFiles().includes(`${dirtyId}.folio`), 'recovery copy written after the edit', recoveryFiles());

// 8) Crash the renderer: the window reloads and offers the recovery copy.
await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer());
await sleep(1500);
page = electronApp.windows()[0];
await bootWait(page);
const t1 = await answerDialog(page, 'Restore', 15000).catch((e) => `none: ${e.message}`);
check(/Recover/.test(t1), 'after a crash the recovery dialog is offered', t1);
const restored = await page.evaluate((id) => {
  const s = window.folio.app.sessions.find((x) => x.id === id);
  return s ? { dirty: s.dirty, path: s.filePath, y: s.doc.pages[0].elements[0].y } : null;
}, dirtyId);
check(restored && restored.dirty && restored.path === asPath, 'restored document is dirty and keeps its file path', restored);
// The restored document's path is trusted (persisted knownPaths): Save is silent.
const calls2 = await saveCalls(electronApp);
await page.evaluate((id) => window.folio.app.files.save(window.folio.app.sessions.find((x) => x.id === id)), dirtyId);
check((await saveCalls(electronApp)) === calls2, 'restored document saves to its path without a dialog');
check(!recoveryFiles().includes(`${dirtyId}.folio`), 'recovery copy removed after saving');

// 9) Relaunch without a clean close (kill the app) -> recovery offered on the next start.
await page.evaluate(() => window.folio.app.transact('Move', (doc) => { doc.pages[0].elements[0].x += 5; }));
await sleep(3800);
const killedCopies = recoveryFiles();
check(killedCopies.length >= 1, 'a recovery copy exists before the kill', killedCopies);
electronApp.process().kill('SIGKILL');
await sleep(800);

// 10) Relaunch with a .folio on argv (relative to the working directory).
const argvFile = path.join(DOCS, 'Argv doc.folio');
fs.copyFileSync(saveTo, argvFile);
run = await launch(['Argv doc.folio']);
({ electronApp, page } = run);
await stubDialogs(electronApp);
const t2 = await answerDialog(page, 'Restore', 15000).catch((e) => `none: ${e.message}`);
check(/Recover/.test(t2), 'after relaunch the recovery dialog is offered', t2);
await page.waitForFunction((p) => window.folio.app.sessions.some((s) => s.filePath === p), argvFile, { timeout: 10000 }).catch(() => {});
const argvOpen = await page.evaluate((p) => window.folio.app.sessions.find((s) => s.filePath === p), argvFile).then(Boolean);
check(argvOpen, '.folio passed on argv opens in a tab');
const sessionsNow = await page.evaluate(() => window.folio.app.sessions.map((s) => ({ dirty: s.dirty, path: s.filePath })));
check(sessionsNow.some((s) => s.dirty), 'the unsaved document came back from recovery', sessionsNow);

// 11) Window close runs the per-document save flow; Don't Save quits and removes recovery copies.
await sleep(3500);
await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
const t3 = await answerDialog(page, 'Cancel').catch((e) => `none: ${e.message}`);
check(/Save changes/.test(t3), 'window close asks about unsaved documents', t3);
check(electronApp.windows().length === 1, 'Cancel keeps the window open');
const exited = new Promise((r) => electronApp.process().once('exit', () => r(true)));
await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
for (let i = 0; i < 5; i++) {
  const t = await answerDialog(page, 'Don’t Save', 3000).catch(() => null);
  if (!t) break;
}
const didExit = await Promise.race([exited, sleep(10000).then(() => false)]);
check(didExit, 'the app quits after Don’t Save');
check(recoveryFiles().length === 0, 'clean quit removed every recovery copy', recoveryFiles());
for (const e of run.errors) console.log('  renderer error:', e);
if (!didExit) await electronApp.close().catch(() => {});

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
