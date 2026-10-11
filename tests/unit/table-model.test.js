import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../src/engines/table/model.js';

const ok = (t) => assert.deepEqual(T.validateTable(t), []);
const P = (s) => `<p>${s}</p>`;
/** Fill each cell with its coordinates so movement is traceable. */
function labelled(r, c, opts = {}) {
  const t = T.createTable(r, c, { w: c * 100, h: r * 20, ...opts });
  t.cells.forEach((row, i) => row.forEach((cell, j) => { cell.html = P(`${i}${j}`); }));
  return t;
}
const html = (t, r, c) => t.cells[r][c].html;
const spans = (t, r, c) => [t.cells[r][c].rowSpan, t.cells[r][c].colSpan];

test('createTable builds an equal grid and a valid element', () => {
  const t = T.createTable(3, 4, { x: 10, y: 20, w: 400, h: 90, headerRow: true, border: { color: '@accent', width: 2, dash: 'solid' } });
  assert.equal(t.type, 'table');
  assert.equal(t.x, 10); assert.equal(t.y, 20);
  assert.deepEqual(t.cols, [100, 100, 100, 100]);
  assert.deepEqual(t.rows, [30, 30, 30]);
  assert.equal(t.cells[2][3].html, '<p></p>');
  assert.equal(t.headerRow, true);
  assert.equal(t.border.color, '@accent');
  assert.equal(t.style.size, 10);
  ok(t);
  const u = T.createTable(1, 3, { w: 100, h: 20 });
  assert.equal(u.w, 100);
  ok(u);
});

test('createTable with style merges TextStyle defaults', () => {
  const t = T.createTable(2, 2, { style: { font: '@heading', size: 14 } });
  assert.equal(t.style.font, '@heading');
  assert.equal(t.style.size, 14);
  assert.equal(t.style.color, '@ink');
});

test('insertRow below/above copies formatting and heights, keeps h', () => {
  const t = labelled(2, 2);
  t.rows[1] = 40; t.h = 60;
  t.cells[1][0].fill = '@accent';
  const p = T.insertRow(t, 1, 'below', 2);
  assert.equal(p, 2);
  assert.equal(t.rows.length, 4);
  assert.deepEqual(t.rows, [20, 40, 40, 40]);
  assert.equal(t.h, 140);
  assert.equal(t.cells[2][0].fill, '@accent');
  assert.equal(t.cells[2][0].html, '<p></p>');
  assert.equal(html(t, 1, 0), P('10'));
  T.insertRow(t, 0, 'above');
  assert.equal(html(t, 1, 0), P('00'));
  assert.equal(html(t, 0, 0), '<p></p>');
  ok(t);
});

test('insertRow through a vertical merge grows the merged region', () => {
  const t = labelled(3, 3);
  T.mergeCells(t, 0, 0, 2, 0);
  T.insertRow(t, 0, 'below');
  assert.deepEqual(spans(t, 0, 0), [4, 1]);
  assert.equal(t.cells[1][0].covered, true);
  assert.equal(t.cells[1][1].covered, false);
  ok(t);
  // inserting below the last row of the merge does not grow it
  T.insertRow(t, 3, 'below');
  assert.deepEqual(spans(t, 0, 0), [4, 1]);
  assert.equal(t.cells[4][0].covered, false);
  ok(t);
  // inserting above the anchor shifts it
  T.insertRow(t, 0, 'above');
  assert.deepEqual(spans(t, 1, 0), [4, 1]);
  assert.equal(t.cells[0][0].covered, false);
  ok(t);
});

test('insertColumn left/right and through a horizontal merge', () => {
  const t = labelled(2, 3);
  T.mergeCells(t, 0, 0, 0, 2);
  T.insertColumn(t, 1, 'left');
  assert.equal(t.cols.length, 4);
  assert.deepEqual(spans(t, 0, 0), [1, 4]);
  assert.equal(html(t, 1, 2), P('11'));
  assert.equal(t.w, 400);
  ok(t);
  T.insertColumn(t, 3, 'right', 2);
  assert.equal(t.cols.length, 6);
  assert.deepEqual(spans(t, 0, 0), [1, 4]);
  assert.equal(t.cells[0][4].covered, false);
  ok(t);
});

