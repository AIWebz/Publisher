/* Folio Publisher — export & print IPC (PDF via printToPDF, binary files, folders of files, printing).
   Auto-loaded by desktop/main.js. Paths always come from native dialogs; the renderer never names a path. */
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');

const MAX_FILES = 5000;

/** Make a renderer-supplied name safe as a single path component. */
function safeName(name, fallback = 'Untitled') {
  let s = String(name == null ? '' : name).normalize('NFC');
  s = s.split(/[\\/]/).pop();   // never a path, only its last component
  s = s.replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^[. ]+/, '').replace(/[. ]+$/, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(s)) s = `_${s}`;
  if (s.length > 150) {
    const ext = path.extname(s).slice(0, 12);
    s = s.slice(0, 150 - ext.length).trim() + ext;
  }
  return s || fallback;
}

/** Ensure `name` ends with one of `exts` (first is the default). */
function withExt(name, exts) {
  const e = path.extname(name).slice(1).toLowerCase();
  return exts.includes(e) ? name : `${name}.${exts[0]}`;
}

/** First free name in `folder`: 'a.png', 'a (2).png', … also avoiding names in `taken`. */
function uniqueName(folder, name, taken = new Set()) {
  const ext = path.extname(name); const stem = name.slice(0, name.length - ext.length);
  for (let i = 1; i < 100000; i++) {
    const n = i === 1 ? name : `${stem} (${i})${ext}`;
    if (!taken.has(n.toLowerCase()) && !fs.existsSync(path.join(folder, n))) return n;
  }
  throw new Error('No free file name');
}

