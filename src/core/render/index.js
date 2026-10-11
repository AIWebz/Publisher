// renderPage(container, doc, page, opts): draws a page (or master) from the model. Used by the
// canvas (mode 'edit'), thumbnails ('thumb') and export/print ('export').

import { registry } from '../registry.js';
import { walkElements } from '../model.js';
import { resolveColor } from '../theme.js';
import { layoutStories } from '../../engines/text/flow.js';
import { registerCoreElementTypes } from './elements.js';

registerCoreElementTypes();

const px = (n) => `${Math.round(n * 100) / 100}px`;

/** The effective background of a page: its own, else its master's, else paper. */
export function effectiveBackground(doc, page) {
  if (page.background) return page.background;
  const master = page.masterId ? doc.masters.find((m) => m.id === page.masterId) : null;
  if (master && master.background) return master.background;
  return { type: 'solid', color: '@paper' };
}

/** Apply a Background to an element's style. */
export function applyBackground(node, doc, bg) {
  const s = node.style;
  s.backgroundImage = '';
  s.backgroundSize = '';
  s.backgroundRepeat = '';
  s.backgroundPosition = '';
  if (!bg) { s.backgroundColor = resolveColor(doc, '@paper'); return; }
  const c1 = resolveColor(doc, bg.color || '@paper');
  if (bg.type === 'linear' || bg.type === 'radial') {
    const c2 = resolveColor(doc, bg.color2 || '@light');
    s.backgroundColor = c1;
    s.backgroundImage = bg.type === 'linear' ? `linear-gradient(${bg.angle ?? 180}deg, ${c1}, ${c2})` : `radial-gradient(circle at center, ${c1}, ${c2})`;
  } else if (bg.type === 'image') {
    const asset = doc.assets[bg.assetId];
    s.backgroundColor = resolveColor(doc, bg.color || '@paper');
    if (asset) {
      s.backgroundImage = `url("${asset.data}")`;
      s.backgroundPosition = 'center';
      if (bg.fit === 'tile') { s.backgroundRepeat = 'repeat'; s.backgroundSize = asset.width ? `${asset.width}px ${asset.height}px` : 'auto'; }
      else { s.backgroundRepeat = 'no-repeat'; s.backgroundSize = bg.fit === 'contain' ? 'contain' : 'cover'; }
    }
  } else {
    s.backgroundColor = c1 === 'transparent' ? resolveColor(doc, '@paper') : c1;
  }
}

function frameIndexMap(doc) {
  const map = new Map();
  doc.pages.forEach((p, i) => walkElements(p.elements, (el) => { if (el.type === 'text') map.set(el.id, i); }));
  return map;
}

/**
 * Field resolver for a render: '#page', '#pages', '#date' and merge columns from `record`.
 * @returns {(name: string, frame?: object) => string|null}
 */
export function makeFieldResolver(doc, { pageIndex = 0, record = null, isMasterView = false, masterFrames = null } = {}) {
  let pages = null;
  return (name, frame) => {
    if (name === '#page') {
      if (isMasterView) return '#';
      if (frame && !(masterFrames && masterFrames.has(frame.id))) {
        pages = pages || frameIndexMap(doc);
        if (pages.has(frame.id)) return String(pages.get(frame.id) + 1);
      }
      return String(pageIndex + 1);
    }
    if (name === '#pages') return String(doc.pages.length);
    if (name === '#date') return new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    if (!record) return null;
    const v = typeof record === 'function' ? record(name) : record[name];
    return v === undefined || v === null ? null : String(v);
  };
}

function textFrameIds(list) {
  const ids = [];
  walkElements(list, (el) => { if (el.type === 'text') ids.push(el.id); });
  return ids;
}

function safeLayout(doc, frames, resolveField) {
  if (!frames.length) return new Map();
  try {
    return layoutStories(doc, { frames, resolveField });
  } catch (err) {
    console.error('Text layout failed', err);
    return new Map();
  }
}

