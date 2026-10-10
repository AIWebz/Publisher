// Folio document model — the single source of truth for a publication.
// Everything here is plain JSON-serialisable data plus pure helpers. Lengths are CSS px at 96 dpi,
// font sizes are points, angles are degrees, opacity is 0..1.
// See ARCHITECTURE.md for the full schema.

import { defaultTheme, COLOR_SCHEMES, FONT_SCHEMES } from './theme.js';

export const FORMAT = 'folio-publication';
export const VERSION = 2;

let idCounter = 0;
/** Unique id. Ids only need to be unique within a document. */
export function uid(prefix = 'e') {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 7)}${idCounter.toString(36)}`;
}

export const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

// ---------------------------------------------------------------------------------------------
// Page sizes (px at 96 dpi; portrait orientation unless naturally landscape)
// ---------------------------------------------------------------------------------------------
const IN = 96, MM = 96 / 25.4;
export const PAGE_SIZES = {
  letter:       { name: 'Letter',              w: 8.5 * IN,  h: 11 * IN },
  legal:        { name: 'Legal',               w: 8.5 * IN,  h: 14 * IN },
  tabloid:      { name: 'Tabloid 11 × 17 in',  w: 11 * IN,   h: 17 * IN },
  halfLetter:   { name: 'Half Letter',         w: 5.5 * IN,  h: 8.5 * IN },
  a3:           { name: 'A3',                  w: 297 * MM,  h: 420 * MM },
  a4:           { name: 'A4',                  w: 210 * MM,  h: 297 * MM },
  a5:           { name: 'A5',                  w: 148 * MM,  h: 210 * MM },
  a6:           { name: 'A6',                  w: 105 * MM,  h: 148 * MM },
  poster18x24:  { name: 'Poster 18 × 24 in',   w: 18 * IN,   h: 24 * IN },
  card5x7:      { name: 'Card 5 × 7 in',       w: 5 * IN,    h: 7 * IN },
  card4x6:      { name: 'Card 4 × 6 in',       w: 4 * IN,    h: 6 * IN },
  postcard:     { name: 'Postcard 6 × 4 in',   w: 6 * IN,    h: 4 * IN },
  businessCard: { name: 'Business card 3.5 × 2 in', w: 3.5 * IN, h: 2 * IN },
  businessCardEU: { name: 'Business card 85 × 55 mm', w: 85 * MM, h: 55 * MM },
  square8:      { name: 'Square 8 × 8 in',     w: 8 * IN,    h: 8 * IN },
  envelope10:   { name: 'Envelope #10',        w: 9.5 * IN,  h: 4.125 * IN },
  envelopeDL:   { name: 'Envelope DL',         w: 220 * MM,  h: 110 * MM },
  envelopeC5:   { name: 'Envelope C5',         w: 229 * MM,  h: 162 * MM },
  label2x4:     { name: 'Address label 2 × 4 in', w: 4 * IN, h: 2 * IN },
  label1x2_63:  { name: 'Address label 1 × 2⅝ in', w: 2.625 * IN, h: 1 * IN },
  certificate:  { name: 'Certificate 11 × 8.5 in', w: 11 * IN, h: 8.5 * IN },
  menuTall:     { name: 'Menu 8.5 × 14 in',    w: 8.5 * IN,  h: 14 * IN }
};

/** Find the PAGE_SIZES key matching w×h in either orientation (±1px), or null. */
export function matchPageSize(w, h) {
  for (const [k, s] of Object.entries(PAGE_SIZES)) {
    if ((Math.abs(s.w - w) < 1 && Math.abs(s.h - h) < 1) || (Math.abs(s.w - h) < 1 && Math.abs(s.h - w) < 1)) return k;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------------------------
export const NO_FILL = Object.freeze({ type: 'none' });
export const DEFAULT_SHADOW = Object.freeze({ enabled: false, x: 3, y: 3, blur: 6, color: '#000000', opacity: 0.3 });
export const DEFAULT_TEXT_STYLE = Object.freeze({
  font: '@body', size: 12, color: '@ink', bold: false, italic: false, underline: false, caps: false,
  letterSpacing: 0, lineHeight: 1.25, align: 'left', spaceBefore: 0, spaceAfter: 0
});

const BASE = () => ({ id: uid('e'), type: 'shape', name: '', x: 0, y: 0, w: 100, h: 100, rot: 0, opacity: 1, locked: false, hidden: false, wrap: 'none' });

const TYPE_DEFAULTS = {
  text: () => ({
    storyId: null, next: null, padding: { top: 4, right: 4, bottom: 4, left: 4 }, valign: 'top', columns: 1, colGap: 12,
    autofit: 'none', fill: { ...NO_FILL }, stroke: { color: '@ink', width: 0, dash: 'solid' }, radius: 0,
    shadow: { ...DEFAULT_SHADOW }, style: { ...DEFAULT_TEXT_STYLE }
  }),
  image: () => ({
    assetId: null, content: null, fit: 'fill', fill: { ...NO_FILL }, stroke: { color: '@ink', width: 0, dash: 'solid' },
    radius: 0, shadow: { ...DEFAULT_SHADOW }, flipH: false, flipV: false
  }),
  shape: () => ({
    shape: 'rect', sides: 6, points: 5, inner: 0.45, radius: 0, fill: { type: 'solid', color: '@accent' },
    stroke: { color: '@ink', width: 0, dash: 'solid' }, shadow: { ...DEFAULT_SHADOW }, flipH: false, flipV: false
  }),
  line: () => ({
    h: 12, stroke: { color: '@ink', width: 2, dash: 'solid' }, arrowStart: 'none', arrowEnd: 'none', ornament: 'none',
    shadow: { ...DEFAULT_SHADOW }
  }),
  table: () => ({
    cols: [], rows: [], cells: [], border: { color: '@ink', width: 1, dash: 'solid' }, fill: { ...NO_FILL },
    style: { ...DEFAULT_TEXT_STYLE, size: 10 }, headerRow: false, banded: false
  }),
  group: () => ({ children: [] })
};

export const ELEMENT_TYPES = Object.keys(TYPE_DEFAULTS);
export const SHAPE_KINDS = ['rect', 'roundRect', 'ellipse', 'triangle', 'rightTriangle', 'diamond', 'pentagon', 'hexagon',
  'octagon', 'polygon', 'star', 'arrowRight', 'arrowLeft', 'arrowUp', 'arrowDown', 'chevron', 'parallelogram', 'trapezoid',
  'heart', 'cross', 'ribbon', 'speech', 'burst', 'frame'];

/** Create an element of `type` with defaults merged with `props` (shallow; nested objects replace). */
export function createElement(type, props = {}) {
  if (!TYPE_DEFAULTS[type]) throw new Error(`Unknown element type: ${type}`);
  const el = Object.assign(BASE(), TYPE_DEFAULTS[type](), { type }, clone(props));
  if (!props.id) el.id = uid('e');
  if (type === 'text' && props.style) el.style = { ...DEFAULT_TEXT_STYLE, ...props.style };
  if (type === 'table' && props.style) el.style = { ...DEFAULT_TEXT_STYLE, size: 10, ...props.style };
  if (type === 'group') el.children = (props.children || []).map((c) => c);
  return el;
}

export function createStory(html = '<p></p>') {
  return { id: uid('s'), html };
}

/**
 * Create a text frame plus its story in `doc`. `html` is rich story HTML (see ARCHITECTURE.md);
 * plain text is wrapped in <p>. Returns the frame element (not yet placed on a page).
 */
export function createTextFrame(doc, props = {}, html = '<p></p>') {
  const story = createStory(normalizeStoryHtml(html));
  doc.stories[story.id] = story;
  return createElement('text', { ...props, storyId: story.id });
}

/** Ensure story html has block structure: wrap bare inline content in <p>. */
export function normalizeStoryHtml(html) {
  const s = String(html ?? '').trim();
  if (!s) return '<p></p>';
  if (/^<(p|ul|ol|h[1-6]|div|blockquote)[\s>]/i.test(s)) return s;
  return `<p>${s}</p>`;
}

/** Add an image asset from a data URL. Returns the asset id. */
export function addAsset(doc, { name = 'image', mime = 'image/png', data, width = 0, height = 0 }) {
  for (const a of Object.values(doc.assets)) if (a.data === data) return a.id;
  const id = uid('a');
  doc.assets[id] = { id, name, mime, data, width, height };
  return id;
}

export function createMaster(name = 'A', props = {}) {
  return { id: uid('m'), name, background: null, elements: [], ...props };
}

export function createPage(doc, props = {}) {
  return {
    id: uid('p'),
    masterId: doc && doc.masters && doc.masters[0] ? doc.masters[0].id : null,
    background: null,
    guides: { v: [], h: [] },
    elements: [],
    ...props
  };
}

/**
 * Create a new publication. opts: { title, width, height, size (PAGE_SIZES key), orientation,
 * units, margins, columns, facing, schemeId, fontSchemeId, pages (count) }
 */
export function createDocument(opts = {}) {
  let w = opts.width, h = opts.height;
  if (!w || !h) {
    const s = PAGE_SIZES[opts.size || 'letter'] || PAGE_SIZES.letter;
    w = s.w; h = s.h;
  }
  if (opts.orientation === 'landscape' && w < h) [w, h] = [h, w];
  if (opts.orientation === 'portrait' && w > h) [w, h] = [h, w];
  const m = opts.margins ?? Math.round(Math.min(w, h) * 0.0625);
  const doc = {
    format: FORMAT,
    version: VERSION,
    id: uid('d'),
    title: opts.title || 'Untitled publication',
    setup: {
      width: Math.round(w * 100) / 100,
      height: Math.round(h * 100) / 100,
      units: opts.units || 'in',
      margins: typeof m === 'number' ? { top: m, right: m, bottom: m, left: m } : { ...m },
      columns: { count: 1, gutter: 24, ...(opts.columns || {}) },
      facing: !!opts.facing,
      bleed: opts.bleed ?? 0,
      grid: { size: 24, ...(opts.grid || {}) }
    },
    theme: defaultTheme(opts.schemeId || 'ivory', opts.fontSchemeId || 'classic'),
    masters: [],
    pages: [],
    stories: {},
    assets: {},
    data: null,
    meta: { author: '', subject: '', keywords: '', comments: '', category: opts.category || '' }
  };
  doc.masters.push(createMaster('A'));
  const n = Math.max(1, opts.pages || 1);
  for (let i = 0; i < n; i++) doc.pages.push(createPage(doc));
  return doc;
}

// ---------------------------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------------------------

/** Depth-first walk of an element list (descends into groups). fn(el, parentList, index, parentGroup) */
export function walkElements(list, fn, parent = null) {
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    if (fn(el, list, i, parent) === false) return false;
    if (el.type === 'group' && el.children && walkElements(el.children, fn, el) === false) return false;
  }
  return true;
}

/** Every element list in the doc: pages then masters. Yields { list, page?, master? } */
export function* elementContainers(doc) {
  for (const page of doc.pages) yield { list: page.elements, page, master: null };
  for (const master of doc.masters) yield { list: master.elements, page: null, master };
}

/** Find an element anywhere. Returns { el, list, index, parent, page, master } or null. */
export function findElement(doc, id) {
  for (const c of elementContainers(doc)) {
    let hit = null;
    walkElements(c.list, (el, list, index, parent) => {
      if (el.id === id) { hit = { el, list, index, parent, page: c.page, master: c.master }; return false; }
      return true;
    });
    if (hit) return hit;
  }
  return null;
}

/** All elements of a type across pages and masters (flattened through groups). */
export function allElements(doc, type = null) {
  const out = [];
  for (const c of elementContainers(doc)) walkElements(c.list, (el) => { if (!type || el.type === type) out.push(el); });
  return out;
}

/** Ordered list of frames in the linked chain containing `frameId` (head first). */
export function getChain(doc, frameId) {
  const frames = allElements(doc, 'text');
  const byId = new Map(frames.map((f) => [f.id, f]));
  const start = byId.get(frameId);
  if (!start) return [];
  // find head: the frame whose `next` chain reaches start and which nobody points to
  const prevOf = new Map();
  for (const f of frames) if (f.next && byId.has(f.next)) prevOf.set(f.next, f.id);
  let head = start;
  const guard = new Set();
  while (prevOf.has(head.id) && !guard.has(head.id)) { guard.add(head.id); head = byId.get(prevOf.get(head.id)); }
  const chain = [];
  const seen = new Set();
  for (let f = head; f && !seen.has(f.id); f = f.next ? byId.get(f.next) : null) { seen.add(f.id); chain.push(f); }
  return chain;
}

/** Page index (0-based) on which an element lives, or -1 (masters / not found). */
export function pageIndexOf(doc, id) {
  const hit = findElement(doc, id);
  return hit && hit.page ? doc.pages.indexOf(hit.page) : -1;
}

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------

/** Axis-aligned bounding box of an element including rotation. */
export function elementBounds(el) {
  if (!el.rot) return { x: el.x, y: el.y, w: el.w, h: el.h };
  const a = (el.rot * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const w = el.w * c + el.h * s, h = el.w * s + el.h * c;
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Union bounds of several elements. */
export function unionBounds(els) {
  if (!els.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const el of els) {
    const b = elementBounds(el);
    x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Recompute a group's x/y/w/h from its children (children are stored in page coordinates). */
export function updateGroupBounds(group) {
  const b = unionBounds(group.children);
  Object.assign(group, { x: b.x, y: b.y, w: b.w, h: b.h, rot: 0 });
  return group;
}

/** Translate an element (and group children) by dx, dy. */
export function translateElement(el, dx, dy) {
  el.x += dx; el.y += dy;
  if (el.type === 'group') for (const c of el.children) translateElement(c, dx, dy);
}

// ---------------------------------------------------------------------------------------------
// Cloning (new ids; duplicates stories so copies edit independently)
// ---------------------------------------------------------------------------------------------

/**
 * Deep-copy elements for paste/duplicate into `targetDoc` (stories/assets copied from `sourceDoc`
 * when the docs differ). Text chains among the copied set are preserved; links to frames outside
 * the set are dropped. Returns the new element list.
 */
export function cloneElements(sourceDoc, els, targetDoc = sourceDoc) {
  const idMap = new Map();
  const storyMap = new Map();
  const copy = (el) => {
    const n = clone(el);
    n.id = uid('e');
    idMap.set(el.id, n.id);
    if (n.type === 'group') n.children = el.children.map(copy);
    if (n.type === 'text' && el.storyId) {
      if (!storyMap.has(el.storyId)) {
        const src = sourceDoc.stories[el.storyId];
        const s = createStory(src ? src.html : '<p></p>');
        targetDoc.stories[s.id] = s;
        storyMap.set(el.storyId, s.id);
      }
      n.storyId = storyMap.get(el.storyId);
    }
    if (n.type === 'image' && el.assetId && sourceDoc !== targetDoc && sourceDoc.assets[el.assetId]) {
      n.assetId = addAsset(targetDoc, sourceDoc.assets[el.assetId]);
    }
    return n;
  };
  const out = els.map(copy);
  // remap or drop text chain links
  for (const root of out) walkElements([root], (n) => {
    if (n.type === 'text' && n.next) n.next = idMap.get(n.next) || null;
  });
  // a story shared by a chain where only a middle frame was copied would duplicate text; that's acceptable
  return out;
}

// ---------------------------------------------------------------------------------------------
// Serialisation, normalisation and migration
// ---------------------------------------------------------------------------------------------

export function serialize(doc) {
  return JSON.stringify(doc);
}

/** Parse JSON text into a normalised document (throws on invalid input). */
export function parseDocument(text) {
  let raw;
  try { raw = JSON.parse(text); } catch (e) { throw new Error('The file is not valid JSON.'); }
  return normalizeDocument(raw);
}

const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);

/** Fill in defaults, migrate old versions and repair structure. Returns a new document object. */
export function normalizeDocument(raw) {
  if (!isObj(raw)) throw new Error('Not a Folio publication.');
  if (raw.format !== FORMAT && Array.isArray(raw.pages) && (raw.version === 1 || raw.w || raw.schemeName)) return migrateV1(raw);
  if (raw.format !== FORMAT || !Array.isArray(raw.pages)) throw new Error('Not a Folio publication.');
  if (raw.version > VERSION) throw new Error('This publication was made with a newer version of Folio.');
  const base = createDocument({ width: raw.setup?.width, height: raw.setup?.height });
  const doc = {
    ...base,
    ...clone(raw),
    setup: { ...base.setup, ...(raw.setup || {}), margins: { ...base.setup.margins, ...(raw.setup?.margins || {}) },
      columns: { ...base.setup.columns, ...(raw.setup?.columns || {}) }, grid: { ...base.setup.grid, ...(raw.setup?.grid || {}) } },
    theme: { ...base.theme, ...(raw.theme || {}), colors: { ...base.theme.colors, ...(raw.theme?.colors || {}) },
      fonts: { ...base.theme.fonts, ...(raw.theme?.fonts || {}) } },
    meta: { ...base.meta, ...(raw.meta || {}) },
    stories: isObj(raw.stories) ? clone(raw.stories) : {},
    assets: isObj(raw.assets) ? clone(raw.assets) : {},
    data: raw.data ? clone(raw.data) : null
  };
  doc.masters = (Array.isArray(raw.masters) && raw.masters.length ? raw.masters : base.masters).map((m) => ({
    ...createMaster(m.name || 'A'), ...clone(m), elements: normalizeList(doc, m.elements)
  }));
  const masterIds = new Set(doc.masters.map((m) => m.id));
  doc.pages = (raw.pages.length ? raw.pages : [createPage(doc)]).map((p) => ({
    ...createPage(doc), ...clone(p),
    masterId: p.masterId === null ? null : masterIds.has(p.masterId) ? p.masterId : doc.masters[0].id,
    guides: { v: [], h: [], ...(p.guides || {}) },
    elements: normalizeList(doc, p.elements)
  }));
  // every text frame needs a story
  for (const f of allElements(doc, 'text')) {
    if (!f.storyId || !doc.stories[f.storyId]) {
      const s = createStory('<p></p>');
      doc.stories[s.id] = s;
      f.storyId = s.id;
    }
  }
  return doc;
}

function normalizeList(doc, list) {
  if (!Array.isArray(list)) return [];
  return list.filter((e) => isObj(e) && TYPE_DEFAULTS[e.type]).map((e) => normalizeElement(doc, e));
}

function normalizeElement(doc, e) {
  const n = Object.assign(createElement(e.type), clone(e));
  if (!n.id) n.id = uid('e');
  if (n.type === 'text') n.style = { ...DEFAULT_TEXT_STYLE, ...(e.style || {}) };
  if (n.type === 'group') n.children = normalizeList(doc, e.children);
  for (const k of ['x', 'y', 'w', 'h', 'rot', 'opacity']) if (!Number.isFinite(+n[k])) n[k] = createElement(n.type)[k];
  return n;
}

// Version 1 (single-file app) -> version 2
function migrateV1(old) {
  const doc = createDocument({ width: +old.w || 816, height: +old.h || 1056, title: old.title,
    schemeId: COLOR_SCHEMES[old.schemeName] ? old.schemeName : 'ivory',
    fontSchemeId: FONT_SCHEMES[old.fontScheme] ? old.fontScheme : 'classic' });
  if (old.scheme) Object.assign(doc.theme.colors, old.scheme);
  const fill = (c) => (!c || c === 'transparent' ? { type: 'none' } : { type: 'solid', color: c });
  const stroke = (o) => ({ color: o.stroke || '@ink', width: +o.strokeWidth || 0, dash: 'solid' });
  doc.pages = (old.pages || []).map((p) => {
    const page = createPage(doc, { background: p.bg && p.bg !== '@paper' ? { type: 'solid', color: p.bg } : null });
    for (const e of p.elements || []) {
      const common = { x: +e.x || 0, y: +e.y || 0, w: +e.w || 10, h: +e.h || 10, rot: +e.rot || 0, opacity: e.opacity ?? 1 };
      if (e.type === 'text') {
        const pad = +e.padding || 4;
        page.elements.push(createTextFrame(doc, {
          ...common, valign: e.valign || 'top', fill: fill(e.fill), stroke: stroke(e), radius: +e.radius || 0,
          padding: { top: pad, right: pad, bottom: pad, left: pad },
          style: { font: e.font || '@body', size: +e.size || 12, color: e.color || '@ink', bold: !!e.bold, italic: !!e.italic,
            underline: !!e.underline, caps: !!e.caps, letterSpacing: +e.letterSpacing || 0, lineHeight: +e.lineHeight || 1.35,
            align: e.align || 'left', spaceBefore: 0, spaceAfter: 0 }
        }, `<p>${e.html || ''}</p>`));
      } else if (e.type === 'image') {
        const assetId = e.src ? addAsset(doc, { name: 'picture', mime: (/^data:([^;]+)/.exec(e.src) || [])[1] || 'image/png', data: e.src }) : null;
        page.elements.push(createElement('image', { ...common, assetId, fit: e.fit === 'contain' ? 'fit' : e.fit === 'fill' ? 'stretch' : 'fill',
          stroke: stroke(e), radius: +e.radius || 0, fill: fill(e.fill) }));
      } else if (e.type === 'line') {
        page.elements.push(createElement('line', { ...common, stroke: { color: e.stroke || '@ink', width: +e.strokeWidth || 1, dash: 'solid' },
          ornament: e.cap === 'diamond' ? 'diamond' : 'none' }));
      } else if (['rect', 'ellipse', 'triangle', 'star'].includes(e.type)) {
        page.elements.push(createElement('shape', { ...common, shape: e.type === 'rect' ? (e.radius ? 'roundRect' : 'rect') : e.type,
          radius: +e.radius || 0, fill: fill(e.fill), stroke: stroke(e) }));
      }
    }
    return page;
  });
  if (!doc.pages.length) doc.pages.push(createPage(doc));
  return doc;
}

/**
 * Structural validation. Returns a list of { level: 'error'|'warning', message, elementId?, pageIndex? }.
 * Used before saving and by preflight.
 */
export function validateDocument(doc) {
  const issues = [];
  const ids = new Set();
  doc.pages.forEach((p, pi) => walkElements(p.elements, (el) => {
    if (ids.has(el.id)) issues.push({ level: 'error', message: `Duplicate object id ${el.id}`, elementId: el.id, pageIndex: pi });
    ids.add(el.id);
    if (el.type === 'text' && !doc.stories[el.storyId]) issues.push({ level: 'error', message: 'Text frame has no story', elementId: el.id, pageIndex: pi });
    if (el.type === 'image' && el.assetId && !doc.assets[el.assetId]) issues.push({ level: 'warning', message: 'Picture is missing its image data', elementId: el.id, pageIndex: pi });
  }));
  return issues;
}

/** Remove assets and stories nothing references (call before saving). Mutates and returns doc. */
export function pruneUnused(doc) {
  const usedAssets = new Set(), usedStories = new Set();
  for (const el of allElements(doc)) {
    if (el.type === 'image' && el.assetId) usedAssets.add(el.assetId);
    if (el.type === 'text' && el.storyId) usedStories.add(el.storyId);
  }
  for (const bg of [...doc.pages, ...doc.masters].map((p) => p.background)) if (bg && bg.type === 'image' && bg.assetId) usedAssets.add(bg.assetId);
  for (const id of Object.keys(doc.assets)) if (!usedAssets.has(id)) delete doc.assets[id];
  for (const id of Object.keys(doc.stories)) if (!usedStories.has(id)) delete doc.stories[id];
  return doc;
}
