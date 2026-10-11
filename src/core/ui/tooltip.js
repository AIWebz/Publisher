// Rich hover tooltips for any element with data-tip="Title" (+ data-tip-key, data-tip-desc).

import { h } from './dom.js';

let tip = null, timer = 0, current = null;

function show(el) {
  const title = el.dataset.tip;
  if (!title) return;
  if (!tip) {
    tip = h('div', { class: 'tooltip', role: 'tooltip' });
    document.body.appendChild(tip);
  }
  tip.replaceChildren(
    h('div', { class: 'tip-title' }, h('span', { text: title }), el.dataset.tipKey ? h('kbd', { text: el.dataset.tipKey }) : null),
    el.dataset.tipDesc ? h('div', { class: 'tip-desc', text: el.dataset.tipDesc }) : null
  );
  tip.hidden = false;
  const r = el.getBoundingClientRect();
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2;
  let y = r.bottom + 8;
  if (y + th > window.innerHeight - 6) y = r.top - th - 8;
  x = Math.max(6, Math.min(x, window.innerWidth - tw - 6));
  tip.style.left = `${Math.round(x)}px`;
  tip.style.top = `${Math.round(y)}px`;
  tip.classList.add('in');
}

function hide() {
  clearTimeout(timer);
  current = null;
  if (tip) { tip.hidden = true; tip.classList.remove('in'); }
}

/** Install the global tooltip behaviour (call once). */
export function installTooltips() {
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el === current) return;
    hide();
    if (!el || e.pointerType === 'touch') return;
    current = el;
    timer = setTimeout(() => { if (current === el && el.isConnected) show(el); }, tip && !tip.hidden ? 80 : 550);
  });
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', hide, true);
  document.addEventListener('wheel', hide, { passive: true, capture: true });
  window.addEventListener('blur', hide);
}

/** Set tooltip attributes on an element. */
export function setTip(el, title, key = '', desc = '') {
  if (title) el.dataset.tip = title; else delete el.dataset.tip;
  if (key) el.dataset.tipKey = key; else delete el.dataset.tipKey;
  if (desc) el.dataset.tipDesc = desc; else delete el.dataset.tipDesc;
  el.setAttribute('aria-label', title || '');
}