test('deleteRows shrinks crossing merges and moves anchors when the anchor row is deleted', () => {
  const t = labelled(5, 2);
  T.mergeCells(t, 1, 0, 3, 0); // rows 1..3 col 0
  const content = html(t, 1, 0);
  assert.ok(T.deleteRows(t, 0, 1)); // delete anchor row (1) plus row 0
  assert.equal(t.rows.length, 3);
  assert.deepEqual(spans(t, 0, 0), [2, 1]);
  assert.equal(html(t, 0, 0), content);
  assert.equal(html(t, 0, 1), P('21'));
  assert.equal(t.h, 60);
  ok(t);
  assert.ok(T.deleteRows(t, 1));
  assert.deepEqual(spans(t, 0, 0), [1, 1]);
  ok(t);
});

test('deleteRows removes merges entirely inside and refuses to delete all rows', () => {
  const t = labelled(4, 3);
  T.mergeCells(t, 1, 0, 2, 2);
  assert.ok(T.deleteRows(t, 1, 2));
  assert.equal(t.rows.length, 2);
  assert.equal(html(t, 1, 0), P('30'));
  ok(t);
  assert.equal(T.deleteRows(t, 0, 1), false);
  assert.equal(t.rows.length, 2);
  assert.ok(T.deleteRows(t, 5, 1)); // reversed / clamped indices
  assert.equal(t.rows.length, 1);
  ok(t);
});

test('deleteColumns where the column is a merge anchor', () => {
  const t = labelled(2, 4);
  T.mergeCells(t, 0, 1, 1, 2); // 2x2 block anchored at (0,1)
  const content = html(t, 0, 1);
  assert.ok(T.deleteColumns(t, 1));
  assert.equal(t.cols.length, 3);
  assert.deepEqual(spans(t, 0, 1), [2, 1]);
  assert.equal(html(t, 0, 1), content);
  assert.equal(html(t, 0, 2), P('03'));
  assert.equal(t.w, 300);
  ok(t);
  assert.equal(T.deleteColumns(t, 0, 2), false);
});

test('mergeCells concatenates non-empty content in reading order', () => {
  const t = T.createTable(2, 2);
  t.cells[0][1].html = P('B');
  t.cells[1][0].html = P('C');
  t.cells[1][1].html = '<p>&nbsp;</p>';
  const R = T.mergeCells(t, { r1: 1, c1: 1, r2: 0, c2: 0 });
  assert.deepEqual(R, { r1: 0, c1: 0, r2: 1, c2: 1 });
  assert.equal(html(t, 0, 0), P('B') + P('C'));
  assert.deepEqual(spans(t, 0, 0), [2, 2]);
  assert.ok(t.cells[1][1].covered);
  ok(t);
  assert.equal(T.mergeCells(t, 0, 0, 1, 1), null); // already one region
});

test('isEmptyHtml treats fields and images as content', () => {
  assert.ok(T.isEmptyHtml('<p></p>'));
  assert.ok(T.isEmptyHtml('<p><br></p><p> &nbsp;</p>'));
  assert.ok(!T.isEmptyHtml('<p><span class="field" data-field="Name" contenteditable="false">«Name»</span></p>'));
  assert.ok(!T.isEmptyHtml('<p>x</p>'));
});

test('normalizeRange expands to include whole merged regions (transitively)', () => {
  const t = labelled(4, 4);
  T.mergeCells(t, 0, 1, 1, 2); // block A rows 0-1 cols 1-2
  T.mergeCells(t, 1, 3, 3, 3); // block B rows 1-3 col 3
  assert.deepEqual(T.normalizeRange(t, 1, 0, 1, 1), { r1: 0, c1: 0, r2: 1, c2: 2 });
  // touching A and B pulls in both
  assert.deepEqual(T.normalizeRange(t, { r1: 1, c1: 2, r2: 1, c2: 3 }), { r1: 0, c1: 1, r2: 3, c2: 3 });
  assert.deepEqual(T.normalizeRange(t, null), { r1: 0, c1: 0, r2: 3, c2: 3 });
  assert.deepEqual(T.normalizeRange(t, 9, 9, -2, -2), { r1: 0, c1: 0, r2: 3, c2: 3 });
});

