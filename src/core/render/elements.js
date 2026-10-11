// Built-in element renderers (text, image, shape, line, table, group), registered through
// registry.elementType so features can extend or replace them.

import { registry } from '../registry.js';
import { resolveColor, resolveFont, fillToCSS } from '../theme.js';
import { getChain } from '../model.js';
import { substituteFields } from '../../engines/text/fields.js';
import { renderTable } from '../../engines/table/render.js';
import { shapeSVG, lineSVG, frameStrokeSVG, frameShadowCSS } from './paint.js';
import { iconHTML } from '../ui/icons.js';

const px = (n) => `${Math.round(n * 100) / 100}px`;

/** CSS for a frame's default text style (applied to the text flow container). */
export function textStyleCSS(doc, s) {
  return {
    fontFamily: resolveFont(doc, s.font),
    fontSize: `${s.size}pt`,
    color: resolveColor(doc, s.color),
    fontWeight: s.bold ? '700' : '400',
    fontStyle: s.italic ? 'italic' : 'normal',
    textDecoration: s.underline ? 'underline' : 'none',
    textTransform: s.caps ? 'uppercase' : 'none',
    letterSpacing: `${s.letterSpacing || 0}px`,
    lineHeight: String(s.lineHeight || 1.25),
    textAlign: s.align || 'left'
  };
}

/** Apply a text frame's box styles (padding, columns, valign, default text style) to its content elements. */
export function styleTextFrame(doc, el, box, flow) {
  const p = el.padding || { top: 4, right: 4, bottom: 4, left: 4 };
  box.style.padding = `${px(p.top)} ${px(p.right)} ${px(p.bottom)} ${px(p.left)}`;
  box.style.justifyContent = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[el.valign] || 'flex-start';
  Object.assign(flow.style, textStyleCSS(doc, el.style || {}));
  flow.style.setProperty('--space-before', px(el.style?.spaceBefore || 0));
  flow.style.setProperty('--space-after', px(el.style?.spaceAfter || 0));
  const cols = Math.max(1, Math.round(el.columns || 1));
  if (cols > 1) {
    flow.style.columnCount = String(cols);
    flow.style.columnGap = px(el.colGap ?? 12);
    flow.style.columnFill = 'auto';
    flow.style.height = '100%';
  }
}

/** Box (relative to the frame) where a picture's image is drawn. */
export function imageContentBox(el, asset) {
  if (el.content && el.content.w > 0 && el.content.h > 0) return el.content;
  const aw = (asset && asset.width) || el.w, ah = (asset && asset.height) || el.h;
  if (el.fit === 'stretch') return { x: 0, y: 0, w: el.w, h: el.h };
  const s = el.fit === 'fit' ? Math.min(el.w / aw, el.h / ah) : Math.max(el.w / aw, el.h / ah);
  const w = aw * s, h = ah * s;
  return { x: (el.w - w) / 2, y: (el.h - h) / 2, w, h };
}

function frameChrome(node, el, rctx) {
  node.style.background = fillToCSS(rctx.doc, el.fill);
  node.style.borderRadius = el.radius ? px(el.radius) : '';
  const filter = frameShadowCSS(rctx.doc, el.shadow);
  if (filter) node.style.filter = filter;
}

