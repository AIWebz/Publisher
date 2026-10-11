// Tables: insert, cell selection, in-cell rich-text editing (Tab navigation), Table Design and Table
// Layout contextual tabs.

import { app } from '../../core/app.js';
import { registry } from '../../core/registry.js';
import { findElement } from '../../core/model.js';
import { h } from '../../core/ui/dom.js';
import { colorPicker } from '../../core/ui/colorpicker.js';
import * as T from '../../engines/table/model.js';
import { cellFromTarget } from '../../engines/table/render.js';
import { sanitizeHtml } from '../../engines/text/sanitize.js';
import './tables.css';

/** Current cell range per table: { id, r1, c1, r2, c2 } */
let range = null;
let edit = null; // { id, r, c, root, observer }

const tableSel = (ctx) => (ctx.selection || []).length === 1 && ctx.selection[0].type === 'table';
const tbl = () => (tableSel(app.ctx()) ? app.selection[0] : null);
const curRange = (t) => (range && t && range.id === t.id ? T.normalizeRange(t, range) : { r1: 0, c1: 0, r2: t.rows.length - 1, c2: t.cols.length - 1 });

function onTable(label, fn) {
  const t = tbl(); if (!t) return;
  commitCell();
  app.transact(label, (doc) => { const hit = findElement(doc, t.id); if (hit) fn(hit.el, doc); });
}

