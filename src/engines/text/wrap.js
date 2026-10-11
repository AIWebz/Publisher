// Text wrapping around objects (Wrap Text): which objects push text out of a text
// frame, and where. Pure geometry, no DOM.
//
// el.wrap = { type, side, dist }:
//   type: 'none' | 'square' | 'tight' | 'through' | 'topBottom'   (missing wrap = 'none')
//   side: 'both' | 'left' | 'right' | 'largest'                  (which side of the object text uses)
//   dist: distance from text in px (default WRAP_DIST)
// A text frame is wrapped by objects that are in front of it (later in the page's z-order) on the
// same page, unless frame.wrapAround === false. Rotated frames are not wrapped.

/** Default distance between an object and wrapped text (px). */
export const WRAP_DIST = 6;

/** Wrap styles in menu order. */
export const WRAP_TYPES = [
  { value: 'none', label: 'None' }, { value: 'square', label: 'Square' }, { value: 'tight', label: 'Tight' },
  { value: 'through', label: 'Through' }, { value: 'topBottom', label: 'Top and Bottom' }
];

/** Wrap sides in menu order. */
export const WRAP_SIDES = [
  { value: 'both', label: 'Both sides' }, { value: 'left', label: 'Left side only' },
  { value: 'right', label: 'Right side only' }, { value: 'largest', label: 'Largest side only' }
];

const ELLIPSES = new Set(['ellipse', 'circle', 'oval']);

/** The wrap settings of an element with defaults filled in. */
export function wrapOf(el) {
  const w = (el && el.wrap) || {};
  return { type: w.type || 'none', side: w.side || 'both', dist: Number.isFinite(+w.dist) ? Math.max(0, +w.dist) : WRAP_DIST };
}

/** Axis-aligned bounds of an element's (possibly rotated) box in page coordinates. */
export function elementBounds(el) {
  const rot = ((+el.rot || 0) % 360) * Math.PI / 180;
  const w = +el.w || 0, h = +el.h || 0;
  if (!rot) return { x0: +el.x || 0, y0: +el.y || 0, x1: (+el.x || 0) + w, y1: (+el.y || 0) + h };
  const cx = (+el.x || 0) + w / 2, cy = (+el.y || 0) + h / 2;
  const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
  const hw = (w * c + h * s) / 2, hh = (w * s + h * c) / 2;
  return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
}

/** The page (or master) whose top-level elements contain `id`, with the top-level index. */
function locate(doc, id) {
  const has = (el) => el.id === id || (el.type === 'group' && (el.children || []).some(has));
  for (const list of [doc.pages || [], doc.masters || []]) {
    for (const page of list) {
      const i = (page.elements || []).findIndex(has);
      if (i >= 0) return { page, index: i };
    }
  }
  return null;
}

/**
 * Exclusions for a text frame, in the frame's content coordinates (origin at the content box's
 * top-left, i.e. inside the padding). Each: { x0, y0, x1, y1, type, side, ellipse? }.
 * @param {object} doc
 * @param {object} frame text element
 * @returns {Array<object>}
 */
export function frameExclusions(doc, frame) {
  if (!frame || frame.wrapAround === false || (+frame.rot || 0) % 360) return [];
  const at = locate(doc, frame.id);
  if (!at) return [];
  const p = frame.padding || { top: 4, right: 4, bottom: 4, left: 4 };
  const ox = (+frame.x || 0) + (+p.left || 0), oy = (+frame.y || 0) + (+p.top || 0);
  const cw = (+frame.w || 0) - (+p.left || 0) - (+p.right || 0), ch = (+frame.h || 0) - (+p.top || 0) - (+p.bottom || 0);
  const out = [];
  const els = at.page.elements || [];
  for (let i = at.index + 1; i < els.length; i++) {
    const el = els[i];
    if (!el || el.hidden || el.id === frame.id) continue;
    const w = wrapOf(el);
    if (w.type === 'none') continue;
    const b = elementBounds(el);
    const d = w.dist;
    const r = { x0: b.x0 - d - ox, y0: b.y0 - d - oy, x1: b.x1 + d - ox, y1: b.y1 + d - oy };
    if (r.x1 <= 0 || r.y1 <= 0 || r.x0 >= cw || r.y0 >= ch) continue;
    const ex = { ...r, type: w.type, side: w.side };
    if ((w.type === 'tight' || w.type === 'through') && el.type === 'shape' && ELLIPSES.has(el.shape) && !((+el.rot || 0) % 180)) ex.ellipse = true;
    out.push(ex);
  }
  return out;
}

/**
 * Split exclusions between the columns of a frame: returns, per column, the exclusions in that
 * column's coordinates, clipped to the column.
 * @param {Array<object>} exclusions frame-content coordinates
 * @param {{ cw: number, ch: number, cols: number, gap: number }} g
 */
