// Small construction kit used by the template catalog, building blocks and calendar generator.
// Everything is built with the factories in core/model.js; story and cell HTML is passed through
// sanitizeHtml so templates only ever contain canonical, whitelisted rich text.

import { createDocument, createPage, createMaster, createTextFrame, createElement, updateGroupBounds } from '../../core/model.js';
import { sanitizeHtml } from '../text/sanitize.js';
import { fieldSpan } from '../text/fields.js';

/** Pixels per inch / millimetre / point (the model stores CSS px at 96 dpi). */
export const IN = 96;
export const MM = 96 / 25.4;
export const PT = 96 / 72;

/** Round to 2 decimals (keeps generated geometry tidy). */
export const r2 = (v) => Math.round(v * 100) / 100;

/** Merge-field atom HTML (see engines/text/fields.js). */
export const field = (name) => fieldSpan(name);

/** Escape plain text for HTML. */
export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Paragraph HTML. `css` is an optional inline block style ("text-align: center; margin-bottom: 6px").
 * @param {string} inner inline HTML
 * @param {string} [css]
 * @returns {string}
 */
export function p(inner, css = '') {
  return css ? `<p style="${css}">${inner}</p>` : `<p>${inner}</p>`;
}

/**
 * Inline span HTML with a style.
 * @param {string} inner
 * @param {string} css
 * @returns {string}
 */
export function span(inner, css) {
  return `<span style="${css}">${inner}</span>`;
}

/** Inline style snippets for rich text. */
export const css = {
  accent: 'color: var(--folio-accent)',
  accent2: 'color: var(--folio-accent2)',
  muted: 'color: var(--folio-muted)',
  paper: 'color: var(--folio-paper)',
  ink: 'color: var(--folio-ink)',
  heading: 'font-family: var(--folio-heading)',
  body: 'font-family: var(--folio-body)',
  caps: 'text-transform: uppercase; letter-spacing: 2px',
  size: (pt) => `font-size: ${pt}pt`
};

/** Fill from shorthand: colour string -> solid; null/'none' -> none; objects pass through. */
export function fillOf(v) {
  if (v === null || v === undefined || v === 'none' || v === 'transparent') return { type: 'none' };
  if (typeof v === 'string') return { type: 'solid', color: v };
  return v;
}

/** Stroke shorthand. */
export function strokeOf(color = '@ink', width = 1, dash = 'solid') {
  return { color, width, dash };
}

/**
 * Create a publication with the given setup (thin wrapper over createDocument).
 * @param {object} opts createDocument options (title, size|width/height, orientation, margins (px), columns,
 *   schemeId, fontSchemeId, pages, category, facing)
 * @returns {object} Doc
 */
export function newDoc(opts) {
  const doc = createDocument(opts);
  doc.meta.category = opts.category || '';
  if (opts.subject) doc.meta.subject = opts.subject;
  return doc;
}

/**
 * Text frame with its story added to `doc`. Padding defaults to 0 so frames align exactly with rules
 * and shapes; pass `props.padding` for boxed text.
 * @param {object} doc
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {string} html story HTML (paragraphs)
 * @param {object} [style] TextStyle overrides
 * @param {object} [props] other element properties
 * @returns {object} text element
 */
export function text(doc, x, y, w, h, html, style = {}, props = {}) {
  return createTextFrame(doc, {
    x: r2(x), y: r2(y), w: r2(w), h: r2(h), padding: { top: 0, right: 0, bottom: 0, left: 0 }, ...props, style
  }, sanitizeHtml(html));
}

/**
 * Basic shape.
 * @param {string} kind SHAPE_KINDS value
 * @returns {object} shape element
 */
export function shape(kind, x, y, w, h, fill = '@accent', props = {}) {
  return createElement('shape', {
    shape: kind, x: r2(x), y: r2(y), w: r2(w), h: r2(h), fill: fillOf(fill), stroke: strokeOf('@ink', 0), ...props
  });
}

/** Filled rectangle. */
export function rect(x, y, w, h, fill = '@accent', props = {}) {
  return shape('rect', x, y, w, h, fill, props);
}

/** Unfilled rectangle outline (border frames). */
export function outline(x, y, w, h, color = '@ink', width = 1, props = {}) {
  return shape('rect', x, y, w, h, null, { stroke: strokeOf(color, width, props.dash || 'solid'), ...props });
}

/**
 * Horizontal rule whose stroke runs along `y` from x to x+w.
 * @returns {object} line element
 */
export function hline(x, y, w, color = '@ink', width = 1, props = {}) {
  return createElement('line', { x: r2(x), y: r2(y - 6), w: r2(w), h: 12, stroke: strokeOf(color, width, props.dash || 'solid'), ...props });
}

/**
 * Vertical rule along `x` from y to y+len (a line rotated 90°).
 * @returns {object} line element
 */
export function vline(x, y, len, color = '@ink', width = 1, props = {}) {
  return createElement('line', {
    x: r2(x - len / 2), y: r2(y + len / 2 - 6), w: r2(len), h: 12, rot: 90, stroke: strokeOf(color, width, props.dash || 'solid'), ...props
  });
}

/**
 * Picture placeholder (image element with no asset).
 * @returns {object} image element
 */