function renderText(node, el, rctx) {
  frameChrome(node, el, rctx);
  const box = document.createElement('div');
  box.className = 'tx-box';
  const flow = document.createElement('div');
  flow.className = 'tx-flow';
  styleTextFrame(rctx.doc, el, box, flow);
  let lay = rctx.layout ? rctx.layout.get(el.id) : null;
  if (!lay) {
    // not laid out (e.g. layout failed): show the story in the head frame only
    const chain = getChain(rctx.doc, el.id);
    const story = rctx.doc.stories[el.storyId];
    const html = chain[0] && chain[0].id === el.id && story ? substituteFields(story.html, (n) => rctx.resolveField(n, el)) : '';
    lay = { html, overflow: false, scale: 1 };
  }
  flow.innerHTML = lay.html || '';
  if (lay.scale && lay.scale !== 1) {
    flow.style.zoom = String(lay.scale);
    flow.style.width = `${100 / lay.scale}%`;
    if (flow.style.height) flow.style.height = `${100 / lay.scale}%`;
  }
  box.appendChild(flow);
  node.appendChild(box);
  const stroke = frameStrokeSVG(rctx.doc, el.w, el.h, el.stroke, el.radius);
  if (stroke) node.insertAdjacentHTML('beforeend', stroke);
  if (rctx.mode === 'edit' && lay.overflow) {
    node.classList.add('has-overflow');
    node.insertAdjacentHTML('beforeend', '<span class="tx-overflow" title="Text does not fit (overflow)">A…</span>');
  }
}

function renderImage(node, el, rctx) {
  frameChrome(node, el, rctx);
  const asset = el.assetId ? rctx.doc.assets[el.assetId] : null;
  if (asset) {
    const clip = document.createElement('div');
    clip.className = 'img-clip';
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.src = asset.data;
    const b = imageContentBox(el, asset);
    Object.assign(img.style, { left: px(b.x), top: px(b.y), width: px(b.w), height: px(b.h) });
    if (el.flipH || el.flipV) img.style.transform = `scale(${el.flipH ? -1 : 1}, ${el.flipV ? -1 : 1})`;
    const a = el.adjust;
    if (a) {
      const f = [];
      if (a.brightness !== undefined && a.brightness !== 100) f.push(`brightness(${a.brightness}%)`);
      if (a.contrast !== undefined && a.contrast !== 100) f.push(`contrast(${a.contrast}%)`);
      if (a.saturate !== undefined && a.saturate !== 100) f.push(`saturate(${a.saturate}%)`);
      if (a.grayscale) f.push(`grayscale(${a.grayscale}%)`);
      if (a.sepia) f.push(`sepia(${a.sepia}%)`);
      if (f.length) img.style.filter = f.join(' ');
    }
    if (el.cropping && rctx.mode === 'edit') clip.classList.add('cropping');
    clip.appendChild(img);
    node.appendChild(clip);
  } else if (rctx.mode === 'edit') {
    const missing = !!el.assetId;
    node.insertAdjacentHTML('beforeend', `<div class="img-placeholder${missing ? ' missing' : ''}">${iconHTML(missing ? 'warning' : 'picture-placeholder')}<span>${missing ? 'Missing picture' : 'Picture'}</span></div>`);
  }
  const stroke = frameStrokeSVG(rctx.doc, el.w, el.h, el.stroke, el.radius);
  if (stroke) node.insertAdjacentHTML('beforeend', stroke);
}

function renderShape(node, el, rctx) {
  node.innerHTML = shapeSVG(rctx.doc, el);
}

function renderLine(node, el, rctx) {
  node.innerHTML = lineSVG(rctx.doc, el);
}

function renderTableEl(node, el, rctx) {
  renderTable(node, el, { doc: rctx.doc, mode: rctx.mode, resolveField: (name) => rctx.resolveField(name, el) });
}

function renderGroup(node, el, rctx) {
  const sub = { ...rctx, offset: { x: el.x, y: el.y } };
  for (const child of el.children) {
    if (child.hidden && !rctx.showHidden) continue;
    node.appendChild(rctx.renderElement(child, sub));
  }
}

/** Register the core element renderers. */
export function registerCoreElementTypes() {
  registry.elementType('text', { label: 'Text box', render: renderText });
  registry.elementType('image', { label: 'Picture', render: renderImage });
  registry.elementType('shape', { label: 'Shape', render: renderShape });
  registry.elementType('line', { label: 'Line', render: renderLine });
  registry.elementType('table', { label: 'Table', render: renderTableEl });
  registry.elementType('group', { label: 'Group', render: renderGroup });
}
