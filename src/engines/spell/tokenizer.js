// Word tokenizer for spell checking.

const TLDS = 'com|org|net|edu|gov|mil|int|io|co|uk|us|ca|au|de|fr|es|it|nl|be|ch|at|se|no|dk|fi|ie|nz|jp|cn|in|br|' +
  'ru|info|biz|app|dev|me|tv|ai|ly|gl|eu|online|site|store|shop|blog|tech|xyz';

// One pass over the text; the first alternative that matches at a position wins.
const TOKEN_RE = new RegExp([
  '(?<url>(?:https?|ftp)://[^\\s<>"«»]+|www\\.[^\\s<>"«»]+)',
  '(?<email>[\\p{L}\\p{N}._%+-]+@[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)*\\.\\p{L}{2,})',
  `(?<domain>(?:[\\p{L}\\p{N}-]+\\.)+(?:${TLDS})(?![\\p{L}\\p{N}])(?:/[^\\s<>"«»]*)?)`,
  '(?<field>«[^»\\n]{0,80}»)',
  "(?<word>[\\p{L}\\p{M}\\p{N}]+(?:['’\\-‐][\\p{L}\\p{M}\\p{N}]+)*)"
].join('|'), 'giu');

const ORDINAL_RE = /^\d+(?:st|nd|rd|th|ST|ND|RD|TH)$/;
const HAS_DIGIT_RE = /\p{N}/u;
const HAS_LETTER_RE = /\p{L}/u;
const HYPHEN_RE = /[-‐]/;

function isAllCaps(word) {
  const letters = word.replace(/[^\p{L}]/gu, '');
  return letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

/**
 * Split text into spell-checkable tokens.
 * Returns every word-like token: { word, start, end, kind, skip, parts? } where kind is
 * 'word' | 'url' | 'email' | 'domain' | 'field', `skip` is a reason string (or '' when the token
 * should be checked), and hyphenated words carry `parts` ([{ word, start, end, skip }]).
 * Apostrophes (' and ’) inside words are kept (don't, don’t); leading/trailing quotes are not part
 * of the word. Numbers and ordinals (1st, 22nd) are skipped; words mixing letters and digits are
 * skipped when `skipWordsWithNumbers` (default true); ALLCAPS words when `skipAllCaps` (default true).
 * @param {string} text
 * @param {{ skipAllCaps?: boolean, skipWordsWithNumbers?: boolean }} [opts]
 * @returns {Array<object>}
 */
export function tokenizeWords(text, opts = {}) {
  const skipAllCaps = opts.skipAllCaps !== false;
  const skipNums = opts.skipWordsWithNumbers !== false;
  const classify = (w) => {
    if (HAS_DIGIT_RE.test(w)) {
      if (!HAS_LETTER_RE.test(w)) return 'number';
      if (ORDINAL_RE.test(w)) return 'ordinal';
      if (skipNums) return 'number';
    }
    if (skipAllCaps && isAllCaps(w)) return 'allcaps';
    return '';
  };
  const out = [];
  const src = String(text ?? '');
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(src))) {
    const g = m.groups;
    const start = m.index;
    const end = start + m[0].length;
    if (g.url !== undefined || g.email !== undefined || g.domain !== undefined || g.field !== undefined) {
      const kind = g.url !== undefined ? 'url' : g.email !== undefined ? 'email' : g.domain !== undefined ? 'domain' : 'field';
      out.push({ word: m[0], start, end, kind, skip: kind });
      continue;
    }
    const word = m[0];
    const tok = { word, start, end, kind: 'word', skip: classify(word) };
    if (!tok.skip && HYPHEN_RE.test(word)) {
      tok.parts = [];
      const re = /[^-‐]+/g;
      let p;
      while ((p = re.exec(word))) {
        tok.parts.push({ word: p[0], start: start + p.index, end: start + p.index + p[0].length, skip: classify(p[0]) });
      }
    }
    out.push(tok);
  }
  return out;
}
