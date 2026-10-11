// Page Design tab: page size, orientation, margins, columns, units, facing pages, bleed, backgrounds,
// colour and font schemes, master pages.

import { app } from '../core/app.js';
import { registry } from '../core/registry.js';
import { PAGE_SIZES, matchPageSize } from '../core/model.js';
import { COLOR_SCHEMES, FONT_SCHEMES, SCHEME_KEYS, SCHEME_LABELS } from '../core/theme.js';
import { UNITS, formatUnit } from '../core/units.js';
import { h } from '../core/ui/dom.js';
import { setTip } from '../core/ui/tooltip.js';

const hasDoc = (ctx) => !!ctx.doc;

registry.command({
  id: 'design.pageSize', label: 'Page Size', icon: 'page-size', enabled: hasDoc,
  checked: (ctx, key) => !!(ctx.doc && key && matchPageSize(ctx.doc.setup.width, ctx.doc.setup.height) === key),
  run: (ctx, key) => {
    const s = PAGE_SIZES[key];
    if (!s) return app.exec('design.customSize');
    app.transact('Page Size', (doc) => {
      const land = doc.setup.width > doc.setup.height;
      const natLand = s.w > s.h;
      [doc.setup.width, doc.setup.height] = land === natLand || s.w === s.h ? [s.w, s.h] : [s.h, s.w];
    });
    app.canvas.fitPage();
  }
});
registry.command({
  id: 'design.customSize', label: 'Custom Page Size…', icon: 'page-size', enabled: hasDoc,
  run: async () => {
    const d = app.doc;
    const r = await app.ui.dialog({
      title: 'Custom Page Size',
      fields: [
        { name: 'w', label: 'Width', type: 'length', value: d.setup.width, min: 48, half: true },
        { name: 'h', label: 'Height', type: 'length', value: d.setup.height, min: 48, half: true }
      ],
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'OK', value: 'ok', primary: true }]
    });
    if (!r || r.button !== 'ok' || !(r.values.w > 0) || !(r.values.h > 0)) return;
    app.transact('Page Size', (doc) => { doc.setup.width = Math.min(96 * 120, r.values.w); doc.setup.height = Math.min(96 * 120, r.values.h); });
    app.canvas.fitPage();
  }
});
for (const o of ['portrait', 'landscape']) {
  registry.command({
    id: `design.${o}`, label: o === 'portrait' ? 'Portrait' : 'Landscape', icon: o, enabled: hasDoc,
    checked: (ctx) => !!ctx.doc && (o === 'landscape' ? ctx.doc.setup.width > ctx.doc.setup.height : ctx.doc.setup.width <= ctx.doc.setup.height),
    run: () => {
      const s = app.doc.setup;
      if ((o === 'landscape') === (s.width > s.height) || s.width === s.height) return;
      app.transact('Orientation', (doc) => { [doc.setup.width, doc.setup.height] = [doc.setup.height, doc.setup.width]; });
      app.canvas.fitPage();
    }
  });
}
const MARGIN_PRESETS = { none: 0, narrow: 24, moderate: 48, wide: 96 };
registry.command({
  id: 'design.margins', label: 'Margins', icon: 'margins', enabled: hasDoc,
  run: async (ctx, preset) => {
    if (preset in MARGIN_PRESETS) {
      const m = MARGIN_PRESETS[preset];
      app.transact('Margins', (doc) => { doc.setup.margins = { top: m, right: m, bottom: m, left: m }; });
      return;
    }
    const m = app.doc.setup.margins;
    const r = await app.ui.dialog({
      title: 'Margin Guides',
      fields: [
        { name: 'top', label: 'Top', type: 'length', value: m.top, min: 0, half: true },
        { name: 'bottom', label: 'Bottom', type: 'length', value: m.bottom, min: 0, half: true },
        { name: 'left', label: app.doc.setup.facing ? 'Inside' : 'Left', type: 'length', value: m.left, min: 0, half: true },
        { name: 'right', label: app.doc.setup.facing ? 'Outside' : 'Right', type: 'length', value: m.right, min: 0, half: true }
      ],
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'OK', value: 'ok', primary: true }]
    });
    if (!r || r.button !== 'ok') return;
    app.transact('Margins', (doc) => { for (const k of ['top', 'right', 'bottom', 'left']) if (Number.isFinite(r.values[k])) doc.setup.margins[k] = Math.max(0, r.values[k]); });
  }
});
registry.command({
  id: 'design.columns', label: 'Columns…', icon: 'columns', enabled: hasDoc,
  run: async () => {
    const c = app.doc.setup.columns;
    const r = await app.ui.dialog({
      title: 'Column Guides',
      fields: [
        { name: 'count', label: 'Columns', type: 'number', value: c.count, min: 1, max: 12, step: 1, half: true },
        { name: 'gutter', label: 'Spacing', type: 'length', value: c.gutter, min: 0, half: true }
      ],
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'OK', value: 'ok', primary: true }]
    });
    if (!r || r.button !== 'ok') return;
    app.transact('Columns', (doc) => { doc.setup.columns = { count: Math.max(1, Math.min(12, Math.round(+r.values.count || 1))), gutter: Math.max(0, r.values.gutter || 0) }; });
  }
});
registry.command({
  id: 'design.units', label: 'Measurement Units', icon: 'units', enabled: hasDoc,
  checked: (ctx, u) => !!ctx.doc && ctx.doc.setup.units === u,
  run: (ctx, u) => { if (UNITS[u]) app.transact('Measurement Units', (doc) => { doc.setup.units = u; }); }
});
registry.command({
  id: 'design.bleed', label: 'Bleed…', icon: 'page-size', enabled: hasDoc,
  run: async () => {
    const v = await app.ui.dialog({ title: 'Bleed', fields: [{ name: 'b', label: 'Bleed around each page (for printing to the edge)', type: 'length', value: app.doc.setup.bleed || 0, min: 0 }], buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'OK', value: 'ok', primary: true }] });
    if (v && v.button === 'ok' && Number.isFinite(v.values.b)) app.transact('Bleed', (doc) => { doc.setup.bleed = Math.max(0, Math.min(96, v.values.b)); });
  }
});

