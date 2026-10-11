// Whitelist sanitizer for rich text (stories and table cells). DOM-free: it uses the small
// tokenizer in html.js, so it runs identically in node and in the browser.
//
// Output contract (ARCHITECTURE.md "Rich text HTML"):
//   blocks:  <p style>, <ul|ol start style><li style>…</li></ul|ol>
//   inline:  <span style>, <b> <strong> <i> <em> <u> <s> <strike> <sub> <sup>, <a href>, <br>
//   fields:  <span class="field" data-field="NAME" contenteditable="false">«NAME»</span>
// Everything else is unwrapped (text kept) or dropped (script/style/iframe/… with content).
// Inline content outside blocks is wrapped in <p>; nested lists are flattened (indented items);
// empty blocks get a <br> so they keep a line. The result is canonical: sanitizeHtml(sanitizeHtml(x))
// === sanitizeHtml(x).

import { tokenize, attrMap, escapeText, escapeAttr, VOID_TAGS } from './html.js';

/** Inline (character) style properties allowed on inline elements. */
export const INLINE_STYLE_PROPS = ['font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'color',
  'background-color', 'letter-spacing', 'text-transform'];
/** Paragraph style properties allowed on <p> and <li>. */
export const BLOCK_STYLE_PROPS = ['text-align', 'line-height', 'margin-top', 'margin-bottom', 'margin-left', 'text-indent'];
/** Properties allowed on <ul>/<ol>. */
export const LIST_STYLE_PROPS = ['list-style-type', 'margin-top', 'margin-bottom', 'margin-left'];
/** Theme colour keys that may be referenced from rich text as var(--folio-KEY). */
export const THEME_COLOR_KEYS = ['paper', 'ink', 'accent', 'accent2', 'muted', 'light'];
/** Indentation applied per nesting level when nested lists are flattened (px). */
export const LIST_INDENT = 24;

const INLINE_SET = new Set(INLINE_STYLE_PROPS);
const BLOCK_SET = new Set(BLOCK_STYLE_PROPS);
const LIST_SET = new Set(LIST_STYLE_PROPS);
const INHERITED_BLOCK = new Set(['text-align', 'line-height', 'text-indent']);

const FORMAT_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup']);
// HTML "formatting elements": they survive block boundaries and are reopened in the next block.
const PERSISTENT = new Set(['a', 'b', 'big', 'code', 'em', 'font', 'i', 'nobr', 's', 'small', 'strike', 'strong', 'tt', 'u']);
// Dropped together with their content.
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'textarea', 'select', 'head',
  'title', 'svg', 'math', 'canvas', 'video', 'audio', 'applet', 'frame', 'frameset', 'noembed', 'noframes', 'xmp',
  'plaintext', 'button', 'input', 'img', 'meta', 'link', 'base', 'option', 'optgroup', 'datalist', 'map', 'area', 'param',
  'source', 'track', 'wbr', 'picture', 'colgroup', 'col', 'rp', 'rt', 'progress', 'meter', 'output', 'slot', 'portal']);
// Paragraph-like containers: each becomes one or more <p>.
const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'listing', 'address', 'article',
  'section', 'header', 'footer', 'main', 'nav', 'aside', 'figure', 'figcaption', 'center', 'details', 'summary', 'fieldset',
  'legend', 'form', 'hgroup', 'dialog', 'dl', 'dt', 'dd', 'search', 'body', 'html']);
const TABLE_TAGS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'caption']);
const LIST_TAGS = new Set(['ul', 'ol', 'menu', 'dir']);
const HEADING_SIZES = { h1: '24pt', h2: '18pt', h3: '14pt', h4: '12pt', h5: '10pt', h6: '8pt' };
const GENERIC_FONTS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
  'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong']);
const LIST_TYPES = new Set(['disc', 'circle', 'square', 'decimal', 'decimal-leading-zero', 'lower-alpha', 'upper-alpha',
  'lower-latin', 'upper-latin', 'lower-roman', 'upper-roman', 'lower-greek', 'none']);
const OL_TYPE_ATTR = { 1: 'decimal', a: 'lower-alpha', A: 'upper-alpha', i: 'lower-roman', I: 'upper-roman' };

