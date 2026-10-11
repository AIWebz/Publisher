// The canvas: a scrollable grey workspace showing the current page (or facing-page spread) at a
// zoom, with rulers, guides, a screen-space selection overlay and all pointer interactions.
// Installs app.canvas (see ARCHITECTURE.md "Core API details").

import { app } from '../app.js';
import { prefs } from '../prefs.js';
import { renderPage, renderElement } from '../render/index.js';
import { spreadOf } from '../pages.js';
import { findElement } from '../model.js';
import { h, onFrame } from '../ui/dom.js';
import { clampZoom, stepZoom, fitZoom, spreadLayout, contentGeometry, anchoredScroll } from './viewport.js';
import { Overlay } from './overlay.js';
import { Rulers } from './rulers.js';
import { drawGuides } from './guides.js';
import { installInteractions } from './interact.js';
import { TextEditor } from './textedit.js';
import { installCanvasClipboard } from './clipboard.js';

const PAD = 56;   // screen px of workspace around the spread

/** The canvas controller. */
export class Canvas {
  /** @param {HTMLElement} mount */
  constructor(mount) {
    this.mount = mount;
    this.zoom = 1;
    this.geo = { width: 0, height: 0, ox: 0, oy: 0 };
    this.slots = [];
    this.tool = 'select';
    this.enteredGroup = null;
    this.spaceDown = false;
    this._spreadKey = '';
    this._lastSession = null;
    this.build();
    this.overlay = new Overlay(this);
    this.rulers = new Rulers(this);
    this.text = new TextEditor(this);
    installInteractions(this);
    installCanvasClipboard(this);
    this.listen();
  }

  build() {
    this.hRuler = h('canvas', { class: 'ruler ruler-h', 'aria-hidden': 'true' });
    this.vRuler = h('canvas', { class: 'ruler ruler-v', 'aria-hidden': 'true' });
    this.corner = h('div', { class: 'ruler-corner', title: 'Rulers' });
    this.spread = h('div', { class: 'spread' });
    this.overlayEl = h('div', { class: 'overlay' });
    this.scroller = h('div', { class: 'scroller' }, this.spread, this.overlayEl);
    this.viewport = h('div', { class: 'viewport', tabindex: '-1', 'aria-label': 'Page canvas' }, this.scroller);
    this.empty = h('div', { class: 'canvas-empty', hidden: true });
    this.mount.classList.add('canvas-area');
    this.mount.append(this.corner, this.hRuler, this.vRuler, this.viewport, this.empty);
    this.applyRulerPref();
  }

  listen() {
    const soon = () => this.renderSoon();
    app.on('doc-change', ({ session }) => { if (session === app.session) this.renderSoon(); });
    app.on('preview', ({ session, ids }) => { if (session === app.session) this.previewSoon(ids); });
    app.on('selection', () => { this.enteredGroupCheck(); this.overlay.update(); });
    app.on('page', soon);
    app.on('view', () => { this.renderSoon(); });
    app.on('session', (s) => this.onSession(s));
    app.on('edit-start', () => this.overlay.update());
    app.on('edit-end', () => this.overlay.update());
    prefs.on('change', (path) => {
      if (path === 'rulers') this.applyRulerPref();
      if (/^(guides|showHidden|rulers)/.test(path)) this.renderSoon();
    });
    new ResizeObserver(() => this.onResize()).observe(this.viewport);
    this.viewport.addEventListener('scroll', () => {
      this.rulers.draw();
      const s = app.session;
      if (s && !this._restoring) s.view.scroll = { x: this.viewport.scrollLeft, y: this.viewport.scrollTop };
    }, { passive: true });
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', soon);
  }

  applyRulerPref() {
    this.mount.classList.toggle('no-rulers', !prefs.get('rulers'));
    onFrame('rulers', () => this.rulers && this.rulers.draw());
  }

  // ---------------------------------------------------------------- sessions & layout

  onSession(s) {
    this.text.abandon();
    this.tool = 'select';
    this.enteredGroup = null;
    this.empty.hidden = !!s;
    this.viewport.hidden = !s;
    this._spreadKey = '';
    if (!s) { this.spread.replaceChildren(); this.slots = []; this.overlay.update(); this.rulers.draw(); return; }
    this.zoom = clampZoom(s.view.zoom || 1);
    const known = this._seen || (this._seen = new WeakSet());
    this._pendingScroll = known.has(s) && !s.view.fit ? { ...s.view.scroll } : null;
    this._needsInitialPosition = !this._pendingScroll;
    known.add(s);
    this._lastSession = s;
    this.render();
  }

