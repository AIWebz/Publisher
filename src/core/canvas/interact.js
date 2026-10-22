// Pointer interactions on the canvas: click/toggle selection, marquee, move with smart snapping,
// resize (rotated boxes, keep-aspect, from-centre, multi-selection scaling), rotation, line
// endpoints, drawing new objects, ruler-guide dragging, panning, wheel zoom, double-click and the
// context menu. Every drag is one undo step (app.beginGesture / endGesture).

import { app } from '../app.js';
import { prefs } from '../prefs.js';
import { registry } from '../registry.js';
import { clone, findElement, unionBounds, elementBounds, translateElement } from '../model.js';
import { resizeBox, scaleElements, rotateElements, snapAngle, normAngle, lineEndpoints, lineFromPoints, round2 } from '../geometry.js';
import { collectSnapTargets, snapMove, snapResize, snapPoint } from '../snapping.js';
import { formatUnit } from '../units.js';
import { dialogOpen } from '../ui/dialog.js';
import { collectContextItems } from '../ui/menu.js';
import { isTextTarget } from '../shortcuts.js';
import { buildObject, insertLabel, DEFAULT_SIZES } from '../insert.js';
import { pickImageFiles } from '../images.js';
import { fillPicture } from '../insert.js';

const DRAG_THRESHOLD = 3;   // screen px before a press becomes a drag
const SNAP_PX = 6;          // snapping distance in screen px

/** Wire pointer, wheel and keyboard interactions for a canvas controller. */
export function installInteractions(cv) {
  const vp = cv.viewport;
  vp.addEventListener('pointerdown', (e) => onPointerDown(cv, e));
  vp.addEventListener('dblclick', (e) => onDoubleClick(cv, e));
  vp.addEventListener('contextmenu', (e) => onContextMenu(cv, e));
  vp.addEventListener('wheel', (e) => onWheel(cv, e), { passive: false });
  vp.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ' && !e.repeat && !isTextTarget(e.target) && !app.editing && app.session && !dialogOpen()) {
      cv.spaceDown = true;
      vp.classList.add('pan-ready');
      if (e.target === document.body || vp.contains(e.target)) e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => { if (e.key === ' ') { cv.spaceDown = false; vp.classList.remove('pan-ready'); } });
  window.addEventListener('blur', () => { cv.spaceDown = false; vp.classList.remove('pan-ready'); });
}

// ------------------------------------------------------------------------------------- helpers

/** Resolve the element under an event target: { slot, chain: [topId, childId, …] } or null. */
function hitElement(cv, target) {
  const node = target.closest && target.closest('.layer-page .el[data-id]');
  if (!node || !cv.viewport.contains(node)) return null;
  const slotEl = node.closest('.page-slot');
  const slot = cv.slots.find((s) => s.el === slotEl);
  if (!slot) return null;
  const chain = [];
  for (let n = node; n && n.classList && n.classList.contains('el'); n = n.parentElement && n.parentElement.closest('.el')) {
    if (!slotEl.contains(n)) break;
    chain.unshift(n.dataset.id);
  }
  return { slot, chain };
}

/** Which id a click on `chain` selects, honouring an entered group. */
function pickId(cv, chain) {
  if (cv.enteredGroup) {
    const k = chain.indexOf(cv.enteredGroup);
    if (k >= 0 && chain[k + 1]) return chain[k + 1];
    cv.enteredGroup = null;
  }
  return chain[0];
}

function snapOpts() {
  const s = prefs.get('snap') || {};
  const g = prefs.get('guides') || {};
  return { page: s.page !== false, margins: s.guides !== false, columns: s.guides !== false, guides: s.guides !== false, objects: s.objects !== false, grid: !!(s.grid && g.grid) };
}

function snapTargets(cv, slot, excludeIds) {
  const doc = app.doc;
  const ex = new Set(excludeIds);
  const others = slot.page.elements.filter((el) => !ex.has(el.id) && !el.hidden);
  return collectSnapTargets(doc, slot.page, slot.index < 0 ? 0 : slot.index, others, snapOpts());
}

const snapping = (e) => prefs.get('snap.enabled') !== false && !e.altKey;
const fmt = (px) => formatUnit(px, app.doc.setup.units, true);

