import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const main = require('../../desktop/main.js');
const { createRecoveryStore } = require('../../desktop/ipc-recovery.js');
const { createStore } = require('../../desktop/ipc-store.js');

const tmp = () => mkdtemp(path.join(tmpdir(), 'folio-test-'));

test('writeAtomic writes atomically, serialises per path and leaves no temp files', async () => {
  const dir = await tmp();
  const w = main.createWriter();
  const f = path.join(dir, 'a.folio');
  await Promise.all([w.writeAtomic(f, 'one'), w.writeAtomic(f, 'two'), w.writeAtomic(f, 'three')]);
  assert.equal(await readFile(f, 'utf8'), 'three');
  assert.deepEqual(await readdir(dir), ['a.folio']);
  assert.equal(w.pendingCount(), 0);
  await rm(dir, { recursive: true });
});

test('coalesced writes only write the newest queued payload', async () => {
  const dir = await tmp();
  const writes = [];
  const fsApi = { ...require('node:fs/promises') };
  const realWrite = fsApi.writeFile;
  fsApi.writeFile = async (file, data) => { writes.push(String(data)); await new Promise((r) => setTimeout(r, 20)); return realWrite(file, data); };
  const w = main.createWriter(fsApi);
  const f = path.join(dir, 'r.folio');
  const p1 = w.writeAtomic(f, 'v1', { coalesce: true });
  await new Promise((r) => setTimeout(r, 5));   // v1 is being written now
  const p2 = w.writeAtomic(f, 'v2', { coalesce: true });
  const p3 = w.writeAtomic(f, 'v3', { coalesce: true });
  await Promise.all([p1, p2, p3]);
  await w.drain();
  assert.deepEqual(writes, ['v1', 'v3'], 'v2 was replaced by v3 while queued');
  assert.equal(await readFile(f, 'utf8'), 'v3');
  await rm(dir, { recursive: true });
});

test('a failed write removes its temp file and rejects', async () => {
  const dir = await tmp();
  const fsApi = { ...require('node:fs/promises'), rename: async () => { const e = new Error('disk full'); e.code = 'ENOSPC'; throw e; } };
  const w = main.createWriter(fsApi);
  await assert.rejects(w.writeAtomic(path.join(dir, 'x.folio'), 'data'), /disk full/);
  assert.deepEqual(await readdir(dir), []);
  await rm(dir, { recursive: true });
});

test('removeFile drops a queued coalescing write and deletes the file', async () => {
  const dir = await tmp();
  const w = main.createWriter();
  const f = path.join(dir, 'c.folio');
  await w.writeAtomic(f, 'x');
  w.writeAtomic(f, 'y', { coalesce: true });
  w.writeAtomic(f, 'z', { coalesce: true });
  await w.removeFile(f);
  await w.drain();
  assert.deepEqual(await readdir(dir), []);
  await rm(dir, { recursive: true });
});

test('cleanStaleTemp removes leftover .tmp files only', async () => {
  const dir = await tmp();
  await writeFile(path.join(dir, 'settings.json.123.ab12.tmp'), 'x');
  await writeFile(path.join(dir, 'settings.json'), '{}');
  assert.equal(await main.cleanStaleTemp([dir, path.join(dir, 'missing')]), 1);
  assert.deepEqual(await readdir(dir), ['settings.json']);
  await rm(dir, { recursive: true });
});

test('filesFromArgs resolves relative paths against the working directory and filters', () => {
  // build platform-native absolute paths (POSIX on macOS/Linux, drive letters on Windows)
  const work = path.resolve('/work'), abs = path.resolve('/abs/b.json');
  const a = path.join(work, 'a.folio'), c = path.join(work, 'c.folio');
  const exists = new Set([a, abs, c]);
  const isFile = (p) => exists.has(p);
  const out = main.filesFromArgs(['/app/folio', '--flag', 'a.folio', abs, 'notes.txt', 'missing.folio', 'a.folio'], work, isFile);
  assert.deepEqual(out, [a, abs]);
  assert.deepEqual(main.filesFromArgs(['/app/folio', 'c.folio'], work, isFile), [c]);
});

test('KnownPaths persists across instances and ignores non-strings', async () => {
  const dir = await tmp();
  const w = main.createWriter();
  const file = path.join(dir, 'known-paths.json');
  const k = new main.KnownPaths(file, w);
  k.add(path.join(dir, 'x', '..', 'doc.folio'));
  k.add(null);
  await w.drain();
  const k2 = new main.KnownPaths(file, w);
  assert.ok(k2.has(path.join(dir, 'doc.folio')));
  assert.equal(k2.size, 1);
  await rm(dir, { recursive: true });
});

