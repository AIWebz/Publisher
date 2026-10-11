// Lossless HTML <-> plain-text mapping for story / table-cell rich text.
//
// The tokenizer keeps every tag and every text run as its exact source string, so
// serializeTokens(tokenizeHtml(html)) === html for any input. Text runs additionally carry a
// per-character decoding (entities resolved) together with the raw source of each character,
// which lets find/replace and spelling edit the text of a story while leaving untouched
// characters, entities, tags and attributes byte-for-byte identical.

const BLOCK_OPEN = new Set(['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'blockquote', 'pre', 'td', 'th', 'dd', 'dt',
  'caption', 'figcaption', 'address']);
const BLOCK_CONTAINER = new Set(['ul', 'ol', 'dl', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'section', 'article', 'header',
  'footer', 'nav', 'aside', 'figure', 'main', 'hr', 'body', 'html']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track',
  'wbr']);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript']);
/** Inline formatting elements that may be dropped when an edit leaves them empty. */
const INLINE_FORMAT = new Set(['b', 'i', 'u', 's', 'strong', 'em', 'span', 'sub', 'sup', 'a', 'font', 'mark', 'small', 'big',
  'code', 'strike', 'del', 'ins']);

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '­', copy: '©', reg: '®', trade: '™',
  laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„', ndash: '–',
  mdash: '—', hellip: '…', bull: '•', middot: '·', deg: '°', times: '×', divide: '÷', plusmn: '±', para: '¶',
  sect: '§', euro: '€', pound: '£', yen: '¥', cent: '¢', ensp: ' ', emsp: ' ', thinsp: ' ',
  zwnj: '‌', zwj: '‍', frac12: '½', frac14: '¼', frac34: '¾', iexcl: '¡', iquest: '¿', dagger: '†',
  Dagger: '‡', prime: '′', Prime: '″', larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', check: '✓'
};
const ENTITY_RE = /&(?:#(\d{1,7});?|#[xX]([0-9a-fA-F]{1,6});?|([A-Za-z][A-Za-z0-9]{1,31});)/y;

function fromCodePoint(cp) {
  if (!(cp > 0) || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '�';
  return String.fromCodePoint(cp);
}

/**
 * Decode a raw HTML text run into characters, remembering the raw source of each decoded UTF-16
 * code unit (an entity's raw text is attached to its first code unit; later units get '').
 * @param {string} raw
 * @returns {{ chars: string[], raws: string[] }}
 */
export function decodeTextRun(raw) {
  const chars = [];
  const raws = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '&') {
      ENTITY_RE.lastIndex = i;
      const m = ENTITY_RE.exec(raw);
      let decoded = null;
      if (m) {
        if (m[1]) decoded = fromCodePoint(parseInt(m[1], 10));
        else if (m[2]) decoded = fromCodePoint(parseInt(m[2], 16));
        else if (Object.prototype.hasOwnProperty.call(NAMED, m[3])) decoded = NAMED[m[3]];
      }
      if (decoded !== null) {
        for (let k = 0; k < decoded.length; k++) { chars.push(decoded[k]); raws.push(k === 0 ? m[0] : ''); }
        i += m[0].length;
        continue;
      }
    }
    const cp = raw.codePointAt(i);
    const len = cp > 0xffff ? 2 : 1;
    for (let k = 0; k < len; k++) { chars.push(raw[i + k]); raws.push(k === 0 ? raw.slice(i, i + len) : ''); }
    i += len;
  }
  return { chars, raws };
}

/**
 * Escape plain text for insertion into HTML text content (& < > and no-break space, the same
 * set a browser escapes when serialising innerHTML).
 * @param {string} s
 * @returns {string}
 */
