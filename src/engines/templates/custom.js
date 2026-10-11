// Custom (user) templates and template-instantiation helpers. Pure: no DOM, no platform access.
//
//   createTemplateRecord(doc, { name, category, description }) -> TemplateRecord
//   normalizeTemplateRecord(raw) -> TemplateRecord | null
//   docFromTemplate(source, { schemeId?, fontSchemeId?, title? }) -> fresh Doc
//   applySchemes(doc, schemeId?, fontSchemeId?) -> doc
//   searchTemplates(list, query, categoryNames?) -> filtered list
//   sizeLabelFor(doc) -> '8.5 × 11 in · 2 pages'
//
// TemplateRecord = { format: 'folio-template', version: 1, id, name, category, description,
//                    createdAt, updatedAt, pages, width, height, doc }

import { clone, uid, normalizeDocument, pruneUnused } from '../../core/model.js';
import { COLOR_SCHEMES, FONT_SCHEMES } from '../../core/theme.js';

/** Format tag of stored custom templates. */
export const TEMPLATE_FORMAT = 'folio-template';
/** Category id used for user templates. */
export const MY_TEMPLATES = 'mine';

const UNIT_FACTORS = { in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, pc: 16, px: 1 };

const fmt = (v) => {
  const r = Math.round(v * 100) / 100;
  return String(r);
};

/**
 * Human-readable size and page count of a document ("8.5 × 11 in · 2 pages").
 * @param {object} doc
 * @returns {string}
 */
export function sizeLabelFor(doc) {
  const units = UNIT_FACTORS[doc.setup.units] ? doc.setup.units : 'in';
  const f = UNIT_FACTORS[units];
  const n = doc.pages.length;
  return `${fmt(doc.setup.width / f)} × ${fmt(doc.setup.height / f)} ${units} · ${n} page${n === 1 ? '' : 's'}`;
}

const cleanText = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);

/**
 * Snapshot a publication as a custom template record. The document is deep-copied and unused
 * stories/assets are pruned; pages, masters, stories, assets, theme and merge data are kept.
 * @param {object} doc
 * @param {{ name: string, category?: string, description?: string, id?: string, createdAt?: number }} meta
 * @returns {object} TemplateRecord
 */
export function createTemplateRecord(doc, meta = {}) {
  const name = cleanText(meta.name, 120) || cleanText(doc.title, 120) || 'My template';
  const copy = pruneUnused(clone(doc));
  copy.title = name;
  const now = Date.now();
  return {
    format: TEMPLATE_FORMAT,
    version: 1,
    id: meta.id || uid('tpl'),
    name,
    category: cleanText(meta.category, 60) || MY_TEMPLATES,
    description: cleanText(meta.description, 600),
    createdAt: meta.createdAt || now,
    updatedAt: now,
    pages: copy.pages.length,
    width: copy.setup.width,
    height: copy.setup.height,
    doc: copy
  };
}

/**
 * Validate a stored record (from disk or IndexedDB). Returns a normalised record or null.
 * @param {any} raw
 * @returns {object|null}
 */
export function normalizeTemplateRecord(raw) {
  if (!raw || typeof raw !== 'object' || raw.format !== TEMPLATE_FORMAT || !raw.doc) return null;
  let doc;
  try { doc = normalizeDocument(raw.doc); } catch { return null; }
  if (typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(raw.id)) return null;
  return {
    format: TEMPLATE_FORMAT,
    version: 1,
    id: raw.id,
    name: cleanText(raw.name, 120) || 'My template',
    category: cleanText(raw.category, 60) || MY_TEMPLATES,
    description: cleanText(raw.description, 600),
    createdAt: Number(raw.createdAt) || 0,
    updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || 0,
    pages: doc.pages.length,
    width: doc.setup.width,
    height: doc.setup.height,
    doc
  };
}

/**
 * Apply a colour scheme and/or font scheme to a document theme (unknown or empty ids are ignored).
 * @param {object} doc
 * @param {string} [schemeId]
 * @param {string} [fontSchemeId]
 * @returns {object} doc
 */
export function applySchemes(doc, schemeId, fontSchemeId) {
  if (schemeId && COLOR_SCHEMES[schemeId] && schemeId !== doc.theme.schemeId) {
    doc.theme.schemeId = schemeId;
    doc.theme.colors = { ...COLOR_SCHEMES[schemeId].colors };
  }
  if (fontSchemeId && FONT_SCHEMES[fontSchemeId] && fontSchemeId !== doc.theme.fontSchemeId) {
    const fs = FONT_SCHEMES[fontSchemeId];
    doc.theme.fontSchemeId = fontSchemeId;
    doc.theme.fonts = { heading: fs.heading, body: fs.body };
  }
  return doc;
}

/**
 * Make a fresh, independent publication from a template document or record: deep copy, new
 * document id, optional title, colour and font schemes.
 * @param {object} source a Doc or a TemplateRecord
 * @param {{ schemeId?: string, fontSchemeId?: string, title?: string }} [opts]
 * @returns {object} Doc
 */
export function docFromTemplate(source, opts = {}) {
  const raw = source && source.format === TEMPLATE_FORMAT ? source.doc : source;
  const doc = normalizeDocument(clone(raw));
  doc.id = uid('d');
  if (opts.title) doc.title = opts.title;
  applySchemes(doc, opts.schemeId, opts.fontSchemeId);
  return doc;
}

const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Filter templates by a search query: every word must appear in the name, description, size
 * label or category name. An empty query returns the list unchanged.
 * @param {object[]} list items with { name, description, sizeLabel?, category }
 * @param {string} query
 * @param {Record<string,string>} [categoryNames] category id -> display name
 * @returns {object[]}
 */
export function searchTemplates(list, query, categoryNames = {}) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((t) => {
    const hay = fold([t.name, t.description, t.sizeLabel, t.category, categoryNames[t.category]].join(' '));
    return words.every((w) => hay.includes(w));
  });
}
