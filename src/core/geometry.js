// Pure transform maths for the canvas: rotated resize with a fixed anchor, multi-object scaling,
// rotation about a point, flips, line endpoints, page margins and column guides.

import { elementBounds, updateGroupBounds } from './model.js';

const RAD = Math.PI / 180;

/** Normalise an angle to (-180, 180]. */
export function normAngle(a) {
  let r = ((a % 360) + 360) % 360;
  if (r > 180) r -= 360;
  return Math.abs(r) < 1e-9 ? 0 : r;
}

/** Round to 1/100 px to keep the model tidy. */
export const round2 = (v) => Math.round(v * 100) / 100;

/** Rotate point (x, y) about (cx, cy) by `deg` degrees (clockwise in screen space). */
export function rotatePoint(x, y, cx, cy, deg) {
  if (!deg) return { x, y };
  const a = deg * RAD, c = Math.cos(a), s = Math.sin(a);
  const dx = x - cx, dy = y - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

/** The four corners of a (possibly rotated) box, clockwise from top-left. */
export function boxCorners(b) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = b.rot || 0;
  return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(([x, y]) => rotatePoint(x, y, cx, cy, r));
}

/** Snap an angle to multiples of `step` degrees. */
export function snapAngle(a, step = 15) {
  return normAngle(Math.round(a / step) * step);
}

/**
 * Resize a (possibly rotated) box by dragging a handle. The opposite edge/corner stays fixed in page
 * space (or the centre, with fromCenter).
 * @param {{x:number,y:number,w:number,h:number,rot?:number}} start box at drag start
 * @param {string} handle 'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw'
 * @param {{x:number,y:number}} delta pointer movement in page coordinates since drag start
 * @param {{ keepAspect?: boolean, fromCenter?: boolean, minSize?: number }} [opts]
 * @returns {{x:number,y:number,w:number,h:number}}
 */
