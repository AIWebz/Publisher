// Table model operations. Every function is pure logic over a table element (see ARCHITECTURE.md):
//   { cols: number[] px widths, rows: number[] px min heights, cells: Cell[row][col], border, fill, style, headerRow, banded }
// Mutating functions change the element in place and keep it consistent:
//   - the grid is rectangular (rows.length x cols.length),
//   - every slot belongs to exactly one region: an anchor cell (covered:false) with rowSpan/colSpan >= 1,
//     and the other slots of its rectangle are covered:true with spans of 1,
//   - t.w === sum(cols) and t.h === sum(rows).
// Additive optional table props used by styles and the renderer: headerFill, headerColor, bandFill, styleId.
//
// Ranges are { r1, c1, r2, c2 } (inclusive). Functions that take a range also accept null (= whole table).

import { createElement, clone } from '../../core/model.js';

export const MIN_COL_WIDTH = 12;
export const MIN_ROW_HEIGHT = 10;
export const EMPTY_CELL_HTML = '<p></p>';
export const BORDER_SIDES = ['top', 'right', 'bottom', 'left'];
const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const ALIGNS = [null, 'left', 'center', 'right', 'justify'];
const VALIGNS = ['top', 'middle', 'bottom'];

const round2 = (v) => Math.round(v * 100) / 100;
const sum = (a) => round2(a.reduce((s, v) => s + v, 0));
const toInt = (v, d = 0) => (Number.isFinite(+v) ? Math.trunc(+v) : d);
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, toInt(v, lo)));

// ---------------------------------------------------------------------------------------------
// Cells and regions
// ---------------------------------------------------------------------------------------------

/**
 * Create a cell object with defaults.
 * @param {object} [props]
 * @returns {object} Cell
 */
export function createCell(props = {}) {
  return {
    html: EMPTY_CELL_HTML, fill: null, align: null, valign: 'top', padding: 4,
    rowSpan: 1, colSpan: 1, covered: false, borders: null, ...clone(props)
  };
}

/** Formatting of a cell that new / split cells inherit. */
function formatOf(cell) {
  if (!cell) return {};
  return { fill: cell.fill ?? null, align: cell.align ?? null, valign: cell.valign || 'top', padding: cell.padding ?? 4, borders: clone(cell.borders ?? null) };
}

/** @param {object} t @returns {number} */
export const rowCount = (t) => t.rows.length;
/** @param {object} t @returns {number} */
export const colCount = (t) => t.cols.length;

/**
 * All merged regions (anchor cells) in reading order.
 * @param {object} t table element
 * @returns {Array<{r:number,c:number,rs:number,cs:number,cell:object}>}
 */
export function regions(t) {
  const out = [];
  t.cells.forEach((row, r) => row.forEach((cell, c) => {
    if (cell && !cell.covered) out.push({ r, c, rs: Math.max(1, toInt(cell.rowSpan, 1)), cs: Math.max(1, toInt(cell.colSpan, 1)), cell });
  }));
  return out;
}

/**
 * Rebuild t.cells from a region list. Regions are placed in reading order; a region that would overlap an
 * earlier one is reduced to a single cell (or dropped if its anchor slot is taken). Empty slots get makeCell(r, c).
 */
function rebuild(t, nR, nC, regs, makeCell = () => createCell()) {
  const grid = Array.from({ length: nR }, () => new Array(nC).fill(null));
  const sorted = regs.filter((g) => g.rs > 0 && g.cs > 0 && g.r >= 0 && g.c >= 0 && g.r < nR && g.c < nC)
    .sort((a, b) => a.r - b.r || a.c - b.c);
  for (const g of sorted) {
    if (grid[g.r][g.c]) continue;
    let rs = Math.min(g.rs, nR - g.r);
    let cs = Math.min(g.cs, nC - g.c);
    let free = true;
    for (let r = g.r; r < g.r + rs && free; r++) for (let c = g.c; c < g.c + cs; c++) if (grid[r][c]) { free = false; break; }
    if (!free) { rs = 1; cs = 1; }
    const cell = g.cell;
    cell.rowSpan = rs; cell.colSpan = cs; cell.covered = false;
    for (let r = g.r; r < g.r + rs; r++) {
      for (let c = g.c; c < g.c + cs; c++) grid[r][c] = r === g.r && c === g.c ? cell : createCell({ covered: true });
    }
  }
  for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) if (!grid[r][c]) grid[r][c] = makeCell(r, c);
  t.cells = grid;
}

function updateSize(t) {
  t.w = sum(t.cols);
  t.h = sum(t.rows);
}

