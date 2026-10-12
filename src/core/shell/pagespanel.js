// Pages panel: live thumbnails of the pages (as spreads with facing pages) or of the master pages in
// master mode. Click navigates, drag reorders, right-click opens the page menu, "+" adds a page.

import { app } from '../app.js';
import { prefs } from '../prefs.js';
import { h, debounce } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { setTip } from '../ui/tooltip.js';
import { renderThumb, pageSignature } from '../render/thumbs.js';
import { spreads, movePage } from '../pages.js';
import { plural } from '../i18n.js';

const THUMB_W = 116;

/** Page-panel context menu items for page `i`. */
export function pageMenuItems(i) {
  const doc = app.doc;
  const masters = doc.masters.map((m) => ({ label: `Master ${m.name}`, checked: doc.pages[i] && doc.pages[i].masterId === m.id, run: () => app.exec('page.applyMaster', { indices: [i], masterId: m.id }) }));
  masters.push('-', { label: 'None', checked: doc.pages[i] && doc.pages[i].masterId === null, run: () => app.exec('page.applyMaster', { indices: [i], masterId: null }) });
  return [
    { command: 'page.insertAfter', arg: i, label: 'Insert Page' },
    { command: 'page.insertDialog', arg: i, label: 'Insert Pages…' },
    { command: 'page.duplicate', arg: i },
    { command: 'page.delete', arg: i },
    { command: 'page.move', arg: i },
    '-',
    { label: 'Apply Master Page', icon: 'master', submenu: masters },
    { command: 'design.pageBackground', arg: { pageIndex: i } }
  ];
}

