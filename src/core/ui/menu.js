// Context menus and drop-down menus with submenus, command items, shortcuts and keyboard navigation.

import { h, positionPopup } from './dom.js';
import { icon } from './icons.js';
import { app } from '../app.js';
import { registry } from '../registry.js';
import { formatCombo } from '../shortcuts.js';

let active = null;   // root menu controller

/** Close any open menu. */
export function closeMenus() {
  if (active) active.close();
}

/** Resolve a MenuItem (command items take label/icon/state from the registry). */
function resolveItem(it) {
  if (it === '-' || it === null || (it && it.type === 'separator')) return { sep: true };
  const cmd = it.command ? registry.getCommand(it.command) : null;
  const ctx = app.ctx();
  const label = it.label ?? (cmd ? (cmd.labelFor ? cmd.labelFor(ctx) : cmd.label) : '');
  const combo = it.shortcut ?? (it.command ? registry.shortcutFor(it.command) : null);
  return {
    label,
    icon: it.icon ?? (cmd && cmd.icon),
    shortcut: combo ? formatCombo(combo) : '',
    disabled: it.disabled ?? (it.command ? !app.isEnabled(it.command) : false),
    checked: it.checked ?? (it.command && cmd && cmd.checked ? app.isChecked(it.command) : undefined),
    danger: !!it.danger,
    submenu: it.submenu,
    hint: it.hint,
    run: it.run || (it.command ? () => app.exec(it.command, it.arg) : null)
  };
}

function buildMenu(items, onPick, level = 0) {
  const menu = h('div', { class: 'menu', role: 'menu', tabindex: '-1' });
  const resolved = items.filter((x) => x !== undefined && x !== false).map(resolveItem);
  // drop leading/trailing/double separators
  const clean = resolved.filter((r, i, a) => !(r.sep && (i === 0 || i === a.length - 1 || a[i - 1].sep)));
  const anyCheck = clean.some((r) => r.checked !== undefined);
  let sub = null;
  for (const r of clean) {
    if (r.sep) { menu.appendChild(h('div', { class: 'menu-sep', role: 'separator' })); continue; }
    const btn = h('button', {
      type: 'button', class: `menu-item${r.danger ? ' danger' : ''}${r.submenu ? ' has-sub' : ''}`, role: 'menuitem',
      disabled: !!r.disabled, 'aria-checked': r.checked === undefined ? undefined : String(!!r.checked)
    });
    btn.appendChild(h('span', { class: 'menu-check' }, r.checked ? icon('check') : null));
    if (!anyCheck) btn.firstChild.classList.add('slim');
    btn.appendChild(h('span', { class: 'menu-ic' }, r.icon ? icon(r.icon) : null));
    btn.appendChild(h('span', { class: 'menu-label', text: r.label }));
    if (r.hint) btn.appendChild(h('span', { class: 'menu-hint', text: r.hint }));
    btn.appendChild(h('span', { class: 'menu-key', text: r.shortcut }));
    if (r.submenu) btn.appendChild(h('span', { class: 'menu-arrow' }, icon('chevron-right')));
    const openSub = () => {
      if (sub) { sub.remove(); sub = null; }
      if (!r.submenu || r.disabled) return;
      const list = typeof r.submenu === 'function' ? r.submenu() : r.submenu;
      sub = buildMenu(list, onPick, level + 1);
      document.body.appendChild(sub);
      const br = btn.getBoundingClientRect();
      const sw = sub.offsetWidth, sh = sub.offsetHeight;
      let x = br.right - 2, y = br.top - 5;
      if (x + sw > window.innerWidth - 6) x = br.left - sw + 2;
      if (y + sh > window.innerHeight - 6) y = Math.max(6, window.innerHeight - 6 - sh);
      sub.style.left = `${x}px`;
      sub.style.top = `${y}px`;
      menu._sub = sub;
    };
    btn.addEventListener('pointerenter', () => { btn.focus({ preventScroll: true }); if (r.submenu) openSub(); else if (sub) { sub.remove(); sub = null; } });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (r.disabled) return;
      if (r.submenu) { openSub(); sub?.querySelector('.menu-item:not(:disabled)')?.focus(); return; }
      onPick(r);
    });
    btn._openSub = openSub;
    menu.appendChild(btn);
  }
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll(':scope > .menu-item:not(:disabled)')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'ArrowRight' && document.activeElement?._openSub) {
      e.preventDefault(); document.activeElement._openSub(); menu._sub?.querySelector('.menu-item:not(:disabled)')?.focus();
    } else if (e.key === 'ArrowLeft' && level > 0) { e.preventDefault(); menu.remove(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
  });
  return menu;
}

/**
 * Open a menu at a point or below an anchor.
 * @param {number|HTMLElement} xOrAnchor client x, or an anchor element (drop-down)
 * @param {number|null} y client y (ignored with an anchor)
 * @param {object[]} items MenuItem list
 * @param {{ onClose?: () => void, align?: string }} [opts]
 */
export function openMenu(xOrAnchor, y, items, opts = {}) {
  closeMenus();
  const prevFocus = document.activeElement;
  const pick = (r) => {
    close();
    if (r.run) setTimeout(() => { try { r.run(); } catch (err) { app.reportError(err, r.label); } }, 0);
  };
  const menu = buildMenu(items, pick);
  if (!menu.childElementCount) return null;
  document.body.appendChild(menu);
  if (xOrAnchor instanceof Element) {
    positionPopup(menu, xOrAnchor, { align: opts.align || 'start', gap: 2 });
    xOrAnchor.classList.add('menu-open');
  } else {
    const w = menu.offsetWidth, hgt = menu.offsetHeight;
    let x = xOrAnchor, yy = y;
    if (x + w > window.innerWidth - 6) x = Math.max(6, x - w);
    if (yy + hgt > window.innerHeight - 6) yy = Math.max(6, window.innerHeight - 6 - hgt);
    menu.style.left = `${x}px`;
    menu.style.top = `${yy}px`;
  }
  const onDown = (e) => { if (!e.target.closest('.menu')) close(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); if (prevFocus?.focus) prevFocus.focus({ preventScroll: true }); }
    else if (e.key === 'Tab') { e.preventDefault(); close(); }
  };
  const onBlur = () => close();
  setTimeout(() => {
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onBlur);
  }, 0);
  function close() {
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('resize', onBlur);
    document.querySelectorAll('.menu').forEach((m) => m.remove());
    if (xOrAnchor instanceof Element) xOrAnchor.classList.remove('menu-open');
    if (active && active.menu === menu) active = null;
    if (opts.onClose) opts.onClose();
  }
  active = { menu, close };
  menu.querySelector('.menu-item:not(:disabled)')?.focus({ preventScroll: true });
  return { close };
}

/** app.ui.contextMenu(x, y, items) */
export function contextMenu(x, y, items, opts) {
  return openMenu(x, y, items, opts);
}

/**
 * Items for the canvas context menu: every registry.contextMenu provider, ordered, separated.
 */
export function collectContextItems(ctx) {
  const out = [];
  for (const p of registry.contextMenuList()) {
    let items = [];
    try { items = p.items(ctx) || []; } catch (err) { console.error(`context menu ${p.id} failed`, err); }
    if (items.length) { if (out.length) out.push('-'); out.push(...items); }
  }
  return out;
}