/**
 * Anchor coordinates of the region containing slot (r, c) (the slot itself when it is not covered).
 * @param {object} t
 * @param {number} r
 * @param {number} c
 * @returns {{r:number,c:number,rowSpan:number,colSpan:number}|null} null when out of range
 */
export function cellAt(t, r, c) {
  if (r < 0 || c < 0 || r >= t.rows.length || c >= t.cols.length) return null;
  const cell = t.cells[r] && t.cells[r][c];
  if (cell && !cell.covered) return { r, c, rowSpan: cell.rowSpan || 1, colSpan: cell.colSpan || 1 };
  for (let rr = r; rr >= 0; rr--) {
    for (let cc = c; cc >= 0; cc--) {
      const a = t.cells[rr][cc];
      if (a && !a.covered && rr + (a.rowSpan || 1) > r && cc + (a.colSpan || 1) > c) return { r: rr, c: cc, rowSpan: a.rowSpan || 1, colSpan: a.colSpan || 1 };
    }
  }
  return null;
}

/**
 * The anchor cell object for slot (r, c).
 * @param {object} t @param {number} r @param {number} c
 * @returns {object|null}
 */
export function anchorCell(t, r, c) {
  const a = cellAt(t, r, c);
  return a ? t.cells[a.r][a.c] : null;
}

function toRange(t, a, b, c, d) {
  if (a === null || a === undefined) return { r1: 0, c1: 0, r2: t.rows.length - 1, c2: t.cols.length - 1 };
  const R = typeof a === 'object' ? a : { r1: a, c1: b, r2: c ?? a, c2: d ?? b };
  const r1 = Math.min(toInt(R.r1), toInt(R.r2 ?? R.r1)), r2 = Math.max(toInt(R.r1), toInt(R.r2 ?? R.r1));
  const c1 = Math.min(toInt(R.c1), toInt(R.c2 ?? R.c1)), c2 = Math.max(toInt(R.c1), toInt(R.c2 ?? R.c1));
  const maxR = t.rows.length - 1, maxC = t.cols.length - 1;
  return { r1: clampInt(r1, 0, maxR), c1: clampInt(c1, 0, maxC), r2: clampInt(r2, 0, maxR), c2: clampInt(c2, 0, maxC) };
}

const intersects = (g, R) => g.r <= R.r2 && g.r + g.rs - 1 >= R.r1 && g.c <= R.c2 && g.c + g.cs - 1 >= R.c1;

/**
 * Expand a range so it contains every merged region it touches entirely.
 * Accepts (t, {r1,c1,r2,c2}), (t, r1, c1, r2, c2) or (t, null) for the whole table.
 * @returns {{r1:number,c1:number,r2:number,c2:number}}
 */
export function normalizeRange(t, a, b, c, d) {
  const R = toRange(t, a, b, c, d);
  const regs = regions(t);
  let changed = true;
  while (changed) {
    changed = false;
    for (const g of regs) {
      if (!intersects(g, R)) continue;
      const r2 = g.r + g.rs - 1, c2 = g.c + g.cs - 1;
      if (g.r < R.r1) { R.r1 = g.r; changed = true; }
      if (g.c < R.c1) { R.c1 = g.c; changed = true; }
      if (r2 > R.r2) { R.r2 = r2; changed = true; }
      if (c2 > R.c2) { R.c2 = c2; changed = true; }
    }
  }
  return R;
}

/**
 * Anchor cells whose regions intersect the (normalized) range, in reading order.
 * @param {object} t
 * @param {object|null} range
 * @returns {Array<{r:number,c:number,rs:number,cs:number,cell:object}>}
 */
export function cellsInRange(t, range = null) {
  const R = normalizeRange(t, range);
  return regions(t).filter((g) => intersects(g, R));
}

// ---------------------------------------------------------------------------------------------
// Creation / validation
// ---------------------------------------------------------------------------------------------

function equalSizes(total, n, min) {
  const each = Math.max(min, round2(total / n));
  const out = new Array(n).fill(each);
  if (each * n !== total && each > min) out[n - 1] = Math.max(min, round2(total - each * (n - 1)));
  return out;
}

/**
 * Create a table element with equal column widths / row heights and empty cells.
 * @param {number} rows
 * @param {number} cols
 * @param {{x?:number,y?:number,w?:number,h?:number,style?:object,border?:object,headerRow?:boolean,banded?:boolean,padding?:number,name?:string}} [opts]
 * @returns {object} table element
 */
