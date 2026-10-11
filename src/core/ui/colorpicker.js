// Colour picker popover: scheme colours (stored as theme references so they follow scheme
// changes), standard colours, recent custom colours, a custom colour field and "No colour".

import { h, positionPopup } from './dom.js';
import { app } from '../app.js';
import { prefs } from '../prefs.js';
import { SCHEME_KEYS, SCHEME_LABELS, STANDARD_COLORS, resolveColor } from '../theme.js';

let open = null;

/** Close the open colour picker (if any). */
export function closeColorPicker() {
  if (open) open.close();
}

/** Display name of a model colour value. */
export function colorName(v, doc = app.doc) {
  if (!v || v === 'transparent' || v === 'none') return 'No colour';
  if (v[0] === '@') return `${SCHEME_LABELS[v.slice(1)] || v.slice(1)} (scheme)`;
  return v.toUpperCase();
}

/** Inline style for a swatch chip showing a model colour. */
export function colorSwatchStyle(v, doc = app.doc) {
  if (!v || v === 'transparent' || v === 'none') return { background: '', backgroundImage: 'linear-gradient(135deg, transparent 45%, #c0392b 45%, #c0392b 55%, transparent 55%)', backgroundColor: '#fff' };
  return { backgroundImage: 'none', backgroundColor: resolveColor(doc, v) };
}

/**
 * Open the colour picker next to `anchor`.
 * @param {HTMLElement|DOMRect} anchor
 * @param {string} value current model colour
 * @param {(v: string) => void} onPick called with '@key', '#rrggbb' or 'transparent'
 * @param {{ allowNone?: boolean, noneLabel?: string, doc?: object, title?: string }} [opts]
 */
export function colorPicker(anchor, value, onPick, opts = {}) {
  closeColorPicker();
  const doc = opts.doc || app.doc;
  const cur = String(value || '').toLowerCase();
  const pop = h('div', { class: 'popover color-pop', role: 'dialog', 'aria-label': opts.title || 'Colour' });
  const pick = (v) => {
    close();
    if (/^#[0-9a-f]{6}$/i.test(v) && !STANDARD_COLORS.includes(v.toLowerCase())) prefs.addRecentColor(v);
    onPick(v);
  };
  const swatch = (v, title) => {
    const b = h('button', { type: 'button', class: `sw${String(v).toLowerCase() === cur ? ' on' : ''}`, title, 'aria-label': title });
    b.style.background = resolveColor(doc, v);
    b.addEventListener('click', () => pick(v));
    return b;
  };
  if (opts.title) pop.appendChild(h('div', { class: 'pop-title', text: opts.title }));
  pop.appendChild(h('div', { class: 'pop-label', text: 'Scheme colours' }));
  pop.appendChild(h('div', { class: 'swatches scheme' }, SCHEME_KEYS.map((k) => {
    const b = swatch(`@${k}`, `${SCHEME_LABELS[k]} — ${resolveColor(doc, `@${k}`).toUpperCase()}`);
    b.appendChild(h('span', { class: 'sw-name', text: SCHEME_LABELS[k] }));
    return b;
  })));
  pop.appendChild(h('div', { class: 'pop-label', text: 'Standard colours' }));
  pop.appendChild(h('div', { class: 'swatches' }, STANDARD_COLORS.map((c) => swatch(c, c.toUpperCase()))));
  const recent = prefs.get('recentColors') || [];
  if (recent.length) {
    pop.appendChild(h('div', { class: 'pop-label', text: 'Recent colours' }));
    pop.appendChild(h('div', { class: 'swatches' }, recent.map((c) => swatch(c, c.toUpperCase()))));
  }
  const start = /^#[0-9a-f]{6}$/i.test(cur) ? cur : cur.startsWith('@') ? resolveColor(doc, cur) : '#336699';
  const native = h('input', { type: 'color', value: start, 'aria-label': 'Custom colour' });
  const hex = h('input', { type: 'text', class: 'field hex', value: start.toUpperCase(), maxlength: 7, spellcheck: false, 'aria-label': 'Hex colour' });
  const applyHex = () => {
    let v = hex.value.trim();
    if (/^[0-9a-f]{6}$/i.test(v)) v = `#${v}`;
    if (/^#[0-9a-f]{3}$/i.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    if (/^#[0-9a-f]{6}$/i.test(v)) pick(v.toLowerCase());
    else hex.classList.add('invalid');
  };
  native.addEventListener('input', () => { hex.value = native.value.toUpperCase(); hex.classList.remove('invalid'); });
  native.addEventListener('change', () => pick(native.value.toLowerCase()));
  hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyHex(); } });
  const foot = h('div', { class: 'pop-foot' },
    h('label', { class: 'custom-color', title: 'More colours…' }, native, h('span', { text: 'More…' })),
    hex,
    h('button', { type: 'button', class: 'btn btn-ghost sm', text: 'Apply', onclick: applyHex }));
  pop.appendChild(foot);
  if (opts.allowNone !== false) {
    const none = h('button', { type: 'button', class: `btn btn-ghost sm none-btn${cur === 'transparent' || !cur ? ' on' : ''}` }, h('span', { class: 'chip none' }), h('span', { text: opts.noneLabel || 'No colour' }));
    none.addEventListener('click', () => pick('transparent'));
    pop.appendChild(none);
  }
  document.body.appendChild(pop);
  positionPopup(pop, anchor);
  const onDown = (e) => { if (!pop.contains(e.target) && !(anchor instanceof Element && anchor.contains(e.target))) close(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  setTimeout(() => {
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
  }, 0);
  function close() {
    if (!pop.isConnected) return;
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    pop.remove();
    if (open && open.pop === pop) open = null;
  }
  open = { pop, close };
  (pop.querySelector('.sw.on') || pop.querySelector('.sw'))?.focus();
  return { close };
}
