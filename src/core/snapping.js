// Smart snapping maths: candidate targets (page edges/centre, margins, columns, ruler guides,
// grid, other objects' edges and centres) and the best snap for a moving box or edge.

import { boundsOf, pageMargins, columnEdges } from './geometry.js';

/**
 * @typedef {{ v: number, kind: string }} SnapTarget
 * @typedef {{ x: SnapTarget[], y: SnapTarget[], grid: number }} SnapTargets
 */

/**
 * Collect snap targets for a page.
 * @param {object} doc
 * @param {object} page   page (or master) whose guides apply
 * @param {number} pageIndex
 * @param {object[]} others elements that are not being moved
 * @param {{ page?: boolean, margins?: boolean, columns?: boolean, guides?: boolean, objects?: boolean, grid?: boolean }} [opts]
 * @returns {SnapTargets}
 */
export function collectSnapTargets(doc, page, pageIndex, others, opts = {}) {
  const o = { page: true, margins: true, columns: true, guides: true, objects: true, grid: false, ...opts };
  const W = doc.setup.width, H = doc.setup.height;
  const x = [], y = [];
  if (o.page) {
    x.push({ v: 0, kind: 'page' }, { v: W / 2, kind: 'center' }, { v: W, kind: 'page' });
    y.push({ v: 0, kind: 'page' }, { v: H / 2, kind: 'center' }, { v: H, kind: 'page' });
  }
  if (o.margins) {
    const m = pageMargins(doc, pageIndex);
    x.push({ v: m.left, kind: 'margin' }, { v: W - m.right, kind: 'margin' });
    y.push({ v: m.top, kind: 'margin' }, { v: H - m.bottom, kind: 'margin' });
  }
  if (o.columns && (doc.setup.columns?.count || 1) > 1) {
    for (const c of columnEdges(doc, pageIndex)) x.push({ v: c.left, kind: 'column' }, { v: c.right, kind: 'column' });
  }
  if (o.guides && page && page.guides) {
    for (const v of page.guides.v || []) x.push({ v, kind: 'guide' });
    for (const v of page.guides.h || []) y.push({ v, kind: 'guide' });
  }
  if (o.objects) {
    for (const el of others) {
      if (el.hidden) continue;
      const b = boundsOf(el);
      x.push({ v: b.x, kind: 'object' }, { v: b.x + b.w / 2, kind: 'object' }, { v: b.x + b.w, kind: 'object' });
      y.push({ v: b.y, kind: 'object' }, { v: b.y + b.h / 2, kind: 'object' }, { v: b.y + b.h, kind: 'object' });
    }
  }
  return { x, y, grid: o.grid ? Math.max(0, doc.setup.grid?.size || 0) : 0 };
}

/**
 * Best snap for any of the `values` (positions on one axis) against `targets` within `threshold`.
 * Returns { delta, v } where v is the target position, or null.
 */
export function snapAxis(values, targets, threshold, grid = 0) {
  let best = null;
  for (const val of values) {
    for (const t of targets) {
      const d = t.v - val;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta) - 1e-9)) best = { delta: d, v: t.v, kind: t.kind };
    }
    if (grid > 0) {
      const g = Math.round(val / grid) * grid;
      const d = g - val;
      // grid has lower priority than explicit targets: only wins when strictly closer by > 0.5px
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta) - 0.5)) best = { delta: d, v: g, kind: 'grid' };
    }
  }
  return best;
}

/**
 * Snap a moving box (its left/centre/right and top/middle/bottom).
 * @param {{x:number,y:number,w:number,h:number}} box candidate bounds
 * @param {SnapTargets} targets
 * @param {number} threshold in document px
 * @returns {{ dx: number, dy: number, lines: { axis: 'x'|'y', v: number, kind: string }[] }}
 */
export function snapMove(box, targets, threshold) {
  const bx = snapAxis([box.x, box.x + box.w / 2, box.x + box.w], targets.x, threshold, targets.grid);
  const by = snapAxis([box.y, box.y + box.h / 2, box.y + box.h], targets.y, threshold, targets.grid);
  const lines = [];
  if (bx) lines.push({ axis: 'x', v: bx.v, kind: bx.kind });
  if (by) lines.push({ axis: 'y', v: by.v, kind: by.kind });
  return { dx: bx ? bx.delta : 0, dy: by ? by.delta : 0, lines };
}

/**
 * Snap the edges moved by a resize handle of an axis-aligned box. Returns the adjusted box.
 * @param {{x:number,y:number,w:number,h:number}} box
 * @param {string} handle 'n'|'s'|'e'|'w'|'ne'|…
 * @param {SnapTargets} targets
 * @param {number} threshold
 */
export function snapResize(box, handle, targets, threshold, minSize = 1) {
  const out = { ...box };
  const lines = [];
  if (handle.includes('e') || handle.includes('w')) {
    const east = handle.includes('e');
    const edge = east ? box.x + box.w : box.x;
    const s = snapAxis([edge], targets.x, threshold, targets.grid);
    if (s) {
      if (east) out.w = Math.max(minSize, box.w + s.delta);
      else { out.x = box.x + s.delta; out.w = Math.max(minSize, box.w - s.delta); }
      lines.push({ axis: 'x', v: s.v, kind: s.kind });
    }
  }
  if (handle.includes('n') || handle.includes('s')) {
    const south = handle.includes('s');
    const edge = south ? box.y + box.h : box.y;
    const s = snapAxis([edge], targets.y, threshold, targets.grid);
    if (s) {
      if (south) out.h = Math.max(minSize, box.h + s.delta);
      else { out.y = box.y + s.delta; out.h = Math.max(minSize, box.h - s.delta); }
      lines.push({ axis: 'y', v: s.v, kind: s.kind });
    }
  }
  return { box: out, lines };
}

/** Snap a single point (used when drawing new objects). */
export function snapPoint(p, targets, threshold) {
  const sx = snapAxis([p.x], targets.x, threshold, targets.grid);
  const sy = snapAxis([p.y], targets.y, threshold, targets.grid);
  const lines = [];
  if (sx) lines.push({ axis: 'x', v: sx.v, kind: sx.kind });
  if (sy) lines.push({ axis: 'y', v: sy.v, kind: sy.kind });
  return { x: p.x + (sx ? sx.delta : 0), y: p.y + (sy ? sy.delta : 0), lines };
}
