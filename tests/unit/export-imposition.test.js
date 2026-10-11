import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePageRange, computeLayout, cropMarkLines, layoutStats, PAPER_SIZES } from '../../src/engines/export/imposition.js';

const LETTER = { w: 816, h: 1056 };
const order = (layout) => layout.sheets.map((s) => s.items.map((i) => (i.pageIndex == null ? null : i.pageIndex + 1)));

test('parsePageRange: lists, open ranges, all, dedupe, clamping', () => {
  assert.deepEqual(parsePageRange('1-3, 5, 8-', 10), [0, 1, 2, 4, 7, 8, 9]);
  assert.deepEqual(parsePageRange('', 3), [0, 1, 2]);
  assert.deepEqual(parsePageRange('all', 2), [0, 1]);
  assert.deepEqual(parsePageRange(null, 2), [0, 1]);
  assert.deepEqual(parsePageRange('-2', 5), [0, 1]);
  assert.deepEqual(parsePageRange('3-1', 5), [2, 1, 0]);
  assert.deepEqual(parsePageRange('2, 2, 1-3', 5), [1, 0, 2]);
  assert.deepEqual(parsePageRange('4-9', 5), [3, 4]);
  assert.deepEqual(parsePageRange('8-', 5), []);
  assert.deepEqual(parsePageRange('odd', 5), [0, 2, 4]);
  assert.deepEqual(parsePageRange('even', 5), [1, 3]);
  assert.deepEqual(parsePageRange(' 1 – 2 ', 5), [0, 1]);
  assert.deepEqual(parsePageRange([0, 4, 9, 1.5, 0], 5), [0, 4]);
});

test('parsePageRange: rejects garbage', () => {
  assert.throws(() => parsePageRange('1-x', 5), RangeError);
  assert.throws(() => parsePageRange('abc', 5), RangeError);
  assert.throws(() => parsePageRange('0', 5), RangeError);
  assert.throws(() => parsePageRange('-', 5), RangeError);
});

test('single on paper "page": sheet = page, no margins', () => {
  const l = computeLayout({ pageW: 816, pageH: 1056, pageCount: 3, mode: 'single', paper: 'page' });
  assert.equal(l.sheets.length, 3);
  for (const [i, s] of l.sheets.entries()) {
    assert.equal(s.w, 816); assert.equal(s.h, 1056); assert.equal(s.side, null);
    assert.deepEqual(s.items, [{ pageIndex: i, x: 0, y: 0, w: 816, h: 1056, rot: 0, scale: 1, bleed: { top: 0, right: 0, bottom: 0, left: 0 } }]);
    assert.deepEqual(s.marks, []);
  }
  assert.equal(l.orientation, 'portrait');
});

test('single on paper "page" with bleed + crop marks grows the sheet and places marks outside the bleed', () => {
  const l = computeLayout({ pageW: 480, pageH: 672, pageCount: 1, paper: 'page', bleed: 12, cropMarks: true, marksOffset: 6, marksLength: 18 });
  const s = l.sheets[0];
  const slug = 12 + 6 + 18;
  assert.equal(s.w, 480 + 2 * slug); assert.equal(s.h, 672 + 2 * slug);
  const it = s.items[0];
  assert.equal(it.x, slug); assert.equal(it.y, slug);
  assert.deepEqual(it.bleed, { top: 12, right: 12, bottom: 12, left: 12 });
  // 2 x-lines * 2 + 2 y-lines * 2 = 8 marks
  assert.equal(s.marks.length, 8);
  // top-left vertical mark: at trim x, ending 18px (bleed+offset) above the trim top
  assert.ok(s.marks.some((m) => m.x1 === slug && m.x2 === slug && m.y1 === 0 && m.y2 === 18));
  // top-left horizontal mark at trim y
  assert.ok(s.marks.some((m) => m.y1 === slug && m.y2 === slug && m.x1 === 0 && m.x2 === 18));
  // bottom-right marks reach the sheet edge
  assert.ok(s.marks.some((m) => m.x1 === slug + 480 && m.y1 === slug + 672 + 18 && m.y2 === s.h));
  assert.ok(s.marks.some((m) => m.y1 === slug + 672 && m.x1 === slug + 480 + 18 && m.x2 === s.w));
  // no mark intrudes into the bleed box
  for (const m of s.marks) {
    const inside = (x, y) => x > it.x - 12 && x < it.x + it.w + 12 && y > it.y - 12 && y < it.y + it.h + 12;
    assert.ok(!inside(m.x1, m.y1) && !inside(m.x2, m.y2), JSON.stringify(m));
  }
});

