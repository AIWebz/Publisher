/* Folio Publisher — Electron main process (Windows 11 and macOS desktop shell).
   Window, lifecycle, native menu (macOS), file IPC, atomic writes and the multi-document close flow.
   Extra IPC modules (desktop/ipc-*.js) are auto-loaded with a shared ctx; see ARCHITECTURE.md. */
'use strict';

const electron = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const license = require('./license.js');

// When this file is required by plain Node (unit tests), `electron` is the path to the binary.
const IS_ELECTRON = typeof electron === 'object' && !!process.versions.electron;

const APP_ID = 'com.folio.publisher';
const ROOT = path.join(__dirname, '..');
const DOC_EXT = /\.(folio|json|pub)$/i;
const TITLEBAR = { color: '#1f43ad', symbolColor: '#ffffff', height: 40 }; // = #titlebar height in src/styles/app.css
const CLOSE_ACK_TIMEOUT = 8000;
const KNOWN_PATHS_MAX = 500;
const PUB_PREFIX = 'folio-import:pub;base64,'; // = src/core/persistence/files.js

// ------------------------------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ------------------------------------------------------------------------------------------------

/** True for a path that looks like a publication file (.folio / .json). */
function isDocPath(p) {
  return typeof p === 'string' && DOC_EXT.test(p);
}

/**
 * Publication files named on a command line. argv[0] is the executable; switches and (in
 * development) the app directory are skipped. Relative paths resolve against `cwd`.
 * @param {string[]} argv
 * @param {string} [cwd]
 * @param {(p: string) => boolean} [isFile]
 * @returns {string[]} absolute paths of existing regular .folio/.json files
 */
function filesFromArgs(argv, cwd = process.cwd(), isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }) {
  const out = [];
  for (const a of (argv || []).slice(1)) {
    if (typeof a !== 'string' || a.startsWith('-') || !isDocPath(a)) continue;
    const abs = path.resolve(cwd || process.cwd(), a);
    if (isFile(abs) && !out.includes(abs)) out.push(abs);
  }
  return out;
}

/**
 * The macOS application menu. Items with `command` forward that app command id to the renderer
 * through `send(id)`; when `available` (Set of registered command ids) is given, command items
 * the renderer does not know are left out. Edit uses roles so native text fields keep working.
 * Labels go through `t` (the display language's translations; {1} placeholders are filled in).
 * @param {{ appName?: string, isDev?: boolean, available?: Set<string>|null, send: (id: string) => void, t?: (s: string) => string }} opts
 * @returns {object[]} Electron MenuItemConstructorOptions[]
 */
