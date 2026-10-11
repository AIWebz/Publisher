// View tab: rulers, guides, grid, snapping, zoom, panels, master pages, theme.

import { app } from '../core/app.js';
import { registry } from '../core/registry.js';
import { prefs } from '../core/prefs.js';

const uiThemePref = () => ({ light: 'white', dark: 'black' }[prefs.get('theme')] || prefs.get('theme'));
import { formatUnit, parseLength } from '../core/units.js';

const hasDoc = (ctx) => !!ctx.doc;
const toggle = (id, label, path, icon, opts = {}) => registry.command({
  id, label, icon, global: true, ...opts,
  checked: () => !!prefs.get(path),
  run: () => prefs.toggle(path)
});

toggle('view.rulers', 'Rulers', 'rulers', 'ruler', { shortcut: 'Mod+R' });
toggle('view.margins', 'Margin Guides', 'guides.margins', 'margins');
toggle('view.columns', 'Column Guides', 'guides.columns', 'columns');
toggle('view.rulerGuides', 'Ruler Guides', 'guides.ruler', 'guides');
toggle('view.grid', 'Gridlines', 'guides.grid', 'grid', { shortcut: "Mod+'" });
toggle('view.boundaries', 'Boundaries', 'guides.boundaries', 'boundaries');
toggle('view.snap', 'Snap', 'snap.enabled', 'snap');
toggle('view.snapObjects', 'Snap to Objects', 'snap.objects', 'snap');
toggle('view.snapGuides', 'Snap to Guides', 'snap.guides', 'guides');
toggle('view.snapGrid', 'Snap to Grid', 'snap.grid', 'grid');
toggle('view.snapPage', 'Snap to Page and Margins', 'snap.page', 'margins');
toggle('view.showHidden', 'Show Hidden Objects', 'showHidden', 'eye');
toggle('view.pagesPanel', 'Pages Panel', 'pagesPanel', 'panel-left');
toggle('view.rightPanel', 'Format Panel', 'rightPanel', 'panel-right');
registry.command({
  id: 'view.layers', label: 'Selection Pane', icon: 'layers', global: true,
  checked: () => prefs.get('rightPanel') && prefs.get('rightTab') === 'layers',
  run: () => {
    const on = prefs.get('rightPanel') && prefs.get('rightTab') === 'layers';
    if (on) prefs.set('rightTab', 'format'); else { prefs.set('rightPanel', true); prefs.set('rightTab', 'layers'); }
  }
});

registry.command({ id: 'view.zoomIn', label: 'Zoom In', icon: 'zoom-in', shortcut: ['Mod+=', 'Mod+Shift+='], enabled: hasDoc, run: () => app.canvas.zoomIn() });
registry.command({ id: 'view.zoomOut', label: 'Zoom Out', icon: 'zoom-out', shortcut: 'Mod+-', enabled: hasDoc, run: () => app.canvas.zoomOut() });
registry.command({ id: 'view.actualSize', label: '100%', icon: 'actual-size', shortcut: 'Mod+1', enabled: hasDoc, run: () => app.canvas.actualSize() });
registry.command({ id: 'view.fitPage', label: 'Whole Page', icon: 'fit-page', shortcut: 'Mod+0', enabled: hasDoc, checked: () => app.view && app.view.fit === 'page', run: () => app.canvas.fitPage() });
registry.command({ id: 'view.fitWidth', label: 'Page Width', icon: 'fit-width', enabled: hasDoc, checked: () => app.view && app.view.fit === 'width', run: () => app.canvas.fitWidth() });
registry.command({
  id: 'view.zoomDialog', label: 'Zoom…', icon: 'zoom-in', enabled: hasDoc,
  run: async () => {
    const r = await app.ui.dialog({
      title: 'Zoom',
      fields: [{ name: 'z', label: 'Zoom', type: 'radio', value: String(Math.round((app.view.zoom || 1) * 100)), options: ['25', '50', '75', '100', '150', '200', '400'].map((v) => ({ value: v, label: `${v}%` })) },
        { name: 'custom', label: 'Percent (10–800)', type: 'number', value: Math.round((app.view.zoom || 1) * 100), min: 10, max: 800 }],
      buttons: [{ label: 'Whole Page', value: 'fit' }, { label: 'Cancel', value: 'cancel' }, { label: 'OK', value: 'ok', primary: true }]
    });
    if (!r) return;
    if (r.button === 'fit') { app.canvas.fitPage(); return; }
    if (r.button !== 'ok') return;
    const custom = +r.values.custom, preset = +r.values.z;
    const pct = Number.isFinite(custom) && custom !== Math.round((app.view.zoom || 1) * 100) ? custom : preset;
    app.canvas.zoomTo(Math.max(10, Math.min(800, pct)) / 100);
  }
});
registry.command({
  id: 'view.spread', label: 'Two-Page Spread', icon: 'facing', enabled: hasDoc,
  checked: (ctx) => !!(ctx.doc && ctx.doc.setup.facing),
  run: () => app.transact('Two-Page Spread', (doc) => { doc.setup.facing = !doc.setup.facing; })
});
for (const [v, label, icon] of [['system', 'Use System Setting', 'theme-system'], ['colorful', 'Colorful', 'sun'], ['white', 'White', 'sun'], ['darkgray', 'Dark Gray', 'moon'], ['black', 'Black', 'moon']]) {
  registry.command({ id: `view.theme-${v}`, label, icon, global: true, checked: () => uiThemePref() === v, run: () => prefs.set('theme', v) });
}
// older ids kept for the Quick Access Toolbar and saved shortcuts
registry.command({ id: 'view.theme-light', label: 'White', icon: 'sun', global: true, checked: () => uiThemePref() === 'white', run: () => prefs.set('theme', 'white') });
registry.command({ id: 'view.theme-dark', label: 'Black', icon: 'moon', global: true, checked: () => uiThemePref() === 'black', run: () => prefs.set('theme', 'black') });

