// Text flow: lays story HTML out through chains of linked text frames, with columns, overflow
// detection and autofit (shrink / grow).
//
// Contract (ARCHITECTURE.md):
//   layoutStories(doc, opts) -> Map<frameId, { html, overflow, scale, contentHeight, overflowChars }>
//     opts.resolveField(name, frame) -> string|null   value for merge/page fields in that frame
//     opts.frames (optional) restricts layout to the chains containing these frames (ids or elements)
//   For each chain of linked text frames (model.getChain) the story HTML is flowed through the
//   frames in order. `html` is the fragment shown in that frame, `overflow` is true on the last
//   frame of a chain whose text does not fit, `scale` is the autofit 'shrink' zoom (1 = none; the
//   renderer applies it with applyLayoutScale), `contentHeight` is the frame height (px, padding
//   included) needed to show all the text that reaches the frame (used by autofit 'grow').
//   invalidateLayout() clears the cache (it is called automatically when web fonts finish loading;
//   subscribe with onLayoutInvalidated to re-render).
//
// Measurement is DOM based: an off-screen multi-column container with the frame's content size,
// text style and columns (column-fill: auto, fixed height) receives the remaining story; content
// pushed past the frame's last column does not fit. Blocks are split at line granularity: the
// first non-fitting character starts the continuation. Split blocks keep their attributes on both
// sides (ancestor inline elements are cloned by Range.extractContents); the continuation carries
// data-cont (no first-line indent, no space before, no list marker; ordered lists continue through
// the start attribute) and the first part carries data-split (no space after; justified last line
// when the paragraph is justified). mergeFragments() inverts the split exactly.
//
// Without a DOM (node), layoutStories puts the whole story in the head frame and reports no
// overflow: it cannot measure text there.

import { allElements, getChain } from '../../core/model.js';
import { resolveFont, resolveColor } from '../../core/theme.js';
import { listFields, renderFields } from './fields.js';
import { parseTree, serializeTree, getAttr, setAttr } from './html.js';

/** Smallest autofit 'shrink' scale. */
export const MIN_SCALE = 0.3;

/** Default paragraph and list CSS for flowed text; injected once into the document (ensureFlowStyles). */
export const FLOW_CSS = [
  '.tx-flow{white-space:pre-wrap;overflow-wrap:break-word;orphans:1;widows:1;box-sizing:content-box}',
  '.tx-flow p,.tx-flow li{margin:var(--space-before,0px) 0 var(--space-after,0px) 0;padding:0}',
  '.tx-flow ul,.tx-flow ol{margin:0;padding:0 0 0 1.5em}',
  '.tx-flow sub,.tx-flow sup{line-height:0}',
  '.tx-flow p[data-cont],.tx-flow li[data-cont]{text-indent:0!important;margin-top:0!important}',
  '.tx-flow ul[data-cont],.tx-flow ol[data-cont]{margin-top:0!important}',
  '.tx-flow li[data-cont]{list-style-type:none!important}',
  '.tx-flow [data-split]{margin-bottom:0!important}',
  '.tx-flow [data-split="justify"]{text-align-last:justify}',
  '.tx-flow .field{white-space:nowrap}'
].join('\n');

const THEME_KEYS = ['paper', 'ink', 'accent', 'accent2', 'muted', 'light'];
const CACHE_MAX = 400;
const cache = new Map();
const listeners = new Set();
let host = null;
let fontsHooked = false;

const hasDOM = () => typeof document !== 'undefined' && typeof document.createRange === 'function' && !!document.documentElement;
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * CSS custom properties for a document's theme (--folio-paper … --folio-light, --folio-heading,
 * --folio-body). Rich text may reference them (var(--folio-accent)); apply them to the page
 * container (and they are applied to the measuring box).
 * @param {object} doc
 * @returns {Record<string, string>}
 */
