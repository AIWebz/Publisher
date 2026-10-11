import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resizeBox, rotatePoint, boxCorners, scaleElements, rotateElements, flipElements, lineEndpoints, lineFromPoints, normAngle, snapAngle, pageMargins, columnEdges } from '../../src/core/geometry.js';
import { createElement, createDocument, updateGroupBounds } from '../../src/core/model.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const nearPt = (p, q) => { near(p.x, q.x); near(p.y, q.y); };

test('normAngle and snapAngle', () => {
  assert.equal(normAngle(370), 10);
  assert.equal(normAngle(-190), 170);
  assert.equal(normAngle(180), 180);
  assert.equal(snapAngle(22), 15);
  assert.equal(snapAngle(38), 45);
});

test('unrotated resize from the se handle keeps the nw corner', () => {
  const r = resizeBox({ x: 10, y: 20, w: 100, h: 50, rot: 0 }, 'se', { x: 30, y: 10 });
  assert.deepEqual(r, { x: 10, y: 20, w: 130, h: 60 });
});

test('nw handle moves the origin and keeps the se corner', () => {
  const r = resizeBox({ x: 10, y: 20, w: 100, h: 50 }, 'nw', { x: 10, y: 5 });
  assert.deepEqual(r, { x: 20, y: 25, w: 90, h: 45 });
});

for (const rot of [30, 90, -45, 135]) {
  test(`rotated (${rot}°) resize keeps the opposite corner fixed in page space`, () => {
    const start = { x: 100, y: 100, w: 200, h: 80, rot };
    const anchorBefore = boxCorners(start)[0];              // nw corner is opposite the se handle
    const r = resizeBox(start, 'se', { x: 37, y: -12 });
    const anchorAfter = boxCorners({ ...r, rot })[0];
    nearPt(anchorAfter, anchorBefore);
    const neBefore = boxCorners(start)[3];                  // sw corner is opposite ne
    const r2 = resizeBox(start, 'ne', { x: -20, y: 44 });
    nearPt(boxCorners({ ...r2, rot })[3], neBefore);
  });
}

test('edge handle on a rotated box keeps the opposite edge midpoint', () => {
  const start = { x: 0, y: 0, w: 100, h: 40, rot: 60 };
  const c = boxCorners(start);
  const midW = { x: (c[0].x + c[3].x) / 2, y: (c[0].y + c[3].y) / 2 };
  const r = resizeBox(start, 'e', { x: 25, y: 25 });
  const c2 = boxCorners({ ...r, rot: 60 });
  nearPt({ x: (c2[0].x + c2[3].x) / 2, y: (c2[0].y + c2[3].y) / 2 }, midW);
  near(r.h, 40);
});

test('keepAspect and fromCenter', () => {
  const a = resizeBox({ x: 0, y: 0, w: 200, h: 100 }, 'se', { x: 100, y: 0 }, { keepAspect: true });
  near(a.w / a.h, 2);
  near(a.w, 300);
  const b = resizeBox({ x: 0, y: 0, w: 100, h: 100 }, 'e', { x: 10, y: 0 }, { fromCenter: true });
  assert.deepEqual(b, { x: -10, y: 0, w: 120, h: 100 });
});

test('resize never produces sizes below the minimum', () => {
  const r = resizeBox({ x: 0, y: 0, w: 50, h: 50 }, 'se', { x: -500, y: -500 }, { minSize: 4 });
  assert.equal(r.w, 4);
  assert.equal(r.h, 4);
});

test('rotatePoint rotates clockwise in screen coordinates', () => {
  nearPt(rotatePoint(10, 0, 0, 0, 90), { x: 0, y: 10 });
});

test('scaleElements maps boxes proportionally (multi-selection resize)', () => {
  const a = createElement('shape', { x: 0, y: 0, w: 50, h: 50 });
  const b = createElement('shape', { x: 50, y: 50, w: 50, h: 50 });
  scaleElements([a, b], { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 200, h: 100 });
  assert.deepEqual([a.x, a.y, a.w, a.h], [0, 0, 100, 50]);
  assert.deepEqual([b.x, b.y, b.w, b.h], [100, 50, 100, 50]);
});

test('scaleElements keeps lines exact', () => {
  const l = createElement('line', { x: 0, y: -6, w: 100, h: 12, rot: 45 });
  const [p1, p2] = lineEndpoints(l);
  scaleElements([l], { x: -100, y: -100, w: 200, h: 200 }, { x: -200, y: -100, w: 400, h: 200 });
  const [q1, q2] = lineEndpoints(l);
  near(q1.x, p1.x * 2 + 0, 1e-6);
  near(q2.y, p2.y, 1e-6);
});

test('rotateElements rotates groups about the centre and keeps group rot 0', () => {
  const a = createElement('shape', { x: 0, y: 0, w: 10, h: 10 });
  const b = createElement('shape', { x: 90, y: 0, w: 10, h: 10 });
  const g = updateGroupBounds(createElement('group', { children: [a, b] }));
  rotateElements([g], 50, 5, 90);
  assert.equal(g.rot, 0);
  near(a.rot, 90);
  near(a.x + 5, 50);
  near(a.y + 5, -40);
});

test('flipElements mirrors positions and toggles flips', () => {
  const s = createElement('shape', { x: 0, y: 0, w: 20, h: 10, rot: 30 });
  flipElements([s], 'h', { x: 50, y: 0 });
  assert.equal(s.x, 80);
  assert.equal(s.flipH, true);
  near(s.rot, -30);
  const l = createElement('line', { x: 0, y: 0, w: 10, h: 12, rot: 20 });
  flipElements([l], 'h', { x: 5, y: 6 });
  near(l.rot, 160);
});

test('line endpoints round-trip', () => {
  const box = lineFromPoints({ x: 10, y: 10 }, { x: 110, y: 110 }, 12);
  const [p, q] = lineEndpoints(box);
  nearPt(p, { x: 10, y: 10 });
  nearPt(q, { x: 110, y: 110 });
  near(box.rot, 45);
});

test('facing pages mirror margins on left-hand pages; columns split the text area', () => {
  const doc = createDocument({ width: 600, height: 800, margins: { top: 10, right: 20, bottom: 30, left: 40 }, facing: true });
  assert.deepEqual(pageMargins(doc, 0), { top: 10, right: 20, bottom: 30, left: 40 });
  assert.deepEqual(pageMargins(doc, 1), { top: 10, right: 40, bottom: 30, left: 20 });
  doc.setup.facing = false;
  doc.setup.columns = { count: 3, gutter: 30 };
  const cols = columnEdges(doc, 0);
  assert.equal(cols.length, 3);
  near(cols[0].left, 40);
  near(cols[2].right, 580);
  near(cols[1].left - cols[0].right, 30);
});
