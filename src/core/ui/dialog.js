// Modal dialogs: dialog({ title, body, fields, buttons }), confirm(), prompt(), alert().
// Dialogs stack, trap focus, close on Esc (resolving null) and submit on Enter.

import { h, esc } from './dom.js';
import { icon } from './icons.js';
import { formatUnit, parseLength, UNITS } from '../units.js';
import { colorPicker, colorSwatchStyle, colorName } from './colorpicker.js';

const stack = [];

function fieldId() { return `f${Math.random().toString(36).slice(2, 9)}`; }

/** Build the control for one field definition. Returns { row, get(): value, validate(): string|null, focusEl } */
function buildField(f, ctx) {
  const id = fieldId();
  const label = f.label ? h('label', { class: 'dlg-label', for: id, text: f.label }) : null;
  let control, get, validate = () => null, focusEl;
  const unit = f.unit || ctx.unit || 'in';
  switch (f.type) {
    case 'checkbox': {
      const input = h('input', { type: 'checkbox', id, checked: !!f.value });
      control = h('label', { class: 'dlg-check' }, input, h('span', { text: f.text || f.label || '' }));
      get = () => input.checked;
      focusEl = input;
      return { row: h('div', { class: `dlg-row dlg-row-check${f.half ? ' half' : ''}` }, control, f.hint ? h('div', { class: 'dlg-hint', text: f.hint }) : null), get, validate, focusEl, name: f.name };
    }
    case 'select': {
      const sel = h('select', { id, class: 'field' });
      for (const o of f.options || []) {
        const opt = typeof o === 'object' ? o : { value: o, label: String(o) };
        if (opt.group) { sel.appendChild(h('option', { disabled: true, text: `— ${opt.group} —` })); continue; }
        sel.appendChild(h('option', { value: String(opt.value), text: opt.label, selected: String(opt.value) === String(f.value) }));
      }
      control = sel;
      get = () => {
        const v = sel.value;
        const match = (f.options || []).find((o) => String(typeof o === 'object' ? o.value : o) === v);
        return match === undefined ? v : typeof match === 'object' ? match.value : match;
      };
      if (f.onChange) sel.addEventListener('change', () => f.onChange(get(), ctx));
      focusEl = sel;
      break;
    }
    case 'radio': {
      const name = id;
      control = h('div', { class: 'dlg-radios', role: 'radiogroup' });
      for (const o of f.options || []) {
        const opt = typeof o === 'object' ? o : { value: o, label: String(o) };
        const input = h('input', { type: 'radio', name, value: String(opt.value), checked: String(opt.value) === String(f.value) });
        control.appendChild(h('label', { class: 'dlg-radio' }, input, opt.icon ? icon(opt.icon) : null, h('span', { text: opt.label })));
        if (f.onChange) input.addEventListener('change', () => f.onChange(get(), ctx));
      }
      get = () => {
        const v = control.querySelector('input:checked')?.value;
        const match = (f.options || []).find((o) => String(typeof o === 'object' ? o.value : o) === v);
        return match === undefined ? v : typeof match === 'object' ? match.value : match;
      };
      focusEl = control.querySelector('input:checked') || control.querySelector('input');
      break;
    }
    case 'textarea': {
      const ta = h('textarea', { id, class: 'field', rows: f.rows || 4, placeholder: f.placeholder || '' });
      ta.value = f.value ?? '';
      control = ta;
      get = () => ta.value;
      focusEl = ta;
      break;
    }
    case 'color': {
      let value = f.value ?? 'transparent';
      const chip = h('span', { class: 'chip' });
      const name = h('span', { class: 'chip-label' });
      const paint = () => { Object.assign(chip.style, colorSwatchStyle(value, ctx.doc)); name.textContent = colorName(value, ctx.doc); };
      const btn = h('button', { type: 'button', id, class: 'swatch-field' }, chip, name, icon('chevron-down', 'caret'));
      btn.addEventListener('click', () => colorPicker(btn, value, (v) => { value = v; paint(); if (f.onChange) f.onChange(v, ctx); }, { allowNone: f.allowNone !== false, doc: ctx.doc }));
      paint();
      control = btn;
      get = () => value;
      focusEl = btn;
      break;
    }
    case 'html': {
      control = typeof f.html === 'string' ? h('div', { class: 'dlg-html', html: f.html }) : f.html;
      get = () => (f.get ? f.get(control) : undefined);
      return { row: h('div', { class: `dlg-row dlg-row-html${f.half ? ' half' : ''}` }, label, control), get, validate: f.validate ? () => f.validate(control) : validate, name: f.name };
    }
    case 'length': {
      const input = h('input', { id, class: 'field num', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: false });
      input.value = Number.isFinite(f.value) ? formatUnit(f.value, unit) : '';
      const wrap = h('div', { class: 'field-unit' }, input, h('i', { text: UNITS[unit]?.label || unit }));
      control = wrap;
      get = () => parseLength(input.value, unit);
      validate = () => {
        const v = get();
        if (!Number.isFinite(v)) return 'Enter a length such as 2.5, 2.5in, 6cm or 72pt';
        if (f.min !== undefined && v < f.min - 1e-6) return `Must be at least ${formatUnit(f.min, unit, true)}`;
        if (f.max !== undefined && v > f.max + 1e-6) return `Must be at most ${formatUnit(f.max, unit, true)}`;
        return null;
      };
      focusEl = input;
      break;
    }
    case 'number': {
      const input = h('input', { id, class: 'field num', type: 'number', step: f.step ?? 'any', min: f.min, max: f.max });
      input.value = f.value ?? '';
      control = f.suffix ? h('div', { class: 'field-unit' }, input, h('i', { text: f.suffix })) : input;
      get = () => parseFloat(input.value);
      validate = () => {
        const v = get();
        if (!Number.isFinite(v)) return 'Enter a number';
        if (f.integer && !Number.isInteger(v)) return 'Enter a whole number';
        if (f.min !== undefined && v < f.min) return `Must be at least ${f.min}`;
        if (f.max !== undefined && v > f.max) return `Must be at most ${f.max}`;
        return null;
      };
      focusEl = input;
      break;
    }
    default: {
      const input = h('input', { id, class: 'field', type: 'text', placeholder: f.placeholder || '', autocomplete: 'off', spellcheck: f.spellcheck ?? false });
      input.value = f.value ?? '';
      control = input;
      get = () => input.value;
      validate = () => (f.required && !input.value.trim() ? `${f.label || 'This field'} is required` : null);
      focusEl = input;
    }
  }
  const err = h('div', { class: 'dlg-error', role: 'alert' });
  const row = h('div', { class: `dlg-row${f.half ? ' half' : ''}` }, label, control, f.hint ? h('div', { class: 'dlg-hint', text: f.hint }) : null, err);
  const v0 = validate;
  return {
    row, get, focusEl, name: f.name,
    validate: () => {
      const msg = v0() || (f.validate ? f.validate(get()) : null);
      err.textContent = msg || '';
      row.classList.toggle('invalid', !!msg);
      return msg;
    }
  };
}

