// Creating new objects: text boxes, pictures (from files, blobs or placeholders), shapes and lines,
// with sensible default sizes and placement. Used by the Insert tab, drawing tools, paste and
// drag-and-drop.

import { app } from './app.js';
import { createElement, createTextFrame, addAsset, findElement } from './model.js';
import { prepareImage, placementSize } from './images.js';
import { plainTextToHtml } from './clipboard.js';
import { SHAPE_LABELS } from './render/shapes.js';

/** Default sizes (px) when an object is placed with a click instead of drawn. */
export const DEFAULT_SIZES = {
  text: { w: 288, h: 96 },
  shape: { w: 144, h: 144 },
  line: { w: 192, h: 12 },
  picture: { w: 192, h: 144 },
  table: { w: 384, h: 96 }
};

const TYPE_LABEL = { text: 'Text Box', shape: 'Shape', line: 'Line', picture: 'Picture', table: 'Table' };

/**
 * Build (but do not place) a new element for a drawing tool.
 * @param {object} doc
 * @param {{ kind: 'text'|'shape'|'line'|'picture', shape?: string, arrow?: boolean, html?: string }} tool
 * @param {{ x: number, y: number, w: number, h: number, rot?: number }} rect page rectangle
 */
export function buildObject(doc, tool, rect) {
  const box = { x: round(rect.x), y: round(rect.y), w: Math.max(1, round(rect.w)), h: Math.max(1, round(rect.h)), rot: rect.rot || 0 };
  switch (tool.kind) {
    case 'text':
      return createTextFrame(doc, { ...box, name: '' }, tool.html || '<p></p>');
    case 'picture':
      return createElement('image', { ...box, assetId: null, fit: 'fill' });
    case 'line':
      return createElement('line', { ...box, h: 12, y: round(rect.y + rect.h / 2 - 6), arrowEnd: tool.arrow ? 'triangle' : 'none' });
    case 'shape':
    default: {
      const shape = tool.shape || 'rect';
      const props = { ...box, shape, name: '' };
      if (shape === 'roundRect') props.radius = Math.round(Math.min(box.w, box.h) * 0.16);
      return createElement('shape', props);
    }
  }
}

/** Undo label for inserting with a tool. */
export function insertLabel(tool) {
  if (tool.kind === 'shape') return `Insert ${SHAPE_LABELS[tool.shape] || 'Shape'}`;
  if (tool.kind === 'line' && tool.arrow) return 'Insert Arrow';
  return `Insert ${TYPE_LABEL[tool.kind] || 'Object'}`;
}

/** A default-size rectangle centred on (cx, cy), or centred on the page when omitted. */
export function defaultRect(doc, kind, center = null) {
  const s = DEFAULT_SIZES[kind] || DEFAULT_SIZES.shape;
  const cx = center ? center.x : doc.setup.width / 2;
  const cy = center ? center.y : doc.setup.height / 2;
  return { x: cx - s.w / 2, y: cy - s.h / 2, w: s.w, h: kind === 'line' ? 0 : s.h };
}

/**
 * Insert a new object on the editing surface as one undo step and select it.
 * @returns {object|null} the new element
 */
export function insertObject(tool, rect = null) {
  const doc = app.doc, page = app.page;
  if (!doc || !page) return null;
  const r = rect || defaultRect(doc, tool.kind);
  let created = null;
  app.transact(insertLabel(tool), (d) => {
    created = buildObject(d, tool, r);
    app.page.elements.push(created);
    app.select([created.id]);
  });
  return created;
}

/** Insert a text box containing plain text (paste). */
export function insertTextBox(text, center = null) {
  const doc = app.doc;
  if (!doc) return null;
  const lines = String(text).split(/\r?\n/);
  const longest = Math.max(...lines.map((l) => l.length), 8);
  const w = Math.min(doc.setup.width * 0.8, Math.max(144, longest * 7.5));
  const hgt = Math.min(doc.setup.height * 0.8, Math.max(40, lines.length * 20 + 16));
  const c = center || { x: doc.setup.width / 2, y: doc.setup.height / 2 };
  return insertObject({ kind: 'text', html: plainTextToHtml(text) }, { x: c.x - w / 2, y: c.y - hgt / 2, w, h: hgt });
}

/**
 * Insert pictures from files/blobs. Each becomes a picture frame sized to the image (at most 60 %
 * of the page), cascaded from `at` (page point) or the page centre. One undo step for all.
 * @param {Blob[]} files
 * @param {{ at?: {x:number,y:number} }} [opts]
 * @returns {Promise<object[]>} the new elements
 */
export async function insertPictures(files, opts = {}) {
  const doc = app.doc;
  if (!doc || !files.length) return [];
  const prepared = [];
  for (const f of files) {
    try { prepared.push(await prepareImage(f)); } catch (err) { app.ui.toast(err.message || String(err)); }
  }
  if (!prepared.length || app.doc !== doc) return [];
  const made = [];
  app.transact(prepared.length > 1 ? 'Insert Pictures' : 'Insert Picture', (d) => {
    prepared.forEach((img, i) => {
      const assetId = addAsset(d, img);
      const s = placementSize(img.width, img.height, d.setup.width, d.setup.height);
      const c = opts.at || { x: d.setup.width / 2, y: d.setup.height / 2 };
      const el = createElement('image', { x: round(c.x - s.w / 2 + i * 18), y: round(c.y - s.h / 2 + i * 18), w: s.w, h: s.h, assetId, fit: 'fill', name: stripExt(img.name) });
      app.page.elements.push(el);
      made.push(el);
    });
    app.select(made.map((e) => e.id));
  });
  return made;
}

/**
 * Put a picture file into an existing picture frame (replace picture / fill placeholder). The frame
 * keeps its size; the picture fills it (cropped), as a picture placeholder does in Publisher.
 */
export async function fillPicture(frameId, file) {
  const img = await prepareImage(file);
  const doc = app.doc;
  if (!doc || !findElement(doc, frameId)) return false;
  app.transact('Change Picture', (d) => {
    const hit = findElement(d, frameId);
    if (!hit || hit.el.type !== 'image') return;
    hit.el.assetId = addAsset(d, img);
    hit.el.content = null;
    if (hit.el.fit === 'custom') hit.el.fit = 'fill';
    if (!hit.el.name) hit.el.name = stripExt(img.name);
  });
  return true;
}

const round = (v) => Math.round(v * 100) / 100;
const stripExt = (n) => String(n || '').replace(/\.[a-z0-9]{2,5}$/i, '');
