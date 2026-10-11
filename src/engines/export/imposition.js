/* Folio Publisher — imposition: places publication pages onto printer sheets.
   Pure functions, no DOM. All lengths are CSS px (96 per inch). */

/** Standard paper sizes in px (portrait). */
export const PAPER_SIZES = Object.freeze({
  letter: { name: 'Letter', w: 816, h: 1056 },
  legal: { name: 'Legal', w: 816, h: 1344 },
  tabloid: { name: 'Tabloid', w: 1056, h: 1632 },
  a3: { name: 'A3', w: 297 * 96 / 25.4, h: 420 * 96 / 25.4 },
  a4: { name: 'A4', w: 210 * 96 / 25.4, h: 297 * 96 / 25.4 },
  a5: { name: 'A5', w: 148 * 96 / 25.4, h: 210 * 96 / 25.4 }
});

const DEFAULT_MARKS_OFFSET = 6;   // gap between bleed edge and crop mark (px, ~4.5pt)
const DEFAULT_MARKS_LENGTH = 18;  // crop mark length (px, ~0.19in)
const EPS = 1e-6;

/**
 * Parse a print-dialog style page range into 0-based page indices.
 * Accepts '1-3, 5, 8-', '-4', '7-5' (descending), 'odd', 'even', 'all' and '' (all pages).
 * Numbers beyond pageCount are dropped; duplicates are removed (first occurrence wins).
 * @param {string|number[]|null|undefined} range
 * @param {number} pageCount
 * @returns {number[]}
 * @throws {RangeError} when the text contains an unparseable token.
 */
export function parsePageRange(range, pageCount) {
  const n = Math.max(0, Math.floor(pageCount || 0));
  const all = Array.from({ length: n }, (_, i) => i);
  if (Array.isArray(range)) return dedupe(range.filter((i) => Number.isInteger(i) && i >= 0 && i < n));
  const text = String(range ?? '').trim().toLowerCase();
  if (!text || text === 'all' || text === '*') return all;
  const out = [];
  for (const raw of text.split(/[,;]+/)) {
    const tok = raw.replace(/\s+/g, '').replace(/[–—]/g, '-');
    if (!tok) continue;
    if (tok === 'all' || tok === '*') { out.push(...all); continue; }
    if (tok === 'odd' || tok === 'even') {
      for (let i = tok === 'odd' ? 0 : 1; i < n; i += 2) out.push(i);
      continue;
    }
    const m = /^(\d+)?(-)?(\d+)?$/.exec(tok);
    if (!m || (!m[1] && !m[3])) throw new RangeError(`Invalid page range "${raw.trim()}"`);
    let a; let b;
    if (!m[2]) { a = b = Number(m[1]); } else {
      a = m[1] ? Number(m[1]) : 1;
      b = m[3] ? Number(m[3]) : n;
      if (!m[3] && a > n) continue;   // 'a-' past the last page selects nothing
    }
    if (a < 1 || b < 1) throw new RangeError(`Page numbers start at 1 ("${raw.trim()}")`);
    const step = a <= b ? 1 : -1;
    for (let p = a; step > 0 ? p <= b : p >= b; p += step) {
      if (p <= n) out.push(p - 1);
      else if (step > 0) break;
    }
  }
  return dedupe(out);
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((i) => (seen.has(i) ? false : (seen.add(i), true)));
}

/** Normalise a margin value (number or {top,right,bottom,left}) to an object. */
function boxOf(m) {
  if (m == null) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof m === 'number') return { top: m, right: m, bottom: m, left: m };
  return { top: +m.top || 0, right: +m.right || 0, bottom: +m.bottom || 0, left: +m.left || 0 };
}

const round = (v) => Math.round(v * 1000) / 1000;

