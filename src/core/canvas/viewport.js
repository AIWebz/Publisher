// Pure viewport maths for the canvas: zoom limits and steps, fit zoom, spread layout and ruler
// tick spacing. No DOM access (unit-tested).

import { UNITS } from '../units.js';

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 8;
export const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];

/** Clamp a zoom factor to 10–800 %. */
export function clampZoom(z) {
  if (!Number.isFinite(z)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/** Next zoom step above (dir > 0) or below (dir < 0) `z`. */
export function stepZoom(z, dir) {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > z + 1e-3) ?? ZOOM_MAX;
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) if (ZOOM_STEPS[i] < z - 1e-3) return ZOOM_STEPS[i];
  return ZOOM_MIN;
}

/**
 * Zoom that fits content of w×h (document px) into a viewport of vw×vh with `pad` screen px around.
 * @param {'page'|'width'} mode
 */
export function fitZoom(w, h, vw, vh, pad = 32, mode = 'page') {
  const zw = (vw - 2 * pad) / Math.max(1, w);
  const zh = (vh - 2 * pad) / Math.max(1, h);
  return clampZoom(mode === 'width' ? zw : Math.min(zw, zh));
}

/**
 * Layout of the pages of one spread laid side by side (facing pages touch at the spine).
 * @param {number} pageW
 * @param {number} pageH
 * @param {number} count 1 or 2
 * @returns {{ width: number, height: number, offsets: number[] }}
 */
export function spreadLayout(pageW, pageH, count) {
  const n = Math.max(1, count);
  return { width: pageW * n, height: pageH, offsets: Array.from({ length: n }, (_, i) => i * pageW) };
}

/**
 * Scroll-content geometry: the spread (cw×ch screen px) centred in at least the viewport, with `pad`
 * screen px of workspace around it.
 * @returns {{ width: number, height: number, ox: number, oy: number }}
 */
export function contentGeometry(cw, ch, vw, vh, pad = 48) {
  const width = Math.max(vw, cw + 2 * pad);
  const height = Math.max(vh, ch + 2 * pad);
  return { width, height, ox: (width - cw) / 2, oy: (height - ch) / 2 };
}

/** Scroll position that keeps spread point (sx, sy) under the viewport point (vx, vy) at zoom z. */
export function anchoredScroll(sx, sy, vx, vy, z, ox, oy) {
  return { left: ox + sx * z - vx, top: oy + sy * z - vy };
}

const NICE = [1, 2, 2.5, 5, 10];

/**
 * Ruler tick spacing for a unit at a zoom: `major` is the labelled step in units, `minor` the
 * number of subdivisions, `px` the major step in screen pixels (>= minPx).
 * @param {number} zoom
 * @param {string} unit one of UNITS
 * @param {number} [minPx] minimum screen distance between labelled ticks
 */
export function rulerTicks(zoom, unit = 'in', minPx = 56) {
  const u = UNITS[unit] || UNITS.in;
  const pxPerUnit = zoom / u.perPx;           // screen px per one unit
  const raw = minPx / pxPerUnit;               // smallest acceptable unit step
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  let major = pow * 10;
  for (const n of NICE) { if (n * pow >= raw - 1e-9) { major = n * pow; break; } }
  // inches subdivide into halves/quarters/eighths; metric into 10/5/2
  let minor;
  const stepPx = major * pxPerUnit;
  if (unit === 'in' && major >= 1 && Number.isInteger(major)) minor = stepPx >= 160 ? 16 : stepPx >= 80 ? 8 : 4;
  else {
    const lead = major / pow;
    minor = lead === 2.5 ? 5 : lead === 2 ? 4 : lead === 5 ? 5 : 10;
    while (minor > 1 && stepPx / minor < 5) minor = minor === 10 ? 5 : minor === 5 ? 1 : minor === 4 ? 2 : 1;
  }
  return { major, minor, px: stepPx, pxPerUnit };
}

/** Format a ruler label (drops trailing zeros). */
export function rulerLabel(v) {
  const r = Math.round(v * 1000) / 1000;
  return String(Math.abs(r) < 1e-9 ? 0 : r);
}
