// Horizontal and vertical rulers in document units. Zero is the top-left of the current page; the
// page extent is drawn light, the selection extent is tinted and the pointer position is marked.
// Dragging from a ruler creates a ruler guide (one undo step).

import { app } from '../app.js';
import { prefs } from '../prefs.js';
import { unionBounds } from '../model.js';
import { rulerTicks, rulerLabel } from './viewport.js';

const SIZE = 22;

/** Ruler renderer + guide creation. */
export class Rulers {
  constructor(cv) {
    this.cv = cv;
    this.pointer = null;
    cv.viewport.addEventListener('pointermove', (e) => { this.pointer = { x: e.clientX, y: e.clientY }; this.drawSoon(); });
    cv.viewport.addEventListener('pointerleave', () => { this.pointer = null; this.drawSoon(); });
    cv.hRuler.addEventListener('pointerdown', (e) => this.startGuide(e, 'h'));
    cv.vRuler.addEventListener('pointerdown', (e) => this.startGuide(e, 'v'));
    app.on('selection', () => this.drawSoon());
    app.on('doc-change', () => this.drawSoon());
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => this.drawSoon());
  }

  drawSoon() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.draw(); });
  }

  colors() {
    const cs = getComputedStyle(this.cv.mount);
    const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    return {
      bg: v('--ruler-bg', '#ece8df'), page: v('--ruler-page', '#fffdf8'), tick: v('--ruler-tick', '#8a8d86'),
      text: v('--ruler-text', '#4f5550'), sel: v('--ruler-sel', 'rgba(43,107,100,.18)'), mark: v('--ruler-mark', '#b0452f')
    };
  }

  draw() {
    const cv = this.cv;
    if (!prefs.get('rulers')) return;
    const doc = app.doc;
    const slot = cv.currentSlot();
    const col = this.colors();
    const dpr = window.devicePixelRatio || 1;
    const vr = cv.viewport.getBoundingClientRect();
    for (const axis of ['h', 'v']) {
      const c = axis === 'h' ? cv.hRuler : cv.vRuler;
      const len = axis === 'h' ? cv.viewport.clientWidth : cv.viewport.clientHeight;
      const W = axis === 'h' ? len : SIZE, H = axis === 'h' ? SIZE : len;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      c.style.width = `${W}px`;
      c.style.height = `${H}px`;
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = col.bg;
      g.fillRect(0, 0, W, H);
      if (!doc || !slot || !len) continue;
      const z = cv.zoom;
      const origin = axis === 'h'
        ? cv.geo.ox + slot.offset * z - cv.viewport.scrollLeft
        : cv.geo.oy - cv.viewport.scrollTop;
      const pageLen = (axis === 'h' ? doc.setup.width : doc.setup.height) * z;
      // page extent
      g.fillStyle = col.page;
      if (axis === 'h') g.fillRect(origin, 3, pageLen, SIZE - 3); else g.fillRect(3, origin, SIZE - 3, pageLen);
      // selection extent
      const sel = app.selection;
      if (sel.length && !app.editing) {
        const b = unionBounds(sel);
        g.fillStyle = col.sel;
        if (axis === 'h') g.fillRect(origin + b.x * z, 3, b.w * z, SIZE - 3); else g.fillRect(3, origin + b.y * z, SIZE - 3, b.h * z);
      }
      // ticks
      const unit = doc.setup.units;
      const t = rulerTicks(z, unit);
      const step = t.major / t.minor;
      const startV = Math.floor((-origin / t.pxPerUnit) / t.major) * t.major;
      const endV = (len - origin) / t.pxPerUnit;
      g.strokeStyle = col.tick;
      g.fillStyle = col.text;
      g.lineWidth = 1;
      g.font = '10px "EB Garamond", Georgia, serif';
      g.textBaseline = 'top';
      g.beginPath();
      let i = 0;
      for (let v = startV; v <= endV + step && i < 5000; v = startV + (++i) * step) {
        const p = Math.round(origin + v * t.pxPerUnit) + 0.5;
        const k = Math.round((v - startV) / step) % t.minor;
        const major = k === 0;
        const half = !major && t.minor % 2 === 0 && k === t.minor / 2;
        const th = major ? SIZE - 4 : half ? 8 : 5;
        if (axis === 'h') { g.moveTo(p, SIZE); g.lineTo(p, SIZE - th); } else { g.moveTo(SIZE, p); g.lineTo(SIZE - th, p); }
        if (major) {
          const label = rulerLabel(v);
          if (axis === 'h') g.fillText(label, p + 3, 2);
          else { g.save(); g.translate(2, p + 3); g.rotate(Math.PI / 2); g.translate(0, -10); g.fillText(label, 0, 0); g.restore(); }
        }
      }
      g.stroke();
      // bottom/right border
      g.fillStyle = col.tick;
      if (axis === 'h') g.fillRect(0, SIZE - 1, W, 1); else g.fillRect(SIZE - 1, 0, 1, H);
      // pointer marker
      if (this.pointer) {
        const p = axis === 'h' ? this.pointer.x - vr.left - cv.viewport.clientLeft : this.pointer.y - vr.top - cv.viewport.clientTop;
        g.fillStyle = col.mark;
        if (axis === 'h') g.fillRect(Math.round(p), 0, 1, SIZE); else g.fillRect(0, Math.round(p), SIZE, 1);
      }
    }
  }

  /** Drag from a ruler: 'h' ruler creates a horizontal guide, 'v' ruler a vertical one. */
  startGuide(e, ruler) {
    if (e.button !== 0 || !app.doc) return;
    const cv = this.cv;
    const slot = cv.currentSlot();
    if (!slot) return;
    e.preventDefault();
    const axis = ruler === 'h' ? 'h' : 'v';
    (ruler === 'h' ? cv.hRuler : cv.vRuler).setPointerCapture(e.pointerId);
    app.beginGesture('Add Guide');
    let index = -1;
    const page = slot.page;
    const move = (ev) => {
      const p = cv.clientToPage(ev.clientX, ev.clientY, slot);
      const v = Math.round((axis === 'h' ? p.y : p.x) * 100) / 100;
      const inside = this.overViewport(ev);
      if (!page.guides) page.guides = { v: [], h: [] };
      const list = page.guides[axis];
      if (inside && index < 0) { list.push(v); index = list.length - 1; }
      else if (inside) list[index] = v;
      else if (index >= 0) { list.splice(index, 1); index = -1; }
      cv.overlay.showGuideReadout(axis, v, inside ? ev : null);
      app.preview([]);
      cv.renderSoon();
    };
    const up = (ev) => {
      const el = ruler === 'h' ? cv.hRuler : cv.vRuler;
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      cv.overlay.showGuideReadout(null);
      app.endGesture(index >= 0 && ev.type === 'pointerup');
    };
    const el = ruler === 'h' ? cv.hRuler : cv.vRuler;
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  overViewport(ev) {
    const r = this.cv.viewport.getBoundingClientRect();
    return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
  }
}
