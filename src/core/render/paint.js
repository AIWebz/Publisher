// SVG markup builders for shapes, lines, frame outlines, gradient fills and shadows.

import { resolveColor, dashArray, withAlpha } from '../theme.js';
import { shapePath, gradientVector } from './shapes.js';

let gid = 0;
const nextId = (p) => `${p}-${(++gid).toString(36)}`;
const f = (n) => Math.round(n * 100) / 100;
const attr = (s) => String(s).replace(/"/g, '&quot;');

/** SVG paint for a Fill (pushes gradient definitions into `defs`). */
export function fillPaint(doc, fill, defs) {
  if (!fill || fill.type === 'none') return 'none';
  const c1 = resolveColor(doc, fill.color);
  if (fill.type === 'solid') return c1 === 'transparent' ? 'none' : c1;
  const c2 = resolveColor(doc, fill.color2 || '@paper');
  const id = nextId('g');
  if (fill.type === 'linear') {
    const v = gradientVector(fill.angle ?? 180);
    defs.push(`<linearGradient id="${id}" x1="${v.x1}" y1="${v.y1}" x2="${v.x2}" y2="${v.y2}"><stop offset="0" stop-color="${attr(c1)}"/><stop offset="1" stop-color="${attr(c2)}"/></linearGradient>`);
  } else if (fill.type === 'radial') {
    defs.push(`<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${attr(c1)}"/><stop offset="1" stop-color="${attr(c2)}"/></radialGradient>`);
  } else {
    return 'none';
  }
  return `url(#${id})`;
}

/** SVG filter attribute for a Shadow ('' when disabled). */
export function shadowFilter(doc, shadow, defs) {
  if (!shadow || !shadow.enabled) return '';
  const id = nextId('sh');
  const c = resolveColor(doc, shadow.color || '#000000');
  defs.push(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">` +
    `<feDropShadow dx="${f(shadow.x || 0)}" dy="${f(shadow.y || 0)}" stdDeviation="${f(Math.max(0, (shadow.blur || 0) / 2))}" flood-color="${attr(c)}" flood-opacity="${f(shadow.opacity ?? 0.3)}"/></filter>`);
  return ` filter="url(#${id})"`;
}

function strokeAttrs(doc, stroke) {
  const sw = stroke && stroke.width > 0 ? stroke.width : 0;
  if (!sw) return { sw: 0, attrs: 'stroke="none"' };
  const color = resolveColor(doc, stroke.color || '@ink');
  const dash = dashArray(stroke.dash, sw);
  const cap = stroke.dash === 'dot' || stroke.dash === 'dashDot' ? 'round' : 'butt';
  return { sw, attrs: `stroke="${attr(color)}" stroke-width="${f(sw)}" stroke-linejoin="miter" stroke-miterlimit="8" stroke-linecap="${cap}"${dash ? ` stroke-dasharray="${dash}"` : ''}` };
}

/** Complete <svg> markup for a shape element of size w×h. */
export function shapeSVG(doc, el) {
  const w = Math.max(0.01, el.w), h = Math.max(0.01, el.h);
  const defs = [];
  const { sw, attrs } = strokeAttrs(doc, el.stroke);
  const i = Math.min(sw / 2, w / 2, h / 2);
  const d = shapePath(el.shape, i, i, w - 2 * i, h - 2 * i, el);
  const paint = fillPaint(doc, el.fill, defs);
  const filter = shadowFilter(doc, el.shadow, defs);
  const flips = [];
  if (el.flipH) flips.push(`translate(${f(w)} 0) scale(-1 1)`);
  if (el.flipV) flips.push(`translate(0 ${f(h)}) scale(1 -1)`);
  const tf = flips.length ? ` transform="${flips.join(' ')}"` : '';
  return `<svg class="shape-svg" width="${f(w)}" height="${f(h)}" viewBox="0 0 ${f(w)} ${f(h)}" overflow="visible" aria-hidden="true">` +
    (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
    `<g${filter}><path d="${d}" fill="${paint}" fill-rule="evenodd" ${attrs}${tf}/></g></svg>`;
}

function arrowHead(kind, x, y, dir, s, color, sw) {
  // dir = +1 for the end (pointing right), -1 for the start (pointing left)
  const back = x - dir * s;
  switch (kind) {
    case 'arrow':
      return `<path d="M${f(back)} ${f(y - s * 0.55)} L${f(x)} ${f(y)} L${f(back)} ${f(y + s * 0.55)}" fill="none" stroke="${attr(color)}" stroke-width="${f(sw)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'triangle':
      return `<path d="M${f(back)} ${f(y - s * 0.5)} L${f(x)} ${f(y)} L${f(back)} ${f(y + s * 0.5)} Z" fill="${attr(color)}"/>`;
    case 'circle':
      return `<circle cx="${f(x - dir * s * 0.4)}" cy="${f(y)}" r="${f(s * 0.4)}" fill="${attr(color)}"/>`;
    case 'diamond':
      return `<path d="M${f(x)} ${f(y)} L${f(x - dir * s * 0.5)} ${f(y - s * 0.4)} L${f(x - dir * s)} ${f(y)} L${f(x - dir * s * 0.5)} ${f(y + s * 0.4)} Z" fill="${attr(color)}"/>`;
    default:
      return '';
  }
}

/** Length the line is shortened by at an end so it does not poke through a filled head. */
function inset(kind, s) {
  return kind === 'triangle' || kind === 'diamond' ? s * 0.8 : kind === 'circle' ? s * 0.4 : 0;
}

/** Complete <svg> markup for a line element (horizontal through the vertical centre of its box). */
export function lineSVG(doc, el) {
  const w = Math.max(0.01, el.w), h = Math.max(0.01, el.h);
  const defs = [];
  const stroke = el.stroke || { color: '@ink', width: 1, dash: 'solid' };
  const sw = Math.max(0.25, stroke.width || 0);
  const color = resolveColor(doc, stroke.color || '@ink');
  const y = h / 2;
  const s = Math.max(6, sw * 3.2);
  const x1 = inset(el.arrowStart, s), x2 = w - inset(el.arrowEnd, s);
  const dash = dashArray(stroke.dash, sw);
  const cap = stroke.dash === 'dot' || stroke.dash === 'dashDot' ? 'round' : 'butt';
  const seg = (a, b) => (b > a ? `<line x1="${f(a)}" y1="${f(y)}" x2="${f(b)}" y2="${f(y)}" stroke="${attr(color)}" stroke-width="${f(sw)}" stroke-linecap="${cap}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>` : '');
  let body;
  if (el.ornament === 'diamond') {
    const d = Math.max(4, Math.min(h / 2 + sw, 3 + sw * 2.5)), g = d * 1.8;
    body = seg(x1, w / 2 - g) + seg(w / 2 + g, x2) +
      `<path d="M${f(w / 2)} ${f(y - d)} L${f(w / 2 + d)} ${f(y)} L${f(w / 2)} ${f(y + d)} L${f(w / 2 - d)} ${f(y)} Z" fill="${attr(color)}"/>`;
  } else {
    body = seg(x1, x2);
  }
  body += arrowHead(el.arrowStart, 0, y, -1, s, color, sw) + arrowHead(el.arrowEnd, w, y, 1, s, color, sw);
  const filter = shadowFilter(doc, el.shadow, defs);
  return `<svg class="line-svg" width="${f(w)}" height="${f(h)}" viewBox="0 0 ${f(w)} ${f(h)}" overflow="visible" aria-hidden="true">` +
    (defs.length ? `<defs>${defs.join('')}</defs>` : '') + `<g${filter}>${body}</g></svg>`;
}

/** Outline (stroke) overlay for text and picture frames, drawn inside the frame. '' when none. */
export function frameStrokeSVG(doc, w, h, stroke, radius = 0) {
  const { sw, attrs } = strokeAttrs(doc, stroke);
  if (!sw) return '';
  const i = sw / 2;
  const r = Math.max(0, Math.min(radius - i, (w - sw) / 2, (h - sw) / 2));
  return `<svg class="frame-stroke" width="${f(w)}" height="${f(h)}" viewBox="0 0 ${f(w)} ${f(h)}" overflow="visible" aria-hidden="true">` +
    `<rect x="${f(i)}" y="${f(i)}" width="${f(Math.max(0, w - sw))}" height="${f(Math.max(0, h - sw))}" rx="${f(r)}" fill="none" ${attrs}/></svg>`;
}

/** CSS filter for a frame shadow (text/picture frames). */
export function frameShadowCSS(doc, shadow) {
  if (!shadow || !shadow.enabled) return '';
  const c = withAlpha(resolveColor(doc, shadow.color || '#000000'), shadow.opacity ?? 0.3);
  return `drop-shadow(${f(shadow.x || 0)}px ${f(shadow.y || 0)}px ${f(shadow.blur || 0)}px ${c})`;
}