function buildMenuTemplate({ appName = 'Folio Publisher', isDev = false, available = null, send, t = (s) => s }) {
  const L = (s, ...vals) => t(s).replace(/\{(\d+)\}/g, (m, i) => (vals[i - 1] ?? m));
  const cmd = (label, id, accelerator) => {
    if (available && !available.has(id)) return null;
    return { label: t(label), accelerator, id: `cmd:${id}`, click: () => send(id) };
  };
  const clean = (items) => {
    const out = [];
    for (const it of items) {
      if (!it) continue;
      if (it.type === 'separator' && (!out.length || out[out.length - 1].type === 'separator')) continue;
      out.push(it);
    }
    while (out.length && out[out.length - 1].type === 'separator') out.pop();
    return out;
  };
  const sep = { type: 'separator' };
  return [
    {
      label: appName,
      submenu: clean([
        { role: 'about', label: L('About {1}', appName) },
        sep,
        cmd('Settings…', 'app.settings', 'Cmd+,'),
        sep,
        { role: 'services', label: t('Services') },
        sep,
        { role: 'hide', label: L('Hide {1}', appName) },
        { role: 'hideOthers', label: t('Hide Others') },
        { role: 'unhide', label: t('Show All') },
        sep,
        { role: 'quit', label: L('Quit {1}', appName) }
      ])
    },
    {
      label: t('File'),
      submenu: clean([
        cmd('New', 'file.new', 'CmdOrCtrl+N'),
        cmd('Open…', 'file.open', 'CmdOrCtrl+O'),
        { label: t('Open Recent'), role: 'recentDocuments', submenu: [{ label: t('Clear Menu'), role: 'clearRecentDocuments' }] },
        sep,
        cmd('Close', 'file.close', 'CmdOrCtrl+W'),
        cmd('Save', 'file.save', 'CmdOrCtrl+S'),
        cmd('Save As…', 'file.saveAs', 'Shift+CmdOrCtrl+S'),
        sep,
        cmd('Export as PDF…', 'export.pdf', null),
        cmd('Print…', 'file.print', 'CmdOrCtrl+P'),
        sep,
        cmd('Document Properties…', 'file.properties', null),
        cmd('Recover Unsaved Publications…', 'file.recover', null)
      ])
    },
    {
      label: t('Edit'),
      submenu: [
        { role: 'undo', label: t('Undo') },
        { role: 'redo', label: t('Redo') },
        sep,
        { role: 'cut', label: t('Cut') },
        { role: 'copy', label: t('Copy') },
        { role: 'paste', label: t('Paste') },
        { role: 'pasteAndMatchStyle', label: t('Paste and Match Style') },
        { role: 'delete', label: t('Delete') },
        { role: 'selectAll', label: t('Select All') }
      ]
    },
    {
      label: t('View'),
      submenu: clean([
        cmd('Zoom In', 'view.zoomIn', null),
        cmd('Zoom Out', 'view.zoomOut', null),
        cmd('Fit Page', 'view.fitPage', null),
        cmd('Actual Size', 'view.actualSize', null),
        sep,
        isDev ? { role: 'reload' } : null,
        isDev ? { role: 'toggleDevTools' } : null,
        sep,
        { role: 'togglefullscreen', label: t('Toggle Full Screen') }
      ])
    },
    { role: 'windowMenu', label: t('Window') },
    {
      role: 'help', label: t('Help'),
      submenu: clean([
        cmd('Keyboard Shortcuts', 'help.shortcuts', null),
        cmd(L('{1} Help', appName), 'help.show', null)
      ])
    }
  ].filter((m) => !m.submenu || m.submenu.length || m.role);
}

/**
 * Serialised, atomic file writer. Each target path has its own queue; a write goes to a unique
 * temp file (pid + random) that is renamed over the target, and the temp file is removed when
 * anything fails. `coalesce: true` writes replace a queued (not yet started) coalescing write for
 * the same path, so only the newest autosave payload is written.
 * @param {typeof import('node:fs/promises')} [fsApi]
 */
function createWriter(fsApi = fsp) {
  const queues = new Map();   // file -> { tail: Promise, queued: job|null }
  const pending = new Set();

  async function renameWithRetry(from, to) {
    for (let i = 0; ; i++) {
      try { return await fsApi.rename(from, to); } catch (err) {
        // Windows: a scanner or indexer may hold the target briefly.
        if (i >= 4 || !['EPERM', 'EACCES', 'EBUSY'].includes(err.code)) throw err;
        await new Promise((r) => setTimeout(r, 40 * (i + 1)));
      }
    }
  }

  async function writeNow(file, data) {
    await fsApi.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try {
      await fsApi.writeFile(tmp, data);
      await renameWithRetry(tmp, file);
    } catch (err) {
      await fsApi.unlink(tmp).catch(() => {});
      throw err;
    }
  }

  function enqueue(file, op, { coalesce = false, data } = {}) {
    file = path.resolve(file);
    let q = queues.get(file);
    if (!q) queues.set(file, (q = { tail: Promise.resolve(), queued: null }));
    if (coalesce && q.queued && q.queued.coalesce) {
      q.queued.data = data;
      return q.queued.promise;
    }
    const job = { coalesce, data, op };
    job.promise = q.tail.catch(() => {}).then(() => {
      if (q.queued === job) q.queued = null;
      return job.op(file, job.data);
    });
    q.queued = job;
    q.tail = job.promise;
    pending.add(job.promise);
    const done = () => {
      pending.delete(job.promise);
      if (q.tail === job.promise && queues.get(file) === q) queues.delete(file);
    };
    job.promise.then(done, done);
    return job.promise;
  }

  return {
    /** Write `data` (string|Buffer|Uint8Array) to `file` atomically. */
    writeAtomic: (file, data, opts = {}) => enqueue(file, writeNow, { coalesce: !!opts.coalesce, data }),
    /** Delete `file` after any queued writes to it (queued coalescing writes are dropped). */
    removeFile: (file) => {
      const q = queues.get(path.resolve(file));
      if (q && q.queued && q.queued.coalesce) q.queued.op = async () => {};
      return enqueue(file, async (f) => { await fsApi.unlink(f).catch((err) => { if (err.code !== 'ENOENT') throw err; }); });
    },
    /** Number of writes not yet finished. */
    pendingCount: () => pending.size,
    /** Resolve when every queued write has settled. */
    drain: async () => { while (pending.size) await Promise.allSettled([...pending]); }
  };
}