/**
 * Impose pages onto sheets.
 * @param {object} o
 * @param {number} o.pageW trim width (px)
 * @param {number} o.pageH trim height (px)
 * @param {number} o.pageCount number of pages in the publication
 * @param {number[]} [o.pages] selected page indices (default: all)
 * @param {'single'|'nup'|'repeat'|'booklet'} [o.mode='single']
 * @param {{w:number,h:number}|'page'|string} [o.paper='page'] paper size in px, a PAPER_SIZES key, or 'page'
 *   (sheet = page size + bleed + marks)
 * @param {'portrait'|'landscape'|'auto'} [o.orientation='auto']
 * @param {number|object} [o.margins=0] unprintable paper margins (ignored for paper 'page')
 * @param {number} [o.gap=0] space between placed pages (px, between bleed boxes)
 * @param {number} [o.bleed=0] bleed printed around each page (px)
 * @param {boolean} [o.cropMarks=false]
 * @param {number} [o.marksOffset=6] distance from the bleed edge to the start of a crop mark
 * @param {number} [o.marksLength=18]
 * @param {'auto'|{cols:number,rows:number}} [o.copiesPerSheet='auto'] grid for 'nup' / 'repeat'
 * @param {boolean|'longEdge'|'shortEdge'} [o.duplex=false] two-sided: backs are mirrored to line up with fronts
 * @param {boolean} [o.fit=false] scale pages to fill the printable area (otherwise 100%)
 * @returns {{ sheets: Array<{w:number,h:number,side:'front'|'back'|null,
 *   items: Array<{pageIndex:number|null,x:number,y:number,w:number,h:number,rot:number,scale:number,
 *   bleed:{top:number,right:number,bottom:number,left:number}}>, marks: Array<{x1:number,y1:number,x2:number,y2:number}>}>,
 *   sheetW:number, sheetH:number, cols:number, rows:number, perSheet:number, scale:number,
 *   orientation:'portrait'|'landscape', mode:string, warnings:string[] }}
 */