export function escapeHtmlText(s) {
  return String(s ?? '').replace(/[&<> ]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&nbsp;'));
}

function decodeAttr(v) {
  const { chars } = decodeTextRun(v);
  return chars.join('');
}

// Parse a tag starting at src[i] === '<'. Returns { end, name, close, selfClosing, attrs } or null.
function parseTag(src, i) {
  const n = src.length;
  let j = i + 1;
  let close = false;
  if (src[j] === '/') { close = true; j++; }
  if (!/[A-Za-z]/.test(src[j] || '')) return null;
  const nameStart = j;
  while (j < n && !/[\s/>]/.test(src[j])) j++;
  const name = src.slice(nameStart, j).toLowerCase();
  const attrs = {};
  let selfClosing = false;
  while (j < n) {
    while (j < n && /\s/.test(src[j])) j++;
    if (j >= n) break;
    if (src[j] === '>') { j++; return { end: j, name, close, selfClosing, attrs }; }
    if (src[j] === '/') {
      if (src[j + 1] === '>') { selfClosing = true; j += 2; return { end: j, name, close, selfClosing, attrs }; }
      j++;
      continue;
    }
    const an = j;
    while (j < n && !/[\s=/>]/.test(src[j])) j++;
    if (j === an) j++;
    const attrName = src.slice(an, j).toLowerCase();
    while (j < n && /\s/.test(src[j])) j++;
    let value = '';
    if (src[j] === '=') {
      j++;
      while (j < n && /\s/.test(src[j])) j++;
      const q = src[j];
      if (q === '"' || q === "'") {
        const e = src.indexOf(q, j + 1);
        const stop = e < 0 ? n : e;
        value = src.slice(j + 1, stop);
        j = e < 0 ? n : e + 1;
      } else {
        const vs = j;
        while (j < n && !/[\s>]/.test(src[j])) j++;
        value = src.slice(vs, j);
      }
    }
    if (attrName && !(attrName in attrs)) attrs[attrName] = decodeAttr(value);
  }
  return { end: n, name, close, selfClosing, attrs };
}

/**
 * Tokenize HTML losslessly. Tokens:
 *   { type: 'tag', raw, name, close: bool, selfClosing: bool, attrs: { name: decodedValue } }
 *   { type: 'text', raw, chars: string[], raws: string[] }     (chars decoded, raws per char)
 *   { type: 'other', raw }   comments, doctype, processing instructions, raw-text element bodies
 * Concatenating every token's `raw` reproduces the input exactly.
 * @param {string} html
 * @returns {Array<object>}
 */
export function tokenizeHtml(html) {
  const src = String(html ?? '');
  const n = src.length;
  const tokens = [];
  let textStart = 0;
  let i = 0;
  const flushText = (to) => {
    if (to > textStart) {
      const raw = src.slice(textStart, to);
      const { chars, raws } = decodeTextRun(raw);
      tokens.push({ type: 'text', raw, chars, raws });
    }
  };
  while (i < n) {
    if (src[i] !== '<') { i++; continue; }
    if (src.startsWith('<!--', i)) {
      flushText(i);
      const e = src.indexOf('-->', i + 4);
      const end = e < 0 ? n : e + 3;
      tokens.push({ type: 'other', raw: src.slice(i, end) });
      i = textStart = end;
      continue;
    }
    if (src[i + 1] === '!' || src[i + 1] === '?') {
      flushText(i);
      const e = src.indexOf('>', i + 2);
      const end = e < 0 ? n : e + 1;
      tokens.push({ type: 'other', raw: src.slice(i, end) });
      i = textStart = end;
      continue;
    }
    const tag = parseTag(src, i);
    if (!tag) { i++; continue; }
    flushText(i);
    tokens.push({ type: 'tag', raw: src.slice(i, tag.end), name: tag.name, close: tag.close, selfClosing: tag.selfClosing,
      attrs: tag.attrs });
    i = textStart = tag.end;
    if (!tag.close && !tag.selfClosing && RAW_TEXT.has(tag.name)) {
      const re = new RegExp(`</${tag.name}[\\s/>]`, 'ig');
      re.lastIndex = i;
      const m = re.exec(src);
      const end = m ? m.index : n;
      if (end > i) tokens.push({ type: 'other', raw: src.slice(i, end) });
      i = textStart = end;
    }
  }
  flushText(n);
  return tokens;
}

/**
 * Serialize tokens back to HTML (exact inverse of tokenizeHtml for unmodified tokens).
 * Tokens flagged `removed` are skipped; text tokens are emitted from their per-char raws.
 * @param {Array<object>} tokens
 * @returns {string}
 */
export function serializeTokens(tokens) {
  let out = '';
  for (const t of tokens) {
    if (t.removed) continue;
    out += t.type === 'text' ? (t.dirty ? t.raws.join('') : t.raw) : t.raw;
  }
  return out;
}

/**
 * True when a tag token opens a merge-field span (`<span class="field" data-field=…>`).
 * @param {object} tok
 * @returns {boolean}
 */
export function isFieldTag(tok) {
  if (!tok || tok.type !== 'tag' || tok.close || tok.name !== 'span') return false;
  if ('data-field' in tok.attrs) return true;
  return /(^|\s)field(\s|$)/.test(tok.attrs.class || '');
}

// Index pairs of matching open/close tags: returns Map openIndex -> closeIndex.
function pairTags(tokens) {
  const pairs = new Map();
  const stack = [];
  tokens.forEach((t, idx) => {
    if (t.type !== 'tag' || t.removed || VOID.has(t.name) || t.selfClosing) return;
    if (!t.close) { stack.push(idx); return; }
    for (let k = stack.length - 1; k >= 0; k--) {
      if (tokens[stack[k]].name === t.name) {
        pairs.set(stack[k], idx);
        stack.length = k;
        return;
      }
    }
  });
  return pairs;
}

function rangeIsEmpty(tokens, from, to) {
  for (let k = from + 1; k < to; k++) {
    const t = tokens[k];
    if (t.removed) continue;
    if (t.type === 'text' && t.chars.length) return false;
    if (t.type === 'tag' && (VOID.has(t.name) || t.selfClosing)) return false;
  }
  return true;
}

/**
 * Parse story/cell HTML into a plain-text view with an offset map back to the HTML text nodes.
 *
 * Paragraphs (`p`, `li`, headings, …) are joined with '\n'; `<br>` contributes '\n'; merge-field
 * spans contribute their visible text («Name») but are marked as atoms; other void elements
 * contribute U+FFFC. Returned object:
 *   text    plain text
 *   map     per plain-text char: { t: tokenIndex, o: charIndexInToken } for editable text, or
 *           { t, atom: 'field'|'break'|'object'|'block' } for non-editable characters
 *   blocks  [{ start, end }] plain-text range of every paragraph (separators excluded)
 *   atoms   [{ start, end, kind }] ranges of non-editable characters (fields, breaks, objects)
 *   tokens  the lossless token list (see tokenizeHtml)
 * @param {string} html
 * @returns {{ text: string, map: Array<object>, blocks: Array<{start:number,end:number}>,
 *   atoms: Array<{start:number,end:number,kind:string}>, tokens: Array<object>, html: string }}
 */
export function getPlainText(html) {
  const source = String(html ?? '');
  const tokens = tokenizeHtml(source);
  const text = [];
  const map = [];
  const blocks = [];
  const atoms = [];
  let open = null; // current block { start }
  const openBlock = () => {
    if (blocks.length) { map.push({ t: -1, atom: 'block' }); text.push('\n'); }
    open = { start: text.length };
  };
  const closeBlock = () => {
    if (open) { blocks.push({ start: open.start, end: text.length }); open = null; }
  };
  const ensureBlock = () => { if (!open) openBlock(); };
  let fieldDepth = 0; // >0 while inside a field span (counts nested spans)
  let fieldStart = -1;
  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];
    if (t.type === 'other') continue;
    if (t.type === 'text') {
      if (!t.chars.length) continue;
      ensureBlock();
      for (let o = 0; o < t.chars.length; o++) {
        text.push(t.chars[o]);
        map.push(fieldDepth ? { t: idx, o, atom: 'field' } : { t: idx, o });
      }
      continue;
    }
    // tag
    if (fieldDepth) {
      if (t.name === 'span') {
        if (t.close) {
          fieldDepth--;
          if (!fieldDepth) atoms.push({ start: fieldStart, end: text.length, kind: 'field' });
        } else if (!t.selfClosing) fieldDepth++;
      } else if (t.name === 'br') {
        text.push('\n');
        map.push({ t: idx, atom: 'field' });
      }
      continue;
    }
    if (isFieldTag(t) && !t.selfClosing) {
      ensureBlock();
      fieldDepth = 1;
      fieldStart = text.length;
      continue;
    }
    if (t.name === 'br') {
      ensureBlock();
      atoms.push({ start: text.length, end: text.length + 1, kind: 'break' });
      text.push('\n');
      map.push({ t: idx, atom: 'break' });
      continue;
    }
    if (BLOCK_OPEN.has(t.name)) {
      closeBlock();
      if (!t.close) openBlock();
      continue;
    }
    if (BLOCK_CONTAINER.has(t.name)) { closeBlock(); continue; }
    if (VOID.has(t.name) || (t.selfClosing && !INLINE_FORMAT.has(t.name))) {
      ensureBlock();
      atoms.push({ start: text.length, end: text.length + 1, kind: 'object' });
      text.push('￼');
      map.push({ t: idx, atom: 'object' });
    }
  }
  if (fieldDepth) atoms.push({ start: fieldStart, end: text.length, kind: 'field' });
  closeBlock();
  // Remember which inline elements were already empty, so edits only prune elements they emptied.
  const pairs = pairTags(tokens);
  const preEmpty = new Set();
  for (const [a, b] of pairs) if (rangeIsEmpty(tokens, a, b)) preEmpty.add(a);
  return { text: text.join(''), map, blocks, atoms, tokens, html: source, _preEmpty: preEmpty };
}