// CSS named colours -> hex
const NAMED_COLORS = Object.fromEntries(('aliceblue:f0f8ff,antiquewhite:faebd7,aqua:00ffff,aquamarine:7fffd4,azure:f0ffff,' +
  'beige:f5f5dc,bisque:ffe4c4,black:000000,blanchedalmond:ffebcd,blue:0000ff,blueviolet:8a2be2,brown:a52a2a,burlywood:deb887,' +
  'cadetblue:5f9ea0,chartreuse:7fff00,chocolate:d2691e,coral:ff7f50,cornflowerblue:6495ed,cornsilk:fff8dc,crimson:dc143c,' +
  'cyan:00ffff,darkblue:00008b,darkcyan:008b8b,darkgoldenrod:b8860b,darkgray:a9a9a9,darkgreen:006400,darkgrey:a9a9a9,' +
  'darkkhaki:bdb76b,darkmagenta:8b008b,darkolivegreen:556b2f,darkorange:ff8c00,darkorchid:9932cc,darkred:8b0000,' +
  'darksalmon:e9967a,darkseagreen:8fbc8f,darkslateblue:483d8b,darkslategray:2f4f4f,darkslategrey:2f4f4f,darkturquoise:00ced1,' +
  'darkviolet:9400d3,deeppink:ff1493,deepskyblue:00bfff,dimgray:696969,dimgrey:696969,dodgerblue:1e90ff,firebrick:b22222,' +
  'floralwhite:fffaf0,forestgreen:228b22,fuchsia:ff00ff,gainsboro:dcdcdc,ghostwhite:f8f8ff,gold:ffd700,goldenrod:daa520,' +
  'gray:808080,green:008000,greenyellow:adff2f,grey:808080,honeydew:f0fff0,hotpink:ff69b4,indianred:cd5c5c,indigo:4b0082,' +
  'ivory:fffff0,khaki:f0e68c,lavender:e6e6fa,lavenderblush:fff0f5,lawngreen:7cfc00,lemonchiffon:fffacd,lightblue:add8e6,' +
  'lightcoral:f08080,lightcyan:e0ffff,lightgoldenrodyellow:fafad2,lightgray:d3d3d3,lightgreen:90ee90,lightgrey:d3d3d3,' +
  'lightpink:ffb6c1,lightsalmon:ffa07a,lightseagreen:20b2aa,lightskyblue:87cefa,lightslategray:778899,lightslategrey:778899,' +
  'lightsteelblue:b0c4de,lightyellow:ffffe0,lime:00ff00,limegreen:32cd32,linen:faf0e6,magenta:ff00ff,maroon:800000,' +
  'mediumaquamarine:66cdaa,mediumblue:0000cd,mediumorchid:ba55d3,mediumpurple:9370db,mediumseagreen:3cb371,' +
  'mediumslateblue:7b68ee,mediumspringgreen:00fa9a,mediumturquoise:48d1cc,mediumvioletred:c71585,midnightblue:191970,' +
  'mintcream:f5fffa,mistyrose:ffe4e1,moccasin:ffe4b5,navajowhite:ffdead,navy:000080,oldlace:fdf5e6,olive:808000,' +
  'olivedrab:6b8e23,orange:ffa500,orangered:ff4500,orchid:da70d6,palegoldenrod:eee8aa,palegreen:98fb98,paleturquoise:afeeee,' +
  'palevioletred:db7093,papayawhip:ffefd5,peachpuff:ffdab9,peru:cd853f,pink:ffc0cb,plum:dda0dd,powderblue:b0e0e6,' +
  'purple:800080,rebeccapurple:663399,red:ff0000,rosybrown:bc8f8f,royalblue:4169e1,saddlebrown:8b4513,salmon:fa8072,' +
  'sandybrown:f4a460,seagreen:2e8b57,seashell:fff5ee,sienna:a0522d,silver:c0c0c0,skyblue:87ceeb,slateblue:6a5acd,' +
  'slategray:708090,slategrey:708090,snow:fffafa,springgreen:00ff7f,steelblue:4682b4,tan:d2b48c,teal:008080,thistle:d8bfd8,' +
  'tomato:ff6347,turquoise:40e0d0,violet:ee82ee,wheat:f5deb3,white:ffffff,whitesmoke:f5f5f5,yellow:ffff00,yellowgreen:9acd32')
  .split(',').map((p) => { const [k, v] = p.split(':'); return [k, `#${v}`]; }));

const fmt = (n) => String(Math.round(n * 100) / 100);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------------------------
// CSS value validation
// ---------------------------------------------------------------------------------------------

/**
 * Split a style attribute into [property, value] declarations (comments and !important removed).
 * @param {string} str
 * @returns {Array<[string, string]>}
 */