export function themeCSSVars(doc) {
  const vars = {};
  for (const k of THEME_KEYS) vars[`--folio-${k}`] = resolveColor(doc, `@${k}`);
  vars['--folio-heading'] = resolveFont(doc, '@heading');
  vars['--folio-body'] = resolveFont(doc, '@body');
  return vars;
}

/**
 * CSS declarations (property -> value, kebab-case) for a frame's default text style. Matches the
 * renderer's text style for the .tx-flow element.
 * @param {object} doc
 * @param {object} s frame.style
 * @returns {Record<string, string>}
 */
export function frameTextCSS(doc, s = {}) {
  return {
    'font-family': resolveFont(doc, s.font),
    'font-size': `${s.size || 12}pt`,
    color: resolveColor(doc, s.color || '@ink'),
    'font-weight': s.bold ? '700' : '400',
    'font-style': s.italic ? 'italic' : 'normal',
    'text-decoration': s.underline ? 'underline' : 'none',
    'text-transform': s.caps ? 'uppercase' : 'none',
    'letter-spacing': `${s.letterSpacing || 0}px`,
    'line-height': String(s.lineHeight || 1.25),
    'text-align': s.align || 'left',
    '--space-before': `${r2(s.spaceBefore || 0)}px`,
    '--space-after': `${r2(s.spaceAfter || 0)}px`
  };
}

/** Inject FLOW_CSS into the document once (no-op without a DOM). */
export function ensureFlowStyles() {
  if (!hasDOM() || document.getElementById('folio-text-flow-css')) return;
  const st = document.createElement('style');
  st.id = 'folio-text-flow-css';
  st.textContent = FLOW_CSS;
  (document.head || document.documentElement).appendChild(st);
}

/**
 * Apply an autofit scale to a rendered .tx-flow element (CSS zoom). Percentage sizes resolve
 * against the frame under standard CSS zoom, so width/height stay as they are.
 * @param {HTMLElement} flow
 * @param {number} scale
 */
export function applyLayoutScale(flow, scale) {
  flow.style.zoom = scale && scale !== 1 ? String(scale) : '';
}

/** Clear the layout cache (call after fonts load or when measurement CSS changes). */
export function invalidateLayout() {
  cache.clear();
}

/**
 * Subscribe to automatic invalidations (web fonts finished loading). Returns an unsubscribe function.
 * @param {() => void} fn
 * @returns {() => void}
 */
