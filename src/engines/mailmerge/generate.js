// Merge generation: substitute recipient values into a publication.
//
//   mergeDocumentForRecord(doc, values, opts) -> Doc         one record, fields substituted, data removed
//   buildMergedPublication(doc, data, { indices, pageIndices }) -> Doc   pages repeated per record
//   findSheetSlots(doc, pageIndex, { frameIds }) -> slot description for label/card sheets
//   fillSheetFromRecords(doc, pageIndex, data, { frameIds, perSheet, indices, emptySlots }) -> Doc
//   listDocumentFields(doc) / renameFieldsInHtml(html, map) / renameFieldsInDocument(doc, map)
//
// All generators return NEW documents and never modify their input (renameFieldsInDocument is the
// one mutating helper, for use inside app.transact).
//
// Label / card sheet convention (fillSheetFromRecords) — a sheet page declares its repeated slots in
// one of three ways, checked in this order:
//   1. opts.frameIds: ids of top-level page elements, one per slot, in slot order.
//   2. Named slots: top-level elements named 'slot-1' … 'slot-N' (also 'Slot 1', 'slot_1'). Several
//      elements may share a slot number (an ungrouped label design); slots are ordered by number.
//   3. page.repeat = { cols, rows, gapX = 0, gapY = 0, x?, y?, w?, h? }: the page holds ONE label
//      design (the elements inside the cell x/y/w/h, default: all elements) which is repeated
//      cols × rows times, row by row, stepping by (cell width + gapX, cell height + gapY). Cell size
//      defaults to the union bounds of the design.
// Elements that are not part of a slot are static (copied onto every sheet; their merge fields take
// the first record on that sheet).

import { clone, uid, walkElements, elementContainers, unionBounds, translateElement } from '../../core/model.js';
import { substituteFields, listFields, fieldSpan } from '../text/fields.js';
import { decodeXml } from './xml.js';
import { viewIndices, rowValues } from './merge.js';

const NL = ''; // sentinel for line breaks inside values (becomes <br>)
const str = (v) => (v === null || v === undefined ? '' : String(v));
const isPageFieldName = (name) => String(name).startsWith('#');

/**
 * Build a field resolver for a record.
 * @param {Object<string,*>|((name: string) => *)|null} values record values or lookup function
 * @param {{ keepUnknown?: boolean }} [opts] keepUnknown: leave fields that are not in the record as
 *   field spans (default: they become blank). Page fields (#page, #date…) are always kept for the renderer.
 * @returns {(name: string) => string|null}
 */
export function recordResolver(values, opts = {}) {
  return (name) => {
    if (isPageFieldName(name)) return null;
    let v;
    if (typeof values === 'function') v = values(name);
    else if (values && Object.prototype.hasOwnProperty.call(values, name)) v = values[name];
    if (v === null || v === undefined) return opts.keepUnknown ? null : '';
    return str(v).replace(/\r\n|\r|\n/g, NL);
  };
}

/**
 * Substitute merge fields in rich-text HTML. Line breaks in values become <br>.
 * @param {string} html
 * @param {(name: string) => string|null} resolve from recordResolver()
 * @returns {string}
 */
export function mergeHtml(html, resolve) {
  const out = substituteFields(html, resolve);
  return out.indexOf(NL) < 0 ? out : out.split(NL).join('<br>');
}

function hasMergeFields(html) {
  return listFields(html).some((n) => !isPageFieldName(n));
}

function mergeTable(el, resolve) {
  for (const row of el.cells || []) for (const cell of row || []) if (cell && typeof cell.html === 'string') cell.html = mergeHtml(cell.html, resolve);
}

function listHasMergeFields(doc, list) {
  let found = false;
  walkElements(list, (el) => {
    if (el.type === 'text' && doc.stories[el.storyId] && hasMergeFields(doc.stories[el.storyId].html)) found = true;
    if (el.type === 'table') for (const row of el.cells || []) for (const c of row || []) if (c && hasMergeFields(c.html)) found = true;
    return !found;
  });
  return found;
}

/**
 * Names of the merge fields used anywhere in the publication (stories and table cells on pages and
 * masters), in order of first appearance. Page fields (#page…) are not included.
 * @param {object} doc
 * @returns {string[]}
 */
export function listDocumentFields(doc) {
  const out = [];
  const add = (html) => { for (const n of listFields(html)) if (!isPageFieldName(n) && !out.includes(n)) out.push(n); };
  const seen = new Set();
  for (const c of elementContainers(doc)) {
    walkElements(c.list, (el) => {
      if (el.type === 'text' && el.storyId && !seen.has(el.storyId) && doc.stories[el.storyId]) { seen.add(el.storyId); add(doc.stories[el.storyId].html); }
      if (el.type === 'table') for (const row of el.cells || []) for (const cell of row || []) if (cell) add(cell.html);
    });
  }
  return out;
}

