import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../../src/core/app.js';
import { registry } from '../../src/core/registry.js';
import { createElement } from '../../src/core/model.js';

function setup() {
  const app = new App();
  const s = app.newDocument({ size: 'letter' });
  return { app, s };
}

test('transact records one labelled step, marks dirty and emits doc-change', () => {
  const { app, s } = setup();
  const events = [];
  app.on('doc-change', (e) => events.push(e.label));
  assert.equal(s.dirty, false);
  app.transact('Insert Shape', (doc) => { doc.pages[0].elements.push(createElement('shape', { id: 'r1', x: 10, y: 10 })); });
  assert.deepEqual(events, ['Insert Shape']);
  assert.equal(s.dirty, true);
  assert.equal(s.history.undoLabel, 'Insert Shape');
  assert.equal(app.doc.pages[0].elements.length, 1);
});

test('no-op transactions do not create history', () => {
  const { app, s } = setup();
  app.transact('Nothing', () => {});
  assert.equal(s.history.canUndo, false);
});

test('undo/redo restore the document, selection and dirty state', () => {
  const { app, s } = setup();
  app.transact('Insert', (doc) => { doc.pages[0].elements.push(createElement('shape', { id: 'r1', x: 10 })); });
  app.select('r1');
  app.transact('Move', (doc) => { doc.pages[0].elements[0].x = 50; });
  assert.equal(app.selection[0].x, 50);
  app.undo();
  assert.equal(app.doc.pages[0].elements[0].x, 10);
  assert.deepEqual(app.selectionIds, ['r1']);
  app.undo();
  assert.equal(app.doc.pages[0].elements.length, 0);
  assert.deepEqual(app.selectionIds, []);
  assert.equal(s.dirty, false, 'back to the saved state');
  app.redo();
  app.redo();
  assert.equal(app.doc.pages[0].elements[0].x, 50);
  assert.equal(s.dirty, true);
});

test('a throwing transaction leaves the document untouched', () => {
  const { app, s } = setup();
  assert.throws(() => app.transact('Bad', (doc) => { doc.pages[0].elements.push(createElement('shape')); throw new Error('boom'); }), /boom/);
  assert.equal(app.doc.pages[0].elements.length, 0);
  assert.equal(s.history.canUndo, false);
});

test('a gesture with many previews is one undo step; cancel reverts', () => {
  const { app, s } = setup();
  app.transact('Insert', (doc) => { doc.pages[0].elements.push(createElement('shape', { id: 'r1', x: 0 })); });
  let previews = 0;
  app.on('preview', () => previews++);
  app.beginGesture('Move');
  for (let i = 1; i <= 10; i++) { app.doc.pages[0].elements[0].x = i * 5; app.preview(['r1']); }
  assert.equal(previews, 10);
  assert.equal(app.endGesture(true), true);
  assert.equal(s.history.undoStack.length, 2);
  assert.equal(s.history.undoLabel, 'Move');
  app.beginGesture('Resize');
  app.doc.pages[0].elements[0].w = 999;
  app.endGesture(false);
  assert.equal(app.doc.pages[0].elements[0].w, 100);
  assert.equal(s.history.undoStack.length, 2);
  app.undo();
  assert.equal(app.doc.pages[0].elements[0].x, 0);
});

test('saving marks clean; edits made after the hash was taken stay dirty', () => {
  const { app, s } = setup();
  app.transact('A', (doc) => { doc.title = 'One'; });
  const hash = s.contentHash();
  app.transact('B', (doc) => { doc.title = 'Two'; });   // happens while the save is in flight
  s.markSaved(hash);
  assert.equal(s.dirty, true);
  s.markSaved(s.contentHash());
  assert.equal(s.dirty, false);
});

test('sessions keep separate history and selection', () => {
  const app = new App();
  const a = app.newDocument();
  app.transact('In A', (doc) => { doc.pages[0].elements.push(createElement('shape', { id: 'a1' })); });
  app.select('a1');
  const b = app.newDocument();
  assert.equal(app.session, b);
  assert.deepEqual(app.selectionIds, []);
  assert.equal(b.history.canUndo, false);
  app.activate(a);
  assert.deepEqual(app.selectionIds, ['a1']);
  app.removeSession(a);
  assert.equal(app.session, b);
  assert.equal(app.sessions.length, 1);
});

test('typing-style coalescing makes one step', () => {
  const { app, s } = setup();
  for (const t of ['a', 'ab', 'abc']) app.transact('Typing', (doc) => { doc.title = t; }, { coalesce: 'session:edit1' });
  assert.equal(s.history.undoStack.length, 1);
  app.undo();
  assert.equal(app.doc.title, 'Untitled publication');
});

test('exec runs registered commands with ctx and respects enabled()', () => {
  const app = new App();
  let ran = null;
  registry.command({ id: 'test.cmd', label: 'Test', run: (ctx, arg) => { ran = [ctx.doc, arg]; }, enabled: (ctx) => !!ctx.doc });
  registry.command({ id: 'test.global', label: 'G', global: true, run: () => 'ok' });
  assert.equal(app.isEnabled('test.cmd'), false, 'no document open');
  assert.equal(app.exec('test.global'), 'ok');
  app.newDocument();
  app.exec('test.cmd', 7);
  assert.equal(ran[0], app.doc);
  assert.equal(ran[1], 7);
});

test('master mode switches the editing surface', () => {
  const { app } = setup();
  assert.equal(app.page, app.doc.pages[0]);
  app.setMasterMode(true);
  assert.equal(app.page, app.doc.masters[0]);
  assert.equal(app.ctx().master, app.doc.masters[0]);
  app.setMasterMode(false);
  assert.equal(app.page, app.doc.pages[0]);
});

test('selection drops ids that no longer exist after a change', () => {
  const { app } = setup();
  app.transact('Insert', (doc) => { doc.pages[0].elements.push(createElement('shape', { id: 'x1' })); });
  app.select(['x1', 'nope']);
  assert.deepEqual(app.selectionIds, ['x1']);
  let sel = null;
  app.on('selection', (els) => { sel = els; });
  app.transact('Delete', (doc) => { doc.pages[0].elements.length = 0; });
  assert.deepEqual(sel, []);
});