// ---------------------------------------------------------------- schemes
registry.command({
  id: 'design.colorScheme', label: 'Colour Scheme', icon: 'color-scheme', enabled: hasDoc,
  checked: (ctx, id) => !!ctx.doc && ctx.doc.theme.schemeId === id,
  run: (ctx, id) => { const s = COLOR_SCHEMES[id]; if (s) app.transact('Colour Scheme', (doc) => { doc.theme.schemeId = id; doc.theme.colors = { ...s.colors }; }); }
});
registry.command({
  id: 'design.customColors', label: 'Customise Colours…', icon: 'color-scheme', enabled: hasDoc,
  run: async () => {
    const c = app.doc.theme.colors;
    const r = await app.ui.dialog({
      title: 'Scheme Colours',
      fields: SCHEME_KEYS.map((k) => ({ name: k, label: SCHEME_LABELS[k], type: 'color', value: c[k], half: true, allowNone: false, noTheme: true })),
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Apply', value: 'ok', primary: true }]
    });
    if (!r || r.button !== 'ok') return;
    app.transact('Scheme Colours', (doc) => {
      for (const k of SCHEME_KEYS) {
        const v = r.values[k];
        if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) doc.theme.colors[k] = v;
      }
      doc.theme.schemeId = 'custom';
    });
  }
});
registry.command({
  id: 'design.fontScheme', label: 'Font Scheme', icon: 'font-scheme', enabled: hasDoc,
  checked: (ctx, id) => !!ctx.doc && ctx.doc.theme.fontSchemeId === id,
  run: (ctx, id) => { const s = FONT_SCHEMES[id]; if (s) app.transact('Font Scheme', (doc) => { doc.theme.fontSchemeId = id; doc.theme.fonts = { heading: s.heading, body: s.body }; }); }
});

