// Page and master-page commands: insert, duplicate, delete, move, navigate, apply master, backgrounds.

import { app } from '../core/app.js';
import { registry } from '../core/registry.js';
import { insertPages, duplicatePage, deletePages, movePage, addMaster, duplicateMaster, deleteMaster, applyMaster, nextMasterName } from '../core/pages.js';

const hasDoc = (ctx) => !!ctx.doc;
const idx = (arg) => (typeof arg === 'number' ? arg : app.pageIndex);

registry.command({
  id: 'page.insertAfter', label: 'Insert Page', icon: 'page-add', enabled: (ctx) => hasDoc(ctx) && !app.isMasterMode,
  run: (ctx, arg) => {
    const at = idx(arg) + 1;
    app.transact('Insert Page', (doc) => { insertPages(doc, at, 1, { masterId: (doc.pages[at - 1] || doc.pages[0]).masterId }); });
    app.goToPage(at);
  }
});
registry.command({
  id: 'page.insertDialog', label: 'Insert Pages…', icon: 'page-add', enabled: (ctx) => hasDoc(ctx) && !app.isMasterMode,
  run: async (ctx, arg) => {
    const doc = app.doc;
    const r = await app.ui.dialog({
      title: 'Insert Pages',
      fields: [
        { name: 'count', label: 'Number of new pages', type: 'number', value: 1, min: 1, max: 200, step: 1, half: true },
        { name: 'where', label: 'Position', type: 'select', value: 'after', half: true, options: [{ value: 'before', label: 'Before current page' }, { value: 'after', label: 'After current page' }] },
        { name: 'master', label: 'Master page', type: 'select', value: doc.pages[idx(arg)].masterId || '', options: [...doc.masters.map((m) => ({ value: m.id, label: `Master ${m.name}` })), { value: '', label: 'None' }] }
      ],
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Insert', value: 'ok', primary: true }]
    });
    if (!r || r.button !== 'ok') return;
    const count = Math.max(1, Math.min(200, Math.round(+r.values.count || 1)));
    const at = r.values.where === 'before' ? idx(arg) : idx(arg) + 1;
    app.transact(count > 1 ? 'Insert Pages' : 'Insert Page', (d) => { insertPages(d, at, count, { masterId: r.values.master || null }); });
    app.goToPage(at);
  }
});
registry.command({
  id: 'page.duplicate', label: 'Duplicate Page', icon: 'page-duplicate', enabled: (ctx) => hasDoc(ctx) && !app.isMasterMode,
  run: (ctx, arg) => { const i = idx(arg); app.transact('Duplicate Page', (doc) => { duplicatePage(doc, i); }); app.goToPage(i + 1); }
});
registry.command({
  id: 'page.delete', label: 'Delete Page', icon: 'page-delete', enabled: (ctx) => hasDoc(ctx) && !app.isMasterMode && ctx.doc.pages.length > 1,
  run: async (ctx, arg) => {
    const i = idx(arg);
    const page = app.doc.pages[i];
    if (page.elements.length && !(await app.ui.confirm('Delete page?', `Page ${i + 1} contains ${page.elements.length} object${page.elements.length > 1 ? 's' : ''}. Delete it? You can undo this.`, 'Delete'))) return;
    app.transact('Delete Page', (doc) => { deletePages(doc, [i]); });
    app.goToPage(Math.min(i, app.doc.pages.length - 1));
  }
});
registry.command({
  id: 'page.move', label: 'Move Page…', icon: 'page-move', enabled: (ctx) => hasDoc(ctx) && !app.isMasterMode && ctx.doc.pages.length > 1,
  run: async (ctx, arg) => {
    const i = idx(arg);
    const n = app.doc.pages.length;
    const r = await app.ui.dialog({
      title: 'Move Page',
      fields: [{ name: 'to', label: `Move page ${i + 1} to position (1–${n})`, type: 'number', value: i + 1, min: 1, max: n, step: 1 }],
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Move', value: 'ok', primary: true }]
    });
    if (!r || r.button !== 'ok') return;
    const to = Math.max(0, Math.min(n - 1, Math.round(+r.values.to) - 1));
    if (to === i) return;
    app.transact('Move Page', (doc) => { movePage(doc, i, to); });
    app.goToPage(to);
  }
});
registry.command({ id: 'page.moveUp', label: 'Move Page Up', enabled: (ctx) => hasDoc(ctx) && app.pageIndex > 0 && !app.isMasterMode, run: () => { const i = app.pageIndex; app.transact('Move Page', (d) => movePage(d, i, i - 1)); app.goToPage(i - 1); } });
registry.command({ id: 'page.moveDown', label: 'Move Page Down', enabled: (ctx) => hasDoc(ctx) && app.pageIndex < ctx.doc.pages.length - 1 && !app.isMasterMode, run: () => { const i = app.pageIndex; app.transact('Move Page', (d) => movePage(d, i, i + 1)); app.goToPage(i + 1); } });
registry.command({ id: 'page.next', label: 'Next Page', icon: 'chevron-right', shortcut: 'PageDown', enabled: (ctx) => hasDoc(ctx) && app.pageIndex < ctx.doc.pages.length - 1, run: () => app.goToPage(app.pageIndex + 1) });
registry.command({ id: 'page.prev', label: 'Previous Page', icon: 'chevron-left', shortcut: 'PageUp', enabled: (ctx) => hasDoc(ctx) && app.pageIndex > 0, run: () => app.goToPage(app.pageIndex - 1) });
registry.command({ id: 'page.first', label: 'First Page', icon: 'first-page', shortcut: 'Mod+Home', enabled: hasDoc, run: () => app.goToPage(0) });
registry.command({ id: 'page.last', label: 'Last Page', icon: 'last-page', shortcut: 'Mod+End', enabled: hasDoc, run: () => app.goToPage(app.doc.pages.length - 1) });
registry.command({
  id: 'page.goto', label: 'Go to Page…', icon: 'page', shortcut: 'Mod+Shift+P', enabled: hasDoc,
  run: async () => {
    const n = app.doc.pages.length;
    const v = await app.ui.prompt('Go to Page', `Page number (1–${n})`, String(app.pageIndex + 1));
    const i = Math.round(+v) - 1;
    if (Number.isFinite(i) && i >= 0 && i < n) app.goToPage(i);
  }
});