test('single on Letter centres at 100% inside margins; fit scales; landscape page picks landscape paper', () => {
  const l = computeLayout({ pageW: 384, pageH: 576, pageCount: 2, paper: LETTER, margins: 24 });
  assert.equal(l.orientation, 'portrait');
  assert.equal(l.sheets.length, 2);
  const it = l.sheets[0].items[0];
  assert.deepEqual([it.x, it.y, it.w, it.h, it.scale], [(816 - 384) / 2, (1056 - 576) / 2, 384, 576, 1]);
  const f = computeLayout({ pageW: 384, pageH: 576, pageCount: 1, paper: LETTER, margins: 24, fit: true });
  const fi = f.sheets[0].items[0];
  assert.equal(fi.scale, 1.75); // height-limited: (1056 - 48) / 576
  assert.ok(Math.abs(fi.y - 24) < 0.01);
  assert.ok(Math.abs(fi.x - (816 - 384 * 1.75) / 2) < 0.01);
  const land = computeLayout({ pageW: 576, pageH: 384, pageCount: 1, paper: 'letter' });
  assert.equal(land.orientation, 'landscape');
  assert.equal(land.sheets[0].w, 1056);
  const big = computeLayout({ pageW: 1728, pageH: 2304, pageCount: 1, paper: LETTER });
  assert.equal(big.warnings.length, 1);
  assert.equal(big.sheets[0].items[0].scale, 1);
});

test('repeat: business cards on Letter are 10-up (2 x 5), one sheet per selected page', () => {
  const l = computeLayout({ pageW: 336, pageH: 192, pageCount: 2, mode: 'repeat', paper: LETTER, orientation: 'portrait', margins: 24 });
  assert.equal(l.cols, 2); assert.equal(l.rows, 5); assert.equal(l.perSheet, 10);
  assert.equal(l.sheets.length, 2);
  assert.ok(l.sheets[0].items.every((i) => i.pageIndex === 0));
  assert.ok(l.sheets[1].items.every((i) => i.pageIndex === 1));
  const xs = [...new Set(l.sheets[0].items.map((i) => i.x))].sort((a, b) => a - b);
  const ys = [...new Set(l.sheets[0].items.map((i) => i.y))].sort((a, b) => a - b);
  assert.deepEqual(xs, [72, 408]);
  assert.deepEqual(ys, [48, 240, 432, 624, 816]);
  // auto orientation also finds 10 (portrait wins the tie for a landscape card? landscape gives 3x4=12 at 0 margins)
  const auto = computeLayout({ pageW: 336, pageH: 192, pageCount: 1, mode: 'repeat', paper: LETTER, margins: 24 });
  assert.ok(auto.perSheet >= 10);
  // with crop marks & zero margins still 2 x 5 on portrait
  const m = computeLayout({ pageW: 336, pageH: 192, pageCount: 1, mode: 'repeat', paper: LETTER, orientation: 'portrait', cropMarks: true });
  assert.equal(m.perSheet, 10);
  // gang marks: 4 distinct x trim lines? 2 cols with no gap => 3 x-lines; 5 rows => 6 y-lines
  assert.equal(m.sheets[0].marks.length, 2 * 3 + 2 * 6);
});

test('repeat: explicit grid and duplex mirrors the back', () => {
  const l = computeLayout({ pageW: 336, pageH: 192, pageCount: 2, mode: 'repeat', paper: LETTER, orientation: 'portrait', copiesPerSheet: { cols: 2, rows: 2 }, duplex: true, gap: 10 });
  assert.equal(l.perSheet, 4);
  assert.deepEqual(l.sheets.map((s) => s.side), ['front', 'back']);
  assert.equal(l.sheets[0].items.length, 4);
});

test('nup: different pages in order, last sheet partial, duplex back mirrored horizontally on portrait paper', () => {
  const l = computeLayout({ pageW: 384, pageH: 480, pageCount: 7, mode: 'nup', paper: LETTER, orientation: 'portrait', copiesPerSheet: { cols: 2, rows: 2 } });
  assert.deepEqual(order(l), [[1, 2, 3, 4], [5, 6, 7]]);
  const s0 = l.sheets[0].items;
  assert.ok(s0[0].x < s0[1].x && s0[0].y === s0[1].y && s0[2].y > s0[0].y);
  assert.equal(s0[0].x, (816 - 768) / 2);
  const d = computeLayout({ pageW: 384, pageH: 480, pageCount: 4, mode: 'nup', paper: LETTER, orientation: 'portrait', copiesPerSheet: { cols: 2, rows: 1 }, duplex: 'longEdge' });
  assert.deepEqual(d.sheets.map((s) => s.side), ['front', 'back']);
  const [f, b] = d.sheets;
  // page 3 is behind page 1: same y, mirrored x
  assert.equal(b.items[0].pageIndex, 2);
  assert.equal(b.items[0].x, f.items[1].x);
  assert.equal(b.items[1].x, f.items[0].x);
  // auto grid at 100%: half-letter pages, 2-up on landscape letter
  const a = computeLayout({ pageW: 528, pageH: 816, pageCount: 4, mode: 'nup', paper: LETTER });
  assert.equal(a.orientation, 'landscape');
  assert.equal(a.perSheet, 2);
  assert.deepEqual(order(a), [[1, 2], [3, 4]]);
  // fit with a fixed grid scales down
  const fit = computeLayout({ pageW: 816, pageH: 1056, pageCount: 4, mode: 'nup', paper: LETTER, orientation: 'portrait', copiesPerSheet: { cols: 2, rows: 2 }, fit: true });
  assert.equal(fit.scale, 0.5);
  assert.equal(fit.sheets.length, 1);
});

