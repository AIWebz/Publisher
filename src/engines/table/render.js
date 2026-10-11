// Table renderer.
// Contract: renderTable(node, el, rctx) fills `node` (the element's box) with the table.
//   rctx = { doc, mode: 'edit'|'export'|'thumb', resolveField(name) -> string|null }
//   Each visible cell is a <td data-r data-c> containing one <div class="folio-tcell"> that holds the
//   cell HTML (the in-cell editing root). Returns { contentHeight, overflow }.

import { resolveColor, resolveFont, fillToCSS } from '../../core/theme.js';
import { substituteFields } from '../text/fields.js';

const STYLE_ID = 'folio-table-css';
const CSS = `
.folio-table{border-collapse:collapse;table-layout:fixed;border-spacing:0;margin:0}
.folio-table td{overflow:hidden;overflow-wrap:break-word;word-break:normal;box-sizing:border-box}
.folio-table .folio-tcell{min-height:1em;outline:none;overflow-wrap:break-word}
.folio-table .folio-tcell p{margin:var(--folio-tsb,0) 0 var(--folio-tsa,0)}
.folio-table .folio-tcell ul,.folio-table .folio-tcell ol{margin:0;padding-left:1.4em}
.folio-table .folio-tcell p:empty::before{content:'\\200b'}
.folio-table .field{white-space:nowrap}
`;

function ensureStyles(d) {
  if (!d || d.getElementById(STYLE_ID)) return;
  const s = d.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  (d.head || d.documentElement).appendChild(s);
}

const DASH_CSS = { solid: 'solid', dash: 'dashed', longDash: 'dashed', dashDot: 'dashed', dot: 'dotted' };

/**
 * Model stroke -> CSS border value.
 * @param {object} doc
 * @param {{color:string,width:number,dash?:string}|null} stroke
 * @returns {string}
 */
export function strokeToBorder(doc, stroke) {
  if (!stroke || !(stroke.width > 0)) return 'none';
  return `${stroke.width}px ${DASH_CSS[stroke.dash] || 'solid'} ${resolveColor(doc, stroke.color)}`;
}

/**
 * Render a table element into `node`.
 * @param {HTMLElement} node element box
 * @param {object} el table element
 * @param {{doc:object, mode?:string, resolveField?:(name:string)=>string|null}} rctx
 * @returns {{contentHeight:number, overflow:boolean}}
 */
export function renderTable(node, el, rctx = {}) {
  const d = node.ownerDocument;
  const doc = rctx.doc;
  const mode = rctx.mode || 'edit';
  const resolve = typeof rctx.resolveField === 'function' ? rctx.resolveField : () => null;
  ensureStyles(d);
  const st = el.style || {};
  const cols = el.cols || [];
  const rows = el.rows || [];
  const totalW = cols.reduce((s, v) => s + v, 0);

  const tbl = d.createElement('table');
  tbl.className = `folio-table folio-table-${mode}`;
  const ts = tbl.style;
  ts.width = `${totalW}px`;
  ts.background = fillToCSS(doc, el.fill);
  ts.fontFamily = resolveFont(doc, st.font);
  ts.fontSize = `${st.size || 10}pt`;
  ts.color = resolveColor(doc, st.color || '@ink');
  ts.fontWeight = st.bold ? '700' : '400';
  ts.fontStyle = st.italic ? 'italic' : 'normal';
  ts.textDecoration = st.underline ? 'underline' : 'none';
  ts.textTransform = st.caps ? 'uppercase' : 'none';
  ts.letterSpacing = `${st.letterSpacing || 0}px`;
  ts.lineHeight = String(st.lineHeight || 1.25);
  ts.setProperty('--folio-tsb', `${st.spaceBefore || 0}px`);
  ts.setProperty('--folio-tsa', `${st.spaceAfter || 0}px`);
  if (mode === 'thumb') ts.pointerEvents = 'none';

  const cg = d.createElement('colgroup');
  for (const w of cols) {
    const col = d.createElement('col');
    col.style.width = `${w}px`;
    cg.appendChild(col);
  }
  tbl.appendChild(cg);

  const tbody = d.createElement('tbody');
  const header = !!el.headerRow;
  const headerFill = el.headerFill || null;
  const headerColor = el.headerColor || null;
  const bandFill = el.bandFill || '@light';
  (el.cells || []).forEach((row, r) => {
    const tr = d.createElement('tr');
    tr.style.height = `${rows[r] || 0}px`;
    tr.dataset.r = String(r);
    const isHeader = header && r === 0;
    const bodyIndex = header ? r - 1 : r;
    if (isHeader) tr.className = 'folio-thead';
    row.forEach((cell, c) => {
      if (!cell || cell.covered) return;
      const td = d.createElement('td');
      td.dataset.r = String(r);
      td.dataset.c = String(c);
      if ((cell.rowSpan || 1) > 1) td.rowSpan = cell.rowSpan;
      if ((cell.colSpan || 1) > 1) td.colSpan = cell.colSpan;
      const s = td.style;
      let fill = cell.fill;
      if (!fill && isHeader && headerFill) fill = headerFill;
      if (!fill && !isHeader && el.banded && bodyIndex % 2 === 1) fill = bandFill;
      s.background = fill ? resolveColor(doc, fill) : 'transparent';
      s.padding = `${cell.padding ?? 4}px`;
      s.verticalAlign = cell.valign || 'top';
      s.textAlign = cell.align || st.align || 'left';
      const b = cell.borders || {};
      s.borderTop = strokeToBorder(doc, b.top || el.border);
      s.borderRight = strokeToBorder(doc, b.right || el.border);
      s.borderBottom = strokeToBorder(doc, b.bottom || el.border);
      s.borderLeft = strokeToBorder(doc, b.left || el.border);
      if (isHeader) {
        s.fontWeight = '700';
        if (headerColor) s.color = resolveColor(doc, headerColor);
        td.classList.add('folio-th');
      }
      const inner = d.createElement('div');
      inner.className = 'folio-tcell';
      inner.innerHTML = substituteFields(cell.html || '', resolve);
      td.appendChild(inner);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  node.replaceChildren(tbl);

  const fallback = rows.reduce((s, v) => s + v, 0);
  const measured = tbl.offsetHeight;
  const contentHeight = measured > 0 ? measured : fallback;
  return { contentHeight, overflow: contentHeight > (el.h || fallback) + 0.5 };
}

/**
 * Rendered row heights (layout px, unaffected by zoom transforms) of the table rendered into `node`.
 * @param {HTMLElement} node
 * @returns {number[]}
 */
export function measureRowHeights(node) {
  const tbl = node.querySelector('table.folio-table');
  if (!tbl) return [];
  return [...tbl.tBodies[0].rows].map((tr) => tr.getBoundingClientRect().height / scaleOf(tbl));
}

function scaleOf(tbl) {
  const w = tbl.offsetWidth;
  const rw = tbl.getBoundingClientRect().width;
  return w > 0 && rw > 0 ? rw / w : 1;
}

/**
 * The cell slot (anchor coordinates) under a DOM event target inside a rendered table, or null.
 * @param {EventTarget} target
 * @returns {{r:number,c:number,td:HTMLElement}|null}
 */
export function cellFromTarget(target) {
  const td = target && target.closest ? target.closest('td[data-r][data-c]') : null;
  return td ? { r: +td.dataset.r, c: +td.dataset.c, td } : null;
}