test('canMerge and merging overlapping merged ranges', () => {
  const t = labelled(3, 3);
  assert.ok(!T.canMerge(t, 1, 1, 1, 1));
  assert.ok(T.canMerge(t, 0, 0, 0, 1));
  T.mergeCells(t, 0, 0, 1, 1);
  assert.ok(!T.canMerge(t, 1, 1, 1, 1)); // normalizes to the single 2x2 region
  assert.ok(T.canMerge(t, 1, 1, 1, 2));
  const R = T.mergeCells(t, 1, 1, 2, 2);
  assert.deepEqual(R, { r1: 0, c1: 0, r2: 2, c2: 2 });
  assert.deepEqual(spans(t, 0, 0), [3, 3]);
  // reading order of regions: (0,0) block first [00 01 10 11], then 02, 12, 20, 21, 22
  assert.equal(html(t, 0, 0), [P('00') + P('01') + P('10') + P('11'), P('02'), P('12'), P('20'), P('21'), P('22')].join(''));
  ok(t);
});

test('cellAt and anchorCell resolve covered slots', () => {
  const t = labelled(3, 3);
  T.mergeCells(t, 1, 1, 2, 2);
  assert.deepEqual(T.cellAt(t, 2, 2), { r: 1, c: 1, rowSpan: 2, colSpan: 2 });
  assert.deepEqual(T.cellAt(t, 0, 2), { r: 0, c: 2, rowSpan: 1, colSpan: 1 });
  assert.equal(T.cellAt(t, 3, 0), null);
  assert.equal(T.anchorCell(t, 2, 1), t.cells[1][1]);
});

test('splitCell undoes a merge, new cells inherit formatting', () => {
  const t = labelled(3, 3);
  T.mergeCells(t, 0, 0, 1, 2);
  T.setCellProps(t, { r1: 0, c1: 0, r2: 0, c2: 0 }, { fill: '@light', align: 'center' });
  assert.ok(T.splitCell(t, 1, 2));
  assert.deepEqual(spans(t, 0, 0), [1, 1]);
  assert.equal(t.cells[1][2].covered, false);
  assert.equal(t.cells[1][2].fill, '@light');
  assert.equal(t.cells[1][2].align, 'center');
  assert.equal(t.cells[1][2].html, '<p></p>');
  assert.ok(html(t, 0, 0).startsWith(P('00')));
  ok(t);
  assert.equal(T.splitCell(t, 0, 0), false);
});

test('split after insert through a merge yields single cells', () => {
  const t = labelled(2, 2);
  T.mergeCells(t, 0, 0, 1, 1);
  T.insertRow(t, 0, 'below');
  T.insertColumn(t, 0, 'right');
  assert.deepEqual(spans(t, 0, 0), [3, 3]);
  ok(t);
  assert.ok(T.splitCell(t, 2, 2));
  assert.ok(t.cells.flat().every((c) => !c.covered && c.rowSpan === 1 && c.colSpan === 1));
  ok(t);
});

test('splitRange splits every merge in the range', () => {
  const t = labelled(4, 4);
  T.mergeCells(t, 0, 0, 1, 1);
  T.mergeCells(t, 2, 2, 3, 3);
  assert.equal(T.splitRange(t, null), 2);
  ok(t);
  assert.equal(T.regions(t).length, 16);
});

test('nextCell walks anchors in reading order', () => {
  const t = labelled(2, 3);
  T.mergeCells(t, 0, 0, 0, 1);
  assert.deepEqual(T.nextCell(t, 0, 1), { r: 0, c: 2 });
  assert.deepEqual(T.nextCell(t, 0, 2), { r: 1, c: 0 });
  assert.deepEqual(T.nextCell(t, 0, 2, true), { r: 0, c: 0 });
  assert.equal(T.nextCell(t, 1, 2), null);
  assert.equal(T.nextCell(t, 0, 0, true), null);
});