export function columnExclusions(exclusions, g) {
  const colW = (g.cw - g.gap * (g.cols - 1)) / g.cols;
  const cols = [];
  for (let c = 0; c < g.cols; c++) {
    const left = c * (colW + g.gap);
    const list = [];
    for (const e of exclusions) {
      const x0 = e.x0 - left, x1 = e.x1 - left;
      if (x1 <= 0 || x0 >= colW || e.y1 <= 0 || e.y0 >= g.ch) continue;
      list.push({ ...e, x0, x1 });
    }
    cols.push({ left, width: colW, exclusions: list });
  }
  return cols;
}

/**
 * Turn the exclusions of one single-column region (width W) into float bands and line gaps.
 * Floats: { side: 'left'|'right', y0, y1, w, ellipse? } (w = width from that edge). Gaps:
 * { x0, x1, y0, y1 } holes in the middle of lines (Both sides).
 * @param {Array<object>} exclusions region coordinates
 * @param {number} W region width
 * @param {{ minSide?: number, bothSides?: boolean }} [opts] bothSides false → Both sides acts as Largest side
 */
export function planRegion(exclusions, W, opts = {}) {
  const minSide = opts.minSide ?? 36;
  const floats = [], gaps = [];
  for (const e of exclusions) {
    const y0 = Math.max(0, e.y0), y1 = e.y1;
    const x0 = Math.max(0, e.x0), x1 = Math.min(W, e.x1);
    const leftRoom = x0, rightRoom = W - x1;
    if (e.type === 'topBottom' || (leftRoom < minSide && rightRoom < minSide)) { floats.push({ side: 'left', y0, y1, w: W }); continue; }
    let side = e.side;
    if (side === 'both') {
      if (leftRoom < minSide) side = 'right';
      else if (rightRoom < minSide) side = 'left';
      else if (opts.bothSides === false) side = 'largest';
      else { gaps.push({ x0, x1, y0, y1 }); continue; }
    }
    if (side === 'largest') side = leftRoom >= rightRoom ? 'left' : 'right';
    // side = where the text goes; the float covers the other part of the line
    if (side === 'left') floats.push({ side: 'right', y0, y1, w: W - x0, ellipse: e.ellipse ? { x0: x0, x1, W } : undefined });
    else floats.push({ side: 'left', y0, y1, w: x1, ellipse: e.ellipse ? { x0, x1, W } : undefined });
  }
  return { floats: mergeBands(floats), gaps };
}

/** Merge overlapping bands on the same side; a left and right band that meet across the line become one full band. */
function mergeBands(floats) {
  const out = [];
  for (const side of ['left', 'right']) {
    const list = floats.filter((f) => f.side === side).sort((a, b) => a.y0 - b.y0);
    for (const f of list) {
      const prev = out.length && out[out.length - 1].side === side ? out[out.length - 1] : null;
      if (prev && f.y0 < prev.y1) { prev.y1 = Math.max(prev.y1, f.y1); prev.w = Math.max(prev.w, f.w); prev.ellipse = undefined; }
      else out.push({ ...f });
    }
  }
  return out.sort((a, b) => a.y0 - b.y0);
}

/**
 * HTML for the float bands of a region (zero-width "sandbag" floats position each band).
 * Coordinates are divided by `scale` (autofit zoom).
 */
export function floatsHTML(floats, scale = 1) {
  const r = (n) => Math.round((n / scale) * 100) / 100;
  let s = '';
  const bottom = { left: 0, right: 0 };
  let lastTop = 0;   // a float cannot sit higher than an earlier float (CSS 2 float rule 5)
  for (const f of floats) {
    const gap = Math.max(0, f.y0 - Math.max(bottom[f.side], lastTop));
    lastTop = Math.max(lastTop, f.y0);
    s += `<span data-wrapx="" contenteditable="false" style="float:${f.side};clear:${f.side};width:0;height:${r(gap)}px"></span>`;
    let shape = '';
    if (f.ellipse) {
      const ew = f.ellipse.x1 - f.ellipse.x0, cx = f.side === 'left' ? f.ellipse.x0 + ew / 2 : f.ellipse.x0 - (f.ellipse.W - f.w) + ew / 2;
      shape = `;shape-outside:ellipse(${r(ew / 2)}px ${r((f.y1 - f.y0) / 2)}px at ${r(cx)}px 50%)`;
    }
    s += `<span data-wrapx="" contenteditable="false" style="float:${f.side};clear:${f.side};width:${r(f.w)}px;height:${r(f.y1 - f.y0)}px${shape}"></span>`;
    bottom[f.side] = f.y1;
  }
  return s;
}