/**
 * Does [start, end) touch a non-editable character (field, line break, object, paragraph break)?
 * @param {ReturnType<typeof getPlainText>} plain
 * @param {number} start
 * @param {number} end
 * @returns {boolean}
 */
export function rangeHasAtom(plain, start, end) {
  for (let k = start; k < end; k++) {
    const m = plain.map[k];
    if (!m || m.atom) return true;
  }
  return false;
}

/**
 * Replace plain-text range [start, end) of a parsed story with `replacement`, preserving
 * formatting: the replacement is inserted into the text node that holds the first replaced
 * character (so it takes that character's formatting); the remaining replaced characters are
 * removed from their nodes; inline elements emptied by the edit are pruned. Tags, attributes,
 * entities of untouched characters and field spans are left exactly as they were.
 *
 * Mutates `plain.tokens`; call serializeTokens(plain.tokens) (or plainToHtml) for the result.
 * Several replacements may be applied to one parse as long as they are applied from the end of
 * the text towards the start (offsets of earlier text stay valid).
 * Returns false (and changes nothing) if the range is empty, out of bounds or touches an atom.
 * @param {ReturnType<typeof getPlainText>} plain
 * @param {number} start
 * @param {number} end
 * @param {string} replacement
 * @returns {boolean}
 */
export function replacePlainRange(plain, start, end, replacement) {
  if (!(start >= 0) || !(end > start) || end > plain.text.length) return false;
  if (rangeHasAtom(plain, start, end)) return false;
  const tokens = plain.tokens;
  const first = plain.map[start];
  // Group removals per token: token index -> [minOffset, maxOffset]
  const spans = new Map();
  for (let k = start; k < end; k++) {
    const { t, o } = plain.map[k];
    const s = spans.get(t);
    if (!s) spans.set(t, [o, o]);
    else { s[0] = Math.min(s[0], o); s[1] = Math.max(s[1], o); }
  }
  for (const [t, [a, b]] of spans) {
    const tok = tokens[t];
    // The raw of a surrogate pair / multi-unit entity lives on its first unit; keep it if the
    // range ends in the middle of one (the unit is preserved).
    tok.chars.splice(a, b - a + 1);
    tok.raws.splice(a, b - a + 1);
    tok.dirty = true;
  }
  const rep = String(replacement ?? '');
  if (rep) {
    const tok = tokens[first.t];
    const units = rep.split('');
    const raws = [];
    for (let k = 0; k < units.length; k++) {
      const cc = units[k].charCodeAt(0);
      if (cc >= 0xd800 && cc <= 0xdbff && k + 1 < units.length) { raws.push(units[k] + units[k + 1], ''); k++; continue; }
      raws.push(escapeHtmlText(units[k]));
    }
    tok.chars.splice(first.o, 0, ...units);
    tok.raws.splice(first.o, 0, ...raws);
    tok.dirty = true;
  }
  pruneEmptyInline(plain);
  return true;
}

function pruneEmptyInline(plain) {
  const tokens = plain.tokens;
  let changed = true;
  while (changed) {
    changed = false;
    const pairs = pairTags(tokens);
    for (const [a, b] of pairs) {
      const t = tokens[a];
      if (plain._preEmpty.has(a) || !INLINE_FORMAT.has(t.name) || isFieldTag(t)) continue;
      if (rangeIsEmpty(tokens, a, b)) {
        tokens[a].removed = true;
        tokens[b].removed = true;
        changed = true;
      }
    }
  }
}

/**
 * Serialize a (possibly edited) plain-text parse back to HTML.
 * @param {ReturnType<typeof getPlainText>} plain
 * @returns {string}
 */
export function plainToHtml(plain) {
  return serializeTokens(plain.tokens);
}

/**
 * Convenience: replace plain-text range [start, end) in `html` (see replacePlainRange).
 * @param {string} html
 * @param {number} start
 * @param {number} end
 * @param {string} replacement
 * @returns {string|null} new html, or null when the range cannot be replaced
 */
export function replaceTextInHtml(html, start, end, replacement) {
  const plain = getPlainText(html);
  if (!replacePlainRange(plain, start, end, replacement)) return null;
  return plainToHtml(plain);
}