// ---------------------------------------------------------------- insert
registry.command({
  id: 'table.insert', label: 'Table', icon: 'table', enabled: (ctx) => !!ctx.doc,
  run: async (ctx, arg) => {
    let rows = arg && arg.rows, cols = arg && arg.cols;
    if (!rows || !cols) {
      const r = await app.ui.dialog({ title: 'Insert Table', fields: [
        { name: 'rows', label: 'Rows', type: 'number', value: 4, min: 1, max: 100, step: 1, half: true },
        { name: 'cols', label: 'Columns', type: 'number', value: 3, min: 1, max: 30, step: 1, half: true },
        { name: 'header', label: '', type: 'checkbox', text: 'Header row', value: true }],
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Insert', value: 'ok', primary: true }] });
      if (!r || r.button !== 'ok') return;
      rows = Math.max(1, Math.min(100, Math.round(+r.values.rows))); cols = Math.max(1, Math.min(30, Math.round(+r.values.cols)));
      arg = { header: r.values.header };
    }
    const doc = app.doc;
    const w = Math.min(doc.setup.width - doc.setup.margins.left - doc.setup.margins.right, cols * 120);
    const hgt = rows * 28;
    let id = null;
    app.transact('Insert Table', (d) => {
      const t = T.createTable(rows, cols, { x: (d.setup.width - w) / 2, y: (d.setup.height - hgt) / 2, w, h: hgt, headerRow: arg && arg.header !== false });
      t.wrap = { type: 'square' };
      if (t.headerRow) T.applyTableStyle(t, 'header');
      app.page.elements.push(t);
      id = t.id;
      app.select([t.id]);
    });
    range = { id, r1: 0, c1: 0, r2: 0, c2: 0 };
  }
});
const quickSizes = [[2, 2], [3, 3], [4, 3], [5, 4], [6, 4], [8, 5], [3, 5], [10, 2]];
registry.group({ tab: 'insert', id: 'tables', label: 'Tables', order: 10, items: [
  { type: 'menu', label: 'Table', icon: 'table', size: 'large', items: () => [
    ...quickSizes.map(([r, c]) => ({ label: `${c} × ${r} table`, command: 'table.insert', arg: { rows: r, cols: c, header: true } })), '-',
    { label: 'Insert Table…', command: 'table.insert' }] }
] });

// ---------------------------------------------------------------- cell selection & editing
function cellDiv(t, r, c) {
  const node = app.canvas && app.canvas.nodeFor(t.id);
  return node && node.querySelector(`td[data-r="${r}"][data-c="${c}"] .folio-tcell`);
}
function paintRange() {
  document.querySelectorAll('.folio-table td.cell-sel').forEach((td) => td.classList.remove('cell-sel'));
  const t = tbl();
  if (!t || !range || range.id !== t.id) return;
  const node = app.canvas && app.canvas.nodeFor(t.id);
  if (!node) return;
  const r = T.normalizeRange(t, range);
  node.querySelectorAll('td[data-r]').forEach((td) => {
    const rr = +td.dataset.r, cc = +td.dataset.c;
    if (rr >= r.r1 && rr <= r.r2 && cc >= r.c1 && cc <= r.c2) td.classList.add('cell-sel');
  });
}
app.on('render', () => requestAnimationFrame(paintRange));
app.on('selection', () => { const t = tbl(); if (!t || (range && range.id !== t.id)) { if (edit && (!t || t.id !== edit.id)) stopCell(); if (!t) range = null; } requestAnimationFrame(paintRange); });

function startCell(t, r, c) {
  stopCell();
  const a = T.cellAt(t, r, c) || { r, c };
  const div = cellDiv(t, a.r, a.c);
  if (!div) return;
  div.contentEditable = 'true';
  div.spellcheck = true;
  div.focus();
  const sel = getSelection(); const rg = document.createRange(); rg.selectNodeContents(div); rg.collapse(false); sel.removeAllRanges(); sel.addRange(rg);
  edit = { id: t.id, r: a.r, c: a.c, root: div, start: div.innerHTML };
  range = { id: t.id, r1: a.r, c1: a.c, r2: a.r, c2: a.c };
  div.addEventListener('keydown', onCellKey);
  div.addEventListener('blur', onBlur);
  app.setEditing({ frameId: t.id, root: div });
  paintRange();
}
function onBlur() { setTimeout(() => { if (edit && document.activeElement !== edit.root && !document.querySelector('.dlg-backdrop, .menu, .popover')) stopCell(); }, 0); }
/** Write the edited cell back into the model (one undo step). */
function commitCell() {
  if (!edit) return;
  const { id, r, c, root } = edit;
  const html = sanitizeHtml(root.innerHTML);
  const t = findElement(app.doc, id);
  if (!t || !t.el.cells[r] || !t.el.cells[r][c] || t.el.cells[r][c].html === html) return;
  edit.start = root.innerHTML;
  const keep = edit;
  edit = null; // avoid re-entry while the transaction re-renders
  app.transact('Edit Table Text', (doc) => { const hit = findElement(doc, id); if (hit) hit.el.cells[r][c].html = html; }, { coalesce: `cell:${id}:${r}:${c}` });
  edit = keep;
}
function stopCell() {
  if (!edit) return;
  const e = edit;
  commitCell();
  e.root.removeEventListener('keydown', onCellKey);
  e.root.removeEventListener('blur', onBlur);
  e.root.contentEditable = 'false';
  edit = null;
  app.setEditing(null);
}
app.addFlusher(() => commitCell());

function onCellKey(e) {
  if (!edit) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopCell(); return; }
  if (e.key === 'Tab') {
    e.preventDefault(); e.stopPropagation();
    const id = edit.id, r = edit.r, c = edit.c;
    stopCell();
    let t = findElement(app.doc, id).el;
    let next = T.nextCell(t, r, c, e.shiftKey);
    if (!next && !e.shiftKey) {
      app.transact('Insert Row', (doc) => { T.insertRow(findElement(doc, id).el, t.rows.length - 1, 'below', 1); });
      t = findElement(app.doc, id).el;
      next = T.nextCell(t, r, c, false);
    }
    if (next) requestAnimationFrame(() => startCell(findElement(app.doc, id).el, next.r, next.c));
  }
}

// Clicks inside an already-selected table select cells (edges still move the table); double-click edits.
document.addEventListener('pointerdown', (e) => {
  const td = e.target.closest && e.target.closest('.folio-table td');
  const t = tbl();
  if (!td || !t || e.button !== 0) return;
  const node = app.canvas && app.canvas.nodeFor(t.id);
  if (!node || !node.contains(td)) return;
  const b = node.getBoundingClientRect();
  const edge = 7;
  if (e.clientX - b.left < edge || b.right - e.clientX < edge || e.clientY - b.top < edge || b.bottom - e.clientY < edge) return;
  if (edit && edit.root.contains(e.target)) { e.stopPropagation(); return; }
  e.stopPropagation(); e.preventDefault();
  const r = +td.dataset.r, c = +td.dataset.c;
  if (edit) stopCell();
  if (e.shiftKey && range && range.id === t.id) range = { ...range, r2: r, c2: c };
  else range = { id: t.id, r1: r, c1: c, r2: r, c2: c };
  paintRange();
  if (app.ribbon && app.ribbon.update) app.ribbon.update();
  const move = (ev) => {
    const over = document.elementFromPoint(ev.clientX, ev.clientY);
    const cell = over && over.closest && over.closest('.folio-table td');
    if (cell && node.contains(cell)) { range = { ...range, r2: +cell.dataset.r, c2: +cell.dataset.c }; paintRange(); }
  };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}, true);

const base = registry.getElementType('table') || {};
registry.elementType('table', {
  ...base,
  onDoubleClick(el, ctx) {
    const info = ctx.event && cellFromTarget(ctx.event.target);
    if (el.locked) return;
    app.select([el.id]);
    requestAnimationFrame(() => startCell(findElement(app.doc, el.id).el, info ? info.r : 0, info ? info.c : 0));
  }
});

// ---------------------------------------------------------------- layout commands
const cmd = (id, label, icon, fn, enabled = tableSel) => registry.command({ id, label, icon, enabled, run: (ctx, arg) => fn(arg) });
const R = () => curRange(tbl());
cmd('table.insertAbove', 'Insert Above', 'row-above', () => { const r = R(); onTable('Insert Row', (t) => T.insertRow(t, r.r1, 'above', 1)); });
cmd('table.insertBelow', 'Insert Below', 'row-below', () => { const r = R(); onTable('Insert Row', (t) => T.insertRow(t, r.r2, 'below', 1)); });
cmd('table.insertLeft', 'Insert Left', 'col-left', () => { const r = R(); onTable('Insert Column', (t) => T.insertColumn(t, r.c1, 'left', 1)); });
cmd('table.insertRight', 'Insert Right', 'col-right', () => { const r = R(); onTable('Insert Column', (t) => T.insertColumn(t, r.c2, 'right', 1)); });
cmd('table.deleteRows', 'Delete Rows', 'row-delete', () => { const r = R(); onTable('Delete Rows', (t) => { if (!T.deleteRows(t, r.r1, r.r2)) app.ui.toast('A table needs at least one row. Delete the table instead.'); }); range = null; });
cmd('table.deleteCols', 'Delete Columns', 'col-delete', () => { const r = R(); onTable('Delete Columns', (t) => { if (!T.deleteColumns(t, r.c1, r.c2)) app.ui.toast('A table needs at least one column. Delete the table instead.'); }); range = null; });
cmd('table.delete', 'Delete Table', 'trash', () => { stopCell(); app.exec('edit.delete'); });
cmd('table.merge', 'Merge Cells', 'merge-cells', () => { const r = R(); onTable('Merge Cells', (t) => { if (!T.mergeCells(t, r)) app.ui.toast('Select two or more cells to merge.'); }); }, (ctx) => tableSel(ctx) && !!range && T.canMerge(ctx.selection[0], T.normalizeRange(ctx.selection[0], range)));
cmd('table.split', 'Split Cells', 'split-cells', () => { const r = R(); onTable('Split Cells', (t) => { T.splitRange(t, r); }); });
cmd('table.distributeRows', 'Distribute Rows', 'distribute-v', () => { const r = R(); onTable('Distribute Rows', (t) => T.distributeRows(t, r.r1, r.r2 > r.r1 ? r.r2 : t.rows.length - 1)); });
cmd('table.distributeCols', 'Distribute Columns', 'distribute-h', () => { const r = R(); onTable('Distribute Columns', (t) => T.distributeColumns(t, r.c1, r.c2 > r.c1 ? r.c2 : t.cols.length - 1)); });
cmd('table.selectTable', 'Select Table', 'table', () => { const t = tbl(); range = { id: t.id, r1: 0, c1: 0, r2: t.rows.length - 1, c2: t.cols.length - 1 }; paintRange(); });
cmd('table.selectRow', 'Select Row', 'row-below', () => { const t = tbl(); const r = R(); range = { id: t.id, r1: r.r1, c1: 0, r2: r.r2, c2: t.cols.length - 1 }; paintRange(); });
cmd('table.selectCol', 'Select Column', 'col-right', () => { const t = tbl(); const r = R(); range = { id: t.id, r1: 0, c1: r.c1, r2: t.rows.length - 1, c2: r.c2 }; paintRange(); });
cmd('table.align', 'Cell Alignment', 'align-center', (arg) => { const r = R(); onTable('Cell Alignment', (t) => T.setCellProps(t, r, arg)); });
cmd('table.cellSize', 'Cell Size…', 'page-size', async () => {
  const t = tbl(); const r = R();
  const res = await app.ui.dialog({ title: 'Cell Size', fields: [
    { name: 'w', label: 'Column width', type: 'length', value: t.cols[r.c1], min: 12, half: true },
    { name: 'h', label: 'Row height', type: 'length', value: t.rows[r.r1], min: 10, half: true },
    { name: 'pad', label: 'Cell margins', type: 'length', value: (t.cells[r.r1][r.c1] || {}).padding ?? 4, min: 0, half: true }],
  buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'OK', value: 'ok', primary: true }] });
  if (!res || res.button !== 'ok') return;
  onTable('Cell Size', (tt) => {
    for (let c = r.c1; c <= r.c2; c++) T.setColumnWidth(tt, c, res.values.w);
    for (let rr = r.r1; rr <= r.r2; rr++) T.setRowHeight(tt, rr, res.values.h);
    T.setCellProps(tt, r, { padding: res.values.pad });
  });
});

