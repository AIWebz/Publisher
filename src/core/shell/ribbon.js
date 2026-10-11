// The ribbon: tab strip (File, built-in tabs, accent-coloured contextual tabs that appear with a
// matching selection) and the active tab's groups, rendered from the registry. Command buttons
// reflect enabled/checked state and dynamic labels; custom items get update(ctx) calls.

import { app } from '../app.js';
import { registry } from '../registry.js';
import { prefs } from '../prefs.js';
import { h, onFrame } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { setTip } from '../ui/tooltip.js';
import { openMenu } from '../ui/menu.js';
import { formatCombo } from '../shortcuts.js';

const tipKey = (id) => { const c = registry.shortcutFor(id); return c ? formatCombo(c) : ''; };

/** Ribbon controller. */
export class Ribbon {
  constructor(el) {
    this.el = el;
    this.active = 'home';
    this.controls = [];      // { update(ctx) }
    this.visibleKey = '';
    this.peek = false;
    el.classList.add('ribbon-wrap');
    this.tabsEl = h('div', { class: 'ribbon-tabs', role: 'tablist', 'aria-label': 'Ribbon tabs' });
    this.body = h('div', { class: 'ribbon-body', role: 'toolbar' });
    this.leftBtn = h('button', { type: 'button', class: 'rscroll left', 'aria-label': 'Scroll ribbon left', hidden: true, onclick: () => this.body.scrollBy({ left: -240, behavior: 'smooth' }) }, icon('chevron-left'));
    this.rightBtn = h('button', { type: 'button', class: 'rscroll right', 'aria-label': 'Scroll ribbon right', hidden: true, onclick: () => this.body.scrollBy({ left: 240, behavior: 'smooth' }) }, icon('chevron-right'));
    this.panel = h('div', { class: 'ribbon' }, this.leftBtn, this.body, this.rightBtn);
    el.replaceChildren(this.tabsEl, this.panel);
    this.body.addEventListener('scroll', () => this.updateScrollers(), { passive: true });
    new ResizeObserver(() => this.updateScrollers()).observe(this.body);
    this.body.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && this.body.scrollWidth > this.body.clientWidth) { this.body.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
    const soon = () => onFrame('ribbon-update', () => this.update());
    for (const ev of ['selection', 'doc-change', 'session', 'sessions', 'page', 'view', 'edit-start', 'edit-end', 'dirty', 'tool']) app.on(ev, soon);
    prefs.on('change', (path) => { if (path === 'ribbonCollapsed') this.applyCollapsed(); soon(); });
    registry.on('change', (kinds) => {
      if (kinds.some((k) => ['tab', 'group', 'command', 'shortcut', 'icon'].includes(k))) onFrame('ribbon-render', () => this.render());
      else soon();
    });
    document.addEventListener('pointerdown', (e) => { if (this.peek && !this.el.contains(e.target) && !e.target.closest('.menu, .color-pop, .popover')) this.setPeek(false); }, true);
    this.applyCollapsed();
    this.render();
  }

  applyCollapsed() {
    this.el.classList.toggle('collapsed', !!prefs.get('ribbonCollapsed'));
    if (!prefs.get('ribbonCollapsed')) this.setPeek(false);
  }

  setPeek(on) {
    this.peek = on;
    this.el.classList.toggle('peek', on);
  }

  /** Tabs to show now (built-in + matching contextual tabs). */
  visibleTabs() {
    const ctx = app.ctx();
    return registry.tabList().filter((t) => {
      if (!t.contextual) return true;
      if (!app.session) return false;
      try { return !!t.contextual(ctx); } catch { return false; }
    });
  }

  /** Activate a tab by id. */
  select(id) {
    const t = registry.getTab(id);
    if (!t) return;
    this.active = t.key;
    if (prefs.get('ribbonCollapsed')) this.setPeek(true);
    this.render();
  }

  renderTabs(tabs) {
    const file = h('button', { type: 'button', class: 'rtab rtab-file', role: 'tab', text: 'File', onclick: () => app.ui.backstage && app.ui.backstage.open() });
    const nodes = [file];
    let ctxGroup = null;
    for (const t of tabs) {
      const b = h('button', {
        type: 'button', role: 'tab', class: `rtab${t.contextual ? ' ctx' : ''}${t.key === this.active ? ' active' : ''}`,
        'aria-selected': String(t.key === this.active), dataset: { tab: t.key }, text: t.label || t.id,
        onclick: () => this.select(t.key),
        ondblclick: () => prefs.toggle('ribbonCollapsed')
      });
      if (t.contextual) {
        const caption = t.caption || '';
        if (!ctxGroup || ctxGroup.dataset.caption !== caption) {
          ctxGroup = h('div', { class: 'rtab-ctx', dataset: { caption }, style: t.accent ? { '--ctx': t.accent } : null }, h('span', { class: 'ctx-caption', text: caption }), h('div', { class: 'ctx-tabs' }));
          nodes.push(ctxGroup);
        }
        ctxGroup.querySelector('.ctx-tabs').appendChild(b);
      } else {
        ctxGroup = null;
        nodes.push(b);
      }
    }
    const toggle = h('button', { type: 'button', class: 'ribbon-toggle', onclick: () => prefs.toggle('ribbonCollapsed') }, icon('chevron-up'));
    setTip(toggle, prefs.get('ribbonCollapsed') ? 'Pin the ribbon' : 'Collapse the ribbon', 'Ctrl+F1');
    nodes.push(h('div', { class: 'rtab-spacer' }), toggle);
    this.tabsEl.replaceChildren(...nodes);
  }

