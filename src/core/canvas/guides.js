// Non-printing layout guides drawn over a page on the canvas: margins, columns, baseline grid and
// ruler guides. They live in each page slot's guides layer (document coordinates, scaled with the
// page) and are never part of export rendering.

import { app } from '../app.js';
import { prefs } from '../prefs.js';
import { h } from '../ui/dom.js';
import { pageMargins, columnEdges } from '../geometry.js';

/** Ruler guides of the editing surface (pages have page.guides; masters get one lazily). */
export function guidesOf(page) {
  return (page && page.guides) || { v: [], h: [] };
}

/**
 * (Re)draw the guides layer of a slot.
 * @param {object} cv canvas controller
 * @param {{ page: object, index: number, guidesEl: HTMLElement }} slot
 */
export function drawGuides(cv, slot) {
  const doc = app.doc;
  const g = prefs.get('guides') || {};
  const W = doc.setup.width, H = doc.setup.height;
  const pi = slot.index < 0 ? 0 : slot.index;
  const out = [];
  if (g.grid && doc.setup.grid && doc.setup.grid.size > 1) {
    out.push(h('div', { class: 'grid-guide', style: { backgroundSize: `${doc.setup.grid.size}px ${doc.setup.grid.size}px` } }));
  }
  if (g.margins) {
    const m = pageMargins(doc, pi);
    out.push(h('div', { class: 'margin-guide', style: { left: `${m.left}px`, top: `${m.top}px`, width: `${Math.max(0, W - m.left - m.right)}px`, height: `${Math.max(0, H - m.top - m.bottom)}px` } }));
  }
  if (g.columns && (doc.setup.columns?.count || 1) > 1) {
    const m = pageMargins(doc, pi);
    for (const c of columnEdges(doc, pi)) {
      out.push(h('div', { class: 'column-guide', style: { left: `${c.left}px`, top: `${m.top}px`, width: `${c.right - c.left}px`, height: `${Math.max(0, H - m.top - m.bottom)}px` } }));
    }
  }
  if (g.ruler !== false) {
    const gd = guidesOf(slot.page);
    (gd.v || []).forEach((x, i) => out.push(h('div', { class: 'rguide v', dataset: { axis: 'v', index: String(i) }, style: { left: `${x}px` } })));
    (gd.h || []).forEach((y, i) => out.push(h('div', { class: 'rguide h', dataset: { axis: 'h', index: String(i) }, style: { top: `${y}px` } })));
  }
  slot.guidesEl.replaceChildren(...out);
  cv.spread.classList.toggle('show-boundaries', !!g.boundaries);
}
