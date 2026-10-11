// Folio Publisher — desktop shell end-to-end test (development app under xvfb).
//   npm run build && xvfb-run -a node tests/e2e/desktop-shell.mjs [outDir]
// Checks what can be verified on Linux of the Windows/macOS shell behaviour:
//  - the app launches to the start screen without console errors;
//  - the custom title bar is the overlay height, is a drag region, and keeps clear of the window
//    controls: caption buttons on the right (Windows/Linux) or traffic lights on the left (macOS,
//    simulated by switching the platform classes and insets the renderer sets);
//  - the macOS application menu template builds with Electron's Menu, only lists registered
//    commands, and its items drive the real renderer (File › New, View › Zoom In);
//  - macOS 'open-file' and Windows second-instance file opening reach the renderer.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ELECTRON, check, finish, launch, waitForBoot, scratchDir, writeSampleFolio, forceQuit } from './desktop-lib.mjs';

const OUT = process.argv[2] ? path.resolve(process.argv[2]) : scratchDir('desktop-shell');
fs.mkdirSync(OUT, { recursive: true });
const profile = path.join(OUT, 'profile');
fs.rmSync(profile, { recursive: true, force: true });
const TITLEBAR_HEIGHT = 48;      // desktop/main.js TITLEBAR.height
const CAPTION_RIGHT = 138;       // reserved for the Windows caption buttons
const TRAFFIC_LEFT = 80;         // reserved for the macOS traffic lights

const { electronApp, page, errors } = await launch({ profile });
// Capture the command ids the renderer reports for the macOS menu.
await electronApp.evaluate(({ ipcMain }) => {
  globalThis.__folioMenuIds = null;
  ipcMain.on('app:menu-commands', (_e, ids) => { globalThis.__folioMenuIds = ids; });
});

const sessions = () => page.evaluate(() => document.querySelectorAll('.doctabs .dt').length);
const winTitle = () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle());

