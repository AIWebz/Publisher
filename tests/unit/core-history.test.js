import { test } from 'node:test';
import assert from 'node:assert/strict';
import { History, snapshotDoc, restoreSnapshot, HISTORY_DEPTH } from '../../src/core/history.js';
import { createDocument } from '../../src/core/model.js';

const step = (label, before, after, extra = {}) => ({ label, before, after, ...extra });

test('undo/redo move steps between stacks and expose labels', () => {
  const h = new History();
  h.push(step('Move', 'a', 'b'));
  h.push(step('Resize', 'b', 'c'));
  assert.equal(h.undoLabel, 'Resize');
  assert.equal(h.canRedo, false);
  const s = h.undo();
  assert.equal(s.label, 'Resize');
  assert.equal(s.before, 'b');
  assert.equal(h.undoLabel, 'Move');
  assert.equal(h.redoLabel, 'Resize');
  assert.equal(h.redo().after, 'c');
  assert.equal(h.canRedo, false);
});

test('a new step clears the redo stack', () => {
  const h = new History();
  h.push(step('A', '0', '1'));
  h.undo();
  h.push(step('B', '0', '2'));
  assert.equal(h.canRedo, false);
  assert.equal(h.undoLabel, 'B');
});

test('depth is capped (default 200)', () => {
  assert.equal(HISTORY_DEPTH, 200);
  const h = new History({ depth: 5 });
  for (let i = 0; i < 12; i++) h.push(step(`S${i}`, String(i), String(i + 1)));
  assert.equal(h.undoStack.length, 5);
  assert.equal(h.undoStack[0].label, 'S7');
});

test('coalescing merges steps with the same key inside the window', () => {
  let now = 1000;
  const h = new History({ now: () => now, window: 1000 });
  h.push(step('Typing', 'a', 'b', { coalesce: 'type:1' }));
  now += 500;
  h.push(step('Typing', 'b', 'c', { coalesce: 'type:1' }));
  assert.equal(h.undoStack.length, 1);
  assert.equal(h.undoStack[0].before, 'a');
  assert.equal(h.undoStack[0].after, 'c');
  now += 5000;
  h.push(step('Typing', 'c', 'd', { coalesce: 'type:1' }));
  assert.equal(h.undoStack.length, 2, 'outside the window a new step starts');
});

test('session: keys never time out; seal() and undo stop coalescing', () => {
  let now = 0;
  const h = new History({ now: () => now, window: 10 });
  h.push(step('Edit text', 'a', 'b', { coalesce: 'session:e1' }));
  now = 100000;
  h.push(step('Edit text', 'b', 'c', { coalesce: 'session:e1' }));
  assert.equal(h.undoStack.length, 1);
  h.seal();
  h.push(step('Edit text', 'c', 'd', { coalesce: 'session:e1' }));
  assert.equal(h.undoStack.length, 2);
});

test('coalesced steps that return to the start are dropped', () => {
  const h = new History();
  h.push(step('Nudge', 'a', 'b', { coalesce: 'nudge' }));
  h.push(step('Nudge', 'b', 'a', { coalesce: 'nudge' }));
  assert.equal(h.canUndo, false);
});

test('snapshots exclude assets and restore re-attaches them', () => {
  const doc = createDocument();
  doc.assets.a1 = { id: 'a1', data: 'data:image/png;base64,AAAA', name: 'x', mime: 'image/png', width: 1, height: 1 };
  const snap = snapshotDoc(doc);
  assert.ok(!snap.includes('base64'));
  const back = restoreSnapshot(snap, doc.assets);
  assert.equal(back.assets, doc.assets);
  assert.deepEqual(back.pages, doc.pages);
});
