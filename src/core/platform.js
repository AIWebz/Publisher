// Platform services: file open/save, binary export, print, recovery storage and small settings.
// Desktop (Electron) goes through window.folioDesktop (preload whitelist); the web build uses the
// File System Access API when available, else <input type=file> and downloads, and IndexedDB
// (database 'folio', stores 'recovery' and 'kv'). See ARCHITECTURE.md ("Platform").

const DOC_TYPES = [{ description: 'Folio publication', accept: { 'application/json': ['.folio', '.json'] } }, { description: 'Microsoft Publisher file', accept: { 'application/x-mspublisher': ['.pub'] } }];
/** A picked file's contents: text, or base64 behind a marker for binary Microsoft Publisher files. */
async function fileContents(file) {
  if (!/\.pub$/i.test(file.name)) return file.text();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return 'folio-import:pub;base64,' + btoa(bin);
}

/** Make a file-name-safe base name. */
export function safeFileName(s, fallback = 'Publication') {
  return String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]+/g, '').trim().slice(0, 120) || fallback;
}

/** Ensure `name` ends with `.ext` (ext without the dot). */
export function withExtension(name, ext) {
  const base = safeFileName(name);
  return new RegExp(`\\.${ext}$`, 'i').test(base) ? base : `${base}.${ext}`;
}

// ------------------------------------------------------------------------------------------------
// IndexedDB (web)
// ------------------------------------------------------------------------------------------------

/**
 * Tiny promise wrapper over one IndexedDB database with the 'recovery' and 'kv' stores.
 * Falls back to an in-memory map when IndexedDB is unavailable (private mode, tests).
 * @param {IDBFactory|null} idb
 */
export function createKV(idb, dbName = 'folio') {
  let dbp = null;
  const mem = { recovery: new Map(), kv: new Map() };
  const open = () => {
    if (!idb) return Promise.resolve(null);
    if (!dbp) {
      dbp = new Promise((resolve) => {
        let req;
        try { req = idb.open(dbName, 1); } catch { resolve(null); return; }
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const s of ['recovery', 'kv']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      });
    }
    return dbp;
  };
  const run = async (store, mode, fn) => {
    const db = await open();
    if (!db) return fn(null, mem[store]);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const os = tx.objectStore(store);
      let result;
      const req = fn(os, null);
      if (req && 'onsuccess' in req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
    });
  };
  return {
    get: (store, key) => run(store, 'readonly', (os, m) => (m ? m.get(key) : os.get(key))),
    set: (store, key, value) => run(store, 'readwrite', (os, m) => (m ? void m.set(key, value) : os.put(value, key))),
    del: (store, key) => run(store, 'readwrite', (os, m) => (m ? void m.delete(key) : os.delete(key))),
    keys: (store) => run(store, 'readonly', (os, m) => (m ? [...m.keys()] : os.getAllKeys()))
  };
}

// ------------------------------------------------------------------------------------------------
// Web helpers
// ------------------------------------------------------------------------------------------------

function toBlob(data, type = 'application/octet-stream') {
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data;
  return new Blob([data], { type });
}

async function toBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof Blob !== 'undefined' && data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  if (typeof data === 'string') return new TextEncoder().encode(data);
  throw new TypeError('Expected Uint8Array, ArrayBuffer, Blob or string');
}

