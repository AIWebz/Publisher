// Right-panel "Format" sections: position & size, fill, line, shadow, transparency, picture, line ends,
// and page settings when nothing is selected.

import { app } from '../core/app.js';
import { registry } from '../core/registry.js';
import { unionBounds, PAGE_SIZES, matchPageSize } from '../core/model.js';
import { h } from '../core/ui/dom.js';
import { row, lengthField, numberField, selectField, colorField, checkField, segmented, sliderField } from '../core/ui/fields.js';
import { selected, applyToSelection, setSelectionBounds, common } from './core-common.js';

const unit = () => (app.doc ? app.doc.setup.units : 'in');
const sel = (ctx) => ctx.selection || [];
const deep = (ctx) => selected(ctx, { deep: true });
const FILLED = ['shape', 'text', 'image', 'table'];

// ---------------------------------------------------------------- position & size
registry.inspector({
  id: 'position', title: 'Position & Size', order: 10,
  when: (ctx) => sel(ctx).length > 0,
  render(body) {
    const x = lengthField({ unit, onChange: (v) => setSelectionBounds({ x: v }, 'Move') });
    const y = lengthField({ unit, onChange: (v) => setSelectionBounds({ y: v }, 'Move') });
    const w = lengthField({ unit, min: 1, onChange: (v) => resize('w', v) });
    const hh = lengthField({ unit, min: 1, onChange: (v) => resize('h', v) });
    const rot = numberField({ suffix: '°', min: -360, max: 360, onChange: (v) => setSelectionBounds({ rot: v }, 'Rotate') });
    const lock = checkField({ label: 'Lock aspect ratio', onChange: () => {} });
    const locked = checkField({ label: 'Lock position', onChange: (v) => applyToSelection(v ? 'Lock' : 'Unlock', (el) => { el.locked = v; }, { deep: false }) });
    function resize(dim, v) {
      const els = app.selection;
      const b = els.length === 1 ? els[0] : unionBounds(els);
      if (lock.el.querySelector('input').checked && b.w > 0 && b.h > 0) {
        const r = b.w / b.h;
        setSelectionBounds(dim === 'w' ? { w: v, h: v / r } : { h: v, w: v * r }, 'Resize');
      } else setSelectionBounds({ [dim]: v }, 'Resize');
    }
    body.append(h('div', { class: 'ins-pair' }, row('X', x.el), row('Y', y.el)), h('div', { class: 'ins-pair' }, row('W', w.el), row('H', hh.el)),
      row('Rotation', rot.el), lock.el, locked.el);
    return {
      update(ctx) {
        const s = sel(ctx);
        const b = s.length === 1 ? s[0] : unionBounds(s);
        x.set(b.x); y.set(b.y); w.set(b.w); hh.set(b.h);
        rot.set(s.length === 1 ? s[0].rot || 0 : 0);
        locked.set(s.every((e) => e.locked));
        const dis = s.some((e) => e.locked);
        [x, y, w, hh, rot].forEach((f) => f.disable(dis));
        rot.disable(dis || s.length > 1);
        if (s.length === 1 && s[0].type === 'image') lock.el.querySelector('input').checked = true;
      }
    };
  }
});