  /** Pages shown now: the current spread, or the master being edited. */
  spreadPages() {
    const doc = app.doc;
    if (!doc) return [];
    if (app.isMasterMode) return [{ index: -1, page: app.master }];
    return spreadOf(doc, app.pageIndex).map((i) => ({ index: i, page: doc.pages[i] }));
  }

  /** Recompute the scroll content size and the spread position for the current zoom. */
  layout() {
    const doc = app.doc;
    if (!doc) return;
    const W = doc.setup.width, H = doc.setup.height;
    const sl = spreadLayout(W, H, this.slots.length || 1);
    this.spreadW = sl.width;
    this.spreadH = sl.height;
    const s = app.session;
    const vw = this.viewport.clientWidth, vh = this.viewport.clientHeight;
    if (s.view.fit && vw > 0 && vh > 0) this.zoom = fitZoom(sl.width, sl.height, vw, vh, 28, s.view.fit);
    s.view.zoom = this.zoom;
    this.geo = contentGeometry(sl.width * this.zoom, sl.height * this.zoom, vw, vh, PAD);
    this.scroller.style.width = `${this.geo.width}px`;
    this.scroller.style.height = `${this.geo.height}px`;
    Object.assign(this.spread.style, {
      left: `${this.geo.ox}px`, top: `${this.geo.oy}px`, width: `${sl.width}px`, height: `${sl.height}px`,
      transform: `scale(${this.zoom})`
    });
    this.spread.style.setProperty('--z', String(this.zoom));
    this.mount.style.setProperty('--z', String(this.zoom));
    this.slots.forEach((slot, i) => { slot.offset = sl.offsets[i]; slot.el.style.left = `${slot.offset}px`; });
  }

  onResize() {
    if (!app.session) return;
    const view = app.session.view;
    if (view.fit) { this.layout(); this.centerSpread(); }
    else {
      const c = this.viewCenter();
      this.layout();
      if (c) this.scrollToSpreadPoint(c.x, c.y);
    }
    this.overlay.update();
    this.rulers.draw();
  }

  centerSpread() {
    this.viewport.scrollLeft = (this.geo.width - this.viewport.clientWidth) / 2;
    this.viewport.scrollTop = (this.geo.height - this.viewport.clientHeight) / 2;
  }

  // ---------------------------------------------------------------- rendering

  renderSoon() { onFrame('canvas-render', () => this.render()); }

  previewSoon(ids) {
    if (!ids || this._fullPreview) { this._fullPreview = true; onFrame('canvas-preview', () => { this._fullPreview = false; this._previewIds = null; this.render(); }); return; }
    this._previewIds = new Set([...(this._previewIds || []), ...ids]);
    onFrame('canvas-preview', () => {
      const set = this._previewIds;
      this._previewIds = null;
      if (this._fullPreview) { this._fullPreview = false; this.render(); return; }
      this.preview(set ? [...set] : null);
    });
  }

  /** Full render of the visible spread (or master). */
  render() {
    const s = app.session, doc = app.doc;
    if (!s || !doc) return;
    const pages = this.spreadPages();
    const key = `${s.id}|${app.isMasterMode ? `m${s.view.masterIndex}` : pages.map((p) => p.page && p.page.id).join(',')}|${doc.setup.width}x${doc.setup.height}`;
    if (key !== this._spreadKey) {
      this._spreadKey = key;
      this.slots = pages.map((p) => {
        const renderEl = h('div', { class: 'page-render' });
        const guidesEl = h('div', { class: 'guides-layer' });
        const el = h('div', { class: 'page-slot', dataset: { index: String(p.index) } }, renderEl, guidesEl);
        return { ...p, el, renderEl, guidesEl, offset: 0, rctx: null };
      });
      this.spread.replaceChildren(...this.slots.map((sl) => sl.el));
      this.spread.classList.toggle('is-spread', this.slots.length > 1);
      this.spread.classList.toggle('is-master', app.isMasterMode);
    } else {
      this.slots.forEach((sl, i) => { sl.page = pages[i].page; sl.index = pages[i].index; });
    }
    const first = this._needsInitialPosition !== false;
    this.layout();
    for (const slot of this.slots) this.renderSlot(slot);
    if (this._pendingScroll) {
      this._restoring = true;
      this.viewport.scrollLeft = this._pendingScroll.x;
      this.viewport.scrollTop = this._pendingScroll.y;
      this._pendingScroll = null;
      this._restoring = false;
      if (s.view.fit) this.centerSpread();
    } else if (first || s.view.fit) {
      this.centerSpread();
    }
    this._needsInitialPosition = false;
    this.overlay.update();
    this.rulers.draw();
    for (const slot of this.slots) app.emit('render', { session: s, pageIndex: slot.index, container: slot.renderEl });
  }

