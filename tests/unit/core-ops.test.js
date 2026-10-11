import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupElements, ungroupElement, reorderElements, alignElements, distributeElements, deleteElements, topLevelOf } from '../../src/core/ops.js';
import { createDocument, createElement, createTextFrame, findElement } from '../../src/core/model.js';

function docWith(n) {
  const doc = createDocument();
  for (let i = 0; i < n; i++) doc.pages[0].elements.push(createElement('shape', { id: `s${i}`, x: i * 100, y: i * 10, w: 50, h: 50 }));
  return doc;
}
const ids = (doc) => doc.pages[0].elements.map((e) => e.id);

test('group keeps the z-position of the topmost member and union bounds', () => {
  const doc = docWith(4);
  const g = groupElements(doc, ['s0', 's2']);
  assert.deepEqual(ids(doc), ['s1', g.id, 's3']);
  assert.deepEqual([g.x, g.y, g.w, g.h], [0, 0, 250, 70]);
  assert.deepEqual(g.children.map((c) => c.id), ['s0', 's2']);
  assert.equal(topLevelOf(doc, 's2').id, g.id);
});

test('group needs two elements in the same list', () => {
  const doc = docWith(2);
  assert.equal(groupElements(doc, ['s0']), null);
});

test('ungroup restores children in place', () => {
  const doc = docWith(3);
  const g = groupElements(doc, ['s0', 's1']);
  const kids = ungroupElement(doc, g.id);
  assert.deepEqual(kids, ['s0', 's1']);
  assert.deepEqual(ids(doc), ['s0', 's1', 's2']);
});

test('z-order: front, back, forward, backward', () => {
  const doc = docWith(4);
  reorderElements(doc, ['s1'], 'front');
  assert.deepEqual(ids(doc), ['s0', 's2', 's3', 's1']);
  reorderElements(doc, ['s1'], 'back');
  assert.deepEqual(ids(doc), ['s1', 's0', 's2', 's3']);
  reorderElements(doc, ['s1'], 'forward');
  assert.deepEqual(ids(doc), ['s0', 's1', 's2', 's3']);
  reorderElements(doc, ['s2', 's3'], 'backward');
  assert.deepEqual(ids(doc), ['s0', 's2', 's3', 's1']);
  assert.equal(reorderElements(doc, ['s0'], 'back'), false, 'already at the back');
});

test('align to a reference box (rotation-aware bounds)', () => {
  const doc = docWith(3);
  const els = doc.pages[0].elements;
  alignElements(els, 'left', { x: 10, y: 0, w: 500, h: 500 });
  assert.deepEqual(els.map((e) => e.x), [10, 10, 10]);
  alignElements(els, 'middle', { x: 0, y: 0, w: 500, h: 500 });
  assert.deepEqual(els.map((e) => e.y), [225, 225, 225]);
  const r = createElement('shape', { x: 0, y: 0, w: 100, h: 20, rot: 90 });
  alignElements([r], 'left', { x: 0, y: 0, w: 10, h: 10 });
  assert.equal(r.x, -40, 'the rotated box’s visual left edge sits on x = 0');
});

test('distribute equalises gaps and keeps the ends', () => {
  const doc = createDocument();
  const els = [0, 30, 300].map((x, i) => createElement('shape', { id: `d${i}`, x, y: 0, w: 20, h: 20 }));
  assert.equal(distributeElements(els, 'h'), true);
  assert.deepEqual(els.map((e) => e.x), [0, 150, 300]);
  assert.equal(distributeElements(els.slice(0, 2), 'h'), false);
});

test('delete relinks text chains and dissolves single-child groups', () => {
  const doc = createDocument();
  const a = createTextFrame(doc, { id: 'ta' }, '<p>Hello</p>');
  const b = createElement('text', { id: 'tb', storyId: a.storyId });
  const c = createElement('text', { id: 'tc', storyId: a.storyId });
  a.next = 'tb'; b.next = 'tc';
  const s = createElement('shape', { id: 'sx' });
  doc.pages[0].elements.push(a, b, c, s);
  const g = groupElements(doc, ['tc', 'sx']);
  assert.equal(deleteElements(doc, ['tb']), 1);
  assert.equal(findElement(doc, 'ta').el.next, 'tc');
  deleteElements(doc, ['sx']);
  assert.equal(findElement(doc, g.id), null, 'group with one child dissolved');
  assert.ok(doc.pages[0].elements.some((e) => e.id === 'tc'));
});
