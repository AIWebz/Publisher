// Picture Format (crop mode, fit, adjustments, transparency, border, shadow) and Shape Format (change shape,
// fill, outline, shadow, quick styles) contextual tabs; building blocks; calendars.

import { app } from '../../core/app.js';
import { registry } from '../../core/registry.js';
import { findElement, SHAPE_KINDS, cloneElements, unionBounds, translateElement } from '../../core/model.js';
import { h } from '../../core/ui/dom.js';
import { colorPicker } from '../../core/ui/colorpicker.js';
import { imageContentBox } from '../../core/render/elements.js';
import { SHAPE_LABELS } from '../../core/render/shapes.js';
import { applyToSelection, colorRibbonItem } from '../core-common.js';
import { row, sliderField, numberField } from '../../core/ui/fields.js';
import { BUILDING_BLOCKS, BLOCK_CATEGORIES } from '../../engines/templates/blocks.js';
import { buildMonthTable } from '../../engines/templates/calendar.js';
import './graphics.css';

const one = (ctx, type) => (ctx.selection || []).length === 1 && ctx.selection[0].type === type;
const anyType = (ctx, types) => (ctx.selection || []).some((e) => types.includes(e.type));
const pic = (ctx) => one(ctx, 'image') && !!ctx.selection[0].assetId;