export function onLayoutInvalidated(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function hookFonts() {
  if (fontsHooked || !hasDOM() || !document.fonts) return;
  fontsHooked = true;
  const fire = () => {
    invalidateLayout();
    for (const fn of [...listeners]) { try { fn(); } catch (err) { console.error(err); } }
  };
  if (typeof document.fonts.addEventListener === 'function') document.fonts.addEventListener('loadingdone', fire);
  if (document.fonts.ready && document.fonts.status !== 'loaded') document.fonts.ready.then(fire, () => {});
}

function getHost() {
  if (host && host.isConnected) return host;
  ensureFlowStyles();
  host = document.createElement('div');
  host.className = 'folio-text-measure';
  host.setAttribute('aria-hidden', 'true');
  const s = host.style;
  s.position = 'fixed'; s.left = '-100000px'; s.top = '0'; s.width = '0'; s.height = '0';
  s.overflow = 'visible'; s.visibility = 'hidden'; s.pointerEvents = 'none'; s.contain = 'layout style';
  (document.body || document.documentElement).appendChild(host);
  hookFonts();
  return host;
}

// ---------------------------------------------------------------------------------------------
// Frame geometry and measuring containers
// ---------------------------------------------------------------------------------------------

function geometry(frame) {
  const p = frame.padding || { top: 4, right: 4, bottom: 4, left: 4 };
  const cols = Math.max(1, Math.round(frame.columns || 1));
  const gap = cols > 1 ? Math.max(0, +(frame.colGap ?? 12) || 0) : 0;
  return {
    cw: Math.max(1, (+frame.w || 0) - (+p.left || 0) - (+p.right || 0)),
    // +1.5 px tolerance: a line that fits within sub-pixel rounding is not overflow
    ch: Math.max(0, (+frame.h || 0) - (+p.top || 0) - (+p.bottom || 0) + 1.5),
    padV: (+p.top || 0) + (+p.bottom || 0),
    cols,
    gap
  };
}

function mount(doc, frame, scale = 1) {
  const g = geometry(frame);
  const box = document.createElement('div');
  const bs = box.style;
  bs.position = 'absolute'; bs.left = '0'; bs.top = '0'; bs.width = `${g.cw}px`; bs.height = `${g.ch}px`;
  for (const [k, v] of Object.entries(themeCSSVars(doc))) bs.setProperty(k, v);
  const flow = document.createElement('div');
  flow.className = 'tx-flow';
  const fs = flow.style;
  for (const [k, v] of Object.entries(frameTextCSS(doc, frame.style || {}))) fs.setProperty(k, v);
  fs.margin = '0'; fs.padding = '0'; fs.border = '0'; fs.flex = 'none';
  // single-column frames get a huge gap so overflow columns are far from the frame
  const gapCss = g.cols > 1 ? g.gap : 2 * g.cw + 200;
  fs.columnCount = String(g.cols);
  fs.columnGap = `${gapCss}px`;
  fs.columnFill = 'auto';
  fs.width = `${g.cw / scale}px`;
  fs.height = `${g.ch / scale}px`;
  if (scale !== 1) fs.zoom = String(scale);
  box.appendChild(flow);
  getHost().appendChild(box);
  // the visual gap: px lengths on a zoomed element scale with it
  return { box, flow, g, scale, gapVis: gapCss * scale };
}

function unmount(m) {
  m.box.remove();
}

// ---------------------------------------------------------------------------------------------
// Fit tests
// ---------------------------------------------------------------------------------------------

function makeFit(m) {
  const b = m.box.getBoundingClientRect();
  const xLimit = b.left + m.g.cw + m.gapVis / 2;
  const range = document.createRange();
  // glyph boxes can be taller than the line box (display fonts): only a line far taller than the frame fails
  const rectFits = (r) => (r.left + r.right) / 2 < xLimit && !(r.height > m.g.ch * 1.6 + 2);
  const pick = (rects) => {
    if (!rects || !rects.length) return null;
    for (const r of rects) if (r.width > 0 || r.height > 0) return r;
    return rects[0];
  };
  /** true/false, or undefined when the position has no geometry */
  const at = (pos) => {
    if (pos.el) range.selectNode(pos.el);
    else { range.setStart(pos.node, pos.offset); range.setEnd(pos.node, pos.offset + pos.len); }
    const r = pick(range.getClientRects());
    return r ? rectFits(r) : undefined;
  };
  const element = (el) => {
    const rects = el.getClientRects();
    if (!rects.length) return true;
    return rectFits(rects[rects.length - 1]);
  };
  return { at, element };
}

const isAtom = (n) => n.nodeType === 1 && (n.nodeName === 'BR' || n.nodeName === 'IMG' || (n.classList && n.classList.contains('field')) ||
  n.getAttribute('contenteditable') === 'false');

/** Character / atom positions inside a block, in document order. */
function positions(block) {
  const out = [];
  const walk = (node) => {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) {
        const d = c.data;
        for (let i = 0; i < d.length; i++) {
          const code = d.charCodeAt(i);
          const pair = code >= 0xd800 && code <= 0xdbff && i + 1 < d.length;
          out.push({ node: c, offset: i, len: pair ? 2 : 1 });
          if (pair) i++;
        }
      } else if (c.nodeType === 1) {
        if (isAtom(c)) out.push({ el: c });
        else walk(c);
      }
    }
  };
  walk(block);
  return out;
}

/** Evaluate fit at index i; positions without geometry take the value of the previous one. */
function fitIndex(fit, P, i) {
  for (let j = i; j >= 0; j--) { const v = fit.at(P[j]); if (v !== undefined) return v; }
  for (let j = i + 1; j < P.length; j++) { const v = fit.at(P[j]); if (v !== undefined) return v; }
  return true;
}

