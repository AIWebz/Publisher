import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../src/core/app.js';
import { createElement } from '../../src/core/model.js';
import { RecoveryManager, recoverableEntries } from '../../src/core/persistence/recovery.js';

function fakeTimers() {
  let t = 0, seq = 0;
  const timers = new Map();
  return {
    set: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: t + ms }); return id; },
    clear: (id) => timers.delete(id),
    async advance(ms) {
      t += ms;
      for (const [id, tm] of [...timers]) if (tm.at <= t) { timers.delete(id); tm.fn(); }
      for (let i = 0; i < 10; i++) await Promise.resolve();
      await new Promise((r) => setImmediate(r));
    },
    get count() { return timers.size; }
  };
}

function memStorage({ delay = 0 } = {}) {
  const saved = new Map();
  const log = [];
  return {
    saved, log,
    async save(id, text, meta) { log.push(['save', id]); if (delay) await new Promise((r) => setTimeout(r, delay)); saved.set(id, { text, meta }); },
    async remove(id) { log.push(['remove', id]); saved.delete(id); }
  };
}

function setup(opts = {}) {
  const app = new App();
  const s = app.newDocument();
  const timers = fakeTimers();
  const storage = memStorage(opts);
  const rm = new RecoveryManager({ storage, delay: 3000, setTimer: timers.set, clearTimer: timers.clear, instance: 'i1' });
  app.on('doc-change', ({ session }) => rm.schedule(session));
  const edit = (x) => app.transact('Move', (doc) => {
    if (!doc.pages[0].elements.length) doc.pages[0].elements.push(createElement('shape', { id: 'r1' }));
    doc.pages[0].elements[0].x = x;
  });
  return { app, s, timers, storage, rm, edit };
}

test('a recovery copy is written ~3 s after changes, and bursts coalesce into one write', async () => {
  const { s, timers, storage, rm, edit } = setup();
  edit(1); edit(2); edit(3);
  assert.equal(storage.saved.size, 0);
  await timers.advance(2999);
  assert.equal(storage.saved.size, 0);
  await timers.advance(1);
  assert.equal(rm.writes, 1);
  const copy = storage.saved.get(s.id);
  assert.ok(copy);
  assert.equal(JSON.parse(copy.text).pages[0].elements[0].x, 3);
  assert.equal(copy.meta.pages, 1);
  assert.equal(copy.meta.instance, 'i1');
  assert.ok(copy.meta.title);
});

test('no write when nothing changed since the last copy', async () => {
  const { s, timers, rm, edit } = setup();
  edit(5);
  await timers.advance(3000);
  assert.equal(rm.writes, 1);
  rm.schedule(s);
  await timers.advance(3000);
  assert.equal(rm.writes, 1, 'unchanged content is not rewritten');
  edit(6);
  await timers.advance(3000);
  assert.equal(rm.writes, 2);
});

test('a change during an in-flight write is written afterwards (latest content wins)', async () => {
  const { s, storage, rm, edit } = setup({ delay: 30 });
  edit(1);
  const p = rm.flushNow(s);
  edit(2);
  rm._run(rm.states.get(s.id));   // schedule fires while the first write is in flight
  await p;
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(JSON.parse(storage.saved.get(s.id).text).pages[0].elements[0].x, 2);
  assert.equal(rm.writes, 2);
});

test('the copy is removed on save (clean) and on discard, and undo back to clean removes it', async () => {
  const { app, s, timers, storage, rm, edit } = setup();
  edit(1);
  await timers.advance(3000);
  assert.ok(storage.saved.has(s.id));
  app.undo();
  assert.equal(s.dirty, false);
  await timers.advance(3000);
  assert.ok(!storage.saved.has(s.id), 'clean again -> copy removed');
  edit(2);
  await timers.advance(3000);
  assert.ok(storage.saved.has(s.id));
  s.markSaved(s.contentHash());
  await rm.saved(s);
  assert.ok(!storage.saved.has(s.id));
  edit(3);
  await rm.discard(s);
  await timers.advance(5000);
  assert.ok(!storage.saved.has(s.id), 'discarded sessions are not written again');
  assert.equal(timers.count, 0);
});

test('recoverableEntries skips open documents and live instances', () => {
  const entries = [{ id: 'a', instance: 'i1' }, { id: 'b', instance: 'i2' }, { id: 'c', instance: 'i3' }, { id: 'd' }];
  const out = recoverableEntries(entries, { openIds: new Set(['a']), instance: 'i1', isAlive: (i) => i === 'i2' });
  assert.deepEqual(out.map((e) => e.id), ['c', 'd']);
});