export function createTable(rows, cols, opts = {}) {
  const nR = Math.max(1, toInt(rows, 1)), nC = Math.max(1, toInt(cols, 1));
  const w = opts.w ?? nC * 96, h = opts.h ?? nR * 28;
  const props = {
    x: opts.x ?? 0, y: opts.y ?? 0, name: opts.name ?? 'Table',
    cols: equalSizes(w, nC, MIN_COL_WIDTH), rows: equalSizes(h, nR, MIN_ROW_HEIGHT),
    cells: Array.from({ length: nR }, () => Array.from({ length: nC }, () => createCell(opts.padding !== undefined ? { padding: opts.padding } : {}))),
    headerRow: !!opts.headerRow, banded: !!opts.banded
  };
  if (opts.style) props.style = opts.style;
  if (opts.border) props.border = opts.border;
  if (opts.fill) props.fill = opts.fill;
  const t = createElement('table', props);
  updateSize(t);
  return t;
}

/**
 * Create a table from a 2-D array of plain strings (e.g. pasted tab-separated text).
 * @param {string[][]} data
 * @param {object} [opts] same as createTable
 * @returns {object} table element
 */
export function tableFromData(data, opts = {}) {
  const nR = Math.max(1, data.length), nC = Math.max(1, ...data.map((r) => r.length));
  const t = createTable(nR, nC, opts);
  data.forEach((row, r) => row.forEach((v, c) => { t.cells[r][c].html = textToHtml(v); }));
  return t;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Plain text -> cell HTML (one paragraph per line).
 * @param {string} text
 * @returns {string}
 */
export function textToHtml(text) {
  const lines = String(text ?? '').split(/\r\n|\r|\n/);
  return lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('');
}

/**
 * Cell HTML -> plain text (paragraphs separated by newlines).
 * @param {string} html
 * @returns {string}
 */
export function cellText(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div)>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n+$/, '');
}

/**
 * True when cell HTML has no visible content (no text, fields or images).
 * @param {string} html
 * @returns {boolean}
 */
export function isEmptyHtml(html) {
  const s = String(html ?? '');
  if (/<img\b|data-field=/i.test(s)) return false;
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;| |\s/g, '') === '';
}

/**
 * Check the table invariants. Returns a list of problems (empty when consistent).
 * @param {object} t
 * @returns {string[]}
 */
export function validateTable(t) {
  const errs = [];
  const nR = t.rows.length, nC = t.cols.length;
  if (!nR || !nC) errs.push('empty grid');
  if (t.cells.length !== nR) errs.push(`cells has ${t.cells.length} rows, expected ${nR}`);
  const owner = Array.from({ length: nR }, () => new Array(nC).fill(null));
  t.cells.forEach((row, r) => {
    if (row.length !== nC) errs.push(`row ${r} has ${row.length} cells, expected ${nC}`);
    row.forEach((cell, c) => {
      if (cell.covered) { if (cell.rowSpan !== 1 || cell.colSpan !== 1) errs.push(`covered cell ${r},${c} has spans`); return; }
      const rs = cell.rowSpan, cs = cell.colSpan;
      if (!(rs >= 1) || !(cs >= 1)) errs.push(`bad spans at ${r},${c}`);
      if (r + rs > nR || c + cs > nC) errs.push(`region ${r},${c} exceeds grid`);
      for (let rr = r; rr < Math.min(nR, r + rs); rr++) {
        for (let cc = c; cc < Math.min(nC, c + cs); cc++) {
          if (owner[rr][cc]) errs.push(`slot ${rr},${cc} claimed twice`);
          owner[rr][cc] = `${r},${c}`;
          if ((rr !== r || cc !== c) && t.cells[rr] && t.cells[rr][cc] && !t.cells[rr][cc].covered) errs.push(`slot ${rr},${cc} inside region ${r},${c} not covered`);
        }
      }
    });
  });
  for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) if (!owner[r][c]) errs.push(`slot ${r},${c} has no anchor`);
  if (Math.abs(sum(t.cols) - t.w) > 0.011) errs.push(`w ${t.w} != sum(cols) ${sum(t.cols)}`);
  if (Math.abs(sum(t.rows) - t.h) > 0.011) errs.push(`h ${t.h} != sum(rows) ${sum(t.rows)}`);
  return errs;
}

/**
 * Repair a table loaded from untrusted data: rectangular grid, valid spans, consistent covered flags,
 * minimum sizes and w/h equal to the sums. Mutates and returns t.
 * @param {object} t
 * @returns {object}
 */