test('setColumnWidth enforces the minimum and updates w; keepTotal moves the neighbour', () => {
  const t = T.createTable(2, 3, { w: 300, h: 40 });
  T.setColumnWidth(t, 0, 150);
  assert.deepEqual(t.cols, [150, 100, 100]);
  assert.equal(t.w, 350);
  T.setColumnWidth(t, 1, 2);
  assert.equal(t.cols[1], T.MIN_COL_WIDTH);
  assert.equal(t.w, 262);
  T.setColumnWidth(t, 0, 200, { keepTotal: true });
  assert.deepEqual(t.cols, [150, 12, 100]); // neighbour cannot go under the minimum
  T.setColumnWidth(t, 2, 50, { keepTotal: true }); // last column borrows from the previous
  assert.deepEqual(t.cols, [150, 62, 50]);
  assert.equal(t.w, 262);
  assert.equal(T.setColumnWidth(t, 7, 50), false);
  ok(t);
});

test('setRowHeight and distribute within a range', () => {
  const t = T.createTable(4, 4, { w: 400, h: 80 });
  T.setRowHeight(t, 0, 50);
  assert.equal(t.h, 110);
  T.setRowHeight(t, 1, 1);
  assert.equal(t.rows[1], T.MIN_ROW_HEIGHT);
  T.distributeRows(t, 0, 1);
  assert.deepEqual(t.rows.slice(0, 2), [30, 30]);
  assert.equal(t.h, 100);
  T.setColumnWidth(t, 0, 10.5 + 100);
  T.distributeColumns(t);
  assert.equal(t.cols[0], t.cols[1]);
  assert.ok(Math.abs(t.w - 410.5) < 0.011);
  T.distributeColumns(t, 3, 2); // reversed range
  ok(t);
  const u = T.createTable(1, 3, { w: 100, h: 20 });
  T.distributeColumns(u);
  assert.equal(u.w, 100);
  ok(u);
});

test('resizeTable scales proportionally and respects minimums', () => {
  const t = T.createTable(2, 3, { w: 300, h: 60 });
  T.setColumnWidth(t, 0, 200); // 200,100,100
  T.resizeTable(t, 200, 120);
  assert.deepEqual(t.cols, [100, 50, 50]);
  assert.deepEqual(t.rows, [60, 60]);
  assert.equal(t.w, 200); assert.equal(t.h, 120);
  T.resizeTable(t, 40, null);
  assert.deepEqual(t.cols, [16, 12, 12]); // two clamped to the minimum, rest gets the remainder
  assert.equal(t.h, 120);
  T.resizeTable(t, 10, 10);
  assert.deepEqual(t.cols, [12, 12, 12]);
  assert.equal(t.w, 36);
  ok(t);
  T.resizeTable(t, 333.33, 77.77);
  assert.equal(t.w, 333.33);
  assert.equal(t.h, 77.77);
  ok(t);
});

test('fitSizes handles zero sizes', () => {
  assert.deepEqual(T.fitSizes([0, 0], 100, 12), [50, 50]);
  assert.deepEqual(T.fitSizes([], 100, 12), []);
});

test('fitRowsToContent raises min heights', () => {
  const t = T.createTable(2, 2, { w: 100, h: 40 });
  assert.ok(T.fitRowsToContent(t, [35, 10]));
  assert.deepEqual(t.rows, [35, 20]);
  assert.equal(t.h, 55);
  assert.equal(T.fitRowsToContent(t, [35, 20]), false);
});

test('setCellProps validates and applies to whole merged regions', () => {
  const t = labelled(3, 3);
  T.mergeCells(t, 0, 0, 1, 1);
  const n = T.setCellProps(t, { r1: 1, c1: 1, r2: 1, c2: 2 }, { fill: '@accent', align: 'right', valign: 'middle', padding: 8 });
  assert.equal(n, 3); // the 2x2 region + (0,2) via normalization + (1,2)
  assert.equal(t.cells[0][0].fill, '@accent');
  assert.equal(t.cells[0][2].valign, 'middle');
  assert.equal(t.cells[1][2].padding, 8);
  assert.equal(t.cells[2][2].fill, null);
  T.setCellProps(t, null, { align: 'diagonal', valign: 'x', padding: -3, fill: 'none' });
  assert.equal(t.cells[0][0].align, 'right');
  assert.equal(t.cells[0][0].valign, 'middle');
  assert.equal(t.cells[0][0].padding, 0);
  assert.equal(t.cells[0][0].fill, null);
  T.setCellProps(t, null, { align: null });
  assert.equal(t.cells[0][0].align, null);
  ok(t);
});