// ---------------------------------------------------------------- fill
registry.inspector({
  id: 'fill', title: 'Fill', order: 30,
  when: (ctx) => deep(ctx).some((e) => FILLED.includes(e.type)),
  render(body) {
    const type = segmented({ options: [{ value: 'none', label: 'None', text: 'None' }, { value: 'solid', label: 'Solid', text: 'Solid' }, { value: 'linear', label: 'Linear gradient', text: 'Linear' }, { value: 'radial', label: 'Radial gradient', text: 'Radial' }],
      onChange: (t) => setFill((f) => ({ ...f, type: t, color: f.color || '@accent', color2: f.color2 || '@paper', angle: f.angle ?? 180 })) });
    const c1 = colorField({ title: 'Colour', allowNone: false, onChange: (v) => setFill((f) => ({ ...f, type: f.type === 'none' ? 'solid' : f.type, color: v })) });
    const c2 = colorField({ title: 'Second colour', allowNone: false, onChange: (v) => setFill((f) => ({ ...f, color2: v })) });
    const ang = numberField({ suffix: '°', min: 0, max: 360, onChange: (v) => setFill((f) => ({ ...f, angle: v })) });
    const r2 = row('To', c2.el), ra = row('Angle', ang.el);
    function setFill(fn) { applyToSelection('Fill', (el) => { el.fill = fn({ ...(el.fill || { type: 'none' }) }); }, { types: FILLED }); }
    body.append(type.el, row('Colour', c1.el), r2, ra);
    return {
      update(ctx) {
        const els = deep(ctx).filter((e) => FILLED.includes(e.type));
        const f = common(els, (e) => e.fill || { type: 'none' }, null) || els[0].fill || { type: 'none' };
        type.set(f.type);
        c1.set(f.color || '@accent'); c2.set(f.color2 || '@paper'); ang.set(f.angle ?? 180);
        r2.hidden = !(f.type === 'linear' || f.type === 'radial');
        ra.hidden = f.type !== 'linear';
      }
    };
  }
});

// ---------------------------------------------------------------- line
const LINED = ['shape', 'text', 'image', 'line', 'table'];
registry.inspector({
  id: 'line', title: 'Line', order: 40,
  when: (ctx) => deep(ctx).some((e) => LINED.includes(e.type)),
  render(body) {
    const prop = (el) => (el.type === 'table' ? 'border' : 'stroke');
    const set = (label, fn) => applyToSelection(label, (el) => { el[prop(el)] = fn({ ...(el[prop(el)] || { color: '@ink', width: 0, dash: 'solid' }) }, el); }, { types: LINED });
    const color = colorField({ title: 'Line colour', onChange: (v) => set('Line Colour', (s, el) => ({ ...s, color: v === 'transparent' ? s.color : v, width: v === 'transparent' ? 0 : (s.width || (el.type === 'line' ? 2 : 1)) })) });
    const width = numberField({ suffix: 'pt', min: 0, max: 72, step: 0.25, digits: 2, onChange: (v) => set('Line Weight', (s) => ({ ...s, width: v / 0.75 })) });
    const dash = selectField({ options: [{ value: 'solid', label: 'Solid' }, { value: 'dash', label: 'Dashed' }, { value: 'longDash', label: 'Long dash' }, { value: 'dot', label: 'Dotted' }, { value: 'dashDot', label: 'Dash dot' }], onChange: (v) => set('Dash Type', (s) => ({ ...s, dash: v })) });
    const radius = lengthField({ unit, min: 0, onChange: (v) => applyToSelection('Corner Radius', (el) => { el.radius = v; }, { types: ['shape', 'text', 'image'] }) });
    const rr = row('Corners', radius.el);
    body.append(row('Colour', color.el), row('Weight', width.el), row('Dash', dash.el), rr);
    return {
      update(ctx) {
        const els = deep(ctx).filter((e) => LINED.includes(e.type));
        const s = els[0][prop(els[0])] || {};
        color.set(s.width > 0 ? s.color : 'transparent');
        width.set((s.width || 0) * 0.75);
        dash.set(s.dash || 'solid');
        const r = els.find((e) => ['shape', 'text', 'image'].includes(e.type));
        rr.hidden = !r || (r.type === 'shape' && !['rect', 'roundRect'].includes(r.shape));
        if (r) radius.set(r.radius || 0);
      }
    };
  }
});