try {
  await waitForBoot(page);
  check(true, 'app boots to the start screen');
  const win = await electronApp.evaluate(({ BrowserWindow, Menu }) => {
    const w = BrowserWindow.getAllWindows()[0];
    const [minW, minH] = w.getMinimumSize();
    return { title: w.getTitle(), minW, minH, appMenu: Menu.getApplicationMenu(), menuBar: w.isMenuBarVisible() };
  });
  check(/Folio Publisher/.test(win.title), `window title "${win.title}"`);
  check(win.minW >= 960 && win.minH >= 620, `minimum size ${win.minW}×${win.minH}`);
  check(win.appMenu === null && !win.menuBar, 'no native menu bar on Windows/Linux (the ribbon replaces it)');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'start.png') });

  // ---- title bar geometry ----
  const measure = () => page.evaluate(() => {
    const tb = document.querySelector('.titlebar');
    const r = tb.getBoundingClientRect();
    const kids = [...tb.querySelectorAll('.tb-left, .tb-center, .tb-right')].filter((e) => e.offsetParent && e.getBoundingClientRect().width > 0);
    const left = Math.min(...kids.map((k) => k.getBoundingClientRect().left));
    const right = Math.max(...kids.map((k) => k.getBoundingClientRect().right));
    const cs = getComputedStyle(tb);
    const btn = tb.querySelector('button:not([hidden])');
    return {
      height: Math.round(r.height), top: r.top, left, right, width: innerWidth,
      drag: cs.getPropertyValue('app-region') || cs.getPropertyValue('-webkit-app-region'),
      btnDrag: btn ? (getComputedStyle(btn).getPropertyValue('app-region') || getComputedStyle(btn).getPropertyValue('-webkit-app-region')) : 'no-drag',
      insetL: getComputedStyle(document.documentElement).getPropertyValue('--caption-inset-left').trim(),
      insetR: getComputedStyle(document.documentElement).getPropertyValue('--caption-inset-right').trim(),
      wco: navigator.windowControlsOverlay ? { visible: navigator.windowControlsOverlay.visible, rect: navigator.windowControlsOverlay.getTitlebarAreaRect().toJSON() } : null
    };
  });
  const lin = await measure();
  check(lin.top === 0 && lin.height === TITLEBAR_HEIGHT, `title bar is ${lin.height}px at the top (overlay height ${TITLEBAR_HEIGHT})`);
  check(lin.drag === 'drag', `title bar is a window drag region (${lin.drag})`);
  check(lin.btnDrag === 'no-drag', 'title bar buttons stay clickable (no-drag)');
  check(lin.insetR === `${CAPTION_RIGHT}px` && lin.insetL === '0px', `Windows/Linux insets: right ${lin.insetR}, left ${lin.insetL}`);
  check(lin.right <= lin.width - CAPTION_RIGHT + 1, `content ends before the caption buttons (${Math.round(lin.right)} ≤ ${lin.width - CAPTION_RIGHT})`);
  if (lin.wco?.visible) {
    const overlay = lin.width - (lin.wco.rect.x + lin.wco.rect.width);
    check(overlay <= CAPTION_RIGHT, `window-controls overlay (${overlay}px) fits in the reserved ${CAPTION_RIGHT}px`);
  }

  // Simulate macOS: the renderer sets these for process.platform === 'darwin'.
  const setPlatform = (os) => page.evaluate((os) => {
    const root = document.documentElement;
    root.classList.remove('os-linux', 'os-win32', 'os-darwin', 'is-mac');
    root.classList.add(`os-${os}`);
    if (os === 'darwin') root.classList.add('is-mac');
    root.style.setProperty('--caption-inset-right', os === 'darwin' ? '0px' : '138px');
    root.style.setProperty('--caption-inset-left', os === 'darwin' ? '80px' : '0px');
  }, os);
  await setPlatform('darwin');
  const mac = await measure();
  check(mac.left >= TRAFFIC_LEFT - 1, `macOS: content starts after the traffic lights (${Math.round(mac.left)} ≥ ${TRAFFIC_LEFT})`);
  check(mac.right > mac.width - CAPTION_RIGHT, `macOS: no space reserved on the right (${Math.round(mac.right)} of ${mac.width})`);
  check(mac.height === TITLEBAR_HEIGHT, 'macOS: title bar height unchanged (traffic lights centred at y=17)');
  await page.screenshot({ path: path.join(OUT, 'titlebar-darwin.png'), clip: { x: 0, y: 0, width: mac.width, height: 60 } });
  await setPlatform('win32');
  const w32 = await measure();
  check(w32.left < TRAFFIC_LEFT && w32.right <= w32.width - CAPTION_RIGHT + 1, 'win32: content clear of the caption buttons, no left gap');
  await page.screenshot({ path: path.join(OUT, 'titlebar-win32.png'), clip: { x: 0, y: 0, width: w32.width, height: 60 } });
  await setPlatform('linux');

  // ---- macOS application menu ----
  await page.waitForFunction(() => true);
  for (let i = 0; i < 20 && !(await electronApp.evaluate(() => !!globalThis.__folioMenuIds)); i++) await page.waitForTimeout(250);
  const menu = await electronApp.evaluate(({ Menu, BrowserWindow }, mainPath) => {
    const { buildMenuTemplate } = process.mainModule.require(mainPath);
    const ids = globalThis.__folioMenuIds;
    const w = BrowserWindow.getAllWindows()[0];
    const tpl = buildMenuTemplate({ appName: 'Folio Publisher', available: ids ? new Set(ids) : null, send: (id) => w.webContents.send('menu:command', id) });
    const m = Menu.buildFromTemplate(tpl);
    globalThis.__folioMacMenu = m;
    const walk = (mm) => mm.items.map((i) => ({ label: i.label, role: i.role, id: i.id, accel: i.accelerator, sub: i.submenu ? walk(i.submenu) : null }));
    return { ids, items: walk(m) };
  }, path.join(ROOT, 'desktop/main.js'));
  check(Array.isArray(menu.ids) && menu.ids.length > 10, `renderer reported ${menu.ids?.length || 0} command ids for the menu`);
  const flat = [];
  const flatten = (items, trail) => { for (const it of items) { flat.push({ ...it, trail: `${trail} › ${it.label || it.role}` }); if (it.sub) flatten(it.sub, `${trail} › ${it.label || it.role}`); } };
  flatten(menu.items, 'Menu');
  check(menu.items.map((i) => i.label)[0] === 'Folio Publisher' && menu.items.length >= 5, `Electron built the macOS menu: ${menu.items.map((i) => i.label).join(' | ')}`);
  const cmdItems = flat.filter((i) => i.id && i.id.startsWith('cmd:'));
  const unknown = cmdItems.filter((i) => !menu.ids.includes(i.id.slice(4)));
  check(!unknown.length, `every menu command is registered (${cmdItems.length} items)`, unknown.map((i) => i.trail));
  for (const id of ['file.new', 'file.open', 'file.save', 'file.saveAs']) check(cmdItems.some((i) => i.id === `cmd:${id}`), `File menu has ${id}`);
  const missing = ['file.close', 'file.print', 'export.pdf', 'view.zoomIn', 'view.zoomOut', 'view.fitPage', 'app.settings', 'help.shortcuts']
    .filter((id) => !cmdItems.some((i) => i.id === `cmd:${id}`));
  console.log(`info menu items hidden because the command is not registered: ${missing.join(', ') || 'none'}`);
  const editRoles = flat.filter((i) => i.trail.startsWith('Menu › Edit')).map((i) => i.role);
  check(['cut', 'copy', 'paste', 'selectAll'].every((r) => editRoles.includes(r)), 'Edit menu keeps native clipboard roles');

  // Clicking menu items drives the renderer.
  const clickMenu = (id) => electronApp.evaluate((_e, id) => {
    const item = globalThis.__folioMacMenu.getMenuItemById(id);
    if (!item) return false;
    item.click();
    return true;
  }, id);
  const before = await sessions();
  if (await clickMenu('cmd:file.new')) {
    await page.waitForTimeout(600);
    // File › New may open the template gallery (backstage) or create a blank publication directly.
    let after = await sessions();
    if (after === before) {
      const created = await page.evaluate(async () => {
        const btn = [...document.querySelectorAll('.backstage:not([hidden]) button, .dialog button')].find((b) => /^(create|blank)/i.test(b.textContent.trim()));
        if (btn) btn.click();
        return !!btn;
      });
      if (created) await page.waitForTimeout(800);
      after = await sessions();
    }
    check(after === before + 1, `File › New (menu) opened a publication (${before} → ${after})`);
  } else check(false, 'File › New menu item exists');
  if (await sessions() > 0 && menu.ids.includes('view.zoomIn')) {
    const z0 = await page.evaluate(() => document.querySelector('.sb-pct')?.textContent);
    await clickMenu('cmd:view.zoomIn');
    await page.waitForTimeout(400);
    const z1 = await page.evaluate(() => document.querySelector('.sb-pct')?.textContent);
    check(z0 !== z1, `View › Zoom In (menu) changes the zoom (${z0} → ${z1})`);
  }

  // ---- macOS: Finder / Dock opens a file through app 'open-file' ----
  const macFile = await writeSampleFolio(path.join(OUT, 'From Finder.folio'), { title: 'From Finder', text: 'Opened through open-file' });
  const n0 = await sessions();
  await electronApp.evaluate(({ app }, f) => app.emit('open-file', { preventDefault() {} }, f), macFile);
  await page.waitForFunction((n) => document.querySelectorAll('.doctabs .dt').length > n, n0, { timeout: 10000 }).catch(() => {});
  check(await sessions() === n0 + 1, 'open-file event opens the publication in a new tab');
  check(/From Finder/.test(await winTitle()), `window title follows the active publication ("${await winTitle()}")`);
  check(await page.evaluate(() => document.body.innerText.includes('Opened through open-file')), 'its text is rendered');

  // ---- Windows: double-clicking a .folio while the app runs starts a second instance ----
  const secondFile = await writeSampleFolio(path.join(OUT, 'Second Instance.folio'), { title: 'Second Instance', text: 'Handed over by the second instance' });
  const n1 = await sessions();
  const child = spawn(ELECTRON, [ROOT, '--no-sandbox', `--user-data-dir=${profile}`, secondFile], { env: { ...process.env, FOLIO_USER_DATA: profile }, stdio: 'ignore' });
  const exitCode = await new Promise((resolve) => { const t = setTimeout(() => { child.kill(); resolve('timeout'); }, 20000); child.on('exit', (c) => { clearTimeout(t); resolve(c); }); });
  check(exitCode === 0, `second instance exits immediately (${exitCode})`);
  await page.waitForFunction((n) => document.querySelectorAll('.doctabs .dt').length > n, n1, { timeout: 10000 }).catch(() => {});
  check(await sessions() === n1 + 1, 'the first instance opens the file from the second instance');
  check(await page.evaluate(() => document.body.innerText.includes('Handed over by the second instance')), 'its text is rendered');

  check(errors.length === 0, 'no console errors', errors);
} catch (err) {
  check(false, `desktop shell run: ${err.stack || err.message}`);
} finally {
  await forceQuit(electronApp);
}

finish('desktop-shell');