/** Blocks of a flow container in order: top-level paragraphs and list items. */
function blocksOf(flow) {
  const out = [];
  for (let c = flow.firstElementChild; c; c = c.nextElementSibling) {
    if (c.nodeName === 'UL' || c.nodeName === 'OL') {
      for (let li = c.firstElementChild; li; li = li.nextElementSibling) out.push(li);
    } else out.push(c);
  }
  return out;
}

function blockFits(fit, block) {
  const P = positions(block);
  if (!P.length) return fit.element(block);
  return fitIndex(fit, P, P.length - 1);
}

/**
 * Find where the content of a mounted flow stops fitting.
 * @returns {null | { block: Element, index: number, P: Array }} null when everything fits;
 *   index 0 means the whole block moves on.
 */
function findSplit(m) {
  const fit = makeFit(m);
  const blocks = blocksOf(m.flow);
  if (!blocks.length) return null;
  if (blockFits(fit, blocks[blocks.length - 1])) return null;
  // first block that does not fit completely (fit is monotonic in document order)
  let lo = 0, hi = blocks.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (blockFits(fit, blocks[mid])) lo = mid + 1; else hi = mid;
  }
  const block = blocks[lo];
  const P = positions(block);
  if (!P.length) return { block, index: 0, P };
  let a = 0, b = P.length - 1;
  while (a < b) {
    const mid = (a + b) >> 1;
    if (fitIndex(fit, P, mid)) a = mid + 1; else b = mid;
  }
  return { block, index: a, P };
}

// ---------------------------------------------------------------------------------------------
// Splitting
// ---------------------------------------------------------------------------------------------

function hasContent(node) {
  if (node.nodeType === 3) return node.data.length > 0;
  if (node.nodeType !== 1) return false;
  if (isAtom(node)) return true;
  for (let c = node.firstChild; c; c = c.nextSibling) if (hasContent(c)) return true;
  return false;
}

/** Remove empty text nodes and empty inline elements along the trailing (or leading) edge. */
function pruneEdge(block, trailing) {
  let node = trailing ? block.lastChild : block.firstChild;
  while (node) {
    const next = trailing ? node.previousSibling : node.nextSibling;
    if (hasContent(node)) {
      if (node.nodeType === 1 && !isAtom(node)) pruneEdge(node, trailing);
      return;
    }
    node.remove();
    node = next;
  }
}

/** Split `block` at position P[index] (index > 0). Returns the continuation block. */
function splitBlockAt(block, pos) {
  const range = document.createRange();
  if (pos.el) range.setStartBefore(pos.el); else range.setStart(pos.node, pos.offset);
  range.setEnd(block, block.childNodes.length);
  const frag = range.extractContents();
  const cont = block.cloneNode(false);
  cont.appendChild(frag);
  pruneEdge(block, true);
  pruneEdge(cont, false);
  cont.setAttribute('data-cont', '');
  const align = getComputedStyle(block).textAlign;
  block.setAttribute('data-split', align === 'justify' ? 'justify' : '');
  block.after(cont);
  return cont;
}

/**
 * Detach everything from `startBlock` on (a top-level block or a list item) from the flow and
 * return it as a node list. A list split in the middle continues as a cloned list (data-cont,
 * start number kept for ordered lists).
 */
function detachFrom(flow, startBlock) {
  const rest = [];
  let top = startBlock;
  if (startBlock.nodeName === 'LI' && startBlock.parentNode && startBlock.parentNode !== flow) {
    const list = startBlock.parentNode;
    const items = [...list.children];
    const idx = items.indexOf(startBlock);
    if (idx > 0) {
      const cont = list.cloneNode(false);
      cont.setAttribute('data-cont', '');
      if (list.nodeName === 'OL') {
        // every <li> advances the list counter; a continuation item shares the number of the item it continues
        const start = parseInt(list.getAttribute('start') || '1', 10) || 1;
        cont.setAttribute('start', String(start + idx - (startBlock.hasAttribute('data-cont') ? 1 : 0)));
      }
      for (const li of items.slice(idx)) cont.appendChild(li);
      rest.push(cont);
      top = list.nextSibling;
    } else {
      top = list;
    }
  }
  while (top) {
    const next = top.nextSibling;
    rest.push(top);
    top.remove();
    top = next;
  }
  return rest;
}

