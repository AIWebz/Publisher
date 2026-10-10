// STUB — replaced by the table engine.
// Contract: renderTable(node, el, rctx) fills `node` (the element's box) with the table.
//   rctx = { doc, mode: 'edit'|'export'|'thumb', resolveField(name) -> string|null }
//   Cells carry data-r / data-c attributes for hit testing and in-cell editing.
import { resolveColor } from '../../core/theme.js';
export function renderTable(node, el, rctx) {
  const t = document.createElement('table');
  t.style.cssText = 'width:100%;height:100%;border-collapse:collapse;table-layout:fixed';
  el.cells.forEach((row, r) => {
    const tr = t.insertRow();
    row.forEach((cell, c) => {
      if (cell.covered) return;
      const td = tr.insertCell();
      td.dataset.r = r; td.dataset.c = c;
      td.rowSpan = cell.rowSpan || 1; td.colSpan = cell.colSpan || 1;
      td.style.border = `${el.border.width}px solid ${resolveColor(rctx.doc, el.border.color)}`;
      td.innerHTML = cell.html;
    });
  });
  node.replaceChildren(t);
}
