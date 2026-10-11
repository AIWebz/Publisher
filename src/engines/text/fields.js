// Fields: non-editable atoms inside rich text.
//   <span class="field" data-field="NAME" contenteditable="false">«NAME»</span>
// NAME is a mail-merge column, or a page field: #page, #pages, #date, #time, optionally with a
// format after a colon (#page:roman, #date:long, #date:YYYY-MM-DD, #time:HH:mm).
//
// Contract:
//   listFields(html): string[]                       names of field spans in order (unique)
//   substituteFields(html, resolve(name) => string|null|undefined): string
//       replaces each field span with the escaped resolved value (unresolved fields keep the span)
//   fieldSpan(name): string                           HTML for inserting a field

import { tokenize, attrMap, escapeText, escapeAttr } from './html.js';

/** Page fields offered by the Insert > Page number / Date & time commands. */
export const PAGE_FIELDS = [
  { name: '#page', label: 'Page number' },
  { name: '#pages', label: 'Number of pages' },
  { name: '#date', label: 'Date' },
  { name: '#time', label: 'Time' }
];

/** Date formats understood by `#date:FORMAT` (besides token patterns such as YYYY-MM-DD). */
export const DATE_FORMATS = [
  { id: '', label: 'Default' }, { id: 'short', label: 'Short' }, { id: 'medium', label: 'Medium' },
  { id: 'long', label: 'Long' }, { id: 'full', label: 'Full' }, { id: 'iso', label: 'ISO (YYYY-MM-DD)' }
];

function isFieldStart(t) {
  if (t.type !== 'start' || t.name !== 'span') return null;
  const a = attrMap(t.attrs);
  if (!/(^|\s)field(\s|$)/.test(a.class || '') || typeof a['data-field'] !== 'string' || a['data-field'] === '') return null;
  return a['data-field'];
}

/**
 * Locate field spans in HTML. Returns source ranges for the whole span ([start, end)) and for its
 * content ([innerStart, innerEnd)).
 * @param {string} html
 * @returns {Array<{name: string, start: number, end: number, innerStart: number, innerEnd: number}>}
 */
export function findFields(html) {
  const src = String(html ?? '');
  const tokens = tokenize(src);
  const out = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    const name = isFieldStart(t);
    if (name === null) continue;
    if (t.selfClosing) { out.push({ name, start: t.start, end: t.end, innerStart: t.end, innerEnd: t.end }); continue; }
    let depth = 1, j = k + 1;
    for (; j < tokens.length; j++) {
      const u = tokens[j];
      if (u.type === 'start' && u.name === 'span') depth++;
      else if (u.type === 'end' && u.name === 'span' && --depth === 0) break;
    }
    if (j < tokens.length) {
      out.push({ name, start: t.start, end: tokens[j].end, innerStart: t.end, innerEnd: tokens[j].start });
      k = j;
    } else {
      out.push({ name, start: t.start, end: src.length, innerStart: t.end, innerEnd: src.length });
      break;
    }
  }
  return out;
}

/**
 * Names of the fields used in `html`, in order of first appearance (unique).
 * @param {string} html
 * @returns {string[]}
 */
export function listFields(html) {
  const out = [];
  for (const f of findFields(html)) if (!out.includes(f.name)) out.push(f.name);
  return out;
}

function replaceRanges(src, ranges, fn) {
  let out = '', pos = 0;
  for (const r of ranges) {
    const rep = fn(r);
    if (rep === null) continue;
    out += src.slice(pos, rep.from) + rep.text;
    pos = rep.to;
  }
  return out + src.slice(pos);
}

/**
 * Replace field spans with their (escaped) values. Fields whose resolver returns null/undefined
 * are left untouched.
 * @param {string} html
 * @param {(name: string) => (string|number|null|undefined)} resolve
 * @returns {string}
 */
export function substituteFields(html, resolve) {
  const src = String(html ?? '');
  return replaceRanges(src, findFields(src), (f) => {
    const v = resolve ? resolve(f.name) : null;
    return v === null || v === undefined ? null : { from: f.start, to: f.end, text: escapeText(String(v)) };
  });
}

/**
 * Like substituteFields, but keeps the field span and only replaces its content (the value, or
 * the «NAME» placeholder when unresolved). Used for layout and on-canvas display, so a laid-out
 * fragment still knows where its fields are.
 * @param {string} html
 * @param {(name: string) => (string|number|null|undefined)} resolve
 * @returns {string}
 */
export function renderFields(html, resolve) {
  const src = String(html ?? '');
  return replaceRanges(src, findFields(src), (f) => {
    const v = resolve ? resolve(f.name) : null;
    const text = v === null || v === undefined ? `«${f.name}»` : String(v);
    return { from: f.innerStart, to: f.innerEnd, text: escapeText(text) };
  });
}

/**
 * HTML for a field atom.
 * @param {string} name
 * @returns {string}
 */
export function fieldSpan(name) {
  return `<span class="field" data-field="${escapeAttr(name)}" contenteditable="false">«${escapeText(name)}»</span>`;
}

