// Small form controls for inspector sections and ribbon custom items: length (typed units), number,
// select, colour, checkbox, segmented buttons and a section grid. Each control has set(value) that
// leaves a focused field alone (so typing is never overwritten by a model update) and calls
// onChange(value) when the user commits (Enter / blur / change).

import { h } from './dom.js';
import { icon } from './icons.js';
import { setTip } from './tooltip.js';
import { colorPicker, colorSwatchStyle, colorName } from './colorpicker.js';
import { formatUnit, parseLength, UNITS } from '../units.js';

/** Labelled row: <label> + control. */
export function row(label, control, opts = {}) {
  return h('div', { class: `ins-row${opts.wide ? ' wide' : ''}${opts.className ? ` ${opts.className}` : ''}` }, label ? h('label', { class: 'ins-label', text: label }) : null, control);
}

function commitOnEnter(input, commit) {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); input.select(); }
    if (e.key === 'Escape') { e.preventDefault(); input.dataset.reset = '1'; input.blur(); }
  });
  input.addEventListener('change', commit);
}

/**
 * Length field in document units (accepts typed units: "2.5in", "10mm", "72pt").
 * @param {{ unit: () => string, onChange: (px: number) => void, min?: number, max?: number, title?: string }} o
 */
export function lengthField(o) {
  const input = h('input', { class: 'field num', type: 'text', inputmode: 'decimal', spellcheck: false, autocomplete: 'off' });
  if (o.title) setTip(input, o.title);
  let value = NaN;
  const show = () => { input.value = Number.isFinite(value) ? formatUnit(value, o.unit()) : ''; };
  const commit = () => {
    if (input.dataset.reset) { delete input.dataset.reset; show(); return; }
    let px = parseLength(input.value, o.unit());
    if (!Number.isFinite(px)) { show(); return; }
    if (o.min !== undefined) px = Math.max(o.min, px);
    if (o.max !== undefined) px = Math.min(o.max, px);
    if (Number.isFinite(value) && Math.abs(px - value) < 1e-6) { show(); return; }
    value = px;
    o.onChange(px);
    show();
  };
  commitOnEnter(input, commit);
  input.addEventListener('blur', () => { if (input.dataset.reset) { delete input.dataset.reset; show(); } });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const u = UNITS[o.unit()] || UNITS.in;
    const step = (e.shiftKey ? 10 : 1) * u.step;
    const cur = parseLength(input.value, o.unit());
    const base = Number.isFinite(cur) ? cur : value || 0;
    input.value = formatUnit(base + (e.key === 'ArrowUp' ? 1 : -1) * step / u.perPx, o.unit());
    commit();
  });
  const wrap = h('div', { class: 'field-unit' }, input, h('i', { class: 'unit-label' }));
  return {
    el: wrap, input,
    set(v, mixed = false) {
      value = v;
      wrap.querySelector('.unit-label').textContent = (UNITS[o.unit()] || UNITS.in).label;
      if (document.activeElement === input) return;
      if (mixed) { input.value = ''; input.placeholder = '—'; } else show();
    },
    disable(d) { input.disabled = !!d; }
  };
}

/** Number field with optional suffix (°, %, pt…). */
export function numberField(o) {
  const input = h('input', { class: 'field num', type: 'text', inputmode: 'decimal', spellcheck: false, autocomplete: 'off' });
  if (o.title) setTip(input, o.title);
  let value = NaN;
  const fmt = (v) => (Number.isFinite(v) ? String(Math.round(v * (10 ** (o.digits ?? 1))) / (10 ** (o.digits ?? 1))) : '');
  const commit = () => {
    if (input.dataset.reset) { delete input.dataset.reset; input.value = fmt(value); return; }
    let v = parseFloat(String(input.value).replace(',', '.'));
    if (!Number.isFinite(v)) { input.value = fmt(value); return; }
    if (o.min !== undefined) v = Math.max(o.min, v);
    if (o.max !== undefined) v = Math.min(o.max, v);
    if (o.integer) v = Math.round(v);
    if (v === value) { input.value = fmt(value); return; }
    value = v;
    o.onChange(v);
    input.value = fmt(value);
  };
  commitOnEnter(input, commit);
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const step = (o.step || 1) * (e.shiftKey ? 10 : 1);
    const cur = parseFloat(input.value);
    input.value = fmt((Number.isFinite(cur) ? cur : value || 0) + (e.key === 'ArrowUp' ? step : -step));
    commit();
  });
  const el = o.suffix ? h('div', { class: 'field-unit' }, input, h('i', { text: o.suffix })) : input;
  return {
    el, input,
    set(v, mixed = false) { value = v; if (document.activeElement !== input) { input.value = mixed ? '' : fmt(v); input.placeholder = mixed ? '—' : ''; } },
    disable(d) { input.disabled = !!d; }
  };
}

