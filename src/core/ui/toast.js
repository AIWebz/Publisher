// Toast notifications (bottom centre, stacked, auto-dismissing; optional action button).

import { h } from './dom.js';

let host = null;

function hostEl() {
  if (!host || !host.isConnected) {
    host = h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(host);
  }
  return host;
}

/**
 * Show a toast.
 * @param {string} msg
 * @param {{ label: string, run: () => void }|null} [action]
 * @param {{ timeout?: number, kind?: 'info'|'error'|'success' }} [opts]
 * @returns {() => void} dismiss function
 */
export function toast(msg, action = null, opts = {}) {
  const root = hostEl();
  const el = h('div', { class: `toast ${opts.kind ? `toast-${opts.kind}` : ''}` }, h('span', { class: 'toast-msg', text: String(msg) }));
  let timer = 0;
  const dismiss = () => {
    clearTimeout(timer);
    if (!el.isConnected) return;
    el.classList.add('out');
    setTimeout(() => el.remove(), 180);
  };
  if (action && action.label) {
    el.appendChild(h('button', {
      class: 'toast-action',
      text: action.label,
      onclick: () => { dismiss(); try { action.run(); } catch (err) { console.error(err); } }
    }));
  }
  el.appendChild(h('button', { class: 'toast-x', 'aria-label': 'Dismiss', html: '&times;', onclick: dismiss }));
  root.appendChild(el);
  while (root.children.length > 3) root.firstElementChild.remove();
  const ms = opts.timeout ?? (action ? 7000 : 3200);
  const arm = () => { clearTimeout(timer); timer = setTimeout(dismiss, ms); };
  el.addEventListener('pointerenter', () => clearTimeout(timer));
  el.addEventListener('pointerleave', arm);
  arm();
  return dismiss;
}
