// Rich text editing operations for a contenteditable root (the text frame being edited).
// Every operation works on the current window selection inside `root` and produces markup from
// the story whitelist (ARCHITECTURE.md "Rich text HTML"): <b> <i> <u> <s> <sub> <sup> <a href>,
// <span style> for character properties, block styles on <p>/<li>, <ul>/<ol> lists and field
// spans. Inline operations split the formatting elements at the selection edges up to the block,
// remove the property inside the selection and wrap the selection once, so markup stays minimal.
// A collapsed selection (caret) gets a zero-width space carrying the new formatting, so typing
// continues in it; sanitizeHtml removes the zero-width space on commit.
// Operations return true when they changed the document and keep the selection on the same text.

import { filterStyle, normalizeColor, normalizeFontFamily, cleanHref, sanitizeHtml, LIST_INDENT } from './sanitize.js';
import { fieldSpan } from './fields.js';

const ZWSP = '​';
const BLOCK_RE = /^(P|LI|DIV|H[1-6]|BLOCKQUOTE|PRE)$/;
const FORMAT_TAGS = {
  bold: ['B', 'STRONG'], italic: ['I', 'EM'], underline: ['U'], strike: ['S', 'STRIKE', 'DEL'], sub: ['SUB'], sup: ['SUP'], link: ['A']
};
const TAG_OF = { bold: 'b', italic: 'i', underline: 'u', strike: 's', sub: 'sub', sup: 'sup' };
const THEME_COLORS = ['paper', 'ink', 'accent', 'accent2', 'muted', 'light'];

const isEl = (n) => n && n.nodeType === 1;
const isField = (n) => isEl(n) && (n.classList.contains('field') || n.getAttribute('contenteditable') === 'false');
const isAtom = (n) => isEl(n) && (n.nodeName === 'BR' || n.nodeName === 'IMG' || isField(n));
const isBlock = (n) => isEl(n) && BLOCK_RE.test(n.nodeName) && !n.querySelector('p,li,div,h1,h2,h3,h4,h5,h6,blockquote,pre');
const isList = (n) => isEl(n) && (n.nodeName === 'UL' || n.nodeName === 'OL');

// ---------------------------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------------------------

/**
 * The current selection range if it lies inside `root`, else null.
 * @param {HTMLElement} root
 * @returns {Range|null}
 */
export function getEditorRange(root) {
  const sel = root.ownerDocument.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
  return r;
}