/** Copy saved position (x/y, and children's recursively) back onto an element. */
function resetPos(el, s) {
  el.x = s.x; el.y = s.y;
  if (el.type === 'group' && s.children) el.children.forEach((c, i) => s.children[i] && resetPos(c, s.children[i]));
}

/** Track a drag with pointer capture. Handlers get the PointerEvent. */
function track(e, { move, up, cancel }) {
  const el = e.currentTarget && e.currentTarget.setPointerCapture ? e.currentTarget : e.target;
  try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  const onMove = (ev) => { if (ev.pointerId === e.pointerId) move && move(ev); };
  const onUp = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    detach();
    if (ev.type === 'pointercancel') (cancel || up) && (cancel || up)(ev); else up && up(ev);
  };
  const onKey = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); detach(); cancel && cancel(ev); } };
  function detach() {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    window.removeEventListener('keydown', onKey, true);
    try { el.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  }
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', onKey, true);
}

// ------------------------------------------------------------------------------------- pointer down

function onPointerDown(cv, e) {
  if (!app.session || dialogOpen()) return;
  const editing = app.editing && app.editing.session === app.session ? app.editing : null;
  const inEditor = editing && editing.root && editing.root.contains(e.target);
  if (!inEditor && document.activeElement !== cv.viewport) cv.viewport.focus({ preventScroll: true });
  if (e.button === 1 || (e.button === 0 && (cv.spaceDown || cv.tool === 'hand'))) { e.preventDefault(); startPan(cv, e); return; }
  if (e.button !== 0) return;
  if (inEditor) return;
  const handle = e.target.closest('.ov-handle');
  if (handle) { e.preventDefault(); startHandle(cv, e, handle.dataset.handle); return; }
  if (editing) app.textEdit.stop();
  const guide = e.target.closest('.rguide');
  if (guide && cv.tool === 'select') { e.preventDefault(); startGuideDrag(cv, e, guide); return; }
  if (cv.tool && typeof cv.tool === 'object') { e.preventDefault(); startDraw(cv, e); return; }
  const hit = hitElement(cv, e.target);
  if (hit) { e.preventDefault(); pressElement(cv, e, hit); return; }
  e.preventDefault();
  startMarquee(cv, e);
}

function ensurePage(cv, slot) {
  if (!slot || app.isMasterMode || slot.index === app.pageIndex) return;
  app.goToPage(slot.index);
}

// ------------------------------------------------------------------------------------- select & move

function pressElement(cv, e, hit) {
  ensurePage(cv, hit.slot);
  const id = pickId(cv, hit.chain);
  const toggle = e.shiftKey || e.ctrlKey || e.metaKey;
  const wasSelected = app.selectionIds.includes(id);
  if (toggle) app.select([id], { toggle: true });
  else if (!wasSelected) app.select([id]);
  const start = { x: e.clientX, y: e.clientY };
  let moving = null;
  track(e, {
    move: (ev) => {
      if (!moving) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return;
        if (!app.selectionIds.includes(id)) return;
        moving = beginMove(cv, e, hit.slot);
        if (!moving) return;
      }
      moving.move(ev);
    },
    up: (ev) => {
      if (moving) { moving.end(true); return; }
      if (!toggle && wasSelected && app.selectionIds.length > 1) app.select([id]);
      // a click on a text box puts the cursor in its text (drag still moves the box)
      const hitEl = !toggle && app.selectionIds.length === 1 ? findElement(app.doc, id) : null;
      if (hitEl && hitEl.el.type === 'text' && !hitEl.el.locked) app.textEdit.start(id, { caret: { x: ev.clientX, y: ev.clientY } });
    },
    cancel: () => { if (moving) moving.end(false); }
  });
}