// ---------------------------------------------------------------- design commands
cmd('table.style', 'Table Style', 'table', (id) => onTable('Table Style', (t) => T.applyTableStyle(t, id)));
registry.command({ id: 'table.headerRow', label: 'Header Row', icon: 'row-above', enabled: tableSel, checked: (ctx) => tableSel(ctx) && !!ctx.selection[0].headerRow, run: () => onTable('Header Row', (t) => { t.headerRow = !t.headerRow; }) });
registry.command({ id: 'table.banded', label: 'Banded Rows', icon: 'grid', enabled: tableSel, checked: (ctx) => tableSel(ctx) && !!ctx.selection[0].banded, run: () => onTable('Banded Rows', (t) => { t.banded = !t.banded; }) });
cmd('table.fill', 'Cell Fill', 'fill', (v) => {
  const r = R();
  const go = (val) => onTable('Cell Fill', (t) => T.setCellProps(t, r, { fill: val === 'transparent' ? null : val }));
  if (v) go(v); else colorPicker(document.querySelector('[data-command="table.fill"]') || document.body, '@light', go, { title: 'Cell Fill' });
});
let borderStroke = { color: '@ink', width: 1, dash: 'solid' };
cmd('table.borders', 'Borders', 'outline', (which) => { const r = R(); onTable('Borders', (t) => T.setBorders(t, r, which || 'all', which === 'none' ? null : { ...borderStroke })); });
cmd('table.borderStyle', 'Border Colour & Weight…', 'outline', async () => {
  const res = await app.ui.dialog({ title: 'Border Style', fields: [
    { name: 'color', label: 'Colour', type: 'color', value: borderStroke.color, half: true, allowNone: false },
    { name: 'w', label: 'Weight (pt)', type: 'number', value: borderStroke.width * 0.75, min: 0.25, max: 12, step: 0.25, half: true },
    { name: 'dash', label: 'Style', type: 'select', value: borderStroke.dash, options: [{ value: 'solid', label: 'Solid' }, { value: 'dash', label: 'Dashed' }, { value: 'dot', label: 'Dotted' }] }],
  buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'OK', value: 'ok', primary: true }] });
  if (res && res.button === 'ok') borderStroke = { color: res.values.color, width: (+res.values.w || 0.75) / 0.75, dash: res.values.dash };
});

