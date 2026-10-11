// Object clipboard: copies are self-contained (elements + the stories and assets they use), so
// they paste into any open document, even after the source document has been closed.

import { clone, cloneElements, walkElements, uid, translateElement, unionBounds } from './model.js';

/**
 * Build a clipboard payload from elements of `doc`.
 * @param {object} doc
 * @param {object[]} els
 * @param {{ pageId?: string, cut?: boolean }} [opts]
 */
export function makeClip(doc, els, opts = {}) {
  const stories = {}, assets = {};
  walkElements(els, (el) => {
    if (el.type === 'text' && el.storyId && doc.stories[el.storyId]) stories[el.storyId] = clone(doc.stories[el.storyId]);
    if (el.type === 'image' && el.assetId && doc.assets[el.assetId]) assets[el.assetId] = doc.assets[el.assetId];
  });
  return {
    id: uid('clip'),
    docId: doc.id,
    pageId: opts.pageId || null,
    elements: clone(els),
    stories,
    assets,
    // a cut pastes at the original position first; a copy pastes offset
    pastes: opts.cut ? -1 : 0
  };
}

/** Offset (px) for the next paste of `clip` onto page `pageId` of document `docId`. */
export function nextPasteOffset(clip, docId, pageId, step = 12) {
  if (clip.docId !== docId || clip.pageId !== pageId) return 0;
  clip.pastes += 1;
  return Math.max(0, clip.pastes) * step;
}

/**
 * Create new elements from a clip inside `targetDoc` (new ids, copied stories, assets added
 * once). Elements are offset by `offset` px and kept on the page when `page` size is given.
 * @returns {object[]} the new elements (not yet inserted in a page)
 */
export function pasteClip(clip, targetDoc, opts = {}) {
  const source = { id: clip.docId, stories: clip.stories, assets: clip.assets };
  const els = cloneElements(source, clip.elements, targetDoc);
  // cloneElements only copies assets across different documents; make sure they exist here.
  walkElements(els, (el) => {
    if (el.type === 'image' && el.assetId && !targetDoc.assets[el.assetId] && clip.assets[el.assetId]) {
      targetDoc.assets[el.assetId] = clip.assets[el.assetId];
    }
  });
  const off = opts.offset || 0;
  if (off) for (const el of els) translateElement(el, off, off);
  if (opts.pageWidth && opts.pageHeight && els.length) {
    const b = unionBounds(els);
    const outside = b.x > opts.pageWidth || b.y > opts.pageHeight || b.x + b.w < 0 || b.y + b.h < 0;
    if (outside) {
      const dx = (opts.pageWidth - b.w) / 2 - b.x, dy = (opts.pageHeight - b.h) / 2 - b.y;
      for (const el of els) translateElement(el, dx, dy);
    }
  }
  return els;
}

/** Plain text of the text frames (and table cells) in a clip, for the system clipboard. */
export function clipText(clip) {
  const parts = [];
  const seen = new Set();
  walkElements(clip.elements, (el) => {
    if (el.type === 'text' && clip.stories[el.storyId] && !seen.has(el.storyId)) {
      seen.add(el.storyId);
      parts.push(htmlToPlainText(clip.stories[el.storyId].html));
    }
    if (el.type === 'table') {
      for (const row of el.cells || []) parts.push(row.map((c) => (c.covered ? '' : htmlToPlainText(c.html))).join('\t'));
    }
  });
  return parts.filter(Boolean).join('\n\n');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Convert rich-text HTML to plain text (blocks become lines). */
export function htmlToPlainText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Convert plain text to story HTML paragraphs (escaped). */
export function plainTextToHtml(text) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const paras = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  return paras.map((p) => `<p>${p ? esc(p) : '<br>'}</p>`).join('');
}
