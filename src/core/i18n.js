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
// listeners re-render text that was already on screen. Most of the interface is built from plain
// English strings, so ui/translate.js also runs every on-screen string through translateUI():
// exact matches, keys with placeholders ("Page {1} of {2}") matched as patterns, and composites
// such as "Bold (Ctrl+B)" or "Size: 12 pt" translated part by part.

import { Emitter } from './events.js';

const events = new Emitter();
let lang = 'en';
let catalog = null;          // { [english]: string | { one, few, many, other, … } }
let rules = null;
let patterns = [];           // catalog keys with {placeholders}, compiled for translateUI()

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
  return t(n === 1 ? one : other, p);
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
  patterns = catalog ? compilePatterns(catalog) : [];
  events.emit('change', lang);
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compilePatterns(cat) {
  const out = [];
  for (const [key, value] of Object.entries(cat)) {
    if (typeof value !== 'string' || !value || !/\{\w+\}/.test(key)) continue;
    const parts = key.split(/\{(\w+)\}/);       // literal, name, literal, name, …
    const names = parts.filter((_, i) => i % 2);
    const literal = parts.filter((_, i) => !(i % 2)).reduce((a, b) => (b.length > a.length ? b : a), '');
    if (literal.trim().length < 2) continue;
    const src = parts.map((p, i) => (i % 2 ? '([\\s\\S]+?)' : escRe(p))).join('');
    out.push({ re: new RegExp(`^${src}$`), names, value, literal });
  }
  // longer literals first, so "{1} of {2} pages" wins over "{1} of {2}"
  return out.sort((a, b) => b.literal.length - a.literal.length);
}

function lookup(text, depth) {
  const hit = catalog[text];
  if (typeof hit === 'string' && hit) return hit;
  for (const p of patterns) {
    if (!text.includes(p.literal)) continue;
    const m = p.re.exec(text);
    if (!m) continue;
    const vals = {};
    p.names.forEach((name, i) => { vals[name] = depth < 1 ? (lookup(m[i + 1], depth + 1) ?? m[i + 1]) : m[i + 1]; });
    return p.value.replace(/\{(\w+)\}/g, (all, name) => (name in vals ? vals[name] : all));
  }
  if (depth > 0) return null;
  // a trailing colon or ellipsis on a known string
  const tail = /^([\s\S]*?[^:…])(:|…|\.\.\.)$/.exec(text);
  if (tail) { const base = lookup(tail[1], 1); if (base != null) return base + tail[2]; }
  // composites: "Bold (Ctrl+B)", "Margins — Narrow", "Size: 12 pt", lines of a multi-line label
  const parts = text.split(/(\s+[—–·|]\s+|:\s+|\s*\(|\)\s*|\n+)/);
  if (parts.length > 1) {
    let changed = false;
    const out = parts.map((part, i) => {
      if (i % 2 || !/[A-Za-z]{2}/.test(part)) return part;
      const tr = lookup(part.trim(), 1);
      if (tr == null) return part;
      changed = true;
      return part.replace(part.trim(), tr);
    });
    if (changed) return out.join('');
  }
  return null;
}

/**
 * Translate a string as it appears on screen (any English interface text, placeholders already
 * filled in). Leading and trailing spaces are kept; text with no translation comes back unchanged.
 * @param {string} text
 */
export function translateUI(text) {
  if (!catalog || !text) return text;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  if (!m[2] || !/[A-Za-z]/.test(m[2])) return text;
  const hit = lookup(m[2], 0);
  return hit == null ? text : m[1] + hit + m[3];
}

/** True while a non-English catalog is installed. */
export function translating() { return !!catalog; }

/** Subscribe to display-language changes. Returns an unsubscribe function. */
export function onLanguageChange(fn) {
  events.on('change', fn);
  return () => events.off('change', fn);
}
