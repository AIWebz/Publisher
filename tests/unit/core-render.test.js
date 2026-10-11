import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapePath, gradientVector } from '../../src/core/render/shapes.js';
import { SHAPE_KINDS, createDocument, createElement, createTextFrame } from '../../src/core/model.js';
import { Registry } from '../../src/core/registry.js';
import { registerCoreChecks, runPreflight, checkOffPage } from '../../src/core/preflight.js';

const nums = (d) => (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);

test('every shape kind produces a closed path inside its box', () => {
  for (const kind of SHAPE_KINDS) {
    const d = shapePath(kind, 10, 20, 200, 100, { sides: 7, points: 6, inner: 0.4, radius: 12 });
    assert.ok(d.startsWith('M'), kind);
    assert.ok(/Z\s*$/.test(d), `${kind} closed`);
    // arcs have flag numbers; check coordinates of non-arc paths stay in the box
    if (!d.includes('A')) {
      const v = nums(d);
      for (let i = 0; i < v.length; i += 2) {
        assert.ok(v[i] >= 10 - 0.01 && v[i] <= 210.01, `${kind} x ${v[i]}`);
        assert.ok(v[i + 1] >= 20 - 0.01 && v[i + 1] <= 120.01, `${kind} y ${v[i + 1]}`);
      }
    }
  }
});

test('polygon and star honour their parameters', () => {
  assert.equal((shapePath('polygon', 0, 0, 100, 100, { sides: 8 }).match(/L/g) || []).length, 7);
  assert.equal((shapePath('star', 0, 0, 100, 100, { points: 6, inner: 0.5 }).match(/L/g) || []).length, 11);
  const v = nums(shapePath('star', 0, 0, 100, 100, { points: 5 }));
  assert.equal(Math.min(...v.filter((_, i) => i % 2 === 0)), 0, 'fitted to the box');
  assert.equal(Math.max(...v.filter((_, i) => i % 2 === 1)), 100);
});

test('frame shape has an inner hole subpath', () => {
  assert.equal((shapePath('frame', 0, 0, 100, 100).match(/M/g) || []).length, 2);
});

test('gradient vector follows CSS angles', () => {
  assert.deepEqual(gradientVector(180), { x1: 0.5, y1: 0, x2: 0.5, y2: 1 });
  assert.deepEqual(gradientVector(90), { x1: 0, y1: 0.5, x2: 1, y2: 0.5 });
});

test('preflight finds off-page objects, empty placeholders, missing assets and hidden objects', () => {
  const doc = createDocument({ width: 500, height: 500, pages: 2 });
  doc.pages[0].elements.push(
    createElement('shape', { id: 'off', x: 600, y: 10, w: 50, h: 50 }),
    createElement('shape', { id: 'edge', x: 480, y: 10, w: 50, h: 50 }),
    createElement('image', { id: 'ph' }),
    createElement('image', { id: 'gone', assetId: 'a-missing' }),
    createElement('shape', { id: 'hid', hidden: true })
  );
  doc.pages[1].elements.push(createTextFrame(doc, { id: 'tf' }, '<p>x</p>'));
  const reg = new Registry();
  registerCoreChecks(reg);
  reg.preflight({ id: 'custom', check: () => [{ level: 'info', message: 'custom', pageIndex: 1 }] });
  const issues = runPreflight(doc, reg);
  const by = (id) => issues.filter((i) => i.elementId === id).map((i) => i.level);
  assert.deepEqual(by('off'), ['warning']);
  assert.deepEqual(by('edge'), ['info']);
  assert.deepEqual(by('ph'), ['warning']);
  assert.deepEqual(by('gone'), ['error']);
  assert.ok(issues.some((i) => i.check === 'core.hidden' && /1 hidden object/.test(i.message)));
  assert.ok(issues.some((i) => i.check === 'custom'));
  doc.setup.bleed = 40;
  assert.equal(checkOffPage(doc).filter((i) => i.elementId === 'edge').length, 0, 'within the bleed');
});
