// Shared helpers for the core feature modules: applying changes to the selection, selection type
// predicates, and reusable ribbon items (colour buttons, size fields).

import { app } from '../core/app.js';
import { findElement, walkElements, unionBounds, translateElement } from '../core/model.js';
import { scaleElements, rotateElements, normAngle } from '../core/geometry.js';
import { h } from '../core/ui/dom.js';
import { icon } from '../core/ui/icons.js';
import { setTip } from '../core/ui/tooltip.js';
import { colorPicker } from '../core/ui/colorpicker.js';
import { lengthField } from '../core/ui/fields.js';
import { resolveColor } from '../core/theme.js';

/** Selected elements, descending into groups when `deep` (for formatting a group's members). */
export function selected(ctx, { deep = false } = {}) {
  const sel = ctx.selection || [];
  if (!deep) return sel;
  const out = [];
  walkElements(sel, (el) => { if (el.type !== 'group') out.push(el); });
  return out;
}

/** True when every selected element (groups expanded) is one of `types`. */
export function allOf(ctx, types) {
  const els = selected(ctx, { deep: true });
  return els.length > 0 && els.every((el) => types.includes(el.type));
}

/** True when any selected element (groups expanded) is one of `types`. */
export function anyOf(ctx, types) {
  return selected(ctx, { deep: true }).some((el) => types.includes(el.type));
}

/**
 * Apply `fn(el, doc)` to the selected elements (deep: group members of matching types) as one undo
 * step. `types` filters which elements are touched. `coalesce` merges rapid repeats (sliders).
 */
export function applyToSelection(label, fn, { types = null, deep = true, coalesce = null } = {}) {
  const ids = app.selectionIds;
  if (!ids.length) return;
  app.transact(label, (doc) => {
    const roots = ids.map((id) => findElement(doc, id)).filter(Boolean).map((hit) => hit.el);
    const targets = [];
    if (deep) walkElements(roots, (el) => { if (el.type !== 'group') targets.push(el); });
    else targets.push(...roots);
    for (const el of targets) if (!types || types.includes(el.type)) fn(el, doc);
  }, coalesce ? { coalesce } : {});
}

/** Common value of `get(el)` across elements, or `mixed` when they differ. */
export function common(els, get, mixed = null) {
  if (!els.length) return mixed;
  const v0 = JSON.stringify(get(els[0]));
  return els.every((e) => JSON.stringify(get(e)) === v0) ? get(els[0]) : mixed;
}

/**
 * Set the bounds (any of x, y, w, h, rot) of the selection as one undo step. A single element is
 * edited directly; groups and multi-selections are moved/scaled/rotated as a whole.
 */
export function setSelectionBounds(patch, label = 'Size and Position') {
  const sel = app.selection;
  if (!sel.length) return;
  if (sel.some((el) => el.locked)) { app.ui.toast('Locked objects cannot be moved or resized.'); return; }
  app.transact(label, (doc) => {
    const els = sel.map((e) => findElement(doc, e.id)).filter(Boolean).map((x) => x.el);
    if (els.length === 1 && els[0].type !== 'group') {
      const el = els[0];
      if ('x' in patch) el.x = patch.x;
      if ('y' in patch) el.y = patch.y;
      if ('w' in patch) {
        if (el.type === 'image' && el.content) { const f = patch.w / el.w; el.content = { ...el.content, x: el.content.x * f, w: el.content.w * f }; }
        el.w = Math.max(1, patch.w);
      }
      if ('h' in patch) {
        if (el.type === 'image' && el.content) { const f = patch.h / el.h; el.content = { ...el.content, y: el.content.y * f, h: el.content.h * f }; }
        el.h = Math.max(1, patch.h);
      }
      if ('rot' in patch) el.rot = normAngle(patch.rot);
      return;
    }
    const b = unionBounds(els);
    if ('x' in patch || 'y' in patch) {
      const dx = 'x' in patch ? patch.x - b.x : 0, dy = 'y' in patch ? patch.y - b.y : 0;
      for (const el of els) translateElement(el, dx, dy);
    }
    if ('w' in patch || 'h' in patch) {
      const nb = unionBounds(els);
      scaleElements(els, nb, { x: nb.x, y: nb.y, w: 'w' in patch ? Math.max(1, patch.w) : nb.w, h: 'h' in patch ? Math.max(1, patch.h) : nb.h });
    }
    if ('rot' in patch && els.length === 1) {
      const g = els[0];
      const cur = g.children && g.children.length === 1 ? g.children[0].rot || 0 : 0;
      rotateElements([g], g.x + g.w / 2, g.y + g.h / 2, normAngle(patch.rot - cur));
    }
  });
}

/**
 * Ribbon custom item: a colour button (icon + colour bar) that opens the colour picker.
 * @param {{ icon: string, label: string, title?: string, get(ctx): string, set(value: string): void, enabled?(ctx): boolean, allowNone?: boolean }} o
 */
export function colorRibbonItem(o) {
  return {
    type: 'custom',
    render(el) {
      const bar = h('span', { class: 'rb-colorbar' });
      const b = h('button', { type: 'button', class: 'rb rb-small rb-color' }, h('span', { class: 'rb-ic' }, icon(o.icon), bar), h('span', { class: 'rb-label', text: o.label }), h('span', { class: 'rb-caret' }, icon('chevron-down')));
      setTip(b, o.label, '', o.title || '');
      b.addEventListener('click', () => colorPicker(b, o.get(app.ctx()) || 'transparent', (v) => o.set(v), { allowNone: o.allowNone !== false, title: o.label }));
      el.appendChild(b);
      return {
        update(ctx) {
          const v = ctx.doc ? o.get(ctx) : null;
          bar.style.background = v && v !== 'transparent' ? resolveColor(ctx.doc, v) : 'transparent';
          bar.classList.toggle('none', !v || v === 'transparent');
          b.disabled = !ctx.doc || (o.enabled ? !o.enabled(ctx) : false);
        }
      };
    }
  };
}

/** Ribbon custom item: Height / Width fields for the selection (Size group). */
export function sizeRibbonItem() {
  return {
    type: 'custom',
    className: 'rb-size',
    render(el) {
      const unit = () => (app.doc ? app.doc.setup.units : 'in');
      const hf = lengthField({ unit, min: 1, title: 'Shape height', onChange: (v) => setSelectionBounds({ h: v }, 'Resize') });
      const wf = lengthField({ unit, min: 1, title: 'Shape width', onChange: (v) => setSelectionBounds({ w: v }, 'Resize') });
      el.append(h('label', { class: 'rb-field' }, icon('page-size'), h('span', { text: 'Height' }), hf.el), h('label', { class: 'rb-field' }, icon('page-size', 'rot90'), h('span', { text: 'Width' }), wf.el));
      return {
        update(ctx) {
          const sel = ctx.selection || [];
          const b = sel.length === 1 ? sel[0] : unionBounds(sel);
          hf.set(sel.length ? b.h : NaN);
          wf.set(sel.length ? b.w : NaN);
          const dis = !sel.length || sel.some((e) => e.locked);
          hf.disable(dis); wf.disable(dis);
        }
      };
    }
  };
}
