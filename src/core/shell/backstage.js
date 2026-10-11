// The File view (backstage): a full-window page under the title bar with a navigation rail of
// registry.backstage entries (render pages or command actions). It is the start screen when no
// publication is open. Installed as app.ui.backstage.

import { app } from '../app.js';
import { registry } from '../registry.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/** Build the backstage into `el` and install app.ui.backstage. */
export function buildBackstage(el) {
  el.classList.add('backstage');
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'File');
  const nav = h('nav', { class: 'bs-nav' });
  const content = h('div', { class: 'bs-content' });
  el.replaceChildren(nav, content);
  let current = null;
  let isOpen = false;

  const entries = () => registry.backstageList().filter((b) => !b.parent && (!b.when || b.when(app.ctx())));

  function renderNav() {
    const back = h('button', { type: 'button', class: 'bs-back', hidden: !app.session, onclick: () => close() }, icon('back'), h('span', { text: 'Back' }));
    const items = entries().map((b) => {
      if (b.separator) return h('div', { class: 'bs-sep' });
      const disabled = b.command ? !app.isEnabled(b.command) : b.enabled ? !b.enabled(app.ctx()) : false;
      return h('button', {
        type: 'button', class: `bs-item${current === b.id ? ' active' : ''}`, dataset: { page: b.id }, disabled,
        onclick: () => (b.render ? show(b.id) : run(b))
      }, b.icon ? icon(b.icon) : null, h('span', { text: b.label || b.id }));
    });
    nav.replaceChildren(h('div', { class: 'bs-brand' }, icon('logo'), h('span', { text: 'Folio' })), back, ...items);
  }

  function run(b) {
    close();
    if (b.command) app.exec(b.command, b.arg);
    else if (b.run) b.run(app.ctx());
  }

  function show(id) {
    const b = registry.backstageList().find((x) => x.id === id && x.render);
    if (!b) return;
    current = id;
    renderNav();
    const page = h('div', { class: `bs-page bs-page-${id}` });
    content.replaceChildren(page);
    content.scrollTop = 0;
    try { b.render(page, app.ctx()); } catch (err) { console.error(`Backstage ${id} failed`, err); page.textContent = 'This page could not be shown.'; }
  }

  function defaultPage() {
    const list = entries().filter((b) => b.render);
    if (!app.session) return (list.find((b) => b.id === 'new') || list[0] || {}).id;
    return (list.find((b) => b.id === current) || list.find((b) => b.id === 'info') || list.find((b) => b.id === 'new') || list[0] || {}).id;
  }

  function open(id) {
    app.flush();
    isOpen = true;
    el.hidden = false;
    document.body.classList.add('backstage-open');
    show(id || defaultPage());
    requestAnimationFrame(() => el.querySelector('.bs-item.active, .bs-item')?.focus({ preventScroll: true }));
  }

  function close() {
    if (!app.session) { show(defaultPage()); return; }
    isOpen = false;
    el.hidden = true;
    document.body.classList.remove('backstage-open');
    content.replaceChildren();
  }

  el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && app.session) { e.preventDefault(); e.stopPropagation(); close(); } });
  app.on('session', (s) => { if (s && isOpen) close(); else if (!s) open('new'); });
  registry.on('change', (kinds) => { if (kinds.includes('backstage') && isOpen) { renderNav(); if (current) show(current); } });

  app.ui.backstage = {
    open, close, show,
    toggle: () => (isOpen ? close() : open()),
    get isOpen() { return isOpen; },
    get page() { return current; },
    refresh: () => { if (isOpen && current) show(current); }
  };
  return app.ui.backstage;
}