registry.command({
  id: 'view.guidesDialog', label: 'Guides & Grid…', icon: 'guide-settings', enabled: hasDoc,
  run: async () => {
    const doc = app.doc;
    const unit = doc.setup.units;
    const page = app.page;
    const fmt = (list) => list.map((v) => formatUnit(v, unit)).join(', ');
    const r = await app.ui.dialog({
      title: 'Guides & Grid',
      fields: [
        { name: 'grid', label: 'Grid spacing', type: 'length', value: doc.setup.grid.size, half: true },
        { name: 'show', label: '', type: 'checkbox', text: 'Show gridlines', value: !!prefs.get('guides.grid'), half: true },
        { name: 'v', label: `Vertical guides at (${unit}, comma separated)`, type: 'text', value: fmt(page.guides ? page.guides.v : []) },
        { name: 'h', label: `Horizontal guides at (${unit}, comma separated)`, type: 'text', value: fmt(page.guides ? page.guides.h : []) },
        { name: 'all', label: '', type: 'checkbox', text: 'Apply these guides to every page', value: false }
      ],
      buttons: [{ label: 'Clear Guides', value: 'clear' }, { label: 'Cancel', value: 'cancel' }, { label: 'OK', value: 'ok', primary: true }]
    });
    if (!r || r.button === 'cancel') return;
    const parse = (s) => String(s || '').split(/[,;\s]+/).filter(Boolean).map((t) => parseLength(t, unit)).filter(Number.isFinite);
    const v = r.button === 'clear' ? [] : parse(r.values.v), hz = r.button === 'clear' ? [] : parse(r.values.h);
    prefs.set('guides.grid', !!r.values.show);
    app.transact('Guides & Grid', (d) => {
      if (Number.isFinite(r.values.grid) && r.values.grid > 1) d.setup.grid.size = r.values.grid;
      const targets = r.values.all ? [...d.pages] : [app.isMasterMode ? d.masters[app.view.masterIndex || 0] : d.pages[app.pageIndex]];
      for (const p of targets) p.guides = { v: [...v], h: [...hz] };
    });
  }
});

registry.group({ tab: 'view', id: 'views', label: 'Views', order: 10, items: [
  { command: 'view.masterMode', size: 'large', label: 'Master Page' },
  { command: 'view.spread', size: 'large', label: 'Two-Page Spread' }
] });
registry.group({ tab: 'view', id: 'show', label: 'Show', order: 20, items: [
  { command: 'view.rulers', size: 'small' }, { command: 'view.margins', size: 'small' }, { command: 'view.columns', size: 'small' },
  { command: 'view.rulerGuides', size: 'small' }, { command: 'view.grid', size: 'small' }, { command: 'view.boundaries', size: 'small' },
  { command: 'view.showHidden', size: 'small' }, { command: 'view.pagesPanel', size: 'small' }, { command: 'view.layers', size: 'small' }
] });
registry.group({ tab: 'view', id: 'snap', label: 'Snap', order: 30, items: [
  { command: 'view.snap', size: 'large', label: 'Snap' },
  { command: 'view.snapObjects', size: 'small' }, { command: 'view.snapGuides', size: 'small' }, { command: 'view.snapGrid', size: 'small' },
  { command: 'view.guidesDialog', size: 'small' }
] });
registry.group({ tab: 'view', id: 'zoom', label: 'Zoom', order: 40, items: [
  { command: 'view.zoomDialog', size: 'large', label: 'Zoom' }, { command: 'view.actualSize', size: 'large' },
  { command: 'view.fitPage', size: 'small' }, { command: 'view.fitWidth', size: 'small' },
  { command: 'view.zoomIn', size: 'small' }, { command: 'view.zoomOut', size: 'small' }
] });
registry.group({ tab: 'view', id: 'pagesNav', label: 'Pages', order: 50, items: [
  { command: 'page.first', size: 'small' }, { command: 'page.prev', size: 'small' }, { command: 'page.goto', size: 'small' },
  { command: 'page.next', size: 'small' }, { command: 'page.last', size: 'small' }
] });
registry.group({ tab: 'view', id: 'theme', label: 'Appearance', order: 60, items: [
  { command: 'view.theme-colorful', size: 'small' }, { command: 'view.theme-white', size: 'small' }, { command: 'view.theme-darkgray', size: 'small' },
  { command: 'view.theme-black', size: 'small' }, { command: 'view.theme-system', size: 'small' }
] });
