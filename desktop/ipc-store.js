/* Folio Publisher — small persisted settings (userData/settings.json) and the recent-files list
   (userData/recent.json). Channels: store:get, store:set, store:recent, store:recent-add,
   store:recent-remove, store:recent-clear. */
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const RECENT_MAX = 15;
const KEY = /^[A-Za-z0-9_.:-]{1,120}$/;
const DOC_EXT = /\.(folio|json)$/i;
const MAX_SETTINGS_BYTES = 32 * 1024 * 1024;

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

/**
 * Settings and recent-files store bound to a directory (exported for tests).
 * @param {() => string} dirFn
 * @param {{ writeAtomic: Function }} io
 * @param {{ onRecentAdd?: (p: string) => void, onRecentClear?: () => void }} [hooks]
 */
function createStore(dirFn, io, hooks = {}) {
  let settings = null, recent = null;
  const settingsFile = () => path.join(dirFn(), 'settings.json');
  const recentFile = () => path.join(dirFn(), 'recent.json');
  const loadSettings = () => (settings ||= (() => { const s = readJSON(settingsFile(), {}); return s && typeof s === 'object' && !Array.isArray(s) ? s : {}; })());
  const loadRecent = () => (recent ||= (() => { const r = readJSON(recentFile(), []); return Array.isArray(r) ? r.filter((x) => x && typeof x.path === 'string') : []; })());
  const persistRecent = () => io.writeAtomic(recentFile(), JSON.stringify(recent), { coalesce: true });

  return {
    get(key) {
      if (!KEY.test(String(key))) throw new Error('Invalid key');
      const v = loadSettings()[key];
      return v === undefined ? null : v;
    },
    async set(key, value) {
      if (!KEY.test(String(key))) throw new Error('Invalid key');
      const s = loadSettings();
      if (value === undefined || value === null) delete s[key];
      else s[key] = JSON.parse(JSON.stringify(value));
      const text = JSON.stringify(s);
      if (text.length > MAX_SETTINGS_BYTES) { delete s[key]; throw new Error('Settings too large'); }
      await io.writeAtomic(settingsFile(), text, { coalesce: true });
      return true;
    },
    async recent() {
      const list = loadRecent();
      return Promise.all(list.map(async (r) => {
        let missing = false;
        try { missing = !(await fsp.stat(r.path)).isFile(); } catch { missing = true; }
        return { ...r, missing };
      }));
    },
    async recentAdd(p, meta = {}) {
      if (typeof p !== 'string' || !path.isAbsolute(p) || !DOC_EXT.test(p)) return false;
      const abs = path.resolve(p);
      const list = loadRecent().filter((r) => r.path !== abs);
      list.unshift({
        path: abs, name: path.basename(abs), title: String(meta.title || '').slice(0, 300) || path.basename(abs).replace(DOC_EXT, ''),
        pages: Number(meta.pages) || 0, openedAt: Date.now()
      });
      recent = list.slice(0, RECENT_MAX);
      if (hooks.onRecentAdd) hooks.onRecentAdd(abs);
      await persistRecent();
      return true;
    },
    async recentRemove(p) {
      const abs = typeof p === 'string' ? path.resolve(p) : '';
      recent = loadRecent().filter((r) => r.path !== abs);
      await persistRecent();
      return true;
    },
    async recentClear() {
      recent = [];
      if (hooks.onRecentClear) hooks.onRecentClear();
      await persistRecent();
      return true;
    }
  };
}

module.exports = (ctx) => {
  const store = createStore(() => (ctx.userData ? ctx.userData() : ctx.app.getPath('userData')), ctx, {
    onRecentAdd: (p) => { try { ctx.app.addRecentDocument(p); } catch { /* unsupported */ } },
    onRecentClear: () => { try { ctx.app.clearRecentDocuments(); } catch { /* unsupported */ } }
  });
  ctx.ipcMain.handle('store:get', (_e, key) => store.get(key));
  ctx.ipcMain.handle('store:set', (_e, key, value) => store.set(key, value));
  ctx.ipcMain.handle('store:recent', () => store.recent());
  ctx.ipcMain.handle('store:recent-add', (_e, p, meta) => store.recentAdd(p, meta));
  ctx.ipcMain.handle('store:recent-remove', (_e, p) => store.recentRemove(p));
  ctx.ipcMain.handle('store:recent-clear', () => store.recentClear());
};
module.exports.createStore = createStore;