// ---------------------------------------------------------------- line ends (arrows)
registry.inspector({
  id: 'arrows', title: 'Arrows', order: 45,
  when: (ctx) => deep(ctx).some((e) => e.type === 'line'),
  render(body) {
    const opts = [{ value: 'none', label: 'None' }, { value: 'arrow', label: 'Arrow' }, { value: 'triangle', label: 'Triangle' }, { value: 'circle', label: 'Circle' }, { value: 'diamond', label: 'Diamond' }];
    const a1 = selectField({ options: opts, onChange: (v) => applyToSelection('Arrow', (el) => { el.arrowStart = v; }, { types: ['line'] }) });
    const a2 = selectField({ options: opts, onChange: (v) => applyToSelection('Arrow', (el) => { el.arrowEnd = v; }, { types: ['line'] }) });
    const orn = selectField({ options: [{ value: 'none', label: 'None' }, { value: 'diamond', label: 'Centre diamond' }], onChange: (v) => applyToSelection('Ornament', (el) => { el.ornament = v; }, { types: ['line'] }) });
    body.append(row('Begin', a1.el), row('End', a2.el), row('Ornament', orn.el));
    return { update(ctx) { const l = deep(ctx).find((e) => e.type === 'line'); a1.set(l.arrowStart || 'none'); a2.set(l.arrowEnd || 'none'); orn.set(l.ornament || 'none'); } };
  }
});

// ---------------------------------------------------------------- shadow & transparency
registry.inspector({
  id: 'effects', title: 'Shadow & Transparency', order: 50,
  when: (ctx) => sel(ctx).length > 0,
  render(body) {
    const SH = ['shape', 'text', 'image', 'line'];
    const setSh = (label, fn) => applyToSelection(label, (el) => { el.shadow = fn({ enabled: false, x: 3, y: 3, blur: 6, color: '#000000', opacity: 0.3, ...(el.shadow || {}) }); }, { types: SH });
    const on = checkField({ label: 'Shadow', onChange: (v) => setSh('Shadow', (s) => ({ ...s, enabled: v })) });
    const dx = numberField({ suffix: 'px', min: -100, max: 100, onChange: (v) => setSh('Shadow', (s) => ({ ...s, x: v })) });
    const dy = numberField({ suffix: 'px', min: -100, max: 100, onChange: (v) => setSh('Shadow', (s) => ({ ...s, y: v })) });
    const blur = numberField({ suffix: 'px', min: 0, max: 100, onChange: (v) => setSh('Shadow', (s) => ({ ...s, blur: v })) });
    const scol = colorField({ title: 'Shadow colour', allowNone: false, onChange: (v) => setSh('Shadow', (s) => ({ ...s, color: v })) });
    const sop = sliderField({ min: 0, max: 100, suffix: '%', onChange: (v) => setSh('Shadow', (s) => ({ ...s, opacity: v / 100 })) });
    const op = sliderField({ min: 0, max: 100, suffix: '%', onChange: (v) => applyToSelection('Transparency', (el) => { el.opacity = 1 - v / 100; }, { deep: false, coalesce: 'opacity' }) });
    const shadowRows = h('div', { class: 'ins-sub' }, h('div', { class: 'ins-pair' }, row('X', dx.el), row('Y', dy.el)), row('Blur', blur.el), row('Colour', scol.el), row('Opacity', sop.el));
    body.append(on.el, shadowRows, row('Transparency', op.el));
    return {
      update(ctx) {
        const el = deep(ctx).find((e) => SH.includes(e.type)) || sel(ctx)[0];
        const s = el.shadow || {};
        on.set(!!s.enabled);
        shadowRows.hidden = !s.enabled;
        dx.set(s.x ?? 3); dy.set(s.y ?? 3); blur.set(s.blur ?? 6); scol.set(s.color || '#000000'); sop.set(Math.round((s.opacity ?? 0.3) * 100));
        op.set(Math.round((1 - (sel(ctx)[0].opacity ?? 1)) * 100));
      }
    };
  }
});

