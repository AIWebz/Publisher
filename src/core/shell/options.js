// File › Options: a modal window with a category list (registry.optionsPage) on the left and the
// sections registered for the chosen category (registry.optionsSection) on the right. Sections
// edit preferences directly (prefs.set), so changes apply at once; the dialog closes with OK.
// Installed as app.ui.options = { open(pageId?) } and the 'file.options' command.

import { app } from '../app.js';
import { registry } from '../registry.js';
import { h } from '../ui/dom.js';
import { t } from '../i18n.js';
import { dialog } from '../ui/dialog.js';
import './options.css';

let lastPage = null;

registry.optionsPage({ id: 'general', label: 'General', order: 10 });
registry.optionsPage({ id: 'proofing', label: 'Proofing', order: 20 });
registry.optionsPage({ id: 'save', label: 'Save', order: 30 });
registry.optionsPage({ id: 'language', label: 'Language', order: 40 });
registry.optionsPage({ id: 'advanced', label: 'Advanced', order: 50 });

/**
 * Open the Options window.
 * @param {string} [pageId] category to show first
 */
export function openOptions(pageId) {
  const pages = () => registry.optionsPageList().filter((p) => registry.optionsSectionsFor(p.id).length);
  let current = pageId || lastPage || (pages()[0] || {}).id;
  const nav = h('nav', { class: 'opt-nav', role: 'tablist', 'aria-orientation': 'vertical' });
  const body = h('div', { class: 'opt-body', role: 'tabpanel' });
  let live = [];

  function destroy() {
    for (const s of live) { try { s && s.destroy && s.destroy(); } catch (err) { console.error(err); } }
    live = [];
  }

  function draw() {
    const list = pages();
    if (!list.find((p) => p.id === current)) current = (list[0] || {}).id;
    lastPage = current;
    nav.replaceChildren(...list.map((p) => h('button', {
      type: 'button', role: 'tab', class: `opt-cat${p.id === current ? ' on' : ''}`, 'aria-selected': String(p.id === current),
      dataset: { page: p.id }, text: t(p.label), onclick: () => { current = p.id; draw(); }
    })));
    destroy();
    body.replaceChildren();
    const page = list.find((p) => p.id === current);
    if (!page) return;
    body.appendChild(h('h3', { class: 'opt-title', text: t(page.label) }));
    for (const s of registry.optionsSectionsFor(page.id)) {
      const box = h('section', { class: 'opt-section', dataset: { section: s.id } });
      if (s.title) box.appendChild(h('h4', { text: t(s.title) }));
      const content = h('div', { class: 'opt-content' });
      box.appendChild(content);
      body.appendChild(box);
      try { live.push(s.render(content, app.ctx()) || null); } catch (err) { console.error(`Options section ${s.id} failed`, err); content.textContent = t('This section could not be shown.'); }
    }
    body.scrollTop = 0;
  }

  draw();
  const root = h('div', { class: 'opt-root' }, nav, body);
  return dialog({
    title: t('Options'), body: root, width: 860, className: 'dlg-options',
    buttons: [{ label: t('OK'), value: 'ok', primary: true }]
  }).finally(destroy);
}

// ------------------------------------------------------------------------------------------------
// Small control builders for option sections (labels are translated here).
// ------------------------------------------------------------------------------------------------

/** A checkbox row bound to get/set callbacks. */
export function optCheck(label, get, set, hint) {
  const input = h('input', { type: 'checkbox' });
  input.checked = !!get();
  input.addEventListener('change', () => set(input.checked));
  return h('label', { class: 'opt-row opt-check' }, input, h('span', { text: t(label) }), hint ? h('small', { text: t(hint) }) : null);
}

/** A select row: options = [{ value, label }] (labels are translated unless raw: true). */
export function optSelect(label, options, get, set, { raw = false } = {}) {
  const sel = h('select', { class: 'field' }, ...options.map((o) => h('option', { value: o.value, text: raw ? o.label : t(o.label) })));
  sel.value = String(get());
  sel.addEventListener('change', () => set(sel.value));
  return h('label', { class: 'opt-row' }, h('span', { text: t(label) }), sel);
}

/** A number row. */
export function optNumber(label, get, set, { min, max, step = 1, suffix } = {}) {
  const input = h('input', { type: 'number', class: 'field num', min, max, step });
  input.value = String(get());
  input.addEventListener('change', () => {
    const v = parseFloat(input.value);
    if (Number.isFinite(v) && (min === undefined || v >= min) && (max === undefined || v <= max)) set(v);
    else input.value = String(get());
  });
  return h('label', { class: 'opt-row' }, h('span', { text: t(label) }), suffix ? h('div', { class: 'field-unit' }, input, h('i', { text: t(suffix) })) : input);
}

/** A text row. */
export function optText(label, get, set, { placeholder = '' } = {}) {
  const input = h('input', { type: 'text', class: 'field', placeholder: t(placeholder) });
  input.value = String(get() ?? '');
  input.addEventListener('change', () => set(input.value));
  return h('label', { class: 'opt-row' }, h('span', { text: t(label) }), input);
}

registry.command({
  id: 'file.options', label: 'Options', icon: 'settings', global: true, allowInText: true,
  title: 'Change application settings: theme, proofing, language, saving and editing options',
  run: (_ctx, pageId) => openOptions(typeof pageId === 'string' ? pageId : undefined)
});
registry.backstage({ id: 'options', label: 'Options', icon: 'settings', order: 95, command: 'file.options' });

/** Install app.ui.options. */
export function installOptions() {
  app.ui.options = { open: openOptions };
}
