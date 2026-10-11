// Spell checking for Folio: an nspell (Hunspell-compatible) checker with the English dictionary,
// a personal dictionary, session ignore list, and document-level helpers for Review > Spelling.

import nspell from 'nspell';
import { tokenizeWords } from './tokenizer.js';
import { getPlainText, rangeHasAtom } from './html-text.js';
import { collectTextTargets, getTargetHtml, targetKey } from './targets.js';
import { replaceTextRange, replaceAll } from './find.js';

export const MAX_SUGGESTIONS = 8;

const normApos = (w) => String(w).replace(/[’‘ʼ]/g, "'");

function readOk(res) {
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${res.url}`);
  return res.text();
}

function xhrText(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'text';
    xhr.onload = () => (xhr.status === 200 || (xhr.status === 0 && xhr.responseText)
      ? resolve(xhr.responseText) : reject(new Error(`Could not load ${url} (${xhr.status})`)));
    xhr.onerror = () => reject(new Error(`Could not load ${url}`));
    xhr.send();
  });
}

async function loadText(url) {
  try {
    return await fetch(url).then(readOk);
  } catch (err) {
    // file:// pages (Electron loadFile) may refuse fetch(); XMLHttpRequest still works there.
    if (typeof XMLHttpRequest === 'undefined') throw err;
    return xhrText(url);
  }
}

/**
 * Dictionary loader for the app: fetches `<base>en.aff` and `<base>en.dic` (copied into app/dict/
 * by scripts/build.mjs).
 * @param {string} [base] URL prefix, default 'dict/'
 * @returns {() => Promise<{ aff: string, dic: string }>}
 */
export function fetchDictionaryLoader(base = 'dict/') {
  return async () => {
    const [aff, dic] = await Promise.all([loadText(`${base}en.aff`), loadText(`${base}en.dic`)]);
    return { aff, dic };
  };
}

/**
 * A loaded spell checker.
 */
export class SpellChecker {
  constructor(engine, opts) {
    this.engine = engine;
    this.options = { skipAllCaps: opts.skipAllCaps !== false, skipWordsWithNumbers: opts.skipWordsWithNumbers !== false };
    this.lang = opts.lang || 'en-US';
    // scripts written without spaces (Thai, Lao, Tibetan) are split into words with Intl.Segmenter
    this.segmenter = opts.segment && typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(opts.segment, { granularity: 'word' }) : null;
    this.onPersonalChange = typeof opts.onPersonalChange === 'function' ? opts.onPersonalChange : null;
    this.personal = new Set();
    this.ignored = new Set();
    this.cache = new Map();
    this.suggestCache = new Map();
    for (const w of opts.personal || []) this._add(w);
  }

  _add(word) {
    const w = normApos(String(word ?? '').trim());
    if (!w || this.personal.has(w)) return false;
    this.personal.add(w);
    this.engine.add(w);
    return true;
  }

  _invalidate() {
    this.cache.clear();
    this.suggestCache.clear();
  }

  /**
   * Is a single word spelled correctly (dictionary, personal dictionary or ignored)?
   * Curly apostrophes are treated as straight ones; a possessive 's is accepted when the base is.
   * @param {string} word
   * @returns {boolean}
   */
  correct(word) {
    const w = normApos(String(word ?? ''));
    if (!w) return true;
    if (this.ignored.has(w.toLowerCase())) return true;
    const hit = this.cache.get(w);
    if (hit !== undefined) return hit;
    let ok = this.personal.has(w) || this.engine.correct(w);
    if (!ok && /'s$/i.test(w) && w.length > 2) ok = this.engine.correct(w.slice(0, -2)) || this.personal.has(w.slice(0, -2));
    this.cache.set(w, ok);
    return ok;
  }

  /**
   * Up to 8 spelling suggestions for a word (curly apostrophes are preserved in suggestions).
   * @param {string} word
   * @returns {string[]}
   */
  suggest(word) {
    const original = String(word ?? '');
    if (!original) return [];
    const hit = this.suggestCache.get(original);
    if (hit) return hit.slice();
    const curly = /[’]/.test(original);
    let list = this.engine.suggest(normApos(original));
    if (curly) list = list.map((s) => s.replace(/'/g, '’'));
    list = [...new Set(list)].slice(0, MAX_SUGGESTIONS);
    this.suggestCache.set(original, list);
    return list.slice();
  }

  /**
   * Add a word to the personal dictionary (persisted through `onPersonalChange(words)`).
   * @param {string} word
   * @returns {boolean} true if the word was new
   */
  addWord(word) {
    const added = this._add(word);
    if (added) {
      this._invalidate();
      if (this.onPersonalChange) this.onPersonalChange(this.personalWords());
    }
    return added;
  }

  /**
   * Remove a word from the personal dictionary.
   * @param {string} word
   * @returns {boolean} true if it was present
   */
  removeWord(word) {
    const w = normApos(String(word ?? '').trim());
    if (!this.personal.delete(w)) return false;
    this.engine.remove(w);
    this._invalidate();
    if (this.onPersonalChange) this.onPersonalChange(this.personalWords());
    return true;
  }

  /** @returns {string[]} the personal dictionary, sorted */
  personalWords() {
    return [...this.personal].sort((a, b) => a.localeCompare(b));
  }

  /**
   * Ignore a word (any capitalisation) for the rest of the session (Ignore All).
   * @param {string} word
   */
  ignore(word) {
    const w = normApos(String(word ?? '')).toLowerCase();
    if (w) { this.ignored.add(w); this.cache.clear(); }
  }

  /**
   * @param {string} word
   * @returns {boolean} whether the word is on the session ignore list
   */
  isIgnored(word) {
    return this.ignored.has(normApos(String(word ?? '')).toLowerCase());
  }

  /** Clear the session ignore list. */
  clearIgnored() {
    this.ignored.clear();
    this.cache.clear();
  }

  /**
   * Find misspelled words in plain text. Hyphenated words are accepted whole when the dictionary
   * knows them, otherwise each part is checked (and reported) separately. URLs, e-mail addresses,
   * domains, numbers, ordinals, «merge fields» and (by default) ALLCAPS words are skipped.
   * @param {string} text
   * @returns {Array<{ word: string, start: number, end: number }>}
   */
  checkText(text) {
    const out = [];
    for (const tok of tokenizeWords(text, this.options)) {
      if (tok.skip) continue;
      if (tok.parts) {
        if (this.correct(tok.word)) continue;
        for (const p of tok.parts) if (!p.skip && !this.correct(p.word)) out.push({ word: p.word, start: p.start, end: p.end });
        continue;
      }
      if (this.segmenter && !this.correct(tok.word)) {
        for (const sg of this.segmenter.segment(tok.word)) {
          if (sg.isWordLike && !this.correct(sg.segment)) out.push({ word: sg.segment, start: tok.start + sg.index, end: tok.start + sg.index + sg.segment.length });
        }
        continue;
      }
      if (!this.correct(tok.word)) out.push({ word: tok.word, start: tok.start, end: tok.end });
    }
    return out;
  }
}

/**
 * Create a spell checker. `loadDictionary()` must resolve `{ aff, dic }` (strings or bytes); in
 * the app it defaults to fetching dict/en.aff + dict/en.dic.
 * Options: personal (initial personal-dictionary words), onPersonalChange(words) (persistence
 * callback), skipAllCaps (default true), skipWordsWithNumbers (default true).
 * The checker exposes correct(word), suggest(word), addWord(word), removeWord(word),
 * personalWords(), ignore(word), isIgnored(word), clearIgnored(), checkText(text).
 * @param {{ loadDictionary?: () => Promise<{aff: any, dic: any}>, personal?: string[],
 *   onPersonalChange?: (words: string[]) => void, skipAllCaps?: boolean, skipWordsWithNumbers?: boolean }} [opts]
 * @returns {Promise<SpellChecker>}
 */
export async function createSpellChecker(opts = {}) {
  const load = opts.loadDictionary || fetchDictionaryLoader();
  const { aff, dic } = await load();
  const toText = (v) => (typeof v === 'string' ? v : new TextDecoder('utf-8').decode(v));
  const engine = nspell(toText(aff), toText(dic));
  return new SpellChecker(engine, opts);
}

let shared = null;
let sharedChecker = null;

/**
 * Lazily create (once) and return the shared spell checker. The dictionary (~550 KB) is only
 * fetched on the first call; later calls return the cached instance. A failed load is not cached.
 * @param {Parameters<typeof createSpellChecker>[0]} [opts] used on the first call only
 * @returns {Promise<SpellChecker>}
 */
export function getSpellChecker(opts = {}) {
  if (!shared) {
    shared = createSpellChecker(opts).then((c) => { sharedChecker = c; return c; }, (err) => { shared = null; throw err; });
  }
  return shared;
}

/**
 * The shared checker if it has finished loading, else null (never triggers a load).
 * @returns {SpellChecker|null}
 */
export function peekSpellChecker() {
  return sharedChecker;
}

/** Forget the shared checker (next getSpellChecker() loads again). */
export function resetSpellChecker() {
  shared = null;
  sharedChecker = null;
}

/**
 * Spelling issues in one HTML fragment (story or cell): plain-text offsets (see getPlainText),
 * one paragraph at a time; words inside merge fields are skipped.
 * @param {string} html
 * @param {SpellChecker} checker
 * @param {{ suggestions?: boolean }} [opts] suggestions default true
 * @returns {Array<{ start: number, end: number, word: string, suggestions: string[] }>}
 */
export function spellcheckHtml(html, checker, opts = {}) {
  return spellcheckPlain(getPlainText(html), checker, opts);
}

function spellcheckPlain(plain, checker, opts = {}) {
  const wantSuggestions = opts.suggestions !== false;
  const out = [];
  for (const block of plain.blocks) {
    const seg = plain.text.slice(block.start, block.end);
    for (const hit of checker.checkText(seg)) {
      const start = block.start + hit.start;
      const end = block.start + hit.end;
      if (rangeHasAtom(plain, start, end)) continue;
      out.push({ start, end, word: hit.word, suggestions: wantSuggestions ? checker.suggest(hit.word) : [] });
    }
  }
  return out;
}

/**
 * Spelling issues across the whole document (stories and table cells in reading order).
 * @param {object} doc
 * @param {SpellChecker|((target: object) => SpellChecker|null)} checker one checker, or one per target (null = skip)
 * @param {{ suggestions?: boolean, includeMasters?: boolean }} [opts]
 * @returns {Array<{ target: object, start: number, end: number, word: string, suggestions: string[] }>}
 */
export function spellcheckDocument(doc, checker, opts = {}) {
  const out = [];
  const pick = typeof checker === 'function' ? checker : () => checker;
  for (const target of collectTextTargets(doc, opts)) {
    const c = pick(target);
    if (!c) continue;
    const html = getTargetHtml(doc, target);
    if (!html) continue;
    for (const issue of spellcheckHtml(html, c, opts)) out.push({ target, ...issue });
  }
  return out;
}

/**
 * Change one spelling issue to `replacement`, preserving formatting. Returns false if the text
 * at the issue's position is no longer the misspelled word.
 * @param {object} doc
 * @param {{ target: object, start: number, end: number, word: string }} issue
 * @param {string} replacement
 * @returns {boolean}
 */
export function applyCorrection(doc, issue, replacement) {
  return replaceTextRange(doc, issue.target, issue.start, issue.end, replacement, issue.word);
}

/**
 * Change every whole-word, case-sensitive occurrence of `word` in the document (Change All).
 * @param {object} doc
 * @param {string} word
 * @param {string} replacement
 * @returns {number} number of replacements
 */
export function changeAll(doc, word, replacement) {
  return replaceAll(doc, word, replacement, { matchCase: true, wholeWord: true, useRegex: false });
}

/**
 * Walk the document's spelling issues one at a time, as the Review > Spelling dialog does.
 * session.next() -> issue|null (the current issue, or the next one after the cursor);
 * ignore() skips this occurrence; ignoreAll() ignores the word for the session;
 * addToDictionary() adds it to the personal dictionary; change(rep) / changeAll(rep) correct it.
 * Every action returns the next issue (or null when the check is complete). The document is
 * re-read on each step, so edits made between steps are respected.
 * @param {object} doc
 * @param {SpellChecker} checker
 * @param {{ start?: { target: object, offset: number }, includeMasters?: boolean }} [opts]
 * @returns {{ next: Function, ignore: Function, ignoreAll: Function, addToDictionary: Function,
 *   change: Function, changeAll: Function, readonly current: object|null, readonly checked: number }}
 */
export function createSpellingSession(doc, checker, opts = {}) {
  let cursor = opts.start ? { key: targetKey(opts.start.target), offset: opts.start.offset || 0 } : null;
  let current = null;
  let checked = 0;

  const next = () => {
    const targets = collectTextTargets(doc, opts);
    let i = 0;
    let offset = 0;
    if (cursor) {
      const k = targets.findIndex((t) => targetKey(t) === cursor.key);
      if (k >= 0) { i = k; offset = cursor.offset; } else { i = cursor.index ?? 0; offset = 0; }
    }
    for (; i < targets.length; i++, offset = 0) {
      const target = targets[i];
      const html = getTargetHtml(doc, target);
      if (!html) continue;
      const plain = getPlainText(html);
      const issue = spellcheckPlain(plain, checker, { suggestions: false }).find((x) => x.start >= offset);
      if (issue) {
        current = { target, ...issue, suggestions: checker.suggest(issue.word) };
        cursor = { key: targetKey(target), offset: issue.start, index: i };
        return current;
      }
      checked = Math.max(checked, i + 1);
    }
    current = null;
    cursor = { key: '', offset: 0, index: targets.length };
    return null;
  };
  const advance = (to) => { if (current) cursor = { ...cursor, offset: to }; return next(); };

  return {
    next: () => (current ? current : next()),
    ignore: () => (current ? advance(current.end) : next()),
    ignoreAll: () => { if (current) checker.ignore(current.word); return current ? advance(current.end) : next(); },
    addToDictionary: () => { if (current) checker.addWord(current.word); return current ? advance(current.end) : next(); },
    change: (replacement) => {
      if (!current) return next();
      const rep = String(replacement ?? '');
      const ok = applyCorrection(doc, current, rep);
      return advance(ok ? current.start + rep.length : current.end);
    },
    changeAll: (replacement) => {
      if (!current) return next();
      const rep = String(replacement ?? '');
      changeAll(doc, current.word, rep);
      return advance(current.start + rep.length);
    },
    get current() { return current; },
    get checked() { return checked; }
  };
}