export function normalizeTable(t) {
  const nC = Math.max(1, Array.isArray(t.cols) ? t.cols.length : 0, ...(Array.isArray(t.cells) ? t.cells.map((r) => (Array.isArray(r) ? r.length : 0)) : [0]));
  const nR = Math.max(1, Array.isArray(t.rows) ? t.rows.length : 0, Array.isArray(t.cells) ? t.cells.length : 0);
  const cols = Array.from({ length: nC }, (_, i) => Math.max(MIN_COL_WIDTH, +(t.cols && t.cols[i]) || ((t.w || nC * 96) / nC)));
  const rows = Array.from({ length: nR }, (_, i) => Math.max(MIN_ROW_HEIGHT, +(t.rows && t.rows[i]) || ((t.h || nR * 28) / nR)));
  const regs = [];
  (Array.isArray(t.cells) ? t.cells : []).forEach((row, r) => (Array.isArray(row) ? row : []).forEach((cell, c) => {
    if (!cell || typeof cell !== 'object' || cell.covered) return;
    const full = createCell({ ...cell, html: typeof cell.html === 'string' ? cell.html : EMPTY_CELL_HTML });
    if (!VALIGNS.includes(full.valign)) full.valign = 'top';
    if (!ALIGNS.includes(full.align)) full.align = null;
    regs.push({ r, c, rs: Math.max(1, toInt(cell.rowSpan, 1)), cs: Math.max(1, toInt(cell.colSpan, 1)), cell: full });
  }));
  t.cols = cols.map(round2); t.rows = rows.map(round2);
  rebuild(t, nR, nC, regs);
  updateSize(t);
  return t;
}

// ---------------------------------------------------------------------------------------------
// Insert / delete rows and columns (shared axis logic)
// ---------------------------------------------------------------------------------------------

const AX = {
  row: { pos: 'r', span: 'rs', sizes: 'rows' },
  col: { pos: 'c', span: 'cs', sizes: 'cols' }
};

function insertLines(t, axis, index, after, count) {
  const A = AX[axis];
  const n = t[A.sizes].length;
  if (!n) return -1;
  index = clampInt(index, 0, n - 1);
  count = Math.max(1, toInt(count, 1));
  const p = after ? index + 1 : index;
  // formatting comes from the reference line
  const other = axis === 'row' ? t.cols.length : t.rows.length;
  const refFmt = Array.from({ length: other }, (_, k) => formatOf(axis === 'row' ? anchorCell(t, index, k) : anchorCell(t, k, index)));
  const regs = regions(t);
  for (const g of regs) {
    if (g[A.pos] >= p) g[A.pos] += count;
    else if (g[A.pos] + g[A.span] > p) g[A.span] += count; // the insertion goes through a merged region
  }
  t[A.sizes].splice(p, 0, ...new Array(count).fill(t[A.sizes][index]));
  rebuild(t, t.rows.length, t.cols.length, regs, (r, c) => createCell(refFmt[axis === 'row' ? c : r]));
  updateSize(t);
  return p;
}

function deleteLines(t, axis, a, b) {
  const A = AX[axis];
  const n = t[A.sizes].length;
  const lo = clampInt(Math.min(a, b ?? a), 0, n - 1), hi = clampInt(Math.max(a, b ?? a), 0, n - 1);
  const k = hi - lo + 1;
  if (k >= n) return false;
  const regs = [];
  for (const g of regions(t)) {
    const s = g[A.pos], e = g[A.pos] + g[A.span] - 1;
    const ov = Math.max(0, Math.min(e, hi) - Math.max(s, lo) + 1);
    if (ov === g[A.span]) continue; // region entirely deleted
    g[A.span] -= ov;
    if (s > hi) g[A.pos] -= k;
    else if (s >= lo) g[A.pos] = lo; // anchor line deleted: the surviving part of the region keeps the content
    regs.push(g);
  }
  t[A.sizes].splice(lo, k);
  rebuild(t, t.rows.length, t.cols.length, regs);
  updateSize(t);
  return true;
}

/**
 * Insert `count` rows above or below row `index`. Merged regions the insertion passes through grow;
 * new cells inherit formatting from row `index`, new rows its height. Pass the bottom row of a merged
 * cell to insert below the whole merged cell.
 * @param {object} t
 * @param {number} index
 * @param {'below'|'above'} [where]
 * @param {number} [count]
 * @returns {number} index of the first inserted row
 */
export function insertRow(t, index, where = 'below', count = 1) {
  return insertLines(t, 'row', index, where !== 'above', count);
}

/**
 * Insert `count` columns left or right of column `index` (see insertRow).
 * @param {object} t
 * @param {number} index
 * @param {'right'|'left'} [where]
 * @param {number} [count]
 * @returns {number} index of the first inserted column
 */
