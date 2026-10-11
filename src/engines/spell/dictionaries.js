// Spelling dictionaries for the 85 proofing languages (built into app/dict by
// scripts/dictionaries.mjs): Hunspell dictionaries run in WebAssembly Hunspell (hunspell-asm),
// word lists (Finnish, Kazakh, Malayalam, Filipino, Urdu) in a frequency-ranked word set.
// checkerFor(id) loads a language once and returns a SpellChecker (see spell.js).

import { loadModule } from 'hunspell-asm/dist/cjs/index.js';  // the ESM build calls a namespace import of nanoid
import { SpellChecker, MAX_SUGGESTIONS } from './spell.js';
import { proofing, SEGMENTED } from '../../core/languages.js';

let base = 'dict/';
let manifestP = null;
let factoryP = null;
const checkers = new Map();     // id -> Promise<SpellChecker>
const loaded = new Map();       // id -> SpellChecker

/** Where the dictionary files are served from (default 'dict/'). */
export function setDictionaryBase(url) { base = url; manifestP = null; }

function xhr(url, type) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('GET', url);
    x.responseType = type;
    x.onload = () => (x.status === 200 || (x.status === 0 && x.response) ? resolve(x.response) : reject(new Error(`Could not load ${url} (${x.status})`)));
    x.onerror = () => reject(new Error(`Could not load ${url}`));
    x.send();
  });
}

async function bytes(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} loading ${url}`);
    return new Uint8Array(await r.arrayBuffer());
  } catch (err) {
    // file:// pages (Electron) may refuse fetch(); XMLHttpRequest still works there.
    if (typeof XMLHttpRequest === 'undefined') throw err;
    return new Uint8Array(await xhr(url, 'arraybuffer'));
  }
}

async function gunzip(buf) {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The dictionary manifest (index.json): id -> { engine, files, bytes, source, … }. */
export function dictionaryManifest() {
  if (!manifestP) manifestP = bytes(`${base}index.json`).then((b) => JSON.parse(new TextDecoder().decode(b))).catch((err) => { manifestP = null; throw err; });
  return manifestP;
}

/** Spelling engine over a frequency-ranked word list (most frequent first). */
function wordListEngine(text) {
  const words = text.split('\n').filter(Boolean);
  const rank = new Map();
  words.forEach((w, i) => { if (!rank.has(w)) rank.set(w, i); });
  const alphabet = [...new Set(words.slice(0, 20000).join(''))].filter((c) => c.toLowerCase() === c);
  const has = (w) => rank.has(w) || rank.has(w.toLowerCase()) || rank.has(w[0].toLowerCase() + w.slice(1));
  const edits = (w) => {
    const out = new Set();
    for (let i = 0; i <= w.length; i++) {
      const a = w.slice(0, i), b = w.slice(i);
      if (b) out.add(a + b.slice(1));
      if (b.length > 1) out.add(a + b[1] + b[0] + b.slice(2));
      for (const c of alphabet) { if (b) out.add(a + c + b.slice(1)); out.add(a + c + b); }
    }
    return out;
  };
  return {
    correct: (w) => !!w && has(w),
    suggest(w) {
      const lw = w.toLowerCase();
      let cand = [...edits(lw)].filter((x) => rank.has(x));
      if (!cand.length && lw.length <= 10) {
        const seen = new Set();
        for (const e of edits(lw)) for (const x of edits(e)) if (!seen.has(x) && rank.has(x)) seen.add(x);
        cand = [...seen];
      }
      const cap = w[0] !== lw[0];
      return cand.sort((a, b) => rank.get(a) - rank.get(b)).slice(0, MAX_SUGGESTIONS).map((x) => (cap ? x[0].toUpperCase() + x.slice(1) : x));
    },
    add: (w) => { if (!rank.has(w)) rank.set(w, rank.size); },
    remove: (w) => { rank.delete(w); }
  };
}

async function hunspellEngine(entry) {
  if (!factoryP) factoryP = loadModule().catch((err) => { factoryP = null; throw err; });
  const factory = await factoryP;
  const [aff, dic] = await Promise.all(entry.files.map((f) => bytes(base + f).then(gunzip)));
  const id = entry.files[0].replace(/\.aff\.gz$/, '');
  const h = factory.create(factory.mountBuffer(aff, `${id}.aff`), factory.mountBuffer(dic, `${id}.dic`));
  return {
    correct: (w) => h.spell(w),
    suggest: (w) => h.suggest(w).slice(0, MAX_SUGGESTIONS),
    add: (w) => h.addWord(w),
    remove: (w) => h.removeWord(w)
  };
}

/**
 * Load (once) the checker for a proofing id. Returns null for 'none' (do not check).
 * @param {string} id proofing id ('en-US', 'fr', …)
 * @param {{ personal?: string[], onPersonalChange?: (words: string[]) => void, skipAllCaps?: boolean, skipWordsWithNumbers?: boolean }} [opts]
 * @returns {Promise<SpellChecker|null>}
 */
export function checkerFor(id, opts = {}) {
  if (!id || id === 'none') return Promise.resolve(null);
  if (!checkers.has(id)) {
    const p = (async () => {
      const entry = (await dictionaryManifest())[id];
      if (!entry) throw new Error(`No dictionary for ${id}`);
      const engine = entry.engine === 'words'
        ? wordListEngine(new TextDecoder().decode(await gunzip(await bytes(base + entry.files[0]))))
        : await hunspellEngine(entry);
      const lang = proofing(id);
      const c = new SpellChecker(engine, { ...opts, lang: id, segment: lang && SEGMENTED.has(lang.code) ? lang.code : null });
      loaded.set(id, c);
      return c;
    })();
    p.catch(() => checkers.delete(id));
    checkers.set(id, p);
  }
  return checkers.get(id);
}

/** The checker for an id if it is already loaded, else null (never loads). */
export function peekChecker(id) { return loaded.get(id) || null; }

/** Apply proofing options to every loaded checker. */
export function setCheckerOptions(opts) {
  for (const c of loaded.values()) { Object.assign(c.options, opts); c._invalidate(); }
}