export function parseStyle(str) {
  const s = String(str ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
  const parts = [];
  let cur = '', q = null, depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { cur += ch; if (ch === '\\') { cur += s[++i] ?? ''; } else if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ';' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  const out = [];
  for (const p of parts) {
    const i = p.indexOf(':');
    if (i <= 0) continue;
    const prop = p.slice(0, i).trim().toLowerCase();
    const value = p.slice(i + 1).replace(/!\s*important\s*$/i, '').trim();
    if (prop && value) out.push([prop, value]);
  }
  return out;
}

const LENGTH_RE = /^(-?(?:\d+\.?\d*|\.\d+))(px|pt|pc|in|cm|mm|q)?$/i;
const PX_PER = { px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6 };

/** Parse an absolute CSS length to px (unitless only for 0). Returns null if invalid. */
function lengthPx(v) {
  const m = LENGTH_RE.exec(String(v).trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  if (!m[2]) return n === 0 ? 0 : null;
  return n * PX_PER[m[2].toLowerCase()];
}

function hex2(n) { return clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0'); }

function rgbOut(r, g, b, a) {
  if (a >= 1) return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  return `rgba(${clamp(Math.round(r), 0, 255)}, ${clamp(Math.round(g), 0, 255)}, ${clamp(Math.round(b), 0, 255)}, ${fmt(clamp(a, 0, 1))})`;
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

/**
 * Validate and canonicalise a CSS colour: #rrggbb (lower case), rgba(r, g, b, a) when
 * translucent, var(--folio-KEY) theme references, transparent / currentcolor. Returns null when
 * the value is not an acceptable colour.
 * @param {string} v
 * @returns {string|null}
 */
export function normalizeColor(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return null;
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length === 6) return `#${h}`;
    if (h.length === 8) return rgbOut(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), parseInt(h.slice(6, 8), 16) / 255);
    return null;
  }
  m = /^var\(\s*--folio-([a-z0-9]+)\s*\)$/.exec(s);
  if (m) return THEME_COLOR_KEYS.includes(m[1]) ? `var(--folio-${m[1]})` : null;
  if (s === 'transparent' || s === 'currentcolor') return s;
  if (NAMED_COLORS[s]) return NAMED_COLORS[s];
  m = /^(rgba?|hsla?)\(([^()]*)\)$/.exec(s);
  if (m) {
    const parts = m[2].split(/\s*[,/]\s*|\s+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) return null;
    const num = (p, scale) => {
      const pm = /^(-?(?:\d+\.?\d*|\.\d+))(%|deg)?$/.exec(p);
      if (!pm) return NaN;
      const n = parseFloat(pm[1]);
      return pm[2] === '%' ? (n / 100) * scale : n;
    };
    const a = parts.length === 4 ? num(parts[3], 1) : 1;
    if (!Number.isFinite(a)) return null;
    if (m[1].startsWith('rgb')) {
      const [r, g, b] = parts.slice(0, 3).map((p) => num(p, 255));
      if (![r, g, b].every(Number.isFinite)) return null;
      return rgbOut(r, g, b, a);
    }
    const h = num(parts[0], 360), sat = num(parts[1], 1), l = num(parts[2], 1);
    if (![h, sat, l].every(Number.isFinite)) return null;
    const [r, g, b] = hslToRgb(h, clamp(sat > 1 ? sat / 100 : sat, 0, 1), clamp(l > 1 ? l / 100 : l, 0, 1));
    return rgbOut(r, g, b, a);
  }
  return null;
}

function splitList(v) {
  const out = [];
  let cur = '', q = null;
  for (const ch of String(v)) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === ',') { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

/**
 * Canonicalise a font-family list: quoted family names, unquoted generic families, or a theme
 * font reference var(--folio-heading|body). Returns null when nothing valid remains.
 * @param {string} v
 * @returns {string|null}
 */
export function normalizeFontFamily(v) {
  const s = String(v ?? '').trim();
  const vm = /^var\(\s*--folio-(heading|body)\s*\)$/i.exec(s);
  if (vm) return `var(--folio-${vm[1].toLowerCase()})`;
  const fams = [];
  for (const item of splitList(s)) {
    let name;
    const qm = /^(['"])(.*)\1$/.exec(item);
    if (qm) name = qm[2].trim();
    else if (/^[a-zA-Z0-9_\- .]+$/.test(item)) name = item.replace(/\s+/g, ' ').trim();
    else continue;
    if (!name || /["'\\<>;{}()]/.test(name) || name.length > 80) continue;
    const lower = name.toLowerCase();
    fams.push(GENERIC_FONTS.has(lower) && !qm ? lower : `"${name}"`);
  }
  return fams.length ? fams.join(', ') : null;
}

const FONT_SIZE_KEYWORDS = { 'xx-small': 7, 'x-small': 7.5, small: 10, medium: 12, large: 13.5, 'x-large': 18, 'xx-large': 24, 'xxx-large': 36 };

/** Canonicalise a font size to points ("14pt"); relative sizes are rejected. */
export function normalizeFontSize(v) {
  const s = String(v ?? '').trim().toLowerCase();
  let pt = null;
  if (FONT_SIZE_KEYWORDS[s]) pt = FONT_SIZE_KEYWORDS[s];
  else {
    const px = lengthPx(s);
    if (px !== null && px > 0) pt = px * 0.75;
  }
  if (pt === null) return null;
  return `${fmt(clamp(pt, 1, 1638))}pt`;
}

const VALIDATORS = {
  'font-family': normalizeFontFamily,
  'font-size': normalizeFontSize,
  'font-weight': (v) => {
    const s = v.toLowerCase();
    if (/^(normal|bold|bolder|lighter)$/.test(s)) return s;
    return /^[1-9]00$/.test(s) ? s : null;
  },
  'font-style': (v) => (/^(normal|italic|oblique)$/i.test(v) ? v.toLowerCase() : null),
  'text-decoration': (v) => {
    const toks = v.toLowerCase().split(/\s+/);
    const keep = [];
    for (const t of toks) if (['underline', 'line-through', 'overline'].includes(t) && !keep.includes(t)) keep.push(t);
    if (keep.length) return keep.join(' ');
    return toks.includes('none') ? 'none' : null;
  },
  color: normalizeColor,
  'background-color': (v) => {
    const c = normalizeColor(v);
    return c && c !== 'transparent' && c !== 'currentcolor' && !/^rgba\(.*, 0\)$/.test(c) ? c : null;
  },
  'letter-spacing': (v) => {
    const s = v.toLowerCase();
    if (s === 'normal') return 'normal';
    const em = /^(-?(?:\d+\.?\d*|\.\d+))em$/.exec(s);
    if (em) return `${fmt(clamp(parseFloat(em[1]), -1, 5))}em`;
    const px = lengthPx(s);
    return px === null ? null : `${fmt(clamp(px, -50, 200))}px`;
  },
  'text-transform': (v) => (/^(none|uppercase|lowercase|capitalize)$/i.test(v) ? v.toLowerCase() : null),
  'text-align': (v) => {
    const s = v.toLowerCase().replace(/^-(webkit|moz)-/, '');
    if (['left', 'right', 'center', 'justify'].includes(s)) return s;
    if (s === 'start') return 'left';
    if (s === 'end') return 'right';
    if (s === 'justify-all') return 'justify';
    return null;
  },
  'line-height': (v) => {
    const s = v.toLowerCase();
    if (/^(?:\d+\.?\d*|\.\d+)$/.test(s)) return fmt(clamp(parseFloat(s), 0.5, 10));
    const pc = /^(\d+\.?\d*|\.\d+)%$/.exec(s);
    if (pc) return fmt(clamp(parseFloat(pc[1]) / 100, 0.5, 10));
    const em = /^(\d+\.?\d*|\.\d+)em$/.exec(s);
    if (em) return fmt(clamp(parseFloat(em[1]), 0.5, 10));
    const px = lengthPx(s);
    return px === null || px <= 0 ? null : `${fmt(clamp(px, 1, 2000))}px`;
  },
  'margin-top': (v) => { const px = lengthPx(v); return px === null ? null : `${fmt(clamp(px, -500, 2000))}px`; },
  'margin-bottom': (v) => { const px = lengthPx(v); return px === null ? null : `${fmt(clamp(px, -500, 2000))}px`; },
  'margin-left': (v) => { const px = lengthPx(v); return px === null ? null : `${fmt(clamp(px, -500, 2000))}px`; },
  'text-indent': (v) => { const px = lengthPx(v); return px === null ? null : `${fmt(clamp(px, -2000, 2000))}px`; },
  'list-style-type': (v) => (LIST_TYPES.has(v.toLowerCase()) ? v.toLowerCase() : null)
};

function expandShorthands(decls) {
  const out = [];
  for (const [prop, value] of decls) {
    if (prop === 'margin') {
      const p = value.trim().split(/\s+/);
      const [t, r = t, b = t, l = r] = p;
      if (p.length <= 4) out.push(['margin-top', t], ['margin-bottom', b], ['margin-left', l]);
      void r;
    } else if (prop === 'text-decoration-line') {
      out.push(['text-decoration', value]);
    } else if (prop === 'background') {
      if (normalizeColor(value)) out.push(['background-color', value]);
    } else {
      out.push([prop, value]);
    }
  }
  return out;
}

/**
 * Filter declarations to an allowed property set, validating and canonicalising values.
 * @param {Array<[string,string]>} decls
 * @param {Set<string>} allowed
 * @returns {Map<string,string>}
 */
export function filterStyle(decls, allowed) {
  const map = new Map();
  for (const [prop, value] of expandShorthands(decls)) {
    if (!allowed.has(prop)) continue;
    const v = VALIDATORS[prop] ? VALIDATORS[prop](value) : null;
    if (v === null || v === undefined) continue;
    map.delete(prop);
    map.set(prop, v);
  }
  return map;
}

/** Serialise a style map as an attribute string (with leading space) or ''. */
export function styleAttr(map) {
  if (!map || !map.size) return '';
  return ` style="${escapeAttr([...map].map(([k, v]) => `${k}: ${v};`).join(' '))}"`;
}

/**
 * Accept only http(s) and mailto links. Returns the cleaned URL or null.
 * @param {string} href
 * @returns {string|null}
 */
export function cleanHref(href) {
  const h = String(href ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (/^https?:\/\/[^\s]+$/i.test(h) || /^mailto:[^\s]+$/i.test(h)) return h;
  return null;
}

function isFieldAttrs(attrs) {
  const cls = attrs.class || '';
  return /(^|\s)field(\s|$)/.test(cls) && typeof attrs['data-field'] === 'string' && attrs['data-field'] !== '';
}

function cleanText(s) {
  return s.replace(/\r\n?/g, '\n').replace(/[\u200b\ufeff]/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

// ---------------------------------------------------------------------------------------------
// Builder: streams tokens into output blocks, reconstructing inline formatting across blocks.
// ---------------------------------------------------------------------------------------------

let listSeq = 0;

class Builder {
  constructor(collapse) {
    this.collapse = collapse;
    this.blocks = [];
    this.block = null;
    this.path = [];
    this.stack = [];
    this.implicitList = null;
    this.row = null;
    this.pendingTab = false;
    this.preStart = false;
  }

  topListCtx() {
    for (let k = this.stack.length - 1; k >= 0; k--) {
      const e = this.stack[k];
      if (e.kind === 'li' || e.kind === 'list') return e;
    }
    return null;
  }

  nearestList() {
    for (let k = this.stack.length - 1; k >= 0; k--) if (this.stack[k].kind === 'list') return this.stack[k];
    return null;
  }

  inPre() {
    for (const e of this.stack) if (e.pre) return true;
    return false;
  }

  inTableStructure() {
    for (let k = this.stack.length - 1; k >= 0; k--) {
      const e = this.stack[k];
      if (e.kind === 'cell') return false;
      if (e.kind === 'table') return true;
      if (e.kind === 'block' || e.kind === 'li' || e.kind === 'list') return false;
    }
    return false;
  }

  boundary() {
    if (!this.block) return;
    const owner = this.block.owner;
    if (owner && owner.kind === 'li' && this.stack.includes(owner) && this.topListCtx() === owner) {
      if (this.block.hasContent) this.block.needBreak = true;
      return;
    }
    this.closeBlock();
  }

  closeBlock() {
    if (this.block && this.collapse) trimTrailingSpace(this.block.children);
    this.block = null;
    this.path = [];
    this.pendingTab = false;
  }

  // Remove stack entry k (a block-ish element) plus everything above it except persistent formatting.
  closeAt(k) {
    const kept = [];
    for (let j = k + 1; j < this.stack.length; j++) {
      const e = this.stack[j];
      if (e.kind === 'inline' && PERSISTENT.has(e.name)) kept.push(e);
    }
    const closed = this.stack[k];
    // an explicit empty paragraph / list item still occupies a line (stored stories only)
    if (!closed.used && !this.collapse && !this.block && (closed.name === 'p' || closed.kind === 'li')) {
      this.stack.length = k + 1;
      this.ensureBlock();
    }
    this.stack.length = k;
    this.stack.push(...kept);
    if (closed.kind === 'list') this.implicitList = null;
    if (closed.name === 'tr') this.row = null;
    this.boundary();
  }

  closeOpenP() {
    for (let k = this.stack.length - 1; k >= 0; k--) {
      const e = this.stack[k];
      if (e.kind === 'cell' || e.kind === 'table') return;
      if (e.name === 'p') { this.closeAt(k); return; }
    }
  }

  ensureBlock() {
    if (this.block) return;
    const ctx = this.topListCtx();
    const ctxIndex = ctx ? this.stack.indexOf(ctx) : -1;
    const style = new Map();
    for (let k = 0; k < this.stack.length; k++) {
      const e = this.stack[k];
      if (!e.bstyle) continue;
      for (const [p, v] of e.bstyle) if (INHERITED_BLOCK.has(p)) { style.delete(p); style.set(p, v); }
    }
    // own (non-inherited) props: from the list item and blocks inside it, or the innermost block.
    let own = [];
    if (ctx) own = this.stack.slice(ctxIndex).filter((e) => e.bstyle);
    else {
      for (let k = this.stack.length - 1; k >= 0; k--) if (this.stack[k].bstyle) { own = [this.stack[k]]; break; }
    }
    for (const e of own) for (const [p, v] of e.bstyle) if (!INHERITED_BLOCK.has(p)) { style.delete(p); style.set(p, v); }
    for (const e of this.stack) if (e.kind === 'block' || e.kind === 'li') e.used = true;
    let list = null;
    if (ctx) {
      list = ctx.list;
      if (ctx.depth > 0) {
        const base = parseFloat(style.get('margin-left') || '0') || 0;
        style.delete('margin-left');
        style.set('margin-left', `${fmt(base + ctx.depth * LIST_INDENT)}px`);
      }
    } else {
      this.implicitList = null;
    }
    this.block = { tag: ctx ? 'li' : 'p', style, list, owner: ctx, children: [], hasContent: false, needBreak: false, lastSpace: true };
    this.blocks.push(this.block);
    this.path = [];
  }

  syncPath() {
    const specs = this.stack.filter((e) => e.spec);
    let k = 0;
    while (k < this.path.length && k < specs.length && this.path[k].entry === specs[k]) k++;
    this.path.length = k;
    for (let j = k; j < specs.length; j++) {
      const sp = specs[j].spec;
      const node = { type: 'el', tag: sp.tag, href: sp.href || null, style: new Map(sp.style), children: [] };
      (j === 0 ? this.block.children : this.path[j - 1].node.children).push(node);
      this.path.push({ entry: specs[j], node });
    }
  }

  target() {
    return this.path.length ? this.path[this.path.length - 1].node.children : this.block.children;
  }

  prepare() {
    this.ensureBlock();
    this.syncPath();
    if (this.block.needBreak) {
      this.block.needBreak = false;
      if (this.collapse) trimTrailingSpace(this.block.children);
      this.target().push({ type: 'br' });
      this.block.lastSpace = true;
    }
    if (this.pendingTab) {
      this.pendingTab = false;
      if (this.block.hasContent) this.appendText('\t');
    }
  }

  appendText(s) {
    const t = this.target();
    const last = t[t.length - 1];
    if (last && last.type === 'text') last.text += s; else t.push({ type: 'text', text: s });
    this.block.hasContent = true;
  }

  text(raw) {
    let s = cleanText(raw);
    if (this.preStart) { this.preStart = false; if (s.startsWith('\n')) s = s.slice(1); }
    if (!s) return;
    const pre = this.inPre();
    if (this.collapse && pre) {
      const lines = s.split('\n');
      lines.forEach((line, i) => {
        if (i > 0) this.br();
        if (line) { this.prepare(); this.appendText(line); this.block.lastSpace = /[ \t]$/.test(line); }
      });
      return;
    }
    if (this.collapse) s = s.replace(/[ \t\n\f]+/g, ' ');
    const wsOnly = !/[^ \t\n\f]/.test(s);
    if (wsOnly) {
      if (!this.block || this.block.needBreak || this.inTableStructure()) return;
      if (this.collapse && (!this.block.hasContent || this.block.lastSpace)) return;
    }
    if (this.collapse && (!this.block || !this.block.hasContent || this.block.lastSpace || this.block.needBreak)) s = s.replace(/^ /, '');
    if (!s) return;
    this.prepare();
    if (this.collapse && this.block.lastSpace) s = s.replace(/^ /, '');
    if (!s) return;
    this.appendText(s);
    this.block.lastSpace = / $/.test(s);
  }

  br() {
    this.prepare();
    if (this.collapse) trimTrailingSpace(this.block.children);
    this.target().push({ type: 'br' });
    this.block.hasContent = true;
    this.block.lastSpace = true;
  }

  field(name, attrs) {
    this.prepare();
    const style = filterStyle(parseStyle(attrs.style), INLINE_SET);
    this.target().push({ type: 'field', name, style });
    this.block.hasContent = true;
    this.block.lastSpace = false;
  }

  start(name, attrs) {
    const decls = parseStyle(attrs.style);
    if (name === 'br') { this.br(); return; }
    if (name === 'hr') { this.closeOpenP(); this.boundary(); return; }
    if (LIST_TAGS.has(name)) {
      this.closeOpenP();
      const parent = this.nearestList();
      const style = filterStyle(decls, LIST_SET);
      const tag = name === 'ol' ? 'ol' : 'ul';
      const typeAttr = attrs.type;
      if (typeAttr && !style.has('list-style-type')) {
        const t = tag === 'ol' ? OL_TYPE_ATTR[typeAttr] : (LIST_TYPES.has(typeAttr.toLowerCase()) ? typeAttr.toLowerCase() : null);
        if (t) style.set('list-style-type', t);
      }
      let start = null;
      if (tag === 'ol' && attrs.start !== undefined && /^\s*-?\d{1,7}\s*$/.test(attrs.start)) start = parseInt(attrs.start, 10);
      // a nested list of the same kind continues the parent list (its items are indented)
      const sameAsParent = parent && parent.list.tag === tag && tag === 'ul' && start === null &&
        styleAttr(style) === styleAttr(parent.list.style);
      const list = sameAsParent ? parent.list : { id: ++listSeq, tag, style, start, emitted: 0 };
      this.stack.push({ name, kind: 'list', list, depth: parent ? parent.depth + 1 : 0, spec: inlineSpec('span', {}, decls) });
      this.implicitList = null;
      this.boundary();
      return;
    }
    if (name === 'li') {
      // close an open li in list-item scope
      for (let k = this.stack.length - 1; k >= 0; k--) {
        const e = this.stack[k];
        if (e.kind === 'list' || e.kind === 'cell' || e.kind === 'table') break;
        if (e.kind === 'li') { this.closeAt(k); break; }
      }
      this.closeOpenP();
      const listEntry = this.nearestList();
      let list, depth = 0;
      if (listEntry) { list = listEntry.list; depth = listEntry.depth; } else {
        if (!this.implicitList) this.implicitList = { id: ++listSeq, tag: 'ul', style: new Map(), start: null, emitted: 0 };
        list = this.implicitList;
      }
      this.stack.push({ name, kind: 'li', list, depth, bstyle: filterStyle(decls, BLOCK_SET), spec: inlineSpec('span', {}, decls) });
      this.boundary();
      return;
    }
    if (BLOCK_TAGS.has(name)) {
      if (name !== 'body' && name !== 'html') this.closeOpenP();
      if (name === 'dt' || name === 'dd') {
        for (let k = this.stack.length - 1; k >= 0; k--) {
          const e = this.stack[k];
          if (e.kind !== 'block' && e.kind !== 'inline') break;
          if (e.name === 'dt' || e.name === 'dd') { this.closeAt(k); break; }
        }
      }
      let spec = inlineSpec('span', {}, decls);
      if (HEADING_SIZES[name]) {
        const style = new Map([['font-size', HEADING_SIZES[name]], ['font-weight', 'bold']]);
        if (spec) for (const [k, v] of spec.style) { style.delete(k); style.set(k, v); }
        spec = { tag: 'span', style };
      }
      const ws = decls.find(([p]) => p === 'white-space');
      const pre = name === 'pre' || name === 'listing' || (ws && /^(pre|pre-wrap|break-spaces)$/i.test(ws[1]));
      this.stack.push({ name, kind: 'block', bstyle: filterStyle(decls, BLOCK_SET), spec, pre });
      this.boundary();
      if (name === 'pre' || name === 'listing') this.preStart = true;
      return;
    }
    if (TABLE_TAGS.has(name)) {
      this.closeOpenP();
      this.stack.push({ name, kind: name === 'caption' ? 'block' : 'table', bstyle: null, spec: null });
      if (name === 'tr') this.row = { cells: 0 };
      this.boundary();
      return;
    }
    if (name === 'td' || name === 'th') {
      for (let k = this.stack.length - 1; k >= 0; k--) {
        const e = this.stack[k];
        if (e.kind === 'table') break;
        if (e.kind === 'cell') { this.closeAt(k); break; }
      }
      this.stack.push({ name, kind: 'cell', spec: inlineSpec('span', {}, decls) });
      if (this.row) { if (this.row.cells++ > 0) this.pendingTab = true; }
      return;
    }
    // inline elements
    if (name === 'a') {
      for (let k = this.stack.length - 1; k >= 0; k--) if (this.stack[k].name === 'a' && this.stack[k].kind === 'inline') { this.stack.splice(k, 1); break; }
    }
    if (VOID_TAGS.has(name)) return;
    const ws = decls.find(([p]) => p === 'white-space');
    const pre = !!(ws && /^(pre|pre-wrap|break-spaces)$/i.test(ws[1]));
    this.stack.push({ name, kind: 'inline', spec: inlineSpec(name, attrs, decls), pre });
  }

  end(name) {
    if (name === 'br') { this.br(); return; }
    let k = this.stack.length - 1;
    while (k >= 0 && this.stack[k].name !== name) k--;
    if (k < 0) {
      if (BLOCK_TAGS.has(name) || LIST_TAGS.has(name) || name === 'li') this.boundary();
      return;
    }
    const e = this.stack[k];
    if (e.kind === 'inline' || e.kind === 'cell') { this.stack.splice(k, 1); return; }
    this.closeAt(k);
  }

  finish() {
    if (!this.block && !this.collapse) {
      const k = this.stack.findLastIndex((e) => e.name === 'p' || e.kind === 'li');
      if (k >= 0 && !this.stack[k].used) { this.stack.length = k + 1; this.ensureBlock(); }
    }
    if (this.block && this.collapse) trimTrailingSpace(this.block.children);
    let html = '';
    let group = null;
    const flush = () => {
      if (!group) return;
      const { list, items } = group;
      let start = (list.start ?? 1) + list.emitted;
      list.emitted += items.length;
      if (list.tag !== 'ol' || start === 1) start = null;
      html += `<${list.tag}${start !== null ? ` start="${start}"` : ''}${styleAttr(list.style)}>${items.join('')}</${list.tag}>`;
      group = null;
    };
    for (const b of this.blocks) {
      let children = normalizeInline(b.children);
      if (this.collapse) { trimTrailingSpace(children); children = normalizeInline(children); }
      if (!children.length) {
        if (this.collapse) continue;
        children = [{ type: 'br' }];
      }
      const body = serializeInline(children);
      if (b.tag === 'li') {
        const item = `<li${styleAttr(b.style)}>${body}</li>`;
        if (group && group.list === b.list) group.items.push(item);
        else { flush(); group = { list: b.list, items: [item] }; }
      } else {
        flush();
        html += `<p${styleAttr(b.style)}>${body}</p>`;
      }
    }
    flush();
    return html;
  }
}

const FONT_TAG_SIZES = { 1: '7.5pt', 2: '10pt', 3: '12pt', 4: '13.5pt', 5: '18pt', 6: '24pt', 7: '36pt' };

function inlineSpec(name, attrs, decls) {
  const style = filterStyle(decls, INLINE_SET);
  let tag = null, href = null;
  if (FORMAT_TAGS.has(name)) tag = name;
  else if (name === 'ins') tag = 'u';
  else if (name === 'del') tag = 's';
  else if (name === 'a') {
    href = cleanHref(attrs.href);
    if (href) tag = 'a';
  } else if (name === 'font') {
    if (attrs.color && !style.has('color')) { const c = normalizeColor(attrs.color); if (c) style.set('color', c); }
    if (attrs.face && !style.has('font-family')) { const f = normalizeFontFamily(attrs.face); if (f) style.set('font-family', f); }
    if (attrs.size && !style.has('font-size')) {
      const m = /^\s*([+-]?)(\d)\s*$/.exec(attrs.size);
      if (m) {
        const n = clamp(m[1] === '+' ? 3 + +m[2] : m[1] === '-' ? 3 - +m[2] : +m[2], 1, 7);
        style.set('font-size', FONT_TAG_SIZES[n]);
      }
    }
  } else if (name === 'mark') {
    if (!style.has('background-color')) style.set('background-color', '#ffff00');
  }
  if (!tag) {
    const va = decls.filter(([p]) => p === 'vertical-align').pop();
    if (va && /^(super|sub)$/i.test(va[1])) tag = va[1].toLowerCase() === 'super' ? 'sup' : 'sub';
  }
  if (!tag && style.size) tag = 'span';
  return tag ? { tag, href, style } : null;
}

function trimTrailingSpace(children) {
  for (;;) {
    const last = children[children.length - 1];
    if (!last) return;
    if (last.type === 'text') {
      const t = last.text.replace(/ +$/, '');
      if (t) { last.text = t; return; }
      children.pop();
      continue;
    }
    if (last.type === 'el') {
      trimTrailingSpace(last.children);
      if (!last.children.length) { children.pop(); continue; }
    }
    return;
  }
}

function elKey(n) {
  return `${n.tag}|${n.href || ''}|${[...n.style].map(([k, v]) => `${k}:${v}`).join(';')}`;
}

function pushMerge(out, n) {
  const last = out[out.length - 1];
  if (n.type === 'text' && last && last.type === 'text') { last.text += n.text; return; }
  if (n.type === 'el' && last && last.type === 'el' && elKey(last) === elKey(n)) {
    last.children = normalizeInline([...last.children, ...n.children]);
    return;
  }
  out.push(n);
}

function normalizeInline(nodes) {
  const out = [];
  for (const n of nodes) {
    if (n.type === 'text') { if (n.text) pushMerge(out, { type: 'text', text: n.text }); continue; }
    if (n.type !== 'el') { out.push(n); continue; }
    const children = normalizeInline(n.children);
    if (!children.length) continue;
    if (n.tag === 'span' && !n.style.size) { for (const c of children) pushMerge(out, c); continue; }
    pushMerge(out, { ...n, children });
  }
  return out;
}

function serializeInline(nodes) {
  let s = '';
  for (const n of nodes) {
    if (n.type === 'text') s += escapeText(n.text);
    else if (n.type === 'br') s += '<br>';
    else if (n.type === 'field') s += `<span class="field" data-field="${escapeAttr(n.name)}" contenteditable="false"${styleAttr(n.style)}>«${escapeText(n.name)}»</span>`;
    else s += `<${n.tag}${n.href ? ` href="${escapeAttr(n.href)}"` : ''}${styleAttr(n.style)}>${serializeInline(n.children)}</${n.tag}>`;
  }
  return s;
}

function skipElement(tokens, k, name) {
  let depth = 1;
  for (let j = k + 1; j < tokens.length; j++) {
    const t = tokens[j];
    if (t.type === 'start' && t.name === name && !VOID_TAGS.has(name)) depth++;
    else if (t.type === 'end' && t.name === name && --depth === 0) return j;
  }
  return tokens.length - 1;
}

/**
 * Sanitize rich text HTML to the story whitelist (see the module header).
 * @param {string} html
 * @param {{ collapseWhitespace?: boolean }} [opts] collapseWhitespace: apply HTML white-space
 *   collapsing (use for clipboard / imported HTML; story text is otherwise stored verbatim and
 *   rendered with white-space: pre-wrap).
 * @returns {string}
 */
export function sanitizeHtml(html, opts = {}) {
  const tokens = tokenize(html);
  const b = new Builder(!!opts.collapseWhitespace);
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.type === 'text') { if (!t.raw) b.text(t.text); continue; }
    if (t.type === 'start') {
      if (DROP.has(t.name)) {
        if (!VOID_TAGS.has(t.name) && !t.selfClosing) k = skipElement(tokens, k, t.name);
        continue;
      }
      const attrs = attrMap(t.attrs);
      if (t.name === 'span' && isFieldAttrs(attrs)) {
        b.field(attrs['data-field'], attrs);
        if (!t.selfClosing) k = skipElement(tokens, k, 'span');
        continue;
      }
      b.start(t.name, attrs);
    } else if (t.type === 'end') {
      if (DROP.has(t.name)) continue;
      b.end(t.name);
    }
  }
  return b.finish();
}

/**
 * Sanitize HTML from the clipboard or another application (whitespace collapsed as a browser
 * would render it).
 * @param {string} html
 * @returns {string}
 */
export function sanitizePastedHtml(html) {
  return sanitizeHtml(html, { collapseWhitespace: true });
}

/**
 * Convert plain text to story HTML: one paragraph per line (tabs and spaces kept).
 * @param {string} text
 * @returns {string}
 */
export function textToHtml(text) {
  const lines = cleanText(String(text ?? '')).split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines.map((l) => `<p>${l ? escapeText(l) : '<br>'}</p>`).join('');
}