test('macOS menu template: roles for Edit, commands forwarded, unknown commands hidden', () => {
  const sent = [];
  const tpl = main.buildMenuTemplate({ appName: 'Folio Publisher', available: new Set(['file.new', 'file.open', 'file.save', 'file.saveAs', 'file.close']), send: (id) => sent.push(id) });
  assert.deepEqual(tpl.map((m) => m.label || m.role), ['Folio Publisher', 'File', 'Edit', 'View', 'Window', 'Help']);
  assert.deepEqual(tpl.slice(-2).map((m) => m.role), ['windowMenu', 'help']);
  // labels follow the display language
  const de = main.buildMenuTemplate({ send: () => {}, t: (s) => ({ File: 'Datei', Save: 'Speichern', 'About {1}': 'Über {1}' }[s] || s) });
  assert.equal(de[1].label, 'Datei');
  assert.ok(de[1].submenu.some((i) => i.label === 'Speichern'));
  assert.equal(de[0].submenu[0].label, 'Über Folio Publisher');
  const edit = tpl.find((m) => m.label === 'Edit').submenu.map((i) => i.role).filter(Boolean);
  for (const r of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']) assert.ok(edit.includes(r), r);
  const file = tpl.find((m) => m.label === 'File').submenu;
  const save = file.find((i) => i.label === 'Save');
  assert.equal(save.accelerator, 'CmdOrCtrl+S');
  save.click();
  file.find((i) => i.label === 'Save As…').click();
  assert.deepEqual(sent, ['file.save', 'file.saveAs']);
  assert.ok(!file.some((i) => i.label === 'Document Properties…'), 'unregistered command hidden');
  assert.notEqual(file.at(-1).type, 'separator');
  const all = main.buildMenuTemplate({ send: () => {} });
  assert.ok(all.find((m) => m.label === 'File').submenu.some((i) => i.label === 'Document Properties…'));
  assert.ok(all[0].submenu.some((i) => i.role === 'quit'));
});

test('recovery store: save, list (title, time, pages, size), read, remove; ids validated', async () => {
  const dir = await tmp();
  const w = main.createWriter();
  const store = createRecoveryStore(() => dir, w);
  await store.save('ses_1', '{"a":1}', { title: 'Flyer', pages: 3, filePath: '/x/flyer.folio' });
  await store.save('ses_2', '{"b":2}', { title: 'Card', pages: 1 });
  const list = await store.list();
  assert.equal(list.length, 2);
  const one = list.find((e) => e.id === 'ses_1');
  assert.equal(one.title, 'Flyer');
  assert.equal(one.pages, 3);
  assert.equal(one.filePath, '/x/flyer.folio');
  assert.equal(one.size, 7);
  assert.ok(one.savedAt > 0);
  assert.equal(await store.read('ses_2'), '{"b":2}');
  await store.remove('ses_1');
  assert.deepEqual((await store.list()).map((e) => e.id), ['ses_2']);
  assert.equal(await store.read('ses_1'), null);
  await assert.rejects(store.save('../evil', 'x'), /Invalid recovery id/);
  await rm(dir, { recursive: true });
});

test('settings and recent list: persisted, newest first, de-duplicated, missing files flagged', async () => {
  const dir = await tmp();
  const w = main.createWriter();
  const added = [];
  const store = createStore(() => dir, w, { onRecentAdd: (p) => added.push(p) });
  await store.set('templates.custom', [{ id: 't1' }]);
  assert.deepEqual(store.get('templates.custom'), [{ id: 't1' }]);
  assert.equal(store.get('nope'), null);
  assert.throws(() => store.get('bad key!'), /Invalid key/);
  const a = path.join(dir, 'a.folio'), b = path.join(dir, 'b.folio');
  await writeFile(a, '{}');
  await store.recentAdd(a, { title: 'A', pages: 2 });
  await store.recentAdd(b, { title: 'B' });
  await store.recentAdd(a, { title: 'A2', pages: 2 });
  assert.equal(await store.recentAdd('relative.folio'), false);
  assert.equal(await store.recentAdd(path.join(dir, 'x.txt')), false);
  let list = await store.recent();
  assert.deepEqual(list.map((r) => [r.title, r.missing]), [['A2', false], ['B', true]]);
  await store.recentRemove(b);
  await w.drain();
  const reloaded = createStore(() => dir, w);
  list = await reloaded.recent();
  assert.deepEqual(list.map((r) => r.path), [a]);
  assert.deepEqual(reloaded.get('templates.custom'), [{ id: 't1' }]);
  assert.deepEqual(added, [a, b, a]);
  await rm(dir, { recursive: true });
});