const isTable = (ctx) => tableSel(ctx);
registry.group({ tab: 'tableDesign', id: 'styles', label: 'Table Styles', order: 10, items: [
  { type: 'menu', label: 'Styles', icon: 'table', size: 'large', items: () => T.TABLE_STYLES.map((s) => ({ label: s.label, command: 'table.style', arg: s.id })) },
  { command: 'table.headerRow', size: 'small' }, { command: 'table.banded', size: 'small' }
] });
registry.group({ tab: 'tableDesign', id: 'fill', label: 'Fill & Borders', order: 20, items: [
  { command: 'table.fill', size: 'large', label: 'Fill' },
  { type: 'menu', label: 'Borders', icon: 'outline', size: 'large', items: () => [
    ...T.BORDER_PRESETS.map((p) => ({ label: { all: 'All Borders', outside: 'Outside Borders', inside: 'Inside Borders', insideH: 'Inside Horizontal', insideV: 'Inside Vertical', top: 'Top Border', bottom: 'Bottom Border', left: 'Left Border', right: 'Right Border', none: 'No Border' }[p] || p, command: 'table.borders', arg: p })),
    '-', { label: 'Border Colour & Weight…', command: 'table.borderStyle' }] }
] });
registry.group({ tab: 'tableLayout', id: 'rowsCols', label: 'Rows & Columns', order: 10, items: [
  { command: 'table.insertAbove', size: 'small' }, { command: 'table.insertBelow', size: 'small' }, { command: 'table.insertLeft', size: 'small' },
  { command: 'table.insertRight', size: 'small' }, { command: 'table.deleteRows', size: 'small' }, { command: 'table.deleteCols', size: 'small' },
  { command: 'table.delete', size: 'small' }
] });
registry.group({ tab: 'tableLayout', id: 'select', label: 'Select', order: 5, items: [
  { command: 'table.selectTable', size: 'small' }, { command: 'table.selectRow', size: 'small' }, { command: 'table.selectCol', size: 'small' }
] });
registry.group({ tab: 'tableLayout', id: 'merge', label: 'Merge', order: 20, items: [
  { command: 'table.merge', size: 'large' }, { command: 'table.split', size: 'large' }
] });
registry.group({ tab: 'tableLayout', id: 'size', label: 'Cell Size', order: 30, items: [
  { command: 'table.distributeRows', size: 'small' }, { command: 'table.distributeCols', size: 'small' }, { command: 'table.cellSize', size: 'small' }
] });
registry.group({ tab: 'tableLayout', id: 'align', label: 'Alignment', order: 40, items: [
  { type: 'menu', label: 'Horizontal', icon: 'text-left', size: 'small', items: () => ['left', 'center', 'right', 'justify'].map((a) => ({ label: a[0].toUpperCase() + a.slice(1), command: 'table.align', arg: { align: a } })) },
  { type: 'menu', label: 'Vertical', icon: 'va-middle', size: 'small', items: () => ['top', 'middle', 'bottom'].map((a) => ({ label: a[0].toUpperCase() + a.slice(1), command: 'table.align', arg: { valign: a } })) }
] });
registry.contextMenu({ id: 'table', order: 30, items: (ctx) => (isTable(ctx) ? ['-',
  { command: 'table.insertAbove' }, { command: 'table.insertBelow' }, { command: 'table.insertLeft' }, { command: 'table.insertRight' },
  { command: 'table.deleteRows' }, { command: 'table.deleteCols' }, '-', { command: 'table.merge' }, { command: 'table.split' }] : []) });

const ICONS = {
  'row-above': '<rect x="3" y="11" width="18" height="9" rx="1"/><path d="M12 3v6M9 6h6"/>',
  'row-below': '<rect x="3" y="4" width="18" height="9" rx="1"/><path d="M12 15v6M9 18h6"/>',
  'col-left': '<rect x="11" y="3" width="9" height="18" rx="1"/><path d="M3 12h6M6 9v6"/>',
  'col-right': '<rect x="4" y="3" width="9" height="18" rx="1"/><path d="M15 12h6M18 9v6"/>',
  'row-delete': '<rect x="3" y="8" width="18" height="8" rx="1"/><path d="m9 10 6 4M15 10l-6 4"/>',
  'col-delete': '<rect x="8" y="3" width="8" height="18" rx="1"/><path d="m10 9 4 6M14 9l-4 6"/>',
  'merge-cells': '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M8 12h8M13 9l3 3-3 3"/>',
  'split-cells': '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M12 5v14M5 12h4M15 12h4"/>'
};
for (const [k, v] of Object.entries(ICONS)) registry.icon(k, v);
