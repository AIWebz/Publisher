// Collects the interface strings (the English source text) from src/ and desktop/ into
// app/i18n/strings.json, the list every display-language catalog translates.
//
//   node scripts/i18n-extract.mjs            write app/i18n/strings.json
//   node scripts/i18n-extract.mjs --report   also print where each string comes from
//
// A string counts as interface text when it reads like words (a capital letter or a space, not an
// id, path, CSS, HTML or SVG) and is not in a position that holds ids: import sources, object keys,
// `id:`/`icon:`/`value:`-style properties, comparisons, DOM/event/pref API arguments and the like.
// Template literals become keys with numbered placeholders: `Page ${i} of ${n}` -> "Page {1} of {2}".
// Template content (the text placed into publications) is not interface text and is skipped.
import { parse } from 'acorn';
import { fullAncestor } from 'acorn-walk';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const report = process.argv.includes('--report');

const SOURCES = ['src', 'desktop'];
// engines build publication content (not interface text); language names come from Intl.DisplayNames
const SKIP_FILES = [/^src\/engines\/(?!templates\/(catalog|custom)\.js|mailmerge\/(?!xlsx)|export\/index\.js)/, /^src\/core\/languages\.js$/, /\.test\.js$/];
// names, not words: the brand, font families, file types
const NOT_WORDS = new Set(['Folio', 'Folio Publisher', 'Excel', 'JSON', 'Aa']);
// …and the font families (theme.js lists them in FONTS and the font schemes)
const themeSrc = readFileSync(path.join(root, 'src/core/theme.js'), 'utf8');
for (const m of themeSrc.matchAll(/(?:heading|body):\s*'([^']+)'/g)) NOT_WORDS.add(m[1]);
for (const m of (/export const FONTS = \[([\s\S]*?)\]/.exec(themeSrc) || ['', ''])[1].matchAll(/'([^']+)'/g)) NOT_WORDS.add(m[1]);

// properties whose values are ids, not words
const ID_KEYS = new Set(['id', 'icon', 'tab', 'group', 'type', 'kind', 'key', 'cmd', 'command', 'role', 'accelerator', 'class', 'className', 'cls',
  'tag', 'font', 'family', 'fontFamily', 'value', 'src', 'href', 'url', 'path', 'file', 'ext', 'extensions', 'mime', 'format', 'unit', 'units', 'shortcut',
  'keys', 'accel', 'when', 'align', 'valign', 'dir', 'style', 'css', 'color', 'fill', 'stroke', 'mode', 'lang', 'locale', 'event', 'pref', 'prefKey',
  'selector', 'page', 'section', 'panel', 'size', 'shape', 'preset', 'variant', 'cursor', 'effect', 'blend', 'anchor', 'side', 'position', 'layout',
  'engine', 'script', 'channel', 'ref', 'target', 'field', 'column', 'sheet', 'storageKey', 'storeKey', 'native', 'code', 'aff', 'dic', 'image',
  'pattern', 'regex', 'fallback', 'weight', 'transform', 'decoration', 'case', 'wrap', 'mask', 'clip', 'dash', 'cap', 'join', 'arrow', 'easing',
  'synonyms', 'aliases', 'accept']);
