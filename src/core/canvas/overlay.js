// Screen-space overlay above the page: selection frame with resize/rotate handles (constant size at
// any zoom), line endpoint handles, lock badges, marquee, smart-guide (snap) lines, drawing
// rubber band and live measurement readouts. Never part of export rendering.

import { app } from '../app.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { unionBounds, findElement } from '../model.js';
import { lineEndpoints } from '../geometry.js';
import { formatUnit } from '../units.js';

export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const BASE_ANGLE = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 };
const CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'];

/** Resize cursor for a handle on a box rotated by `rot` degrees. */
export function handleCursor(handle, rot = 0) {
  const a = (((BASE_ANGLE[handle] + rot) % 180) + 180) % 180;
  return CURSORS[Math.round(a / 45) % 4];
}

/** The overlay controller. */
export class Overlay {
  constructor(cv) {
    this.cv = cv;
    this.root = cv.overlayEl;
    this.selLayer = h('div', { class: 'ov-sel' });
    this.snapLayer = h('div', { class: 'ov-snap' });
    this.marqueeEl = h('div', { class: 'ov-marquee', hidden: true });
    this.drawEl = h('div', { class: 'ov-draw', hidden: true });
    this.readout = h('div', { class: 'ov-readout', hidden: true });
    this.root.append(this.selLayer, this.snapLayer, this.marqueeEl, this.drawEl, this.readout);
  }

  /** Redraw the selection frame from the model. */
  update() {
    const cv = this.cv;
    const out = [];
    const slot = cv.currentSlot();
    const doc = app.doc;
    if (!doc || !slot || cv.hideSelection) { this.selLayer.replaceChildren(); return; }
    this.root.style.width = `${cv.geo.width}px`;
    this.root.style.height = `${cv.geo.height}px`;
    const z = cv.zoom;
    if (app.editing && app.editing.session === app.session) {
      const hit = findElement(doc, app.editing.frameId);
      if (hit) out.push(this.box(slot, hit.el, 'ov-box editing'));
      this.selLayer.replaceChildren(...out);
      return;
    }
    const sel = app.selection;
    if (!sel.length) { this.selLayer.replaceChildren(); return; }
    const locked = sel.some((el) => el.locked);
    if (cv.enteredGroup) {
      const g = findElement(doc, cv.enteredGroup);
      if (g) out.push(this.box(slot, g.el, 'ov-box group-entered'));
    }
    if (sel.length === 1) {
      const el = sel[0];
      if (el.type === 'line' && !locked) {
        const box = this.box(slot, el, 'ov-box line');
        out.push(box);
        const [p1, p2] = lineEndpoints(el);
        for (const [name, p] of [['start', p1], ['end', p2]]) {
          const c = cv.pageToContent(slot, p.x, p.y);
          out.push(h('div', { class: 'ov-handle endpoint', dataset: { handle: name }, style: { left: `${c.x}px`, top: `${c.y}px` } }));
        }
      } else {
        const box = this.box(slot, el, `ov-box${locked ? ' locked' : ''}`);
        if (!locked) this.addHandles(box, el.rot || 0, el.w * z, el.h * z);
        else box.appendChild(h('div', { class: 'ov-lock', title: 'Locked' }, icon('lock')));
        out.push(box);
      }
    } else {
      for (const el of sel) out.push(this.box(slot, el, 'ov-box member'));
      const b = unionBounds(sel);
      const box = this.box(slot, { x: b.x, y: b.y, w: b.w, h: b.h, rot: 0 }, `ov-box multi${locked ? ' locked' : ''}`);
      if (!locked) this.addHandles(box, 0, b.w * z, b.h * z);
      else box.appendChild(h('div', { class: 'ov-lock', title: 'Contains locked objects' }, icon('lock')));
      out.push(box);
    }
    this.selLayer.replaceChildren(...out);
  }