export function insertColumn(t, index, where = 'right', count = 1) {
  return insertLines(t, 'col', index, where !== 'left', count);
}

/**
 * Delete rows r1..r2 (inclusive). Merged regions crossing the range shrink; a region whose anchor row is
 * deleted keeps its content in the surviving part. Refuses (returns false) to delete every row.
 * @param {object} t
 * @param {number} r1
 * @param {number} [r2]
 * @returns {boolean}
 */
export function deleteRows(t, r1, r2 = r1) {
  return deleteLines(t, 'row', r1, r2);
}

/**
 * Delete columns c1..c2 (inclusive); see deleteRows.
 * @param {object} t
 * @param {number} c1
 * @param {number} [c2]
 * @returns {boolean}
 */
export function deleteColumns(t, c1, c2 = c1) {
  return deleteLines(t, 'col', c1, c2);
}

// ---------------------------------------------------------------------------------------------
// Merge / split
// ---------------------------------------------------------------------------------------------

/**
 * True when the (normalized) range covers at least two cells/regions.
 * @returns {boolean}
 */
export function canMerge(t, a, b, c, d) {
  const R = normalizeRange(t, a, b, c, d);
  return regions(t).filter((g) => intersects(g, R)).length > 1;
}

/**
 * Merge the range (expanded to whole merged regions) into its top-left cell. Non-empty cell contents are
 * concatenated in reading order. Returns the merged range, or null when there was nothing to merge.
 * @returns {{r1:number,c1:number,r2:number,c2:number}|null}
 */
export function mergeCells(t, a, b, c, d) {
  const R = normalizeRange(t, a, b, c, d);
  const all = regions(t);
  const inside = all.filter((g) => intersects(g, R));
  if (inside.length < 2) return null;
  const anchor = inside.find((g) => g.r === R.r1 && g.c === R.c1);
  const parts = inside.map((g) => g.cell.html).filter((h) => !isEmptyHtml(h));
  anchor.cell.html = parts.length ? parts.join('') : anchor.cell.html;
  anchor.rs = R.r2 - R.r1 + 1;
  anchor.cs = R.c2 - R.c1 + 1;
  const keep = all.filter((g) => g === anchor || !intersects(g, R));
  rebuild(t, t.rows.length, t.cols.length, keep);
  return R;
}

/**
 * Split the merged cell containing slot (r, c) back into single cells (they inherit its formatting;
 * the content stays in the top-left cell). Returns false when the cell is not merged.
 * @param {object} t
 * @param {number} r
 * @param {number} c
 * @returns {boolean}
 */
export function splitCell(t, r, c) {
  const a = cellAt(t, r, c);
  if (!a || (a.rowSpan === 1 && a.colSpan === 1)) return false;
  const cell = t.cells[a.r][a.c];
  for (let rr = a.r; rr < a.r + a.rowSpan; rr++) {
    for (let cc = a.c; cc < a.c + a.colSpan; cc++) {
      if (rr === a.r && cc === a.c) continue;
      t.cells[rr][cc] = createCell(formatOf(cell));
    }
  }
  cell.rowSpan = 1; cell.colSpan = 1;
  return true;
}

/**
 * Split every merged cell intersecting the range. Returns the number of cells split.
 * @param {object} t
 * @param {object|null} range
 * @returns {number}
 */
export function splitRange(t, range = null) {
  let n = 0;
  for (const g of cellsInRange(t, range)) if ((g.rs > 1 || g.cs > 1) && splitCell(t, g.r, g.c)) n++;
  return n;
}

/**
 * Next / previous cell anchor in reading order from slot (r, c), for Tab navigation.
 * Returns null past the end (Tab in the last cell usually inserts a row).
 * @param {object} t
 * @param {number} r
 * @param {number} c
 * @param {boolean} [backwards]
 * @returns {{r:number,c:number}|null}
 */
export function nextCell(t, r, c, backwards = false) {
  const a = cellAt(t, r, c);
  const regs = regions(t);
  const i = a ? regs.findIndex((g) => g.r === a.r && g.c === a.c) : -1;
  const g = regs[backwards ? i - 1 : i + 1];
  return g ? { r: g.r, c: g.c } : null;
}

// ---------------------------------------------------------------------------------------------
// Sizes
// ---------------------------------------------------------------------------------------------

/**
 * Scale sizes proportionally so they sum to `total`, keeping each >= min (sum may exceed total when
 * total < n * min). Results are rounded to 0.01 px with the rounding remainder on the largest item.
 * @param {number[]} sizes
 * @param {number} total
 * @param {number} min
 * @returns {number[]}
 */
