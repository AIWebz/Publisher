// Find / replace across every story and table cell of a Folio document. Matching runs on the
// plain text of each paragraph (so matches may cross inline formatting but never paragraphs);
// replacement edits the parsed HTML and preserves formatting (see html-text.js).

import { getPlainText, replacePlainRange, rangeHasAtom, plainToHtml } from './html-text.js';
import { collectTextTargets, getTargetHtml, setTargetHtml, targetKey } from './targets.js';

const CONTEXT_CHARS = 32;
const WORD_CHAR = '[\\p{L}\\p{M}\\p{N}_]';

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
}

/**
 * Compile a find query to a global RegExp. Throws SyntaxError for an invalid regular expression.
 * @param {string} query
 * @param {{ matchCase?: boolean, wholeWord?: boolean, useRegex?: boolean }} [opts]
 * @returns {RegExp|null} null for an empty query
 */
export function compileQuery(query, opts = {}) {
  const q = String(query ?? '');
  if (!q) return null;
  let src = opts.useRegex ? q : escapeRegExp(q);
  const flags = 'g' + (opts.matchCase ? '' : 'i');
  const wrap = (s) => (opts.wholeWord ? `(?<!${WORD_CHAR})(?:${s})(?!${WORD_CHAR})` : s);
  try {
    return new RegExp(wrap(src), flags + 'u');
  } catch (err) {
    if (!opts.useRegex) throw err;
    // Some valid non-Unicode patterns (e.g. "\-" outside a class) are errors in 'u' mode.
    if (!opts.wholeWord) return new RegExp(src, flags);
    return new RegExp(`(?<![A-Za-z0-9_\\u00C0-\\uFFFF])(?:${src})(?![A-Za-z0-9_\\u00C0-\\uFFFF])`, flags);
  }
}

function contextOf(text, block, start, end) {
  let a = Math.max(block.start, start - CONTEXT_CHARS);
  let b = Math.min(block.end, end + CONTEXT_CHARS);
  if (a > block.start) { const sp = text.indexOf(' ', a); if (sp >= 0 && sp < start) a = sp + 1; }
  if (b < block.end) { const sp = text.lastIndexOf(' ', b); if (sp > end) b = sp; }
  const clean = (s) => s.replace(/[\n￼]/g, ' ');
  return {
    before: (a > block.start ? '…' : '') + clean(text.slice(a, start)),
    match: clean(text.slice(start, end)),
    after: clean(text.slice(end, b)) + (b < block.end ? '…' : '')
  };
}

/**
 * Find every match of a compiled query in a parsed text (paragraph by paragraph). Matches that
 * are empty or touch a merge field / line break / object are skipped.
 * @param {ReturnType<typeof getPlainText>} plain
 * @param {RegExp} re
 * @returns {Array<{ start, end, text, captures, groups, context }>}
 */
export function findInPlain(plain, re) {
  const out = [];
  for (const block of plain.blocks) {
    const seg = plain.text.slice(block.start, block.end);
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(seg))) {
      if (m[0].length === 0) { re.lastIndex = m.index + 1; if (re.lastIndex > seg.length) break; continue; }
      const start = block.start + m.index;
      const end = start + m[0].length;
      if (rangeHasAtom(plain, start, end)) continue;
      out.push({ start, end, text: m[0], captures: m.slice(1), groups: m.groups ? { ...m.groups } : null,
        context: contextOf(plain.text, block, start, end) });
    }
  }
  return out;
}

/**
 * Find all matches in one HTML string.
 * @param {string} html
 * @param {string} query
 * @param {{ matchCase?: boolean, wholeWord?: boolean, useRegex?: boolean }} [opts]
 * @returns {Array<object>} matches with plain-text offsets (no `target`)
 */
export function findInHtml(html, query, opts = {}) {
  const re = compileQuery(query, opts);
  if (!re) return [];
  return findInPlain(getPlainText(html), re).map((m) => (opts.useRegex ? { ...m, regex: true } : m));
}

/**
 * Find all matches across the document's stories and table cells, in reading order.
 * Each match: { target, start, end, text, context: { before, match, after }, captures, groups, regex? }
 * Offsets are into getPlainText(targetHtml).text. Throws SyntaxError for an invalid regex.
 * @param {object} doc
 * @param {string} query
 * @param {{ matchCase?: boolean, wholeWord?: boolean, useRegex?: boolean, includeMasters?: boolean,
 *   targets?: Array<object> }} [opts]
 * @returns {Array<object>}
 */