/** Start moving the selection. Returns { move(ev), end(commit) } or null when not movable. */
function beginMove(cv, e0, slot) {
  const sel = app.selection;
  if (!sel.length) return null;
  if (sel.some((el) => el.locked)) { app.ui.toast('Locked objects cannot be moved. Unlock them first.'); return null; }
  app.beginGesture(sel.length > 1 ? 'Move Objects' : 'Move');
  cv.gestureKind = 'move';
  const starts = new Map(sel.map((el) => [el.id, clone(el)]));
  const startBox = unionBounds(sel);
  const p0 = cv.clientToPage(e0.clientX, e0.clientY, slot);
  const targets = snapTargets(cv, slot, sel.map((el) => el.id));
  const ids = sel.map((el) => el.id);
  return {
    move(ev) {
      const p = cv.clientToPage(ev.clientX, ev.clientY, slot);
      let dx = p.x - p0.x, dy = p.y - p0.y;
      if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      let lines = [];
      if (snapping(ev)) {
        const r = snapMove({ ...startBox, x: startBox.x + dx, y: startBox.y + dy }, targets, SNAP_PX / cv.zoom);
        if (!ev.shiftKey || dx) dx += r.dx;
        if (!ev.shiftKey || dy) dy += r.dy;
        lines = r.lines.filter((l) => !ev.shiftKey || (l.axis === 'x' ? dx : dy));
      }
      dx = round2(dx); dy = round2(dy);
      const doc = app.doc;
      for (const id of ids) {
        const hit = findElement(doc, id);
        if (!hit) continue;
        resetPos(hit.el, starts.get(id));
        translateElement(hit.el, dx, dy);
      }
      app.preview(ids);
      cv.overlay.showSnapLines(lines, slot);
      cv.overlay.showReadout(`X ${fmt(startBox.x + dx)}   Y ${fmt(startBox.y + dy)}`, { x: ev.clientX, y: ev.clientY });
    },
    end(commit) {
      cv.overlay.clearTransient();
      cv.gestureKind = null;
      app.endGesture(commit);
    }
  };
}

// ------------------------------------------------------------------------------------- handles

function startHandle(cv, e, handle) {
  const sel = app.selection;
  const slot = cv.currentSlot();
  if (!sel.length || !slot || sel.some((el) => el.locked)) return;
  let op;
  if (handle === 'rot') op = beginRotate(cv, e, sel, slot);
  else if (handle === 'start' || handle === 'end') op = beginLineEnd(cv, e, sel[0], handle, slot);
  else op = beginResize(cv, e, sel, handle, slot);
  if (!op) return;
  track(e, { move: (ev) => op.move(ev), up: () => op.end(true), cancel: () => op.end(false) });
}

function endOp(cv, commit) {
  cv.overlay.clearTransient();
  cv.gestureKind = null;
  app.endGesture(commit);
}

function beginResize(cv, e0, sel, handle, slot) {
  const single = sel.length === 1 && sel[0].type !== 'group' ? sel[0] : null;
  app.beginGesture('Resize');
  cv.gestureKind = 'resize';
  const p0 = cv.clientToPage(e0.clientX, e0.clientY, slot);
  const ids = sel.map((el) => el.id);
  const starts = new Map(sel.map((el) => [el.id, clone(el)]));
  const targets = snapTargets(cv, slot, ids);
  const corner = handle.length === 2;
  const startBox = single ? { x: single.x, y: single.y, w: single.w, h: single.h, rot: single.rot || 0 } : { ...unionBounds(sel), rot: 0 };
  return {
    move(ev) {
      const p = cv.clientToPage(ev.clientX, ev.clientY, slot);
      const delta = { x: p.x - p0.x, y: p.y - p0.y };
      const imageDefault = corner && sel.every((el) => el.type === 'image' || el.type === 'group');
      const keepAspect = imageDefault ? !ev.shiftKey : ev.shiftKey;
      let nb = resizeBox(startBox, handle, delta, { keepAspect, fromCenter: ev.altKey, minSize: 2 });
      let lines = [];
      if (snapping(ev) && !startBox.rot && !keepAspect && !ev.altKey) {
        const r = snapResize(nb, handle, targets, SNAP_PX / cv.zoom, 2);
        nb = r.box;
        lines = r.lines;
      }
      nb = { x: round2(nb.x), y: round2(nb.y), w: round2(nb.w), h: round2(nb.h) };
      const doc = app.doc;
      if (single) {
        const hit = findElement(doc, single.id);
        if (!hit) return;
        const el = hit.el, s = starts.get(single.id);
        Object.assign(el, nb);
        if (el.type === 'image' && s.content) {
          const fx = nb.w / s.w, fy = nb.h / s.h;
          el.content = { x: s.content.x * fx, y: s.content.y * fy, w: s.content.w * fx, h: s.content.h * fy };
        }
        if (el.type === 'table') {
          const fx = nb.w / s.w, fy = nb.h / s.h;
          el.cols = s.cols.map((v) => v * fx);
          el.rows = s.rows.map((v) => v * fy);
        }
      } else {
        const els = [];
        for (const id of ids) {
          const hit = findElement(doc, id);
          if (!hit) continue;
          const fresh = clone(starts.get(id));
          for (const k of Object.keys(hit.el)) if (!(k in fresh)) delete hit.el[k];
          Object.assign(hit.el, fresh);
          els.push(hit.el);
        }
        scaleElements(els, startBox, nb);
      }
      app.preview(ids);
      cv.overlay.showSnapLines(lines, slot);
      cv.overlay.showReadout(`${fmt(nb.w)} × ${fmt(nb.h)}`, { x: ev.clientX, y: ev.clientY });
    },
    end: (commit) => endOp(cv, commit)
  };
}

