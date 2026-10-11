import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../src/core/app.js';
import { createDocument, createElement, serialize } from '../../src/core/model.js';
import { RecoveryManager } from '../../src/core/persistence/recovery.js';
import { FilesController, samePath } from '../../src/core/persistence/files.js';
import { serializeForSave } from '../../src/core/persistence/format.js';

function fakePlatform() {
  const disk = new Map();
  const recovery = new Map();
  const recent = [];
  const p = {
    disk, recMap: recovery, recentArr: recent, saveCalls: [], nextSavePath: '/docs/new.folio', saveGate: null, openResult: null,
    async openPublication() { return p.openResult; },
    async openRecentEntry(e) { return disk.has(e.path) ? { path: e.path, name: e.path.split('/').pop(), text: disk.get(e.path) } : null; },
    async savePublication(args) {
      p.saveCalls.push(args);
      if (p.saveGate) await p.saveGate;
      const path = args.path && !args.saveAs ? args.path : p.nextSavePath;
      if (!path) return null;
      disk.set(path, args.text);
      return { path, name: path.split('/').pop() };
    },
    recovery: {
      async list() { return [...recovery.values()].map((r) => ({ id: r.id, ...r.meta, savedAt: 1 })); },
      async save(id, text, meta) { recovery.set(id, { id, text, meta }); },
      async read(id) { return recovery.has(id) ? recovery.get(id).text : null; },
      async remove(id) { recovery.delete(id); }
    },
    recent: {
      async list() { return recent.map((r) => ({ ...r, key: r.path })); },
      async add(e) { const i = recent.findIndex((r) => r.path === e.path); if (i >= 0) recent.splice(i, 1); recent.unshift({ path: e.path, title: e.title, name: e.name }); },
      async remove(key) { const i = recent.findIndex((r) => r.path === key); if (i >= 0) recent.splice(i, 1); },
      async clear() { recent.length = 0; }
    }
  };
  return p;
}

function setup() {
  const app = new App();
  const platform = fakePlatform();
  const answers = [];
  const dialogs = [];
  app.ui = {
    toast: () => {},
    alert: async (title, html) => { dialogs.push({ title, html }); },
    confirm: async (title) => { dialogs.push({ title }); return answers.length ? answers.shift() === 'ok' : true; },
    dialog: async (opts) => { dialogs.push(opts); const a = answers.shift(); return a == null ? null : { button: a, values: {} }; }
  };
  const recovery = new RecoveryManager({ storage: platform.recovery, delay: 5, setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (t) => clearTimeout(t) });
  app.on('doc-change', ({ session }) => recovery.schedule(session));
  const files = new FilesController({ app, platform, recovery });
  app.files = files;
  return { app, platform, files, answers, dialogs, recovery };
}

const addShape = (app, x = 10) => app.transact('Insert', (doc) => { doc.pages[0].elements.push(createElement('shape', { x })); });

test('save writes the pruned document, binds the file and clears dirty; reopen is identical', async () => {
  const { app, platform, files } = setup();
  const s = app.newDocument({ title: 'Flyer' });
  addShape(app);
  assert.equal(s.dirty, true);
  assert.equal(await files.save(), true);
  assert.equal(s.dirty, false);
  assert.equal(s.filePath, '/docs/new.folio');
  assert.equal(platform.saveCalls[0].saveAs, true, 'first save asks where');
  assert.equal(platform.disk.get('/docs/new.folio'), serializeForSave(s.doc));
  // reopen: already open -> focuses the same tab
  const again = await files.openText(platform.disk.get('/docs/new.folio'), { path: '/docs/new.folio' });
  assert.equal(again, s);
  // open a copy under another path -> new tab, identical serialisation
  const copy = await files.openText(platform.disk.get('/docs/new.folio'), { path: '/docs/copy.folio' });
  assert.notEqual(copy, s);
  assert.equal(serialize(copy.doc), platform.disk.get('/docs/new.folio'));
  assert.equal(app.sessions.length, 2);
  // second save goes to the same path without saveAs
  addShape(app, 20);
  app.activate(s);
  addShape(app, 30);
  await files.save(s);
  assert.equal(platform.saveCalls.at(-1).saveAs, false);
  assert.equal(platform.saveCalls.at(-1).path, '/docs/new.folio');
  assert.deepEqual(platform.recentArr.map((r) => r.path), ['/docs/new.folio', '/docs/copy.folio']);
});

test('edits made while a save is in flight keep the document dirty', async () => {
  const { app, platform, files } = setup();
  const s = app.newDocument();
  addShape(app);
  let release;
  platform.saveGate = new Promise((r) => { release = r; });
  const p = files.save(s);
  await new Promise((r) => setTimeout(r, 5));
  addShape(app, 50);
  release();
  assert.equal(await p, true);
  assert.equal(s.dirty, true, 'the in-flight edit is not marked saved');
  assert.equal(JSON.parse(platform.disk.get('/docs/new.folio')).pages[0].elements.length, 1);
});

test('save flushes in-progress edits before taking the snapshot', async () => {
  const { app, platform, files } = setup();
  app.newDocument();
  let pending = true;
  app.addFlusher(() => { if (pending) { pending = false; addShape(app, 77); } });
  await files.save();
  assert.equal(JSON.parse(platform.disk.get('/docs/new.folio')).pages[0].elements[0].x, 77);
  assert.equal(app.session.dirty, false);
});