/**
 * Show a modal dialog.
 * @param {{ title: string, body?: string|Node, fields?: object[], buttons?: object[], width?: number,
 *           unit?: string, doc?: object, onRender?: (root: HTMLElement, api: object) => void, className?: string }} opts
 * @returns {Promise<{ button: any, values: object }|null>}
 */
export function dialog(opts) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const ctx = { unit: opts.unit, doc: opts.doc };
    const built = (opts.fields || []).map((f) => buildField(f, ctx));
    const buttons = opts.buttons || [{ label: 'Cancel', value: null }, { label: 'OK', value: 'ok', primary: true }];
    const card = h('div', { class: `dlg ${opts.className || ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || 'Dialog', style: { width: `min(${opts.width || 440}px, calc(100vw - 32px))` } });
    const head = h('div', { class: 'dlg-head' }, h('h2', { text: opts.title || '' }), h('button', { type: 'button', class: 'icon-btn dlg-x', 'aria-label': 'Close', onclick: () => finish(null) }, icon('close')));
    const bodyEl = h('div', { class: 'dlg-body' });
    if (typeof opts.body === 'string') bodyEl.appendChild(h('div', { class: 'dlg-text', html: opts.body }));
    else if (opts.body) bodyEl.appendChild(opts.body);
    if (built.length) bodyEl.appendChild(h('div', { class: 'dlg-fields' }, built.map((b) => b.row)));
    const foot = h('div', { class: 'dlg-foot' });
    for (const b of buttons) {
      const btn = h('button', { type: 'button', class: `btn ${b.primary ? 'btn-primary' : b.danger ? 'btn-danger' : 'btn-ghost'}`, text: b.label, disabled: !!b.disabled });
      if (b.left) btn.classList.add('left');
      btn.addEventListener('click', () => submit(b));
      b._el = btn;
      foot.appendChild(btn);
    }
    card.append(head, bodyEl, foot);
    const backdrop = h('div', { class: 'dlg-backdrop' }, card);
    const values = () => Object.fromEntries(built.filter((b) => b.name).map((b) => [b.name, b.get()]));

    function submit(b) {
      if (b.value !== null && b.value !== undefined && !b.skipValidation) {
        const bad = built.map((x) => x.validate && x.validate()).find(Boolean);
        if (bad) { const first = built.find((x) => x.row && x.row.classList.contains('invalid')); first?.focusEl?.focus(); return; }
      }
      if (b.value === null || b.value === undefined) { finish(null); return; }
      finish({ button: b.value, values: values() });
    }
    function finish(result) {
      document.removeEventListener('keydown', onKey, true);
      backdrop.classList.add('out');
      setTimeout(() => backdrop.remove(), 120);
      stack.splice(stack.indexOf(api), 1);
      if (prevFocus && prevFocus.focus && prevFocus.isConnected) { try { prevFocus.focus({ preventScroll: true }); } catch { /* ignore */ } }
      resolve(result);
    }
    function onKey(e) {
      if (stack[stack.length - 1] !== api) return;
      if (document.querySelector('.color-pop, .menu')) return;   // a popup inside the dialog handles its own keys
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); return; }
      if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
        const primary = buttons.find((b) => b.primary);
        if (primary) { e.preventDefault(); e.stopPropagation(); submit(primary); }
        return;
      }
      if (e.key === 'Tab') {
        const items = [...card.querySelectorAll('button, input, select, textarea, [tabindex="0"]')].filter((x) => !x.disabled && x.offsetParent !== null);
        if (!items.length) return;
        const i = items.indexOf(document.activeElement);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); items[items.length - 1].focus(); }
        else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
      }
    }
    const api = { root: card, values, close: finish, submit: (v) => submit(buttons.find((b) => b.value === v) || { value: v }) };
    stack.push(api);
    document.addEventListener('keydown', onKey, true);
    backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) card.classList.add('nudge'); });
    backdrop.addEventListener('animationend', () => card.classList.remove('nudge'));
    document.body.appendChild(backdrop);
    if (opts.onRender) opts.onRender(card, api);
    const first = built.find((b) => b.focusEl)?.focusEl || buttons.find((b) => b.primary)?._el || card.querySelector('button');
    requestAnimationFrame(() => { first?.focus(); if (first && first.select && first.type === 'text') first.select(); });
  });
}

/** Yes/no confirmation. Resolves true when the OK button is chosen. */
export async function confirm(title, html, ok = 'OK', opts = {}) {
  const r = await dialog({
    title, body: html, width: opts.width || 420,
    buttons: [{ label: opts.cancel || 'Cancel', value: null }, { label: ok, value: 'ok', primary: !opts.danger, danger: !!opts.danger }]
  });
  return !!r;
}

/** Ask for one line of text. Resolves the string, or null when cancelled. */
export async function prompt(title, label, value = '', opts = {}) {
  const r = await dialog({
    title, width: opts.width || 420, body: opts.body,
    fields: [{ name: 'v', label, type: opts.type || 'text', value, required: opts.required, placeholder: opts.placeholder, unit: opts.unit, min: opts.min, max: opts.max }],
    buttons: [{ label: 'Cancel', value: null }, { label: opts.ok || 'OK', value: 'ok', primary: true }]
  });
  return r ? r.values.v : null;
}

/** Information dialog with a single button. */
export async function alert(title, html, ok = 'OK') {
  await dialog({ title, body: html, buttons: [{ label: ok, value: 'ok', primary: true }] });
}

/** True while any dialog is open. */
export function dialogOpen() { return stack.length > 0; }

export { esc };