// ---------------------------------------------------------------------------------------------
// Layout of one chain
// ---------------------------------------------------------------------------------------------

function nodesFromHtml(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  const out = [];
  let loose = null;
  for (const n of [...t.content.childNodes]) {
    const block = n.nodeType === 1 && /^(P|UL|OL|DIV|H[1-6]|BLOCKQUOTE)$/.test(n.nodeName);
    if (block) { loose = null; out.push(n); continue; }
    if (n.nodeType === 3 && !n.data.trim()) continue;
    if (n.nodeType !== 1 && n.nodeType !== 3) continue;
    if (!loose) { loose = document.createElement('p'); out.push(loose); }
    loose.appendChild(n);
  }
  return out;
}

function setFieldValues(nodes, resolve) {
  for (const n of nodes) {
    if (n.nodeType !== 1) continue;
    for (const f of n.querySelectorAll('span.field[data-field]')) {
      const name = f.getAttribute('data-field');
      const v = resolve(name);
      const text = v === null || v === undefined ? `«${name}»` : String(v);
      if (f.textContent !== text) f.textContent = text;
    }
  }
}

function serializeNodes(nodes) {
  let s = '';
  for (const n of nodes) s += n.nodeType === 1 ? n.outerHTML : n.nodeType === 3 ? n.data : '';
  return s;
}

/** Natural height (px, zoom 1) of the content currently in the mounted flow. */
function naturalHeight(m) {
  const fs = m.flow.style;
  const h = fs.height, fill = fs.columnFill;
  fs.height = 'auto';
  fs.columnFill = 'balance';
  const r = m.flow.getBoundingClientRect().height;
  fs.height = h;
  fs.columnFill = fill;
  return r / m.scale;
}

function textLength(nodes) {
  let n = 0;
  for (const x of nodes) n += (x.textContent || '').length;
  return n;
}

function layoutChainDOM(doc, chain, storyHtml, resolveFor) {
  const results = [];
  let remaining = nodesFromHtml(storyHtml);
  const fieldsUsed = /class="[^"]*\bfield\b/.test(storyHtml);
  const single = chain.length === 1;
  for (let i = 0; i < chain.length; i++) {
    const frame = chain[i];
    const last = i === chain.length - 1;
    if (fieldsUsed) setFieldValues(remaining, resolveFor(frame));
    if (!remaining.length) {
      const g = geometry(frame);
      results.push({ html: '', overflow: false, scale: 1, contentHeight: Math.ceil(g.padV), overflowChars: 0 });
      continue;
    }
    let scale = 1;
    let m = mount(doc, frame, 1);
    for (const n of remaining) m.flow.appendChild(n);
    const contentHeight = Math.ceil(naturalHeight(m) + m.g.padV);
    if (single && frame.autofit === 'grow') {
      const html = m.flow.innerHTML;
      unmount(m);
      results.push({ html, overflow: false, scale: 1, contentHeight, overflowChars: 0 });
      remaining = [];
      continue;
    }
    let split = findSplit(m);
    if (single && frame.autofit === 'shrink' && split) {
      // binary search the largest zoom at which everything fits
      const fitsAt = (s) => {
        const t = mount(doc, frame, s);
        for (const n of remaining) t.flow.appendChild(n);
        const ok = findSplit(t) === null;
        unmount(t);
        return ok;
      };
      let lo = MIN_SCALE, hi = 1;
      if (fitsAt(lo)) {
        for (let k = 0; k < 9 && hi - lo > 0.004; k++) {
          const mid = (lo + hi) / 2;
          if (fitsAt(mid)) lo = mid; else hi = mid;
        }
      }
      scale = Math.floor(lo * 1000) / 1000;
      unmount(m);
      m = mount(doc, frame, scale);
      for (const n of remaining) m.flow.appendChild(n);
      split = findSplit(m);
    }
    let rest = [];
    let clipped = false;
    if (split) {
      const { block, index, P } = split;
      let start = index > 0 ? splitBlockAt(block, P[index]) : block;
      // Nothing fits in the last frame: show the first block clipped (as Publisher does) and flag overflow.
      if (last && start === m.flow.firstElementChild) { clipped = true; start = start.nextElementSibling; }
      rest = start ? detachFrom(m.flow, start) : [];
    }
    const html = m.flow.innerHTML;
    unmount(m);
    results.push({ html, overflow: last && (rest.length > 0 || clipped), scale, contentHeight, overflowChars: last ? textLength(rest) : 0 });
    remaining = rest;
  }
  return results;
}

