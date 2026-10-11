// Minimal, DOM-free HTML tokenizer, tree builder and serializer used by the text engine.
// It runs in node (unit tests, workers) and in the browser, and is deliberately small: it is
// meant for story HTML (rich text), clipboard HTML and layout fragments, not whole documents.

export const VOID_TAGS = new Set(['area', 'base', 'basefont', 'bgsound', 'br', 'col', 'embed', 'frame', 'hr', 'image', 'img',
  'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

// Elements whose content is raw text (not parsed as markup).
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext']);

// Named character references understood by decodeEntities(). Unknown names are kept literally.
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  iexcl: '¡', cent: '¢', pound: '£', curren: '¤', yen: '¥', brvbar: '¦', sect: '§', uml: '¨', copy: '©', ordf: 'ª',
  laquo: '«', not: '¬', shy: '\u00ad', reg: '®', macr: '¯', deg: '°', plusmn: '±', sup2: '²', sup3: '³', acute: '´',
  micro: 'µ', para: '¶', middot: '·', cedil: '¸', sup1: '¹', ordm: 'º', raquo: '»', frac14: '¼', frac12: '½',
  frac34: '¾', iquest: '¿', Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ',
  Ccedil: 'Ç', Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë', Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î', Iuml: 'Ï',
  ETH: 'Ð', Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', times: '×', Oslash: 'Ø',
  Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý', THORN: 'Þ', szlig: 'ß', agrave: 'à', aacute: 'á',
  acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ', ccedil: 'ç', egrave: 'è', eacute: 'é', ecirc: 'ê',
  euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï', eth: 'ð', ntilde: 'ñ', ograve: 'ò', oacute: 'ó',
  ocirc: 'ô', otilde: 'õ', ouml: 'ö', divide: '÷', oslash: 'ø', ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü',
  yacute: 'ý', thorn: 'þ', yuml: 'ÿ', OElig: 'Œ', oelig: 'œ', Scaron: 'Š', scaron: 'š', Yuml: 'Ÿ', fnof: 'ƒ',
  circ: 'ˆ', tilde: '˜', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', zwnj: '\u200c', zwj: '\u200d',
  lrm: '\u200e', rlm: '\u200f', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”',
  bdquo: '„', dagger: '†', Dagger: '‡', bull: '•', hellip: '…', permil: '‰', prime: '′', Prime: '″', lsaquo: '‹',
  rsaquo: '›', oline: '‾', frasl: '⁄', euro: '€', trade: '™', larr: '←', uarr: '↑', rarr: '→', darr: '↓', harr: '↔',
  crarr: '↵', lArr: '⇐', uArr: '⇑', rArr: '⇒', dArr: '⇓', hArr: '⇔', forall: '∀', part: '∂', exist: '∃', empty: '∅',
  nabla: '∇', isin: '∈', notin: '∉', ni: '∋', prod: '∏', sum: '∑', minus: '−', lowast: '∗', radic: '√', prop: '∝',
  infin: '∞', ang: '∠', and: '∧', or: '∨', cap: '∩', cup: '∪', int: '∫', there4: '∴', sim: '∼', cong: '≅',
  asymp: '≈', ne: '≠', equiv: '≡', le: '≤', ge: '≥', sub: '⊂', sup: '⊃', nsub: '⊄', sube: '⊆', supe: '⊇',
  oplus: '⊕', otimes: '⊗', perp: '⊥', sdot: '⋅', lceil: '⌈', rceil: '⌉', lfloor: '⌊', rfloor: '⌋', lang: '⟨',
  rang: '⟩', loz: '◊', spades: '♠', clubs: '♣', hearts: '♥', diams: '♦', check: '✓', cross: '✗', star: '☆',
  starf: '★', hyphen: '‐', dash: '‐', numsp: '\u2007', puncsp: '\u2008', hairsp: '\u200a',
  Alpha: 'Α', Beta: 'Β', Gamma: 'Γ', Delta: 'Δ', Epsilon: 'Ε', Zeta: 'Ζ', Eta: 'Η', Theta: 'Θ', Iota: 'Ι',
  Kappa: 'Κ', Lambda: 'Λ', Mu: 'Μ', Nu: 'Ν', Xi: 'Ξ', Omicron: 'Ο', Pi: 'Π', Rho: 'Ρ', Sigma: 'Σ', Tau: 'Τ',
  Upsilon: 'Υ', Phi: 'Φ', Chi: 'Χ', Psi: 'Ψ', Omega: 'Ω', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ',
  epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ',
  omicron: 'ο', pi: 'π', rho: 'ρ', sigmaf: 'ς', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ',
  omega: 'ω', thetasym: 'ϑ', upsih: 'ϒ', piv: 'ϖ', larrb: '⇤', rarrb: '⇥', numero: '№',
  half: '½', frac13: '⅓', frac23: '⅔', frac15: '⅕', frac18: '⅛', sharp: '♯', flat: '♭', natural: '♮',
  male: '♂', female: '♀', phone: '☎', sung: '♪', commat: '@', num: '#', dollar: '$', percnt: '%', ast: '*',
  plus: '+', comma: ',', period: '.', sol: '/', colon: ':', semi: ';', equals: '=', quest: '?', lsqb: '[',
  bsol: '\\', rsqb: ']', lowbar: '_', grave: '`', lcub: '{', verbar: '|', rcub: '}', excl: '!', lpar: '(', rpar: ')',
  Tab: '\t', NewLine: '\n'
};

// Windows-1252 mapping for numeric references in the C1 range (what browsers do).
const C1 = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6,
  0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c,
  0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178
};