export function computeLayout(o) {
  const pageW = +o.pageW; const pageH = +o.pageH;
  if (!(pageW > 0 && pageH > 0)) throw new RangeError('pageW and pageH must be positive');
  const pageCount = Math.max(0, Math.floor(o.pageCount ?? (o.pages ? o.pages.length : 1)));
  const pages = o.pages ? [...o.pages] : Array.from({ length: pageCount }, (_, i) => i);
  const mode = o.mode || 'single';
  if (!['single', 'nup', 'repeat', 'booklet'].includes(mode)) throw new RangeError(`Unknown imposition mode "${mode}"`);
  const bleed = Math.max(0, +o.bleed || 0);
  const cropMarks = !!o.cropMarks;
  const marksOffset = o.marksOffset ?? DEFAULT_MARKS_OFFSET;
  const marksLength = o.marksLength ?? DEFAULT_MARKS_LENGTH;
  const markSlug = cropMarks ? marksOffset + marksLength : 0;   // beyond the bleed
  const gap = Math.max(0, +o.gap || 0);
  const fit = !!o.fit;
  const duplex = o.duplex === true ? 'longEdge' : (o.duplex || false);
  const warnings = [];

  // A "cell" is one placed unit: a page, or a two-page spread in booklet mode.
  const spread = mode === 'booklet';
  const unitW = spread ? pageW * 2 : pageW;
  const unitH = pageH;

  // Grid request.
  let fixedGrid = null;
  if (mode === 'single' || mode === 'booklet') fixedGrid = { cols: 1, rows: 1 };
  else if (o.copiesPerSheet && typeof o.copiesPerSheet === 'object') {
    fixedGrid = { cols: Math.max(1, Math.floor(o.copiesPerSheet.cols) || 1), rows: Math.max(1, Math.floor(o.copiesPerSheet.rows) || 1) };
  }

  const solve = (paperW, paperH, margins) => {
    const availW = paperW - margins.left - margins.right - 2 * markSlug;
    const availH = paperH - margins.top - margins.bottom - 2 * markSlug;
    let cols; let rows; let scale = 1;
    if (fixedGrid) {
      ({ cols, rows } = fixedGrid);
      if (fit) {
        scale = Math.min((availW - (cols - 1) * gap) / (cols * (unitW + 2 * bleed)),
          (availH - (rows - 1) * gap) / (rows * (unitH + 2 * bleed)));
        if (!(scale > 0)) scale = 1;
      }
    } else {
      cols = Math.floor((availW + gap + EPS) / (unitW + 2 * bleed + gap));
      rows = Math.floor((availH + gap + EPS) / (unitH + 2 * bleed + gap));
      if (cols < 1 || rows < 1) {
        cols = 1; rows = 1;
        if (fit) {
          scale = Math.min(availW / (unitW + 2 * bleed), availH / (unitH + 2 * bleed));
          if (!(scale > 0)) scale = 1;
        }
      }
    }
    return { cols, rows, scale, availW, availH };
  };

  // Paper.
  let paper = o.paper ?? 'page';
  if (typeof paper === 'string' && paper !== 'page') {
    const p = PAPER_SIZES[paper];
    if (!p) throw new RangeError(`Unknown paper "${paper}"`);
    paper = { w: p.w, h: p.h };
  }
  let sheetW; let sheetH; let g; let margins; let orientation;
  if (paper === 'page') {
    margins = boxOf(0);
    g = fixedGrid ? { ...fixedGrid } : { cols: 1, rows: 1 };
    g.scale = 1;
    sheetW = g.cols * (unitW + 2 * bleed) + (g.cols - 1) * gap + 2 * markSlug;
    sheetH = g.rows * (unitH + 2 * bleed) + (g.rows - 1) * gap + 2 * markSlug;
    orientation = sheetW > sheetH ? 'landscape' : 'portrait';
  } else {
    margins = boxOf(o.margins);
    const short = Math.min(paper.w, paper.h); const long = Math.max(paper.w, paper.h);
    const portrait = { w: short, h: long }; const landscape = { w: long, h: short };
    let want = o.orientation || 'auto';
    if (want === 'auto') {
      if (fixedGrid) {
        // Match the aspect of what is being placed.
        const fw = fixedGrid.cols * unitW; const fh = fixedGrid.rows * unitH;
        want = fw > fh ? 'landscape' : 'portrait';
      } else {
        const a = solve(portrait.w, portrait.h, margins);
        const b = solve(landscape.w, landscape.h, margins);
        const ca = a.cols * a.rows; const cb = b.cols * b.rows;
        want = cb > ca ? 'landscape' : (ca > cb ? 'portrait' : (unitW > unitH ? 'landscape' : 'portrait'));
      }
    }
    orientation = want === 'landscape' ? 'landscape' : 'portrait';
    ({ w: sheetW, h: sheetH } = orientation === 'landscape' ? landscape : portrait);
    g = solve(sheetW, sheetH, margins);
  }

  const { cols, rows, scale } = g;
  const cellW = (unitW + 2 * bleed) * scale;
  const cellH = (unitH + 2 * bleed) * scale;
  const gridW = cols * cellW + (cols - 1) * gap;
  const gridH = rows * cellH + (rows - 1) * gap;
  const areaX = margins.left; const areaY = margins.top;
  const areaW = sheetW - margins.left - margins.right;
  const areaH = sheetH - margins.top - margins.bottom;
  const gx = areaX + (areaW - gridW) / 2;
  const gy = areaY + (areaH - gridH) / 2;
  if (paper !== 'page' && (gridW + 2 * markSlug > areaW + 0.5 || gridH + 2 * markSlug > areaH + 0.5)) {
    warnings.push('Pages are larger than the printable area of the paper; they will be cropped.');
  }

  /** Trim-box rectangles for every cell (row-major). */
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        c, r,
        x: gx + c * (cellW + gap) + bleed * scale,
        y: gy + r * (cellH + gap) + bleed * scale
      });
    }
  }
  const perSheet = cells.length;
  const bl = bleed * scale;
  const fullBleed = { top: round(bl), right: round(bl), bottom: round(bl), left: round(bl) };

  const mirrorCell = (idx) => {
    // Back side positions so each back page sits behind its front page.
    const { c, r } = cells[idx];
    const longIsVertical = sheetH >= sheetW;
    const mirrorX = duplex === 'longEdge' ? longIsVertical : !longIsVertical;
    const cc = mirrorX ? cols - 1 - c : c;
    const rr = mirrorX ? r : rows - 1 - r;
    return rr * cols + cc;
  };

  const pageItem = (pageIndex, cell, b = fullBleed, dx = 0) => ({
    pageIndex,
    x: round(cell.x + dx), y: round(cell.y),
    w: round(pageW * scale), h: round(pageH * scale),
    rot: 0, scale: round(scale), bleed: { ...b }
  });

  const sheets = [];
  const newSheet = (side) => {
    const s = { w: round(sheetW), h: round(sheetH), side, items: [], marks: [] };
    sheets.push(s);
    return s;
  };

  if (mode === 'single') {
    for (const p of pages) newSheet(null).items.push(pageItem(p, cells[0]));
  } else if (mode === 'nup') {
    for (let i = 0, k = 0; i < pages.length; i += perSheet, k++) {
      const side = duplex ? (k % 2 === 0 ? 'front' : 'back') : null;
      const s = newSheet(side);
      const chunk = pages.slice(i, i + perSheet);
      chunk.forEach((p, j) => s.items.push(pageItem(p, cells[side === 'back' ? mirrorCell(j) : j])));
    }
  } else if (mode === 'repeat') {
    pages.forEach((p, k) => {
      const side = duplex ? (k % 2 === 0 ? 'front' : 'back') : null;
      const s = newSheet(side);
      for (let j = 0; j < perSheet; j++) s.items.push(pageItem(p, cells[side === 'back' ? mirrorCell(j) : j]));
    });
  } else {
    // Saddle-stitch booklet: pad to a multiple of 4, then pair outside-in.
    const padded = pages.slice();
    while (padded.length % 4 !== 0 || padded.length === 0) padded.push(null);
    const n = padded.length;
    const left = { ...fullBleed, right: 0 };
    const right = { ...fullBleed, left: 0 };
    const cell = cells[0];
    const spreadOf = (a, b, side) => {
      const s = newSheet(side);
      s.items.push(pageItem(padded[a], cell, left, 0));
      s.items.push(pageItem(padded[b], cell, right, pageW * scale));
    };
    for (let i = 0; i < n / 4; i++) {
      spreadOf(n - 1 - 2 * i, 2 * i, 'front');
      spreadOf(2 * i + 1, n - 2 - 2 * i, 'back');
    }
  }

  if (cropMarks) {
    const marks = cropMarkLines(sheets[0] ? sheets[0].items : [], bl, marksOffset, marksLength);
    for (const s of sheets) s.marks = marks.map((m) => ({ ...m }));
  }

  return {
    sheets,
    sheetW: round(sheetW), sheetH: round(sheetH),
    cols, rows, perSheet, scale: round(scale),
    orientation, mode, bleed, cropMarks, duplex, warnings
  };
}