/** <select> with [{ value, label }] options. */
export function selectField(o) {
  const sel = h('select', { class: 'field' });
  const fill = (opts) => {
    sel.replaceChildren(...opts.map((x) => (typeof x === 'object' ? h('option', { value: String(x.value), text: x.label }) : h('option', { value: String(x), text: String(x) }))));
  };
  fill(o.options || []);
  if (o.title) setTip(sel, o.title);
  sel.addEventListener('change', () => {
    const opt = (o.options || []).find((x) => String(typeof x === 'object' ? x.value : x) === sel.value);
    o.onChange(opt === undefined ? sel.value : typeof opt === 'object' ? opt.value : opt);
  });
  return {
    el: sel,
    set(v) { if (document.activeElement !== sel) sel.value = String(v); },
    setOptions(opts) { o.options = opts; fill(opts); },
    disable(d) { sel.disabled = !!d; }
  };
}

/** Colour button that opens the colour picker. */
export function colorField(o) {
  let value = 'transparent';
  const chip = h('span', { class: 'chip' });
  const name = h('span', { class: 'chip-label' });
  const btn = h('button', { type: 'button', class: 'swatch-field' }, chip, name, icon('chevron-down', 'caret'));
  if (o.title) setTip(btn, o.title);
  btn.addEventListener('click', () => colorPicker(btn, value, (v) => { value = v; paint(); o.onChange(v); }, { allowNone: o.allowNone !== false, doc: o.doc ? o.doc() : undefined, title: o.title }));
  const paint = () => { Object.assign(chip.style, colorSwatchStyle(value)); name.textContent = o.compact ? '' : colorName(value); };
  return { el: btn, set(v) { value = v || 'transparent'; paint(); }, disable(d) { btn.disabled = !!d; } };
}

/** Checkbox with a label. */
export function checkField(o) {
  const input = h('input', { type: 'checkbox' });
  input.addEventListener('change', () => o.onChange(input.checked));
  const el = h('label', { class: 'check' }, input, h('span', { text: o.label || '' }));
  return { el, set(v) { input.checked = !!v; input.indeterminate = v === null; }, disable(d) { input.disabled = !!d; } };
}

/** Segmented icon buttons: [{ value, icon, label }]. */
export function segmented(o) {
  const btns = o.options.map((opt) => {
    const b = h('button', { type: 'button', class: 'seg-btn', dataset: { value: String(opt.value) }, onclick: () => o.onChange(opt.value) }, opt.icon ? icon(opt.icon) : h('span', { text: opt.text || opt.label }));
    setTip(b, opt.label);
    return b;
  });
  const el = h('div', { class: 'seg', role: 'group' }, btns);
  return {
    el,
    set(v) { for (const b of btns) { const on = b.dataset.value === String(v); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); } },
    disable(d) { btns.forEach((b) => { b.disabled = !!d; }); }
  };
}

/** Range slider with a percentage readout. */
export function sliderField(o) {
  const input = h('input', { type: 'range', min: o.min ?? 0, max: o.max ?? 100, step: o.step ?? 1, class: 'slider' });
  const out = h('span', { class: 'slider-val' });
  let dragging = false;
  input.addEventListener('input', () => { out.textContent = `${input.value}${o.suffix || ''}`; if (o.onInput) o.onInput(+input.value); });
  input.addEventListener('pointerdown', () => { dragging = true; });
  input.addEventListener('change', () => { dragging = false; o.onChange(+input.value); });
  return {
    el: h('div', { class: 'slider-wrap' }, input, out),
    set(v) { if (dragging) return; input.value = String(v); out.textContent = `${Math.round(v)}${o.suffix || ''}`; },
    disable(d) { input.disabled = !!d; }
  };
}
