/* Folio Publisher — Electron main process (Windows desktop shell) */
'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, screen, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const APP_ID = 'com.folio.publisher';
const ROOT = path.join(__dirname, '..');
const DOC_EXT = /\.(folio|json)$/i;
const TITLEBAR = { color: '#1b3b38', symbolColor: '#f3ecdc', height: 48 };

let win = null;
let rendererReady = false;
let pendingFile = fileFromArgs(process.argv);
let docState = { dirty: false, name: '' };
let forceClose = false;
let lastExport = null;
const knownPaths = new Set();   // paths the user picked or opened — the only ones we write without a dialog

app.setAppUserModelId(APP_ID);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const f = fileFromArgs(argv);
    if (f) openInRenderer(f);
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}

function fileFromArgs(argv) {
  return argv.slice(1).find((a) => DOC_EXT.test(a) && !a.startsWith('-') && fs.existsSync(a)) || null;
}

// ---------- Window state ----------
const statePath = () => path.join(app.getPath('userData'), 'window-state.json');
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
  } catch {}
}

// ---------- Window ----------
function createWindow() {
  const st = loadWindowState();
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
    icon: path.join(ROOT, 'icons', 'icon-512.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: TITLEBAR,
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

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(ROOT, 'index.html'));

  // Never navigate away from the app; open web links in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  // Developer tools in unpackaged builds only.
  win.webContents.on('before-input-event', (_e, input) => {
    if (!app.isPackaged && input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });

  // Native context menu for text fields (spelling suggestions, clipboard).
  win.webContents.on('context-menu', (_e, p) => {
    if (!p.isEditable && !p.selectionText) return;
    const items = [];
    for (const s of p.dictionarySuggestions || []) {
      items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) });
    }
    if (p.misspelledWord) {
      if (!items.length) items.push({ label: 'No suggestions', enabled: false });
      items.push({ label: 'Add to dictionary', click: () => win.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
      items.push({ type: 'separator' });
    }
    if (p.isEditable) items.push({ role: 'cut', enabled: p.editFlags.canCut });
    items.push({ role: 'copy', enabled: p.editFlags.canCopy });
    if (p.isEditable) items.push({ role: 'paste', enabled: p.editFlags.canPaste }, { type: 'separator' }, { role: 'selectAll' });
    Menu.buildFromTemplate(items).popup({ window: win });
  });

  win.on('close', async (e) => {
    saveWindowState();
    if (forceClose || !docState.dirty) return;
    e.preventDefault();
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Save', 'Don’t Save', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: 'Folio Publisher',
      message: `Do you want to save changes to “${docState.name || 'your publication'}”?`,
      detail: 'Folio keeps your latest work automatically, but the file on disk will not include these changes unless you save.'
    });
    if (response === 0) win.webContents.send('app:save-and-close');
    else if (response === 1) { forceClose = true; win.close(); }
  });
  win.on('closed', () => { win = null; });
}

async function openInRenderer(file) {
  if (!rendererReady || !win) { pendingFile = file; return; }
  try {
    const text = await fsp.readFile(file, 'utf8');
    knownPaths.add(path.resolve(file));
    win.webContents.send('file:opened', { path: path.resolve(file), name: path.basename(file), text });
  } catch (err) {
    dialog.showErrorBox('Folio Publisher', `Could not open ${path.basename(file)}.\n\n${err.message}`);
  }
}

async function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, file);
}

const safeName = (s, fallback) => (String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]+/g, '').trim().slice(0, 120) || fallback);

// ---------- IPC ----------
ipcMain.on('app:ready', () => {
  rendererReady = true;
  if (pendingFile) { const f = pendingFile; pendingFile = null; openInRenderer(f); }
});

ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }));

ipcMain.on('app:theme', (_e, theme) => {
  nativeTheme.themeSource = ['light', 'dark'].includes(theme) ? theme : 'system';
});

ipcMain.on('doc:state', (_e, s) => {
  docState = { dirty: !!s?.dirty, name: String(s?.name || '') };
});

ipcMain.on('app:close-now', () => {
  forceClose = true;
  win?.close();
});

ipcMain.handle('file:open', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open publication',
    properties: ['openFile'],
    filters: [{ name: 'Folio publications', extensions: ['folio'] }, { name: 'JSON', extensions: ['json'] }, { name: 'All files', extensions: ['*'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const file = path.resolve(r.filePaths[0]);
  const text = await fsp.readFile(file, 'utf8');
  knownPaths.add(file);
  return { path: file, name: path.basename(file), text };
});

ipcMain.handle('file:open-path', async (_e, wanted) => {
  if (typeof wanted !== 'string' || !DOC_EXT.test(wanted)) return null;
  const file = path.resolve(wanted);
  const text = await fsp.readFile(file, 'utf8');
  knownPaths.add(file);
  return { path: file, name: path.basename(file), text };
});

ipcMain.handle('file:save', async (_e, { path: wanted, data, suggestedName, saveAs } = {}) => {
  if (typeof data !== 'string') throw new Error('Nothing to save');
  let file = wanted && knownPaths.has(path.resolve(wanted)) && !saveAs ? path.resolve(wanted) : null;
  if (!file) {
    const r = await dialog.showSaveDialog(win, {
      title: saveAs ? 'Save publication as' : 'Save publication',
      defaultPath: wanted ? path.resolve(wanted) : path.join(app.getPath('documents'), safeName(suggestedName, 'Publication') + '.folio'),
      filters: [{ name: 'Folio publication', extensions: ['folio'] }]
    });
    if (r.canceled || !r.filePath) return null;
    file = path.resolve(r.filePath);
  }
  await writeAtomic(file, data);
  knownPaths.add(file);
  app.addRecentDocument(file);
  return { path: file, name: path.basename(file) };
});

ipcMain.handle('file:export-pdf', async (_e, { suggestedName, width, height } = {}) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Export as PDF',
    defaultPath: path.join(app.getPath('documents'), safeName(suggestedName, 'Publication') + '.pdf'),
    filters: [{ name: 'PDF document', extensions: ['pdf'] }]
  });
  if (r.canceled || !r.filePath) return null;
  const pdf = await win.webContents.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
    pageSize: { width: (+width || 816) / 96, height: (+height || 1056) / 96 },
    margins: { top: 0, bottom: 0, left: 0, right: 0 }
  });
  await writeAtomic(r.filePath, pdf);
  lastExport = r.filePath;
  return { path: r.filePath, name: path.basename(r.filePath) };
});

ipcMain.handle('file:show-export', () => { if (lastExport) shell.showItemInFolder(lastExport); });

// Autosave lives in the user profile, so large publications with pictures are kept too.
const autosavePath = () => path.join(app.getPath('userData'), 'autosave.folio.json');
ipcMain.handle('autosave:load', async () => {
  try { return await fsp.readFile(autosavePath(), 'utf8'); } catch { return null; }
});
ipcMain.handle('autosave:save', async (_e, data) => {
  if (typeof data !== 'string') return false;
  await writeAtomic(autosavePath(), data);
  return true;
});