function beginRotate(cv, e0, sel, slot) {
  app.beginGesture('Rotate');
  cv.gestureKind = 'rotate';
  const ids = sel.map((el) => el.id);
  const starts = new Map(sel.map((el) => [el.id, clone(el)]));
  const single = sel.length === 1 && sel[0].type !== 'group' ? sel[0] : null;
  const b = single ? single : unionBounds(sel);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const p0 = cv.clientToPage(e0.clientX, e0.clientY, slot);
  const a0 = Math.atan2(p0.y - cy, p0.x - cx) * 180 / Math.PI;
  const rot0 = single ? single.rot || 0 : 0;
  return {
    move(ev) {
      const p = cv.clientToPage(ev.clientX, ev.clientY, slot);
      const a = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI;
      let shown;
      const doc = app.doc;
      if (single) {
        let r = normAngle(rot0 + a - a0);
        if (ev.shiftKey) r = snapAngle(r, 15);
        const hit = findElement(doc, single.id);
        if (hit) hit.el.rot = round2(r);
        shown = r;
      } else {
        let d = normAngle(a - a0);
        if (ev.shiftKey) d = snapAngle(d, 15);
        const els = [];
        for (const id of ids) {
          const hit = findElement(doc, id);
          if (!hit) continue;
          Object.assign(hit.el, clone(starts.get(id)));
          els.push(hit.el);
        }
        rotateElements(els, cx, cy, d);
        shown = d;
      }
      app.preview(ids);
      cv.overlay.showReadout(`${Math.round(shown * 10) / 10}°`, { x: ev.clientX, y: ev.clientY });
    },
    end: (commit) => endOp(cv, commit)
  };
}

function beginLineEnd(cv, e0, line, which, slot) {
  app.beginGesture('Resize');
  cv.gestureKind = 'resize';
  const [s0, e1] = lineEndpoints(line);
  const fixed = which === 'start' ? e1 : s0;
  const targets = snapTargets(cv, slot, [line.id]);
  return {
    move(ev) {
      let p = cv.clientToPage(ev.clientX, ev.clientY, slot);
      let lines = [];
      if (ev.shiftKey) {
        const ang = snapAngle(Math.atan2(p.y - fixed.y, p.x - fixed.x) * 180 / Math.PI, 15) * Math.PI / 180;
        const len = Math.hypot(p.x - fixed.x, p.y - fixed.y);
        p = { x: fixed.x + Math.cos(ang) * len, y: fixed.y + Math.sin(ang) * len };
      } else if (snapping(ev)) {
        const r = snapPoint(p, targets, SNAP_PX / cv.zoom);
        p = { x: r.x, y: r.y };
        lines = r.lines;
      }
      const box = which === 'start' ? lineFromPoints(p, fixed, line.h) : lineFromPoints(fixed, p, line.h);
      const hit = findElement(app.doc, line.id);
      if (hit) Object.assign(hit.el, { x: round2(box.x), y: round2(box.y), w: round2(box.w), rot: round2(box.rot) });
      app.preview([line.id]);
      cv.overlay.showSnapLines(lines, slot);
      cv.overlay.showReadout(`${fmt(box.w)}  ${Math.round(box.rot)}°`, { x: ev.clientX, y: ev.clientY });
    },
    end: (commit) => endOp(cv, commit)
  };
}

// ------------------------------------------------------------------------------------- marquee