  renderSlot(slot) {
    const doc = app.doc;
    const tmp = h('div', { class: 'page-render' });
    const { rctx } = renderPage(tmp, doc, slot.page, { mode: 'edit', pageIndex: slot.index < 0 ? 0 : slot.index, showHidden: !!prefs.get('showHidden') });
    slot.rctx = rctx;
    const editId = app.editing && app.editing.session === app.session ? app.editing.frameId : null;
    const live = editId ? this.topNodeIn(slot.renderEl, editId) : null;
    if (live && live.isConnected) {
      // keep the node being edited in the DOM (focus and caret survive); swap everything else
      slot.renderEl.className = tmp.className;
      slot.renderEl.style.cssText = tmp.style.cssText;
      const newMaster = tmp.querySelector(':scope > .layer-master');
      const oldMaster = slot.renderEl.querySelector(':scope > .layer-master');
      if (oldMaster) oldMaster.remove();
      const oldLayer = slot.renderEl.querySelector(':scope > .layer-page');
      const newLayer = tmp.querySelector(':scope > .layer-page');
      if (newMaster) slot.renderEl.insertBefore(newMaster, oldLayer);
      const topId = live.dataset.id;
      const replacement = newLayer.querySelector(`:scope > [data-id="${CSS.escape(topId)}"]`);
      for (const n of [...oldLayer.children]) if (n !== live) n.remove();
      let after = true;
      for (const n of [...newLayer.children]) {
        if (n === replacement) { after = false; this.syncNodeBox(live, n); continue; }
        if (after) oldLayer.insertBefore(n, live); else oldLayer.appendChild(n);
      }
    } else {
      slot.renderEl.replaceWith(tmp);
      slot.renderEl = tmp;
    }
    drawGuides(this, slot);
  }

  /** Copy geometry and frame chrome from a freshly rendered node onto the live (editing) node. */
  syncNodeBox(live, fresh) {
    for (const p of ['left', 'top', 'width', 'height', 'transform', 'opacity', 'background', 'borderRadius', 'filter']) live.style[p] = fresh.style[p];
    const box = live.querySelector('.tx-box'), fbox = fresh.querySelector('.tx-box');
    if (box && fbox) {
      box.style.cssText = fbox.style.cssText;
      const flow = live.querySelector('.tx-flow'), fflow = fresh.querySelector('.tx-flow');
      if (flow && fflow) {
        for (const p of ['fontFamily', 'fontSize', 'color', 'fontWeight', 'fontStyle', 'textDecoration', 'textTransform', 'letterSpacing', 'lineHeight', 'textAlign', 'columnCount', 'columnGap']) flow.style[p] = fflow.style[p];
      }
    }
    live.querySelectorAll(':scope > svg.frame-stroke').forEach((n) => n.remove());
    fresh.querySelectorAll(':scope > svg.frame-stroke').forEach((n) => live.appendChild(n));
  }

  /** Re-render only the given elements (during gestures). Text changes fall back to a full render. */
  preview(ids) {
    if (!app.session) return;
    if (!ids) { this.render(); return; }
    const slot = this.currentSlot();
    if (!slot || !slot.rctx) { this.render(); return; }
    const doc = app.doc;
    for (const id of ids) {
      const hit = findElement(doc, id);
      if (!hit) continue;
      let top = hit;
      while (top.parent) top = findElement(doc, top.parent.id);
      if (!top || (top.page !== slot.page && top.master !== slot.page)) continue;
      const old = this.topNodeIn(slot.renderEl, top.el.id);
      if (!old) { this.render(); return; }
      let needsLayout = false;
      const walk = (e) => { if (e.type === 'text') needsLayout = true; if (e.children) e.children.forEach(walk); };
      walk(top.el);
      if (needsLayout && this.gestureKind !== 'move') { this.render(); return; }
      if (needsLayout && old.isConnected) {
        // moving a text frame: keep its laid-out content, update the box only
        const fresh = renderElement(top.el, slot.rctx);
        for (const p of ['left', 'top', 'width', 'height', 'transform']) old.style[p] = fresh.style[p];
        continue;
      }
      old.replaceWith(renderElement(top.el, slot.rctx));
    }
    this.overlay.update();
  }