test('booklet: 4, 8, 12 page orders and 6 pages padded with blanks', () => {
  const b = (n, extra = {}) => computeLayout({ pageW: 528, pageH: 816, pageCount: n, mode: 'booklet', paper: LETTER, ...extra });
  assert.deepEqual(order(b(4)), [[4, 1], [2, 3]]);
  assert.deepEqual(order(b(8)), [[8, 1], [2, 7], [6, 3], [4, 5]]);
  assert.deepEqual(order(b(12)), [[12, 1], [2, 11], [10, 3], [4, 9], [8, 5], [6, 7]]);
  assert.deepEqual(order(b(6)), [[null, 1], [2, null], [6, 3], [4, 5]]);
  assert.equal(layoutStats(b(6)).blanks, 2);
  const l = b(8);
  assert.deepEqual(l.sheets.map((s) => s.side), ['front', 'back', 'front', 'back']);
  assert.equal(l.orientation, 'landscape');
  const [left, right] = l.sheets[0].items;
  // spread centred on 11 x 8.5 paper, pages side by side touching at the spine
  assert.equal(left.x, 0); assert.equal(right.x, 528); assert.equal(left.y, 0);
  assert.equal(left.bleed.right, 0); assert.equal(right.bleed.left, 0);
  // booklet on 'page' paper: sheet is twice the page width
  const p = computeLayout({ pageW: 400, pageH: 600, pageCount: 8, mode: 'booklet', paper: 'page', bleed: 9 });
  assert.equal(p.sheets.length, 4);
  assert.equal(p.sheets[0].w, 818); assert.equal(p.sheets[0].h, 618);
  assert.equal(p.sheets[0].items[1].x, 409);
  // selected pages only
  assert.deepEqual(order(computeLayout({ pageW: 400, pageH: 600, pageCount: 8, pages: [0, 1, 2, 3], mode: 'booklet' })), [[4, 1], [2, 3]]);
});

test('booklet crop marks include the fold line once', () => {
  const l = computeLayout({ pageW: 400, pageH: 600, pageCount: 4, mode: 'booklet', paper: 'page', cropMarks: true });
  // x-lines: left trim, spine, right trim => 3; y-lines: top, bottom => 2
  assert.equal(l.sheets[0].marks.length, 3 * 2 + 2 * 2);
  assert.ok(l.sheets[0].marks.some((m) => m.x1 === 24 + 400 && m.x2 === 24 + 400));
});

test('cropMarkLines and paper presets', () => {
  assert.deepEqual(cropMarkLines([], 0), []);
  const m = cropMarkLines([{ x: 100, y: 100, w: 50, h: 50 }], 5, 5, 10);
  assert.equal(m.length, 8);
  assert.deepEqual(m[0], { x1: 100, y1: 80, x2: 100, y2: 90 });
  assert.equal(PAPER_SIZES.letter.w, 816);
  assert.ok(Math.abs(PAPER_SIZES.a4.w - 793.7) < 0.1);
  assert.throws(() => computeLayout({ pageW: 1, pageH: 1, pageCount: 1, mode: 'zigzag' }), RangeError);
  assert.throws(() => computeLayout({ pageW: 1, pageH: 1, pageCount: 1, paper: 'nope' }), RangeError);
});

test('applyRecords: repeat whole layout per record, or one record per cell', async () => {
  const { applyRecords } = await import('../../src/engines/export/imposition.js');
  const l = computeLayout({ pageW: 400, pageH: 600, pageCount: 2, mode: 'single' });
  const r = applyRecords(l, 3);
  assert.equal(r.sheets.length, 6);
  assert.deepEqual(r.sheets.map((s) => [s.items[0].pageIndex, s.items[0].recordIndex]), [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]]);
  assert.equal(l.sheets[0].items[0].recordIndex, undefined); // input untouched
  const cards = computeLayout({ pageW: 336, pageH: 192, pageCount: 2, pages: [0, 1], mode: 'repeat', paper: LETTER, orientation: 'portrait', duplex: true });
  const c = applyRecords(cards, 13, { perCell: true });
  assert.equal(c.sheets.length, 4); // 2 chunks x (front, back)
  assert.deepEqual(c.sheets[0].items.map((i) => i.recordIndex), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(c.sheets[1].items.map((i) => i.pageIndex), Array(10).fill(1));
  assert.deepEqual(c.sheets[2].items.map((i) => i.recordIndex), [10, 11, 12, null, null, null, null, null, null, null]);
  assert.equal(c.sheets[2].items[5].pageIndex, null);
  assert.equal(applyRecords(l, 0).sheets.length, 2);
});
