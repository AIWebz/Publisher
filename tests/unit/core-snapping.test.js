import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSnapTargets, snapMove, snapResize, snapAxis, snapPoint } from '../../src/core/snapping.js';
import { createDocument, createElement } from '../../src/core/model.js';

const doc = createDocument({ width: 800, height: 600, margins: 50 });
const page = doc.pages[0];
page.guides = { v: [333], h: [222] };

test('snaps a box edge to the page margin within the threshold', () => {
  const t = collectSnapTargets(doc, page, 0, [], { objects: false });
  const r = snapMove({ x: 53, y: 300, w: 100, h: 40 }, t, 6);
  assert.equal(r.dx, -3);
  assert.deepEqual(r.lines.find((l) => l.axis === 'x'), { axis: 'x', v: 50, kind: 'margin' });
});

test('snaps the centre to the page centre', () => {
  const t = collectSnapTargets(doc, page, 0, []);
  const r = snapMove({ x: 348, y: 100, w: 100, h: 20 }, t, 6);
  assert.equal(r.dx, 2);
  assert.ok(r.lines.some((l) => l.v === 400 && l.kind === 'center'));
});

test('snaps to ruler guides and other objects, picking the closest', () => {
  const other = createElement('shape', { x: 500, y: 400, w: 100, h: 100 });
  const t = collectSnapTargets(doc, page, 0, [other]);
  const r = snapMove({ x: 604, y: 219, w: 50, h: 50 }, t, 6);
  assert.equal(r.dx, -4, 'left edge to other.right (600)');
  assert.equal(r.dy, 3, 'top edge to guide 222');
});

test('nothing snaps outside the threshold', () => {
  const t = collectSnapTargets(doc, page, 0, []);
  const r = snapMove({ x: 120, y: 120, w: 10, h: 10 }, t, 3);
  assert.deepEqual(r, { dx: 0, dy: 0, lines: [] });
});

test('grid snapping uses the grid size and loses ties to explicit targets', () => {
  doc.setup.grid.size = 24;
  const t = collectSnapTargets(doc, page, 0, [], { grid: true, margins: false, page: false, guides: false });
  const r = snapAxis([95], t.x, 6, t.grid);
  assert.equal(r.v, 96);
  const both = snapAxis([49], [{ v: 50, kind: 'margin' }], 6, 24);
  assert.equal(both.v, 50);
});

test('hidden objects are not snap targets', () => {
  const hidden = createElement('shape', { x: 200, y: 200, w: 10, h: 10, hidden: true });
  const t = collectSnapTargets(doc, page, 0, [hidden], { page: false, margins: false, guides: false, columns: false });
  assert.equal(t.x.length, 0);
});

test('snapResize moves only the dragged edge', () => {
  const t = collectSnapTargets(doc, page, 0, [], { objects: false });
  const { box, lines } = snapResize({ x: 100, y: 100, w: 228, h: 50 }, 'e', t, 6);
  assert.deepEqual(box, { x: 100, y: 100, w: 233, h: 50 });
  assert.equal(lines[0].v, 333);
  const r2 = snapResize({ x: 47, y: 100, w: 100, h: 50 }, 'w', t, 6);
  assert.deepEqual(r2.box, { x: 50, y: 100, w: 97, h: 50 });
});

test('snapPoint snaps both axes', () => {
  const t = collectSnapTargets(doc, page, 0, []);
  const p = snapPoint({ x: 52, y: 548 }, t, 5);
  assert.deepEqual([p.x, p.y], [50, 550]);
});