function setRange(root, range) {
  const sel = root.ownerDocument.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Units before a boundary point: characters, 1 per atom (br, field) and 1 per block end. */
function pointToOffset(root, container, offset) {
  let count = 0, found = null;
  const visit = (node) => {
    if (node.nodeType === 3) {
      if (node === container) { found = count + Math.min(offset, node.data.length); return true; }
      count += node.data.length;
      return false;
    }
    if (!isEl(node)) return false;
    if (node !== root && isAtom(node)) {
      if (node === container) { found = count + (offset > 0 ? 1 : 0); return true; }
      if (node.contains(container)) { found = count; return true; }
      count += 1;
      return false;
    }
    const kids = node.childNodes;
    for (let i = 0; i < kids.length; i++) {
      if (node === container && i === offset) { found = count; return true; }
      if (visit(kids[i])) return true;
    }
    if (node === container) { found = count; return true; }
    if (node !== root && isBlock(node)) count += 1;
    return false;
  };
  visit(root);
  return found ?? count;
}

function offsetToPoint(root, target) {
  let count = 0, result = null;
  const visit = (node) => {
    if (node.nodeType === 3) {
      const len = node.data.length;
      if (target <= count + len) { result = [node, target - count]; return true; }
      count += len;
      return false;
    }
    if (!isEl(node)) return false;
    if (node !== root && isAtom(node)) {
      if (target <= count) { result = [node.parentNode, [...node.parentNode.childNodes].indexOf(node)]; return true; }
      count += 1;
      if (target === count && !node.nextSibling) { result = [node.parentNode, node.parentNode.childNodes.length]; return true; }
      return false;
    }
    for (let c = node.firstChild; c; c = c.nextSibling) if (visit(c)) return true;
    if (node !== root && isBlock(node)) {
      if (target <= count) { result = [node, node.childNodes.length]; return true; }
      count += 1;
    }
    return false;
  };
  visit(root);
  return result || [root, root.childNodes.length];
}

function saveSelection(root, range) {
  return { start: pointToOffset(root, range.startContainer, range.startOffset), end: pointToOffset(root, range.endContainer, range.endOffset) };
}

function restoreSelection(root, saved) {
  const r = root.ownerDocument.createRange();
  const [sc, so] = offsetToPoint(root, saved.start);
  const [ec, eo] = offsetToPoint(root, saved.end);
  r.setStart(sc, so);
  r.setEnd(ec, eo);
  setRange(root, r);
  return r;
}

/** Wrap loose inline content at the root level into paragraphs (contenteditable can create it). */
function ensureBlocks(root) {
  let p = null;
  for (const n of [...root.childNodes]) {
    if (isEl(n) && (isList(n) || BLOCK_RE.test(n.nodeName))) { p = null; continue; }
    if (n.nodeType === 3 && !n.data.length) { n.remove(); continue; }
    if (n.nodeType !== 3 && !isEl(n)) continue;
    if (!p) { p = root.ownerDocument.createElement('p'); root.insertBefore(p, n); }
    p.appendChild(n);
  }
  if (!root.firstChild) {
    const e = root.ownerDocument.createElement('p');
    e.appendChild(root.ownerDocument.createElement('br'));
    root.appendChild(e);
  }
}

function allBlocks(root) {
  const out = [];
  const walk = (n) => {
    for (let c = n.firstElementChild; c; c = c.nextElementSibling) {
      if (isBlock(c)) out.push(c);
      else if (isList(c) || BLOCK_RE.test(c.nodeName)) walk(c);
    }
  };
  walk(root);
  return out;
}

function blockOf(node, root) {
  for (let n = node; n && n !== root; n = n.parentNode) if (isBlock(n)) return n;
  return null;
}

/**
 * Blocks (paragraphs / list items) touched by the selection, in document order.
 * @param {HTMLElement} root
 * @param {Range} [range]
 * @returns {HTMLElement[]}
 */
export function selectedBlocks(root, range = getEditorRange(root)) {
  if (!range) return [];
  const blocks = allBlocks(root);
  if (range.collapsed) {
    const b = blockOf(range.startContainer, root) || blockOf(range.startContainer.childNodes?.[range.startOffset] || null, root);
    if (b) return [b];
    const after = blocks.find((x) => range.comparePoint(x, 0) >= 0);
    return after ? [after] : blocks.slice(-1);
  }
  const hit = blocks.filter((b) => range.intersectsNode(b));
  // a range ending at the very start of a block does not select that block
  if (hit.length > 1) {
    const last = hit[hit.length - 1];
    const r = root.ownerDocument.createRange();
    r.selectNodeContents(last);
    r.collapse(true);
    if (range.compareBoundaryPoints(Range.END_TO_START, r) <= 0 && pointToOffset(root, range.endContainer, range.endOffset) === pointToOffset(root, last, 0)) hit.pop();
  }
  return hit;
}

// ---------------------------------------------------------------------------------------------
// Splitting formatting at the selection edges
// ---------------------------------------------------------------------------------------------

function hasContent(n) {
  if (n.nodeType === 3) return n.data.length > 0;
  if (!isEl(n)) return false;
  if (isAtom(n)) return true;
  for (let c = n.firstChild; c; c = c.nextSibling) if (hasContent(c)) return true;
  return false;
}

/** Move a marker up to be a direct child of `block`, splitting the inline elements around it. */
function lift(marker, block) {
  while (marker.parentNode && marker.parentNode !== block) {
    const parent = marker.parentNode;
    if (isField(parent)) { parent.after(marker); continue; }
    const after = parent.cloneNode(false);
    while (marker.nextSibling) after.appendChild(marker.nextSibling);
    parent.after(marker);
    if (hasContent(after)) marker.after(after);
  }
}

function placeMarker(root, marker, atStart, blocks) {
  let b = blockOf(marker, root);
  if (b) return b;
  // marker between blocks: move it into the adjacent selected block
  b = atStart ? blocks[0] : blocks[blocks.length - 1];
  if (atStart) b.insertBefore(marker, b.firstChild); else b.appendChild(marker);
  return b;
}

/**
 * Run `fn(block, nodes)` for each block touched by the selection, where `nodes` are the block's
 * direct children inside the selection (formatting elements are split at the edges first).
 * The selection is restored afterwards. Returns false when there is no selection in root.
 */
function withRuns(root, fn, opts = {}) {
  ensureBlocks(root);
  let range = getEditorRange(root);
  if (!range) return false;
  const doc = root.ownerDocument;
  let caret = null;
  if (range.collapsed && !opts.collapsedBlock) {
    caret = doc.createTextNode(ZWSP);
    range.insertNode(caret);
    range = doc.createRange();
    range.selectNodeContents(caret);
  } else if (range.collapsed) {
    const b = selectedBlocks(root, range)[0];
    if (!b) return false;
    const saved = saveSelection(root, range);
    range = doc.createRange();
    range.selectNodeContents(b);
    const res = runRange(root, range, fn);
    restoreSelection(root, saved);
    return res;
  }
  const saved = saveSelection(root, range);
  const res = runRange(root, range, fn);
  const r = restoreSelection(root, saved);
  if (caret) { r.collapse(false); setRange(root, r); }
  return res;
}

function runRange(root, range, fn) {
  const doc = root.ownerDocument;
  const blocks = selectedBlocks(root, range);
  if (!blocks.length) return false;
  const m1 = doc.createElement('span'), m2 = doc.createElement('span');
  const r2 = range.cloneRange(); r2.collapse(false);
  const r1 = range.cloneRange(); r1.collapse(true);
  // markers inside atoms go before/after the atom
  const fixInAtom = (r, after) => {
    for (let n = r.startContainer; n && n !== root; n = n.parentNode) {
      if (isField(n)) { if (after) r.setStartAfter(n); else r.setStartBefore(n); r.collapse(true); return; }
    }
  };
  fixInAtom(r2, true); fixInAtom(r1, false);
  r2.insertNode(m2);
  r1.insertNode(m1);
  const b1 = placeMarker(root, m1, true, blocks);
  const b2 = placeMarker(root, m2, false, blocks);
  lift(m1, b1);
  lift(m2, b2);
  const i1 = blocks.indexOf(b1), i2 = blocks.indexOf(b2);
  const list = blocks.slice(Math.max(0, i1), i2 < 0 ? blocks.length : i2 + 1);
  for (const block of list) {
    const nodes = [];
    let n = block === b1 ? m1.nextSibling : block.firstChild;
    while (n && !(block === b2 && n === m2)) { if (n !== m1 && n !== m2) nodes.push(n); n = n.nextSibling; }
    fn(block, nodes);
  }
  m1.remove();
  m2.remove();
  for (const block of list) normalizeBlock(block);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------------------------

function unwrap(el) {
  const parent = el.parentNode;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  el.remove();
}

function attrKey(el) {
  return [...el.attributes].map((a) => `${a.name}=${a.value}`).sort().join('\u0001');
}

function normalizeInline(parent) {
  for (let c = parent.firstChild; c;) {
    const next = c.nextSibling;
    if (isEl(c) && !isAtom(c)) {
      normalizeInline(c);
      if (!hasContent(c)) { c.remove(); c = next; continue; }
      if (c.nodeName === 'SPAN' && !(c.getAttribute('style') || '').trim() && !c.classList.length) { const first = c.firstChild; unwrap(c); c = first || next; continue; }
      // same formatting nested inside itself
      if (c.nodeName !== 'SPAN' && c.nodeName !== 'A' && c.parentNode.closest && c.parentNode.closest(c.nodeName.toLowerCase())) { const first = c.firstChild; unwrap(c); c = first || next; continue; }
      const prev = c.previousSibling;
      if (isEl(prev) && !isAtom(prev) && prev.nodeName === c.nodeName && attrKey(prev) === attrKey(c)) {
        while (c.firstChild) prev.appendChild(c.firstChild);
        c.remove();
        normalizeInline(prev);
        c = next;
        continue;
      }
    }
    c = next;
  }
  parent.normalize();
}

function normalizeBlock(block) {
  normalizeInline(block);
  if (!hasContent(block)) block.appendChild(block.ownerDocument.createElement('br'));
}

// ---------------------------------------------------------------------------------------------
// Inline formatting
// ---------------------------------------------------------------------------------------------

function removeStyleProp(el, prop, keyword) {
  if (!el.style) return;
  if (keyword) {
    const v = el.style.getPropertyValue(prop);
    if (!v) return;
    const rest = v.split(/\s+/).filter((t) => t && t !== keyword && t !== 'none');
    if (rest.length) el.style.setProperty(prop, rest.join(' ')); else el.style.removeProperty(prop);
  } else {
    el.style.removeProperty(prop);
  }
  if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
}

const STYLE_OF = {
  bold: ['font-weight'], italic: ['font-style'], underline: ['text-decoration', 'underline'], strike: ['text-decoration', 'line-through'],
  sub: null, sup: null, link: null
};

/** Remove a format (key of FORMAT_TAGS or a CSS property) from nodes and their descendants. */
function stripFormat(nodes, key) {
  const tags = FORMAT_TAGS[key] || [];
  const styleSpec = key in STYLE_OF ? STYLE_OF[key] : [key];
  const visit = (n) => {
    if (!isEl(n)) return;
    if (!isField(n)) for (const c of [...n.childNodes]) visit(c);
    if (styleSpec) removeStyleProp(n, styleSpec[0], styleSpec[1]);
    if (tags.includes(n.nodeName)) unwrap(n);
    else if (n.nodeName === 'SPAN' && !isField(n) && !n.attributes.length) unwrap(n);
  };
  for (const n of nodes) visit(n);
}

function currentRun(block, first, lastNext) {
  const out = [];
  for (let n = first; n && n !== lastNext; n = n.nextSibling) out.push(n);
  return out;
}

/** Strip a format from a run and optionally wrap it; returns the resulting run of block children. */
function restyleRun(block, nodes, key, makeWrapper) {
  if (!nodes.length) return [];
  const before = nodes[0].previousSibling;
  const after = nodes[nodes.length - 1].nextSibling;
  stripFormat(nodes, key);
  if (key === 'sub' || key === 'sup') stripFormat(currentRun(block, before ? before.nextSibling : block.firstChild, after), key === 'sub' ? 'sup' : 'sub');
  const run = currentRun(block, before ? before.nextSibling : block.firstChild, after);
  if (!makeWrapper || !run.some(hasContent)) return run;
  const w = makeWrapper();
  block.insertBefore(w, run[0]);
  for (const n of run) w.appendChild(n);
  return [w];
}

function textNodesIn(nodes) {
  const out = [];
  const visit = (n) => {
    if (n.nodeType === 3) { if (n.data.length) out.push(n); return; }
    if (isField(n)) { out.push(n); return; }
    if (isEl(n)) for (let c = n.firstChild; c; c = c.nextSibling) visit(c);
  };
  for (const n of nodes) visit(n);
  return out;
}

function styleOf(node) {
  const el = node.nodeType === 3 ? node.parentElement : node;
  return el.ownerDocument.defaultView.getComputedStyle(el);
}

function hasDecoration(node, root, word) {
  for (let n = node.nodeType === 3 ? node.parentElement : node; n; n = n.parentElement) {
    if ((styleOf(n).textDecorationLine || '').includes(word)) return true;
    if (n === root) break;
  }
  // frame-level decoration is set on the frame's flow element, an ancestor of root
  for (let n = root.parentElement; n; n = n.parentElement) {
    if ((styleOf(n).textDecorationLine || '').includes(word)) return true;
    if (n.classList && n.classList.contains('el')) break;
  }
  return false;
}

function inTag(node, root, tags) {
  for (let n = node.nodeType === 3 ? node.parentElement : node; n && n !== root; n = n.parentElement) if (tags.includes(n.nodeName)) return n;
  return null;
}

function formatActive(node, root, key) {
  const st = styleOf(node);
  switch (key) {
    case 'bold': return parseInt(st.fontWeight, 10) >= 600 || st.fontWeight === 'bold';
    case 'italic': return st.fontStyle === 'italic' || st.fontStyle.startsWith('oblique');
    case 'underline': return hasDecoration(node, root, 'underline');
    case 'strike': return hasDecoration(node, root, 'line-through');
    case 'sub': return !!inTag(node, root, ['SUB']);
    case 'sup': return !!inTag(node, root, ['SUP']);
    default: return false;
  }
}

function toggleFormat(root, key) {
  const range = getEditorRange(root);
  if (!range) return false;
  // decide on/off from the selected text (on unless every selected character already has it)
  let nodes = [];
  if (range.collapsed) nodes = [range.startContainer];
  else {
    const all = textNodesIn([range.commonAncestorContainer]).filter((n) => range.intersectsNode(n) && !(n.nodeType === 3 && !/[^​]/.test(n.data)));
    nodes = all.length ? all : [range.startContainer];
  }
  const on = !nodes.every((n) => formatActive(n, root, key));
  const doc = root.ownerDocument;
  return withRuns(root, (block, run) => {
    const res = restyleRun(block, run, key, on ? () => doc.createElement(TAG_OF[key]) : null);
    // still bold/italic through the frame style: override explicitly
    if (!on && (key === 'bold' || key === 'italic') && res.length && textNodesIn(res).some((t) => formatActive(t, root, key))) {
      const w = doc.createElement('span');
      w.style.setProperty(key === 'bold' ? 'font-weight' : 'font-style', 'normal');
      block.insertBefore(w, res[0]);
      for (const n of res) w.appendChild(n);
    }
  });
}

/** Toggle bold on the selection. @param {HTMLElement} root @returns {boolean} */
export const toggleBold = (root) => toggleFormat(root, 'bold');
/** Toggle italic on the selection. @param {HTMLElement} root @returns {boolean} */
export const toggleItalic = (root) => toggleFormat(root, 'italic');
/** Toggle underline on the selection. @param {HTMLElement} root @returns {boolean} */
export const toggleUnderline = (root) => toggleFormat(root, 'underline');
/** Toggle strikethrough on the selection. @param {HTMLElement} root @returns {boolean} */
export const toggleStrike = (root) => toggleFormat(root, 'strike');
/** Toggle superscript (removes subscript). @param {HTMLElement} root @returns {boolean} */
export const toggleSuper = (root) => toggleFormat(root, 'sup');
/** Toggle subscript (removes superscript). @param {HTMLElement} root @returns {boolean} */
export const toggleSub = (root) => toggleFormat(root, 'sub');

/**
 * Set (or with value null/'' remove) an inline CSS property on the selection. The value is
 * validated and canonicalised by the sanitizer's rules; invalid values are rejected (false).
 * @param {HTMLElement} root
 * @param {string} prop one of INLINE_STYLE_PROPS
 * @param {string|null} value
 * @returns {boolean}
 */
export function applyInlineStyle(root, prop, value) {
  let canon = null;
  if (value !== null && value !== undefined && value !== '') {
    canon = filterStyle([[prop, String(value)]], new Set([prop])).get(prop);
    if (!canon) return false;
  }
  const doc = root.ownerDocument;
  return withRuns(root, (block, run) => restyleRun(block, run, prop, canon ? () => {
    const s = doc.createElement('span');
    s.style.setProperty(prop, canon);
    return s;
  } : null));
}

function themeRef(v, kind) {
  const m = /^@([a-z0-9]+)$/i.exec(String(v || ''));
  if (!m) return null;
  if (kind === 'font') return m[1] === 'heading' || m[1] === 'body' ? `var(--folio-${m[1]})` : null;
  return THEME_COLORS.includes(m[1]) ? `var(--folio-${m[1]})` : null;
}

/**
 * Set the font family ('@heading' / '@body' for theme fonts, a family name, or null to clear).
 * @param {HTMLElement} root @param {string|null} family @returns {boolean}
 */
export function setFontFamily(root, family) {
  if (!family) return applyInlineStyle(root, 'font-family', null);
  const v = themeRef(family, 'font') || normalizeFontFamily(/[,"']/.test(family) ? family : `"${family}"`);
  return v ? applyInlineStyle(root, 'font-family', v) : false;
}

/** Set the font size in points (null clears). @param {HTMLElement} root @param {number|null} pt @returns {boolean} */
export function setFontSize(root, pt) {
  if (pt === null || pt === undefined || pt === '') return applyInlineStyle(root, 'font-size', null);
  const n = Number(pt);
  return Number.isFinite(n) && n > 0 ? applyInlineStyle(root, 'font-size', `${n}pt`) : false;
}

/** Set the text colour ('#rrggbb', '@accent' theme colours, null clears). @returns {boolean} */
export function setColor(root, color) {
  if (!color) return applyInlineStyle(root, 'color', null);
  const v = themeRef(color, 'color') || normalizeColor(color);
  return v ? applyInlineStyle(root, 'color', v) : false;
}

/** Set the highlight (background) colour; null / 'transparent' clears. @returns {boolean} */
export function setHighlight(root, color) {
  if (!color || color === 'transparent' || color === 'none') return applyInlineStyle(root, 'background-color', null);
  const v = themeRef(color, 'color') || normalizeColor(color);
  return v ? applyInlineStyle(root, 'background-color', v) : false;
}

/**
 * Remove character formatting (bold, italic, fonts, colours…) from the selection, keeping links
 * and fields. With a caret, the whole paragraph is cleared.
 * @param {HTMLElement} root
 * @returns {boolean}
 */
export function clearFormatting(root) {
  return withRuns(root, (block, run) => {
    const visit = (n) => {
      if (!isEl(n)) return;
      for (const c of [...n.childNodes]) visit(c);
      if (isField(n)) { n.removeAttribute('style'); return; }
      if (n.nodeName === 'A') { n.removeAttribute('style'); return; }
      if (n.nodeName !== 'BR') unwrap(n);
    };
    for (const n of run) visit(n);
  }, { collapsedBlock: true });
}

// ---------------------------------------------------------------------------------------------
// Paragraph formatting and lists
// ---------------------------------------------------------------------------------------------

const PARA_PROPS = {
  align: ['text-align', (v) => (['left', 'center', 'right', 'justify'].includes(v) ? v : null)],
  lineHeight: ['line-height', (v) => (Number(v) > 0 ? String(Math.round(Number(v) * 100) / 100) : null)],
  spaceBefore: ['margin-top', (v) => (Number.isFinite(Number(v)) ? `${Math.round(Number(v) * 100) / 100}px` : null)],
  spaceAfter: ['margin-bottom', (v) => (Number.isFinite(Number(v)) ? `${Math.round(Number(v) * 100) / 100}px` : null)],
  indentLeft: ['margin-left', (v) => (Number.isFinite(Number(v)) ? `${Math.round(Number(v) * 100) / 100}px` : null)],
  firstLine: ['text-indent', (v) => (Number.isFinite(Number(v)) ? `${Math.round(Number(v) * 100) / 100}px` : null)]
};

/**
 * Set paragraph properties on the selected paragraphs / list items. Keys: align, lineHeight
 * (multiple), spaceBefore, spaceAfter, indentLeft, firstLine (px). A null value removes the
 * property (the frame default applies).
 * @param {HTMLElement} root
 * @param {{align?, lineHeight?, spaceBefore?, spaceAfter?, indentLeft?, firstLine?}} props
 * @returns {boolean}
 */
export function setParagraphStyle(root, props = {}) {
  ensureBlocks(root);
  const range = getEditorRange(root);
  if (!range) return false;
  const blocks = selectedBlocks(root, range);
  if (!blocks.length) return false;
  const saved = saveSelection(root, range);
  for (const b of blocks) {
    for (const [key, val] of Object.entries(props)) {
      const spec = PARA_PROPS[key];
      if (!spec) continue;
      const v = val === null || val === undefined || val === '' ? null : spec[1](val);
      if (v === null) b.style.removeProperty(spec[0]); else b.style.setProperty(spec[0], v);
    }
    if (!b.getAttribute('style')?.trim()) b.removeAttribute('style');
  }
  restoreSelection(root, saved);
  return true;
}

/**
 * Indent (+1) or outdent (-1) the selected paragraphs by LIST_INDENT px steps.
 * @param {HTMLElement} root
 * @param {number} delta
 * @returns {boolean}
 */
export function changeIndent(root, delta) {
  ensureBlocks(root);
  const range = getEditorRange(root);
  if (!range) return false;
  const blocks = selectedBlocks(root, range);
  const saved = saveSelection(root, range);
  for (const b of blocks) {
    const cur = parseFloat(b.style.marginLeft) || 0;
    const v = Math.max(0, Math.round((cur + delta * LIST_INDENT) / LIST_INDENT) * LIST_INDENT);
    if (v) b.style.marginLeft = `${v}px`; else b.style.removeProperty('margin-left');
    if (!b.getAttribute('style')?.trim()) b.removeAttribute('style');
  }
  restoreSelection(root, saved);
  return blocks.length > 0;
}

function convertBlock(from, tag) {
  const el = from.ownerDocument.createElement(tag);
  const st = from.getAttribute('style');
  if (st) el.setAttribute('style', st);
  while (from.firstChild) el.appendChild(from.firstChild);
  return el;
}

/** Turn one list item into a paragraph, splitting its list. Returns the paragraph. */
function unlistItem(li) {
  const list = li.parentNode;
  const items = [...list.children];
  const idx = items.indexOf(li);
  const p = convertBlock(li, 'p');
  const tail = items.slice(idx + 1);
  list.after(p);
  if (tail.length) {
    const rest = list.cloneNode(false);
    if (list.nodeName === 'OL') {
      const start = (parseInt(list.getAttribute('start') || '1', 10) || 1) + idx;
      if (start !== 1) rest.setAttribute('start', String(start)); else rest.removeAttribute('start');
    }
    for (const t of tail) rest.appendChild(t);
    p.after(rest);
  }
  li.remove();
  if (!list.children.length) list.remove();
  return p;
}

function mergeLists(list) {
  const prev = list.previousElementSibling;
  if (prev && prev.nodeName === list.nodeName && (prev.getAttribute('style') || '') === (list.getAttribute('style') || '') && !list.hasAttribute('start')) {
    while (list.firstChild) prev.appendChild(list.firstChild);
    list.remove();
    list = prev;
  }
  const next = list.nextElementSibling;
  if (next && next.nodeName === list.nodeName && (next.getAttribute('style') || '') === (list.getAttribute('style') || '') && !next.hasAttribute('start')) {
    while (next.firstChild) list.appendChild(next.firstChild);
    next.remove();
  }
}

/**
 * Toggle a bulleted ('ul') or numbered ('ol') list on the selected paragraphs. When every
 * selected block already is an item of that list type, the items become paragraphs again.
 * @param {HTMLElement} root
 * @param {'ul'|'ol'} type
 * @returns {boolean}
 */
export function toggleList(root, type) {
  const tag = type === 'ol' ? 'OL' : 'UL';
  ensureBlocks(root);
  const range = getEditorRange(root);
  if (!range) return false;
  const blocks = selectedBlocks(root, range);
  if (!blocks.length) return false;
  const saved = saveSelection(root, range);
  const off = blocks.every((b) => b.nodeName === 'LI' && b.parentNode.nodeName === tag);
  const paras = blocks.map((b) => (b.nodeName === 'LI' ? unlistItem(b) : b));
  if (!off) {
    const doc = root.ownerDocument;
    let list = null;
    for (const p of paras) {
      if (p.parentNode !== root) continue; // a block nested in another container stays as is
      if (!list || list.nextSibling !== p) {
        list = doc.createElement(tag.toLowerCase());
        p.before(list);
      }
      const li = convertBlock(p, 'li');
      p.remove();
      list.appendChild(li);
    }
    for (const l of [...root.querySelectorAll(':scope > ul, :scope > ol')]) if (l.isConnected) mergeLists(l);
  }
  restoreSelection(root, saved);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Links and fields
// ---------------------------------------------------------------------------------------------

function normalizeUrl(url) {
  const u = String(url || '').trim();
  if (!u) return null;
  if (cleanHref(u)) return cleanHref(u);
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(u)) return cleanHref(`mailto:${u}`);
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(u) || /^www\./i.test(u)) return cleanHref(`https://${u}`);
  return null;
}

/**
 * Make the selection a hyperlink (http(s) or mailto; bare domains and e-mail addresses are
 * completed). With a caret inside a link its address is changed; with a caret elsewhere the
 * link text (or the address) is inserted.
 * @param {HTMLElement} root
 * @param {string} url
 * @param {string} [text] text to insert for a collapsed selection
 * @returns {boolean}
 */
export function insertLink(root, url, text) {
  const href = normalizeUrl(url);
  if (!href) return false;
  ensureBlocks(root);
  const range = getEditorRange(root);
  if (!range) return false;
  const doc = root.ownerDocument;
  if (range.collapsed) {
    const a0 = inTag(range.startContainer, root, ['A']);
    if (a0) { a0.setAttribute('href', href); return true; }
    const a = doc.createElement('a');
    a.setAttribute('href', href);
    a.textContent = text || url;
    range.insertNode(a);
    const r = doc.createRange();
    r.setStartAfter(a);
    r.collapse(true);
    setRange(root, r);
    return true;
  }
  return withRuns(root, (block, run) => restyleRun(block, run, 'link', () => {
    const a = doc.createElement('a');
    a.setAttribute('href', href);
    return a;
  }));
}

/**
 * Remove hyperlinks touched by the selection (whole links, text kept).
 * @param {HTMLElement} root
 * @returns {boolean}
 */
export function removeLink(root) {
  const range = getEditorRange(root);
  if (!range) return false;
  const links = [...root.querySelectorAll('a')].filter((a) => range.intersectsNode(a) || a.contains(range.startContainer));
  if (!links.length) return false;
  const saved = saveSelection(root, range);
  for (const a of links) { const p = a.parentNode; unwrap(a); p.normalize(); }
  restoreSelection(root, saved);
  return true;
}

/**
 * Insert a field atom (merge column or #page / #pages / #date…) at the caret, replacing the
 * selection. Returns the inserted element (or null without a selection).
 * @param {HTMLElement} root
 * @param {string} name
 * @returns {HTMLElement|null}
 */
export function insertField(root, name) {
  ensureBlocks(root);
  const range = getEditorRange(root);
  if (!range || !name) return null;
  const doc = root.ownerDocument;
  if (!range.collapsed) range.deleteContents();
  const t = doc.createElement('template');
  t.innerHTML = fieldSpan(name);
  const el = t.content.firstChild;
  // never inside another field
  for (let n = range.startContainer; n && n !== root; n = n.parentNode) if (isField(n)) { range.setStartAfter(n); range.collapse(true); break; }
  range.insertNode(el);
  const b = blockOf(el, root);
  if (b) for (const br of [...b.querySelectorAll('br')]) if (br === b.lastChild && br.previousSibling === el) br.remove();
  const r = doc.createRange();
  r.setStartAfter(el);
  r.collapse(true);
  setRange(root, r);
  return el;
}

// ---------------------------------------------------------------------------------------------
// State for toolbar controls
// ---------------------------------------------------------------------------------------------

function rgbToHex(c) {
  const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/.exec(String(c || ''));
  if (!m) return null;
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return 'transparent';
  return `#${[m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('')}`;
}

function firstFamily(ff) {
  const s = String(ff || '').split(',')[0].trim();
  return s.replace(/^["']|["']$/g, '');
}

function fontRefOf(node, root) {
  for (let n = node.nodeType === 3 ? node.parentElement : node; n && n !== root; n = n.parentElement) {
    const v = n.style && n.style.getPropertyValue('font-family');
    if (v) { const m = /var\(\s*--folio-(heading|body)\s*\)/.exec(v); return m ? `@${m[1]}` : null; }
  }
  return null;
}

function colorRefOf(node, root, prop) {
  for (let n = node.nodeType === 3 ? node.parentElement : node; n && n !== root; n = n.parentElement) {
    const v = n.style && n.style.getPropertyValue(prop);
    if (v) { const m = /var\(\s*--folio-([a-z0-9]+)\s*\)/.exec(v); return m ? `@${m[1]}` : null; }
  }
  return null;
}

function highlightOf(node, root) {
  for (let n = node.nodeType === 3 ? node.parentElement : node; n && n !== root; n = n.parentElement) {
    const ref = n.style && n.style.getPropertyValue('background-color');
    if (ref) { const m = /var\(\s*--folio-([a-z0-9]+)\s*\)/.exec(ref); if (m) return `@${m[1]}`; }
    const c = rgbToHex(styleOf(n).backgroundColor);
    if (c && c !== 'transparent') return c;
  }
  return null;
}

/**
 * Formatting at the selection, for updating toolbar controls. Values that differ across the
 * selection are null (font, size, color, highlight, align, lineHeight) or false (toggles).
 * @param {HTMLElement} root
 * @returns {{font: string|null, fontRef: string|null, size: number|null, bold: boolean, italic: boolean, underline: boolean,
 *   strike: boolean, sub: boolean, sup: boolean, color: string|null, highlight: string|null, align: string|null,
 *   list: 'ul'|'ol'|null, lineHeight: number|null, link: string|null} | null}
 */
export function getSelectionState(root) {
  const range = getEditorRange(root);
  if (!range) return null;
  let nodes;
  if (range.collapsed) {
    let n = range.startContainer;
    if (isEl(n) && n.childNodes[range.startOffset]) n = n.childNodes[range.startOffset];
    else if (isEl(n) && n.lastChild && range.startOffset > 0) n = n.childNodes[range.startOffset - 1];
    nodes = [n.nodeType === 3 || isEl(n) ? n : root];
  } else {
    nodes = textNodesIn([range.commonAncestorContainer]).filter((n) => range.intersectsNode(n) && !(n.nodeType === 3 && !/[^​]/.test(n.data)));
    if (range.commonAncestorContainer.nodeType === 3) nodes = [range.commonAncestorContainer];
    if (!nodes.length) nodes = [range.startContainer];
  }
  nodes = nodes.slice(0, 400).map((n) => (n.nodeType === 3 || isEl(n) ? n : root));
  const same = (fn) => {
    const v0 = fn(nodes[0]);
    return nodes.every((n) => fn(n) === v0) ? v0 : null;
  };
  const all = (key) => nodes.every((n) => formatActive(n, root, key));
  const blocks = selectedBlocks(root, range);
  const b0 = blocks[0] || null;
  const blockSame = (fn) => {
    if (!blocks.length) return null;
    const v0 = fn(blocks[0]);
    return blocks.every((b) => fn(b) === v0) ? v0 : null;
  };
  const link = inTag(nodes[0], root, ['A']);
  return {
    font: same((n) => firstFamily(styleOf(n).fontFamily)),
    fontRef: same((n) => fontRefOf(n, root)),
    size: same((n) => Math.round(parseFloat(styleOf(n).fontSize) * 0.75 * 2) / 2),
    bold: all('bold'),
    italic: all('italic'),
    underline: all('underline'),
    strike: all('strike'),
    sub: all('sub'),
    sup: all('sup'),
    color: same((n) => colorRefOf(n, root, 'color') || rgbToHex(styleOf(n).color)),
    highlight: same((n) => highlightOf(n, root)),
    align: blockSame((b) => { const a = styleOf(b).textAlign; return a === 'start' ? 'left' : a === 'end' ? 'right' : a; }),
    list: blockSame((b) => (b.nodeName === 'LI' ? b.parentNode.nodeName.toLowerCase() : null)),
    lineHeight: blockSame((b) => (b.style.lineHeight && !/px$/.test(b.style.lineHeight) ? parseFloat(b.style.lineHeight) : null)),
    link: link ? link.getAttribute('href') : null,
    block: b0
  };
}

/**
 * Sanitized story HTML of the editor content.
 * @param {HTMLElement} root
 * @returns {string}
 */
export function getEditorHtml(root) {
  return sanitizeHtml(root.innerHTML);
}

/** Document-level editing defaults (Enter creates <p>, execCommand emits tags not CSS). */
export function prepareEditing(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return;
  try { doc.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* unsupported */ }
  try { doc.execCommand('styleWithCSS', false, false); } catch { /* unsupported */ }
}