// ---------------------------------------------------------------- crop mode
let crop = null; // { id }
function contentOf(el) { return { ...imageContentBox(el, app.doc.assets[el.assetId]) }; }
registry.command({
  id: 'picture.crop', label: 'Crop', icon: 'crop', title: 'Drag the picture to reposition it inside its frame; scroll or use the slider to zoom. Press Enter or Esc when done.',
  enabled: pic, checked: () => !!crop,
  run: (ctx) => { if (crop) { endCrop(); return; } crop = { id: ctx.selection[0].id }; app.canvas.requestRender(); app.ribbon && app.ribbon.update && app.ribbon.update(); app.ui.toast('Crop: drag the picture to reposition, scroll to zoom. Enter or Esc to finish.'); }
});
function endCrop() { crop = null; if (app.canvas) app.canvas.requestRender(); if (app.ribbon && app.ribbon.update) app.ribbon.update(); }
app.on('selection', () => { if (crop && !(app.selectionIds.length === 1 && app.selectionIds[0] === crop.id)) endCrop(); });
app.on('render', () => {
  document.querySelectorAll('.img-clip.cropping').forEach((n) => n.classList.remove('cropping'));
  if (!crop) return;
  const node = app.canvas && app.canvas.nodeFor(crop.id);
  const clip = node && node.querySelector('.img-clip');
  if (clip) clip.classList.add('cropping');
});
document.addEventListener('keydown', (e) => { if (crop && (e.key === 'Escape' || e.key === 'Enter')) { e.preventDefault(); e.stopPropagation(); endCrop(); } }, true);
document.addEventListener('pointerdown', (e) => {
  if (!crop || e.button !== 0) return;
  const node = app.canvas && app.canvas.nodeFor(crop.id);
  if (!node || !node.contains(e.target)) return;
  e.preventDefault(); e.stopPropagation();
  const el = findElement(app.doc, crop.id).el;
  const start = contentOf(el);
  const z = (app.view && app.view.zoom) || 1;
  const x0 = e.clientX, y0 = e.clientY;
  const img = node.querySelector('.img-clip img');
  let last = start;
  const move = (ev) => {
    last = { ...start, x: start.x + (ev.clientX - x0) / z, y: start.y + (ev.clientY - y0) / z };
    if (img) { img.style.left = `${last.x}px`; img.style.top = `${last.y}px`; }
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    app.transact('Crop', (doc) => { const hit = findElement(doc, crop && crop.id); if (hit) { hit.el.content = last; hit.el.fit = 'custom'; } });
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}, true);
document.addEventListener('wheel', (e) => {
  if (!crop || e.ctrlKey || e.metaKey) return;
  const node = app.canvas && app.canvas.nodeFor(crop.id);
  if (!node || !node.contains(e.target)) return;
  e.preventDefault();
  zoomContent(e.deltaY < 0 ? 1.06 : 1 / 1.06);
}, { passive: false, capture: true });
function zoomContent(f) {
  const id = crop ? crop.id : app.selectionIds[0];
  app.transact('Crop', (doc) => {
    const hit = findElement(doc, id); if (!hit) return;
    const el = hit.el; const c = contentOf(el);
    const cx = el.w / 2, cy = el.h / 2;
    el.content = { x: cx - (cx - c.x) * f, y: cy - (cy - c.y) * f, w: c.w * f, h: c.h * f };
    el.fit = 'custom';
  }, { coalesce: 'crop-zoom' });
}
registry.command({ id: 'picture.zoomIn', label: 'Zoom Picture In', icon: 'zoom-in', enabled: pic, run: () => zoomContent(1.1) });
registry.command({ id: 'picture.zoomOut', label: 'Zoom Picture Out', icon: 'zoom-out', enabled: pic, run: () => zoomContent(1 / 1.1) });
registry.command({
  id: 'picture.cropAspect', label: 'Crop to Aspect Ratio', icon: 'crop', enabled: pic,
  run: (ctx, ratio) => app.transact('Crop to Aspect Ratio', (doc) => {
    const el = findElement(doc, ctx.selection[0].id).el;
    const a = doc.assets[el.assetId];
    const r = ratio === 'original' ? a.width / a.height : ratio;
    const area = el.w * el.h;
    const nw = Math.sqrt(area * r), nh = nw / r;
    const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
    Object.assign(el, { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh, content: null, fit: 'fill' });
  })
});
registry.command({ id: 'picture.fit', label: 'Picture Fit', icon: 'picture', enabled: pic, run: (ctx, fit) => applyToSelection('Picture Fit', (el) => { el.fit = fit; el.content = null; }, { types: ['image'], deep: false }) });
registry.command({
  id: 'picture.adjust', label: 'Adjust Picture', icon: 'sparkle', enabled: pic,
  run: (ctx, preset) => applyToSelection('Recolour', (el) => {
    const P = { none: {}, gray: { grayscale: 100 }, sepia: { sepia: 80 }, washout: { brightness: 135, contrast: 60 }, bright: { brightness: 115, contrast: 105 }, vivid: { saturate: 140, contrast: 110 }, dark: { brightness: 80 } };
    el.adjust = Object.keys(P[preset] || {}).length ? { ...(P[preset]) } : undefined;
  }, { types: ['image'], deep: false })
});
registry.command({ id: 'picture.border', label: 'Picture Border', icon: 'outline', enabled: (ctx) => one(ctx, 'image'), run: (ctx, w) => applyToSelection('Picture Border', (el) => { el.stroke = { ...(el.stroke || {}), color: el.stroke && el.stroke.color ? el.stroke.color : '@ink', width: w }; }, { types: ['image'], deep: false }) });

// ---------------------------------------------------------------- shapes
const SH = ['shape', 'line'];
registry.command({ id: 'shape.change', label: 'Change Shape', icon: 'shape-change', enabled: (ctx) => anyType(ctx, ['shape']), run: (ctx, kind) => applyToSelection('Change Shape', (el) => { el.shape = kind; if (kind === 'roundRect' && !el.radius) el.radius = Math.round(Math.min(el.w, el.h) * 0.16); }, { types: ['shape'] }) });
registry.command({ id: 'shape.outlineWidth', label: 'Outline Weight', icon: 'outline', enabled: (ctx) => anyType(ctx, ['shape', 'line', 'text', 'image']), run: (ctx, w) => applyToSelection('Outline Weight', (el) => { el.stroke = { color: '@ink', dash: 'solid', ...(el.stroke || {}), width: w }; }, { types: ['shape', 'line', 'text', 'image'] }) });
registry.command({ id: 'shape.dash', label: 'Dashes', icon: 'outline', enabled: (ctx) => anyType(ctx, ['shape', 'line', 'text', 'image']), run: (ctx, d) => applyToSelection('Dashes', (el) => { el.stroke = { color: '@ink', width: 1, ...(el.stroke || {}), dash: d }; }, { types: ['shape', 'line', 'text', 'image'] }) });
registry.command({ id: 'shape.arrows', label: 'Arrows', icon: 'arrow-line', enabled: (ctx) => anyType(ctx, ['line']), run: (ctx, a) => applyToSelection('Arrows', (el) => { el.arrowStart = a[0]; el.arrowEnd = a[1]; }, { types: ['line'] }) });
const SHADOWS = { none: { enabled: false }, soft: { enabled: true, x: 3, y: 4, blur: 10, color: '#000000', opacity: 0.25 }, hard: { enabled: true, x: 5, y: 5, blur: 0, color: '#000000', opacity: 0.35 }, glow: { enabled: true, x: 0, y: 0, blur: 14, color: '@accent2', opacity: 0.8 }, lifted: { enabled: true, x: 0, y: 10, blur: 18, color: '#000000', opacity: 0.3 } };
registry.command({ id: 'shape.shadow', label: 'Shadow', icon: 'shadow', enabled: (ctx) => (ctx.selection || []).length > 0, run: (ctx, k) => applyToSelection('Shadow', (el) => { el.shadow = { enabled: false, x: 3, y: 3, blur: 6, color: '#000000', opacity: 0.3, ...(SHADOWS[k] || {}) }; }, { types: ['shape', 'line', 'text', 'image'] }) });
const QUICK = [
  ['Accent fill', { fill: { type: 'solid', color: '@accent' }, stroke: { color: '@ink', width: 0, dash: 'solid' } }],
  ['Highlight fill', { fill: { type: 'solid', color: '@accent2' }, stroke: { color: '@ink', width: 0, dash: 'solid' } }],
  ['Outline', { fill: { type: 'none' }, stroke: { color: '@accent', width: 2, dash: 'solid' } }],
  ['Tint with outline', { fill: { type: 'solid', color: '@light' }, stroke: { color: '@accent', width: 1.5, dash: 'solid' } }],
  ['Gradient', { fill: { type: 'linear', color: '@accent', color2: '@accent2', angle: 135 }, stroke: { color: '@ink', width: 0, dash: 'solid' } }],
  ['Ink', { fill: { type: 'solid', color: '@ink' }, stroke: { color: '@ink', width: 0, dash: 'solid' } }],
  ['Dashed', { fill: { type: 'none' }, stroke: { color: '@muted', width: 1.5, dash: 'dash' } }]
];
registry.command({ id: 'shape.quickStyle', label: 'Shape Style', icon: 'fill', enabled: (ctx) => anyType(ctx, ['shape']), run: (ctx, i) => applyToSelection('Shape Style', (el) => { Object.assign(el, JSON.parse(JSON.stringify(QUICK[i][1]))); }, { types: ['shape'] }) });

const fillItem = colorRibbonItem({ icon: 'fill', label: 'Fill', get: (ctx) => { const el = (ctx.selection || [])[0]; return el && el.fill && el.fill.type !== 'none' ? el.fill.color : 'transparent'; },
  set: (v) => applyToSelection('Fill', (el) => { el.fill = v === 'transparent' ? { type: 'none' } : { ...(el.fill && el.fill.type !== 'none' ? el.fill : { type: 'solid' }), color: v }; }, { types: ['shape', 'text', 'image', 'table'] }),
  enabled: (ctx) => anyType(ctx, ['shape', 'text', 'image', 'table']) });
const outlineItem = colorRibbonItem({ icon: 'outline', label: 'Outline', get: (ctx) => { const el = (ctx.selection || [])[0]; return el && el.stroke && el.stroke.width > 0 ? el.stroke.color : 'transparent'; },
  set: (v) => applyToSelection('Outline', (el) => { el.stroke = v === 'transparent' ? { ...(el.stroke || {}), width: 0 } : { dash: 'solid', ...(el.stroke || {}), color: v, width: (el.stroke && el.stroke.width) || (el.type === 'line' ? 2 : 1) }; }, { types: ['shape', 'line', 'text', 'image'] }),
  enabled: (ctx) => anyType(ctx, ['shape', 'line', 'text', 'image']) });

const weightMenu = { type: 'menu', label: 'Weight', icon: 'outline', size: 'small', items: () => [0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6].map((pt) => ({ label: `${pt} pt`, command: 'shape.outlineWidth', arg: pt / 0.75 })) };
const dashMenu = { type: 'menu', label: 'Dashes', icon: 'outline', size: 'small', items: () => [['solid', 'Solid'], ['dash', 'Dash'], ['longDash', 'Long dash'], ['dot', 'Dot'], ['dashDot', 'Dash dot']].map(([v, l]) => ({ label: l, command: 'shape.dash', arg: v })) };
const shadowMenu = { type: 'menu', label: 'Shadow', icon: 'shadow', size: 'large', items: () => [['none', 'No Shadow'], ['soft', 'Soft'], ['hard', 'Offset'], ['lifted', 'Lifted'], ['glow', 'Glow']].map(([k, l]) => ({ label: l, command: 'shape.shadow', arg: k })) };

registry.group({ tab: 'shapeFormat', id: 'insertShape', label: 'Insert Shapes', order: 5, items: [
  { type: 'menu', label: 'Change Shape', icon: 'shape-change', size: 'large', items: () => SHAPE_KINDS.map((k) => ({ label: SHAPE_LABELS[k] || k, command: 'shape.change', arg: k })) }
] });
registry.group({ tab: 'shapeFormat', id: 'styles', label: 'Shape Styles', order: 10, items: [
  { type: 'menu', label: 'Quick Styles', icon: 'fill', size: 'large', items: () => QUICK.map((q, i) => ({ label: q[0], command: 'shape.quickStyle', arg: i })) },
  fillItem, outlineItem, weightMenu, dashMenu,
  { type: 'menu', label: 'Arrows', icon: 'arrow-line', size: 'small', items: () => [[['none', 'none'], 'No arrows'], [['none', 'triangle'], 'Arrow at end'], [['triangle', 'none'], 'Arrow at start'], [['triangle', 'triangle'], 'Both ends'], [['circle', 'circle'], 'Round ends'], [['diamond', 'diamond'], 'Diamond ends']].map(([a, l]) => ({ label: l, command: 'shape.arrows', arg: a })) }
] });
registry.group({ tab: 'shapeFormat', id: 'effects', label: 'Effects', order: 20, items: [shadowMenu] });

registry.group({ tab: 'pictureFormat', id: 'adjust', label: 'Adjust', order: 5, items: [
  { command: 'picture.change', size: 'large', label: 'Change Picture' }, { command: 'picture.reset', size: 'small', label: 'Reset' },
  { type: 'menu', label: 'Recolour', icon: 'sparkle', size: 'small', items: () => [['none', 'No Recolour'], ['gray', 'Greyscale'], ['sepia', 'Sepia'], ['washout', 'Washout'], ['bright', 'Brighter'], ['dark', 'Darker'], ['vivid', 'Vivid']].map(([k, l]) => ({ label: l, command: 'picture.adjust', arg: k })) }
] });
registry.group({ tab: 'pictureFormat', id: 'crop', label: 'Crop', order: 10, items: [
  { command: 'picture.crop', size: 'large' },
  { type: 'menu', label: 'Fit', icon: 'picture', size: 'small', items: () => [{ label: 'Fill frame', command: 'picture.fit', arg: 'fill' }, { label: 'Fit inside frame', command: 'picture.fit', arg: 'fit' }, { label: 'Stretch', command: 'picture.fit', arg: 'stretch' }] },
  { type: 'menu', label: 'Aspect Ratio', icon: 'crop', size: 'small', items: () => [['original', 'Original'], [1, 'Square 1:1'], [4 / 3, '4:3'], [3 / 2, '3:2'], [16 / 9, '16:9'], [3 / 4, 'Portrait 3:4'], [2 / 3, 'Portrait 2:3']].map(([r, l]) => ({ label: l, command: 'picture.cropAspect', arg: r })) },
  { command: 'picture.zoomIn', size: 'icon' }, { command: 'picture.zoomOut', size: 'icon' }
] });
registry.group({ tab: 'pictureFormat', id: 'styles', label: 'Picture Styles', order: 20, items: [
  outlineItem, { type: 'menu', label: 'Border Weight', icon: 'outline', size: 'small', items: () => [0, 0.75, 1.5, 3, 4.5, 6, 9].map((pt) => ({ label: pt ? `${pt} pt` : 'No border', command: 'picture.border', arg: pt / 0.75 })) }, shadowMenu
] });

// picture adjustments in the inspector
registry.inspector({
  id: 'pictureAdjust', title: 'Picture Adjustments', order: 22,
  when: (ctx) => pic(ctx),
  render(body) {
    const mk = (key, label, min, max, def) => {
      const s = sliderField({ min, max, suffix: '%', onChange: (v) => applyToSelection('Adjust Picture', (el) => { el.adjust = { ...(el.adjust || {}), [key]: v }; }, { types: ['image'], deep: false, coalesce: `adj-${key}` }) });
      return { key, def, s, row: row(label, s.el) };
    };
    const fields = [mk('brightness', 'Brightness', 20, 200, 100), mk('contrast', 'Contrast', 20, 200, 100), mk('saturate', 'Saturation', 0, 200, 100), mk('grayscale', 'Greyscale', 0, 100, 0)];
    const zoom = numberField({ suffix: '%', min: 10, max: 1000, onChange: (v) => {
      const el = app.selection[0]; const c = contentOf(el); const cur = c.w / el.w * 100; zoomContent(v / cur);
    } });
    body.append(...fields.map((f) => f.row), row('Zoom', zoom.el), h('div', { class: 'ins-actions' }, h('button', { type: 'button', class: 'btn sm', text: 'Crop…', onclick: () => app.exec('picture.crop') })));
    return { update(ctx) { const el = ctx.selection[0]; for (const f of fields) f.s.set((el.adjust && el.adjust[f.key] !== undefined) ? el.adjust[f.key] : f.def); const c = contentOf(el); zoom.set(Math.round(c.w / el.w * 100)); } };
  }
});

// ---------------------------------------------------------------- building blocks
async function customBlocks() { try { return (await app.platform.store.get('blocks:custom')) || []; } catch { return []; } }
registry.command({
  id: 'blocks.insert', label: 'Building Block', icon: 'sparkle', enabled: (ctx) => !!ctx.doc,
  run: async (ctx, id) => {
    if (typeof id === 'string' && id.startsWith('custom:')) {
      const rec = (await customBlocks()).find((b) => b.id === id.slice(7));
      if (!rec) return;
      app.transact(`Insert ${rec.name}`, (doc) => {
        const copies = cloneElements(rec.source, rec.source.pages[0].elements, doc);
        const bb = unionBounds(copies);
        for (const el of copies) { translateElement(el, (doc.setup.width - bb.w) / 2 - bb.x, (doc.setup.height - bb.h) / 2 - bb.y); app.page.elements.push(el); }
        app.select(copies.map((e) => e.id));
      });
      return;
    }
    const blk = BUILDING_BLOCKS.find((b) => b.id === id);
    if (!blk) return;
    app.transact(`Insert ${blk.name}`, (doc) => {
      const els = blk.build(doc, { x: 0, y: 0 });
      const b = unionBounds(els);
      for (const el of els) { translateElement(el, (doc.setup.width - b.w) / 2 - b.x, (doc.setup.height - b.h) / 2 - b.y); app.page.elements.push(el); }
      app.select(els.map((e) => e.id));
    });
  }
});
registry.command({
  id: 'blocks.save', label: 'Add Selection to Building Blocks…', icon: 'plus', enabled: (ctx) => (ctx.selection || []).length > 0,
  run: async () => {
    const name = await app.ui.prompt('Save as Building Block', 'Name', 'My block');
    if (!name) return;
    const doc = app.doc;
    const src = { ...JSON.parse(JSON.stringify({ setup: doc.setup, theme: doc.theme, masters: [], data: null, meta: {} })), format: doc.format, version: doc.version, title: name, stories: {}, assets: {}, pages: [{ id: 'p', masterId: null, background: null, guides: { v: [], h: [] }, elements: [] }] };
    src.pages[0].elements = cloneElements(doc, app.selection, src);
    const list = await customBlocks();
    list.push({ id: `b${Date.now().toString(36)}`, name: name.slice(0, 60), source: src });
    await app.platform.store.set('blocks:custom', list);
    customCache = list;
    app.ui.toast(`Saved “${name}” to My Blocks`);
  }
});
let customCache = [];
customBlocks().then((l) => { customCache = l; });
registry.command({
  id: 'blocks.deleteCustom', label: 'Delete Custom Block', enabled: () => true,
  run: async (ctx, id) => { const list = (await customBlocks()).filter((b) => b.id !== id); await app.platform.store.set('blocks:custom', list); customCache = list; }
});
const blocksMenu = () => [
  ...BLOCK_CATEGORIES.map((c) => ({ label: c.name, submenu: BUILDING_BLOCKS.filter((b) => b.category === c.id).map((b) => ({ label: b.name, command: 'blocks.insert', arg: b.id })) })).filter((x) => x.submenu.length),
  { label: 'My Blocks', submenu: customCache.length ? customCache.map((b) => ({ label: b.name, command: 'blocks.insert', arg: `custom:${b.id}` })) : [{ label: 'None yet', disabled: true }] },
  '-', { label: 'Add Selection to Building Blocks…', command: 'blocks.save' }
];

// ---------------------------------------------------------------- calendars
registry.command({
  id: 'insert.calendar', label: 'Calendar', icon: 'calendar', enabled: (ctx) => !!ctx.doc,
  run: async () => {
    const now = new Date();
    const r = await app.ui.dialog({ title: 'Insert Calendar', fields: [
      { name: 'm', label: 'Month', type: 'select', value: String(now.getMonth()), half: true, options: Array.from({ length: 12 }, (_, i) => ({ value: String(i), label: new Date(2000, i, 1).toLocaleString('en-US', { month: 'long' }) })) },
      { name: 'y', label: 'Year', type: 'number', value: now.getFullYear(), min: 1900, max: 2200, step: 1, half: true },
      { name: 'w', label: 'Week starts on', type: 'select', value: '0', options: [{ value: '0', label: 'Sunday' }, { value: '1', label: 'Monday' }] }],
    buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Insert', value: 'ok', primary: true }] });
    if (!r || r.button !== 'ok') return;
    app.transact('Insert Calendar', (doc) => {
      const w = Math.min(doc.setup.width - 96, 560), hgt = w * 0.8;
      const t = buildMonthTable(doc, { year: Math.round(+r.values.y), month: +r.values.m, weekStart: +r.values.w, x: (doc.setup.width - w) / 2, y: (doc.setup.height - hgt) / 2, w, h: hgt });
      app.page.elements.push(t);
      app.select([t.id]);
    });
  }
});
registry.group({ tab: 'insert', id: 'blocks', label: 'Building Blocks', order: 25, items: [
  { type: 'menu', label: 'Building Blocks', icon: 'sparkle', size: 'large', items: blocksMenu },
  { command: 'insert.calendar', size: 'large' }
] });
void colorPicker; void SH;