function frameKey(f) {
  return [f.id, f.w, f.h, f.padding, f.columns, f.colGap, f.autofit, f.style];
}

/**
 * Flow every story through its chain of linked frames.
 * @param {object} doc
 * @param {{ resolveField?: (name: string, frame: object) => (string|null), frames?: Array<string|object> }} [opts]
 * @returns {Map<string, { html: string, overflow: boolean, scale: number, contentHeight: number, overflowChars: number }>}
 */
export function layoutStories(doc, opts = {}) {
  const out = new Map();
  const all = allElements(doc, 'text');
  let wanted = null;
  if (opts.frames) wanted = new Set([...opts.frames].map((f) => (typeof f === 'string' ? f : f && f.id)));
  const seen = new Set();
  const dom = hasDOM();
  const resolveFor = (frame) => (name) => (opts.resolveField ? opts.resolveField(name, frame) : null);
  for (const f of all) {
    if (seen.has(f.id)) continue;
    if (wanted && !wanted.has(f.id)) continue;
    const chain = getChain(doc, f.id);
    for (const fr of chain) seen.add(fr.id);
    if (!chain.length) continue;
    const story = doc.stories && doc.stories[chain[0].storyId];
    const html = story ? String(story.html || '') : '';
    const headHtml = renderFields(html, resolveFor(chain[0]));
    if (!dom) {
      chain.forEach((fr, i) => out.set(fr.id, { html: i === 0 ? headHtml : '', overflow: false, scale: 1, contentHeight: 0, overflowChars: 0 }));
      continue;
    }
    const fields = listFields(html);
    const values = fields.length ? chain.map((fr) => fields.map((n) => resolveFor(fr)(n) ?? null)) : null;
    const key = JSON.stringify([html, chain.map(frameKey), values, themeCSSVars(doc)]);
    let res = cache.get(key);
    if (res) {
      cache.delete(key);
      cache.set(key, res);
    } else {
      res = layoutChainDOM(doc, chain, headHtml, resolveFor);
      cache.set(key, res);
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    }
    chain.forEach((fr, i) => out.set(fr.id, { ...res[i] }));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// String-level helpers (node and browser)
// ---------------------------------------------------------------------------------------------

const hasA = (n, name) => n.type === 'el' && n.attrs.some((a) => a.name === name);
const sameAttrs = (a, b) => {
  const strip = (n) => n.attrs.filter((x) => x.name !== 'data-cont' && x.name !== 'data-split' && x.name !== 'start')
    .map((x) => `${x.name}=${x.value}`).sort().join('\u0001');
  return strip(a) === strip(b);
};

/** Append continuation children to a block, rejoining the inline elements split at the seam. */
function joinInline(target, children) {
  if (!children.length) return;
  const last = target.children[target.children.length - 1];
  const first = children[0];
  if (last && first && last.type === 'text' && first.type === 'text') {
    last.text += first.text;
    target.children.push(...children.slice(1));
    return;
  }
  if (last && first && last.type === 'el' && first.type === 'el' && last.tag === first.tag && last.tag !== 'br' &&
      !hasA(last, 'data-field') && sameAttrs(last, first)) {
    joinInline(last, first.children);
    target.children.push(...children.slice(1));
    return;
  }
  target.children.push(...children);
}

function stripFlowAttrs(nodes) {
  for (const n of nodes) {
    if (n.type !== 'el') continue;
    setAttr(n, 'data-cont', null);
    setAttr(n, 'data-split', null);
    if (n.tag === 'span' && /(^|\s)field(\s|$)/.test(getAttr(n, 'class') || '') && getAttr(n, 'data-field')) {
      n.children = [{ type: 'text', text: `«${getAttr(n, 'data-field')}»` }];
      continue;
    }
    stripFlowAttrs(n.children);
  }
}

/**
 * Rejoin the per-frame fragments of a chain (layoutStories html values, in chain order) into story
 * HTML: continued paragraphs and list items are merged back into the block they continue, continued
 * lists into their list, flow attributes are removed and field spans get their «NAME» content back.
 * For a sanitized story s: mergeFragments(fragmentsOf(s)) === s.
 * @param {string[]} fragments
 * @returns {string}
 */
export function mergeFragments(fragments) {
  const out = [];
  for (const html of fragments || []) {
    const nodes = parseTree(html || '').filter((n) => n.type === 'el' || /\S/.test(n.text));
    nodes.forEach((n, i) => {
      const prev = out[out.length - 1];
      if (i === 0 && prev && n.type === 'el' && prev.type === 'el' && hasA(n, 'data-cont') && n.tag === prev.tag) {
        if (n.tag === 'ul' || n.tag === 'ol') {
          const items = n.children.filter((c) => c.type === 'el');
          const lastItem = prev.children.filter((c) => c.type === 'el').pop();
          if (items.length && lastItem && hasA(items[0], 'data-cont')) {
            joinInline(lastItem, items[0].children);
            setAttr(lastItem, 'data-split', null);
            items.shift();
          }
          prev.children.push(...items);
        } else {
          joinInline(prev, n.children);
          setAttr(prev, 'data-split', null);
        }
        return;
      }
      out.push(n);
    });
  }
  stripFlowAttrs(out);
  return serializeTree(out);
}

const TEXT_BLOCKS = new Set(['p', 'li', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre']);

function inlineText(nodes) {
  let s = '';
  for (const n of nodes) s += n.type === 'text' ? n.text : n.tag === 'br' ? '\n' : inlineText(n.children);
  return s;
}

/**
 * Plain text of rich text HTML: blocks (paragraphs, list items) separated by '\n', <br> as '\n'
 * (a trailing <br> in a block adds no line), fields by their current content.
 * @param {string} html
 * @returns {string}
 */
export function getStoryText(html) {
  const lines = [];
  const walk = (nodes) => {
    let loose = null;
    const flush = () => { if (loose !== null) { lines.push(loose); loose = null; } };
    for (const n of nodes) {
      if (n.type === 'el' && TEXT_BLOCKS.has(n.tag)) {
        flush();
        const t = inlineText(n.children);
        lines.push(t.endsWith('\n') ? t.slice(0, -1) : t);
      } else if (n.type === 'el' && (n.tag === 'ul' || n.tag === 'ol')) {
        flush();
        walk(n.children);
      } else {
        const t = n.type === 'text' ? n.text : inlineText([n]);
        if (loose === null && n.type === 'text' && !/\S/.test(t)) continue;
        loose = (loose ?? '') + t;
      }
    }
    flush();
  };
  walk(parseTree(String(html ?? '')));
  return lines.join('\n');
}

/**
 * Number of characters of a frame's story that did not fit (layout result of the chain's last
 * frame), or 0.
 * @param {Map} layout layoutStories result
 * @param {string} frameId
 * @returns {number}
 */
export function countOverflowChars(layout, frameId) {
  const r = layout && layout.get(frameId);
  return r && r.overflow ? r.overflowChars || 0 : 0;
}