  /** Rebuild tabs and the active tab's groups. */
  render() {
    const tabs = this.visibleTabs();
    if (!tabs.some((t) => t.key === this.active)) this.active = tabs[0] ? tabs[0].key : 'home';
    this.visibleKey = tabs.map((t) => t.key).join('|');
    this.renderTabs(tabs);
    this.controls = [];
    const ctx = app.ctx();
    const groups = registry.groupsFor(this.active);
    const tab = registry.getTab(this.active);
    this.panel.classList.toggle('ctx', !!(tab && tab.contextual));
    if (tab && tab.accent) this.panel.style.setProperty('--ctx', tab.accent); else this.panel.style.removeProperty('--ctx');
    this.body.replaceChildren(...groups.map((g) => this.renderGroup(g, ctx)));
    this.update();
    this.updateScrollers();
  }

  renderGroup(g, ctx) {
    const items = h('div', { class: 'rg-items' });
    let stack = null, icons = null;
    const flushIcons = () => {
      if (!icons) return;
      const n = icons.childElementCount;
      const rows = n <= 4 ? 1 : n <= 8 ? 2 : 3;
      icons.style.gridTemplateColumns = `repeat(${Math.ceil(n / rows)}, auto)`;
      icons = null;
    };
    for (const it of g.items) {
      const size = it.size || 'small';
      if (it.type === 'separator') { stack = null; flushIcons(); items.appendChild(h('div', { class: 'rg-sep' })); continue; }
      let node;
      if (it.type === 'custom') {
        node = h('div', { class: `rb-custom${it.className ? ` ${it.className}` : ''}` });
        try {
          const ctl = it.render(node, ctx);
          if (ctl && typeof ctl.update === 'function') this.controls.push(ctl);
        } catch (err) { console.error(`Ribbon item in ${g.id} failed`, err); }
      } else if (it.type === 'menu') {
        node = this.menuButton(it, size, ctx);
      } else {
        node = this.commandButton(it, size);
      }
      if (!node) continue;
      if (size === 'small' && it.type !== 'custom') {
        flushIcons();
        if (!stack || stack.childElementCount >= 3) { stack = h('div', { class: 'rb-stack' }); items.appendChild(stack); }
        stack.appendChild(node);
      } else if (size === 'icon') {
        stack = null;
        if (!icons) { icons = h('div', { class: 'rb-icons' }); items.appendChild(icons); }
        icons.appendChild(node);
      } else {
        stack = null;
        flushIcons();
        items.appendChild(node);
      }
    }
    flushIcons();
    return h('div', { class: 'rgroup', role: 'group', 'aria-label': g.label || g.id, dataset: { group: g.id } }, items, h('div', { class: 'rg-label', text: g.label || '' }));
  }

  commandButton(it, size) {
    const cmd = registry.getCommand(it.command);
    if (!cmd) return null;
    const b = h('button', { type: 'button', class: `rb rb-${size}`, dataset: { command: cmd.id } });
    const ic = h('span', { class: 'rb-ic' });
    const label = h('span', { class: 'rb-label' });
    b.append(ic, label);
    b.addEventListener('click', () => {
      app.exec(cmd.id, it.arg);
      if (this.peek && !it.keepOpen) this.setPeek(false);
    });
    const ctl = {
      update: (ctx) => {
        const l = it.label || (cmd.labelFor ? cmd.labelFor(ctx) : cmd.label) || cmd.id;
        const iname = it.icon || (cmd.iconFor ? cmd.iconFor(ctx) : cmd.icon);
        if (ic.dataset.icon !== iname) { ic.dataset.icon = iname || ''; ic.replaceChildren(...(iname ? [icon(iname)] : [])); }
        label.textContent = size === 'icon' ? '' : l;
        setTip(b, l, tipKey(cmd.id), cmd.title || '');
        b.disabled = !app.isEnabled(cmd.id);
        if (cmd.checked) {
          const on = app.isChecked(cmd.id);
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', String(on));
        }
      }
    };
    this.controls.push(ctl);
    return b;
  }

  menuButton(it, size) {
    const b = h('button', { type: 'button', class: `rb rb-${size} rb-menu`, 'aria-haspopup': 'menu' },
      h('span', { class: 'rb-ic' }, it.icon ? icon(it.icon) : null), h('span', { class: 'rb-label', text: size === 'icon' ? '' : it.label || '' }), h('span', { class: 'rb-caret' }, icon('chevron-down')));
    setTip(b, it.label || '', '', it.title || '');
    b.addEventListener('click', () => {
      const items = typeof it.items === 'function' ? it.items(app.ctx()) : it.items || [];
      openMenu(b, null, items, { onClose: () => { if (this.peek) this.setPeek(false); } });
    });
    this.controls.push({ update: () => { b.disabled = it.enabled ? !it.enabled(app.ctx()) : !app.session && !it.global; } });
    return b;
  }

  /** Refresh states (and re-render when the set of contextual tabs changed). */
  update() {
    const key = this.visibleTabs().map((t) => t.key).join('|');
    if (key !== this.visibleKey) { this.render(); return; }
    const ctx = app.ctx();
    for (const c of this.controls) {
      try { c.update(ctx); } catch (err) { console.error('Ribbon update failed', err); }
    }
  }

  updateScrollers() {
    const b = this.body;
    const over = b.scrollWidth > b.clientWidth + 2;
    this.leftBtn.hidden = !over || b.scrollLeft <= 2;
    this.rightBtn.hidden = !over || b.scrollLeft + b.clientWidth >= b.scrollWidth - 2;
  }
}