export function fitSizes(sizes, total, min) {
  const n = sizes.length;
  if (!n) return [];
  if (total <= n * min) return new Array(n).fill(min);
  const out = sizes.map((s) => Math.max(0, +s || 0));
  const fixed = new Array(n).fill(false);
  for (let guard = 0; guard <= n; guard++) {
    const free = out.map((_, i) => i).filter((i) => !fixed[i]);
    const remaining = total - (n - free.length) * min;
    const sumFree = free.reduce((s, i) => s + sizes[i], 0);
    let clampedAny = false;
    for (const i of free) {
      const v = sumFree > 0 ? (sizes[i] * remaining) / sumFree : remaining / free.length;
      if (v < min) { fixed[i] = true; out[i] = min; clampedAny = true; } else out[i] = v;
    }
    if (!clampedAny) break;
  }
  const r = out.map(round2);
  const diff = round2(total - r.reduce((s, v) => s + v, 0));
  if (diff) {
    let big = 0;
    r.forEach((v, i) => { if (v > r[big]) big = i; });
    r[big] = round2(r[big] + diff);
  }
  return r;
}

function setSize(t, key, i, v, min, keepTotal) {
  const sizes = t[key];
  if (i < 0 || i >= sizes.length || !Number.isFinite(+v)) return false;
  let w = Math.max(min, round2(+v));
  if (keepTotal && sizes.length > 1) {
    const nb = i < sizes.length - 1 ? i + 1 : i - 1;
    const pair = sizes[i] + sizes[nb];
    w = Math.min(w, round2(pair - min));
    sizes[nb] = round2(pair - w);
  }
  sizes[i] = w;
  updateSize(t);
  return true;
}

/**
 * Set a column width (>= opts.min, default 12 px). With opts.keepTotal the neighbouring column (next, or
 * previous for the last) absorbs the change so the table width is unchanged; otherwise t.w changes.
 * @param {object} t
 * @param {number} c
 * @param {number} w
 * @param {{min?:number, keepTotal?:boolean}} [opts]
 * @returns {boolean}
 */
export function setColumnWidth(t, c, w, opts = {}) {
  return setSize(t, 'cols', c, w, opts.min ?? MIN_COL_WIDTH, !!opts.keepTotal);
}

/**
 * Set a row's minimum height (>= opts.min, default 10 px); see setColumnWidth.
 * @param {object} t
 * @param {number} r
 * @param {number} h
 * @param {{min?:number, keepTotal?:boolean}} [opts]
 * @returns {boolean}
 */
export function setRowHeight(t, r, h, opts = {}) {
  return setSize(t, 'rows', r, h, opts.min ?? MIN_ROW_HEIGHT, !!opts.keepTotal);
}

function distribute(t, key, a, b) {
  const n = t[key].length;
  const lo = clampInt(Math.min(a ?? 0, b ?? n - 1), 0, n - 1), hi = clampInt(Math.max(a ?? 0, b ?? n - 1), 0, n - 1);
  const k = hi - lo + 1;
  const total = sum(t[key].slice(lo, hi + 1));
  const each = round2(total / k);
  for (let i = lo; i <= hi; i++) t[key][i] = each;
  t[key][hi] = round2(total - each * (k - 1));
  updateSize(t);
}

/**
 * Give columns c1..c2 (default all) equal widths, keeping their total.
 * @param {object} t @param {number} [c1] @param {number} [c2]
 */
export function distributeColumns(t, c1, c2) { distribute(t, 'cols', c1, c2); }

/**
 * Give rows r1..r2 (default all) equal heights, keeping their total.
 * @param {object} t @param {number} [r1] @param {number} [r2]
 */
export function distributeRows(t, r1, r2) { distribute(t, 'rows', r1, r2); }

/**
 * Scale columns / rows proportionally to a new frame size (null/undefined keeps that dimension).
 * Minimum sizes are respected, so t.w / t.h can end up larger than requested.
 * @param {object} t
 * @param {number|null} w
 * @param {number|null} h
 */
export function resizeTable(t, w, h) {
  if (Number.isFinite(+w) && w !== null) t.cols = fitSizes(t.cols, +w, MIN_COL_WIDTH);
  if (Number.isFinite(+h) && h !== null) t.rows = fitSizes(t.rows, +h, MIN_ROW_HEIGHT);
  updateSize(t);
}

/**
 * Raise row minimum heights to measured content heights (e.g. from measureRowHeights) so the frame
 * height matches the rendered table. Returns true if anything changed.
 * @param {object} t
 * @param {number[]} heights
 * @returns {boolean}
 */