const ENTITY_RE = /&(?:#(\d{1,8});?|#[xX]([0-9a-fA-F]{1,7});?|([a-zA-Z][a-zA-Z0-9]{0,31});)/g;

function codePointToString(cp) {
  if (C1[cp]) cp = C1[cp];
  if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '�';
  return String.fromCodePoint(cp);
}

/**
 * Decode HTML character references in text. Numeric references are always decoded; named
 * references are decoded when known (a large common subset), otherwise kept literally.
 * @param {string} s
 * @returns {string}
 */
export function decodeEntities(s) {
  s = String(s ?? '');
  if (s.indexOf('&') < 0) return s;
  return s.replace(ENTITY_RE, (all, dec, hex, name) => {
    if (dec) return codePointToString(parseInt(dec, 10));
    if (hex) return codePointToString(parseInt(hex, 16));
    return Object.prototype.hasOwnProperty.call(NAMED, name) ? NAMED[name] : all;
  });
}

/**
 * Escape text for use as HTML text content (the same characters a browser escapes when
 * serialising innerHTML: & < > and no-break space).
 * @param {string} s
 * @returns {string}
 */
export function escapeText(s) {
  return String(s ?? '').replace(/[&<>\u00a0]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&nbsp;'));
}

/**
 * Escape a string for use inside a double-quoted attribute value.
 * @param {string} s
 * @returns {string}
 */
export function escapeAttr(s) {
  return String(s ?? '').replace(/[&"<>\u00a0]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', '\u00a0': '&nbsp;' }[c]));
}

const TAG_NAME_RE = /[a-zA-Z][^\s/>\0]*/y;
const END_TAG_RE = /<\/([a-zA-Z][^\s/>\0]*)[^>]*>?/y;

/**
 * Tokenize HTML. Tokens:
 *   { type: 'text', text (decoded), start, end }
 *   { type: 'start', name (lower case), attrs: [{ name, value (decoded) }], selfClosing, start, end }
 *   { type: 'end', name, start, end }
 * Raw-text elements (script, style, textarea, iframe, …) produce start, one text token with
 * `raw: true` (undecoded), and end. Comments, doctypes, CDATA and processing instructions are
 * skipped. `start`/`end` are source offsets (end exclusive).
 * @param {string} html
 * @returns {Array<object>}
 */
export function tokenize(html) {
  const src = String(html ?? '');
  const n = src.length;
  const tokens = [];
  let i = 0;
  const pushText = (from, to) => {
    if (to <= from) return;
    const prev = tokens[tokens.length - 1];
    const text = decodeEntities(src.slice(from, to));
    if (prev && prev.type === 'text' && !prev.raw && prev.end === from) { prev.text += text; prev.end = to; } else tokens.push({ type: 'text', text, start: from, end: to });
  };
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { pushText(i, n); break; }
    if (lt > i) pushText(i, lt);
    const c = src[lt + 1];
    if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt + 4);
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (c === '!' || c === '?') {
      if (src.startsWith('<![CDATA[', lt)) {
        const e = src.indexOf(']]>', lt);
        i = e < 0 ? n : e + 3;
      } else {
        const e = src.indexOf('>', lt);
        i = e < 0 ? n : e + 1;
      }
      continue;
    }
    if (c === '/') {
      END_TAG_RE.lastIndex = lt;
      const m = END_TAG_RE.exec(src);
      if (m) {
        tokens.push({ type: 'end', name: m[1].toLowerCase(), start: lt, end: lt + m[0].length });
        i = lt + m[0].length;
      } else {
        const e = src.indexOf('>', lt);
        i = e < 0 ? n : e + 1;
      }
      continue;
    }
    if (c && /[a-zA-Z]/.test(c)) {
      TAG_NAME_RE.lastIndex = lt + 1;
      const nm = TAG_NAME_RE.exec(src);
      const name = nm[0].toLowerCase();
      let p = lt + 1 + nm[0].length;
      const attrs = [];
      let selfClosing = false;
      for (;;) {
        while (p < n && /[\s/]/.test(src[p])) {
          if (src[p] === '/' && src[p + 1] === '>') break;
          p++;
        }
        if (p >= n) break;
        if (src[p] === '>') { p++; break; }
        if (src[p] === '/' && src[p + 1] === '>') { selfClosing = true; p += 2; break; }
        let q = p + 1;
        while (q < n && !/[\s/>=]/.test(src[q])) q++;
        const aname = src.slice(p, q).toLowerCase();
        p = q;
        while (p < n && /\s/.test(src[p])) p++;
        let value = '';
        if (src[p] === '=') {
          p++;
          while (p < n && /\s/.test(src[p])) p++;
          const qc = src[p];
          if (qc === '"' || qc === "'") {
            const e = src.indexOf(qc, p + 1);
            const end = e < 0 ? n : e;
            value = decodeEntities(src.slice(p + 1, end));
            p = e < 0 ? n : e + 1;
          } else {
            let e = p;
            while (e < n && !/[\s>]/.test(src[e])) e++;
            value = decodeEntities(src.slice(p, e));
            p = e;
          }
        }
        if (aname && !attrs.some((a) => a.name === aname)) attrs.push({ name: aname, value });
      }
      tokens.push({ type: 'start', name, attrs, selfClosing, start: lt, end: p });
      i = p;
      if (RAW_TEXT.has(name) && !selfClosing) {
        const re = new RegExp(`</${name}(?=[\\s/>]|$)`, 'ig');
        re.lastIndex = p;
        const m = re.exec(src);
        const stop = m ? m.index : n;
        if (stop > p) tokens.push({ type: 'text', text: src.slice(p, stop), raw: true, start: p, end: stop });
        if (m) {
          const gt = src.indexOf('>', stop);
          const e = gt < 0 ? n : gt + 1;
          tokens.push({ type: 'end', name, start: stop, end: e });
          i = e;
        } else {
          i = n;
        }
      }
      continue;
    }
    // A lone '<' is text.
    pushText(lt, lt + 1);
    i = lt + 1;
  }
  return tokens;
}

/** Attribute list -> plain object helper. */
export function attrMap(attrs) {
  const o = {};
  for (const a of attrs || []) o[a.name] = a.value;
  return o;
}

/**
 * Parse HTML into a light tree: nodes are { type: 'text', text } or
 * { type: 'el', tag, attrs: [{name, value}], children }. A simple stack parser: end tags close
 * the nearest open element of the same name; void elements never have children. Good for
 * well-formed HTML (fragments serialised by a browser or by this engine).
 * @param {string} html
 * @returns {Array<object>} top-level nodes
 */
export function parseTree(html) {
  const root = { type: 'el', tag: '#root', attrs: [], children: [] };
  const stack = [root];
  for (const t of tokenize(html)) {
    const top = stack[stack.length - 1];
    if (t.type === 'text') {
      const last = top.children[top.children.length - 1];
      if (last && last.type === 'text') last.text += t.text; else top.children.push({ type: 'text', text: t.text });
    } else if (t.type === 'start') {
      const el = { type: 'el', tag: t.name, attrs: t.attrs.map((a) => ({ name: a.name, value: a.value })), children: [] };
      top.children.push(el);
      if (!VOID_TAGS.has(t.name) && !t.selfClosing) stack.push(el);
    } else if (t.type === 'end') {
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag === t.name) { stack.length = k; break; }
      }
    }
  }
  return root.children;
}

/** Get an attribute value from a tree element (or null). */
export function getAttr(el, name) {
  const a = el.attrs.find((x) => x.name === name);
  return a ? a.value : null;
}

/** Set (or with value null, remove) an attribute on a tree element. */
export function setAttr(el, name, value) {
  const i = el.attrs.findIndex((x) => x.name === name);
  if (value === null || value === undefined) { if (i >= 0) el.attrs.splice(i, 1); return; }
  if (i >= 0) el.attrs[i].value = String(value); else el.attrs.push({ name, value: String(value) });
}

/**
 * Serialise tree nodes back to HTML.
 * @param {Array<object>} nodes
 * @returns {string}
 */
export function serializeTree(nodes) {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text') { out += escapeText(n.text); continue; }
    out += `<${n.tag}`;
    for (const a of n.attrs) out += a.value === '' ? ` ${a.name}=""` : ` ${a.name}="${escapeAttr(a.value)}"`;
    out += '>';
    if (VOID_TAGS.has(n.tag)) continue;
    out += serializeTree(n.children);
    out += `</${n.tag}>`;
  }
  return out;
}
