// File and Edit commands (new/open/save/close delegate to app.files from core/persistence),
// undo/redo with step labels, clipboard, delete, select all, Esc/Enter, document tab switching,
// and the Home tab's Clipboard / Objects / Editing groups.

import { app } from '../core/app.js';
import { registry } from '../core/registry.js';
import { copySelection, cutSelection, pasteFromSystem, duplicateSelection, deleteSelection } from '../core/canvas/clipboard.js';
import { isTextTarget } from '../core/shortcuts.js';
import { closeSession } from '../core/shell/doctabs.js';
import { findElement } from '../core/model.js';
import { prefs } from '../core/prefs.js';

const hasDoc = (ctx) => !!ctx.doc;
const files = () => app.files;
const notEditing = (ctx) => !ctx.editing;
const hasSel = (ctx) => !ctx.editing && ctx.selection.length > 0;
/** Keyboard focus is on the page canvas (or nowhere in particular). */
const canvasFocused = () => {
  const a = document.activeElement;
  return !a || a === document.body || !!(app.canvas && app.canvas.viewport.contains(a));
};

// ------------------------------------------------------------------ file

registry.command({ id: 'file.new', label: 'New', icon: 'new', shortcut: 'Mod+N', global: true, title: 'Create a new publication',
  run: () => app.ui.backstage && app.ui.backstage.open('new') });
registry.command({ id: 'file.newBlank', label: 'New Blank Publication', icon: 'new', global: true,
  run: (ctx, opts) => app.newDocument(opts || { size: 'letter' }) });
registry.command({ id: 'file.open', label: 'Open…', icon: 'open', shortcut: 'Mod+O', global: true, title: 'Open a .folio publication',
  enabled: () => !!(files() && files().open), run: () => files().open() });
registry.command({ id: 'file.save', label: 'Save', icon: 'save', shortcut: 'Mod+S', allowInBackstage: true,
  enabled: (ctx) => hasDoc(ctx) && !!(files() && files().save), run: () => files().save() });
registry.command({ id: 'file.saveAs', label: 'Save As…', icon: 'save-as', shortcut: 'Mod+Shift+S', allowInBackstage: true,
  enabled: (ctx) => hasDoc(ctx) && !!(files() && files().saveAs), run: () => files().saveAs() });
registry.command({ id: 'file.close', label: 'Close', icon: 'close-doc', shortcut: 'Mod+W', allowInBackstage: true, title: 'Close this publication',
  run: (ctx) => closeSession(ctx.session) });

// ------------------------------------------------------------------ undo / redo

registry.command({
  id: 'edit.undo', label: 'Undo', icon: 'undo', shortcut: 'Mod+Z', nativeInText: true,
  labelFor: (ctx) => (ctx.session && ctx.session.history.canUndo ? `Undo ${ctx.session.history.undoLabel}` : 'Undo'),
  enabled: (ctx) => !!(ctx.session && (ctx.session.history.canUndo || ctx.editing)),
  run: () => { if (app.editing) app.textEdit.stop(); app.undo(); }
});
registry.command({
  id: 'edit.redo', label: 'Redo', icon: 'redo', shortcut: ['Mod+Y', 'Mod+Shift+Z'], nativeInText: true,
  labelFor: (ctx) => (ctx.session && ctx.session.history.canRedo ? `Redo ${ctx.session.history.redoLabel}` : 'Redo'),
  enabled: (ctx) => !!(ctx.session && ctx.session.history.canRedo),
  run: () => { if (app.editing) app.textEdit.stop(); app.redo(); }
});

// ------------------------------------------------------------------ clipboard

let viaEvent = false;
document.addEventListener('copy', () => { viaEvent = true; }, true);
document.addEventListener('cut', () => { viaEvent = true; }, true);

/** Run a native clipboard command so the OS clipboard is written; fall back to the internal clip. */
function execNative(kind, fallback) {
  viaEvent = false;
  let ok = false;
  try { ok = document.execCommand(kind); } catch { ok = false; }
  if (ok && viaEvent) return;
  const text = fallback();
  if (text && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => {});
}

registry.command({ id: 'edit.cut', label: 'Cut', icon: 'cut', shortcut: 'Mod+X', nativeClipboard: true, nativeInText: true,
  enabled: (ctx) => hasSel(ctx) && ctx.selection.some((e) => !e.locked), run: () => execNative('cut', cutSelection) });
registry.command({ id: 'edit.copy', label: 'Copy', icon: 'copy', shortcut: 'Mod+C', nativeClipboard: true, nativeInText: true,
  enabled: hasSel, run: () => execNative('copy', copySelection) });
