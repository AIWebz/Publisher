// Reusable composite parts shared by templates and building blocks.

import { text, hline, vline, shape, p, span, r2 } from './kit.js';

/**
 * Phone-number tear-off strips: a dashed cut line, dashed separators and vertical (rotated) text
 * frames, one per strip.
 * @param {object} doc
 * @param {{ x: number, y: number, w: number, h: number, count?: number, line1?: string, line2?: string }} o
 * @returns {object[]} elements
 */
export function tearOffStrips(doc, o) {
  const count = o.count || 8;
  const sw = o.w / count;
  const els = [hline(o.x, o.y, o.w, '@muted', 1, { dash: 'dash', name: 'Tear-off cut line' })];
  for (let i = 1; i < count; i++) els.push(vline(o.x + i * sw, o.y, o.h, '@muted', 0.75, { dash: 'dash', name: `Tear-off separator ${i}` }));
  const fw = o.h - 20, fh = sw - 14;
  for (let i = 0; i < count; i++) {
    const cx = o.x + sw * (i + 0.5), cy = o.y + o.h / 2;
    els.push(text(doc, cx - fw / 2, cy - fh / 2, fw, fh,
      p(`<b>${o.line1 || 'Your service'}</b>`) + p(o.line2 || '(555) 010 0000'),
      { size: 10, align: 'center', lineHeight: 1.3 }, { name: `Tear-off ${i + 1}`, rot: 270, valign: 'middle' }));
  }
  return els;
}

/**
 * Circular logo mark with initials (two concentric ellipses and a text frame).
 * @returns {object[]} elements
 */
export function logoMark(doc, x, y, d, initials = 'NW', fill = '@accent', color = '@paper') {
  return [
    shape('ellipse', x, y, d, d, fill, { name: 'Logo circle' }),
    shape('ellipse', x + d * 0.08, y + d * 0.08, d * 0.84, d * 0.84, null,
      { name: 'Logo ring', stroke: { color, width: Math.max(0.75, d / 60), dash: 'solid' } }),
    text(doc, x, y, d, d, p(initials), { font: '@heading', size: r2(d * 0.3), color, align: 'center', lineHeight: 1, letterSpacing: 1 },
      { name: 'Logo initials', valign: 'middle' })
  ];
}

/**
 * Diamond-ornament divider: a rule with a centred diamond ornament and short side rules.
 * @returns {object[]} elements
 */
export function ornamentDivider(x, y, w, color = '@accent2') {
  const mid = x + w / 2;
  return [
    hline(x, y, w / 2 - 14, color, 0.75, { name: 'Divider left' }),
    shape('diamond', mid - 6, y - 6, 12, 12, color, { name: 'Divider diamond' }),
    hline(mid + 14, y, w / 2 - 14, color, 0.75, { name: 'Divider right' })
  ];
}

/** Rich-text label "Label" in small caps colour. */
export const smallCaps = (t, color = 'accent') => span(t, `color: var(--folio-${color}); text-transform: uppercase; letter-spacing: 2px; font-size: 8pt`);