export function resizeBox(start, handle, delta, opts = {}) {
  const rot = start.rot || 0;
  const min = opts.minSize ?? 1;
  const a = -rot * RAD, c = Math.cos(a), s = Math.sin(a);
  const dx = delta.x * c - delta.y * s;          // pointer delta in the box's local frame
  const dy = delta.x * s + delta.y * c;
  const k = opts.fromCenter ? 2 : 1;
  const hasE = handle.includes('e'), hasW = handle.includes('w'), hasN = handle.includes('n'), hasS = handle.includes('s');
  let w = start.w, h = start.h;
  if (hasE) w = start.w + dx * k;
  if (hasW) w = start.w - dx * k;
  if (hasS) h = start.h + dy * k;
  if (hasN) h = start.h - dy * k;
  w = Math.max(min, w);
  h = Math.max(min, h);
  if (opts.keepAspect && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h;
    if ((hasE || hasW) && (hasN || hasS)) {
      if (w / start.w >= h / start.h) h = w / ratio; else w = h * ratio;
    } else if (hasE || hasW) {
      h = w / ratio;
    } else {
      w = h * ratio;
    }
    w = Math.max(min, w);
    h = Math.max(min, h);
  }
  // local offset of the new centre relative to the old centre
  let ox = 0, oy = 0;
  if (!opts.fromCenter) {
    if (hasE) ox = (w - start.w) / 2;
    else if (hasW) ox = -(w - start.w) / 2;
    if (hasS) oy = (h - start.h) / 2;
    else if (hasN) oy = -(h - start.h) / 2;
  }
  const r = rot * RAD, rc = Math.cos(r), rs = Math.sin(r);
  const cx = start.x + start.w / 2 + ox * rc - oy * rs;
  const cy = start.y + start.h / 2 + ox * rs + oy * rc;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/**
 * Scale elements laid out inside box `from` so they fill box `to` (multi-selection and group resize).
 * Mutates the elements (groups recurse and get their bounds recomputed).
 */
export function scaleElements(els, from, to) {
  const sx = from.w ? to.w / from.w : 1;
  const sy = from.h ? to.h / from.h : 1;
  const map = (x, y) => ({ x: to.x + (x - from.x) * sx, y: to.y + (y - from.y) * sy });
  const scaleOne = (el) => {
    if (el.type === 'group') {
      el.children.forEach(scaleOne);
      updateGroupBounds(el);
      return;
    }
    const c = map(el.x + el.w / 2, el.y + el.h / 2);
    const a = (el.rot || 0) * RAD;
    if (el.type === 'line') {
      // a line is exact: scale its direction vector
      const vx = Math.cos(a) * el.w * sx, vy = Math.sin(a) * el.w * sy;
      el.w = Math.max(1, Math.hypot(vx, vy));
      el.rot = normAngle(Math.atan2(vy, vx) / RAD);
    } else {
      const swap = Math.abs(Math.sin(a)) > Math.abs(Math.cos(a));
      el.w = Math.max(1, el.w * (swap ? sy : sx));
      el.h = Math.max(1, el.h * (swap ? sx : sy));
      if (el.type === 'image' && el.content) {
        const fx = swap ? sy : sx, fy = swap ? sx : sy;
        el.content = { x: el.content.x * fx, y: el.content.y * fy, w: el.content.w * fx, h: el.content.h * fy };
      }
      if (el.type === 'table') {
        const fx = swap ? sy : sx, fy = swap ? sx : sy;
        if (Array.isArray(el.cols)) el.cols = el.cols.map((v) => v * fx);
        if (Array.isArray(el.rows)) el.rows = el.rows.map((v) => v * fy);
      }
    }
    el.x = c.x - el.w / 2;
    el.y = c.y - el.h / 2;
  };
  els.forEach(scaleOne);
}

/** Rotate elements about (cx, cy) by `delta` degrees. Groups rotate their children and keep rot 0. */
export function rotateElements(els, cx, cy, delta) {
  const one = (el) => {
    if (el.type === 'group') {
      el.children.forEach(one);
      updateGroupBounds(el);
      return;
    }
    const c = rotatePoint(el.x + el.w / 2, el.y + el.h / 2, cx, cy, delta);
    el.x = c.x - el.w / 2;
    el.y = c.y - el.h / 2;
    el.rot = normAngle((el.rot || 0) + delta);
  };
  els.forEach(one);
}

/** Rotate each element about its own centre (groups: about the group centre). */
export function rotateEachElement(els, delta) {
  for (const el of els) {
    if (el.type === 'group') rotateElements([el], el.x + el.w / 2, el.y + el.h / 2, delta);
    else el.rot = normAngle((el.rot || 0) + delta);
  }
}

/**
 * Mirror elements across the vertical (axis 'h') or horizontal (axis 'v') line through `about`.
 * Pictures and shapes toggle flipH/flipV; lines swap direction; rotations mirror.
 */
export function flipElements(els, axis, about) {
  const one = (el) => {
    if (el.type === 'group') {
      el.children.forEach(one);
      updateGroupBounds(el);
      return;
    }
    const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
    if (axis === 'h') el.x = 2 * about.x - cx - el.w / 2;
    else el.y = 2 * about.y - cy - el.h / 2;
    if (el.type === 'line') {
      el.rot = normAngle(axis === 'h' ? 180 - (el.rot || 0) : -(el.rot || 0));
      return;
    }
    el.rot = normAngle(-(el.rot || 0));
    if (el.type === 'shape' || el.type === 'image') {
      if (axis === 'h') el.flipH = !el.flipH; else el.flipV = !el.flipV;
    }
  };
  els.forEach(one);
}

/** Endpoints of a line element (start, end) in page coordinates. */
export function lineEndpoints(el) {
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2, a = (el.rot || 0) * RAD;
  const hx = (Math.cos(a) * el.w) / 2, hy = (Math.sin(a) * el.w) / 2;
  return [{ x: cx - hx, y: cy - hy }, { x: cx + hx, y: cy + hy }];
}

/** Box (x, y, w, h, rot) for a line from p1 to p2 with box height h. */
export function lineFromPoints(p1, p2, h) {
  const w = Math.max(1, Math.hypot(p2.x - p1.x, p2.y - p1.y));
  const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h, rot: normAngle((Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI) };
}

/** Axis-aligned bounds used for alignment/snapping (groups use their stored union box). */
export function boundsOf(el) {
  return el.type === 'group' ? { x: el.x, y: el.y, w: el.w, h: el.h } : elementBounds(el);
}

/**
 * Page margins for a page. With facing pages, left-hand (even-numbered) pages mirror the
 * left/right margins so "left" acts as the inside margin.
 */
export function pageMargins(doc, pageIndex = 0) {
  const m = doc.setup.margins;
  const mirrored = doc.setup.facing && pageIndex % 2 === 1;
  return mirrored ? { top: m.top, right: m.left, bottom: m.bottom, left: m.right } : { ...m };
}

/** Column boxes [{ left, right }] between the margins for setup.columns. */
export function columnEdges(doc, pageIndex = 0) {
  const m = pageMargins(doc, pageIndex);
  const n = Math.max(1, Math.round(doc.setup.columns?.count || 1));
  const g = Math.max(0, doc.setup.columns?.gutter || 0);
  const inner = doc.setup.width - m.left - m.right;
  const colW = (inner - (n - 1) * g) / n;
  const out = [];
  for (let i = 0; i < n; i++) {
    const left = m.left + i * (colW + g);
    out.push({ left, right: left + colW });
  }
  return out;
}