/**
 * Remove leftover temp files (from writes interrupted by a crash) in `dirs`.
 * @returns {Promise<number>} number of files removed
 */
async function cleanStaleTemp(dirs, fsApi = fsp) {
  let n = 0;
  for (const dir of dirs) {
    let names = [];
    try { names = await fsApi.readdir(dir); } catch { continue; }
    for (const name of names) {
      if (!/\.tmp$/i.test(name)) continue;
      try { await fsApi.unlink(path.join(dir, name)); n++; } catch { /* in use or gone */ }
    }
  }
  return n;
}

/**
 * Paths the main process may write without showing a dialog: files the user picked in a native
 * dialog or opened from the OS. Persisted so a restored document still saves silently.
 */
class KnownPaths extends Set {
  constructor(file, writer) {
    super();
    this.file = file;
    this.writer = writer;
    try {
      const list = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(list)) for (const p of list) if (typeof p === 'string') super.add(path.resolve(p));
    } catch { /* first run */ }
  }

  add(p) {
    if (typeof p !== 'string' || !p) return this;
    const abs = path.resolve(p);
    if (super.has(abs)) super.delete(abs);   // keep most recent last
    super.add(abs);
    while (this.size > KNOWN_PATHS_MAX) super.delete(this.values().next().value);
    if (this.file && this.writer) this.writer.writeAtomic(this.file, JSON.stringify([...this]), { coalesce: true }).catch((err) => console.error('known-paths', err));
    return this;
  }

  has(p) { return typeof p === 'string' && super.has(path.resolve(p)); }
}

const safeName = (s, fallback) => (String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]+/g, '').trim().slice(0, 120) || fallback);

module.exports = { buildMenuTemplate, filesFromArgs, createWriter, cleanStaleTemp, KnownPaths, isDocPath, safeName };

// ------------------------------------------------------------------------------------------------
// Electron application
// ------------------------------------------------------------------------------------------------

if (IS_ELECTRON) startApp();

