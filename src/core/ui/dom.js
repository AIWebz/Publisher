// Small DOM helpers shared by the shell, canvas and UI components.

/** Escape text for HTML. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Create an element. attrs: class, style (string|object), dataset (object), on<Event> handlers,
 * html (innerHTML), text, and any other attribute/property. Children may be nodes, strings or arrays.
 * @returns {HTMLElement}
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') {
      if (typeof v === 'string') el.style.cssText = v;
      else Object.assign(el.style, v);
    } else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && typeof v !== 'string' && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

/** querySelector shorthand. */
export const $ = (sel, root = document) => root.querySelector(sel);
/** querySelectorAll as an array. */
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Parse an HTML string into a single element (first element child). */
export function fromHTML(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** Clamp a fixed-position box (w×h) at (x, y) into the viewport, flipping if needed. */
export function placeInViewport(x, y, w, h, margin = 6) {
  const vw = window.innerWidth, vh = window.innerHeight;
  let px = x, py = y;
  if (px + w > vw - margin) px = Math.max(margin, vw - margin - w);
  if (py + h > vh - margin) py = Math.max(margin, vh - margin - h);
  return { x: Math.max(margin, px), y: Math.max(margin, py) };
}

/**
 * Position a fixed popup below (or above) an anchor element/rect.
 * @param {HTMLElement} pop
 * @param {HTMLElement|DOMRect|{x:number,y:number}} anchor
 */
export function positionPopup(pop, anchor, { align = 'start', gap = 4 } = {}) {
  const r = anchor instanceof Element ? anchor.getBoundingClientRect() : ('width' in anchor ? anchor : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0, height: 0 });
  pop.style.left = '0px';
  pop.style.top = '0px';
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  let x = align === 'end' ? r.right - pw : align === 'center' ? r.left + r.width / 2 - pw / 2 : r.left;
  let y = r.bottom + gap;
  if (y + ph > vh - 6 && r.top - gap - ph > 6) y = r.top - gap - ph;
  x = Math.min(Math.max(6, x), vw - pw - 6);
  y = Math.min(Math.max(6, y), vh - ph - 6);
  pop.style.left = `${Math.round(x)}px`;
  pop.style.top = `${Math.round(y)}px`;
}

/** Run fn on the next animation frame, coalescing repeated requests per key. */
const frameJobs = new Map();
export function onFrame(key, fn) {
  if (frameJobs.has(key)) { frameJobs.get(key).fn = fn; return; }
  const job = { fn };
  frameJobs.set(key, job);
  requestAnimationFrame(() => {
    frameJobs.delete(key);
    job.fn();
  });
}

/** Debounce helper. */
export function debounce(fn, ms) {
  let t = 0;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  d.cancel = () => clearTimeout(t);
  d.flush = (...args) => { clearTimeout(t); fn(...args); };
  return d;
}