/** Create the positioned node for one element (uses the registered element renderer). */
export function renderElement(el, rctx) {
  const node = document.createElement('div');
  node.className = `el el-${el.type}`;
  node.dataset.id = el.id;
  const ox = rctx.offset ? rctx.offset.x : 0, oy = rctx.offset ? rctx.offset.y : 0;
  const s = node.style;
  s.left = px(el.x - ox);
  s.top = px(el.y - oy);
  s.width = px(el.w);
  s.height = px(el.h);
  if (el.rot) s.transform = `rotate(${el.rot}deg)`;
  if (el.opacity !== undefined && el.opacity < 1) s.opacity = String(Math.max(0, el.opacity));
  if (el.hidden) node.classList.add('is-hidden');
  if (el.locked) node.classList.add('is-locked');
  if (rctx.isMaster) node.dataset.master = '1';
  const def = registry.getElementType(el.type);
  try {
    if (def && def.render) def.render(node, el, rctx);
  } catch (err) {
    console.error(`Rendering ${el.type} ${el.id} failed`, err);
    if (rctx.mode === 'edit') node.classList.add('render-error');
  }
  return node;
}

/**
 * Build a render context for a page (layout computed for the page's and its master's text frames).
 * @returns {{ page: object, rctx: object, masterRctx: object|null, master: object|null }}
 */
export function pageRenderContext(doc, page, opts = {}) {
  const isMasterView = !doc.pages.includes(page);
  const pageIndex = opts.pageIndex ?? (isMasterView ? 0 : doc.pages.indexOf(page));
  const base = {
    doc, page, pageIndex, mode: opts.mode || 'edit', record: opts.record || null,
    showHidden: !!opts.showHidden, renderElement, isMaster: false, offset: null
  };
  const resolvePage = makeFieldResolver(doc, { pageIndex, record: base.record, isMasterView });
  const rctx = { ...base, resolveField: resolvePage, layout: safeLayout(doc, textFrameIds(page.elements), resolvePage), isMaster: isMasterView };
  let master = null, masterRctx = null;
  if (!isMasterView && page.masterId) {
    master = doc.masters.find((m) => m.id === page.masterId) || null;
    if (master && master.elements.length) {
      const ids = textFrameIds(master.elements);
      const resolveMaster = makeFieldResolver(doc, { pageIndex, record: base.record, masterFrames: new Set(ids) });
      masterRctx = { ...base, resolveField: resolveMaster, layout: safeLayout(doc, ids, resolveMaster), isMaster: true };
    }
  }
  return { page, rctx, master, masterRctx };
}

/**
 * Render a page (or a master page) into `container`.
 * @param {HTMLElement} container
 * @param {object} doc
 * @param {object} page a page of doc.pages, or a master (renders the master itself)
 * @param {{ mode?: 'edit'|'export'|'thumb', pageIndex?: number, record?: object|Function, showHidden?: boolean }} [opts]
 * @returns {{ rctx: object, layout: Map }}
 */
export function renderPage(container, doc, page, opts = {}) {
  const { rctx, master, masterRctx } = pageRenderContext(doc, page, opts);
  container.classList.add('page-render', `mode-${rctx.mode}`);
  container.style.width = px(doc.setup.width);
  container.style.height = px(doc.setup.height);
  container.style.position = container.style.position || 'relative';
  container.style.overflow = 'hidden';
  applyBackground(container, doc, rctx.isMaster ? (page.background || { type: 'solid', color: '@paper' }) : effectiveBackground(doc, page));
  const layers = [];
  if (master && masterRctx) {
    const ml = document.createElement('div');
    ml.className = 'layer layer-master';
    for (const el of master.elements) if (!el.hidden) ml.appendChild(renderElement(el, masterRctx));
    layers.push(ml);
  }
  const pl = document.createElement('div');
  pl.className = 'layer layer-page';
  for (const el of page.elements) {
    if (el.hidden && !rctx.showHidden) continue;
    pl.appendChild(renderElement(el, rctx));
  }
  layers.push(pl);
  container.replaceChildren(...layers);
  return { rctx, layout: rctx.layout };
}