function download(blob, name, env) {
  const doc = env.document;
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function pickFileWithInput(env, accept) {
  return new Promise((resolve) => {
    const doc = env.document;
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    let done = false;
    const finish = (file) => {
      if (done) return;
      done = true;
      input.remove();
      env.removeEventListener('focus', onFocus);
      resolve(file);
    };
    const onFocus = () => setTimeout(() => { if (!input.files || !input.files.length) finish(null); }, 600);
    input.addEventListener('change', () => finish(input.files && input.files[0] ? input.files[0] : null));
    input.addEventListener('cancel', () => finish(null));
    env.addEventListener('focus', onFocus);
    doc.body.appendChild(input);
    input.click();
  });
}

async function ensurePermission(handle, mode) {
  if (!handle || typeof handle.queryPermission !== 'function') return true;
  const opts = { mode };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}

const isAbort = (err) => err && (err.name === 'AbortError' || /aborted|cancel/i.test(err.message || ''));

// ------------------------------------------------------------------------------------------------
// Platform
// ------------------------------------------------------------------------------------------------

/**
 * Create the platform service object for an environment (normally `globalThis`/`window`).
 * @param {any} [env]
 */
export function createPlatform(env = globalThis) {
  const desktop = env && env.folioDesktop && typeof env.folioDesktop.invoke === 'function' ? env.folioDesktop : null;
  const kv = desktop ? null : createKV(env && env.indexedDB ? env.indexedDB : null);
  const printPreparers = new Set();
  const invoke = (ch, ...args) => desktop.invoke(ch, ...args);
  const noHandler = (err) => /No handler registered/i.test(String(err && err.message));
  const navPlatform = env && env.navigator ? String(env.navigator.userAgentData?.platform || env.navigator.platform || '') : '';
  const os = desktop ? String(desktop.platform || 'linux') : 'web';

  const platform = {
    isDesktop: !!desktop,
    os,
    /** True on macOS (desktop or a Mac browser): Cmd shortcuts, traffic-light inset. */
    isMac: desktop ? os === 'darwin' : /mac/i.test(navPlatform),
    /** Whether the File System Access API is available (web): saves go back to the same file. */
    hasFileHandles: !desktop && !!(env && typeof env.showSaveFilePicker === 'function'),

    /** Subscribe to a main → renderer channel (desktop). Returns an unsubscribe function. */
    on(channel, fn) { return desktop ? desktop.on(channel, fn) : () => {}; },
    /** Send a one-way message to the main process (desktop). */
    send(channel, ...args) { if (desktop) desktop.send(channel, ...args); },
    /** Invoke a main-process handler (desktop only). */
    invoke(channel, ...args) {
      if (!desktop) return Promise.reject(new Error('Not available in the web app'));
      return invoke(channel, ...args);
    },
    /** File-system path of a dropped File (desktop), else null. */
    pathForFile(file) { return desktop && desktop.pathForFile ? desktop.pathForFile(file) : null; },
    /** { version, platform } of the desktop app, or null on the web. */
    async info() { return desktop ? invoke('app:info') : null; },

    /**
     * Ask the user for a publication file.
     * @returns {Promise<{ name: string, path?: string, handle?: any, text: string }|null>}
     */
    async openPublication() {
      if (desktop) return invoke('file:open');
      if (typeof env.showOpenFilePicker === 'function') {
        try {
          const [handle] = await env.showOpenFilePicker({ types: DOC_TYPES, excludeAcceptAllOption: false, multiple: false });
          if (!handle) return null;
          const file = await handle.getFile();
          return { name: file.name, handle, text: await fileContents(file) };
        } catch (err) {
          if (isAbort(err)) return null;
          throw err;
        }
      }
      const file = await pickFileWithInput(env, '.folio,.json,.pub,application/json');
      return file ? { name: file.name, text: await fileContents(file) } : null;
    },

    /**
     * Re-open a publication from a recent-files entry ({ path } on desktop, { handle } on the web).
     * @returns {Promise<{ name, path?, handle?, text }|null>} null when the file no longer exists
     */
    async openRecentEntry(entry) {
      if (!entry) return null;
      if (desktop) return entry.path ? invoke('file:open-path', entry.path) : null;
      const handle = entry.handle;
      if (!handle || typeof handle.getFile !== 'function') return null;
      if (!(await ensurePermission(handle, 'read'))) return null;
      try {
        const file = await handle.getFile();
        return { name: file.name, handle, text: await file.text() };
      } catch (err) {
        if (err && err.name === 'NotFoundError') return null;
        throw err;
      }
    },

    /**
     * Read a dropped / picked File object (path recorded on desktop, not trusted for silent save).
     * @param {File} file
     */
    async readFile(file) {
      return { name: file.name, path: platform.pathForFile(file) || undefined, text: await fileContents(file) };
    },

    /**
     * Save publication text. Desktop: silent save to a known path unless saveAs; else a native
     * dialog. Web: write through the remembered file handle, else showSaveFilePicker, else download.
     * @param {{ path?: string|null, handle?: any, text: string, suggestedName?: string, saveAs?: boolean }} opts
     * @returns {Promise<{ name: string, path?: string, handle?: any, downloaded?: boolean }|null>} null when cancelled
     */
    async savePublication({ path, handle, text, suggestedName, saveAs = false }) {
      if (typeof text !== 'string') throw new TypeError('savePublication needs text');
      if (desktop) return invoke('file:save', { path: path || null, text, suggestedName, saveAs });
      const name = withExtension(suggestedName || 'Publication', 'folio');
      if (handle && !saveAs && typeof handle.createWritable === 'function') {
        if (await ensurePermission(handle, 'readwrite')) {
          const w = await handle.createWritable();
          await w.write(text);
          await w.close();
          return { name: handle.name, handle };
        }
      }
      if (typeof env.showSaveFilePicker === 'function') {
        let h;
        try {
          h = await env.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Folio publication', accept: { 'application/json': ['.folio'] } }] });
        } catch (err) {
          if (isAbort(err)) return null;
          throw err;
        }
        const w = await h.createWritable();
        await w.write(text);
        await w.close();
        return { name: h.name, handle: h };
      }
      download(toBlob(text, 'application/json'), name, env);
      return { name, downloaded: true };
    },

    /**
     * Save binary data (PDF, PNG, ZIP…) chosen by the user.
     * @param {{ data: Uint8Array|Blob|ArrayBuffer, suggestedName: string, filters?: { name: string, extensions: string[] }[] }} opts
     * @returns {Promise<{ name: string, path?: string }|null>}
     */
    async saveBinary({ data, suggestedName, filters = [] }) {
      if (desktop) return invoke('export:save-binary', { data: await toBytes(data), suggestedName, filters });
      const ext = filters[0] && filters[0].extensions && filters[0].extensions[0];
      const name = ext ? withExtension(suggestedName, ext) : safeFileName(suggestedName, 'export');
      const blob = toBlob(data);
      if (typeof env.showSaveFilePicker === 'function') {
        let h;
        try {
          const types = filters.filter((f) => f.extensions && f.extensions[0] !== '*').map((f) => ({
            description: f.name, accept: { [blob.type || 'application/octet-stream']: f.extensions.map((e) => `.${e}`) }
          }));
          h = await env.showSaveFilePicker({ suggestedName: name, types: types.length ? types : undefined });
        } catch (err) {
          if (isAbort(err)) return null;
          if (err && err.name === 'TypeError') h = null; else throw err;
        }
        if (h) {
          const w = await h.createWritable();
          await w.write(blob);
          await w.close();
          return { name: h.name };
        }
      }
      download(blob, name, env);
      return { name };
    },

    /**
     * Save several files into a folder the user picks (desktop) — the web build writes into a
     * picked directory when possible, else downloads each file in turn.
     * @param {{ name: string, data: Uint8Array|Blob|string }[]} files
     * @returns {Promise<{ folder: string, count: number }|null>}
     */
    async saveFilesToFolder(files) {
      if (!Array.isArray(files) || !files.length) return null;
      if (desktop) {
        const payload = { files: await Promise.all(files.map(async (f) => ({ name: safeFileName(f.name, 'file'), data: await toBytes(f.data) }))) };
        try {
          return await invoke('export:save-files', payload);
        } catch (err) {
          if (!noHandler(err)) throw err;
          return invoke('export:save-folder', payload);
        }
      }
      if (typeof env.showDirectoryPicker === 'function') {
        let dir;
        try { dir = await env.showDirectoryPicker({ mode: 'readwrite' }); } catch (err) {
          if (isAbort(err)) return null;
          throw err;
        }
        for (const f of files) {
          const fh = await dir.getFileHandle(safeFileName(f.name, 'file'), { create: true });
          const w = await fh.createWritable();
          await w.write(toBlob(f.data));
          await w.close();
        }
        return { folder: dir.name, count: files.length };
      }
      for (const f of files) {
        download(toBlob(f.data), safeFileName(f.name, 'file'), env);
        await new Promise((r) => setTimeout(r, 350));   // browsers drop rapid successive downloads
      }
      return { folder: 'Downloads', count: files.length };
    },

    /**
     * Print #print-root to a PDF file (desktop). The web build opens the browser print dialog
     * (choose "Save as PDF") and resolves { name, path: null, viaPrintDialog: true }.
     * @param {{ widthIn: number, heightIn: number, suggestedName: string, landscape?: boolean }} opts
     */
    async printToPDF({ widthIn, heightIn, suggestedName, landscape = false }) {
      if (desktop) return invoke('export:pdf', { widthIn, heightIn, suggestedName, landscape });
      env.print();
      return { name: withExtension(suggestedName, 'pdf'), path: null, viaPrintDialog: true };
    },

    /**
     * Print #print-root. Desktop shows the system print dialog unless `silent`.
     * @param {{ copies?: number, duplex?: 'simplex'|'longEdge'|'shortEdge', landscape?: boolean, pageRanges?: string, deviceName?: string, silent?: boolean }} [opts]
     * @returns {Promise<boolean>} true when the job was sent; throws on a printer error
     */
    async print(opts = {}) {
      if (desktop) {
        const r = await invoke('print:print', { copies: 1, duplex: 'simplex', landscape: false, silent: false, ...opts });
        if (r && r.ok) return true;
        if (r && r.error && !/cancel/i.test(r.error)) throw new Error(r.error);
        return false;
      }
      env.print();
      return true;
    },

    /** Installed printers (desktop): [{ name, displayName, isDefault }]; [] on the web. */
    async printers() {
      if (!desktop) return [];
      try { return (await invoke('print:printers')) || []; } catch { return []; }
    },

    /**
     * Register a function that fills #print-root when the user prints from the browser menu
     * (web 'beforeprint'). Returns an unregister function.
     */
    onBeforePrint(fn) { printPreparers.add(fn); return () => printPreparers.delete(fn); },
    /** @internal used by persistence to run the registered print preparers. */
    _printPreparers: printPreparers,

    /** Recovery copies (autosave): desktop userData/recovery; web IndexedDB 'recovery'. */
    recovery: desktop ? {
      list: () => invoke('recovery:list'),
      save: (id, text, meta = {}) => invoke('recovery:save', id, text, meta),
      read: (id) => invoke('recovery:read', id),
      remove: (id) => invoke('recovery:remove', id)
    } : {
      async list() {
        const keys = (await kv.keys('recovery')) || [];
        const out = [];
        for (const k of keys) {
          if (typeof k !== 'string' || !k.startsWith('m:')) continue;
          const m = await kv.get('recovery', k);
          if (m) out.push(m);
        }
        return out.sort((a, b) => b.savedAt - a.savedAt);
      },
      async save(id, text, meta = {}) {
        await kv.set('recovery', `t:${id}`, text);
        await kv.set('recovery', `m:${id}`, {
          id, title: String(meta.title || ''), filePath: meta.filePath || null, fileName: meta.fileName || null,
          pages: Number(meta.pages) || 0, instance: meta.instance || null, savedAt: Date.now(), size: text.length
        });
        return true;
      },
      async read(id) { return (await kv.get('recovery', `t:${id}`)) ?? null; },
      async remove(id) {
        await kv.del('recovery', `m:${id}`);
        await kv.del('recovery', `t:${id}`);
        return true;
      }
    },

    /** Small persisted settings (custom templates, preferences that must survive). */
    store: desktop ? {
      get: (key) => invoke('store:get', key),
      set: (key, value) => invoke('store:set', key, value)
    } : {
      async get(key) { return (await kv.get('kv', key)) ?? null; },
      async set(key, value) {
        if (value === undefined || value === null) await kv.del('kv', key);
        else await kv.set('kv', key, value);
        return true;
      }
    },

    /** Recent publications: [{ key, name, title, pages, openedAt, path?, handle?, missing? }]. */
    recent: desktop ? {
      async list() { return ((await invoke('store:recent')) || []).map((r) => ({ ...r, key: r.path })); },
      add: (entry) => (entry && entry.path ? invoke('store:recent-add', entry.path, { title: entry.title, pages: entry.pages }) : Promise.resolve(false)),
      remove: (key) => invoke('store:recent-remove', key),
      clear: () => invoke('store:recent-clear')
    } : {
      async list() { return ((await kv.get('kv', 'recent')) || []).map((r) => ({ ...r, missing: false })); },
      async add(entry) {
        if (!entry || !entry.handle) return false;
        const list = (await kv.get('kv', 'recent')) || [];
        const out = [];
        for (const r of list) {
          let same = false;
          try { same = r.handle && typeof r.handle.isSameEntry === 'function' ? await r.handle.isSameEntry(entry.handle) : r.name === entry.name; } catch { same = false; }
          if (!same) out.push(r);
        }
        const key = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        out.unshift({ key, name: entry.name, title: entry.title || entry.name, pages: entry.pages || 0, openedAt: Date.now(), handle: entry.handle });
        await kv.set('kv', 'recent', out.slice(0, 15));
        return true;
      },
      async remove(key) {
        const list = (await kv.get('kv', 'recent')) || [];
        await kv.set('kv', 'recent', list.filter((r) => r.key !== key));
        return true;
      },
      async clear() { await kv.del('kv', 'recent'); return true; }
    }
  };
  return platform;
}

/** The platform singleton for this window. */
export const platform = createPlatform(typeof window !== 'undefined' ? window : globalThis);
