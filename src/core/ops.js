// Pure document operations on objects: group/ungroup, z-order, align, distribute, delete with
// text-chain repair, nudge. All functions mutate the document passed in (call them inside
// app.transact) and never touch the DOM.

import { createElement, findElement, updateGroupBounds, translateElement, walkElements, allElements } from './model.js';
import { boundsOf, round2 } from './geometry.js';

/** Containers (page/master element lists or group children) that own each id, with indices. */
function locateAll(doc, ids) {
  return ids.map((id) => findElement(doc, id)).filter(Boolean);
}

/**
 * Group the elements with `ids` (they must share one parent list). The group takes the z-position
 * of the topmost member. Returns the new group element, or null if fewer than two can be grouped.
 */
export function groupElements(doc, ids) {
  const hits = locateAll(doc, ids);
  if (hits.length < 2) return null;
  const list = hits[0].list;
  if (!hits.every((h) => h.list === list)) return null;
  const members = hits.sort((a, b) => a.index - b.index);
  const top = members[members.length - 1].index;
  const children = members.map((h) => h.el);
  const group = createElement('group', { name: 'Group', children });
  updateGroupBounds(group);
  const insertAt = top - (members.length - 1);
  for (const h of [...members].reverse()) list.splice(list.indexOf(h.el), 1);
  list.splice(insertAt, 0, group);
  if (hits[0].parent) updateGroupBounds(hits[0].parent);
  return group;
}

/** Dissolve a group in place. Returns the ids of its former children (or [] if not a group). */
export function ungroupElement(doc, groupId) {
  const hit = findElement(doc, groupId);
  if (!hit || hit.el.type !== 'group') return [];
  const kids = hit.el.children;
  hit.list.splice(hit.index, 1, ...kids);
  if (hit.parent) updateGroupBounds(hit.parent);
  return kids.map((k) => k.id);
}

/**
 * Change stacking order within each element's parent list.
 * @param {object} doc
 * @param {string[]} ids
 * @param {'front'|'forward'|'backward'|'back'} mode
 * @returns {boolean} whether anything moved
 */
export function reorderElements(doc, ids, mode) {
  const hits = locateAll(doc, ids);
  const lists = new Map();
  for (const h of hits) {
    if (!lists.has(h.list)) lists.set(h.list, new Set());
    lists.get(h.list).add(h.el);
  }
  let moved = false;
  for (const [list, sel] of lists) {
    const before = list.slice();
    if (mode === 'front' || mode === 'back') {
      const picked = list.filter((e) => sel.has(e));
      const rest = list.filter((e) => !sel.has(e));
      list.splice(0, list.length, ...(mode === 'front' ? [...rest, ...picked] : [...picked, ...rest]));
    } else if (mode === 'forward') {
      for (let i = list.length - 2; i >= 0; i--) {
        if (sel.has(list[i]) && !sel.has(list[i + 1])) [list[i], list[i + 1]] = [list[i + 1], list[i]];
      }
    } else if (mode === 'backward') {
      for (let i = 1; i < list.length; i++) {
        if (sel.has(list[i]) && !sel.has(list[i - 1])) [list[i], list[i - 1]] = [list[i - 1], list[i]];
      }
    }
    if (list.some((e, i) => e !== before[i])) moved = true;
  }
  return moved;
}

/**
 * Align elements to a reference box.
 * @param {object[]} els
 * @param {'left'|'center'|'right'|'top'|'middle'|'bottom'} mode
 * @param {{x:number,y:number,w:number,h:number}} ref
 */
export function alignElements(els, mode, ref) {
  for (const el of els) {
    const b = boundsOf(el);
    let dx = 0, dy = 0;
    if (mode === 'left') dx = ref.x - b.x;
    else if (mode === 'center') dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
    else if (mode === 'right') dx = ref.x + ref.w - (b.x + b.w);
    else if (mode === 'top') dy = ref.y - b.y;
    else if (mode === 'middle') dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
    else if (mode === 'bottom') dy = ref.y + ref.h - (b.y + b.h);
    if (dx || dy) translateElement(el, round2(dx), round2(dy));
  }
}

/**
 * Distribute 3+ elements so the gaps between them are equal along `axis` ('h' or 'v').
 * The outermost elements stay in place. Returns false if fewer than three elements.
 */
export function distributeElements(els, axis) {
  if (els.length < 3) return false;
  const horiz = axis === 'h';
  const items = els.map((el) => ({ el, b: boundsOf(el) }))
    .sort((a, b) => (horiz ? a.b.x - b.b.x : a.b.y - b.b.y));
  const first = items[0].b, last = items[items.length - 1].b;
  const start = horiz ? first.x : first.y;
  const end = horiz ? last.x + last.w : last.y + last.h;
  const total = items.reduce((s, it) => s + (horiz ? it.b.w : it.b.h), 0);
  const gap = (end - start - total) / (items.length - 1);
  let pos = start;
  for (const it of items) {
    const cur = horiz ? it.b.x : it.b.y;
    const d = round2(pos - cur);
    if (d) translateElement(it.el, horiz ? d : 0, horiz ? 0 : d);
    pos += (horiz ? it.b.w : it.b.h) + gap;
  }
  return true;
}

/**
 * Repair text-frame chains after frames are removed: a frame that pointed at a removed frame now
 * points at the next surviving frame of the chain (text keeps flowing).
 * @param {object} doc
 * @param {Map<string, string|null>} removedNext removed frame id -> its `next`
 */
export function relinkChains(doc, removedNext) {
  if (!removedNext.size) return;
  for (const f of allElements(doc, 'text')) {
    let n = f.next;
    const guard = new Set();
    while (n && removedNext.has(n) && !guard.has(n)) { guard.add(n); n = removedNext.get(n); }
    if (n !== f.next) f.next = n || null;
  }
}

/**
 * Delete elements by id (anywhere: pages, masters, inside groups). Groups left with one child are
 * dissolved; empty groups are removed. Text chains are relinked. Returns the number deleted.
 */
export function deleteElements(doc, ids) {
  const removedNext = new Map();
  let count = 0;
  for (const id of ids) {
    const hit = findElement(doc, id);
    if (!hit) continue;
    walkElements([hit.el], (e) => { if (e.type === 'text') removedNext.set(e.id, e.next || null); });
    hit.list.splice(hit.index, 1);
    count++;
    let parent = hit.parent;
    while (parent) {
      const ph = findElement(doc, parent.id);
      if (!ph) break;
      if (parent.children.length === 0) { ph.list.splice(ph.index, 1); }
      else if (parent.children.length === 1) { ph.list.splice(ph.index, 1, parent.children[0]); }
      else updateGroupBounds(parent);
      parent = ph.parent;
    }
  }
  relinkChains(doc, removedNext);
  return count;
}

/** Move elements by (dx, dy). */
export function nudgeElements(els, dx, dy) {
  for (const el of els) translateElement(el, dx, dy);
}

/** After changing children of nested groups, recompute every ancestor group's bounds of `id`. */
export function refreshAncestors(doc, id) {
  let hit = findElement(doc, id);
  while (hit && hit.parent) {
    updateGroupBounds(hit.parent);
    hit = findElement(doc, hit.parent.id);
  }
}

/** The top-level element (direct child of a page/master list) containing `id`. */
export function topLevelOf(doc, id) {
  let hit = findElement(doc, id);
  while (hit && hit.parent) hit = findElement(doc, hit.parent.id);
  return hit ? hit.el : null;
}