/** Convert IPC data (Uint8Array, ArrayBuffer, Buffer, string) to a Buffer. */
function toBuffer(data) {
  if (typeof data === 'string') return Buffer.from(data, 'utf8');
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (data && ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  throw new TypeError('File data must be bytes or text');
}

/** Normalise dialog filters from the renderer. */
function cleanFilters(filters, fallbackExt) {
  const out = [];
  for (const f of Array.isArray(filters) ? filters : []) {
    const exts = (Array.isArray(f && f.extensions) ? f.extensions : []).map((e) => String(e).replace(/[^a-z0-9]/gi, '').toLowerCase()).filter(Boolean);
    if (exts.length) out.push({ name: String(f.name || exts[0].toUpperCase()).slice(0, 60), extensions: exts });
  }
  if (!out.length && fallbackExt) out.push({ name: fallbackExt.toUpperCase(), extensions: [fallbackExt] });
  return out;
}

/** Page size for printToPDF / print from inches (with sane bounds). */
function pageSizeIn(widthIn, heightIn, landscape) {
  let w = Number(widthIn); let h = Number(heightIn);
  if (!(w > 0.1 && h > 0.1 && w < 200 && h < 200)) return null;
  if (landscape && w < h) [w, h] = [h, w];
  return { width: w, height: h };
}

/** Options for webContents.print from renderer options. */
function normalizePrintOptions(o = {}) {
  const duplexMode = ['simplex', 'longEdge', 'shortEdge'].includes(o.duplex) ? o.duplex : 'simplex';
  const opts = {
    silent: false,
    printBackground: true,
    copies: Math.min(999, Math.max(1, Math.floor(Number(o.copies) || 1))),
    duplexMode,
    landscape: !!o.landscape,
    margins: { marginType: 'none' },
    color: o.color !== false
  };
  if (Array.isArray(o.pageRanges)) {
    const r = o.pageRanges.filter((x) => x && Number.isInteger(x.from) && Number.isInteger(x.to) && x.from >= 0 && x.to >= x.from)
      .map((x) => ({ from: x.from, to: x.to }));
    if (r.length) opts.pageRanges = r;
  }
  if (typeof o.deviceName === 'string' && o.deviceName) opts.deviceName = o.deviceName;
  const size = pageSizeIn(o.widthIn, o.heightIn, false);
  if (size) opts.pageSize = { width: Math.round(size.width * 25400), height: Math.round(size.height * 25400) }; // microns
  return opts;
}

function pdfOptions(o, size) {
  return {
    printBackground: true,
    preferCSSPageSize: true,
    landscape: false,   // size is already oriented
    pageSize: size || 'Letter',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    displayHeaderFooter: false,
    generateDocumentOutline: false
  };
}

module.exports = function registerExportIpc({ ipcMain, app, dialog, shell, BrowserWindow, getWindow, writeAtomic, t = (s) => s }) {
  const written = new Set();   // files and folders this module wrote — the only ones it will reveal
  const batches = new Map();   // batchId -> { folder, names, sender, size, done: [] }

  const write = async (file, buf) => {
    if (typeof writeAtomic === 'function') await writeAtomic(file, buf);
    else {
      const tmp = `${file}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, buf);
      await fsp.rename(tmp, file);
    }
    written.add(path.resolve(file));
  };

  const windowOf = (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w) throw new Error('Export requests must come from an application window');
    const main = typeof getWindow === 'function' ? getWindow() : null;
    if (main && !main.isDestroyed() && w !== main && w.getParentWindow() !== main) throw new Error('Export request from an unknown window');
    return w;
  };

  const defaultDir = () => {
    try { return app.getPath('documents'); } catch { return app.getPath('home'); }
  };

  const saveDialog = async (win, title, suggestedName, filters) => {
    const exts = filters[0].extensions;
    const name = withExt(safeName(suggestedName, 'Untitled'), exts);
    const r = await dialog.showSaveDialog(win, { title: t(title), defaultPath: path.join(defaultDir(), name), filters: filters.map((f) => ({ ...f, name: t(f.name) })) });
    if (r.canceled || !r.filePath) return null;
    return r.filePath;
  };

  const chooseFolder = async (win, title) => {
    const r = await dialog.showOpenDialog(win, { title: t(title), defaultPath: defaultDir(), properties: ['openDirectory', 'createDirectory', 'promptToCreate'] });
    if (r.canceled || !r.filePaths || !r.filePaths[0]) return null;
    const folder = r.filePaths[0];
    await fsp.mkdir(folder, { recursive: true });
    return folder;
  };

  // PDF of the calling window (#print-root via print CSS), then a Save dialog.
  ipcMain.handle('export:pdf', async (e, o = {}) => {
    const win = windowOf(e);
    const size = pageSizeIn(o.widthIn, o.heightIn, o.landscape);
    const pdf = await e.sender.printToPDF(pdfOptions(o, size));
    const file = await saveDialog(win, 'Export as PDF', o.suggestedName || 'Publication.pdf', [{ name: 'PDF document', extensions: ['pdf'] }]);
    if (!file) return null;
    await write(file, pdf);
    return { name: path.basename(file), path: file };
  });

  // One PDF per merge record into one chosen folder:
  //   begin { files:[{name}], widthIn, heightIn } -> folder dialog -> { batchId, folder } | null
  //   print { batchId, index }                     -> printToPDF of the current #print-root -> { name, path }
  //   end   { batchId, cancel? }                   -> { folder, count } | null
  ipcMain.handle('export:pdf-batch', async (e, o = {}) => {
    const win = windowOf(e);
    if (o.action === 'begin') {
      const list = Array.isArray(o.files) ? o.files.slice(0, MAX_FILES) : [];
      if (!list.length) throw new Error('No files to export');
      const folder = await chooseFolder(win, 'Choose a folder for the PDF files');
      if (!folder) return null;
      const taken = new Set();
      const names = list.map((f) => {
        const n = uniqueName(folder, withExt(safeName(f && f.name, 'Publication'), ['pdf']), taken);
        taken.add(n.toLowerCase());
        return n;
      });
      const batchId = crypto.randomUUID();
      batches.set(batchId, { folder, names, sender: e.sender.id, size: pageSizeIn(o.widthIn, o.heightIn, o.landscape), count: 0 });
      return { batchId, folder };
    }
    const b = batches.get(o.batchId);
    if (!b || b.sender !== e.sender.id) throw new Error('Unknown export batch');
    if (o.action === 'print') {
      const i = Number(o.index);
      if (!Number.isInteger(i) || i < 0 || i >= b.names.length) throw new Error('Bad batch index');
      const pdf = await e.sender.printToPDF(pdfOptions(o, b.size));
      const file = path.join(b.folder, b.names[i]);
      await write(file, pdf);
      b.count++;
      return { name: b.names[i], path: file };
    }
    if (o.action === 'end') {
      batches.delete(o.batchId);
      if (b.count) written.add(path.resolve(b.folder));
      return o.cancel ? null : { folder: b.folder, count: b.count };
    }
    throw new Error('Unknown batch action');
  });

  ipcMain.handle('export:save-binary', async (e, o = {}) => {
    const win = windowOf(e);
    const buf = toBuffer(o.data);
    const ext = path.extname(String(o.suggestedName || '')).slice(1).toLowerCase() || 'bin';
    const filters = cleanFilters(o.filters, ext);
    const file = await saveDialog(win, o.title ? String(o.title).slice(0, 80) : 'Export', o.suggestedName || `Untitled.${ext}`, filters);
    if (!file) return null;
    await write(file, buf);
    return { name: path.basename(file), path: file };
  });

  const saveFiles = async (e, o = {}) => {
    const win = windowOf(e);
    const files = Array.isArray(o) ? o : (Array.isArray(o.files) ? o.files : []);
    if (!files.length) throw new Error('No files to save');
    if (files.length > MAX_FILES) throw new Error('Too many files');
    const bufs = files.map((f) => ({ name: safeName(f && f.name, 'file'), buf: toBuffer(f && f.data) }));
    const folder = await chooseFolder(win, o.title ? String(o.title).slice(0, 80) : 'Choose a folder');
    if (!folder) return null;
    const taken = new Set();
    const paths = [];
    for (const f of bufs) {
      const n = uniqueName(folder, f.name, taken);
      taken.add(n.toLowerCase());
      const file = path.join(folder, n);
      if (path.dirname(path.resolve(file)) !== path.resolve(folder)) throw new Error('Invalid file name');
      await write(file, f.buf);
      paths.push(file);
    }
    written.add(path.resolve(folder));
    return { folder, count: paths.length, paths };
  };
  ipcMain.handle('export:save-files', saveFiles);
  ipcMain.handle('export:save-folder', saveFiles);   // ARCHITECTURE.md name for the same channel

  ipcMain.handle('export:reveal', (e, p) => {
    windowOf(e);
    if (typeof p !== 'string' || !p) return false;
    const abs = path.resolve(p);
    if (!written.has(abs) || !fs.existsSync(abs)) return false;
    shell.showItemInFolder(abs);
    return true;
  });

  ipcMain.handle('print:print', (e, o = {}) => {
    windowOf(e);
    const opts = normalizePrintOptions(o);
    return new Promise((resolve) => {
      try {
        e.sender.print(opts, (ok, reason) => resolve({ ok: !!ok, error: ok ? null : (reason || 'cancelled') }));
      } catch (err) {
        resolve({ ok: false, error: err.message });
      }
    });
  });

  ipcMain.handle('print:printers', async (e) => {
    windowOf(e);
    const list = await e.sender.getPrintersAsync();
    return list.map((p) => ({
      name: p.name, displayName: p.displayName || p.name, description: p.description || '',
      isDefault: !!p.isDefault, status: p.status ?? 0, options: p.options || {}
    }));
  });
};

// Pure helpers, exposed for unit tests.
module.exports.safeName = safeName;
module.exports.uniqueName = uniqueName;
module.exports.withExt = withExt;
module.exports.toBuffer = toBuffer;
module.exports.cleanFilters = cleanFilters;
module.exports.pageSizeIn = pageSizeIn;
module.exports.normalizePrintOptions = normalizePrintOptions;
