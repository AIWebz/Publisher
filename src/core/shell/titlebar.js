// Title bar: app mark, quick-access toolbar (Save, Undo, Redo), editable document title and save
// state. It is the window drag region on desktop and leaves room for the window controls
// (Windows titleBarOverlay on the right, macOS traffic lights on the left).

import { app } from '../app.js';
import { registry } from '../registry.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { setTip } from '../ui/tooltip.js';
import { formatCombo } from '../shortcuts.js';

/** Build the title bar into `el`. */
export function buildTitlebar(el) {
  el.classList.add('titlebar');
  const quick = h('div', { class: 'qat', role: 'toolbar', 'aria-label': 'Quick access' });
  const qButtons = ['file.save', 'edit.undo', 'edit.redo'].map((id) => {
    const b = h('button', { type: 'button', class: 'tb-btn', dataset: { command: id }, onclick: () => app.exec(id) });
    quick.appendChild(b);
    return b;
  });
  const title = h('input', { class: 'doc-title', type: 'text', spellcheck: false, 'aria-label': 'Publication title', autocomplete: 'off' });
  const state = h('span', { class: 'save-state' });
  const brand = h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, icon('logo')), h('span', { class: 'brand-name', text: 'Folio' }));
  const center = h('div', { class: 'tb-center' }, title, state);
  const appName = h('span', { class: 'tb-app', text: 'Folio Publisher' });
  el.replaceChildren(h('div', { class: 'tb-left' }, brand, quick), center, h('div', { class: 'tb-right' }, appName));

  const commitTitle = () => {
    const doc = app.doc;
    if (!doc) return;
    const v = title.value.trim() || 'Untitled publication';
    if (v !== doc.title) app.transact('Rename Publication', (d) => { d.title = v; });
    title.value = app.doc ? app.doc.title : '';
  };
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitTitle(); title.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); title.value = app.doc ? app.doc.title : ''; title.blur(); }
  });
  title.addEventListener('blur', commitTitle);
  app.addFlusher(() => { if (document.activeElement === title) commitTitle(); });

  const update = () => {
    const s = app.session;
    title.hidden = !s;
    if (s && document.activeElement !== title) title.value = s.doc.title || '';
    state.textContent = s ? (s.dirty ? 'Unsaved changes' : s.filePath || s.fileName ? 'Saved' : 'Not saved yet') : '';
    state.classList.toggle('dirty', !!(s && s.dirty));
    const ctx = app.ctx();
    for (const b of qButtons) {
      const cmd = registry.getCommand(b.dataset.command);
      if (!cmd) { b.hidden = true; continue; }
      b.hidden = false;
      const label = cmd.labelFor ? cmd.labelFor(ctx) : cmd.label;
      if (!b.firstChild) b.appendChild(icon(cmd.icon));
      const combo = registry.shortcutFor(cmd.id);
      setTip(b, label, combo ? formatCombo(combo) : '');
      b.disabled = !app.isEnabled(cmd.id);
    }
    const name = s ? s.displayName : '';
    document.title = s ? `${s.dirty ? '• ' : ''}${name} — Folio Publisher` : 'Folio Publisher';
  };
  for (const ev of ['session', 'sessions', 'doc-change', 'dirty', 'saved', 'selection']) app.on(ev, update);
  registry.on('change', update);
  update();
  return { update };
}
