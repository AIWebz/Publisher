// Right panel with two tabs: "Format" (inspector sections registered with registry.inspector, shown
// when their when(ctx) matches) and "Layers" (the selection pane: stacking order, visibility, lock,
// names, drag to reorder; hidden objects are selectable only here).

import { app } from '../app.js';
import { registry } from '../registry.js';
import { prefs } from '../prefs.js';
import { h, onFrame } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { setTip } from '../ui/tooltip.js';
import { findElement } from '../model.js';
import { SHAPE_LABELS } from '../render/shapes.js';
import { plural } from '../i18n.js';

const TYPE_ICON = { text: 'text-box', image: 'picture', shape: 'shapes', line: 'line', table: 'table', group: 'group' };
const TYPE_NAME = { text: 'Text Box', image: 'Picture', line: 'Line', table: 'Table', group: 'Group' };

/** Display name of an element (its name, else a type label). */
export function elementLabel(el) {
  if (el.name) return el.name;
  if (el.type === 'shape') return SHAPE_LABELS[el.shape] || 'Shape';
  if (el.type === 'image' && !el.assetId) return 'Picture Placeholder';
  const def = registry.getElementType(el.type);
  return TYPE_NAME[el.type] || (def && def.label) || 'Object';
}

/** Build the right panel into `el`. */
export function buildRightPanel(el) {
  el.classList.add('right-panel');
  const tabFormat = h('button', { type: 'button', class: 'rp-tab', role: 'tab', text: 'Format', onclick: () => prefs.set('rightTab', 'format') });
  const tabLayers = h('button', { type: 'button', class: 'rp-tab', role: 'tab', text: 'Layers', onclick: () => prefs.set('rightTab', 'layers') });
  const format = h('div', { class: 'rp-body inspector', role: 'tabpanel' });
  const layers = h('div', { class: 'rp-body layers', role: 'tabpanel' });
  el.replaceChildren(h('div', { class: 'rp-tabs', role: 'tablist' }, tabFormat, tabLayers), format, layers);

  // ------------------------------------------------------------------ format (inspectors)
  let sections = [];
  let sectionKey = '';
  const collapsed = new Set();

  function renderInspector() {
    const ctx = app.ctx();
    const list = app.session ? registry.inspectorList().filter((d) => { try { return !d.when || d.when(ctx); } catch { return false; } }) : [];
    const key = `${app.session ? app.session.id : ''}|${list.map((d) => d.id).join(',')}`;
    if (key === sectionKey) {
      for (const s of sections) { try { s.ctl && s.ctl.update && s.ctl.update(ctx); } catch (err) { console.error(`Inspector ${s.id} update failed`, err); } }
      return;
    }
    sectionKey = key;
    sections = list.map((d) => {
      const body = h('div', { class: 'ins-body' });
      const head = h('button', { type: 'button', class: 'ins-head', 'aria-expanded': String(!collapsed.has(d.id)) }, icon('chevron-down', 'ins-caret'), h('span', { text: d.title || d.id }));
      const sec = h('section', { class: `ins-section${collapsed.has(d.id) ? ' collapsed' : ''}`, dataset: { inspector: d.id } }, head, body);
      head.addEventListener('click', () => {
        if (collapsed.has(d.id)) collapsed.delete(d.id); else collapsed.add(d.id);
        sec.classList.toggle('collapsed', collapsed.has(d.id));
        head.setAttribute('aria-expanded', String(!collapsed.has(d.id)));
      });
      let ctl = null;
      try { ctl = d.render(body, ctx); } catch (err) { console.error(`Inspector ${d.id} failed`, err); body.textContent = 'This section could not be shown.'; }
      try { ctl && ctl.update && ctl.update(ctx); } catch (err) { console.error(`Inspector ${d.id} update failed`, err); }
      return { id: d.id, el: sec, ctl };
    });
    const empty = !app.session
      ? h('div', { class: 'ins-empty' }, h('p', { text: 'Open or create a publication to start.' }))
      : !sections.length ? h('div', { class: 'ins-empty' }, h('p', { text: 'Select an object on the page to format it.' })) : null;
    format.replaceChildren(...sections.map((s) => s.el), ...(empty ? [empty] : []));
  }

  // ------------------------------------------------------------------ layers
  const expanded = new Set();
  let dragInfo = null;

  function layerRow(elm, depth, list) {
    const sel = app.selectionIds.includes(elm.id);
    const eye = h('button', { type: 'button', class: 'ly-btn', onclick: (e) => { e.stopPropagation(); toggleProp(elm.id, 'hidden'); } }, icon(elm.hidden ? 'eye-off' : 'eye'));
    setTip(eye, elm.hidden ? 'Show' : 'Hide');
    const lock = h('button', { type: 'button', class: `ly-btn${elm.locked ? ' on' : ''}`, onclick: (e) => { e.stopPropagation(); toggleProp(elm.id, 'locked'); } }, icon(elm.locked ? 'lock' : 'unlock'));
    setTip(lock, elm.locked ? 'Unlock' : 'Lock');
    const isGroup = elm.type === 'group';
    const twisty = isGroup
      ? h('button', { type: 'button', class: `ly-twisty${expanded.has(elm.id) ? ' open' : ''}`, 'aria-label': 'Expand group', onclick: (e) => { e.stopPropagation(); if (expanded.has(elm.id)) expanded.delete(elm.id); else expanded.add(elm.id); renderLayers(); } }, icon('chevron-right'))
      : h('span', { class: 'ly-twisty' });
    const name = h('span', { class: 'ly-name', text: elementLabel(elm) });
    const rowEl = h('div', {
      class: `ly-row${sel ? ' selected' : ''}${elm.hidden ? ' is-hidden' : ''}${elm.locked ? ' is-locked' : ''}`,
      role: 'treeitem', 'aria-selected': String(sel), draggable: 'true', tabindex: '-1',
      style: { paddingLeft: `${6 + depth * 16}px` }, dataset: { id: elm.id }
    }, twisty, h('span', { class: 'ly-ic' }, icon(TYPE_ICON[elm.type] || 'shapes')), name, eye, lock);
    rowEl.addEventListener('click', (e) => {
      if (e.shiftKey || e.ctrlKey || e.metaKey) app.select([elm.id], { toggle: true });
      else app.select([elm.id]);
      if (!elm.hidden && app.canvas) app.canvas.scrollToElement(elm.id);
    });
    name.addEventListener('dblclick', (e) => { e.stopPropagation(); renameInline(name, elm); });
    rowEl.addEventListener('dragstart', (e) => { dragInfo = { id: elm.id, list }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-folio-layer', elm.id); });
    rowEl.addEventListener('dragover', (e) => {
      if (!dragInfo || dragInfo.list !== list || dragInfo.id === elm.id) return;
      e.preventDefault();
      const r = rowEl.getBoundingClientRect();
      const above = e.clientY < r.top + r.height / 2;
      layers.querySelectorAll('.drop-above, .drop-below').forEach((n) => n.classList.remove('drop-above', 'drop-below'));
      rowEl.classList.add(above ? 'drop-above' : 'drop-below');
    });
    rowEl.addEventListener('drop', (e) => {
      if (!dragInfo || dragInfo.list !== list) return;
      e.preventDefault();
      const r = rowEl.getBoundingClientRect();
      const above = e.clientY < r.top + r.height / 2;
      const id = dragInfo.id;
      dragInfo = null;
      // rows are listed top-most first: "above" in the pane means later in the element list
      app.transact('Reorder', (doc) => {
        const hit = findElement(doc, id), target = findElement(doc, elm.id);
        if (!hit || !target || hit.list !== target.list) return;
        const [moved] = hit.list.splice(hit.index, 1);
        const ti = hit.list.indexOf(target.el);
        hit.list.splice(above ? ti + 1 : ti, 0, moved);
      });
    });
    rowEl.addEventListener('dragend', () => { dragInfo = null; layers.querySelectorAll('.drop-above, .drop-below').forEach((n) => n.classList.remove('drop-above', 'drop-below')); });
    return rowEl;
  }

  function renameInline(nameEl, elm) {
    const input = h('input', { class: 'field ly-rename', value: elm.name || '', placeholder: elementLabel(elm) });
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (commit && v !== (elm.name || '')) app.transact('Rename Object', (doc) => { const hit = findElement(doc, elm.id); if (hit) hit.el.name = v; });
      else renderLayers();
    };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true));
  }

  function toggleProp(id, prop) {
    const doc = app.doc;
    const hit = doc && findElement(doc, id);
    if (!hit) return;
    const on = !hit.el[prop];
    const label = prop === 'hidden' ? (on ? 'Hide Object' : 'Show Object') : (on ? 'Lock Object' : 'Unlock Object');
    app.transact(label, (d) => { const x = findElement(d, id); if (x) x.el[prop] = on; });
  }

  function renderLayers() {
    const page = app.page;
    if (!page) { layers.replaceChildren(h('div', { class: 'ins-empty' }, h('p', { text: 'No publication open.' }))); return; }
    const rows = [];
    const walk = (list, depth) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        rows.push(layerRow(e, depth, list));
        if (e.type === 'group' && expanded.has(e.id)) walk(e.children, depth + 1);
      }
    };
    for (const id of app.selectionIds) {
      let hit = findElement(app.doc, id);
      while (hit && hit.parent) { expanded.add(hit.parent.id); hit = findElement(app.doc, hit.parent.id); }
    }
    walk(page.elements, 0);
    const head = h('div', { class: 'ly-head' }, h('span', { text: app.isMasterMode ? `Master ${app.master.name}` : `Page ${app.pageIndex + 1}` }), h('span', { class: 'ly-count', text: plural(page.elements.length, '{n} object', '{n} objects') }));
    const tree = h('div', { class: 'ly-tree', role: 'tree' }, rows.length ? rows : [h('div', { class: 'ins-empty' }, h('p', { text: 'This page has no objects yet.' }))]);
    layers.replaceChildren(head, tree);
    layers.querySelector('.ly-row.selected')?.scrollIntoView({ block: 'nearest' });
  }

  function applyTab() {
    const t = prefs.get('rightTab') === 'layers' ? 'layers' : 'format';
    tabFormat.classList.toggle('active', t === 'format');
    tabLayers.classList.toggle('active', t === 'layers');
    tabFormat.setAttribute('aria-selected', String(t === 'format'));
    tabLayers.setAttribute('aria-selected', String(t === 'layers'));
    format.hidden = t !== 'format';
    layers.hidden = t !== 'layers';
    el.hidden = !prefs.get('rightPanel');
    update();
  }

  function update() {
    if (!format.hidden) renderInspector();
    if (!layers.hidden) renderLayers();
  }
  const soon = () => onFrame('right-panel', update);
  for (const ev of ['selection', 'doc-change', 'session', 'page', 'view', 'edit-start', 'edit-end']) app.on(ev, soon);
  app.on('preview', () => onFrame('right-panel-preview', () => { if (!format.hidden) renderInspector(); }));
  registry.on('change', (kinds) => { if (kinds.includes('inspector')) { sectionKey = ''; soon(); } });
  prefs.on('change', (p) => { if (p === 'rightTab' || p === 'rightPanel') applyTab(); });
  applyTab();
  return { update };
}
