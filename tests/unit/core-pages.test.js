import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertPages, duplicatePage, deletePages, movePage, addMaster, duplicateMaster, deleteMaster, applyMaster, spreads, spreadOf, nextMasterName } from '../../src/core/pages.js';
import { createDocument, createElement, createTextFrame } from '../../src/core/model.js';

const pid = (doc) => doc.pages.map((p) => p.id);

test('insert pages after the current page inherits its master', () => {
  const doc = createDocument({ pages: 2 });
  const m = addMaster(doc);
  doc.pages[1].masterId = m.id;
  const added = insertPages(doc, 2, 3);
  assert.equal(doc.pages.length, 5);
  assert.ok(added.every((p) => p.masterId === m.id));
  const none = insertPages(doc, 0, 1, { masterId: null });
  assert.equal(none[0].masterId, null);
  assert.equal(doc.pages[0], none[0]);
});

test('reorder pages by moving one to a new index', () => {
  const doc = createDocument({ pages: 4 });
  const [a, b, c, d] = pid(doc);
  assert.equal(movePage(doc, 0, 2), true);
  assert.deepEqual(pid(doc), [b, c, a, d]);
  movePage(doc, 3, 0);
  assert.deepEqual(pid(doc), [d, b, c, a]);
  assert.equal(movePage(doc, 1, 1), false);
  movePage(doc, 0, 99);
  assert.deepEqual(pid(doc), [b, c, a, d]);
});

test('duplicate page copies objects with new ids and independent stories', () => {
  const doc = createDocument();
  const t = createTextFrame(doc, {}, '<p>Hi</p>');
  doc.pages[0].elements.push(t, createElement('shape'));
  doc.pages[0].background = { type: 'solid', color: '#ff0000' };
  const copy = duplicatePage(doc, 0);
  assert.equal(doc.pages[1], copy);
  assert.equal(copy.elements.length, 2);
  assert.notEqual(copy.elements[0].id, t.id);
  assert.notEqual(copy.elements[0].storyId, t.storyId);
  assert.equal(doc.stories[copy.elements[0].storyId].html, '<p>Hi</p>');
  assert.deepEqual(copy.background, { type: 'solid', color: '#ff0000' });
  copy.background.color = '#000000';
  assert.equal(doc.pages[0].background.color, '#ff0000');
});

test('delete pages keeps at least one and relinks chains across pages', () => {
  const doc = createDocument({ pages: 3 });
  const a = createTextFrame(doc, { id: 'fa' }, '<p>x</p>');
  const b = createElement('text', { id: 'fb', storyId: a.storyId, next: 'fc' });
  const c = createElement('text', { id: 'fc', storyId: a.storyId });
  a.next = 'fb';
  doc.pages[0].elements.push(a); doc.pages[1].elements.push(b); doc.pages[2].elements.push(c);
  assert.equal(deletePages(doc, [1]), 1);
  assert.equal(a.next, 'fc');
  assert.equal(deletePages(doc, [0, 1]), 0, 'cannot delete every page');
  assert.equal(doc.pages.length, 2);
});

test('masters: names, duplicate, apply, delete with fallback', () => {
  const doc = createDocument({ pages: 2 });
  assert.equal(nextMasterName(doc), 'B');
  const b = addMaster(doc);
  b.elements.push(createElement('shape'));
  const c = duplicateMaster(doc, 1);
  assert.equal(c.name, 'C');
  assert.notEqual(c.elements[0].id, b.elements[0].id);
  assert.equal(applyMaster(doc, [0, 1], b.id), 2);
  assert.equal(applyMaster(doc, [0], 'missing'), 0);
  assert.equal(applyMaster(doc, [1], null), 1);
  assert.equal(doc.pages[1].masterId, null);
  assert.equal(deleteMaster(doc, b.id), true);
  assert.equal(doc.pages[0].masterId, doc.masters[0].id);
  deleteMaster(doc, c.id);
  assert.equal(deleteMaster(doc, doc.masters[0].id), false, 'last master stays');
});

test('spreads for facing pages', () => {
  const doc = createDocument({ pages: 6, facing: true });
  assert.deepEqual(spreads(doc), [[0], [1, 2], [3, 4], [5]]);
  assert.deepEqual(spreadOf(doc, 4), [3, 4]);
  doc.setup.facing = false;
  assert.deepEqual(spreads(doc).length, 6);
});