// calls whose string arguments are ids (all arguments unless a position is given)
const ID_CALLS = new Map(Object.entries({
  h: [0], createElement: null, createElementNS: null, createTextNode: [], querySelector: null, querySelectorAll: null, closest: null, matches: null,
  getElementById: null, getElementsByClassName: null, getAttribute: null, setAttribute: [0], removeAttribute: null, hasAttribute: null,
  toggleAttribute: null, addEventListener: null, removeEventListener: null, CustomEvent: [0], Event: [0], emit: [0], on: [0], off: [0], once: [0],
  get: null, set: [0], define: null, exec: null, run: [0], add: null, remove: null, toggle: null, contains: null, startsWith: null, endsWith: null,
  includes: null, indexOf: null, lastIndexOf: null, split: null, join: null, replace: [0], replaceAll: [0], padStart: null, padEnd: null, fetch: null,
  require: null, setProperty: null, getPropertyValue: null, removeProperty: null, getItem: null, setItem: null, removeItem: null, postMessage: null,
  invoke: [0], send: [0], handle: [0], matchMedia: null, RegExp: null, Symbol: null, Number: null, parseFloat: null, parseInt: null, log: null,
  warn: null, error: null, info: null, debug: null, Error: null, TypeError: null, RangeError: null, command: null, icon: null, has: null,
  delete: null, getContext: null, fromHTML: null, $: null, $$: null, assert: null, localeCompare: null, toLocaleString: null, DateTimeFormat: null,
  NumberFormat: null, supports: null, execCommand: [0], queryCommandValue: null, queryCommandState: null, measureText: null, font: null, isSupported: null
}));
const COMPARE = new Set(['===', '!==', '==', '!=', 'in', 'instanceof']);