/** Ribbon gallery of colour schemes (swatch strips). */
function schemeGallery() {
  return {
    type: 'custom', className: 'rb-gallery',
    render(el) {
      const btns = Object.entries(COLOR_SCHEMES).map(([id, s]) => {
        const strip = h('span', { class: 'gal-strip' }, ...['paper', 'ink', 'accent', 'accent2', 'muted'].map((k) => h('i', { style: { background: s.colors[k] } })));
        const b = h('button', { type: 'button', class: 'gal-item', onclick: () => app.exec('design.colorScheme', id) }, strip, h('span', { class: 'gal-name', text: s.name }));
        setTip(b, s.name, '', 'Apply this colour scheme to the whole publication');
        return [id, b];
      });
      el.append(h('div', { class: 'gal-row' }, ...btns.map((x) => x[1])));
      return { update(ctx) { for (const [id, b] of btns) { b.classList.toggle('on', !!ctx.doc && ctx.doc.theme.schemeId === id); b.disabled = !ctx.doc; } } };
    }
  };
}
function fontGallery() {
  return {
    type: 'custom', className: 'rb-gallery',
    render(el) {
      const btns = Object.entries(FONT_SCHEMES).map(([id, s]) => {
        const b = h('button', { type: 'button', class: 'gal-item gal-font', onclick: () => app.exec('design.fontScheme', id) },
          h('b', { text: 'Aa', style: { fontFamily: `"${s.heading}", serif` } }), h('span', { class: 'gal-name', text: s.name }));
        setTip(b, s.name, '', `${s.heading} / ${s.body}`);
        return [id, b];
      });
      el.append(h('div', { class: 'gal-row' }, ...btns.map((x) => x[1])));
      return { update(ctx) { for (const [id, b] of btns) { b.classList.toggle('on', !!ctx.doc && ctx.doc.theme.fontSchemeId === id); b.disabled = !ctx.doc; } } };
    }
  };
}

const sizeMenu = (ctx) => [
  ...Object.entries(PAGE_SIZES).map(([k, s]) => ({ label: s.name, hint: `${formatUnit(s.w, ctx.doc ? ctx.doc.setup.units : 'in')} × ${formatUnit(s.h, ctx.doc ? ctx.doc.setup.units : 'in')}`, command: 'design.pageSize', arg: k, checked: !!ctx.doc && matchPageSize(ctx.doc.setup.width, ctx.doc.setup.height) === k })),
  '-', { label: 'Custom Page Size…', command: 'design.customSize' }
];

registry.group({ tab: 'pageDesign', id: 'pageSetup', label: 'Page Setup', order: 10, items: [
  { type: 'menu', label: 'Size', icon: 'page-size', size: 'large', items: (ctx) => sizeMenu(ctx || app.ctx()) },
  { type: 'menu', label: 'Orientation', icon: 'orientation', size: 'large', items: () => [{ label: 'Portrait', icon: 'portrait', command: 'design.portrait' }, { label: 'Landscape', icon: 'landscape', command: 'design.landscape' }] },
  { type: 'menu', label: 'Margins', icon: 'margins', size: 'large', items: () => [
    { label: 'None', command: 'design.margins', arg: 'none' }, { label: 'Narrow (0.25 in)', command: 'design.margins', arg: 'narrow' },
    { label: 'Moderate (0.5 in)', command: 'design.margins', arg: 'moderate' }, { label: 'Wide (1 in)', command: 'design.margins', arg: 'wide' },
    '-', { label: 'Custom Margins…', command: 'design.margins' }] },
  { command: 'design.columns', size: 'small' }, { command: 'design.bleed', size: 'small' },
  { type: 'menu', label: 'Units', icon: 'units', size: 'small', items: () => Object.entries(UNITS).map(([k, u]) => ({ label: u.name, command: 'design.units', arg: k, checked: !!app.doc && app.doc.setup.units === k })) }
] });
registry.group({ tab: 'pageDesign', id: 'layout', label: 'Layout', order: 20, items: [
  { command: 'view.spread', size: 'large', label: 'Facing Pages' },
  { command: 'view.guidesDialog', size: 'large', label: 'Guides' }
] });
registry.group({ tab: 'pageDesign', id: 'schemes', label: 'Colour Schemes', order: 30, items: [schemeGallery(), { command: 'design.customColors', size: 'small', label: 'Customise' }] });
registry.group({ tab: 'pageDesign', id: 'fonts', label: 'Font Schemes', order: 40, items: [fontGallery()] });
registry.group({ tab: 'pageDesign', id: 'pageBackground', label: 'Page Background', order: 50, items: [{ command: 'design.pageBackground', size: 'large', label: 'Background' }] });
registry.group({ tab: 'pageDesign', id: 'masters', label: 'Master Pages', order: 60, items: [
  { command: 'view.masterMode', size: 'large', label: 'Edit Masters' },
  { command: 'page.applyMaster', size: 'small', label: 'Apply Master' }, { command: 'master.add', size: 'small', label: 'New Master' }
] });