export function fitRowsToContent(t, heights) {
  let changed = false;
  heights.forEach((h, r) => {
    if (r < t.rows.length && Number.isFinite(h) && h > t.rows[r] + 0.5) { t.rows[r] = round2(h); changed = true; }
  });
  if (changed) updateSize(t);
  return changed;
}

// ---------------------------------------------------------------------------------------------
// Cell formatting and borders
// ---------------------------------------------------------------------------------------------

/**
 * Set fill / align / valign / padding (and html) on every cell in the range. Invalid values are ignored.
 * @param {object} t
 * @param {object|null} range
 * @param {{fill?:string|null, align?:string|null, valign?:string, padding?:number, html?:string}} props
 * @returns {number} number of cells changed
 */
export function setCellProps(t, range, props = {}) {
  const cells = cellsInRange(t, range);
  for (const { cell } of cells) {
    if ('fill' in props) cell.fill = props.fill && props.fill !== 'none' ? props.fill : null;
    if ('align' in props && ALIGNS.includes(props.align)) cell.align = props.align;
    if ('valign' in props && VALIGNS.includes(props.valign)) cell.valign = props.valign;
    if ('padding' in props && Number.isFinite(+props.padding)) cell.padding = Math.max(0, +props.padding);
    if ('html' in props && typeof props.html === 'string') cell.html = props.html;
  }
  return cells.length;
}

function setSide(cell, side, stroke) {
  const b = cell.borders || { top: null, right: null, bottom: null, left: null };
  b[side] = stroke ? { color: stroke.color ?? '@ink', width: Math.max(0, +stroke.width || 0), dash: stroke.dash || 'solid' } : null;
  cell.borders = BORDER_SIDES.some((s) => b[s]) ? b : null;
}

/** Regions adjacent to region g on `side`. */
function neighbours(t, g, side) {
  const out = new Map();
  const add = (r, c) => {
    const a = cellAt(t, r, c);
    if (a) out.set(`${a.r},${a.c}`, t.cells[a.r][a.c]);
  };
  if (side === 'top' && g.r > 0) for (let c = g.c; c < g.c + g.cs; c++) add(g.r - 1, c);
  if (side === 'bottom' && g.r + g.rs < t.rows.length) for (let c = g.c; c < g.c + g.cs; c++) add(g.r + g.rs, c);
  if (side === 'left' && g.c > 0) for (let r = g.r; r < g.r + g.rs; r++) add(r, g.c - 1);
  if (side === 'right' && g.c + g.cs < t.cols.length) for (let r = g.r; r < g.r + g.rs; r++) add(r, g.c + g.cs);
  return [...out.values()];
}

/** Border presets accepted by setBorders. */
export const BORDER_PRESETS = ['all', 'outside', 'inside', 'insideH', 'insideV', 'top', 'bottom', 'left', 'right', 'none'];

/**
 * Apply a stroke to cell edges of a range. which: 'all' | 'outside' | 'inside' | 'insideH' | 'insideV' |
 * 'top' | 'bottom' | 'left' | 'right' | 'none' ('none' sets 0-width strokes). A null stroke resets the edges
 * to the table border. Edges shared with cells outside the range are set on both cells so the collapsed
 * border shows the new stroke.
 * @param {object} t
 * @param {object|null} range
 * @param {string} which
 * @param {{color:string,width:number,dash?:string}|null} stroke
 * @returns {number} number of cell edges set
 */
export function setBorders(t, range, which, stroke) {
  if (!BORDER_PRESETS.includes(which)) throw new Error(`Unknown border preset: ${which}`);
  const R = normalizeRange(t, range);
  const s = which === 'none' ? { color: (stroke && stroke.color) || '@ink', width: 0, dash: 'solid' } : stroke;
  let n = 0;
  for (const g of regions(t).filter((x) => intersects(x, R))) {
    const outer = {
      top: g.r === R.r1, bottom: g.r + g.rs - 1 === R.r2, left: g.c === R.c1, right: g.c + g.cs - 1 === R.c2
    };
    for (const side of BORDER_SIDES) {
      const isOuter = outer[side];
      const horizontal = side === 'top' || side === 'bottom';
      let on;
      switch (which) {
        case 'all': case 'none': on = true; break;
        case 'outside': on = isOuter; break;
        case 'inside': on = !isOuter; break;
        case 'insideH': on = !isOuter && horizontal; break;
        case 'insideV': on = !isOuter && !horizontal; break;
        default: on = isOuter && side === which;
      }
      if (!on) continue;
      setSide(g.cell, side, s);
      n++;
      if (isOuter) for (const nb of neighbours(t, g, side)) setSide(nb, OPPOSITE[side], s);
    }
  }
  return n;
}

