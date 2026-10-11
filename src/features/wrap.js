// Wrap Text: how text in text boxes behind an object flows around it (None, Square, Tight, Through,
// Top and Bottom; Both sides / Left / Right / Largest side; distance from text), the Layout dialog,
// the text box option "Wrap text around objects", and the Format-pane section.

import { app } from '../core/app.js';
import { registry } from '../core/registry.js';
import { findElement } from '../core/model.js';
import { h } from '../core/ui/dom.js';
import { t } from '../core/i18n.js';
import { WRAP_TYPES, WRAP_SIDES, WRAP_DIST, wrapOf } from '../engines/text/wrap.js';

const selected = (d) => app.selectionIds.map((id) => findElement(d || app.doc, id)?.el).filter(Boolean);
const wrappable = (el) => el && el.type !== 'line';
const hasWrappable = () => !!app.doc && selected().some(wrappable);

function setWrap(label, patch) {
  app.transact(label, (d) => {
    for (const el of selected(d)) if (wrappable(el)) el.wrap = { ...wrapOf(el), ...(el.wrap || {}), ...patch };
  });
}

for (const w of WRAP_TYPES) {
  registry.command({
    id: `wrap.${w.value}`, label: w.label, icon: `wrap-${w.value}`, enabled: hasWrappable,
    title: `Wrap text: ${w.label}`,
    checked: () => { const s = selected().filter(wrappable); return !!s.length && s.every((el) => wrapOf(el).type === w.value); },
    run: () => setWrap('Wrap Text', { type: w.value })
  });
}
for (const sd of WRAP_SIDES) {
  registry.command({
    id: `wrap.side-${sd.value}`, label: sd.label, enabled: hasWrappable,
    checked: () => { const s = selected().filter(wrappable); return !!s.length && s.every((el) => wrapOf(el).side === sd.value); },
    run: () => setWrap('Wrap Text', { side: sd.value })
  });
}

registry.command({
  id: 'wrap.layout', label: 'More Layout Options…', icon: 'wrap-square', enabled: hasWrappable,
  title: 'Wrapping style, wrap sides and distance from text',
  run: async () => {
    const el = selected().find(wrappable);
    if (!el) return;
    const w = wrapOf(el);
    const r = await app.ui.dialog({
      title: t('Layout'), width: 420,
      fields: [
        { name: 'type', label: t('Wrapping style'), type: 'select', value: w.type, options: WRAP_TYPES.map((x) => ({ value: x.value, label: t(x.label) })) },
        { name: 'side', label: t('Wrap text'), type: 'select', value: w.side, options: WRAP_SIDES.map((x) => ({ value: x.value, label: t(x.label) })) },
        { name: 'dist', label: t('Distance from text'), type: 'number', value: w.dist, min: 0, max: 200, suffix: 'px' }
      ]
    });
    if (!r) return;
    setWrap('Layout Options', { type: r.values.type, side: r.values.side, dist: Number.isFinite(r.values.dist) ? r.values.dist : WRAP_DIST });
  }
});

registry.command({
  id: 'text.wrapAround', label: 'Wrap Text Around Objects', icon: 'wrap-square',
  title: 'Let objects in front of this text box push its text aside',
  enabled: () => selected().some((el) => el.type === 'text'),
  checked: () => { const s = selected().filter((el) => el.type === 'text'); return !!s.length && s.every((el) => el.wrapAround !== false); },
  run: () => {
    const on = !selected().filter((el) => el.type === 'text').every((el) => el.wrapAround !== false);
    app.transact('Wrap Text Around Objects', (d) => { for (const el of selected(d)) if (el.type === 'text') el.wrapAround = on; });
  }
});

/** The Wrap Text dropdown (Arrange groups and the object context menu). */
export const wrapMenuItems = () => [
  ...WRAP_TYPES.map((w) => ({ label: w.label, icon: `wrap-${w.value}`, command: `wrap.${w.value}` })),
  '-',
  ...WRAP_SIDES.map((sd) => ({ label: sd.label, command: `wrap.side-${sd.value}` })),
  '-',
  { label: 'More Layout Options…', command: 'wrap.layout' }
];
export const wrapMenu = { type: 'menu', label: 'Wrap Text', icon: 'wrap-square', size: 'large', items: wrapMenuItems };

registry.group({ tab: 'textFormat', id: 'wrapAround', label: 'Wrap', order: 75, items: [{ command: 'text.wrapAround', size: 'small' }] });

registry.contextMenu({
  id: 'wrap', order: 60,
  items: () => (hasWrappable() ? ['-', { label: 'Wrap Text', icon: 'wrap-square', submenu: wrapMenuItems }] : [])
});

registry.inspector({
  id: 'wrap', title: 'Text wrapping', order: 45,
  when: () => hasWrappable(),
  render(box) {
    const type = h('select', { class: 'field' }, ...WRAP_TYPES.map((x) => h('option', { value: x.value, text: t(x.label) })));
    const side = h('select', { class: 'field' }, ...WRAP_SIDES.map((x) => h('option', { value: x.value, text: t(x.label) })));
    const dist = h('input', { class: 'field num', type: 'number', min: 0, max: 200, step: 1 });
    type.onchange = () => setWrap('Wrap Text', { type: type.value });
    side.onchange = () => setWrap('Wrap Text', { side: side.value });
    dist.onchange = () => { const v = parseFloat(dist.value); if (Number.isFinite(v) && v >= 0) setWrap('Wrap Distance', { dist: v }); };
    box.append(h('label', { class: 'ins-pair' }, h('span', { text: t('Style') }), type), h('label', { class: 'ins-pair' }, h('span', { text: t('Sides') }), side),
      h('label', { class: 'ins-pair' }, h('span', { text: t('Distance (px)') }), dist));
    const update = () => {
      const el = selected().find(wrappable);
      if (!el) return;
      const w = wrapOf(el);
      type.value = w.type; side.value = w.side;
      if (document.activeElement !== dist) dist.value = String(w.dist);
      side.disabled = dist.disabled = w.type === 'none';
    };
    update();
    return { update };
  }
});

const R = '<rect x="9" y="8" width="7" height="8" rx="1" fill="currentColor" fill-opacity=".25"/>';
registry.icon('wrap-none', `<path d="M3 6h18M3 10h18M3 14h18M3 18h18"/>${R}`);
registry.icon('wrap-square', `<path d="M3 5h18M3 19h18M3 9h4M3 12h4M3 15h4M18 9h3M18 12h3M18 15h3"/>${R}`);
registry.icon('wrap-tight', '<path d="M3 5h18M3 19h18M3 9h5M3 12h3M3 15h5M17 9h4M19 12h2M17 15h4"/><ellipse cx="12.5" cy="12" rx="3.5" ry="4" fill="currentColor" fill-opacity=".25"/>');
registry.icon('wrap-through', '<path d="M3 5h18M3 19h18M3 9h5M3 15h5M17 9h4M17 15h4M10 12h5"/><ellipse cx="12.5" cy="12" rx="3.5" ry="4"/>');
registry.icon('wrap-topBottom', `<path d="M3 5h18M3 19h18"/>${R}`);