  // ---------------------------------------------------------------- lookup & coordinates

  /** The slot of the editing surface (current page or master). */
  currentSlot() {
    if (app.isMasterMode) return this.slots[0] || null;
    return this.slots.find((s) => s.index === app.pageIndex) || this.slots[0] || null;
  }

  slotForPageIndex(i) { return this.slots.find((s) => s.index === i) || null; }

  topNodeIn(renderEl, id) {
    const layer = renderEl.querySelector(':scope > .layer-page');
    if (!layer) return null;
    const n = layer.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!n) return null;
    let top = n;
    while (top.parentElement && top.parentElement !== layer) top = top.parentElement;
    return top;
  }

  /** DOM node rendering element `id` on the canvas (null when not visible). */
  nodeFor(id) {
    for (const slot of this.slots) {
      const n = slot.renderEl.querySelector(`.layer-page [data-id="${CSS.escape(id)}"]`);
      if (n) return n;
    }
    return null;
  }

  /** Spread coordinates (document px from the spread's top-left) for a client point. */
  clientToSpread(clientX, clientY) {
    const r = this.viewport.getBoundingClientRect();
    const x = (clientX - r.left - this.viewport.clientLeft + this.viewport.scrollLeft - this.geo.ox) / this.zoom;
    const y = (clientY - r.top - this.viewport.clientTop + this.viewport.scrollTop - this.geo.oy) / this.zoom;
    return { x, y };
  }

  /** Slot under a spread x coordinate (nearest page). */
  slotAtSpreadX(x) {
    if (!this.slots.length) return null;
    const W = app.doc.setup.width;
    return this.slots.find((s) => x >= s.offset && x < s.offset + W) || (x < 0 ? this.slots[0] : this.slots[this.slots.length - 1]);
  }

  /**
   * Page coordinates for a client point: { x, y, pageIndex, slot } (pageIndex -1 in master mode).
   * With `slot` given, coordinates are relative to that page even if the pointer is elsewhere.
   */
  clientToPage(clientX, clientY, slot = null) {
    const p = this.clientToSpread(clientX, clientY);
    const s = slot || this.slotAtSpreadX(p.x);
    if (!s) return { x: p.x, y: p.y, pageIndex: app.pageIndex, slot: null };
    return { x: p.x - s.offset, y: p.y, pageIndex: s.index, slot: s };
  }

  /** Scroll-content (overlay) coordinates of a page point on a slot. */
  pageToContent(slot, x, y) {
    return { x: this.geo.ox + ((slot ? slot.offset : 0) + x) * this.zoom, y: this.geo.oy + y * this.zoom };
  }

  /** Spread point at the centre of the viewport. */
  viewCenter() {
    if (!this.zoom) return null;
    return {
      x: (this.viewport.scrollLeft + this.viewport.clientWidth / 2 - this.geo.ox) / this.zoom,
      y: (this.viewport.scrollTop + this.viewport.clientHeight / 2 - this.geo.oy) / this.zoom
    };
  }

  scrollToSpreadPoint(x, y, vx = this.viewport.clientWidth / 2, vy = this.viewport.clientHeight / 2) {
    const s = anchoredScroll(x, y, vx, vy, this.zoom, this.geo.ox, this.geo.oy);
    this.viewport.scrollLeft = s.left;
    this.viewport.scrollTop = s.top;
  }

  // ---------------------------------------------------------------- zoom

  /**
   * Set the zoom (clamped 10–800 %). `anchor` is a client point that stays fixed (default: the
   * viewport centre).
   */
  zoomTo(z, anchor = null) {
    const s = app.session;
    if (!s) return;
    const nz = clampZoom(z);
    const r = this.viewport.getBoundingClientRect();
    const vx = anchor ? anchor.x - r.left - this.viewport.clientLeft : this.viewport.clientWidth / 2;
    const vy = anchor ? anchor.y - r.top - this.viewport.clientTop : this.viewport.clientHeight / 2;
    const pt = anchor ? this.clientToSpread(anchor.x, anchor.y) : this.viewCenter();
    s.view.fit = null;
    this.zoom = nz;
    this.layout();
    if (pt) this.scrollToSpreadPoint(pt.x, pt.y, vx, vy);
    this.overlay.update();
    this.rulers.draw();
    app.emit('view', s.view);
  }

  zoomIn(anchor) { this.zoomTo(stepZoom(this.zoom, 1), anchor); }
  zoomOut(anchor) { this.zoomTo(stepZoom(this.zoom, -1), anchor); }
  actualSize() { this.zoomTo(1); }

  fit(mode) {
    const s = app.session;
    if (!s) return;
    s.view.fit = mode;
    this.layout();
    this.centerSpread();
    if (mode === 'width') this.viewport.scrollTop = Math.max(0, this.geo.oy - 24);
    this.overlay.update();
    this.rulers.draw();
    app.emit('view', s.view);
  }

  fitPage() { this.fit('page'); }
  fitWidth() { this.fit('width'); }

  /** Scroll so an element is visible (switching page if needed). */
  scrollToElement(id) {
    const doc = app.doc;
    const hit = doc && findElement(doc, id);
    if (!hit) return;
    if (hit.page) {
      const i = doc.pages.indexOf(hit.page);
      if (app.isMasterMode || !this.slotForPageIndex(i)) app.goToPage(i);
      else if (i !== app.pageIndex) app.goToPage(i);
    }
    this.render();
    const slot = hit.page ? this.slotForPageIndex(doc.pages.indexOf(hit.page)) : this.currentSlot();
    if (!slot) return;
    const el = hit.el;
    const a = this.pageToContent(slot, el.x, el.y), b = this.pageToContent(slot, el.x + el.w, el.y + el.h);
    const vp = this.viewport;
    if (a.x < vp.scrollLeft || b.x > vp.scrollLeft + vp.clientWidth) vp.scrollLeft = (a.x + b.x) / 2 - vp.clientWidth / 2;
    if (a.y < vp.scrollTop || b.y > vp.scrollTop + vp.clientHeight) vp.scrollTop = (a.y + b.y) / 2 - vp.clientHeight / 2;
  }

  // ---------------------------------------------------------------- tools & groups

  /** 'select' | 'hand' | { kind: 'text'|'shape'|'line'|'picture'|'table', shape?, arrow? } */
  setTool(tool) {
    if (app.editing) this.text.stop();
    this.tool = tool || 'select';
    this.viewport.dataset.tool = typeof this.tool === 'string' ? this.tool : `draw-${this.tool.kind}`;
    app.emit('tool', this.tool);
  }

  enteredGroupCheck() {
    if (!this.enteredGroup) return;
    const doc = app.doc;
    const g = doc && findElement(doc, this.enteredGroup);
    const sel = app.selectionIds;
    if (!g || !sel.length || !sel.every((id) => { const hit = findElement(doc, id); return hit && hit.parent && hit.parent.id === this.enteredGroup; })) this.enteredGroup = null;
  }

  /** Public API object installed as app.canvas. */
  api() {
    const c = this;
    return {
      el: this.mount,
      viewport: this.viewport,
      get zoom() { return c.zoom; },
      get tool() { return c.tool; },
      zoomTo: (z, anchor) => this.zoomTo(z, anchor),
      zoomIn: () => this.zoomIn(),
      zoomOut: () => this.zoomOut(),
      fitPage: () => this.fitPage(),
      fitWidth: () => this.fitWidth(),
      actualSize: () => this.actualSize(),
      clientToPage: (x, y) => { const p = this.clientToPage(x, y); return { x: p.x, y: p.y, pageIndex: p.pageIndex }; },
      nodeFor: (id) => this.nodeFor(id),
      scrollToElement: (id) => this.scrollToElement(id),
      setTool: (t) => this.setTool(t),
      requestRender: () => this.renderSoon(),
      render: () => this.render(),
      pageContainer: (pageIndex) => { const s = pageIndex === undefined ? this.currentSlot() : this.slotForPageIndex(pageIndex); return s ? s.renderEl : null; }
    };
  }
}

/**
 * Create the canvas inside `mount` and install app.canvas and app.textEdit.
 * @param {HTMLElement} mount
 * @returns {Canvas}
 */
export function installCanvas(mount) {
  const cv = new Canvas(mount);
  app.canvas = cv.api();
  app.textEdit = cv.text.api();
  return cv;
}