function startMarquee(cv, e) {
  const p0 = cv.clientToPage(e.clientX, e.clientY);
  const slot = p0.slot;
  const add = e.shiftKey || e.ctrlKey || e.metaKey;
  const r = cv.viewport.getBoundingClientRect();
  const toContent = (ev) => ({ x: ev.clientX - r.left - cv.viewport.clientLeft + cv.viewport.scrollLeft, y: ev.clientY - r.top - cv.viewport.clientTop + cv.viewport.scrollTop });
  const c0 = toContent(e);
  let dragging = false;
  cv.enteredGroup = null;
  track(e, {
    move: (ev) => {
      if (!dragging && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < DRAG_THRESHOLD) return;
      dragging = true;
      const c = toContent(ev);
      cv.overlay.showMarquee({ x: Math.min(c0.x, c.x), y: Math.min(c0.y, c.y), w: Math.abs(c.x - c0.x), h: Math.abs(c.y - c0.y) });
    },
    up: (ev) => {
      cv.overlay.showMarquee(null);
      if (!dragging) {
        if (!add) app.select([]);
        if (slot && slot.index !== app.pageIndex && !app.isMasterMode) app.goToPage(slot.index);
        return;
      }
      if (!slot) return;
      ensurePage(cv, slot);
      const p1 = cv.clientToPage(ev.clientX, ev.clientY, slot);
      const box = { x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y), x2: Math.max(p0.x, p1.x), y2: Math.max(p0.y, p1.y) };
      const ids = slot.page.elements.filter((el) => {
        if (el.hidden) return false;
        const b = el.type === 'group' ? el : elementBounds(el);
        return b.x >= box.x - 0.5 && b.y >= box.y - 0.5 && b.x + b.w <= box.x2 + 0.5 && b.y + b.h <= box.y2 + 0.5;
      }).map((el) => el.id);
      app.select(ids, { add });
    },
    cancel: () => cv.overlay.showMarquee(null)
  });
}

// ------------------------------------------------------------------------------------- drawing tools

function startDraw(cv, e) {
  const tool = cv.tool;
  const first = cv.clientToPage(e.clientX, e.clientY);
  const slot = first.slot;
  if (!slot) return;
  ensurePage(cv, slot);
  const targets = snapTargets(cv, slot, []);
  const snapP = (ev, p) => (snapping(ev) ? snapPoint(p, targets, SNAP_PX / cv.zoom) : { ...p, lines: [] });
  const p0 = snapP(e, { x: first.x, y: first.y });
  let rect = null;
  track(e, {
    move: (ev) => {
      if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < DRAG_THRESHOLD && !rect) return;
      let p = cv.clientToPage(ev.clientX, ev.clientY, slot);
      if (tool.kind === 'line') {
        if (ev.shiftKey) {
          const ang = snapAngle(Math.atan2(p.y - p0.y, p.x - p0.x) * 180 / Math.PI, 15) * Math.PI / 180;
          const len = Math.hypot(p.x - p0.x, p.y - p0.y);
          p = { x: p0.x + Math.cos(ang) * len, y: p0.y + Math.sin(ang) * len };
        } else p = snapP(ev, p);
        rect = { x: p0.x, y: p0.y, x2: p.x, y2: p.y };
        cv.overlay.showDraw(rect, slot, 'line');
        cv.overlay.showReadout(`${fmt(Math.hypot(p.x - p0.x, p.y - p0.y))}`, { x: ev.clientX, y: ev.clientY });
        return;
      }
      const s = snapP(ev, p);
      let w = s.x - p0.x, hh = s.y - p0.y;
      if (ev.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(hh)); w = Math.sign(w || 1) * m; hh = Math.sign(hh || 1) * m; }
      rect = ev.altKey ? { x: p0.x - Math.abs(w), y: p0.y - Math.abs(hh), w: Math.abs(w) * 2, h: Math.abs(hh) * 2 }
        : { x: Math.min(p0.x, p0.x + w), y: Math.min(p0.y, p0.y + hh), w: Math.abs(w), h: Math.abs(hh) };
      cv.overlay.showDraw(rect, slot, tool.kind);
      cv.overlay.showSnapLines(s.lines, slot);
      cv.overlay.showReadout(`${fmt(rect.w)} × ${fmt(rect.h)}`, { x: ev.clientX, y: ev.clientY });
    },
    up: () => {
      cv.overlay.clearTransient();
      let r;
      if (tool.kind === 'line') {
        r = rect && Math.hypot(rect.x2 - rect.x, rect.y2 - rect.y) * cv.zoom >= 4
          ? lineFromPoints({ x: rect.x, y: rect.y }, { x: rect.x2, y: rect.y2 }, 12)
          : { x: p0.x, y: p0.y - 6, w: DEFAULT_SIZES.line.w, h: 12, rot: 0 };
      } else if (rect && rect.w * cv.zoom >= 4 && rect.h * cv.zoom >= 4) {
        r = rect;
      } else {
        const d = DEFAULT_SIZES[tool.kind] || DEFAULT_SIZES.shape;
        r = { x: p0.x, y: p0.y, w: d.w, h: d.h };
      }
      let made = null;
      app.transact(insertLabel(tool), (doc) => {
        made = buildObject(doc, tool, r);
        if (tool.kind === 'line') Object.assign(made, { x: round2(r.x), y: round2(r.y), w: round2(r.w), h: 12, rot: round2(r.rot || 0) });
        app.page.elements.push(made);
        app.select([made.id]);
      });
      cv.setTool(tool.sticky ? tool : 'select');
      if (made && made.type === 'text') setTimeout(() => app.textEdit.start(made.id), 0);
      if (made && made.type === 'image' && tool.pick !== false) {
        const id = made.id;
        pickImageFiles({ multiple: false }).then((files) => { if (files[0]) fillPicture(id, files[0]).catch((err) => app.reportError(err, 'Insert Picture')); });
      }
    },
    cancel: () => cv.overlay.clearTransient()
  });
}

