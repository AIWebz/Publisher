// Building blocks: reusable design elements inserted onto the current page.
//
//   BLOCK_CATEGORIES: [{ id, name }]
//   BUILDING_BLOCKS:  [{ id, name, category, description, size: { w, h }, build(doc, { x, y, w?, h?, year?, month? }) -> Element[] }]
//
// build() creates the elements at (x, y) (top-left of the block) and adds any text stories to
// doc.stories; the caller appends the returned elements to a page (one transaction). Composite blocks
// come back as a single group named after the block so they move as one; ungroup to edit parts.
// Page borders ('borders' category) are inset by x / y from the page edges unless w / h are given.

import { text, rect, shape, outline, hline, vline, picture, table, group, p, span, field, css, r2 } from './kit.js';
import { tearOffStrips, logoMark, ornamentDivider } from './parts.js';
import { buildMonthTable, monthName } from './calendar.js';

/** Building block categories in display order. */
export const BLOCK_CATEGORIES = [
  { id: 'headings', name: 'Headings' },
  { id: 'pullQuotes', name: 'Pull Quotes' },
  { id: 'sidebars', name: 'Sidebars' },
  { id: 'borders', name: 'Borders' },
  { id: 'accents', name: 'Accents & Attention Getters' },
  { id: 'coupons', name: 'Coupons & Tear-offs' },
  { id: 'contact', name: 'Contact Information' },
  { id: 'tables', name: 'Tables' },
  { id: 'calendars', name: 'Calendars' }
];

const g = (name, children) => [group(name, children)];
const dotted = { top: null, left: null, right: null, bottom: { color: '@muted', width: 0.75, dash: 'dot' } };

function pageBox(doc, o) {
  const x = o.x ?? 36, y = o.y ?? 36;
  return { x, y, w: o.w ?? doc.setup.width - 2 * x, h: o.h ?? doc.setup.height - 2 * y };
}

