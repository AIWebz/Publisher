// Shared helpers for the desktop end-to-end scripts (tests/e2e/desktop-*.mjs).
// Run the scripts under a display, e.g. `xvfb-run -a node tests/e2e/desktop-shell.mjs`.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

/** Repository root. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Path to the development Electron binary. */
export const ELECTRON = require(path.join(ROOT, 'node_modules/electron'));

/** Playwright, from the project, NODE_PATH or the usual global install. */
export function loadPlaywright() {
  const tries = ['playwright', process.env.PLAYWRIGHT_DIR, '/opt/node22/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright', '/usr/lib/node_modules/playwright'];
  for (const t of tries.filter(Boolean)) {
    try { return require(t); } catch { /* next */ }
  }
  throw new Error('Playwright not found: npm i -g playwright (or set PLAYWRIGHT_DIR)');
}

/** A fresh scratch directory (argument 2 of the script, or a temp dir). */
export function scratchDir(name) {
  const base = process.env.FOLIO_E2E_DIR || path.join(os.tmpdir(), 'folio-e2e');
  const dir = path.join(base, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

let failures = 0;
/** Records and prints one assertion. */
export function check(cond, msg, detail) {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}${!cond && detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  if (!cond) failures++;
  return !!cond;
}
/** Number of failed checks so far. */
export const failed = () => failures;

/**
 * Launches an Electron app with Playwright and collects renderer console errors / page errors.
 * @param {{ executablePath?: string, args?: string[], profile: string, env?: object }} opts
 */
export async function launch({ executablePath = ELECTRON, args = [ROOT], profile, env = {} }) {
  const { _electron } = loadPlaywright();
  const electronApp = await _electron.launch({
    executablePath,
    args: [...args, '--no-sandbox', `--user-data-dir=${profile}`],
    env: { ...process.env, FOLIO_USER_DATA: profile, ELECTRON_ENABLE_LOGGING: '0', ...env },
    timeout: 60000
  });
  const errors = [];
  const watch = (page) => {
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  };
  electronApp.on('window', watch);
  const page = await electronApp.firstWindow();
  watch(page);
  return { electronApp, page, errors };
}

/**
 * Waits until the renderer has booted: the shell is mounted and the desktop chrome classes are set.
 * @param {import('playwright').Page} page
 */
export async function waitForBoot(page, timeout = 30000) {
  await page.waitForFunction(() => document.documentElement.classList.contains('is-desktop')
    && document.querySelector('#app, body') && document.body.children.length > 0
    && !!document.querySelector('.titlebar, [data-region="titlebar"], header'), null, { timeout });
}

/** Stubs Electron's native file dialogs in the main process. */
export async function stubDialogs(electronApp, { open = null, save = null } = {}) {
  await electronApp.evaluate(({ dialog }, { open, save }) => {
    dialog.showOpenDialog = async () => (open ? { canceled: false, filePaths: [open] } : { canceled: true, filePaths: [] });
    dialog.showSaveDialog = async () => (save ? { canceled: false, filePath: save } : { canceled: true });
  }, { open, save });
}

/** Ends the script with a summary and exit code. */
export function finish(label) {
  console.log(failures ? `\n${label}: ${failures} check(s) FAILED` : `\n${label}: all checks passed`);
  process.exit(failures ? 1 : 0);
}

/**
 * Writes a real .folio publication (built with the core model and serializer) containing one text frame.
 * @returns {Promise<string>} the file path
 */
export async function writeSampleFolio(file, { title = 'Sample', text = 'Sample publication' } = {}) {
  const model = await import(path.join(ROOT, 'src/core/model.js'));
  const format = await import(path.join(ROOT, 'src/core/persistence/format.js'));
  const doc = model.createDocument({ title, size: 'letter' });
  const frame = model.createTextFrame(doc, { x: 96, y: 96, w: 480, h: 120, name: 'Sample text' }, `<p>${text}</p>`);
  doc.pages[0].elements.push(frame);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, format.serializeForSave(doc));
  return file;
}

/** Ends the app without the Save / Don't Save flow (test teardown). */
export async function forceQuit(electronApp) {
  const proc = electronApp.process();
  const exited = new Promise((r) => { if (proc.exitCode !== null) r(); else proc.once('exit', r); });
  await electronApp.evaluate(({ app }) => setTimeout(() => app.exit(0), 10)).catch(() => {});
  await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
  if (proc.exitCode === null) proc.kill('SIGKILL');
}