/** Build the pages panel into `el`. */
export function buildPagesPanel(el) {
  el.classList.add('pages-panel');
  const title = h('h2', { class: 'pane-title' });
  const addBtn = h('button', { type: 'button', class: 'icon-btn sm', onclick: () => app.exec(app.isMasterMode ? 'master.add' : 'page.insertAfter') }, icon('plus'));
  const list = h('div', { class: 'thumbs', role: 'listbox', tabindex: '0', 'aria-label': 'Pages' });
  const foot = h('div', { class: 'pane-foot' });
  el.replaceChildren(h('div', { class: 'pane-head' }, title, addBtn), list, foot);
  const cache = new Map();   // page/master id -> { sig, frame }
  let dragFrom = -1;

  const indicator = h('div', { class: 'thumb-drop', hidden: true });

  function thumbItem(kind, i, page, label) {
    const frame = h('div', { class: 'thumb-frame' });
    const item = h('div', {
      class: 'thumb', role: 'option', draggable: kind === 'page' ? 'true' : 'false', dataset: { index: String(i), kind },
      onclick: () => (kind === 'page' ? app.goToPage(i) : app.setMasterMode(true, i))
    }, frame, h('div', { class: 'thumb-num', text: label }));
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (kind === 'page') { app.goToPage(i); app.ui.contextMenu(e.clientX, e.clientY, pageMenuItems(i)); }
      else {
        app.setMasterMode(true, i);
        app.ui.contextMenu(e.clientX, e.clientY, [{ command: 'master.add' }, { command: 'master.duplicate', arg: i }, { command: 'master.rename', arg: i }, { command: 'master.delete', arg: i }, '-', { command: 'master.apply', arg: i }, { command: 'view.masterMode' }]);
      }
    });
    if (kind === 'page') {
      item.addEventListener('dragstart', (e) => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-folio-page', String(i)); item.classList.add('dragging'); });
      item.addEventListener('dragend', () => { dragFrom = -1; item.classList.remove('dragging'); indicator.hidden = true; });
    }
    const c = cache.get(page.id);
    const sig = pageSignature(app.doc, page, Math.max(0, i));
    if (c && c.sig === sig) {
      frame.style.cssText = c.frame.style.cssText;
      frame.replaceChildren(...c.frame.childNodes);
    } else renderThumb(frame, app.doc, page, { width: THUMB_W, height: THUMB_W * 1.5, pageIndex: Math.max(0, i) });
    cache.set(page.id, { sig, frame });
    return item;
  }

  function dropIndex(e) {
    const items = [...list.querySelectorAll('.thumb[data-kind="page"]')];
    let best = items.length;
    for (const it of items) {
      const r = it.getBoundingClientRect();
      const facing = app.doc.setup.facing;
      const mid = facing ? r.left + r.width / 2 : r.top + r.height / 2;
      const pos = facing ? e.clientX : e.clientY;
      const sameRow = !facing || (e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8);
      if (sameRow && pos < mid) { best = +it.dataset.index; break; }
      if (!facing && pos < r.bottom) { best = +it.dataset.index + 1; }
    }
    return best;
  }

  list.addEventListener('dragover', (e) => {
    if (dragFrom < 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const to = dropIndex(e);
    const items = [...list.querySelectorAll('.thumb[data-kind="page"]')];
    const ref = items[to];
    const lr = list.getBoundingClientRect();
    const r = ref ? ref.getBoundingClientRect() : items[items.length - 1].getBoundingClientRect();
    indicator.hidden = false;
    indicator.style.top = `${(ref ? r.top : r.bottom) - lr.top + list.scrollTop - 6}px`;
  });
  list.addEventListener('drop', (e) => {
    if (dragFrom < 0) return;
    e.preventDefault();
    indicator.hidden = true;
    let to = dropIndex(e);
    const from = dragFrom;
    if (to > from) to -= 1;
    if (to !== from) app.transact('Move Page', (doc) => { movePage(doc, from, to); app.session.view.pageIndex = to; });
    app.emit('page', app.pageIndex);
  });
  list.addEventListener('keydown', (e) => {
    if (!app.session) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); app.exec('page.next'); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); app.exec('page.prev'); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && !app.isMasterMode) { e.preventDefault(); app.exec('page.delete', app.pageIndex); }
  });

  function render() {
    const doc = app.doc;
    el.hidden = !prefs.get('pagesPanel') || !doc;
    if (!doc) { list.replaceChildren(); return; }
    const master = app.isMasterMode;
    title.textContent = master ? 'Master Pages' : 'Pages';
    setTip(addBtn, master ? 'New master page' : 'Insert page after the current page');
    const rows = [];
    if (master) {
      doc.masters.forEach((m, i) => {
        const it = thumbItem('master', i, m, `Master ${m.name}`);
        it.classList.toggle('active', i === app.session.view.masterIndex);
        rows.push(h('div', { class: 'thumb-row' }, it));
      });
    } else {
      for (const sp of spreads(doc)) {
        const row = h('div', { class: `thumb-row${sp.length > 1 ? ' spread' : ''}${doc.setup.facing && sp.length === 1 && sp[0] === 0 ? ' first' : ''}` });
        for (const i of sp) {
          const it = thumbItem('page', i, doc.pages[i], String(i + 1));
          if (i === app.pageIndex) it.classList.add('active');
          it.setAttribute('aria-selected', String(i === app.pageIndex));
          row.appendChild(it);
        }
        rows.push(row);
      }
    }
    list.replaceChildren(...rows, indicator);
    foot.textContent = master ? plural(doc.masters.length, '{n} master page', '{n} master pages') : plural(doc.pages.length, '{n} page', '{n} pages');
    list.querySelector('.thumb.active')?.scrollIntoView({ block: 'nearest' });
    const live = new Set([...doc.pages, ...doc.masters].map((p) => p.id));
    for (const id of cache.keys()) if (!live.has(id)) cache.delete(id);
  }

  const renderSoon = debounce(render, 250);
  app.on('doc-change', () => renderSoon());
  for (const ev of ['session', 'page', 'view']) app.on(ev, () => { renderSoon.cancel(); render(); });
  prefs.on('change', (p) => { if (p === 'pagesPanel') render(); });
  app.on('session', () => cache.clear());
  render();
  return { render };
}
