/* Folio Publisher — recovery copies (autosave) in the user profile: userData/recovery/<id>.folio
   plus <id>.meta.json. Channels: recovery:list, recovery:save, recovery:read, recovery:remove. */
'use strict';

const path = require('node:path');
const fsp = require('node:fs/promises');

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_BYTES = 512 * 1024 * 1024;

/**
 * Recovery store bound to a directory (exported for tests).
 * @param {() => string} dirFn directory getter
 * @param {{ writeAtomic: Function, removeFile: Function }} io
 */
function createRecoveryStore(dirFn, io) {
  const file = (id, ext) => {
    if (!ID.test(String(id))) throw new Error('Invalid recovery id');
    return path.join(dirFn(), `${id}${ext}`);
  };
  return {
    async list() {
      let names = [];
      try { names = await fsp.readdir(dirFn()); } catch { return []; }
      const out = [];
      for (const n of names) {
        const m = /^(.+)\.meta\.json$/.exec(n);
        if (!m || !ID.test(m[1])) continue;
        try {
          const meta = JSON.parse(await fsp.readFile(path.join(dirFn(), n), 'utf8'));
          const st = await fsp.stat(file(m[1], '.folio'));
          out.push({
            id: m[1], title: String(meta.title || 'Untitled publication'), filePath: typeof meta.filePath === 'string' ? meta.filePath : null,
            fileName: typeof meta.fileName === 'string' ? meta.fileName : null, pages: Number(meta.pages) || 0,
            savedAt: Number(meta.savedAt) || st.mtimeMs, size: st.size
          });
        } catch { /* incomplete pair: skip */ }
      }
      return out.sort((a, b) => b.savedAt - a.savedAt);
    },
    async save(id, text, meta = {}) {
      if (typeof text !== 'string') throw new Error('Nothing to save');
      if (text.length > MAX_BYTES) throw new Error('Recovery copy too large');
      const m = {
        title: String(meta.title || '').slice(0, 300), filePath: typeof meta.filePath === 'string' ? meta.filePath : null,
        fileName: typeof meta.fileName === 'string' ? meta.fileName : null, pages: Number(meta.pages) || 0, savedAt: Date.now()
      };
      await io.writeAtomic(file(id, '.folio'), text, { coalesce: true });
      await io.writeAtomic(file(id, '.meta.json'), JSON.stringify(m), { coalesce: true });
      return true;
    },
    async read(id) {
      try { return await fsp.readFile(file(id, '.folio'), 'utf8'); } catch { return null; }
    },
    async remove(id) {
      await io.removeFile(file(id, '.meta.json'));
      await io.removeFile(file(id, '.folio'));
      return true;
    }
  };
}

module.exports = (ctx) => {
  const store = createRecoveryStore(() => path.join(ctx.userData ? ctx.userData() : ctx.app.getPath('userData'), 'recovery'), ctx);
  ctx.ipcMain.handle('recovery:list', () => store.list());
  ctx.ipcMain.handle('recovery:save', (_e, id, text, meta) => store.save(id, text, meta));
  ctx.ipcMain.handle('recovery:read', (_e, id) => store.read(id));
  ctx.ipcMain.handle('recovery:remove', (_e, id) => store.remove(id));
};
module.exports.createRecoveryStore = createRecoveryStore;