/**
 * Effective stroke of one side of the cell anchored at (r, c): its own border or the table border.
 * @param {object} t @param {number} r @param {number} c @param {string} side
 * @returns {{color:string,width:number,dash:string}}
 */
export function cellBorder(t, r, c, side) {
  const cell = anchorCell(t, r, c);
  return (cell && cell.borders && cell.borders[side]) || t.border;
}

// ---------------------------------------------------------------------------------------------
// Table styles
// ---------------------------------------------------------------------------------------------

const S = (color, width, dash = 'solid') => ({ color, width, dash });
const ALL = null; // whole-table range
const headerRange = (t) => ({ r1: 0, c1: 0, r2: 0, c2: t.cols.length - 1 });

/** Built-in table looks: { id, label, apply(t) }. Colours are theme references. */
export const TABLE_STYLES = [
  { id: 'plain', label: 'Plain', apply(t) {
    Object.assign(t, { border: S('@ink', 0), headerRow: false, banded: false });
  } },
  { id: 'grid', label: 'Grid', apply(t) {
    Object.assign(t, { border: S('@ink', 1), headerRow: false, banded: false });
  } },
  { id: 'header', label: 'Header accent', apply(t) {
    Object.assign(t, { border: S('@muted', 1), headerRow: true, banded: false, headerFill: '@accent', headerColor: '@paper' });
  } },
  { id: 'banded', label: 'Banded rows', apply(t) {
    Object.assign(t, { border: S('@muted', 0), headerRow: true, banded: true, headerFill: '@accent', headerColor: '@paper', bandFill: '@light' });
    setBorders(t, ALL, 'outside', S('@accent', 1));
  } },
  { id: 'minimal', label: 'Minimal lines', apply(t) {
    Object.assign(t, { border: S('@muted', 0), headerRow: true, banded: false, headerColor: '@ink' });
    if (t.rows.length > 1) setBorders(t, ALL, 'insideH', S('@muted', 0.75));
    setBorders(t, ALL, 'top', S('@ink', 1.5));
    setBorders(t, ALL, 'bottom', S('@ink', 1.5));
    if (t.rows.length > 1) setBorders(t, headerRange(t), 'bottom', S('@ink', 1));
  } },
  { id: 'ledger', label: 'Ledger', apply(t) {
    Object.assign(t, { border: S('@muted', 0), headerRow: true, banded: true, headerFill: '@ink', headerColor: '@paper', bandFill: '@light' });
    if (t.rows.length > 1) setBorders(t, ALL, 'insideH', S('@muted', 0.5));
    setBorders(t, ALL, 'bottom', S('@ink', 1));
  } },
  { id: 'calendar', label: 'Calendar', apply(t) {
    Object.assign(t, { border: S('@muted', 1), headerRow: true, banded: false, headerFill: '@accent', headerColor: '@paper' });
    setCellProps(t, ALL, { align: 'right', valign: 'top' });
    setCellProps(t, headerRange(t), { align: 'center', valign: 'middle' });
  } },
  { id: 'boxed', label: 'Boxed', apply(t) {
    Object.assign(t, { border: S('@light', 1), headerRow: true, banded: false, headerFill: '@light', headerColor: '@accent' });
    setBorders(t, ALL, 'outside', S('@accent', 2));
  } },
  { id: 'accentBands', label: 'Accent bands', apply(t) {
    Object.assign(t, { border: S('@paper', 1), headerRow: true, banded: true, headerFill: '@accent2', headerColor: '@ink', bandFill: '@light', fill: { type: 'solid', color: '@paper' } });
  } }
];

/**
 * Apply a built-in table style: resets cell fills and per-cell borders, then sets the table border,
 * header row / banding flags and header/band colours. Returns false for an unknown id.
 * @param {object} t
 * @param {string} styleId
 * @returns {boolean}
 */
export function applyTableStyle(t, styleId) {
  const st = TABLE_STYLES.find((s) => s.id === styleId);
  if (!st) return false;
  for (const { cell } of regions(t)) { cell.fill = null; cell.borders = null; }
  for (const row of t.cells) for (const cell of row) if (cell.covered) cell.borders = null;
  Object.assign(t, { fill: { type: 'none' }, headerFill: null, headerColor: null, bandFill: null });
  st.apply(t);
  t.styleId = st.id;
  return true;
}
