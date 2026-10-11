// Templates: label sheets and envelopes (mail-merge ready).
//
// Label sheets follow the repeated-slot convention shared with the mail-merge engine: each label is
// a group named 'slot-1' … 'slot-N' (row-major, left to right, top to bottom) and the page carries
// `page.repeat = { cols, rows, x, y, w, h, gapX, gapY }` describing the grid.

import { IN, MM, newDoc, text, rect, hline, setPages, slotGrid, p, field } from './kit.js';
import { logoMark } from './parts.js';

const ADDRESS_BLOCK = `${field('Name')}<br>${field('Address')}<br>${field('City')}, ${field('State')} ${field('ZIP')}`;

/** Avery 5160-style address labels: 30 per Letter sheet, 1 × 2⅝ in, 3 columns × 10 rows. */
export const ADDRESS_LABELS = { cols: 3, rows: 10, x: 0.1875 * IN, y: 0.5 * IN, w: 2.625 * IN, h: 1 * IN, gapX: 0.125 * IN, gapY: 0 };
/** Avery 5163-style shipping labels: 10 per Letter sheet, 4 × 2 in, 2 columns × 5 rows. */
export const SHIPPING_LABELS = { cols: 2, rows: 5, x: 0.15625 * IN, y: 0.5 * IN, w: 4 * IN, h: 2 * IN, gapX: 0.1875 * IN, gapY: 0 };

function sheetGuides(g) {
  const v = [], h = [];
  for (let c = 0; c < g.cols; c++) { const x = g.x + c * (g.w + g.gapX); v.push(x, x + g.w); }
  for (let r = 0; r < g.rows; r++) { const y = g.y + r * (g.h + g.gapY); h.push(y, y + g.h); }
  const uniq = (a) => [...new Set(a.map((n) => Math.round(n * 100) / 100))];
  return { v: uniq(v), h: uniq(h) };
}

function addressLabels() {
  const doc = newDoc({ title: 'Address Labels', size: 'letter', schemeId: 'harbor', fontSchemeId: 'modern',
    margins: { top: 48, right: 18, bottom: 48, left: 18 }, category: 'labels' });
  const { groups, repeat } = slotGrid(ADDRESS_LABELS, (i, x, y) => [
    rect(x, y, ADDRESS_LABELS.w, ADDRESS_LABELS.h, '@paper', { name: 'Label background' }),
    rect(x + 12, y + 22, 3, 52, '@accent', { name: 'Accent bar' }),
    text(doc, x + 24, y + 12, ADDRESS_LABELS.w - 36, ADDRESS_LABELS.h - 24, p(ADDRESS_BLOCK), { size: 10, lineHeight: 1.35 }, { name: 'Address', valign: 'middle' })
  ]);
  return setPages(doc, [[groups, { repeat, guides: sheetGuides(ADDRESS_LABELS) }]]);
}

function shippingLabels() {
  const doc = newDoc({ title: 'Shipping Labels', size: 'letter', schemeId: 'citrus', fontSchemeId: 'modern',
    margins: { top: 48, right: 15, bottom: 48, left: 15 }, category: 'labels' });
  const W = SHIPPING_LABELS.w;
  const { groups, repeat } = slotGrid(SHIPPING_LABELS, (i, x, y) => [
    rect(x, y, W, SHIPPING_LABELS.h, '@paper', { name: 'Label background' }),
    text(doc, x + 18, y + 14, 280, 44, p('<b>Hollis &amp; Pine Home Goods</b><br>214 Mercer Avenue, Hudson, NY 12534'), { size: 7.5, lineHeight: 1.4, color: '@muted' }, { name: 'Return address' }),
    ...logoMark(doc, x + W - 58, y + 12, 40, 'HP'),
    hline(x + 18, y + 66, W - 36, '@muted', 0.75, { name: 'Divider' }),
    text(doc, x + 18, y + 76, 120, 14, p('Ship to'), { size: 7, caps: true, letterSpacing: 2, color: '@accent' }, { name: 'Ship to label' }),
    text(doc, x + 18, y + 94, W - 36, 84, p(`<b>${field('Name')}</b><br>${field('Address')}<br>${field('City')}, ${field('State')} ${field('ZIP')}`),
      { size: 13, lineHeight: 1.3 }, { name: 'Recipient address' })
  ]);
  return setPages(doc, [[groups, { repeat, guides: sheetGuides(SHIPPING_LABELS) }]]);
}

function envelope({ title, size, schemeId, fontSchemeId, recipient }) {
  const doc = newDoc({ title, size, schemeId, fontSchemeId, margins: 32, category: 'envelopes' });
  const H = doc.setup.height;
  return setPages(doc, [[[
    ...logoMark(doc, 32, 30, 48, 'HP'),
    text(doc, 94, 30, 300, 66, p('<b>Hollis &amp; Pine Home Goods</b>') + p('214 Mercer Avenue<br>Hudson, NY 12534'), { size: 9, lineHeight: 1.4, color: '@muted' }, { name: 'Return address' }),
    hline(94, 108, 40, '@accent2', 1.5, { name: 'Accent rule' }),
    text(doc, recipient.x, recipient.y, recipient.w, 110, p(ADDRESS_BLOCK), { size: 12, lineHeight: 1.5 }, { name: 'Recipient address' }),
    text(doc, 32, H - 40, 300, 16, p('hollisandpine.example'), { size: 8, letterSpacing: 1, color: '@accent' }, { name: 'Web address' })
  ]]]);
}

/** @type {Array<{id: string, name: string, category: string, description: string, sizeLabel: string, build: Function}>} */
export const MAIL_TEMPLATES = [
  { id: 'address-labels-30', name: 'Address Labels', category: 'labels', description: '30 address labels per sheet (1 × 2⅝ in, 5160-style) with merge fields in every label.', sizeLabel: 'Letter · 30 labels (3 × 10)', build: addressLabels },
  { id: 'shipping-labels-10', name: 'Shipping Labels', category: 'labels', description: '10 shipping labels per sheet (2 × 4 in, 5163-style) with a return address and merge-field recipient.', sizeLabel: 'Letter · 10 labels (2 × 5)', build: shippingLabels },
  { id: 'envelope-10', name: 'Business Envelope #10', category: 'envelopes', description: '#10 envelope with a logo return address and a mail-merge recipient block.', sizeLabel: '#10 · 9.5 × 4.125 in',
    build: () => envelope({ title: 'Envelope #10', size: 'envelope10', schemeId: 'citrus', fontSchemeId: 'modern', recipient: { x: 420, y: 196, w: 420 } }) },
  { id: 'envelope-dl', name: 'DL Envelope', category: 'envelopes', description: 'DL envelope with a return address and a mail-merge recipient block.', sizeLabel: 'DL · 220 × 110 mm',
    build: () => envelope({ title: 'Envelope DL', size: 'envelopeDL', schemeId: 'midnight', fontSchemeId: 'editorial', recipient: { x: 110 * MM, y: 55 * MM, w: 95 * MM } }) }
];
