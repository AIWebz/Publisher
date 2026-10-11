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

/** @type {Array<{id: string, name: string, category: string, description: string, sizeLabel: string, build: Function}>} */
export const TEMPLATES = [
  ...PRINT_TEMPLATES
];

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