/**
 * Merge one record into a copy of the publication: every story and table cell (pages and masters)
 * gets its merge fields replaced by the record's values; doc.data is removed.
 * @param {object} doc
 * @param {Object<string,*>|((name: string) => *)} values record values keyed by column
 * @param {{ keepUnknown?: boolean }} [opts]
 * @returns {object} new Doc
 */
export function mergeDocumentForRecord(doc, values, opts = {}) {
  const out = clone(doc);
  out.data = null;
  const resolve = recordResolver(values, opts);
  for (const s of Object.values(out.stories || {})) s.html = mergeHtml(s.html, resolve);
  for (const c of elementContainers(out)) walkElements(c.list, (el) => { if (el.type === 'table') mergeTable(el, resolve); });
  return out;
}

/**
 * Copy elements for one merged record: new ids, stories duplicated with fields substituted, table
 * cells substituted. Text chains are remapped later by remapChains().
 */
function copyElements(srcDoc, outDoc, els, ctx) {
  const copy = (el) => {
    const n = clone(el);
    n.id = uid('e');
    ctx.idMap.set(el.id, n.id);
    ctx.copies.push(n);
    if (n.type === 'group') n.children = (el.children || []).map(copy);
    if (n.type === 'text' && el.storyId) {
      if (!ctx.storyMap.has(el.storyId)) {
        const src = srcDoc.stories[el.storyId];
        const id = uid('s');
        outDoc.stories[id] = { id, html: mergeHtml(src ? src.html : '<p></p>', ctx.resolve) };
        ctx.storyMap.set(el.storyId, id);
      }
      n.storyId = ctx.storyMap.get(el.storyId);
    }
    if (n.type === 'table') mergeTable(n, ctx.resolve);
    return n;
  };
  return els.map(copy);
}

function remapChains(ctx) {
  for (const n of ctx.copies) if (n.type === 'text' && n.next) n.next = ctx.idMap.get(n.next) || null;
}

function newCtx(resolve) {
  return { idMap: new Map(), storyMap: new Map(), copies: [], resolve };
}

function pruneStories(doc) {
  const used = new Set();
  for (const c of elementContainers(doc)) walkElements(c.list, (el) => { if (el.type === 'text' && el.storyId) used.add(el.storyId); });
  for (const id of Object.keys(doc.stories)) if (!used.has(id)) delete doc.stories[id];
}

/**
 * Build one publication containing the selected pages once per record ("merge to new publication",
 * also the source for merged print/PDF export). Pages and elements get new ids; each record gets
 * its own copies of the stories (text chains across the repeated pages are kept within a record).
 * Masters without merge fields are shared; a master that contains merge fields is copied per record
 * so its fields can differ. doc.data is removed.
 * @param {object} doc
 * @param {object} data MergeData
 * @param {{ indices?: number[], pageIndices?: number[], keepUnknown?: boolean }} [opts]
 *   indices: row indices to merge, in order (default: viewIndices(data)); pageIndices: pages to repeat (default: all)
 * @returns {object} new Doc
 * @throws when there are no records to merge
 */
