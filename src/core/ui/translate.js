// Live interface translation. The shell, ribbon, panels, menus, dialogs and tooltips are built
// from English strings; this watches the interface and swaps every string it shows (text and the
// title / placeholder / aria-label / alt / label / tooltip attributes) for the display language's
// translation, and back again when the language changes. The English original of each string is
// remembered, so switching languages never translates a translation.
//
// Publication content is never touched: rendered pages, page and template thumbnails, text being
// edited, form fields, document names and anything marked translate="no".

import { translateUI, translating, onLanguageChange } from '../i18n.js';

const ATTRS = ['title', 'placeholder', 'aria-label', 'alt', 'label', 'data-tip', 'data-tip-desc'];
const SKIP = [
  '.page-render', '.page-slot', '.thumb-frame', '.tg-thumb', '.tg-preview', '.dt-name', '.doc-title', '.ly-rename',
  '[contenteditable="true"]', '[contenteditable=""]', 'textarea', 'script', 'style', 'kbd', '[translate="no"]'
].join(',');

const texts = new WeakMap();   // Text node -> { src, out }
const attrs = new WeakMap();   // Element -> Map(attribute -> { src, out })

/** The English original of a string currently on screen. */
const source = (rec, current) => (rec && current === rec.out ? rec.src : current);

function text(node) {
  const cur = node.data, rec = texts.get(node);
  const src = source(rec, cur);
  const out = translating() ? translateUI(src) : src;
  if (rec || out !== src) texts.set(node, { src, out });
  if (out !== cur) node.data = out;
}

function attr(el, name) {
  const cur = el.getAttribute(name);
  if (cur == null) return;
  let map = attrs.get(el);
  const rec = map && map.get(name);
  const src = source(rec, cur);
  const out = translating() ? translateUI(src) : src;
  if (rec || out !== src) { if (!map) attrs.set(el, (map = new Map())); map.set(name, { src, out }); }
  if (out !== cur) el.setAttribute(name, out);
}

function element(el) {
  for (const name of ATTRS) if (el.hasAttribute(name)) attr(el, name);
}

/** Translate everything under root (root included). */
function walk(root) {
  if (root.nodeType === Node.TEXT_NODE) { if (!skipped(root.parentElement)) text(root); return; }
  if (root.nodeType !== Node.ELEMENT_NODE || skipped(root)) return;
  element(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
  });
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) { if (/[A-Za-z]/.test(n.data) || texts.has(n)) text(n); }
    else element(n);
  }
}

const skipped = (el) => !el || !!el.closest(SKIP);

let installed = false;

/** Start translating the interface (call once, after the shell is built). */
export function installTranslation() {
  if (installed) return;
  installed = true;
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach(walk);
      else if (r.type === 'characterData') { if (!skipped(r.target.parentElement)) text(r.target); }
      else if (!skipped(r.target)) attr(r.target, r.attributeName);
    }
  });
  mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  onLanguageChange(() => walk(document.body));
  walk(document.body);
}