/** @type {Array<{id: string, name: string, category: string, description: string, size: {w: number, h: number}, build: (doc: object, opts: object) => object[]}>} */
export const BUILDING_BLOCKS = [
  // ---- headings ----
  { id: 'heading-classic', name: 'Classic Heading', category: 'headings', description: 'Small-caps kicker, large heading and a short accent rule.', size: { w: 480, h: 96 },
    build: (doc, { x, y }) => g('Classic Heading', [
      text(doc, x, y, 480, 18, p('Section kicker'), { size: 9, caps: true, letterSpacing: 3, color: '@accent' }, { name: 'Kicker' }),
      text(doc, x, y + 22, 480, 50, p('Your Heading Here'), { font: '@heading', size: 30, lineHeight: 1.1 }, { name: 'Heading' }),
      hline(x, y + 88, 64, '@accent2', 2.5, { name: 'Accent rule' })
    ]) },
  { id: 'heading-banner', name: 'Banner Heading', category: 'headings', description: 'Heading reversed out of a full-width colour band.', size: { w: 480, h: 56 },
    build: (doc, { x, y }) => g('Banner Heading', [
      rect(x, y, 480, 56, '@accent', { name: 'Band' }),
      text(doc, x + 20, y, 440, 56, p('Section Title'), { font: '@heading', size: 22, color: '@paper' }, { name: 'Heading', valign: 'middle' })
    ]) },
  { id: 'heading-numbered', name: 'Numbered Heading', category: 'headings', description: 'Large chapter number beside a heading and subtitle.', size: { w: 480, h: 84 },
    build: (doc, { x, y }) => g('Numbered Heading', [
      text(doc, x, y, 96, 84, p('01'), { font: '@heading', size: 52, color: '@accent2', lineHeight: 1 }, { name: 'Number', valign: 'middle' }),
      vline(x + 104, y + 10, 64, '@accent2', 1, { name: 'Divider' }),
      text(doc, x + 120, y + 10, 360, 36, p('Chapter Heading'), { font: '@heading', size: 22 }, { name: 'Heading' }),
      text(doc, x + 120, y + 48, 360, 24, p('A short line that introduces the section'), { italic: true, size: 11, color: '@muted' }, { name: 'Subtitle' })
    ]) },
  { id: 'heading-ornament', name: 'Ornamental Heading', category: 'headings', description: 'Centred heading with a diamond ornament divider.', size: { w: 480, h: 84 },
    build: (doc, { x, y }) => g('Ornamental Heading', [
      text(doc, x, y, 480, 50, p('A Centred Heading'), { font: '@heading', size: 28, align: 'center' }, { name: 'Heading', valign: 'middle' }),
      ...ornamentDivider(x + 150, y + 64, 180),
      text(doc, x, y + 72, 480, 0.01, '', {}, { name: 'Spacer', hidden: true })
    ].filter((e) => !e.hidden)) },

  // ---- pull quotes ----
  { id: 'pull-quote-rules', name: 'Ruled Pull Quote', category: 'pullQuotes', description: 'Italic quotation between two accent rules, with a credit line.', size: { w: 420, h: 150 },
    build: (doc, { x, y }) => g('Ruled Pull Quote', [
      hline(x, y, 420, '@accent', 1.5, { name: 'Rule top' }),
      text(doc, x + 12, y + 14, 396, 92, p('“A memorable line from the story, set large enough to catch the eye.”'),
        { font: '@heading', italic: true, size: 19, color: '@accent', align: 'center', lineHeight: 1.25 }, { name: 'Quote', valign: 'middle' }),
      text(doc, x, y + 110, 420, 18, p('— Name of the speaker'), { size: 9, caps: true, letterSpacing: 2, color: '@muted', align: 'center' }, { name: 'Credit' }),
      hline(x, y + 140, 420, '@accent', 1.5, { name: 'Rule bottom' })
    ]) },
  { id: 'pull-quote-mark', name: 'Quotation Mark Pull Quote', category: 'pullQuotes', description: 'Oversized quotation mark with the quote beside it.', size: { w: 380, h: 140 },
    build: (doc, { x, y }) => g('Quotation Mark Pull Quote', [
      text(doc, x, y, 60, 80, p('“'), { font: '@heading', size: 80, color: '@accent2', lineHeight: 1 }, { name: 'Quotation mark' }),
      text(doc, x + 64, y + 10, 316, 96, p('Good design is as little design as possible — and then a little care on top.'),
        { font: '@heading', italic: true, size: 16, lineHeight: 1.35 }, { name: 'Quote' }),
      text(doc, x + 64, y + 112, 316, 18, p('— Attribution'), { size: 9.5, color: '@accent' }, { name: 'Credit' })
    ]) },
  { id: 'pull-quote-panel', name: 'Panel Pull Quote', category: 'pullQuotes', description: 'Tinted panel with an accent bar along the left edge.', size: { w: 360, h: 130 },
    build: (doc, { x, y }) => g('Panel Pull Quote', [
      rect(x, y, 360, 130, '@light', { name: 'Panel' }),
      rect(x, y, 6, 130, '@accent', { name: 'Accent bar' }),
      text(doc, x + 26, y + 16, 316, 98, p('“Put the line you most want readers to remember here.”', 'margin-bottom: 6px') + p(span('— Source', `${css.muted}; font-style: normal; font-size: 9pt`)),
        { font: '@heading', italic: true, size: 16, lineHeight: 1.3 }, { name: 'Quote', valign: 'middle' })
    ]) },

  // ---- sidebars ----
  { id: 'sidebar-tinted', name: 'Tinted Sidebar', category: 'sidebars', description: 'Tinted column with a heading and a bulleted list.', size: { w: 220, h: 300 },
    build: (doc, { x, y }) => g('Tinted Sidebar', [
      rect(x, y, 220, 300, '@light', { name: 'Sidebar panel' }),
      text(doc, x + 18, y + 18, 184, 30, p('At a glance'), { font: '@heading', size: 17, color: '@accent' }, { name: 'Heading' }),
      hline(x + 18, y + 56, 40, '@accent2', 2, { name: 'Accent rule' }),
      text(doc, x + 18, y + 68, 184, 214, '<ul><li>Key point that readers should take away</li><li>A second short fact or figure</li><li>Dates, times or a deadline</li><li>Where to learn more</li></ul>',
        { size: 10.5, lineHeight: 1.5, spaceAfter: 4 }, { name: 'List' })
    ]) },
  { id: 'sidebar-contents', name: 'Contents Sidebar', category: 'sidebars', description: '“In this issue” box with a table of contents.', size: { w: 220, h: 220 },
    build: (doc, { x, y }) => g('Contents Sidebar', [
      outline(x, y, 220, 220, '@accent', 1, { name: 'Frame' }),
      text(doc, x + 16, y + 14, 188, 30, p('In this issue'), { font: '@heading', size: 17, color: '@accent' }, { name: 'Heading' }),
      table(x + 16, y + 52, 188, 150, [['Lead story', '1'], ['News in brief', '2'], ['Interview', '3'], ['Events calendar', '4'], ['Notices', '4']], {
        colWeights: [5, 1], name: 'Contents', border: { color: '@muted', width: 0 }, style: { size: 10 },
        cellProps: (r, c) => ({ align: c === 1 ? 'right' : 'left', padding: 3, borders: dotted })
      })
    ]) },
  { id: 'sidebar-fact', name: 'Fact Box', category: 'sidebars', description: 'Colour box with a big statistic and a caption.', size: { w: 200, h: 180 },
    build: (doc, { x, y }) => g('Fact Box', [
      rect(x, y, 200, 180, '@accent', { name: 'Box' }),
      text(doc, x + 16, y + 20, 168, 70, p('87%'), { font: '@heading', size: 46, color: '@paper', align: 'center', lineHeight: 1 }, { name: 'Statistic', valign: 'middle' }),
      hline(x + 80, y + 100, 40, '@accent2', 2, { name: 'Rule' }),
      text(doc, x + 16, y + 112, 168, 52, p('of readers say they keep this newsletter for reference'), { size: 10, color: '@paper', align: 'center', lineHeight: 1.4 }, { name: 'Caption' })
    ]) },

  // ---- borders ----
  { id: 'border-double', name: 'Double Rule Border', category: 'borders', description: 'Thick and thin rules framing the page.', size: { w: 0, h: 0 },
    build: (doc, o) => { const b = pageBox(doc, o); return g('Double Rule Border', [
      outline(b.x, b.y, b.w, b.h, '@accent', 3, { name: 'Outer rule' }),
      outline(b.x + 10, b.y + 10, b.w - 20, b.h - 20, '@accent2', 1, { name: 'Inner rule' })
    ]); } },
  { id: 'border-corners', name: 'Corner Brackets', category: 'borders', description: 'Ornamental corner brackets with diamond accents.', size: { w: 0, h: 0 },
    build: (doc, o) => {
      const b = pageBox(doc, o), L = Math.min(72, b.w / 4, b.h / 4), els = [];
      [[b.x, b.y, 1, 1], [b.x + b.w, b.y, -1, 1], [b.x, b.y + b.h, 1, -1], [b.x + b.w, b.y + b.h, -1, -1]].forEach(([cx, cy, sx, sy], i) => {
        els.push(hline(sx > 0 ? cx : cx - L, cy, L, '@accent', 1.5, { name: `Corner ${i + 1} horizontal` }));
        els.push(vline(cx, sy > 0 ? cy : cy - L, L, '@accent', 1.5, { name: `Corner ${i + 1} vertical` }));
        els.push(shape('diamond', cx + sx * 10 - 5, cy + sy * 10 - 5, 10, 10, '@accent2', { name: `Corner ${i + 1} diamond` }));
      });
      return g('Corner Brackets', els);
    } },
  { id: 'border-dotted', name: 'Dotted Border', category: 'borders', description: 'Dotted outer border with a fine inner rule.', size: { w: 0, h: 0 },
    build: (doc, o) => { const b = pageBox(doc, o); return g('Dotted Border', [
      outline(b.x, b.y, b.w, b.h, '@accent', 2, { dash: 'dot', name: 'Dotted rule' }),
      outline(b.x + 8, b.y + 8, b.w - 16, b.h - 16, '@muted', 0.5, { name: 'Inner rule' })
    ]); } },

  // ---- accents ----
  { id: 'divider-ornament', name: 'Ornament Divider', category: 'accents', description: 'Fine rule broken by a diamond ornament.', size: { w: 300, h: 12 },
    build: (doc, { x, y }) => g('Ornament Divider', ornamentDivider(x, y + 6, 300)) },
  { id: 'divider-triple', name: 'Triple Rule Divider', category: 'accents', description: 'Thick rule between two hairlines.', size: { w: 480, h: 14 },
    build: (doc, { x, y }) => g('Triple Rule Divider', [
      hline(x, y + 2, 480, '@ink', 0.5, { name: 'Hairline top' }),
      hline(x, y + 7, 480, '@ink', 2.5, { name: 'Thick rule' }),
      hline(x, y + 12, 480, '@ink', 0.5, { name: 'Hairline bottom' })
    ]) },
  { id: 'starburst', name: 'Starburst', category: 'accents', description: 'Attention-getting starburst with an offer.', size: { w: 160, h: 160 },
    build: (doc, { x, y }) => g('Starburst', [
      shape('burst', x, y, 160, 160, '@accent', { points: 16, inner: 0.78, name: 'Burst' }),
      text(doc, x + 26, y + 40, 108, 80, p('New!') + p(span('Just in', 'font-size: 11pt')), { font: '@heading', size: 26, color: '@paper', align: 'center', lineHeight: 1.05 },
        { name: 'Burst text', valign: 'middle' })
    ]) },
  { id: 'ribbon-banner', name: 'Ribbon Banner', category: 'accents', description: 'Ribbon-shaped banner for a short announcement.', size: { w: 300, h: 60 },
    build: (doc, { x, y }) => g('Ribbon Banner', [
      shape('ribbon', x, y, 300, 60, '@accent2', { name: 'Ribbon' }),
      text(doc, x + 36, y, 228, 60, p('Limited time only'), { font: '@heading', size: 17, color: '@ink', align: 'center' }, { name: 'Ribbon text', valign: 'middle' })
    ]) },
  { id: 'logo-lockup', name: 'Logo Lockup', category: 'accents', description: 'Monogram mark beside an organisation name and tagline.', size: { w: 320, h: 72 },
    build: (doc, { x, y }) => g('Logo Lockup', [
      ...logoMark(doc, x, y, 72, 'AB'),
      text(doc, x + 88, y + 8, 232, 32, p('Organisation Name'), { font: '@heading', size: 18 }, { name: 'Name' }),
      text(doc, x + 88, y + 42, 232, 20, p('Tagline or motto'), { size: 9, caps: true, letterSpacing: 2, color: '@accent' }, { name: 'Tagline' })
    ]) },
  { id: 'logo-placeholder', name: 'Logo Placeholder', category: 'accents', description: 'Picture placeholder for your logo with a company name.', size: { w: 260, h: 80 },
    build: (doc, { x, y }) => g('Logo Placeholder', [
      picture(x, y, 80, 80, { name: 'Logo picture', radius: 6 }),
      text(doc, x + 96, y + 10, 164, 60, p('Company Name') + p(span('www.example.com', `${css.muted}; font-size: 9pt`)), { font: '@heading', size: 16, lineHeight: 1.3 }, { name: 'Name', valign: 'middle' })
    ]) },

  // ---- coupons ----
  { id: 'coupon-dashed', name: 'Dashed Coupon', category: 'coupons', description: 'Cut-out coupon with a dashed border, offer, terms and expiry date.', size: { w: 360, h: 160 },
    build: (doc, { x, y }) => g('Dashed Coupon', [
      outline(x, y, 360, 160, '@ink', 1.5, { dash: 'dash', name: 'Cut line' }),
      rect(x + 10, y + 10, 340, 140, '@light', { name: 'Coupon panel' }),
      text(doc, x + 20, y + 20, 320, 22, p('Coupon'), { size: 9, caps: true, letterSpacing: 3, color: '@accent', align: 'center' }, { name: 'Label' }),
      text(doc, x + 20, y + 44, 320, 50, p('20% OFF'), { font: '@heading', size: 32, color: '@accent', align: 'center' }, { name: 'Offer', valign: 'middle' }),
      text(doc, x + 20, y + 96, 320, 44, p('Your next purchase of $50 or more. One coupon per customer.') + p(span('Expires 31 December', css.muted)),
        { size: 9, align: 'center', lineHeight: 1.4 }, { name: 'Terms' })
    ]) },
  { id: 'tear-off-strip', name: 'Phone Tear-off Strip', category: 'coupons', description: 'Eight tear-off tabs with a name and phone number.', size: { w: 704, h: 200 },
    build: (doc, { x, y }) => g('Phone Tear-off Strip', tearOffStrips(doc, { x, y, w: 704, h: 200, count: 8, line1: 'Your name · Service', line2: '(555) 010 0000' })) },

  // ---- contact ----
  { id: 'contact-block', name: 'Contact Block', category: 'contact', description: 'Address, phone, email and website with a heading.', size: { w: 240, h: 132 },
    build: (doc, { x, y }) => g('Contact Block', [
      text(doc, x, y, 240, 28, p('Get in touch'), { font: '@heading', size: 16, color: '@accent' }, { name: 'Heading' }),
      hline(x, y + 34, 32, '@accent2', 2, { name: 'Accent rule' }),
      text(doc, x, y + 46, 240, 86, p('123 Main Street, Springfield') + p('(555) 010 0000') + p('hello@example.com') + p('www.example.com'),
        { size: 10, lineHeight: 1.45 }, { name: 'Details' })
    ]) },
  { id: 'contact-address-merge', name: 'Recipient Address', category: 'contact', description: 'Mail-merge address block (Name, Address, City, State, ZIP).', size: { w: 260, h: 72 },
    build: (doc, { x, y }) => [text(doc, x, y, 260, 72, p(`${field('Name')}<br>${field('Address')}<br>${field('City')}, ${field('State')} ${field('ZIP')}`),
      { size: 11, lineHeight: 1.45 }, { name: 'Recipient address' })] },

  // ---- tables ----
  { id: 'table-price', name: 'Price Table', category: 'tables', description: 'Two-column item and price list with dotted leaders.', size: { w: 320, h: 180 },
    build: (doc, { x, y }) => [table(x, y, 320, 180, [['Item one', '$12'], ['Item two', '$18'], ['Item three', '$24'], ['Item four', '$9'], ['Item five', '$15']], {
      colWeights: [4, 1], name: 'Price Table', border: { color: '@muted', width: 0 }, style: { size: 11 },
      cellProps: (r, c) => ({ align: c === 1 ? 'right' : 'left', padding: 5, borders: dotted })
    })] },
  { id: 'table-schedule', name: 'Schedule Table', category: 'tables', description: 'Banded three-column schedule with a coloured header row.', size: { w: 480, h: 180 },
    build: (doc, { x, y }) => [table(x, y, 480, 180, [['<b>When</b>', '<b>What</b>', '<b>Where</b>'], ['9:00 am', 'Welcome and coffee', 'Main hall'],
      ['10:00 am', 'Morning session', 'Room 1'], ['12:30 pm', 'Lunch', 'Garden terrace'], ['2:00 pm', 'Workshops', 'Rooms 2–4']], {
      colWeights: [1, 2.2, 1.6], header: true, banded: true, headerFill: '@accent', headerColor: 'paper', name: 'Schedule Table',
      border: { color: '@light', width: 0.75 }, style: { size: 10 }, cellProps: () => ({ padding: 6 })
    })] },

  // ---- calendars ----
  { id: 'calendar-mini', name: 'Mini Calendar', category: 'calendars', description: 'Compact month calendar with a month label (current month by default).', size: { w: 200, h: 190 },
    build: (doc, o) => {
      const now = new Date(), year = o.year ?? now.getFullYear(), month = o.month ?? now.getMonth();
      return g('Mini Calendar', [
        text(doc, o.x, o.y, 200, 26, p(`${monthName(month, o.locale)} ${year}`), { font: '@heading', size: 13, color: '@accent' }, { name: 'Month', valign: 'middle' }),
        buildMonthTable(doc, { year, month, weekStart: o.weekStart ?? 0, locale: o.locale, x: o.x, y: o.y + 28, w: 200, h: 162, compact: true, minWeeks: 6,
          headerFill: null, headerColor: 'muted', headerHeight: r2(162 / 7) })
      ]);
    } },
  { id: 'calendar-month', name: 'Month Calendar', category: 'calendars', description: 'Full month grid with a weekday header row (current month by default).', size: { w: 560, h: 420 },
    build: (doc, o) => {
      const now = new Date(), year = o.year ?? now.getFullYear(), month = o.month ?? now.getMonth();
      return g('Month Calendar', [
        text(doc, o.x, o.y, 560, 44, p(`${monthName(month, o.locale)} ${span(String(year), css.muted)}`), { font: '@heading', size: 26, color: '@accent' }, { name: 'Month', valign: 'middle' }),
        buildMonthTable(doc, { year, month, weekStart: o.weekStart ?? 0, locale: o.locale, x: o.x, y: o.y + 52, w: 560, h: 368 })
      ]);
    } }
];

/**
 * Find a building block by id.
 * @param {string} id
 * @returns {object|null}
 */
export function getBlock(id) {
  return BUILDING_BLOCKS.find((b) => b.id === id) || null;
}

/**
 * Building blocks in a category.
 * @param {string} categoryId
 * @returns {object[]}
 */
export function blocksIn(categoryId) {
  return BUILDING_BLOCKS.filter((b) => b.category === categoryId);
}