function startApp() {
  const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, screen, shell } = electron;
  const isMac = process.platform === 'darwin';
  // the display language's translations (sent by the renderer as 'app:language')
  let uiStrings = null;
  const tr = (s, ...vals) => String((uiStrings && typeof uiStrings[s] === 'string' && uiStrings[s]) || s).replace(/\{(\d+)\}/g, (m, i) => (vals[i - 1] ?? m));
  const isWin = process.platform === 'win32';
  let uiLang = 'en';
  // loads the catalog for a language tag ('pt-BR' falls back to 'pt'); English needs none
  function loadStrings(code) {
    uiStrings = null;
    uiLang = 'en';
    if (typeof code !== 'string' || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(code)) return;
    for (const c of [code, code.split('-')[0].toLowerCase()]) {
      if (c === 'en') return;
      try { uiStrings = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'i18n', `${c}.json`), 'utf8')); uiLang = c; return; } catch { /* next */ }
    }
  }

  // Tests (and portable setups) may isolate the profile.
  if (process.env.FOLIO_USER_DATA) app.setPath('userData', path.resolve(process.env.FOLIO_USER_DATA));
  app.setAppUserModelId(APP_ID);

  const writer = createWriter();
  const userData = () => app.getPath('userData');
  const installedSerialsPath = () => path.join(userData(), 'installed-serials.dat');
  let knownPaths = null;
  let win = null;
  let rendererReady = false;
  let forceClose = false;
  let quitting = false;
  let closeTimer = null;
  let menuCommands = null;
  let docState = { dirty: false, names: [], title: '', path: null };
  const pendingFiles = [];

  const getKnownPaths = () => (knownPaths ||= new KnownPaths(path.join(userData(), 'known-paths.json'), writer));

  function queueFiles(files) {
    for (const f of files) if (!pendingFiles.includes(f)) pendingFiles.push(f);
    flushPendingFiles();
  }

  function flushPendingFiles() {
    if (!rendererReady || !win || win.isDestroyed()) return;
    while (pendingFiles.length) openInRenderer(pendingFiles.shift());
  }

  async function openInRenderer(file) {
    try {
      const st = await fsp.stat(file);
      if (!st.isFile()) throw new Error('Not a file');
      const text = await fsp.readFile(file, 'utf8');
      const abs = path.resolve(file);
      getKnownPaths().add(abs);   // opened by the user from the OS (argv, Finder, second instance)
      win.webContents.send('file:opened', { path: abs, name: path.basename(abs), text });
    } catch (err) {
      dialog.showErrorBox('Folio Publisher', `Could not open ${path.basename(file)}.\n\n${err.message}`);
    }
  }

  // macOS delivers files through 'open-file' (also before the app is ready).
  app.on('open-file', (e, file) => {
    e.preventDefault();
    if (isDocPath(file)) queueFiles([path.resolve(file)]);
    if (app.isReady() && !win) createWindow();
  });

  // The Windows installer runs `Folio Publisher.exe --write-serial <file>` (build/installer.nsh): make a serial for
  // this computer, accept it from now on, write it to <file> for the user, and exit without opening a window.
  const serialArg = process.argv.indexOf('--write-serial');
  if (serialArg > 0 && process.argv[serialArg + 1]) {
    try {
      const serial = license.makeSerial();
      fs.mkdirSync(userData(), { recursive: true });
      fs.appendFileSync(installedSerialsPath(), license.fingerprint(license.normalize(serial)));
      fs.writeFileSync(path.resolve(process.argv[serialArg + 1]), [
        'Folio Publisher serial number', '', serial, '',
        'Enter this serial number when Folio Publisher asks for it. Keep this file somewhere safe.', ''
      ].join('\r\n'));
    } catch (err) {
      process.exitCode = 1;
      console.error(err);
    }
    app.exit(process.exitCode || 0);
    return;
  }

  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  pendingFiles.push(...filesFromArgs(process.argv, process.cwd()));

  app.on('second-instance', (_e, argv, workingDirectory) => {
    const files = filesFromArgs(argv, workingDirectory || process.cwd());
    if (!win) {
      pendingFiles.push(...files.filter((f) => !pendingFiles.includes(f)));
      if (app.isReady()) createWindow();
      return;
    }
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    queueFiles(files);
  });

  app.on('before-quit', (e) => {
    quitting = true;
    if (writer.pendingCount()) {
      e.preventDefault();
      writer.drain().finally(() => app.quit());
    }
  });

  app.on('window-all-closed', () => {
    if (!isMac || quitting) app.quit();
  });

  app.on('activate', () => { if (!win && !activationWin && app.isReady()) start(); });

  app.whenReady().then(async () => {
    await cleanStaleTemp([userData(), path.join(userData(), 'recovery')]).catch(() => 0);
    getKnownPaths();
    loadStrings(app.getLocale());
    installMenu();
    start();
  });

  // ---------- Serial number ----------
  // The installed app asks for a serial (see desktop/license.js) before it opens; running from source does not.
  const licenseRequired = app.isPackaged || process.env.FOLIO_REQUIRE_LICENSE === '1';
  const licensePath = () => path.join(userData(), 'license.json');
  const serialFile = () => path.join(app.getPath('desktop'), 'Folio Publisher serial number.txt');
  // serials you issue (desktop/serials.dat) and the ones the installer made on this computer
  const fingerprints = () => {
    const read = (p) => { try { return fs.readFileSync(p); } catch { return Buffer.alloc(0); } };
    return license.readFingerprints(Buffer.concat([read(path.join(__dirname, 'serials.dat')), read(installedSerialsPath())]));
  };
  let activationWin = null;
  let activated = false;

  function licensed() {
    if (!licenseRequired) return true;
    try { return license.checkSerial(JSON.parse(fs.readFileSync(licensePath(), 'utf8')).serial, fingerprints()).ok; } catch { return false; }
  }

  function start() {
    if (licensed()) createWindow();
    else showActivation();
  }

  function showActivation() {
    if (activationWin && !activationWin.isDestroyed()) { activationWin.focus(); return; }
    activated = false;
    activationWin = new BrowserWindow({
      width: 520,
      height: 400,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      show: false,
      title: 'Folio Publisher',
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#161a19' : '#f4f0e8',
      icon: isWin || !isMac ? path.join(ROOT, 'app', 'icons', 'icon-512.png') : undefined,
      webPreferences: {
        preload: path.join(__dirname, 'activate-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        devTools: !app.isPackaged
      }
    });
    const w = activationWin;
    w.once('ready-to-show', () => w.show());
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.webContents.on('will-navigate', (e) => e.preventDefault());
    w.on('closed', () => {
      activationWin = null;
      if (!activated && !win) app.quit();
    });
    w.loadFile(path.join(__dirname, 'activate.html'));
  }

  const fromActivation = (e) => activationWin && !activationWin.isDestroyed() && e.sender === activationWin.webContents;

  ipcMain.handle('license:strings', (e) => (fromActivation(e) ? {
    lang: uiStrings ? uiLang : 'en',
    title: tr('Activate Folio Publisher'),
    intro: tr('Enter the serial number you received with your purchase.'),
    hint: fs.existsSync(serialFile()) ? tr('Your serial number is in the file “{1}” on your desktop.', path.basename(serialFile())) : '',
    label: tr('Serial number'),
    activate: tr('Activate'),
    quit: tr('Quit'),
    invalid: tr('That serial number is not valid. Check it and try again.')
  } : {}));

  ipcMain.handle('license:activate', (e, input) => {
    if (!fromActivation(e)) return false;
    const res = license.checkSerial(input, fingerprints());
    if (!res.ok) return false;
    try {
      fs.writeFileSync(licensePath(), JSON.stringify({ serial: res.serial, activated: new Date().toISOString() }));
    } catch (err) {
      dialog.showErrorBox('Folio Publisher', String(err && err.message || err));
      return false;
    }
    activated = true;
    createWindow();
    activationWin.close();
    return true;
  });

  ipcMain.on('license:quit', (e) => { if (fromActivation(e)) app.quit(); });

  function installMenu() {
    if (!isMac) { Menu.setApplicationMenu(null); return; }
    const template = buildMenuTemplate({
      appName: app.name || 'Folio Publisher',
      isDev: !app.isPackaged,
      available: menuCommands,
      send: (id) => { if (win && !win.isDestroyed()) win.webContents.send('menu:command', id); },
      t: tr
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  // ---------- Window state ----------
  const statePath = () => path.join(userData(), 'window-state.json');
  function loadWindowState() {
    try {
      const s = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
      const area = screen.getDisplayMatching(s).workArea;
      const visible = s.x < area.x + area.width - 80 && s.x + s.width > area.x + 80 && s.y >= area.y - 8 && s.y < area.y + area.height - 80;
      return visible ? s : { width: s.width, height: s.height, maximized: s.maximized };
    } catch {
      return {};
    }
  }
  function saveWindowState() {
    if (!win || win.isDestroyed()) return;
    try {
      const b = win.getNormalBounds();
      fs.writeFileSync(statePath(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
    } catch { /* read-only profile */ }
  }

  // ---------- Window ----------
  function createWindow() {
    const st = loadWindowState();
    const chrome = isMac
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 13 } }
      : { titleBarStyle: 'hidden', titleBarOverlay: TITLEBAR };
    rendererReady = false;
    forceClose = false;
    win = new BrowserWindow({
      width: st.width || 1440,
      height: st.height || 900,
      x: st.x,
      y: st.y,
      minWidth: 960,
      minHeight: 620,
      show: false,
      title: 'Folio Publisher',
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#161a19' : '#f4f0e8',
      icon: isWin || !isMac ? path.join(ROOT, 'app', 'icons', 'icon-512.png') : undefined,
      ...chrome,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: true,
        devTools: !app.isPackaged
      }
    });
    if (st.maximized) win.maximize();
    const w = win;

    w.once('ready-to-show', () => w.show());
    w.loadFile(path.join(ROOT, 'app', 'index.html'));

    // Never navigate away from the app; open web links in the default browser.
    w.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    w.webContents.on('will-navigate', (e) => e.preventDefault());

    // Developer tools in unpackaged builds only.
    w.webContents.on('before-input-event', (_e, input) => {
      if (!app.isPackaged && input.type === 'keyDown' && input.key === 'F12') w.webContents.toggleDevTools();
    });

    // Native context menu for text fields (spelling suggestions, clipboard).
    w.webContents.on('context-menu', (_e, p) => {
      if (!p.isEditable && !p.selectionText) return;
      const items = [];
      for (const s of p.dictionarySuggestions || []) {
        items.push({ label: s, click: () => w.webContents.replaceMisspelling(s) });
      }
      if (p.misspelledWord) {
        if (!items.length) items.push({ label: tr('No suggestions'), enabled: false });
        items.push({ label: tr('Add to dictionary'), click: () => w.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
        items.push({ type: 'separator' });
      }
      if (p.isEditable) items.push({ role: 'cut', label: tr('Cut'), enabled: p.editFlags.canCut });
      items.push({ role: 'copy', label: tr('Copy'), enabled: p.editFlags.canCopy });
      if (p.isEditable) items.push({ role: 'paste', label: tr('Paste'), enabled: p.editFlags.canPaste }, { type: 'separator' }, { role: 'selectAll', label: tr('Select All') });
      Menu.buildFromTemplate(items).popup({ window: w });
    });

    // A crashed or killed renderer reloads; the recovery copies bring the work back.
    w.webContents.on('render-process-gone', (_e, details) => {
      if (details.reason === 'clean-exit' || w.isDestroyed()) return;
      rendererReady = false;
      clearTimeout(closeTimer); closeTimer = null;
      if (quitting || forceClose) { forceClose = true; w.close(); return; }
      setTimeout(() => { if (!w.isDestroyed()) w.webContents.reload(); }, 250);
    });
    w.on('unresponsive', async () => {
      const r = await dialog.showMessageBox(w, {
        type: 'warning', buttons: [tr('Wait'), tr('Reload')], defaultId: 0, cancelId: 0,
        title: 'Folio Publisher', message: tr('Folio Publisher is not responding.'),
        detail: tr('Reloading restores your publications from their latest recovery copies.')
      });
      if (r.response === 1 && !w.isDestroyed()) w.webContents.forcefullyCrashRenderer();
    });

    w.on('close', (e) => {
      saveWindowState();
      if (forceClose || !rendererReady || w.webContents.isCrashed()) return;
      // The renderer commits pending edits and runs Save / Don't Save / Cancel for every dirty
      // document (it knows them all), then sends app:close-now.
      e.preventDefault();
      if (closeTimer) return;
      w.webContents.send('app:close-request');
      closeTimer = setTimeout(() => {
        // No answer: the renderer is hung. Recovery copies stay on disk for the next start.
        closeTimer = null;
        forceClose = true;
        if (!w.isDestroyed()) w.close();
      }, CLOSE_ACK_TIMEOUT);
    });
    w.on('closed', () => {
      clearTimeout(closeTimer); closeTimer = null;
      if (win === w) { win = null; rendererReady = false; }
    });
  }

  const fromWin = (e) => win && !win.isDestroyed() && e.sender === win.webContents;

  // ---------- App IPC ----------
  ipcMain.on('app:ready', (e) => {
    if (!fromWin(e)) return;
    rendererReady = true;
    forceClose = false;
    flushPendingFiles();
  });

  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, packaged: app.isPackaged }));

  ipcMain.on('app:theme', (_e, theme) => {
    nativeTheme.themeSource = ['light', 'dark'].includes(theme) ? theme : 'system';
  });

  ipcMain.on('app:titlebar', (_e, colors) => {
    if (!win || isMac || !colors) return;
    const hex = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : null);
    const color = hex(colors.color), symbolColor = hex(colors.symbolColor);
    if (color && symbolColor) {
      try { win.setTitleBarOverlay({ color, symbolColor, height: TITLEBAR.height }); } catch { /* no overlay */ }
    }
  });

  ipcMain.on('app:doc-state', (_e, s) => {
    docState = {
      dirty: !!s?.dirty,
      names: Array.isArray(s?.names) ? s.names.map(String).slice(0, 50) : [],
      title: String(s?.title || ''),
      path: typeof s?.path === 'string' ? s.path : null
    };
    if (!win || win.isDestroyed()) return;
    win.setTitle(docState.title ? `${docState.title} — Folio Publisher` : 'Folio Publisher');
    if (isMac) {
      win.setDocumentEdited(docState.dirty);
      try { win.setRepresentedFilename(docState.path && getKnownPaths().has(docState.path) ? docState.path : ''); } catch { /* ignore */ }
    }
  });

  ipcMain.on('app:language', (_e, code) => {
    loadStrings(code);
    if (isMac) installMenu();
  });

  ipcMain.on('app:menu-commands', (_e, ids) => {
    if (!Array.isArray(ids)) return;
    menuCommands = new Set(ids.filter((x) => typeof x === 'string'));
    if (isMac) installMenu();
  });

  ipcMain.on('app:close-ack', () => {
    // The renderer is handling the request (it may be waiting on the user); stop the hang timer.
    clearTimeout(closeTimer); closeTimer = null;
  });

  ipcMain.on('app:close-cancel', () => {
    clearTimeout(closeTimer); closeTimer = null;
    quitting = false;
  });

  ipcMain.on('app:close-now', () => {
    clearTimeout(closeTimer); closeTimer = null;
    forceClose = true;
    if (win && !win.isDestroyed()) win.close();
  });

  // ---------- File IPC ----------
  const DOC_FILTERS = () => [{ name: tr('Publications'), extensions: ['folio', 'pub'] }, { name: tr('Folio publications'), extensions: ['folio'] }, { name: tr('Microsoft Publisher files'), extensions: ['pub'] }, { name: 'JSON', extensions: ['json'] }, { name: tr('All files'), extensions: ['*'] }];

  async function readDoc(file) {
    const st = await fsp.stat(file);
    if (!st.isFile()) throw new Error('Not a file');
    // Microsoft Publisher files are binary: handed to the renderer's importer as base64
    if (/\.pub$/i.test(file)) return PUB_PREFIX + (await fsp.readFile(file)).toString('base64');
    return fsp.readFile(file, 'utf8');
  }

  ipcMain.handle('file:open', async () => {
    const r = await dialog.showOpenDialog(win, { title: tr('Open publication'), properties: ['openFile'], filters: DOC_FILTERS() });
    if (r.canceled || !r.filePaths[0]) return null;
    const file = path.resolve(r.filePaths[0]);
    const text = await readDoc(file);
    getKnownPaths().add(file);
    app.addRecentDocument(file);
    return { path: file, name: path.basename(file), text };
  });

  // Renderer-supplied paths (recent list, drag and drop) are opened but NOT trusted for silent saves.
  ipcMain.handle('file:open-path', async (_e, wanted) => {
    if (!isDocPath(wanted) || !path.isAbsolute(wanted)) return null;
    const file = path.resolve(wanted);
    let text;
    try { text = await readDoc(file); } catch (err) {
      if (err.code === 'ENOENT' || err.message === 'Not a file') return null;
      throw err;
    }
    return { path: file, name: path.basename(file), text };
  });

  ipcMain.handle('file:save', async (_e, args = {}) => {
    const { path: wanted, suggestedName, saveAs } = args;
    const data = typeof args.text === 'string' ? args.text : args.data;
    if (typeof data !== 'string') throw new Error('Nothing to save');
    const kp = getKnownPaths();
    let file = typeof wanted === 'string' && path.isAbsolute(wanted) && kp.has(wanted) && !saveAs ? path.resolve(wanted) : null;
    if (!file) {
      const r = await dialog.showSaveDialog(win, {
        title: saveAs ? tr('Save publication as') : tr('Save publication'),
        defaultPath: typeof wanted === 'string' && path.isAbsolute(wanted) ? path.resolve(wanted) : path.join(app.getPath('documents'), safeName(suggestedName, 'Publication') + '.folio'),
        filters: [{ name: tr('Folio publication'), extensions: ['folio'] }]
      });
      if (r.canceled || !r.filePath) return null;
      file = path.resolve(r.filePath);
      if (!path.extname(file)) file += '.folio';
    }
    await writer.writeAtomic(file, data);
    kp.add(file);
    app.addRecentDocument(file);
    return { path: file, name: path.basename(file) };
  });

  // ---------- Extra IPC modules (desktop/ipc-*.js) — each exports (ctx) => void ----------
  const ctx = {
    ipcMain, app, dialog, shell, BrowserWindow,
    getWindow: () => win,
    get knownPaths() { return getKnownPaths(); },
    writeAtomic: (file, data, opts) => writer.writeAtomic(file, data, opts),
    removeFile: (file) => writer.removeFile(file),
    userData,
    t: (s, ...vals) => tr(s, ...vals)
  };
  for (const f of fs.readdirSync(__dirname).filter((n) => /^ipc-.+\.js$/.test(n)).sort()) {
    try {
      require(path.join(__dirname, f))(ctx);
    } catch (err) {
      console.error(`Failed to load ${f}:`, err);
    }
  }
}
