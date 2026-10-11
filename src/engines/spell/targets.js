// Text targets of a Folio document: every story (once, even when it flows through a chain of
// linked frames) and every visible table cell, in reading order.

import { walkElements } from '../../core/model.js';

const ROW_TOLERANCE = 4; // px: elements whose tops are this close count as one row

/**
 * Collect the text targets of a document in reading order: pages in order; on each page the
 * elements sorted top-to-bottom then left-to-right (z-order breaks ties), descending into groups.
 * A story is reported once, at the head frame of its chain. Table cells are reported row by row,
 * skipping cells covered by a merge. Master pages follow the pages (pageIndex -1, masterId set)
 * unless `includeMasters` is false.
 *   { kind: 'story', storyId, frameId (chain head), pageIndex }
 *   { kind: 'cell', elementId, r, c, pageIndex }
 * @param {object} doc
 * @param {{ includeMasters?: boolean }} [opts]
 * @returns {Array<object>}
 */
export function collectTextTargets(doc, opts = {}) {
  const includeMasters = opts.includeMasters !== false;
  const containers = doc.pages.map((page, i) => ({ list: page.elements, pageIndex: i, masterId: null }));
  if (includeMasters) for (const m of doc.masters || []) containers.push({ list: m.elements, pageIndex: -1, masterId: m.id });

  // Chain heads: text frames that no other frame's `next` points at.
  const frames = [];
  for (const c of containers) walkElements(c.list, (el) => { if (el.type === 'text') frames.push(el); });
  const pointedTo = new Set();
  const byId = new Map(frames.map((f) => [f.id, f]));
  for (const f of frames) if (f.next && byId.has(f.next) && f.next !== f.id) pointedTo.add(f.next);

  const out = [];
  const seenStories = new Set();
  const pending = []; // stories whose chain has no head (cyclic chains): emitted at first frame
  for (const c of containers) {
    const els = [];
    walkElements(c.list, (el) => { if (el.type === 'text' || el.type === 'table') els.push(el); });
    const ordered = els.map((el, z) => ({ el, z })).sort((a, b) => {
      const dy = (a.el.y || 0) - (b.el.y || 0);
      if (Math.abs(dy) > ROW_TOLERANCE) return dy;
      const dx = (a.el.x || 0) - (b.el.x || 0);
      return dx || a.z - b.z;
    });
    for (const { el } of ordered) {
      const base = { pageIndex: c.pageIndex };
      if (c.masterId) base.masterId = c.masterId;
      if (el.type === 'text') {
        if (!el.storyId || !doc.stories[el.storyId] || seenStories.has(el.storyId)) continue;
        if (pointedTo.has(el.id)) { pending.push({ el, base }); continue; }
        seenStories.add(el.storyId);
        out.push({ kind: 'story', storyId: el.storyId, frameId: el.id, ...base });
      } else {
        const cells = el.cells || [];
        for (let r = 0; r < cells.length; r++) {
          const row = cells[r] || [];
          for (let col = 0; col < row.length; col++) {
            const cell = row[col];
            if (!cell || cell.covered) continue;
            out.push({ kind: 'cell', elementId: el.id, r, c: col, ...base });
          }
        }
      }
    }
  }
  for (const { el, base } of pending) {
    if (seenStories.has(el.storyId)) continue;
    seenStories.add(el.storyId);
    out.push({ kind: 'story', storyId: el.storyId, frameId: el.id, ...base });
  }
  return out;
}

/**
 * Stable string key for a target ('story:<id>' or 'cell:<elementId>:<r>:<c>').
 * @param {object} target
 * @returns {string}
 */
export function targetKey(target) {
  return target.kind === 'story' ? `story:${target.storyId}` : `cell:${target.elementId}:${target.r}:${target.c}`;
}

function findTable(doc, id) {
  let hit = null;
  const lists = [...doc.pages.map((p) => p.elements), ...(doc.masters || []).map((m) => m.elements)];
  for (const list of lists) {
    walkElements(list, (el) => { if (el.id === id) { hit = el; return false; } return true; });
    if (hit) break;
  }
  return hit && hit.type === 'table' ? hit : null;
}

/**
 * Current HTML of a target, or null if it no longer exists.
 * @param {object} doc
 * @param {object} target
 * @returns {string|null}
 */
export function getTargetHtml(doc, target) {
  if (target.kind === 'story') {
    const s = doc.stories[target.storyId];
    return s ? String(s.html ?? '') : null;
  }
  const table = findTable(doc, target.elementId);
  const cell = table && table.cells[target.r] && table.cells[target.r][target.c];
  return cell ? String(cell.html ?? '') : null;
}

/**
 * Write the HTML of a target. Returns false if the target no longer exists.
 * @param {object} doc
 * @param {object} target
 * @param {string} html
 * @returns {boolean}
 */
export function setTargetHtml(doc, target, html) {
  if (target.kind === 'story') {
    const s = doc.stories[target.storyId];
    if (!s) return false;
    s.html = html;
    return true;
  }
  const table = findTable(doc, target.elementId);
  const cell = table && table.cells[target.r] && table.cells[target.r][target.c];
  if (!cell) return false;
  cell.html = html;
  return true;
}