// ---------------------------------------------------------------- picture
registry.inspector({
  id: 'picture', title: 'Picture', order: 20,
  when: (ctx) => sel(ctx).length === 1 && sel(ctx)[0].type === 'image',
  render(body) {
    const fit = segmented({ options: [{ value: 'fill', text: 'Fill', label: 'Fill the frame (crop)' }, { value: 'fit', text: 'Fit', label: 'Fit inside the frame' }, { value: 'stretch', text: 'Stretch', label: 'Stretch to the frame' }],
      onChange: (v) => applyToSelection('Picture Fit', (el) => { el.fit = v; el.content = null; }, { types: ['image'], deep: false }) });
    const change = h('button', { type: 'button', class: 'btn sm', text: 'Change Picture…', onclick: () => app.exec('picture.change') });
    const reset = h('button', { type: 'button', class: 'btn sm btn-ghost', text: 'Reset', onclick: () => app.exec('picture.reset') });
    const info = h('div', { class: 'ins-hint' });
    body.append(row('Fit', fit.el), h('div', { class: 'ins-actions' }, change, reset), info);
    return {
      update(ctx) {
        const el = sel(ctx)[0];
        fit.set(el.fit === 'custom' ? '' : el.fit || 'fill');
        const a = el.assetId && ctx.doc.assets[el.assetId];
        if (a && a.width) {
          const dpi = Math.round(Math.min(a.width / (el.w / 96), a.height / (el.h / 96)));
          info.textContent = `${a.width} × ${a.height} px · about ${dpi} dpi at this size${dpi < 150 ? ' (low for print)' : ''}`;
        } else info.textContent = 'Empty picture frame — double-click it to add a picture.';
      }
    };
  }
});

// ---------------------------------------------------------------- page (nothing selected)
registry.inspector({
  id: 'page', title: 'Page', order: 5,
  when: (ctx) => !!ctx.doc && sel(ctx).length === 0,
  render(body) {
    const size = selectField({ options: [...Object.entries(PAGE_SIZES).map(([k, s]) => ({ value: k, label: s.name })), { value: 'custom', label: 'Custom…' }], onChange: (v) => app.exec(v === 'custom' ? 'design.customSize' : 'design.pageSize', v) });
    const w = lengthField({ unit, min: 48, onChange: (v) => app.transact('Page Size', (d) => { d.setup.width = v; }) });
    const hh = lengthField({ unit, min: 48, onChange: (v) => app.transact('Page Size', (d) => { d.setup.height = v; }) });
    const orient = segmented({ options: [{ value: 'portrait', icon: 'portrait', label: 'Portrait' }, { value: 'landscape', icon: 'landscape', label: 'Landscape' }], onChange: (v) => app.exec(`design.${v}`) });
    const units = selectField({ options: [{ value: 'in', label: 'Inches' }, { value: 'cm', label: 'Centimetres' }, { value: 'mm', label: 'Millimetres' }, { value: 'pt', label: 'Points' }, { value: 'pc', label: 'Picas' }, { value: 'px', label: 'Pixels' }], onChange: (v) => app.exec('design.units', v) });
    const master = selectField({ options: [], onChange: (v) => app.exec('page.applyMaster', { indices: [app.pageIndex], masterId: v || null }) });
    const btns = h('div', { class: 'ins-actions' },
      h('button', { type: 'button', class: 'btn sm', text: 'Margins…', onclick: () => app.exec('design.margins') }),
      h('button', { type: 'button', class: 'btn sm', text: 'Background…', onclick: () => app.exec('design.pageBackground') }),
      h('button', { type: 'button', class: 'btn sm', text: 'Guides…', onclick: () => app.exec('view.guidesDialog') }));
    const mrow = row('Master', master.el);
    body.append(row('Size', size.el), h('div', { class: 'ins-pair' }, row('W', w.el), row('H', hh.el)), row('Orientation', orient.el), row('Units', units.el), mrow, btns);
    return {
      update(ctx) {
        const s = ctx.doc.setup;
        size.set(matchPageSize(s.width, s.height) || 'custom');
        w.set(s.width); hh.set(s.height);
        orient.set(s.width > s.height ? 'landscape' : 'portrait');
        units.set(s.units);
        master.setOptions([...ctx.doc.masters.map((m) => ({ value: m.id, label: `Master ${m.name}` })), { value: '', label: 'None' }]);
        mrow.hidden = app.isMasterMode;
        if (!app.isMasterMode) master.set(ctx.doc.pages[app.pageIndex].masterId || '');
      }
    };
  }
});
