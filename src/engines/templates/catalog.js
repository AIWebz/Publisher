// Template catalog: categories and fully editable starter publications.
//
//   CATEGORIES: [{ id, name, description }] in display order
//   TEMPLATES:  [{ id, name, category, description, sizeLabel, build(opts?) -> Doc }]
//   getTemplate(id), templatesIn(categoryId), buildTemplate(id, opts)
//
// Every template is built only from core/model.js factories: real text frames (stories), shapes,
// lines, tables, picture placeholders (image elements with assetId null), master pages and merge
// fields. Colours and fonts reference the theme (@accent, @heading, …) so colour and font schemes
// restyle them.

import { PRINT_TEMPLATES } from './catalog-print.js';
import { CARD_TEMPLATES } from './catalog-cards.js';
import { MAIL_TEMPLATES } from './catalog-mail.js';
import { COMMERCE_TEMPLATES } from './catalog-commerce.js';
import { buildWallCalendar, buildYearCalendar } from './calendar.js';
import { IN, newDoc, text, p, hline } from './kit.js';

function wallCalendar(opts = {}) {
  const year = opts.year ?? new Date().getFullYear();
  const doc = newDoc({ title: `${year} Wall Calendar`, size: 'letter', schemeId: opts.schemeId || 'lagoon', fontSchemeId: opts.fontSchemeId || 'modern',
    margins: 0.5 * IN, category: 'calendars' });
  doc.pages = [];
  buildWallCalendar(doc, { year, weekStart: opts.weekStart ?? 0, locale: opts.locale || 'en-US' });
  return doc;
}

function yearAtAGlance(opts = {}) {
  const year = opts.year ?? new Date().getFullYear();
  const doc = newDoc({ title: `${year} Year at a Glance`, size: 'letter', orientation: 'landscape', schemeId: opts.schemeId || 'plum',
    fontSchemeId: opts.fontSchemeId || 'editorial', margins: 0.5 * IN, category: 'calendars' });
  const page = doc.pages[0];
  page.elements.push(
    text(doc, 48, 40, 400, 64, p(String(year)), { font: '@heading', size: 44, color: '@accent', lineHeight: 1 }, { name: 'Year', valign: 'bottom' }),
    text(doc, 608, 40, 400, 64, p('Year at a glance'), { size: 11, caps: true, letterSpacing: 4, color: '@muted', align: 'right' }, { name: 'Subtitle', valign: 'bottom' }),
    hline(48, 116, 960, '@accent2', 1.5, { name: 'Title rule' })
  );
  buildYearCalendar(doc, { year, weekStart: opts.weekStart ?? 0, locale: opts.locale || 'en-US', page, x: 48, y: 136, w: 960, h: 632, cols: 4 });
  return doc;
}

const BLANK_SIZES = [
  ['blank-letter', 'Letter', { size: 'letter' }, '8.5 × 11 in'],
  ['blank-a4', 'A4', { size: 'a4', units: 'mm' }, '210 × 297 mm'],
  ['blank-a5', 'A5', { size: 'a5', units: 'mm' }, '148 × 210 mm'],
  ['blank-tabloid', 'Tabloid', { size: 'tabloid' }, '11 × 17 in'],
  ['blank-business-card', 'Business Card', { size: 'businessCard' }, '3.5 × 2 in'],
  ['blank-postcard', 'Postcard', { size: 'postcard' }, '6 × 4 in'],
  ['blank-greeting-card', 'Greeting Card', { size: 'card5x7', pages: 2 }, '5 × 7 in · 2 pages'],
  ['blank-square', 'Square', { size: 'square8' }, '8 × 8 in'],
  ['blank-banner', 'Banner', { width: 24 * IN, height: 6 * IN, margins: 0.5 * IN }, '24 × 6 in']
];

const BLANK_TEMPLATES = BLANK_SIZES.map(([id, name, opts, sizeLabel]) => ({
  id, name, category: 'blank', description: `An empty ${name.toLowerCase()} publication.`, sizeLabel,
  build: () => newDoc({ title: 'Untitled publication', ...opts, category: 'blank' })
}));

const CALENDAR_TEMPLATES = [
  { id: 'wall-calendar', name: 'Monthly Wall Calendar', category: 'calendars', description: 'Twelve pages, one per month, each with a photo and a full month grid. Options: { year, weekStart }.',
    sizeLabel: 'Letter · 12 pages', build: wallCalendar },
  { id: 'year-at-a-glance', name: 'Year at a Glance', category: 'calendars', description: 'All twelve months on a single landscape page. Options: { year, weekStart }.',
    sizeLabel: 'Letter landscape · 1 page', build: yearAtAGlance }
];

/** Template categories in display order. */
export const CATEGORIES = [
  { id: 'flyers', name: 'Flyers', description: 'Single-page announcements for events, sales and notices.' },
  { id: 'posters', name: 'Posters', description: 'Large-format posters for walls and windows.' },
  { id: 'brochures', name: 'Brochures', description: 'Folded brochures and booklets.' },
  { id: 'newsletters', name: 'Newsletters', description: 'Multi-column newsletters and bulletins.' },
  { id: 'businessCards', name: 'Business Cards', description: 'Single cards and print-ready card sheets.' },
  { id: 'greetingCards', name: 'Greeting Cards', description: 'Folded cards for every occasion.' },
  { id: 'invitations', name: 'Invitations', description: 'Wedding, party and event invitations.' },
  { id: 'postcards', name: 'Postcards', description: 'Picture postcards with an address side.' },
  { id: 'labels', name: 'Labels', description: 'Address and shipping label sheets ready for mail merge.' },
  { id: 'envelopes', name: 'Envelopes', description: 'Business envelopes with return and recipient addresses.' },
  { id: 'calendars', name: 'Calendars', description: 'Monthly wall calendars and year planners.' },
  { id: 'certificates', name: 'Certificates', description: 'Awards and certificates of completion.' },
  { id: 'menus', name: 'Menus', description: 'Restaurant menus and café boards.' },
  { id: 'catalogs', name: 'Catalogs', description: 'Product catalogs and product sheets.' },
  { id: 'priceLists', name: 'Price Lists', description: 'Price lists and service menus.' },
  { id: 'blank', name: 'Blank Sizes', description: 'Empty publications in common sizes.' }
];

const CATEGORY_ORDER = CATEGORIES.map((c) => c.id);

/** @type {Array<{id: string, name: string, category: string, description: string, sizeLabel: string, build: (opts?: object) => object}>} */
export const TEMPLATES = [
  ...PRINT_TEMPLATES,
  ...CARD_TEMPLATES,
  ...MAIL_TEMPLATES,
  ...CALENDAR_TEMPLATES,
  ...COMMERCE_TEMPLATES,
  ...BLANK_TEMPLATES
].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));

/**
 * Find a template by id.
 * @param {string} id
 * @returns {object|null}
 */
export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}

/**
 * Templates in a category, in catalog order.
 * @param {string} categoryId
 * @returns {object[]}
 */
export function templatesIn(categoryId) {
  return TEMPLATES.filter((t) => t.category === categoryId);
}

/**
 * Build a fresh document from a template.
 * @param {string} id
 * @param {object} [opts] template options (e.g. { year, weekStart } for calendars)
 * @returns {object} Doc
 */
export function buildTemplate(id, opts) {
  const t = getTemplate(id);
  if (!t) throw new Error(`Unknown template: ${id}`);
  return t.build(opts);
}