registry.command({ id: 'edit.paste', label: 'Paste', icon: 'paste', shortcut: 'Mod+V', nativeClipboard: true, nativeInText: true,
  title: 'Paste objects, pictures or text', enabled: (ctx) => !!ctx.page && notEditing(ctx), run: () => pasteFromSystem() });
registry.command({ id: 'edit.duplicate', label: 'Duplicate', icon: 'duplicate', shortcut: 'Mod+D', enabled: hasSel, run: () => duplicateSelection() });
registry.command({ id: 'edit.delete', label: 'Delete', icon: 'trash', shortcut: ['Delete', 'Backspace'],
  enabled: (ctx) => hasSel(ctx), run: () => deleteSelection() });
registry.command({
  id: 'edit.selectAll', label: 'Select All', icon: 'select-all', shortcut: 'Mod+A', nativeInText: true,
  enabled: (ctx) => !!ctx.page && notEditing(ctx),
  run: () => app.select(app.page.elements.filter((e) => !e.hidden || prefs.get('showHidden')).map((e) => e.id))
});

// ------------------------------------------------------------------ Esc / Enter / Tab

registry.command({
  id: 'edit.escape', label: 'Cancel', shortcut: 'Escape', allowInText: true, global: true,
  run: () => {
    const t = document.activeElement;
    if (t && isTextTarget(t) && !(app.editing && app.editing.root === t)) { t.blur(); return; }
    if (app.ui.backstage && app.ui.backstage.isOpen) { app.ui.backstage.close(); return; }
    if (!app.session) return;
    if (app.editing) { const id = app.editing.frameId; app.textEdit.stop(); app.select([id]); return; }
    if (app.canvas && app.canvas.tool !== 'select') { app.canvas.setTool('select'); return; }
    const sel = app.selectionIds;
    if (sel.length === 1) {
      const hit = findElement(app.doc, sel[0]);
      if (hit && hit.parent) { app.select([hit.parent.id]); return; }
    }
    app.select([]);
  }
});
registry.command({
  id: 'edit.enterText', label: 'Edit Text', shortcut: 'Enter',
  enabled: (ctx) => notEditing(ctx) && ctx.selection.length === 1 && ['text', 'group'].includes(ctx.selection[0].type),
  run: (ctx) => {
    const el = ctx.selection[0];
    if (el.type === 'text') app.textEdit.start(el.id, { selectAll: false });
    else if (el.children.length) app.select([el.children[el.children.length - 1].id]);
  }
});
registry.command({
  id: 'edit.nextObject', label: 'Select Next Object', shortcut: 'Tab',
  enabled: (ctx) => notEditing(ctx) && canvasFocused() && !!ctx.page && ctx.page.elements.length > 0,
  run: (ctx) => {
    const list = ctx.page.elements.filter((e) => !e.hidden);
    if (!list.length) return;
    const cur = list.findIndex((e) => e.id === app.selectionIds[0]);
    app.select([list[(cur + 1) % list.length].id]);
  }
});
registry.command({
  id: 'edit.prevObject', label: 'Select Previous Object', shortcut: 'Shift+Tab',
  enabled: (ctx) => notEditing(ctx) && canvasFocused() && !!ctx.page && ctx.page.elements.length > 0,
  run: (ctx) => {
    const list = ctx.page.elements.filter((e) => !e.hidden);
    if (!list.length) return;
    const cur = list.findIndex((e) => e.id === app.selectionIds[0]);
    app.select([list[(cur <= 0 ? list.length : cur) - 1].id]);
  }
});

// ------------------------------------------------------------------ document tabs

const cycle = (dir) => {
  const n = app.sessions.length;
  if (n < 2) return;
  const i = app.sessions.indexOf(app.session);
  app.activate(app.sessions[(i + dir + n) % n]);
};
registry.command({ id: 'doc.next', label: 'Next Publication', shortcut: ['Ctrl+Tab', 'Mod+Tab'], allowInBackstage: true, enabled: () => app.sessions.length > 1, run: () => cycle(1) });
registry.command({ id: 'doc.prev', label: 'Previous Publication', shortcut: ['Ctrl+Shift+Tab', 'Mod+Shift+Tab'], allowInBackstage: true, enabled: () => app.sessions.length > 1, run: () => cycle(-1) });

// ------------------------------------------------------------------ Home tab

registry.group({
  tab: 'home', id: 'clipboard', label: 'Clipboard', order: 10,
  items: [{ command: 'edit.paste', size: 'large' }, { command: 'edit.cut', size: 'small' }, { command: 'edit.copy', size: 'small' }, { command: 'edit.duplicate', size: 'small' }]
});
registry.group({
  tab: 'home', id: 'editing', label: 'Editing', order: 90,
  items: [{ command: 'edit.selectAll', size: 'small' }, { command: 'edit.delete', size: 'small' }, { command: 'view.handTool', size: 'small' }]
});