// ---------------------------------------------------------------- masters
registry.command({
  id: 'page.applyMaster', label: 'Apply Master Page…', icon: 'master', enabled: hasDoc,
  run: async (ctx, arg) => {
    const doc = app.doc;
    let indices = arg && arg.indices, masterId = arg ? arg.masterId : undefined;
    if (!indices || masterId === undefined) {
      const r = await app.ui.dialog({
        title: 'Apply Master Page',
        fields: [
          { name: 'master', label: 'Master page', type: 'select', value: doc.pages[app.pageIndex].masterId || '', options: [...doc.masters.map((m) => ({ value: m.id, label: `Master ${m.name}` })), { value: '', label: 'None' }] },
          { name: 'range', label: 'Apply to', type: 'radio', value: 'current', options: [{ value: 'current', label: 'Current page' }, { value: 'all', label: 'All pages' }, { value: 'range', label: 'Pages' }] },
          { name: 'from', label: 'From', type: 'number', value: 1, min: 1, max: doc.pages.length, half: true },
          { name: 'to', label: 'To', type: 'number', value: doc.pages.length, min: 1, max: doc.pages.length, half: true }
        ],
        buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Apply', value: 'ok', primary: true }]
      });
      if (!r || r.button !== 'ok') return;
      masterId = r.values.master || null;
      if (r.values.range === 'all') indices = doc.pages.map((_, i) => i);
      else if (r.values.range === 'range') {
        const a = Math.max(1, Math.min(+r.values.from, +r.values.to)), b = Math.min(doc.pages.length, Math.max(+r.values.from, +r.values.to));
        indices = []; for (let i = a - 1; i < b; i++) indices.push(i);
      } else indices = [app.pageIndex];
    }
    app.transact('Apply Master Page', (d) => { applyMaster(d, indices, masterId); });
  }
});
registry.command({ id: 'master.apply', label: 'Apply to Pages…', icon: 'master', enabled: hasDoc, run: (ctx, i) => app.exec('page.applyMaster', typeof i === 'number' ? undefined : i) });
registry.command({
  id: 'master.add', label: 'New Master Page', icon: 'page-add', enabled: hasDoc,
  run: () => {
    let idx2 = 0;
    app.transact('New Master Page', (doc) => { addMaster(doc, nextMasterName(doc)); idx2 = doc.masters.length - 1; });
    app.setMasterMode(true, idx2);
  }
});
registry.command({
  id: 'master.duplicate', label: 'Duplicate Master Page', icon: 'page-duplicate', enabled: hasDoc,
  run: (ctx, arg) => { const i = typeof arg === 'number' ? arg : (app.view.masterIndex || 0); app.transact('Duplicate Master Page', (doc) => { duplicateMaster(doc, i); }); app.setMasterMode(true, i + 1); }
});
registry.command({
  id: 'master.rename', label: 'Rename Master Page…', enabled: hasDoc,
  run: async (ctx, arg) => {
    const i = typeof arg === 'number' ? arg : (app.view.masterIndex || 0);
    const m = app.doc.masters[i];
    const v = await app.ui.prompt('Rename Master Page', 'Name', m.name);
    if (v && v.trim()) app.transact('Rename Master Page', (doc) => { doc.masters[i].name = v.trim().slice(0, 40); });
  }
});
registry.command({
  id: 'master.delete', label: 'Delete Master Page', icon: 'trash', enabled: (ctx) => hasDoc(ctx) && ctx.doc.masters.length > 1,
  run: async (ctx, arg) => {
    const i = typeof arg === 'number' ? arg : (app.view.masterIndex || 0);
    const doc = app.doc;
    const m = doc.masters[i];
    const users = doc.pages.filter((p) => p.masterId === m.id).length;
    if (users && !(await app.ui.confirm('Delete master page?', `Master ${m.name} is used by ${users} page${users > 1 ? 's' : ''}. They will use Master ${doc.masters[i === 0 ? 1 : 0].name} instead.`, 'Delete'))) return;
    app.transact('Delete Master Page', (d) => { deleteMaster(d, m.id, d.masters[i === 0 ? 1 : 0].id); });
    if (app.isMasterMode) app.setMasterMode(true, 0);
  }
});
registry.command({
  id: 'view.masterMode', label: 'Edit Master Pages', icon: 'master', enabled: hasDoc,
  checked: () => app.isMasterMode,
  run: () => {
    if (app.isMasterMode) { app.setMasterMode(false); return; }
    const page = app.doc.pages[app.pageIndex];
    const mi = Math.max(0, app.doc.masters.findIndex((m) => m.id === page.masterId));
    app.setMasterMode(true, mi);
  }
});