/**
 * Split a field name into its base and format: '#date:long' -> { base: '#date', format: 'long' }.
 * @param {string} name
 * @returns {{ base: string, format: string }}
 */
export function parseFieldName(name) {
  const s = String(name ?? '');
  if (s[0] !== '#') return { base: s, format: '' };
  const i = s.indexOf(':');
  return i < 0 ? { base: s, format: '' } : { base: s.slice(0, i), format: s.slice(i + 1) };
}

/** True for #page, #pages, #date and #time fields (with or without a format). */
export function isPageField(name) {
  return ['#page', '#pages', '#date', '#time'].includes(parseFieldName(name).base);
}

const ROMAN = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];

/**
 * Format a page number: '' (arabic), 'roman', 'ROMAN', 'alpha' (a…z, aa…), 'ALPHA', or '01'
 * style zero padding (the number of digits in the format).
 * @param {number} n
 * @param {string} [format]
 * @returns {string}
 */
export function formatPageNumber(n, format = '') {
  n = Math.round(Number(n));
  if (!Number.isFinite(n)) return '';
  const f = String(format || '');
  if (/^roman$/i.test(f) && n > 0 && n < 4000) {
    let s = '', v = n;
    for (const [k, r] of ROMAN) while (v >= k) { s += r; v -= k; }
    return f === 'ROMAN' ? s.toUpperCase() : s;
  }
  if (/^alpha$/i.test(f) && n > 0) {
    let s = '', v = n;
    while (v > 0) { v--; s = String.fromCharCode(97 + (v % 26)) + s; v = Math.floor(v / 26); }
    return f === 'ALPHA' ? s.toUpperCase() : s;
  }
  if (/^0+$/.test(f)) return String(n).padStart(f.length, '0');
  return String(n);
}

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Format a date. format: '' (locale default), 'short' | 'medium' | 'long' | 'full' (Intl date
 * styles), 'iso' (YYYY-MM-DD), or a pattern with tokens YYYY YY MMMM MMM MM M DD D dddd ddd
 * HH H hh h mm ss A a; text in [brackets] is literal.
 * @param {Date} date
 * @param {string} [format]
 * @param {string} [locale]
 * @returns {string}
 */
export function formatDate(date, format = '', locale = undefined) {
  const d = date instanceof Date ? date : new Date(date ?? Date.now());
  if (Number.isNaN(d.getTime())) return '';
  const f = String(format || '');
  if (!f) return d.toLocaleDateString(locale);
  if (['short', 'medium', 'long', 'full'].includes(f)) return new Intl.DateTimeFormat(locale, { dateStyle: f }).format(d);
  if (f === 'iso') return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const name = (opts) => new Intl.DateTimeFormat(locale, opts).format(d);
  const h = d.getHours();
  const map = {
    YYYY: () => String(d.getFullYear()), YY: () => pad2(d.getFullYear() % 100),
    MMMM: () => name({ month: 'long' }), MMM: () => name({ month: 'short' }), MM: () => pad2(d.getMonth() + 1), M: () => String(d.getMonth() + 1),
    DD: () => pad2(d.getDate()), D: () => String(d.getDate()),
    dddd: () => name({ weekday: 'long' }), ddd: () => name({ weekday: 'short' }),
    HH: () => pad2(h), H: () => String(h), hh: () => pad2(h % 12 || 12), h: () => String(h % 12 || 12),
    mm: () => pad2(d.getMinutes()), ss: () => pad2(d.getSeconds()), A: () => (h < 12 ? 'AM' : 'PM'), a: () => (h < 12 ? 'am' : 'pm')
  };
  return f.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|ss|A|a/g, (tok, lit) => (lit !== undefined ? lit : map[tok]()));
}

/**
 * Format a time: '' (locale hour:minute) or a token pattern (see formatDate).
 * @param {Date} date
 * @param {string} [format]
 * @param {string} [locale]
 * @returns {string}
 */
export function formatTime(date, format = '', locale = undefined) {
  const d = date instanceof Date ? date : new Date(date ?? Date.now());
  if (Number.isNaN(d.getTime())) return '';
  if (!format) return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  return formatDate(d, format, locale);
}

/**
 * Resolve a page field. Returns null for names that are not page fields, or when the needed
 * context is missing (e.g. no page number for a frame on a master page).
 * @param {string} name
 * @param {{ page?: number, pages?: number, date?: Date, locale?: string }} ctx page is 1-based
 * @returns {string|null}
 */
export function resolvePageField(name, ctx = {}) {
  const { base, format } = parseFieldName(name);
  switch (base) {
    case '#page': return Number.isFinite(ctx.page) ? formatPageNumber(ctx.page, format) : null;
    case '#pages': return Number.isFinite(ctx.pages) ? formatPageNumber(ctx.pages, format) : null;
    case '#date': return formatDate(ctx.date || new Date(), format, ctx.locale);
    case '#time': return formatTime(ctx.date || new Date(), format, ctx.locale);
    default: return null;
  }
}