/**
 * Crop marks for a set of placed trim boxes (gang-run style: one mark per distinct trim line,
 * drawn outside the grid's bleed area). Pure.
 * @param {Array<{x:number,y:number,w:number,h:number}>} items
 * @param {number} bleed scaled bleed (px)
 * @param {number} offset distance from the bleed edge to the mark
 * @param {number} length mark length
 * @returns {Array<{x1:number,y1:number,x2:number,y2:number}>}
 */
export function cropMarkLines(items, bleed, offset = DEFAULT_MARKS_OFFSET, length = DEFAULT_MARKS_LENGTH) {
  if (!items.length) return [];
  const xs = new Set(); const ys = new Set();
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const it of items) {
    xs.add(round(it.x)); xs.add(round(it.x + it.w));
    ys.add(round(it.y)); ys.add(round(it.y + it.h));
    minX = Math.min(minX, it.x); minY = Math.min(minY, it.y);
    maxX = Math.max(maxX, it.x + it.w); maxY = Math.max(maxY, it.y + it.h);
  }
  const d = bleed + offset;
  const marks = [];
  for (const x of [...xs].sort((a, b) => a - b)) {
    marks.push({ x1: x, y1: round(minY - d - length), x2: x, y2: round(minY - d) });
    marks.push({ x1: x, y1: round(maxY + d), x2: x, y2: round(maxY + d + length) });
  }
  for (const y of [...ys].sort((a, b) => a - b)) {
    marks.push({ x1: round(minX - d - length), y1: y, x2: round(minX - d), y2: y });
    marks.push({ x1: round(maxX + d), y1: y, x2: round(maxX + d + length), y2: y });
  }
  return marks;
}

/**
 * Pages placed on a layout in reading order (useful for summaries: "8 pages on 4 sheets").
 * @param {{sheets: Array<{items: Array<{pageIndex:number|null}>}>}} layout
 * @returns {{ sheets:number, placements:number, blanks:number }}
 */
export function layoutStats(layout) {
  let placements = 0; let blanks = 0;
  for (const s of layout.sheets) for (const it of s.items) (it.pageIndex == null ? blanks++ : placements++);
  return { sheets: layout.sheets.length, placements, blanks };
}

/**
 * Attach merge records to a layout. Each returned item carries `recordIndex`.
 * - default: the whole layout is repeated once per record (record 1's sheets, then record 2's, …);
 * - `perCell: true` (for 'repeat' mode, e.g. labels and badges): every cell of a sheet takes the next record,
 *   so a 10-up sheet holds 10 different records; unused cells of the final sheet become blanks.
 * @param {{sheets: Array<object>, perSheet?: number, mode?: string}} layout result of computeLayout
 * @param {number} recordCount
 * @param {{perCell?: boolean}} [opts]
 * @returns {object} a new layout (input is not modified)
 */
export function applyRecords(layout, recordCount, opts = {}) {
  const n = Math.max(0, Math.floor(recordCount || 0));
  const copySheet = (s, fn) => ({ ...s, marks: s.marks.map((m) => ({ ...m })), items: s.items.map((it, j) => fn({ ...it, bleed: { ...it.bleed } }, j)) });
  const sheets = [];
  if (!n) {
    for (const s of layout.sheets) sheets.push(copySheet(s, (it) => ({ ...it, recordIndex: null })));
  } else if (opts.perCell && layout.mode === 'repeat') {
    for (let start = 0; start < n; start += layout.perSheet) {
      for (const s of layout.sheets) {
        sheets.push(copySheet(s, (it, j) => (start + j < n
          ? { ...it, recordIndex: start + j }
          : { ...it, pageIndex: null, recordIndex: null })));
      }
    }
  } else {
    for (let r = 0; r < n; r++) for (const s of layout.sheets) sheets.push(copySheet(s, (it) => ({ ...it, recordIndex: r })));
  }
  return { ...layout, sheets };
}
