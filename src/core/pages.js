// Pure page and master-page operations (insert, duplicate, delete, move, masters, spreads).
// Mutate the document passed in; call inside app.transact.

import { createPage, createMaster, cloneElements, clone, walkElements } from './model.js';
import { relinkChains } from './ops.js';

/**
 * Insert `count` blank pages at `index` (0..pages.length). masterId undefined = the master of the
 * page before the insertion point (or the first master); null = no master.
 * @returns {object[]} the new pages
 */
export function insertPages(doc, index, count = 1, opts = {}) {
  const at = Math.max(0, Math.min(doc.pages.length, index));
  let masterId = opts.masterId;
  if (masterId === undefined) {
    const ref = doc.pages[at - 1] || doc.pages[at];
    masterId = ref ? ref.masterId : (doc.masters[0] ? doc.masters[0].id : null);
  }
  const pages = [];
  for (let i = 0; i < Math.max(1, count); i++) pages.push(createPage(doc, { masterId }));
  doc.pages.splice(at, 0, ...pages);
  return pages;
}

/** Duplicate page `index` (objects get new ids and their own story copies); inserted after it. */
export function duplicatePage(doc, index) {
  const src = doc.pages[index];
  if (!src) return null;
  const page = createPage(doc, {
    masterId: src.masterId,
    background: clone(src.background),
    guides: clone(src.guides || { v: [], h: [] }),
    elements: cloneElements(doc, src.elements, doc)
  });
  doc.pages.splice(index + 1, 0, page);
  return page;
}

/**
 * Delete pages by index. At least one page always remains. Text chains running through deleted
 * pages are relinked. Returns the number of pages deleted.
 */
export function deletePages(doc, indices) {
  const set = [...new Set(indices)].filter((i) => i >= 0 && i < doc.pages.length).sort((a, b) => b - a);
  if (!set.length || set.length >= doc.pages.length) return 0;
  const removedNext = new Map();
  for (const i of set) {
    walkElements(doc.pages[i].elements, (e) => { if (e.type === 'text') removedNext.set(e.id, e.next || null); });
    doc.pages.splice(i, 1);
  }
  relinkChains(doc, removedNext);
  return set.length;
}

/** Move the page at `from` so it ends up at index `to`. Returns true if it moved. */
export function movePage(doc, from, to) {
  const n = doc.pages.length;
  if (from < 0 || from >= n) return false;
  const dest = Math.max(0, Math.min(n - 1, to));
  if (dest === from) return false;
  const [p] = doc.pages.splice(from, 1);
  doc.pages.splice(dest, 0, p);
  return true;
}

/** Next free master name: A, B, … Z, AA, AB … */
export function nextMasterName(doc) {
  const used = new Set(doc.masters.map((m) => m.name));
  for (let i = 0; i < 702; i++) {
    const name = i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));
    if (!used.has(name)) return name;
  }
  return `Master ${doc.masters.length + 1}`;
}

/** Add a blank master page. Returns it. */
export function addMaster(doc, name) {
  const m = createMaster(name || nextMasterName(doc));
  doc.masters.push(m);
  return m;
}

/** Duplicate master `index` (objects cloned). Returns the copy. */
export function duplicateMaster(doc, index) {
  const src = doc.masters[index];
  if (!src) return null;
  const m = createMaster(nextMasterName(doc), { background: clone(src.background), elements: cloneElements(doc, src.elements, doc) });
  doc.masters.splice(index + 1, 0, m);
  return m;
}

/**
 * Delete a master. Pages using it switch to `replacementId` (default: the first remaining master).
 * The last master cannot be deleted. Returns true on success.
 */
export function deleteMaster(doc, masterId, replacementId) {
  if (doc.masters.length <= 1) return false;
  const i = doc.masters.findIndex((m) => m.id === masterId);
  if (i < 0) return false;
  const removedNext = new Map();
  walkElements(doc.masters[i].elements, (e) => { if (e.type === 'text') removedNext.set(e.id, e.next || null); });
  doc.masters.splice(i, 1);
  const repl = doc.masters.some((m) => m.id === replacementId) ? replacementId : doc.masters[0].id;
  for (const p of doc.pages) if (p.masterId === masterId) p.masterId = repl;
  relinkChains(doc, removedNext);
  return true;
}

/** Apply a master (or null for none) to pages by index. */
export function applyMaster(doc, indices, masterId) {
  if (masterId !== null && !doc.masters.some((m) => m.id === masterId)) return 0;
  let n = 0;
  for (const i of indices) {
    const p = doc.pages[i];
    if (p && p.masterId !== masterId) { p.masterId = masterId; n++; }
  }
  return n;
}

/**
 * Page indices grouped into spreads. Facing pages: page 1 alone, then 2–3, 4–5, …
 * Otherwise every page is its own spread.
 * @returns {number[][]}
 */
export function spreads(doc) {
  const n = doc.pages.length;
  const out = [];
  if (!doc.setup.facing) {
    for (let i = 0; i < n; i++) out.push([i]);
    return out;
  }
  out.push([0]);
  for (let i = 1; i < n; i += 2) out.push(i + 1 < n ? [i, i + 1] : [i]);
  return out;
}

/** The spread (list of page indices) containing `pageIndex`. */
export function spreadOf(doc, pageIndex) {
  return spreads(doc).find((s) => s.includes(pageIndex)) || [pageIndex];
}
