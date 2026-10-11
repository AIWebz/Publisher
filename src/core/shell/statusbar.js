// Status bar: page navigation (Page X of Y), master-page indicator, selection position/size in
// document units, zoom percentage, zoom slider (10–800 %, logarithmic) and fit buttons.

import { app } from '../app.js';
import { h, onFrame } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { setTip } from '../ui/tooltip.js';
import { unionBounds } from '../model.js';
import { formatUnit } from '../units.js';
import { ZOOM_MIN, ZOOM_MAX } from '../canvas/viewport.js';

const toSlider = (z) => Math.round((Math.log(z / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN)) * 1000);
const fromSlider = (v) => ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, v / 1000);

/** Build the status bar into `el`. */
export function buildStatusBar(el) {
  el.classList.add('statusbar');
  const btn = (ic, tip, key, run) => { const b = h('button', { type: 'button', class: 'sb-btn', onclick: run }, icon(ic)); setTip(b, tip, key); return b; };
  const prev = btn('chevron-left', 'Previous page', 'PgUp', () => app.exec('page.prev'));
  const next = btn('chevron-right', 'Next page', 'PgDn', () => app.exec('page.next'));
  const pageLabel = h('button', { type: 'button', class: 'sb-page', onclick: () => app.exec('page.goto') });
  setTip(pageLabel, 'Go to page…');
  const mode = h('span', { class: 'sb-mode' });
  const pos = h('span', { class: 'sb-pos' });
  const size = h('span', { class: 'sb-size' });
  const fitP = btn('fit-page', 'Fit page', 'Ctrl+0', () => app.canvas && app.canvas.fitPage());
  const fitW = btn('fit-width', 'Fit width', '', () => app.canvas && app.canvas.fitWidth());
  const zOut = btn('minus', 'Zoom out', 'Ctrl+-', () => app.canvas && app.canvas.zoomOut());
  const zIn = btn('plus', 'Zoom in', 'Ctrl+=', () => app.canvas && app.canvas.zoomIn());
  const slider = h('input', { type: 'range', class: 'sb-zoom', min: '0', max: '1000', step: '1', 'aria-label': 'Zoom' });
  slider.addEventListener('input', () => app.canvas && app.canvas.zoomTo(fromSlider(+slider.value)));
  const pct = h('button', { type: 'button', class: 'sb-pct', onclick: () => app.exec('view.zoomDialog') });
  setTip(pct, 'Zoom…');
  const left = h('div', { class: 'sb-left' }, prev, pageLabel, next, mode);
  const mid = h('div', { class: 'sb-mid' }, pos, size);
  const right = h('div', { class: 'sb-right' }, fitP, fitW, zOut, slider, zIn, pct);
  el.replaceChildren(left, mid, right);

  const update = () => {
    const s = app.session;
    el.classList.toggle('no-doc', !s);
    if (!s) { pageLabel.textContent = ''; mode.textContent = ''; pos.textContent = ''; size.textContent = ''; pct.textContent = ''; return; }
    const doc = s.doc;
    const u = doc.setup.units;
    if (app.isMasterMode) {
      pageLabel.textContent = `Master Page ${app.master.name}`;
      mode.textContent = 'Editing master pages';
    } else {
      pageLabel.textContent = `Page ${app.pageIndex + 1} of ${doc.pages.length}`;
      mode.textContent = '';
    }
    prev.disabled = app.isMasterMode || app.pageIndex <= 0;
    next.disabled = app.isMasterMode || app.pageIndex >= doc.pages.length - 1;
    const sel = app.selection;
    if (sel.length) {
      const b = sel.length === 1 && !sel[0].rot ? sel[0] : unionBounds(sel);
      pos.textContent = `${formatUnit(b.x, u)}, ${formatUnit(b.y, u)} ${u}`;
      size.textContent = `${formatUnit(b.w, u)} × ${formatUnit(b.h, u)} ${u}${sel.length === 1 && sel[0].rot ? `  ${Math.round(sel[0].rot)}°` : ''}`;
      pos.hidden = size.hidden = false;
    } else {
      pos.hidden = size.hidden = true;
    }
    const z = app.canvas ? app.canvas.zoom : s.view.zoom;
    pct.textContent = `${Math.round(z * 100)}%`;
    if (document.activeElement !== slider) slider.value = String(toSlider(z));
    fitP.classList.toggle('on', s.view.fit === 'page');
    fitW.classList.toggle('on', s.view.fit === 'width');
  };
  const soon = () => onFrame('statusbar', update);
  for (const ev of ['session', 'page', 'view', 'selection', 'doc-change', 'preview']) app.on(ev, soon);
  update();
  return { update };
}
