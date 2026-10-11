// Page thumbnails (pages panel, galleries, recovery lists): a full renderPage() in 'thumb' mode,
// scaled with a CSS transform, plus change signatures so callers only re-render pages that changed.

import { renderPage } from './index.js';
import { walkElements } from '../model.js';
import { hashString } from '../hash.js';

/**
 * Render a scaled thumbnail of `page` into `container` (replacing its contents).
 * @param {HTMLElement} container
 * @param {object} doc
 * @param {object} page a page or a master
 * @param {{ width?: number, height?: number, pageIndex?: number }} [opts] target box in CSS px (fits inside)
 * @returns {{ scale: number, width: number, height: number }}
 */
export function renderThumb(container, doc, page, opts = {}) {
  const W = doc.setup.width, H = doc.setup.height;
  const maxW = opts.width || 120, maxH = opts.height || Infinity;
  const scale = Math.min(maxW / W, maxH / H);
  const w = Math.max(1, Math.round(W * scale)), hgt = Math.max(1, Math.round(H * scale));
  const inner = document.createElement('div');
  inner.className = 'thumb-page';
  inner.style.cssText = `position:absolute;left:0;top:0;transform-origin:0 0;transform:scale(${scale});pointer-events:none`;
  renderPage(inner, doc, page, { mode: 'thumb', pageIndex: opts.pageIndex, record: opts.record || null });
  container.style.width = `${w}px`;
  container.style.height = `${hgt}px`;
  container.style.position = 'relative';
  container.style.overflow = 'hidden';
  container.replaceChildren(inner);
  return { scale, width: w, height: hgt };
}

/**
 * A signature of everything that affects how a page looks: the page, its master, the stories its
 * frames show, theme and page setup. Thumbnails re-render only when this changes.
 * @param {object} doc
 * @param {object} page
 * @param {number} [pageIndex]
 * @returns {string}
 */
export function pageSignature(doc, page, pageIndex = 0) {
  const master = page.masterId ? doc.masters.find((m) => m.id === page.masterId) : null;
  const stories = [];
  const collect = (list) => walkElements(list || [], (el) => {
    if (el.type === 'text' && doc.stories[el.storyId]) stories.push(doc.stories[el.storyId].html);
  });
  collect(page.elements);
  if (master) collect(master.elements);
  const parts = [
    JSON.stringify(page.elements), JSON.stringify(page.background), page.masterId || '',
    master ? JSON.stringify(master.elements) + JSON.stringify(master.background) : '',
    stories.join('\u0001'), JSON.stringify(doc.theme), JSON.stringify(doc.setup), String(pageIndex), String(doc.pages.length)
  ];
  return hashString(parts.join('\u0002'));
}
