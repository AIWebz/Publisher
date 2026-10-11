/* Folio Publisher — custom templates stored in the user profile:
   userData/templates/<id>.folio-template.json (one JSON TemplateRecord per file, see
   src/engines/templates/custom.js). Channels: templates:list, templates:save, templates:update,
   templates:delete. */
'use strict';

const path = require('node:path');
const fsp = require('node:fs/promises');

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const EXT = '.folio-template.json';
const FORMAT = 'folio-template';
const MAX_BYTES = 256 * 1024 * 1024;

function parseRecord(text) {
  let rec;
  try { rec = JSON.parse(text); } catch { return null; }
  if (!rec || typeof rec !== 'object' || rec.format !== FORMAT || !ID.test(String(rec.id)) || !rec.doc || typeof rec.doc !== 'object') return null;
  return rec;
}

/**
 * Template store bound to a directory (exported for tests).
 * @param {() => string} dirFn directory getter
 * @param {{ writeAtomic: Function, removeFile: Function }} io
 */
function createTemplateStore(dirFn, io) {
  const file = (id) => {
    if (!ID.test(String(id))) throw new Error('Invalid template id');
    return path.join(dirFn(), `${id}${EXT}`);
  };
  const read = async (id) => {
    try { return parseRecord(await fsp.readFile(file(id), 'utf8')); } catch { return null; }
  };
  return {
    /** All stored templates (full records), newest first. */
    async list() {
      let names = [];
      try { names = await fsp.readdir(dirFn()); } catch { return []; }
      const out = [];
      for (const n of names) {
        if (!n.endsWith(EXT)) continue;
        const rec = await read(n.slice(0, -EXT.length));
        if (rec) out.push(rec);
      }
      return out.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
    },
    /** Write a record given as JSON text. Resolves { id, path }. */
    async save(text) {
      if (typeof text !== 'string') throw new Error('Nothing to save');
      if (text.length > MAX_BYTES) throw new Error('Template too large');
      const rec = parseRecord(text);
      if (!rec) throw new Error('Not a Folio template');
      const f = file(rec.id);
      await io.writeAtomic(f, text);
      return { id: rec.id, path: f };
    },
    /** Change name / category / description. Resolves the updated record or null. */
    async update(id, patch = {}) {
      const rec = await read(id);
      if (!rec) return null;
      for (const k of ['name', 'category', 'description']) {
        if (typeof patch[k] === 'string') rec[k] = patch[k].slice(0, k === 'description' ? 600 : 120);
      }
      if (typeof patch.name === 'string' && rec.doc) rec.doc.title = rec.name;
      rec.updatedAt = Date.now();
      await io.writeAtomic(file(id), JSON.stringify(rec));
      return rec;
    },
    async remove(id) {
      await io.removeFile(file(id));
      return true;
    }
  };
}

module.exports = (ctx) => {
  const store = createTemplateStore(() => path.join(ctx.userData ? ctx.userData() : ctx.app.getPath('userData'), 'templates'), ctx);
  ctx.ipcMain.handle('templates:list', () => store.list());
  ctx.ipcMain.handle('templates:save', (_e, text) => store.save(text));
  ctx.ipcMain.handle('templates:update', (_e, id, patch) => store.update(id, patch));
  ctx.ipcMain.handle('templates:delete', (_e, id) => store.remove(id));
};
module.exports.createTemplateStore = createTemplateStore;