  /** A rotated frame div for a model box. */
  box(slot, el, cls) {
    const z = this.cv.zoom;
    const c = this.cv.pageToContent(slot, el.x + el.w / 2, el.y + el.h / 2);
    const w = el.w * z, hh = el.h * z;
    return h('div', {
      class: cls,
      dataset: el.id ? { id: el.id } : {},
      style: { left: `${c.x - w / 2}px`, top: `${c.y - hh / 2}px`, width: `${w}px`, height: `${hh}px`, transform: el.rot ? `rotate(${el.rot}deg)` : '' }
    });
  }

  addHandles(box, rot, w, hh) {
    const small = w < 24 || hh < 24;
    for (const name of HANDLES) {
      if (small && name.length === 1 && ((name === 'n' || name === 's') ? w < 24 : hh < 24)) continue;
      box.appendChild(h('div', { class: `ov-handle h-${name}`, dataset: { handle: name }, style: { cursor: handleCursor(name, rot) } }));
    }
    box.appendChild(h('div', { class: 'ov-rot-stem' }));
    box.appendChild(h('div', { class: 'ov-handle rot', dataset: { handle: 'rot' }, title: 'Rotate (Shift: 15° steps)' }));
  }

  /** Smart-guide lines: [{ axis: 'x'|'y', v, kind }] in page coordinates of `slot`. */
  showSnapLines(lines, slot) {
    const cv = this.cv;
    const out = (lines || []).map((l) => {
      const c = cv.pageToContent(slot, l.axis === 'x' ? l.v : 0, l.axis === 'y' ? l.v : 0);
      return l.axis === 'x'
        ? h('div', { class: `ov-snapline v k-${l.kind}`, style: { left: `${Math.round(c.x)}px` } })
        : h('div', { class: `ov-snapline h k-${l.kind}`, style: { top: `${Math.round(c.y)}px` } });
    });
    this.snapLayer.replaceChildren(...out);
  }

  /** Marquee rectangle in content coordinates (null hides it). */
  showMarquee(r) {
    this.marqueeEl.hidden = !r;
    if (r) Object.assign(this.marqueeEl.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  }

  /** Rubber band while drawing a new object (page rect on `slot`, or null). */
  showDraw(rect, slot, kind) {
    this.drawEl.hidden = !rect;
    if (!rect) return;
    const a = this.cv.pageToContent(slot, rect.x, rect.y);
    this.drawEl.className = `ov-draw k-${kind || 'box'}`;
    if (kind === 'line') {
      const len = Math.hypot(rect.x2 - rect.x, rect.y2 - rect.y) * this.cv.zoom;
      const ang = Math.atan2(rect.y2 - rect.y, rect.x2 - rect.x) * 180 / Math.PI;
      Object.assign(this.drawEl.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${len}px`, height: '0px', transform: `rotate(${ang}deg)` });
    } else {
      Object.assign(this.drawEl.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${rect.w * this.cv.zoom}px`, height: `${rect.h * this.cv.zoom}px`, transform: '' });
    }
  }

  /** Live measurement label near a client point (null hides it). */
  showReadout(text, clientPt) {
    if (!text || !clientPt) { this.readout.hidden = true; return; }
    const r = this.cv.viewport.getBoundingClientRect();
    const x = clientPt.x - r.left + this.cv.viewport.scrollLeft + 14;
    const y = clientPt.y - r.top + this.cv.viewport.scrollTop + 18;
    this.readout.textContent = text;
    this.readout.hidden = false;
    this.readout.style.left = `${x}px`;
    this.readout.style.top = `${y}px`;
  }

  /** Readout while dragging a ruler guide. */
  showGuideReadout(axis, v, ev) {
    if (!axis || !ev) { this.showReadout(null); return; }
    this.showReadout(`${axis === 'h' ? 'Y' : 'X'} ${formatUnit(v, app.doc.setup.units, true)}`, { x: ev.clientX, y: ev.clientY });
  }

  clearTransient() {
    this.showSnapLines([]);
    this.showMarquee(null);
    this.showDraw(null);
    this.showReadout(null);
  }
}