const red = { color: '#ff0000', width: 2, dash: 'solid' };

test('setBorders outside/inside/all/none on a range', () => {
  const t = T.createTable(3, 3);
  const R = { r1: 0, c1: 0, r2: 1, c2: 1 };
  T.setBorders(t, R, 'outside', red);
  assert.deepEqual(t.cells[0][0].borders, { top: red, right: null, bottom: null, left: red });
  assert.deepEqual(t.cells[1][1].borders, { top: null, right: red, bottom: red, left: null });
  // neighbours outside the range receive the shared edge
  assert.deepEqual(t.cells[2][0].borders.top, red);
  assert.deepEqual(t.cells[0][2].borders.left, red);
  assert.equal(t.cells[2][2].borders, null);
  T.setBorders(t, R, 'inside', { color: '@muted', width: 1 });
  assert.equal(t.cells[0][0].borders.right.color, '@muted');
  assert.equal(t.cells[0][0].borders.right.dash, 'solid');
  assert.equal(t.cells[0][1].borders.left.color, '@muted');
  assert.deepEqual(t.cells[0][1].borders.right, red);
  T.setBorders(t, null, 'none');
  for (const row of t.cells) for (const c of row) for (const s of T.BORDER_SIDES) assert.equal(c.borders[s].width, 0);
  T.setBorders(t, null, 'all', null); // reset to table border
  assert.ok(t.cells.flat().every((c) => c.borders === null));
  assert.throws(() => T.setBorders(t, null, 'diagonal', red));
});

test('setBorders single sides, insideH/insideV and merged cells', () => {
  const t = T.createTable(3, 3);
  T.mergeCells(t, 0, 0, 1, 1);
  T.setBorders(t, { r1: 0, c1: 0, r2: 0, c2: 0 }, 'bottom', red); // normalized to the 2x2 block
  assert.deepEqual(t.cells[0][0].borders.bottom, red);
  assert.deepEqual(t.cells[2][0].borders.top, red);
  assert.deepEqual(t.cells[2][1].borders.top, red);
  assert.equal(t.cells[2][2].borders, null);
  const u = T.createTable(3, 3);
  T.setBorders(u, null, 'insideH', red);
  assert.equal(u.cells[0][0].borders.top, null);
  assert.deepEqual(u.cells[0][0].borders.bottom, red);
  assert.equal(u.cells[0][0].borders.right, null);
  T.setBorders(u, null, 'insideV', red);
  assert.deepEqual(u.cells[0][0].borders.right, red);
  assert.equal(u.cells[0][0].borders.left, null);
  T.setBorders(u, null, 'left', red);
  assert.deepEqual(u.cells[2][0].borders.left, red);
  assert.deepEqual(T.cellBorder(u, 2, 0, 'left'), red);
  assert.deepEqual(T.cellBorder(u, 2, 2, 'right'), u.border);
});