export function picture(x, y, w, h, props = {}) {
  return createElement('image', {
    name: 'Picture placeholder', x: r2(x), y: r2(y), w: r2(w), h: r2(h), fill: fillOf('@light'), ...props
  });
}

/**
 * Table cell with defaults (html is sanitized).
 * @param {string} html
 * @param {object} [props] fill, align, valign, padding, rowSpan, colSpan, covered, borders
 * @returns {object} Cell
 */
export function cell(html, props = {}) {
  return {
    html: sanitizeHtml(html && /^\s*<(p|ul|ol)[\s>]/i.test(html) ? html : `<p>${html ?? ''}</p>`),
    fill: null, align: null, valign: 'middle', padding: 4, rowSpan: 1, colSpan: 1, covered: false, borders: null, ...props
  };
}

/** Split `total` into `n` widths (or proportional `weights`) that sum exactly to `total`. */
export function splitSizes(total, weights) {
  const ws = typeof weights === 'number' ? Array(weights).fill(1) : weights;
  const sum = ws.reduce((a, b) => a + b, 0);
  const out = ws.map((wt) => r2((total * wt) / sum));
  out[out.length - 1] = r2(total - out.slice(0, -1).reduce((a, b) => a + b, 0));
  return out;
}

/**
 * Table element.
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {Array<Array<string|object>>} data rows of cells (html strings or cell objects)
 * @param {object} [opts] { colWeights, rowHeights (px; must sum to h) | rowWeights, header, banded, style, border, fill, cellProps(r, c) }
 * @returns {object} table element
 */
export function table(x, y, w, h, data, opts = {}) {
  const nCols = Math.max(...data.map((r) => r.length));
  const cols = splitSizes(w, opts.colWeights || nCols);
  const rows = opts.rowHeights ? opts.rowHeights.map(r2) : splitSizes(h, opts.rowWeights || data.length);
  const cells = data.map((row, ri) => Array.from({ length: nCols }, (_, ci) => {
    const v = row[ci];
    const extra = opts.cellProps ? opts.cellProps(ri, ci) || {} : {};
    if (v && typeof v === 'object') return { ...cell(v.html, extra), ...v, html: cell(v.html).html };
    return cell(v ?? '', extra);
  }));
  return createElement('table', {
    name: opts.name || 'Table', x: r2(x), y: r2(y), w: r2(w), h: r2(rows.reduce((a, b) => a + b, 0)), cols, rows, cells,
    border: opts.border || strokeOf('@muted', 0.75), fill: fillOf(opts.fill ?? null),
    style: { font: '@body', size: 10, color: '@ink', ...(opts.style || {}) },
    headerRow: !!opts.header, banded: !!opts.banded
  });
}

/**
 * Group of elements (children keep page coordinates; bounds are recomputed).
 * @param {string} name
 * @param {object[]} children
 * @returns {object} group element
 */
export function group(name, children) {
  return updateGroupBounds(createElement('group', { name, children }));
}

/**
 * Append a page with `elements` to `doc`.
 * @param {object} doc
 * @param {object[]} elements
 * @param {object} [props] page properties (background, masterId, repeat, …)
 * @returns {object} the page
 */
export function addPage(doc, elements = [], props = {}) {
  const page = createPage(doc, { elements, ...props });
  doc.pages.push(page);
  return page;
}

/** Replace the document's pages with freshly built ones: `defs` = [[elements, props?], …]. */
export function setPages(doc, defs) {
  doc.pages = [];
  for (const d of defs) addPage(doc, d[0], d[1] || {});
  return doc;
}

/** Solid background for a page. */
export const solidBg = (color) => ({ type: 'solid', color });

/**
 * Add a master page.
 * @returns {object} master
 */
export function addMaster(doc, name, elements = [], props = {}) {
  const m = createMaster(name, { elements, ...props });
  doc.masters.push(m);
  return m;
}

/**
 * Link text frames into one chain sharing the first frame's story (frame.next).
 * Extra stories created for the other frames are removed.
 * @param {object} doc
 * @param {object[]} frames in flow order
 * @returns {object[]} frames
 */
export function linkFrames(doc, frames) {
  const storyId = frames[0].storyId;
  frames.forEach((f, i) => {
    if (f.storyId !== storyId) { delete doc.stories[f.storyId]; f.storyId = storyId; }
    f.next = i < frames.length - 1 ? frames[i + 1].id : null;
  });
  return frames;
}

/**
 * Lay out `count` slots in a grid (row-major) and build each with `make(i, x, y)`; each result is
 * grouped as 'slot-N'. Returns { groups, repeat } where repeat is the page.repeat metadata.
 * @param {object} g { cols, rows, x, y, w, h, gapX, gapY }
 * @param {(index: number, x: number, y: number) => object[]} make
 */
export function slotGrid(g, make) {
  const groups = [];
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const i = r * g.cols + c;
      const x = g.x + c * (g.w + (g.gapX || 0));
      const y = g.y + r * (g.h + (g.gapY || 0));
      groups.push(group(`slot-${i + 1}`, make(i, r2(x), r2(y))));
    }
  }
  const repeat = { cols: g.cols, rows: g.rows, x: r2(g.x), y: r2(g.y), w: r2(g.w), h: r2(g.h), gapX: r2(g.gapX || 0), gapY: r2(g.gapY || 0) };
  return { groups, repeat };
}