export function buildMergedPublication(doc, data, opts = {}) {
  const indices = opts.indices || viewIndices(data);
  if (!indices.length) throw new Error('There are no recipients to merge.');
  const pageIdx = opts.pageIndices || doc.pages.map((_, i) => i);
  const out = clone(doc);
  out.data = null;
  out.pages = [];
  const fieldMasters = new Set(doc.masters.filter((m) => listHasMergeFields(doc, m.elements)).map((m) => m.id));
  if (fieldMasters.size) out.masters = out.masters.filter((m) => !fieldMasters.has(m.id));
  let recordNo = 0;
  for (const rowIndex of indices) {
    const values = rowValues(data, rowIndex);
    if (!values) continue;
    recordNo++;
    const ctx = newCtx(recordResolver(values, opts));
    const masterMap = new Map();
    for (const m of doc.masters) {
      if (!fieldMasters.has(m.id)) continue;
      const mc = { ...clone(m), id: uid('m'), name: `${m.name} · ${recordNo}` };
      mc.elements = copyElements(doc, out, m.elements, ctx);
      out.masters.push(mc);
      masterMap.set(m.id, mc.id);
    }
    for (const pi of pageIdx) {
      const page = doc.pages[pi];
      if (!page) continue;
      const pc = { ...clone(page), id: uid('p'), elements: copyElements(doc, out, page.elements, ctx) };
      if (pc.masterId && masterMap.has(pc.masterId)) pc.masterId = masterMap.get(pc.masterId);
      out.pages.push(pc);
    }
    remapChains(ctx);
  }
  if (!out.pages.length) throw new Error('There are no recipients to merge.');
  if (!out.masters.length) out.masters.push(clone(doc.masters[0]));
  pruneStories(out);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Label / card sheets
// ---------------------------------------------------------------------------------------------

const SLOT_NAME = /^slot[\s_-]*(\d+)$/i;

/**
 * Find the repeated slots on a sheet page (see the convention at the top of this file).
 * @param {object} doc
 * @param {number} pageIndex
 * @param {{ frameIds?: string[] }} [opts]
 * @returns {{ mode: 'ids'|'named'|'repeat', count: number,
 *   slotOf: Map<string, number>,            // top-level element id -> slot (ids / named modes)
 *   template: Set<string>,                  // repeat mode: ids of the design's elements
 *   offsets: Array<{dx: number, dy: number}> }|null}  null when the page declares no slots
 */
export function findSheetSlots(doc, pageIndex, opts = {}) {
  const page = doc.pages[pageIndex];
  if (!page) return null;
  const els = page.elements || [];
  if (opts.frameIds && opts.frameIds.length) {
    const slotOf = new Map();
    opts.frameIds.forEach((id, k) => { if (els.some((e) => e.id === id) && !slotOf.has(id)) slotOf.set(id, k); });
    if (!slotOf.size) return null;
    return { mode: 'ids', count: opts.frameIds.length, slotOf, template: new Set(), offsets: [] };
  }
  const named = els.map((e) => ({ e, m: SLOT_NAME.exec(String(e.name || '').trim()) })).filter((x) => x.m);
  if (named.length) {
    const numbers = [...new Set(named.map((x) => Number(x.m[1])))].sort((a, b) => a - b);
    const slotOf = new Map(named.map((x) => [x.e.id, numbers.indexOf(Number(x.m[1]))]));
    return { mode: 'named', count: numbers.length, slotOf, template: new Set(), offsets: [] };
  }
  const rep = page.repeat;
  if (rep && rep.cols >= 1 && rep.rows >= 1 && els.length) {
    let design = els;
    if ([rep.x, rep.y, rep.w, rep.h].every(Number.isFinite)) {
      design = els.filter((e) => {
        const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
        return cx >= rep.x && cx <= rep.x + rep.w && cy >= rep.y && cy <= rep.y + rep.h;
      });
    }
    if (!design.length) return null;
    const b = unionBounds(design);
    const cw = Number.isFinite(rep.w) ? rep.w : b.w, ch = Number.isFinite(rep.h) ? rep.h : b.h;
    const gx = Number(rep.gapX) || 0, gy = Number(rep.gapY) || 0;
    const offsets = [];
    for (let r = 0; r < Math.floor(rep.rows); r++) for (let c = 0; c < Math.floor(rep.cols); c++) offsets.push({ dx: c * (cw + gx), dy: r * (ch + gy) });
    return { mode: 'repeat', count: offsets.length, slotOf: new Map(), template: new Set(design.map((e) => e.id)), offsets };
  }
  return null;
}

/**
 * Fill a label/card sheet with records: the sheet page is repeated as many times as needed and each
 * slot gets the next record (row by row across sheets). Returns a new Doc whose pages are the
 * generated sheets (or, with keepOtherPages, the other pages with the sheet page replaced in place);
 * doc.data is removed.
 * @param {object} doc
 * @param {number} pageIndex the sheet page
 * @param {object} data MergeData
 * @param {{ frameIds?: string[], perSheet?: number, indices?: number[], emptySlots?: 'remove'|'blank',
 *   keepOtherPages?: boolean, keepUnknown?: boolean, startSlot?: number }} [opts]
 *   perSheet: slots used per sheet (default: all); emptySlots: what to do with slots left over on the
 *   last sheet ('remove' — default — or 'blank': keep the design with fields emptied);
 *   startSlot: skip this many slots on the first sheet (reuse a partly used label sheet)
 * @returns {{ doc: object, sheets: number, slotsPerSheet: number, records: number }}
 * @throws when the page has no slots or there are no records
 */
export function fillSheetFromRecords(doc, pageIndex, data, opts = {}) {
  const slots = findSheetSlots(doc, pageIndex, opts);
  if (!slots) throw new Error('This page has no label slots. Name the repeated objects slot-1, slot-2, … or set the page to repeat its design.');
  const perSheet = Math.max(1, Math.min(opts.perSheet || slots.count, slots.count));
  const indices = opts.indices || viewIndices(data);
  if (!indices.length) throw new Error('There are no recipients to merge.');
  const start = Math.max(0, Math.min((opts.startSlot | 0), perSheet - 1));
  const total = start + indices.length;
  const sheetCount = Math.ceil(total / perSheet);
  const page = doc.pages[pageIndex];
  const out = clone(doc);
  out.data = null;
  const sheets = [];
  const blank = recordResolver({}, {});
  const recordFor = (slotNo) => {
    const k = slotNo - start;
    return k >= 0 && k < indices.length ? rowValues(data, indices[k]) : null;
  };
  for (let s = 0; s < sheetCount; s++) {
    const elements = [];
    const firstValues = recordFor(Math.max(s * perSheet, start)) || {};
    const staticCtx = newCtx(recordResolver(firstValues, opts));
    const slotCtx = new Map();
    const ctxForSlot = (k) => {
      if (!slotCtx.has(k)) {
        const values = recordFor(s * perSheet + k);
        slotCtx.set(k, values ? newCtx(recordResolver(values, opts)) : (opts.emptySlots === 'blank' ? newCtx(blank) : null));
      }
      return slotCtx.get(k);
    };
    for (const el of page.elements) {
      if (slots.mode === 'repeat' && slots.template.has(el.id)) {
        for (let k = 0; k < perSheet; k++) {
          const ctx = ctxForSlot(k);
          if (!ctx) continue;
          const [n] = copyElements(doc, out, [el], ctx);
          translateElement(n, slots.offsets[k].dx, slots.offsets[k].dy);
          elements.push(n);
        }
        continue;
      }
      if (slots.slotOf.has(el.id)) {
        const k = slots.slotOf.get(el.id);
        if (k >= perSheet) continue;
        const ctx = ctxForSlot(k);
        if (!ctx) continue;
        elements.push(...copyElements(doc, out, [el], ctx));
        continue;
      }
      elements.push(...copyElements(doc, out, [el], staticCtx));
    }
    // text chains survive within one slot copy (or within the static content); others are cut
    for (const c of [staticCtx, ...slotCtx.values()]) if (c) remapChains(c);
    const pc = { ...clone(page), id: uid('p'), elements };
    delete pc.repeat;
    sheets.push(pc);
  }
  out.pages = opts.keepOtherPages ? [...out.pages.slice(0, pageIndex), ...sheets, ...out.pages.slice(pageIndex + 1)] : sheets;
  pruneStories(out);
  return { doc: out, sheets: sheets.length, slotsPerSheet: perSheet, records: indices.length };
}

// ---------------------------------------------------------------------------------------------
// Renaming fields after a column rename
// ---------------------------------------------------------------------------------------------

const SPAN_RE = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi;

/**
 * Rename merge-field spans in HTML: every field whose name is a key of `map` becomes a field span
 * for map[name].
 * @param {string} html
 * @param {Object<string,string>} map old name -> new name (e.g. renameColumn(...).map)
 * @returns {string}
 */
export function renameFieldsInHtml(html, map) {
  const src = String(html ?? '');
  if (!map || !Object.keys(map).length || src.indexOf('data-field') < 0) return src;
  return src.replace(SPAN_RE, (whole, attrs) => {
    if (!/\bclass\s*=\s*("[^"]*\bfield\b[^"]*"|'[^']*\bfield\b[^']*')/i.test(attrs)) return whole;
    const m = /\bdata-field\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
    if (!m) return whole;
    const name = decodeXml(m[2] ?? m[3] ?? '');
    return Object.prototype.hasOwnProperty.call(map, name) ? fieldSpan(map[name]) : whole;
  });
}

/**
 * Apply a field rename map to every story and table cell of a document. MUTATES doc.
 * @param {object} doc
 * @param {Object<string,string>} map old name -> new name
 * @returns {number} number of stories/cells changed
 */
export function renameFieldsInDocument(doc, map) {
  let changed = 0;
  if (!map || !Object.keys(map).length) return 0;
  for (const s of Object.values(doc.stories || {})) {
    const h = renameFieldsInHtml(s.html, map);
    if (h !== s.html) { s.html = h; changed++; }
  }
  for (const c of elementContainers(doc)) {
    walkElements(c.list, (el) => {
      if (el.type !== 'table') return;
      for (const row of el.cells || []) for (const cell of row || []) {
        if (!cell) continue;
        const h = renameFieldsInHtml(cell.html, map);
        if (h !== cell.html) { cell.html = h; changed++; }
      }
    });
  }
  return changed;
}