test('cancelled save dialog leaves the document dirty and unbound', async () => {
  const { app, platform, files } = setup();
  const s = app.newDocument();
  addShape(app);
  platform.nextSavePath = null;
  assert.equal(await files.save(), false);
  assert.equal(s.dirty, true);
  assert.equal(s.filePath, null);
});

test('Save As always asks and rebinds the session', async () => {
  const { app, platform, files } = setup();
  const s = app.newDocument();
  addShape(app);
  await files.save();
  platform.nextSavePath = '/docs/other.folio';
  await files.saveAs();
  assert.equal(platform.saveCalls.at(-1).saveAs, true);
  assert.equal(s.filePath, '/docs/other.folio');
  assert.equal(s.fileName, 'other.folio');
});

test('open replaces an untouched blank tab but not an edited one', async () => {
  const { app, files } = setup();
  const blank = app.newDocument();
  const text = serializeForSave(createDocument({ title: 'A' }));
  const a = await files.openText(text, { path: '/a.folio' });
  assert.ok(!app.sessions.includes(blank));
  assert.deepEqual(app.sessions, [a]);
  const edited = app.newDocument();
  addShape(app);
  const b = await files.openText(serializeForSave(createDocument({ title: 'B' })), { path: '/b.folio' });
  assert.ok(app.sessions.includes(edited));
  assert.equal(app.session, b);
  assert.equal(app.sessions.length, 3);
});

test('invalid and newer files show an error dialog and open nothing', async () => {
  const { app, files, dialogs } = setup();
  app.newDocument();
  assert.equal(await files.openText('{oops', { path: '/bad.folio' }), null);
  assert.equal(await files.openText(JSON.stringify({ ...createDocument(), version: 7 }), { path: '/new.folio' }), null);
  assert.equal(app.sessions.length, 1);
  assert.equal(dialogs.length, 2);
  assert.match(dialogs[1].title, /Newer/);
});

test('close: Cancel keeps the tab, Don\'t Save closes and removes the recovery copy, Save saves first', async () => {
  const { app, platform, files, answers, recovery } = setup();
  const s = app.newDocument();
  addShape(app);
  await recovery.flushNow(s);
  assert.ok(platform.recMap.has(s.id));
  answers.push(null);
  assert.equal(await files.close(s), false);
  assert.ok(app.sessions.includes(s));
  answers.push('discard');
  assert.equal(await files.close(s), true);
  assert.ok(!app.sessions.includes(s));
  assert.ok(!platform.recMap.has(s.id));
  const t = app.newDocument();
  addShape(app);
  answers.push('save');
  assert.equal(await files.close(t), true);
  assert.ok(platform.disk.has('/docs/new.folio'));
  // clean documents close without asking
  const u = app.newDocument();
  assert.equal(await files.close(u), true);
});

test('prepareQuit asks for every dirty document and stops on Cancel', async () => {
  const { app, files, answers, dialogs } = setup();
  const a = app.newDocument(); addShape(app);
  const b = app.newDocument(); addShape(app);
  app.newDocument();
  answers.push('discard', null);
  assert.equal(await files.prepareQuit(), false);
  assert.equal(dialogs.length, 2);
  assert.equal(app.sessions.length, 3, 'tabs stay open during the quit flow');
  answers.push('discard', 'discard');
  files.recovery.enabled = true;
  assert.equal(await files.prepareQuit(), true);
  assert.ok(a.dirty && b.dirty);
});

test('recovery: restore keeps the copy id, marks dirty and keeps the original path', async () => {
  const { app, platform, files } = setup();
  const doc = createDocument({ title: 'Lost work' });
  doc.pages[0].elements.push(createElement('shape', { x: 5 }));
  platform.recMap.set('ses_old', { id: 'ses_old', text: serialize(doc), meta: { title: 'Lost work', filePath: '/docs/lost.folio', pages: 1 } });
  const list = await files.recoverable();
  assert.equal(list.length, 1);
  const s = await files.restore(list[0]);
  assert.equal(s.id, 'ses_old');
  assert.equal(s.dirty, true);
  assert.equal(s.filePath, '/docs/lost.folio');
  assert.equal(serialize(s.doc), serialize(doc));
  assert.equal((await files.recoverable()).length, 0, 'open documents are not offered again');
});

test('recent: open from list, missing files are offered for removal', async () => {
  const { app, platform, files, answers } = setup();
  platform.disk.set('/docs/r.folio', serializeForSave(createDocument({ title: 'R' })));
  platform.recentArr.push({ path: '/docs/r.folio', title: 'R' }, { path: '/docs/gone.folio', title: 'Gone' });
  const s = await files.openRecent({ path: '/docs/r.folio' });
  assert.equal(s.doc.title, 'R');
  answers.push('ok');
  assert.equal(await files.openRecent({ path: '/docs/gone.folio', key: '/docs/gone.folio', title: 'Gone' }), null);
  assert.deepEqual(platform.recentArr.map((r) => r.path), ['/docs/r.folio']);
  assert.equal(app.sessions.length, 1);
});

test('samePath compares Windows paths case-insensitively', () => {
  assert.ok(samePath('C:\\Docs\\A.folio', 'c:/docs/a.folio'));
  assert.ok(!samePath('/a/B.folio', '/a/b.folio'));
});