const looksLikeWords = (s) => {
  const v = s.trim();
  if (v.length < 2 || !/[A-Za-z]/.test(v) || NOT_WORDS.has(v)) return false;
  if (/^(Ctrl|Cmd|Mod|Shift|Alt|Win|Option|Meta)\+/.test(v)) return false;   // keyboard shortcuts
  if (/^[\w.+-]+\/[\w.+*-]+(,|$)/.test(v)) return false;                  // MIME types
  if (/^-?[\d.]+(px|em|rem|pt|%)?(\s+-?[\d.]+(px|em|rem|pt|%)?)*$/.test(v)) return false; // CSS lengths
  if (/\{\d+\}px\b|^[a-z]+-[a-z]+ [a-z]/.test(s)) return false;                 // CSS values and class lists with placeholders
  if (/^(https?:|data:|blob:|file:|mailto:|about:)/i.test(v)) return false;
  if (/<[a-z!/][^>]*>/i.test(v) || /\w="/.test(v)) return false;     // HTML / SVG markup and attributes
  if (/\b[a-z][\w-]*\(/.test(v)) return false;                          // CSS / SVG functions: rgba(…), translate(…)
  if (/[{};]\s*$|^[.#@[]|var\(--|rgba?\(|hsla?\(|\burl\(|^#[0-9a-f]{3,8}$/i.test(v)) return false; // CSS
  if (/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/.test(v) && /\d/.test(v)) return false; // SVG path data
  if (/(sans-serif|serif|monospace|system-ui)\s*$/.test(v) && /,/.test(v)) return false; // font stacks
  if (/^[\w$-]+:[\w\s-]+$/.test(v) && !/\s[A-Z]/.test(v) && v === v.toLowerCase()) return false; // ids like 'tab:home'
  if (!/\s/.test(v)) {
    if (/^[a-z0-9_$.:\-/#*+=?&%]+$/.test(v)) return false;           // lowercase ids, events, paths
    if (/^[A-Z0-9_\-]+$/.test(v) && v !== 'OK') return false;        // CONSTANTS and acronyms (PDF, CMYK)
    if (/[a-z][A-Z]/.test(v) && !/[…]/.test(v)) return false;          // camelCase ids
    if (/\.\w{2,5}$/.test(v)) return false;                           // file names
    if (/^[\d\s.,:%×x+-]+[a-z]{0,3}$/i.test(v)) return false;         // measurements like 12pt
  }
  return true;
};
// lowercase words with no placeholders and no small words are class lists ('btn primary'), not text
const classList = (v) => /^[a-z][\w-]*( [a-z][\w-]*)*$/.test(v) && !/\b(the|a|an|of|to|and|or|in|on|for|with|from|by|at|is|are|no|not|all|this|that|your|you)\b/.test(v);

const calleeName = (c) => (c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier' ? c.property.name : null);

function excluded(node, ancestors) {
  const parent = ancestors[ancestors.length - 2];
  if (!parent) return false;
  if (/^(Import|Export)/.test(parent.type) || parent.type === 'ImportExpression') return true;
  if (parent.type === 'Property' && parent.key === node) return true;
  if (parent.type === 'Property' && parent.value === node) {
    const k = parent.key.type === 'Identifier' ? parent.key.name : parent.key.value;
    if (ID_KEYS.has(k) || /^(on|data|is|has)[A-Z]|Id$|Key$|Class$|Icon$|Url$|Path$/.test(String(k))) return true;
  }
  if (parent.type === 'MemberExpression' && parent.property === node) return true;
  if (parent.type === 'BinaryExpression' && COMPARE.has(parent.operator)) return true;
  if (parent.type === 'SwitchCase' && parent.test === node) return true;
  if (parent.type === 'TaggedTemplateExpression') return true;
  if (parent.type === 'AssignmentExpression' && parent.left.type === 'MemberExpression') {
    const p = parent.left.property && (parent.left.property.name || parent.left.property.value);
    if (/^(className|id|cursor|src|href|type|name|value|lang|dir|cssText|innerHTML|outerHTML|font|fillStyle|strokeStyle|textAlign|textBaseline|globalCompositeOperation|lineCap|lineJoin|display|position|width|height|left|top|right|bottom|background|color|transform)$/.test(p)) return true;
  }
  if (parent.type === 'CallExpression' || parent.type === 'NewExpression') {
    const name = calleeName(parent.callee);
    if (name && ID_CALLS.has(name)) {
      const pos = ID_CALLS.get(name), i = parent.arguments.indexOf(node);
      if (pos === null || pos.includes(i)) return true;
    }
  }
  // the second argument of h('tag', 'class') is never used, but `h(tag, { class })` covered above
  return false;
}

const keyOfTemplate = (node) => {
  let n = 0;
  return node.quasis.map((q, i) => q.value.cooked + (i < node.expressions.length ? `{${++n}}` : '')).join('');
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(m?js)$/.test(name)) out.push(p);
  }
  return out;
}

const found = new Map(); // key -> [file:line]
for (const src of SOURCES) {
  for (const file of walk(path.join(root, src))) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (SKIP_FILES.some((re) => re.test(rel))) continue;
    const code = readFileSync(file, 'utf8');
    let ast;
    try { ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true }); }
    catch (err) { console.error(`skip ${rel}: ${err.message}`); continue; }
    fullAncestor(ast, (node, _state, ancestors) => {
      let key = null;
      if (node.type === 'Literal' && typeof node.value === 'string') key = node.value;
      else if (node.type === 'TemplateLiteral' && ancestors[ancestors.length - 2]?.type !== 'TaggedTemplateExpression') key = keyOfTemplate(node);
      if (key == null) return;
      // a template's parts are separate nodes; only the whole literal counts
      if (node.type === 'Literal' && ancestors[ancestors.length - 2]?.type === 'TemplateLiteral') return;
      key = key.replace(/\s+/g, ' ').trim();
      const words = key.replace(/\{\d+\}/g, '');
      if (!looksLikeWords(words) || !/[A-Za-z]{2}/.test(words)) return;
      if (!/\{\w+\}/.test(key) && classList(key)) return;
      if (excluded(node, ancestors)) return;
      if (!found.has(key)) found.set(key, []);
      found.get(key).push(`${rel}:${node.loc.start.line}`);
    });
  }
}

const keys = [...found.keys()];
mkdirSync(path.join(root, 'app/i18n'), { recursive: true });
writeFileSync(path.join(root, 'app/i18n/strings.json'), JSON.stringify(keys, null, 1) + '\n');
if (report) for (const k of keys) console.log(`${JSON.stringify(k)}  ${found.get(k).slice(0, 2).join(' ')}`);
console.error(`${keys.length} interface strings → app/i18n/strings.json`);
