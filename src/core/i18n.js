// Interface translation. Every user-visible string goes through t() with its English text as the
// key ("gettext" style); placeholders are written {name} and filled from `params`. Catalogs map
// English keys to translations for the current display language; a missing entry falls back to
// the English text, so untranslated strings still read correctly.
//
//   t('Save')                               -> 'Enregistrer'
//   t('Saved “{name}” to My Templates', { name })
//   tp(count, '{n} page', '{n} pages')      -> plural form chosen with Intl.PluralRules
//
// setCatalog() installs the strings of a language (the language feature loads them); 'change'
// listeners re-render text that was already on screen.

import { Emitter } from './events.js';

const events = new Emitter();
let lang = 'en';
let catalog = null;          // { [english]: string | { one, few, many, other, … } }
let rules = null;

const fill = (s, params) => (params ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : String(s));

/**
 * Translate an interface string.
 * @param {string} text English source text (also the catalog key)
 * @param {Record<string, any>} [params] values for {placeholders}
 * @returns {string}
 */
export function t(text, params) {
  if (text === undefined || text === null) return '';
  const hit = catalog && typeof catalog[text] === 'string' && catalog[text] ? catalog[text] : text;
  return fill(hit, params);
}

/**
 * Translate a string with a count: `one`/`other` are the English singular/plural forms (with {n}).
 * Catalog entries for the key `${one}|${other}` are objects keyed by CLDR plural category.
 * @param {number} n
 * @param {string} one
 * @param {string} other
 * @param {Record<string, any>} [params]
 */
export function tp(n, one, other, params = {}) {
  const p = { n, ...params };
  const entry = catalog && catalog[`${one}|${other}`];
  if (entry && typeof entry === 'object') {
    const cat = rules ? rules.select(n) : (n === 1 ? 'one' : 'other');
    const form = entry[cat] || entry.other;
    if (form) return fill(form, p);
  }
  return fill(n === 1 ? one : other, p);
}

/** Mark a string for extraction without translating it now (translate later with t(s)). */
export const tx = (text) => text;

/** Current display language (BCP 47). */
export function currentLanguage() { return lang; }

/**
 * Install the catalog for a display language (null catalog = English) and notify listeners.
 * @param {string} code
 * @param {object|null} strings
 */
export function setCatalog(code, strings) {
  lang = code || 'en';
  catalog = strings && typeof strings === 'object' ? strings : null;
  try { rules = new Intl.PluralRules(lang); } catch { rules = null; }
  events.emit('change', lang);
}

/** Subscribe to display-language changes. Returns an unsubscribe function. */
export function onLanguageChange(fn) {
  events.on('change', fn);
  return () => events.off('change', fn);
}