export function findAll(doc, query, opts = {}) {
  const re = compileQuery(query, opts);
  if (!re) return [];
  const targets = opts.targets || collectTextTargets(doc, opts);
  const out = [];
  for (const target of targets) {
    const html = getTargetHtml(doc, target);
    if (!html) continue;
    for (const m of findInPlain(getPlainText(html), re)) {
      const match = { target, ...m };
      if (opts.useRegex) match.regex = true;
      out.push(match);
    }
  }
  return out;
}

/**
 * Expand a regex replacement template ($$, $&, $1…$99, $<name>) for one match.
 * @param {string} template
 * @param {{ text: string, captures?: string[], groups?: object|null }} match
 * @returns {string}
 */
export function expandReplacement(template, match) {
  const caps = match.captures || [];
  return String(template ?? '').replace(/\$(\$|&|<([^>]*)>|(\d{1,2}))/g, (all, tok, name, num) => {
    if (tok === '$') return '$';
    if (tok === '&') return match.text;
    if (name !== undefined) return match.groups && name in match.groups ? (match.groups[name] ?? '') : all;
    let n = parseInt(num, 10);
    if (n >= 1 && n <= caps.length) return caps[n - 1] ?? '';
    if (num.length === 2) { // "$12" with one group means $1 followed by "2"
      n = parseInt(num[0], 10);
      if (n >= 1 && n <= caps.length) return (caps[n - 1] ?? '') + num[1];
    }
    return all;
  });
}

/**
 * Replace a plain-text range of a target, verifying that it still reads `expected`.
 * @param {object} doc
 * @param {object} target
 * @param {number} start
 * @param {number} end
 * @param {string} replacement
 * @param {string} [expected] text the range must currently contain
 * @returns {boolean} true if the document changed
 */
export function replaceTextRange(doc, target, start, end, replacement, expected) {
  const html = getTargetHtml(doc, target);
  if (html == null) return false;
  const plain = getPlainText(html);
  if (expected != null && plain.text.slice(start, end) !== expected) return false;
  if (!replacePlainRange(plain, start, end, replacement)) return false;
  return setTargetHtml(doc, target, plainToHtml(plain));
}

/**
 * Replace one match (from findAll) with `replacement`, keeping the formatting of the match's first
 * character. Regex matches expand $1 / $& / $<name> in the replacement. Returns false when the
 * text changed since the match was found (the match no longer applies).
 * @param {object} doc
 * @param {object} match
 * @param {string} replacement
 * @returns {boolean}
 */
export function replaceMatch(doc, match, replacement) {
  const rep = match.regex ? expandReplacement(replacement, match) : String(replacement ?? '');
  return replaceTextRange(doc, match.target, match.start, match.end, rep, match.text);
}

/**
 * Replace every match of `query` in the document (stories and table cells), preserving
 * formatting; matches inside merge fields are skipped. Returns the number of replacements.
 * @param {object} doc
 * @param {string} query
 * @param {string} replacement
 * @param {{ matchCase?: boolean, wholeWord?: boolean, useRegex?: boolean, includeMasters?: boolean,
 *   targets?: Array<object> }} [opts]
 * @returns {number}
 */
export function replaceAll(doc, query, replacement, opts = {}) {
  const re = compileQuery(query, opts);
  if (!re) return 0;
  const targets = opts.targets || collectTextTargets(doc, opts);
  let count = 0;
  const done = new Set();
  for (const target of targets) {
    const key = targetKey(target);
    if (done.has(key)) continue;
    done.add(key);
    const html = getTargetHtml(doc, target);
    if (!html) continue;
    const plain = getPlainText(html);
    const matches = findInPlain(plain, re);
    if (!matches.length) continue;
    let n = 0;
    for (let k = matches.length - 1; k >= 0; k--) {
      const m = matches[k];
      const rep = opts.useRegex ? expandReplacement(replacement, m) : String(replacement ?? '');
      if (replacePlainRange(plain, m.start, m.end, rep)) n++;
    }
    if (n && setTargetHtml(doc, target, plainToHtml(plain))) count += n;
  }
  return count;
}