test('applyTableStyle applies every built-in style and keeps the table valid', () => {
  assert.ok(T.TABLE_STYLES.length >= 8);
  for (const s of T.TABLE_STYLES) {
    const t = labelled(4, 3);
    t.cells[1][1].fill = '#123456';
    T.mergeCells(t, 2, 0, 3, 1);
    assert.ok(T.applyTableStyle(t, s.id), s.id);
    assert.equal(t.styleId, s.id);
    assert.equal(t.cells[1][1].fill, null);
    assert.ok(typeof s.label === 'string' && s.label);
    for (const st of [t.border, ...t.cells.flat().flatMap((c) => (c.borders ? Object.values(c.borders).filter(Boolean) : []))]) {
      assert.ok(typeof st.color === 'string' && st.color.length > 0);
      assert.ok(st.width >= 0);
    }
    ok(t);
  }
  const t = T.createTable(3, 3);
  T.applyTableStyle(t, 'header');
  assert.equal(t.headerRow, true);
  assert.equal(t.headerFill, '@accent');
  assert.equal(t.headerColor, '@paper');
  T.applyTableStyle(t, 'plain');
  assert.equal(t.headerRow, false);
  assert.equal(t.headerFill, null);
  assert.equal(t.border.width, 0);
  T.applyTableStyle(t, 'calendar');
  assert.equal(t.cells[1][0].align, 'right');
  assert.equal(t.cells[0][0].align, 'center');
  assert.equal(T.applyTableStyle(t, 'nope'), false);
  // single-row table still styles fine
  const one = T.createTable(1, 2);
  for (const s of T.TABLE_STYLES) { T.applyTableStyle(one, s.id); ok(one); }
});

test('normalizeTable repairs ragged and inconsistent data', () => {
  const t = {
    type: 'table', w: 0, h: 0, cols: [50], rows: [],
    cells: [
      [{ html: '<p>a</p>', rowSpan: 2, colSpan: 2 }, { html: 'x' }],
      [{ html: 'y', covered: true }, null, { html: '<p>c</p>', colSpan: 5 }],
      [{ html: 3 }]
    ]
  };
  T.normalizeTable(t);
  ok(t);
  assert.equal(t.cols.length, 3);
  assert.equal(t.rows.length, 3);
  assert.deepEqual(spans(t, 0, 0), [2, 2]);
  assert.equal(t.cells[1][2].colSpan, 1);
  assert.equal(t.cells[2][0].html, '<p></p>');
  // overlapping regions get reduced
  const u = { cols: [10, 10], rows: [10, 10], cells: [[{ rowSpan: 2 }, {}], [{}, { rowSpan: 1, colSpan: 1 }]] };
  T.normalizeTable(u);
  ok(u);
});

test('validateTable reports broken invariants', () => {
  const t = T.createTable(2, 2);
  t.cells[0][0].colSpan = 2; // (0,1) not covered
  assert.ok(T.validateTable(t).length > 0);
  const u = T.createTable(2, 2);
  u.w = 5;
  assert.ok(T.validateTable(u).some((e) => e.startsWith('w ')));
});

test('tableFromData / textToHtml / cellText round trip', () => {
  const t = T.tableFromData([['Name', 'Qty'], ['A & B', '<3'], ['solo']]);
  assert.equal(t.cols.length, 2);
  assert.equal(t.cells[1][0].html, '<p>A &amp; B</p>');
  assert.equal(T.cellText(t.cells[1][1].html), '<3');
  assert.equal(T.cellText(T.textToHtml('one\ntwo')), 'one\ntwo');
  ok(t);
});

test('random operation sequences keep invariants', () => {
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let run = 0; run < 40; run++) {
    const t = labelled(1 + rnd(5), 1 + rnd(5));
    for (let step = 0; step < 60; step++) {
      const R = t.rows.length, C = t.cols.length;
      switch (rnd(9)) {
        case 0: T.insertRow(t, rnd(R), rnd(2) ? 'below' : 'above', 1 + rnd(2)); break;
        case 1: T.insertColumn(t, rnd(C), rnd(2) ? 'right' : 'left', 1 + rnd(2)); break;
        case 2: T.deleteRows(t, rnd(R), rnd(R)); break;
        case 3: T.deleteColumns(t, rnd(C), rnd(C)); break;
        case 4: case 5: T.mergeCells(t, rnd(R), rnd(C), rnd(R), rnd(C)); break;
        case 6: T.splitCell(t, rnd(R), rnd(C)); break;
        case 7: T.setBorders(t, { r1: rnd(R), c1: rnd(C), r2: rnd(R), c2: rnd(C) }, T.BORDER_PRESETS[rnd(T.BORDER_PRESETS.length)], red); break;
        default: T.resizeTable(t, 50 + rnd(500), 30 + rnd(300));
      }
      const errs = T.validateTable(t);
      assert.deepEqual(errs, [], `run ${run} step ${step}`);
    }
  }
});