// ------------------------------------------------------------------------------------- guides & pan

function startGuideDrag(cv, e, guideEl) {
  const slot = cv.slots.find((s) => s.el.contains(guideEl));
  if (!slot) return;
  ensurePage(cv, slot);
  const axis = guideEl.dataset.axis;
  const index = +guideEl.dataset.index;
  app.beginGesture('Move Guide');
  const page = slot.page;
  let removed = false;
  const doc = app.doc;
  track(e, {
    move: (ev) => {
      const p = cv.clientToPage(ev.clientX, ev.clientY, slot);
      const v = round2(axis === 'h' ? p.y : p.x);
      const r = cv.viewport.getBoundingClientRect();
      const out = ev.clientX < r.left || ev.clientY < r.top || v < 0 || v > (axis === 'h' ? doc.setup.height : doc.setup.width);
      const list = page.guides[axis];
      if (out && !removed) { list.splice(index, 1); removed = true; }
      else if (!out && removed) { list.splice(index, 0, v); removed = false; }
      else if (!out) list[index] = v;
      cv.overlay.showGuideReadout(axis, v, out ? null : ev);
      cv.renderSoon();
    },
    up: () => { cv.overlay.showReadout(null); app.gesture && (app.gesture.label = removed ? 'Remove Guide' : 'Move Guide'); app.endGesture(true); },
    cancel: () => { cv.overlay.showReadout(null); app.endGesture(false); }
  });
}

function startPan(cv, e) {
  const vp = cv.viewport;
  const sx = vp.scrollLeft, sy = vp.scrollTop;
  vp.classList.add('panning');
  track(e, {
    move: (ev) => { vp.scrollLeft = sx - (ev.clientX - e.clientX); vp.scrollTop = sy - (ev.clientY - e.clientY); },
    up: () => vp.classList.remove('panning'),
    cancel: () => vp.classList.remove('panning')
  });
}

function onWheel(cv, e) {
  if (!app.session) return;
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    const factor = Math.exp(-Math.max(-300, Math.min(300, dy)) * 0.0022);
    cv.zoomTo(cv.zoom * factor, { x: e.clientX, y: e.clientY });
  }
}


// ------------------------------------------------------------------------------------- double click & menu