// ---------------------------------------------------------------- background
registry.command({
  id: 'design.pageBackground', label: 'Page Background…', icon: 'background', enabled: hasDoc,
  run: async (ctx, arg) => {
    const doc = app.doc;
    const pageIndex = arg && typeof arg.pageIndex === 'number' ? arg.pageIndex : app.pageIndex;
    const target = app.isMasterMode ? app.master : doc.pages[pageIndex];
    const bg = target.background || { type: 'none' };
    const r = await app.ui.dialog({
      title: 'Page Background',
      fields: [
        { name: 'type', label: 'Fill', type: 'select', value: bg.type || 'none', options: [
          { value: 'none', label: app.isMasterMode ? 'Paper colour' : 'Same as master page' }, { value: 'solid', label: 'Solid colour' },
          { value: 'linear', label: 'Linear gradient' }, { value: 'radial', label: 'Radial gradient' }, { value: 'image', label: 'Picture' }] },
        { name: 'color', label: 'Colour', type: 'color', value: bg.color || '@light', half: true },
        { name: 'color2', label: 'Second colour', type: 'color', value: bg.color2 || '@paper', half: true },
        { name: 'angle', label: 'Gradient angle (°)', type: 'number', value: bg.angle ?? 180, min: 0, max: 360, half: true },
        { name: 'fit', label: 'Picture fit', type: 'select', value: bg.fit || 'cover', half: true, options: [{ value: 'cover', label: 'Fill page' }, { value: 'contain', label: 'Fit inside' }, { value: 'tile', label: 'Tile' }] },
        { name: 'all', label: '', type: 'checkbox', text: app.isMasterMode ? 'Apply to all master pages' : 'Apply to all pages', value: false }
      ],
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Apply', value: 'ok', primary: true }]
    });
    if (!r || r.button !== 'ok') return;
    const v = r.values;
    let value = null;
    if (v.type === 'solid') value = { type: 'solid', color: v.color };
    else if (v.type === 'linear' || v.type === 'radial') value = { type: v.type, color: v.color, color2: v.color2, angle: +v.angle || 0 };
    else if (v.type === 'image') {
      const { pickImageFiles, prepareImage } = await import('../core/images.js');
      const files = await pickImageFiles({ multiple: false });
      if (!files || !files[0]) return;
      const img = await prepareImage(files[0]);
      const { addAsset } = await import('../core/model.js');
      app.transact('Page Background', (d) => {
        const assetId = addAsset(d, img);
        const list = app.isMasterMode ? (v.all ? d.masters : [d.masters[app.view.masterIndex || 0]]) : (v.all ? d.pages : [d.pages[pageIndex]]);
        for (const p of list) p.background = { type: 'image', assetId, fit: v.fit || 'cover' };
      });
      return;
    }
    app.transact('Page Background', (d) => {
      const list = app.isMasterMode ? (v.all ? d.masters : [d.masters[app.view.masterIndex || 0]]) : (v.all ? d.pages : [d.pages[pageIndex]]);
      for (const p of list) p.background = value ? { ...value } : null;
    });
  }
});
