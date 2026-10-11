// Built-in preflight (design checker) checks and the runner that collects every registered check.
// The review feature builds the UI; core only provides the checks and runPreflight().

import { registry } from './registry.js';
import { walkElements, elementBounds } from './model.js';
import { layoutStories } from '../engines/text/flow.js';

const TYPE_NAMES = { text: 'Text box', image: 'Picture', shape: 'Shape', line: 'Line', table: 'Table', group: 'Group' };
const nameOf = (el) => el.name || TYPE_NAMES[el.type] || 'Object';

/** Objects entirely off the page (warning) or extending past the page edge beyond the bleed (info). */
export function checkOffPage(doc) {
  const out = [];
  const W = doc.setup.width, H = doc.setup.height, bleed = doc.setup.bleed || 0;
  doc.pages.forEach((p, pageIndex) => {
    for (const el of p.elements) {
      if (el.hidden) continue;
      const b = el.type === 'group' ? { x: el.x, y: el.y, w: el.w, h: el.h } : elementBounds(el);
      const outside = b.x >= W || b.y >= H || b.x + b.w <= 0 || b.y + b.h <= 0;
      if (outside) out.push({ level: 'warning', message: `${nameOf(el)} is off the page`, pageIndex, elementId: el.id });
      else if (b.x < -bleed - 0.5 || b.y < -bleed - 0.5 || b.x + b.w > W + bleed + 0.5 || b.y + b.h > H + bleed + 0.5) {
        out.push({ level: 'info', message: `${nameOf(el)} extends past the edge of the page`, pageIndex, elementId: el.id });
      }
    }
  });
  return out;
}

/** Picture placeholders with no picture. */
export function checkEmptyPictures(doc) {
  const out = [];
  doc.pages.forEach((p, pageIndex) => walkElements(p.elements, (el) => {
    if (el.type === 'image' && !el.assetId && !el.hidden) out.push({ level: 'warning', message: 'Empty picture placeholder', pageIndex, elementId: el.id });
  }));
  return out;
}

/** Pictures or backgrounds whose image data is missing. */
export function checkMissingAssets(doc) {
  const out = [];
  const scan = (list, pageIndex) => walkElements(list, (el) => {
    if (el.type === 'image' && el.assetId && !doc.assets[el.assetId]) out.push({ level: 'error', message: 'Picture is missing its image data', pageIndex, elementId: el.id });
  });
  doc.pages.forEach((p, i) => {
    scan(p.elements, i);
    if (p.background && p.background.type === 'image' && !doc.assets[p.background.assetId]) out.push({ level: 'error', message: 'Page background picture is missing', pageIndex: i, elementId: null });
  });
  doc.masters.forEach((m) => {
    scan(m.elements, -1);
    if (m.background && m.background.type === 'image' && !doc.assets[m.background.assetId]) out.push({ level: 'error', message: `Master page ${m.name} background picture is missing`, pageIndex: -1, elementId: null });
  });
  return out;
}

/** Hidden objects per page (they will not print). */
export function checkHidden(doc) {
  const out = [];
  doc.pages.forEach((p, pageIndex) => {
    let n = 0, first = null;
    walkElements(p.elements, (el) => { if (el.hidden) { n++; first = first || el.id; } });
    if (n) out.push({ level: 'info', message: `${n} hidden object${n > 1 ? 's' : ''} will not print`, pageIndex, elementId: first });
  });
  return out;
}

/** Text frames whose story does not fit (overflow on the last frame of a chain). */
export function checkOverflow(doc) {
  const out = [];
  let layout;
  try { layout = layoutStories(doc, {}); } catch (err) { console.error('preflight layout failed', err); return out; }
  doc.pages.forEach((p, pageIndex) => walkElements(p.elements, (el) => {
    if (el.type === 'text' && layout.get(el.id)?.overflow) out.push({ level: 'warning', message: 'Text does not fit in its text box (overflow)', pageIndex, elementId: el.id });
  }));
  return out;
}

export const CORE_CHECKS = [
  { id: 'core.offPage', label: 'Objects off the page', order: 10, check: checkOffPage },
  { id: 'core.emptyPictures', label: 'Empty picture placeholders', order: 20, check: checkEmptyPictures },
  { id: 'core.missingAssets', label: 'Missing pictures', order: 30, check: checkMissingAssets },
  { id: 'core.hidden', label: 'Hidden objects', order: 40, check: checkHidden },
  { id: 'core.overflow', label: 'Text overflow', order: 50, check: checkOverflow }
];

/** Register the built-in checks with a registry (default: the app registry). */
export function registerCoreChecks(reg = registry) {
  for (const c of CORE_CHECKS) reg.preflight(c);
}

/**
 * Run every registered preflight check. Each issue gets the check id.
 * @returns {{ level: string, message: string, pageIndex: number, elementId: string|null, check: string }[]}
 */
export function runPreflight(doc, reg = registry) {
  const out = [];
  for (const c of reg.preflightList()) {
    try {
      for (const issue of c.check(doc) || []) out.push({ pageIndex: -1, elementId: null, ...issue, check: c.id });
    } catch (err) {
      console.error(`Preflight check ${c.id} failed`, err);
      out.push({ level: 'error', message: `Check "${c.label || c.id}" failed: ${err.message}`, pageIndex: -1, elementId: null, check: c.id });
    }
  }
  const rank = { error: 0, warning: 1, info: 2 };
  return out.sort((a, b) => (a.pageIndex - b.pageIndex) || (rank[a.level] - rank[b.level]));
}