function onDoubleClick(cv, e) {
  if (!app.session || cv.tool !== 'select') return;
  if (app.editing && app.editing.root && app.editing.root.contains(e.target)) return;
  // pointer capture (see track()) retargets click/dblclick to the viewport: hit-test the point instead
  const target = e.target.closest && e.target.closest('.el[data-id]') ? e.target : document.elementFromPoint(e.clientX, e.clientY) || e.target;
  const hit = hitElement(cv, target);
  if (!hit) return;
  const doc = app.doc;
  const selected = app.selectionIds;
  // double-click a selected group: enter it and select the child under the pointer
  const topId = hit.chain[0];
  const top = findElement(doc, topId);
  if (top && top.el.type === 'group' && hit.chain.length > 1 && (selected.includes(topId) || !cv.enteredGroup)) {
    cv.enteredGroup = topId;
    const childId = hit.chain[1];
    app.select([childId]);
    const child = findElement(doc, childId);
    if (child && child.el.type === 'text' && hit.chain.length === 2) app.textEdit.start(childId, { caret: { x: e.clientX, y: e.clientY } });
    return;
  }
  const id = pickId(cv, hit.chain);
  const found = findElement(doc, id);
  if (!found) return;
  const el = found.el;
  const def = registry.getElementType(el.type);
  if (def && typeof def.onDoubleClick === 'function') {
    try { def.onDoubleClick(el, { ...app.ctx(), event: e }); } catch (err) { app.reportError(err, 'Edit'); }
    return;
  }
  if (el.type === 'text' && !el.locked) app.textEdit.start(el.id, { caret: { x: e.clientX, y: e.clientY } });
  else if (el.type === 'image' && !el.assetId) app.exec('picture.change');
}

/** Built-in canvas context-menu items for the current selection. */
export function coreContextItems(ctx) {
  const sel = ctx.selection;
  if (!sel.length) {
    return [{ command: 'edit.paste' }, { command: 'edit.selectAll' }, '-', { command: 'page.insertAfter' }, { command: 'page.duplicate' }, { command: 'page.delete' }, '-', { command: 'design.pageBackground' }, { command: 'view.guidesDialog', label: 'Guides & Grid…' }];
  }
  const items = [{ command: 'edit.cut' }, { command: 'edit.copy' }, { command: 'edit.paste' }, { command: 'edit.duplicate' }, { command: 'edit.delete' }, '-'];
  if (sel.length > 1) items.push({ command: 'arrange.group' });
  if (sel.length === 1 && sel[0].type === 'group') items.push({ command: 'arrange.ungroup' });
  items.push({
    label: 'Order', icon: 'arrange', submenu: [{ command: 'arrange.front' }, { command: 'arrange.forward' }, { command: 'arrange.backward' }, { command: 'arrange.back' }]
  }, {
    label: 'Align', icon: 'margins', submenu: [{ command: 'arrange.alignLeft' }, { command: 'arrange.alignCenter' }, { command: 'arrange.alignRight' }, '-',
      { command: 'arrange.alignTop' }, { command: 'arrange.alignMiddle' }, { command: 'arrange.alignBottom' }, '-', { command: 'arrange.distributeH' }, { command: 'arrange.distributeV' }]
  }, {
    label: 'Rotate', icon: 'rotate', submenu: [{ command: 'arrange.rotateRight' }, { command: 'arrange.rotateLeft' }, '-', { command: 'arrange.flipH' }, { command: 'arrange.flipV' }]
  }, '-', { command: 'arrange.lock' }, { command: 'arrange.hide' });
  if (sel.length === 1 && sel[0].type === 'image') items.push('-', { command: 'picture.change' }, { command: 'picture.reset' });
  return items;
}

function onContextMenu(cv, e) {
  if (!app.session) return;
  if (app.editing && app.editing.root && app.editing.root.contains(e.target)) return;   // native (spelling) menu
  e.preventDefault();
  const hit = hitElement(cv, e.target);
  if (hit) {
    ensurePage(cv, hit.slot);
    const id = pickId(cv, hit.chain);
    if (!app.selectionIds.includes(id)) app.select([id]);
  } else if (!e.target.closest('.ov-box')) {
    const p = cv.clientToPage(e.clientX, e.clientY);
    ensurePage(cv, p.slot);
    app.select([]);
  }
  const ctx = app.ctx();
  const items = [...coreContextItems(ctx)];
  const extra = collectContextItems(ctx);
  if (extra.length) items.push('-', ...extra);
  app.ui.contextMenu(e.clientX, e.clientY, items);
}
