/* ==========================================================================
   Folio Publisher — a desktop publishing studio in the browser
   ========================================================================== */
'use strict';
(() => {

// ---------- Utilities ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const clone = (o) => JSON.parse(JSON.stringify(o));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normAngle = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
const fx = (n) => +n.toFixed(2);

const STORE_KEY = 'folio:doc:v1';
const VIEW_KEY = 'folio:view:v1';

// ---------- Design vocabulary ----------
const SCHEMES = {
  ivory:     { name: 'Ivory & Oxblood', colors: { paper: '#fbf8f1', ink: '#1f1d1a', accent: '#7d2a2a', accent2: '#b08d57', muted: '#6f685e' } },
  midnight:  { name: 'Midnight',        colors: { paper: '#f6f2ea', ink: '#141b2d', accent: '#1f3557', accent2: '#c9a24a', muted: '#68707e' } },
  sage:      { name: 'Sage',            colors: { paper: '#f5f4ee', ink: '#1e2a24', accent: '#4c6a55', accent2: '#c2a878', muted: '#7b8577' } },
  rosewood:  { name: 'Rosewood',        colors: { paper: '#fbf5f1', ink: '#2b1d1f', accent: '#94455a', accent2: '#d6b39c', muted: '#8a7470' } },
  lagoon:    { name: 'Lagoon',          colors: { paper: '#f6f7f3', ink: '#10302e', accent: '#1d5f59', accent2: '#e0a458', muted: '#6c7a78' } },
  plum:      { name: 'Plum & Ochre',    colors: { paper: '#faf6f0', ink: '#251a2b', accent: '#5a3e6b', accent2: '#c99a3b', muted: '#7d7183' } },
  mono:      { name: 'Monochrome',      colors: { paper: '#ffffff', ink: '#141414', accent: '#3d3d3d', accent2: '#a3a3a3', muted: '#767676' } }
};
const SCHEME_LABELS = { paper: 'Paper', ink: 'Ink', accent: 'Accent', accent2: 'Highlight', muted: 'Muted' };

const FONT_SCHEMES = {
  classic:   { name: 'Classic',   heading: 'Cormorant Garamond', body: 'EB Garamond' },
  editorial: { name: 'Editorial', heading: 'Playfair Display',   body: 'Lora' },
  modern:    { name: 'Modern',    heading: 'Fraunces',           body: 'Crimson Pro' },
  didone:    { name: 'Didone',    heading: 'Bodoni Moda',        body: 'Libre Baskerville' },
  display:   { name: 'Display',   heading: 'DM Serif Display',   body: 'Spectral' }
};
const FONTS = ['Bodoni Moda', 'Cormorant Garamond', 'Crimson Pro', 'DM Serif Display', 'EB Garamond', 'Fraunces', 'Libre Baskerville', 'Lora', 'Playfair Display', 'Spectral'];

const SIZES = {
  letter:   { name: 'Letter · 8.5 × 11 in', w: 816, h: 1056 },
  a4:       { name: 'A4 · 210 × 297 mm', w: 794, h: 1123 },
  a5:       { name: 'A5 · 148 × 210 mm', w: 559, h: 794 },
  tabloid:  { name: 'Poster · 11 × 17 in', w: 1056, h: 1632 },
  card:     { name: 'Card · 5 × 7 in', w: 480, h: 672 },
  postcard: { name: 'Postcard · 6 × 4 in', w: 576, h: 384 },
  business: { name: 'Business card · 3.5 × 2 in', w: 336, h: 192 },
  square:   { name: 'Square · 8 × 8 in', w: 768, h: 768 }
};

const STANDARD = ['#ffffff', '#f5f0e6', '#e6dcc8', '#c8bba0', '#8a8270', '#4a4740', '#2a2824', '#111111',
                  '#7a2e2e', '#a8553a', '#c9a046', '#5b7a4a', '#2f5d57', '#2c4a6e', '#5a3e6b', '#b5677d'];
const FONT_STEPS = [6, 7, 8, 9, 10, 10.5, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 54, 60, 72, 80, 96, 120, 144, 180, 240];
const SHAPES = ['rect', 'ellipse', 'triangle', 'star'];
const TYPE_NAMES = { text: 'Text Box', image: 'Picture', rect: 'Rectangle', ellipse: 'Ellipse', triangle: 'Triangle', star: 'Star', line: 'Line' };

// ---------- State ----------
let doc = null;
let ctxDoc = null;            // document used for colour/font resolution while rendering
let pageIndex = 0;
let selId = null;
let editingId = null;
let editStart = '';
let zoom = 1;
let fitMode = true;
let clipboard = null;
let pickMode = 'insert';
let popTarget = null;
let modalResolve = null;
let installEvt = null;
const desktop = window.folioDesktop || null;   // present when running as the Windows desktop app
let filePath = null;                           // desktop: file this publication was opened from / saved to
let savedHash = null;                          // fingerprint of the document as last written to that file
const hist = { stack: [], index: -1 };
const view = Object.assign({ margins: true, grid: false, snap: true, theme: 'system' }, readJSON(VIEW_KEY));

function readJSON(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }

// ---------- Model helpers ----------
function makeEl(type) {
  const e = { id: uid(), type, x: 0, y: 0, w: 200, h: 120, rot: 0, opacity: 1, fill: 'transparent', stroke: '@ink', strokeWidth: 0, radius: 0 };
  switch (type) {
    case 'text':
      Object.assign(e, { html: 'Your text here', font: '@body', size: 14, color: '@ink', bold: false, italic: false, underline: false,
        caps: false, align: 'left', valign: 'top', lineHeight: 1.35, letterSpacing: 0, padding: 4 });
      break;
    case 'image': Object.assign(e, { src: '', fit: 'cover' }); break;
    case 'line': Object.assign(e, { h: 16, strokeWidth: 2, cap: 'none' }); delete e.fill; delete e.radius; break;
    default: e.fill = '@accent';
  }
  return e;
}
const TX = (x, y, w, h, html, o = {}) => Object.assign(makeEl('text'), { x, y, w, h, html }, o);
const SH = (type, x, y, w, h, o = {}) => Object.assign(makeEl(type), { x, y, w, h }, o);
const newPage = (elements = [], bg = '@paper') => ({ id: uid(), bg, elements });

function normalize(d) {
  const n = {
    title: d.title || 'Untitled publication',
    w: +d.w || 816, h: +d.h || 1056,
    schemeName: d.schemeName || 'ivory',
    scheme: Object.assign({}, SCHEMES.ivory.colors, d.scheme || SCHEMES[d.schemeName]?.colors),
    fontScheme: FONT_SCHEMES[d.fontScheme] ? d.fontScheme : 'classic',
    pages: (d.pages && d.pages.length ? d.pages : [newPage()]).map((p) => ({
      id: p.id || uid(), bg: p.bg || '@paper',
      elements: (p.elements || []).filter((e) => TYPE_NAMES[e.type]).map((e) => Object.assign(makeEl(e.type), e, { id: e.id || uid() }))
    }))
  };
  return n;
}

const page = () => doc.pages[pageIndex];
const findEl = (id) => page().elements.find((e) => e.id === id);
const selected = () => (selId ? findEl(selId) : null);
const nodeOf = (id) => $(`#page-content [data-id="${id}"]`);
const margin = (d = doc) => Math.round(Math.min(d.w, d.h) * 0.06);

function col(v) {
  if (!v || v === 'transparent') return 'transparent';
  if (v[0] === '@') return (ctxDoc || doc).scheme[v.slice(1)] || '#000';
  return v;
}
function fontOf(v) {
  const fs = FONT_SCHEMES[(ctxDoc || doc).fontScheme] || FONT_SCHEMES.classic;
  if (v === '@heading') return fs.heading;
  if (v === '@body') return fs.body;
  return v;
}
function withDoc(d, fn) { const prev = ctxDoc; ctxDoc = d; try { return fn(); } finally { ctxDoc = prev; } }

// ---------- Templates ----------
const TEMPLATES = {
  blank: { name: 'Blank Page', meta: 'Letter · portrait', build: () => ({ title: 'Untitled publication', ...SIZES.letter, schemeName: 'ivory', fontScheme: 'classic', pages: [newPage()] }) },

  flyer: { name: 'Event Flyer', meta: 'Letter · Midnight · Didone', build: () => ({
    title: 'An Evening of Jazz', ...SIZES.letter, schemeName: 'midnight', fontScheme: 'didone',
    pages: [newPage([
      SH('rect', 0, 0, 816, 440, { fill: '@accent' }),
      TX(80, 78, 656, 30, 'The Hartwell Society presents', { size: 11, color: '@accent2', align: 'center', caps: true, letterSpacing: 4 }),
      TX(60, 122, 696, 200, 'An Evening<br>of Jazz', { font: '@heading', size: 62, color: '@paper', align: 'center', lineHeight: 1.02 }),
      SH('line', 348, 334, 120, 12, { stroke: '@accent2', strokeWidth: 1.5, cap: 'diamond' }),
      TX(80, 362, 656, 40, 'Saturday, the fourteenth of November', { italic: true, size: 17, color: '@paper', align: 'center' }),
      SH('star', 396, 484, 24, 24, { fill: '@accent2' }),
      TX(118, 534, 580, 170, 'Join us beneath the chandeliers for a night of standards, small plates and good company. The Linden Quartet takes the stage at eight o’clock, with dancing until late.', { size: 14, align: 'center', lineHeight: 1.7 }),
      TX(80, 742, 200, 110, '<b>When</b><br>Seven until eleven<br>Doors at half past six', { align: 'center', size: 11.5, lineHeight: 1.6 }),
      TX(308, 742, 200, 110, '<b>Where</b><br>The Linden Room<br>42 Mercer Street', { align: 'center', size: 11.5, lineHeight: 1.6 }),
      TX(536, 742, 200, 110, '<b>Tickets</b><br>$45 · Members $30<br>hartwell.example', { align: 'center', size: 11.5, lineHeight: 1.6 }),
      SH('line', 80, 902, 656, 12, { stroke: '@muted', strokeWidth: 0.75 }),
      TX(80, 926, 656, 40, 'Black tie optional · Kindly reply by the first of November', { align: 'center', italic: true, size: 12, color: '@muted' })
    ])]
  }) },

  newsletter: { name: 'Newsletter', meta: 'Letter · Sage · Editorial', build: () => ({
    title: 'The Garden Ledger', ...SIZES.letter, schemeName: 'sage', fontScheme: 'editorial',
    pages: [newPage([
      TX(60, 46, 696, 86, 'The Garden Ledger', { font: '@heading', size: 50, align: 'center', lineHeight: 1.1 }),
      SH('line', 60, 140, 696, 8, { stroke: '@ink', strokeWidth: 2 }),
      TX(60, 150, 696, 26, 'Volume IV · Autumn Edition · Published Quarterly', { align: 'center', caps: true, size: 9, letterSpacing: 3, color: '@muted', valign: 'middle' }),
      SH('line', 60, 178, 696, 8, { stroke: '@ink', strokeWidth: 0.75 }),
      SH('image', 60, 206, 696, 290, { radius: 2 }),
      TX(60, 510, 696, 56, 'The Quiet Art of Putting a Garden to Bed', { font: '@heading', size: 27, lineHeight: 1.15 }),
      TX(60, 566, 696, 26, 'By Margaret Ellis · Photographs by Tom Avery', { italic: true, size: 11, color: '@accent' }),
      TX(60, 606, 334, 360, 'As the first frost settles over the beds, there is a particular satisfaction in the slow work of autumn. Seed heads are left standing for the finches; tender bulbs are lifted, dried and wrapped in newspaper; the last of the dahlias are cut for the kitchen table.<br><br>We spoke with three local growers about the rituals that carry their gardens through the dark months — and the small habits that make spring arrive a little sooner.', { size: 10.5, lineHeight: 1.6, align: 'justify' }),
      TX(422, 606, 334, 230, '“Leave the borders a little untidy,” says Ruth Okafor, who has kept the same allotment for thirty-one years. “The insects need somewhere to sleep, and frankly so do I.”<br><br>Her advice: mulch generously, label everything, and resist the urge to prune until February.', { size: 10.5, lineHeight: 1.6, align: 'justify' }),
      SH('rect', 422, 850, 334, 116, { fill: '@accent', opacity: 0.1, radius: 2 }),
      TX(438, 862, 302, 92, '<i>In this issue</i><br>Winter sowing · 3 &nbsp; Seed swap · 5 &nbsp; Recipes from the plot · 6', { size: 10.5, lineHeight: 1.6, color: '@accent', valign: 'middle' }),
      SH('line', 60, 990, 696, 8, { stroke: '@muted', strokeWidth: 0.5 }),
      TX(60, 1000, 696, 24, 'The Garden Ledger · gardenledger.example', { size: 9, color: '@muted', align: 'center', italic: true })
    ])]
  }) },

  invitation: { name: 'Invitation', meta: '5 × 7 in · Midnight · Classic', build: () => ({
    title: 'Wedding Invitation', ...SIZES.card, schemeName: 'midnight', fontScheme: 'classic',
    pages: [newPage([
      SH('rect', 26, 26, 428, 620, { fill: 'transparent', stroke: '@accent2', strokeWidth: 1.25 }),
      SH('rect', 34, 34, 412, 604, { fill: 'transparent', stroke: '@accent2', strokeWidth: 0.5 }),
      TX(50, 92, 380, 30, 'Together with their families', { caps: true, letterSpacing: 3, size: 8.5, align: 'center', color: '@muted', valign: 'middle' }),
      TX(50, 146, 380, 190, 'Isabel<br><i>&amp;</i><br>Thomas', { font: '@heading', size: 40, align: 'center', lineHeight: 1.12, color: '@accent' }),
      SH('line', 180, 350, 120, 12, { stroke: '@accent2', strokeWidth: 1, cap: 'diamond' }),
      TX(50, 380, 380, 70, 'request the pleasure of your company<br>at the celebration of their marriage', { italic: true, size: 12, align: 'center', lineHeight: 1.6 }),
      TX(50, 466, 380, 90, 'Saturday, the twelfth of June<br>at four o’clock in the afternoon<br>Rosecliff Gardens, Newport', { size: 11, align: 'center', lineHeight: 1.75 }),
      TX(50, 576, 380, 30, 'Reception to follow', { italic: true, size: 10.5, align: 'center', color: '@muted' })
    ])]
  }) },

  greeting: { name: 'Greeting Card', meta: '5 × 7 in · Rosewood · Display', build: () => ({
    title: 'Thank You Card', ...SIZES.card, schemeName: 'rosewood', fontScheme: 'display',
    pages: [
      newPage([
        SH('rect', 24, 24, 432, 624, { fill: 'transparent', stroke: '@accent2', strokeWidth: 1 }),
        SH('ellipse', 140, 192, 200, 200, { fill: '@accent2', opacity: 0.35 }),
        TX(40, 226, 400, 136, 'With<br>Gratitude', { font: '@heading', italic: true, size: 42, align: 'center', color: '@accent', lineHeight: 1.05 }),
        SH('star', 228, 448, 24, 24, { fill: '@accent' }),
        TX(40, 560, 400, 30, 'for all that you do', { italic: true, align: 'center', size: 13, color: '@muted' })
      ]),
      newPage([
        TX(64, 180, 352, 280, 'Dear friend,<br><br>Thank you for your kindness, your patience, and the many small things you never needed to do. They were noticed, and they mattered.<br><br>With warmest regards,', { size: 12.5, lineHeight: 1.65 }),
        TX(64, 470, 352, 50, 'Clara', { font: '@heading', italic: true, size: 26, color: '@accent' })
      ])
    ]
  }) },

  poster: { name: 'Lecture Poster', meta: '11 × 17 in · Lagoon · Modern', build: () => ({
    title: 'Ideas Worth Keeping', ...SIZES.tabloid, schemeName: 'lagoon', fontScheme: 'modern',
    pages: [newPage([
      TX(90, 120, 876, 40, 'Spring Lecture Series · 2027', { caps: true, letterSpacing: 5, size: 14, color: '@accent2' }),
      TX(80, 180, 900, 620, 'Ideas<br>Worth<br><i>Keeping</i>', { font: '@heading', size: 150, lineHeight: 0.98, color: '@paper' }),
      SH('ellipse', 700, 830, 270, 270, { fill: '@accent2' }),
      TX(90, 870, 560, 220, 'Six evenings with writers, historians and makers on the craft of making things that last.', { size: 24, lineHeight: 1.4, color: '@paper' }),
      SH('line', 90, 1300, 876, 12, { stroke: '@paper', strokeWidth: 1.5, opacity: 0.6 }),
      TX(90, 1334, 420, 150, '<b>Thursdays at seven</b><br>March 4 – April 8<br>Founders Hall, Room 210', { size: 16, lineHeight: 1.6, color: '@paper' }),
      TX(546, 1334, 420, 150, 'Free and open to all<br>Reserve a seat at<br><i>lectures.example.edu</i>', { size: 16, lineHeight: 1.6, color: '@paper', align: 'right' })
    ], '@accent')]
  }) },

  postcard: { name: 'Postcard', meta: '6 × 4 in · Sage · Editorial', build: () => ({
    title: 'Greetings from the Coast', ...SIZES.postcard, schemeName: 'sage', fontScheme: 'editorial',
    pages: [newPage([
      SH('rect', 0, 0, 250, 384, { fill: '@accent' }),
      TX(24, 44, 210, 200, 'Greetings<br>from the<br><i>Coast</i>', { font: '@heading', size: 29, color: '@paper', lineHeight: 1.12 }),
      SH('star', 28, 316, 22, 22, { fill: '@accent2' }),
      TX(278, 40, 186, 190, 'Wish you were here — the light this time of year is extraordinary, and the bakery on the harbour still makes those cardamom buns.', { size: 10.5, italic: true, lineHeight: 1.6 }),
      SH('rect', 480, 24, 72, 88, { fill: 'transparent', stroke: '@muted', strokeWidth: 1 }),
      SH('line', 278, 262, 274, 10, { stroke: '@muted', strokeWidth: 0.75 }),
      SH('line', 278, 296, 274, 10, { stroke: '@muted', strokeWidth: 0.75 }),
      SH('line', 278, 330, 274, 10, { stroke: '@muted', strokeWidth: 0.75 })
    ])]
  }) },

  business: { name: 'Business Card', meta: '3.5 × 2 in · Ivory · Classic', build: () => ({
    title: 'Vance Bindery Cards', ...SIZES.business, schemeName: 'ivory', fontScheme: 'classic',
    pages: [
      newPage([
        TX(0, 56, 336, 46, 'Eleanor Vance', { font: '@heading', size: 22, color: '@paper', align: 'center' }),
        SH('line', 138, 104, 60, 10, { stroke: '@accent2', strokeWidth: 1, cap: 'diamond' }),
        TX(0, 118, 336, 24, 'Bookbinder &amp; Restorer', { italic: true, size: 9.5, color: '@accent2', align: 'center' })
      ], '@ink'),
      newPage([
        TX(20, 20, 296, 32, 'Vance Bindery', { font: '@heading', size: 15, bold: true }),
        SH('line', 24, 52, 44, 8, { stroke: '@accent', strokeWidth: 1.25 }),
        TX(20, 96, 296, 80, 'eleanor@vancebindery.example<br>+1 (555) 014 2290<br>18 Orchard Lane, Hudson', { size: 8.5, lineHeight: 1.65, color: '@muted' })
      ])
    ]
  }) }
};

function buildTemplate(key) { return normalize(TEMPLATES[key].build()); }

// ---------- Rendering ----------
function shapeSVG(el) {
  const w = el.w, h = el.h, sw = +el.strokeWidth || 0, i = sw / 2;
  const fill = col(el.fill), stroke = sw ? col(el.stroke) : 'none';
  let inner = '';
  switch (el.type) {
    case 'rect': {
      const r = Math.min(el.radius || 0, (w - sw) / 2, (h - sw) / 2);
      inner = `<rect x="${i}" y="${i}" width="${fx(Math.max(0, w - sw))}" height="${fx(Math.max(0, h - sw))}" rx="${fx(Math.max(0, r))}"/>`;
      break;
    }
    case 'ellipse':
      inner = `<ellipse cx="${fx(w / 2)}" cy="${fx(h / 2)}" rx="${fx(Math.max(0, w / 2 - i))}" ry="${fx(Math.max(0, h / 2 - i))}"/>`;
      break;
    case 'triangle':
      inner = `<polygon points="${fx(w / 2)},${i} ${fx(w - i)},${fx(h - i)} ${i},${fx(h - i)}"/>`;
      break;
    case 'star': {
      const pts = [];
      for (let k = 0; k < 10; k++) {
        const r = k % 2 ? 0.42 : 1, a = -Math.PI / 2 + (k * Math.PI) / 5;
        pts.push(`${fx(w / 2 + Math.cos(a) * (w / 2 - i) * r)},${fx(h / 2 + 0.06 * h + Math.sin(a) * (h / 2 - i) * r)}`);
      }
      inner = `<polygon points="${pts.join(' ')}"/>`;
      break;
    }
    case 'line': {
      const y = fx(h / 2), c = col(el.stroke), lw = Math.max(sw, 0.25);
      if (el.cap === 'diamond') {
        const d = Math.max(4, Math.min(h / 2, 3 + lw * 2.5)), g = d * 1.8;
        inner = `<g style="stroke:${c};stroke-width:${lw};fill:none"><line x1="0" y1="${y}" x2="${fx(w / 2 - g)}" y2="${y}"/><line x1="${fx(w / 2 + g)}" y1="${y}" x2="${w}" y2="${y}"/></g>` +
          `<polygon style="fill:${c}" points="${fx(w / 2)},${fx(h / 2 - d)} ${fx(w / 2 + d)},${y} ${fx(w / 2)},${fx(h / 2 + d)} ${fx(w / 2 - d)},${y}"/>`;
      } else {
        inner = `<line style="stroke:${c};stroke-width:${lw}" x1="0" y1="${y}" x2="${w}" y2="${y}"/>`;
      }
      return `<svg class="shape" viewBox="0 0 ${fx(w)} ${fx(h)}" preserveAspectRatio="none">${inner}</svg>`;
    }
  }
  return `<svg class="shape" viewBox="0 0 ${fx(w)} ${fx(h)}" preserveAspectRatio="none"><g style="fill:${fill};stroke:${stroke};stroke-width:${sw}">${inner}</g></svg>`;
}

function paint(node, el) {
  node.className = 'el el-' + el.type + (editingId === el.id ? ' editing' : '');
  const s = node.style;
  s.left = el.x + 'px'; s.top = el.y + 'px'; s.width = el.w + 'px'; s.height = el.h + 'px';
  s.transform = el.rot ? `rotate(${el.rot}deg)` : '';
  s.opacity = el.opacity;

  if (el.type === 'text' || el.type === 'image') {
    s.background = col(el.fill);
    s.border = el.strokeWidth > 0 ? `${el.strokeWidth}px solid ${col(el.stroke)}` : 'none';
    s.borderRadius = (el.radius || 0) + 'px';
  }
  if (el.type === 'text') {
    s.padding = el.padding + 'px';
    s.justifyContent = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[el.valign] || 'flex-start';
    let tx = node.firstElementChild;
    if (!tx) { tx = document.createElement('div'); tx.className = 'tx'; node.appendChild(tx); }
    if (editingId !== el.id) tx.innerHTML = el.html;
    Object.assign(tx.style, {
      fontFamily: `"${fontOf(el.font)}", Georgia, serif`,
      fontSize: el.size + 'pt',
      color: col(el.color),
      fontWeight: el.bold ? '700' : '400',
      fontStyle: el.italic ? 'italic' : 'normal',
      textDecoration: el.underline ? 'underline' : 'none',
      textTransform: el.caps ? 'uppercase' : 'none',
      textAlign: el.align,
      lineHeight: el.lineHeight,
      letterSpacing: el.letterSpacing + 'px'
    });
  } else if (el.type === 'image') {
    if (el.src) {
      let img = node.querySelector('img');
      if (!img) { img = document.createElement('img'); img.alt = ''; img.draggable = false; node.replaceChildren(img); }
      if (img.getAttribute('src') !== el.src) img.src = el.src;
      img.style.objectFit = el.fit;
    } else if (!node.querySelector('.placeholder')) {
      node.innerHTML = '<div class="placeholder"><svg><use href="#i-image"/></svg><span>Double-click to add a picture</span></div>';
    }
  } else {
    node.innerHTML = shapeSVG(el);
  }
}

function createNode(el) {
  const n = document.createElement('div');
  n.dataset.id = el.id;
  paint(n, el);
  return n;
}

function renderPageInto(container, p, d = doc) {
  withDoc(d, () => {
    container.style.width = d.w + 'px';
    container.style.height = d.h + 'px';
    container.style.background = col(p.bg);
    container.replaceChildren(...p.elements.map(createNode));
  });
}

const stage = $('#stage'), sizer = $('#sizer'), pageEl = $('#page'), content = $('#page-content');

function applyZoom() {
  const pad = 48;
  if (fitMode) {
    const z = Math.min((stage.clientWidth - pad * 2) / doc.w, (stage.clientHeight - pad * 2) / doc.h);
    zoom = clamp(z, 0.1, 4);
  }
  const w = doc.w * zoom, h = doc.h * zoom;
  sizer.style.width = w + 'px';
  sizer.style.height = h + 'px';
  sizer.style.marginTop = Math.max(pad, (stage.clientHeight - h) / 2) + 'px';
  sizer.style.marginBottom = pad + 'px';
  sizer.style.marginLeft = sizer.style.marginRight = w + pad * 2 > stage.clientWidth ? pad + 'px' : 'auto';
  pageEl.style.width = doc.w + 'px';
  pageEl.style.height = doc.h + 'px';
  pageEl.style.transform = `scale(${zoom})`;
  pageEl.style.setProperty('--z', zoom);
  const m = margin();
  Object.assign($('.margin-guide').style, { left: m + 'px', top: m + 'px', width: doc.w - 2 * m + 'px', height: doc.h - 2 * m + 'px' });
  $('#zoom-range').value = Math.round(zoom * 100);
  $('#zoom-label').textContent = Math.round(zoom * 100) + '%';
}

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const dark = view.theme === 'dark' || (view.theme === 'system' && darkQuery.matches);
  document.documentElement.classList.toggle('dark', dark);
  $$('[data-theme-set]').forEach((b) => b.classList.toggle('on', b.dataset.themeSet === view.theme));
}
darkQuery.addEventListener('change', applyTheme);

function applyView() {
  if (desktop) desktop.setTheme(view.theme);
  applyTheme();
  pageEl.classList.toggle('show-margins', view.margins);
  pageEl.classList.toggle('show-grid', view.grid);
  $$('[data-view]').forEach((b) => b.classList.toggle('on', !!view[b.dataset.view]));
  try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch {}
}

function renderCanvas() {
  editingId = null;
  renderPageInto(content, page());
  updateSel();
}

function renderAll() {
  applyZoom();
  renderCanvas();
  renderThumbs();
  renderGalleries();
  populateFontSelects();
  populatePageSizes();
  syncUI();
  updateStatus();
  $('#doc-title').value = doc.title;
  updateDocState();
}

function updateSel() {
  const el = selected(), s = $('#sel');
  if (!el) { s.hidden = true; return; }
  s.hidden = false;
  Object.assign(s.style, { left: el.x + 'px', top: el.y + 'px', width: el.w + 'px', height: el.h + 'px', transform: el.rot ? `rotate(${el.rot}deg)` : '' });
  s.classList.toggle('is-line', el.type === 'line');
  s.classList.toggle('editing', editingId === el.id);
}

function refreshEl(el) {
  const n = nodeOf(el.id);
  if (n) paint(n, el);
  updateSel();
  queueThumb();
}

// ---------- Thumbnails ----------
function thumbScale() { const s = Math.min(140 / doc.w, 180 / doc.h); return { s, w: doc.w * s, h: doc.h * s }; }

function renderThumbs() {
  const ol = $('#thumbs');
  const { s, w, h } = thumbScale();
  ol.replaceChildren(...doc.pages.map((p, i) => {
    const li = document.createElement('li');
    li.className = 'thumb' + (i === pageIndex ? ' active' : '');
    li.dataset.index = i;
    const frame = document.createElement('div');
    frame.className = 'thumb-frame';
    frame.style.width = w + 'px'; frame.style.height = h + 'px';
    const pc = document.createElement('div');
    pc.className = 'page-content';
    renderPageInto(pc, p);
    pc.style.transform = `scale(${s})`;
    const tools = document.createElement('div');
    tools.className = 'thumb-tools';
    tools.innerHTML = `<button data-thumb="dup" title="Duplicate page"><svg><use href="#i-duplicate"/></svg></button>` +
      (doc.pages.length > 1 ? `<button data-thumb="del" class="danger" title="Delete page"><svg><use href="#i-trash"/></svg></button>` : '');
    frame.append(pc, tools);
    const num = document.createElement('span');
    num.className = 'thumb-num';
    num.textContent = i + 1;
    li.append(frame, num);
    return li;
  }));
}

let thumbTimer = 0;
function queueThumb() {
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => {
    const pc = $(`#thumbs .thumb[data-index="${pageIndex}"] .page-content`);
    if (pc) renderPageInto(pc, page());
  }, 220);
}

$('#thumbs').addEventListener('click', (e) => {
  const li = e.target.closest('.thumb');
  if (!li) return;
  const i = +li.dataset.index;
  const act = e.target.closest('[data-thumb]')?.dataset.thumb;
  if (act === 'dup') return duplicatePage(i);
  if (act === 'del') return deletePage(i);
  goPage(i);
});

function goPage(i) {
  stopEditing();
  pageIndex = clamp(i, 0, doc.pages.length - 1);
  selId = null;
  renderCanvas();
  $$('#thumbs .thumb').forEach((t, k) => t.classList.toggle('active', k === pageIndex));
  $(`#thumbs .thumb[data-index="${pageIndex}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  syncUI();
  updateStatus();
}

// ---------- History & persistence ----------
function snapshot() { return JSON.stringify({ doc, pageIndex }); }

function resetHistory() { hist.stack = [snapshot()]; hist.index = 0; updateUndo(); }

function commit() {
  hist.stack = hist.stack.slice(0, hist.index + 1);
  hist.stack.push(snapshot());
  if (hist.stack.length > 80) hist.stack.shift();
  hist.index = hist.stack.length - 1;
  updateUndo();
  scheduleSave();
  queueThumb();
  syncUI();
  updateStatus();
  updateDocState();
}

function restore(s) {
  const o = JSON.parse(s);
  doc = o.doc;
  pageIndex = clamp(o.pageIndex, 0, doc.pages.length - 1);
  if (selId && !findEl(selId)) selId = null;
  editingId = null;
  renderAll();
  scheduleSave();
  updateUndo();
}
function undo() { stopEditing(); if (hist.index > 0) restore(hist.stack[--hist.index]); }
function redo() { stopEditing(); if (hist.index < hist.stack.length - 1) restore(hist.stack[++hist.index]); }
function updateUndo() {
  $('#btn-undo').disabled = hist.index <= 0;
  $('#btn-redo').disabled = hist.index >= hist.stack.length - 1;
}

function hashStr(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + ':' + str.length;
}
const docHash = () => hashStr(JSON.stringify(doc));
const fileName = () => (filePath ? filePath.split(/[\\/]/).pop() : '');
const hasWork = () => doc.pages.length > 1 || doc.pages.some((p) => p.elements.length);
const isDirty = () => !!filePath && docHash() !== savedHash;

function savedLabel() {
  if (filePath) return isDirty() ? 'Unsaved changes' : `Saved to ${fileName()}`;
  return desktop ? 'Kept automatically' : 'All changes saved';
}
function updateDocState() {
  if (!doc) return;
  const dirty = isDirty();
  document.title = `${dirty ? '• ' : ''}${filePath ? fileName() : doc.title} — Folio Publisher`;
  if (desktop) desktop.setDocState(dirty, filePath ? fileName() : doc.title);
  $('#save-state').textContent = savedLabel();
}

let saveTimer = 0;
function scheduleSave() {
  if (!filePath) $('#save-state').textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveLocal, 500);
}
function saveLocal() {
  clearTimeout(saveTimer);
  const data = JSON.stringify({ doc, pageIndex, filePath, savedHash });
  if (desktop) {
    desktop.autosave(data)
      .then(() => { $('#save-state').textContent = savedLabel(); })
      .catch(() => { $('#save-state').textContent = 'Autosave failed — use Save'; });
    return;
  }
  try {
    localStorage.setItem(STORE_KEY, data);
    $('#save-state').textContent = savedLabel();
  } catch {
    $('#save-state').textContent = 'Too large to autosave — use Save a Copy';
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden && doc) saveLocal(); });
window.addEventListener('beforeunload', () => { if (doc) saveLocal(); });

function loadDoc(d, { keepPage = false, path = null, hash } = {}) {
  doc = normalize(d);
  if (!keepPage) pageIndex = 0;
  pageIndex = clamp(pageIndex, 0, doc.pages.length - 1);
  filePath = path || null;
  savedHash = hash !== undefined ? hash : (filePath ? docHash() : null);
  selId = null; editingId = null; fitMode = true;
  renderAll();
  resetHistory();
  scheduleSave();
}

// Ask before throwing away work that only lives in this window.
async function confirmReplace() {
  if (isDirty()) {
    return confirmModal('Discard unsaved changes?', `Changes to “${esc(fileName())}” have not been saved to the file.`, 'Discard changes');
  }
  if (!filePath && hasWork()) {
    return confirmModal('Replace this publication?', `“${esc(doc.title)}” has not been saved to a file. Use <em>Save</em> first if you would like to keep it.`, 'Replace');
  }
  return true;
}

// ---------- Inspector / ribbon sync ----------
function selTags(el) {
  if (!el) return ['none'];
  const t = ['el', el.type];
  if (SHAPES.includes(el.type)) t.push('shape');
  if (['rect', 'text', 'image'].includes(el.type)) t.push('rounded');
  return t;
}

function colorLabel(v) {
  if (!v || v === 'transparent') return 'None';
  if (v[0] === '@') return SCHEME_LABELS[v.slice(1)] || v;
  return v.toUpperCase();
}

function syncUI(except) {
  const el = selected();
  const tags = selTags(el);

  $$('#inspector [data-show]').forEach((s) => { s.hidden = !s.dataset.show.split(' ').some((x) => tags.includes(x)); });
  $('#insp-title').textContent = el ? TYPE_NAMES[el.type] : 'Page';

  $$('[data-prop]').forEach((c) => {
    if (c === except) return;
    const obj = c.dataset.scope === 'page' ? page() : el;
    const prop = c.dataset.prop;
    const has = !!obj && prop in obj;
    c.disabled = !has;
    if (!has) { if (c.tagName !== 'SELECT') c.value = ''; return; }
    let v = obj[prop];
    if (c.dataset.unit === 'in') v = (v / 96).toFixed(2);
    else if (c.dataset.unit === 'pct') v = Math.round(v * 100);
    if (c.tagName === 'SELECT' && prop === 'font' && ![...c.options].some((o) => o.value === v)) {
      c.add(new Option(v, v));
    }
    c.value = String(v);
  });

  $$('[data-toggle]').forEach((b) => {
    const has = !!el && b.dataset.toggle in el;
    b.disabled = !has;
    b.classList.toggle('on', has && !!el[b.dataset.toggle]);
  });
  $$('[data-set]').forEach((b) => {
    const has = !!el && b.dataset.set in el;
    b.disabled = !has;
    b.classList.toggle('on', has && el[b.dataset.set] === b.dataset.value);
  });
  $$('[data-color]').forEach((b) => {
    const obj = b.dataset.scope === 'page' ? page() : el;
    const has = !!obj && b.dataset.color in obj;
    b.disabled = !has;
    const v = has ? obj[b.dataset.color] : null;
    const chip = b.querySelector('.chip');
    if (chip) {
      if (!v || v === 'transparent') { chip.dataset.none = ''; chip.style.background = ''; }
      else { delete chip.dataset.none; chip.style.background = col(v); }
    }
    const lab = b.querySelector('.chip-label');
    if (lab) lab.textContent = has ? colorLabel(v) : '—';
  });

  const needsSel = ['cut', 'copy', 'duplicate', 'delete', 'front', 'back', 'forward', 'backward', 'align-page', 'rotate', 'grow', 'shrink', 'replace-image'];
  $$('[data-cmd]').forEach((b) => {
    if (needsSel.includes(b.dataset.cmd)) b.disabled = !el || ((b.dataset.cmd === 'grow' || b.dataset.cmd === 'shrink') && el.type !== 'text');
  });
  $$('[data-cmd="orient"]').forEach((b) => b.classList.toggle('on', (doc.w > doc.h) === (b.dataset.value === 'landscape')));

  $('#stat-pages').textContent = doc.pages.length;
  $('#stat-objects').textContent = doc.pages.reduce((n, p) => n + p.elements.length, 0);
  $('#stat-scheme').textContent = `${SCHEMES[doc.schemeName]?.name || 'Custom'} · ${FONT_SCHEMES[doc.fontScheme].name}`;
  $$('[data-pagesize]').forEach((s) => { s.value = sizeKey(); });
}

function updateStatus() {
  $('#status-page').textContent = `Page ${pageIndex + 1} of ${doc.pages.length}`;
  const k = sizeKey();
  $('#status-size').textContent = k !== 'custom' ? SIZES[k].name.split(' · ')[0] + (doc.w > doc.h && SIZES[k].w < SIZES[k].h ? ' (landscape)' : '') : `${fx(doc.w / 96)} × ${fx(doc.h / 96)} in`;
  const el = selected();
  $('#status-sel').textContent = el ? `${TYPE_NAMES[el.type]} · ${fx(el.w / 96)} × ${fx(el.h / 96)} in` : 'No selection';
}

function populateFontSelects() {
  const fs = FONT_SCHEMES[doc.fontScheme];
  const html = `<optgroup label="Theme fonts"><option value="@heading">Headings · ${fs.heading}</option><option value="@body">Body · ${fs.body}</option></optgroup>` +
    `<optgroup label="All fonts">${FONTS.map((f) => `<option value="${f}" style="font-family:'${f}'">${f}</option>`).join('')}</optgroup>`;
  $$('select[data-prop="font"]').forEach((s) => { s.innerHTML = html; });
}

function sizeKey() {
  return Object.keys(SIZES).find((k) => {
    const s = SIZES[k];
    return (s.w === doc.w && s.h === doc.h) || (s.w === doc.h && s.h === doc.w);
  }) || 'custom';
}

function populatePageSizes() {
  const opts = Object.entries(SIZES).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('') +
    (sizeKey() === 'custom' ? `<option value="custom">Custom · ${fx(doc.w / 96)} × ${fx(doc.h / 96)} in</option>` : '');
  $$('[data-pagesize]').forEach((s) => { s.innerHTML = opts; s.value = sizeKey(); });
}

function renderGalleries() {
  $('#scheme-gallery').innerHTML = Object.entries(SCHEMES).map(([k, s]) =>
    `<button class="scheme-card${doc.schemeName === k ? ' on' : ''}" data-scheme="${k}" title="${s.name}">` +
    `<div class="scheme-strip">${['paper', 'ink', 'accent', 'accent2', 'muted'].map((c) => `<i style="background:${s.colors[c]}"></i>`).join('')}</div>` +
    `<span>${s.name}</span></button>`).join('');
  $('#font-gallery').innerHTML = Object.entries(FONT_SCHEMES).map(([k, f]) =>
    `<button class="font-card${doc.fontScheme === k ? ' on' : ''}" data-fontscheme="${k}" title="${f.heading} & ${f.body}">` +
    `<b style="font-family:'${f.heading}'">Aa</b><span>${f.name}</span></button>`).join('');
}

// ---------- Property binding ----------
function readControl(t) {
  const numeric = t.type === 'number' || t.type === 'range' || 'num' in t.dataset;
  let v = numeric ? parseFloat(t.value) : t.value;
  if (numeric && !Number.isFinite(v)) return undefined;
  if (t.dataset.unit === 'in') v = Math.round(v * 96 * 10) / 10;
  if (t.dataset.unit === 'pct') v = clamp(v / 100, 0, 1);
  if ((t.dataset.prop === 'w' || t.dataset.prop === 'h') && v < 4) v = 4;
  if (t.dataset.prop === 'size') v = clamp(v, 1, 999);
  return v;
}

function applyProp(t, doCommit) {
  const v = readControl(t);
  if (v === undefined) return;
  const el = selected();
  if (!el || !(t.dataset.prop in el)) return;
  el[t.dataset.prop] = v;
  refreshEl(el);
  if (doCommit) commit(); else syncUI(t);
}

document.addEventListener('input', (e) => {
  const t = e.target.closest('[data-prop]');
  if (t) applyProp(t, false);
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.closest('[data-prop]')) return applyProp(t.closest('[data-prop]'), true);
  if (t.matches('[data-pagesize]')) return setPageSize(t.value);
  if (t.id === 'doc-title') {
    doc.title = t.value.trim() || 'Untitled publication';
    t.value = doc.title;
    commit();
  }
});
$('#doc-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

// ---------- Editing text ----------
function startEditing(id) {
  const el = findEl(id);
  if (!el || el.type !== 'text') return;
  if (selId !== id) select(id);
  editingId = id;
  editStart = el.html;
  const n = nodeOf(id);
  paint(n, el);
  const tx = n.querySelector('.tx');
  tx.contentEditable = 'true';
  tx.spellcheck = true;
  tx.focus();
  const r = document.createRange();
  r.selectNodeContents(tx);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
  updateSel();
}

function stopEditing() {
  if (!editingId) return;
  const id = editingId;
  editingId = null;
  const el = findEl(id), n = nodeOf(id);
  if (n && el) {
    const tx = n.querySelector('.tx');
    tx.contentEditable = 'false';
    el.html = tx.innerHTML;
    paint(n, el);
  }
  getSelection().removeAllRanges();
  updateSel();
  if (el && el.html !== editStart) commit();
}

content.addEventListener('input', (e) => {
  if (!editingId) return;
  const el = findEl(editingId);
  if (el && e.target.classList.contains('tx')) { el.html = e.target.innerHTML; scheduleSave(); queueThumb(); }
});

// ---------- Selection & pointer interaction ----------
function select(id) {
  if (editingId && editingId !== id) stopEditing();
  selId = id;
  updateSel();
  syncUI();
  updateStatus();
}

function toPage(e) {
  const r = pageEl.getBoundingClientRect();
  return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
}

pageEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 && e.button !== 2) return;
  hideMenus();
  const h = e.target.closest('.h');
  if (h && e.button === 0) { e.preventDefault(); e.stopPropagation(); startTransform(e, h.dataset.dir); return; }
  const n = e.target.closest('#page-content .el');
  if (n && n.dataset.id === editingId) return;
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  if (editingId) stopEditing();
  if (!n) { select(null); return; }
  if (selId !== n.dataset.id) select(n.dataset.id);
  if (e.button === 0) { e.preventDefault(); startTransform(e, 'move'); }
});

stage.addEventListener('pointerdown', (e) => {
  if (pageEl.contains(e.target)) return;
  hideMenus();
  stopEditing();
  select(null);
});

pageEl.addEventListener('dblclick', (e) => {
  const n = e.target.closest('#page-content .el');
  if (!n) return;
  const el = findEl(n.dataset.id);
  if (el?.type === 'text') startEditing(el.id);
  else if (el?.type === 'image') pickImage('replace');
});

function startTransform(e, mode) {
  const el = selected();
  if (!el) return;
  const start = { ...el };
  const p0 = toPage(e);
  const a = (el.rot * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  let moved = false;

  const onMove = (ev) => {
    const p = toPage(ev);
    const dx = p.x - p0.x, dy = p.y - p0.y;
    if (!moved) { if (mode !== 'rot' && Math.hypot(dx, dy) * zoom < 3) return; moved = true; }

    if (mode === 'move') {
      let nx = start.x + dx, ny = start.y + dy;
      if (view.snap && !ev.altKey) {
        const s = snapMove(nx, ny, el.w, el.h, el.id);
        nx = s.x; ny = s.y; showSnap(s.gx, s.gy);
      }
      el.x = Math.round(nx); el.y = Math.round(ny);
    } else if (mode === 'rot') {
      const cx = start.x + start.w / 2, cy = start.y + start.h / 2;
      let ang = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
      if (ev.shiftKey) ang = Math.round(ang / 15) * 15;
      else { const r = Math.round(ang / 90) * 90; if (Math.abs(ang - r) < 4) ang = r; }
      el.rot = normAngle(Math.round(ang));
    } else {
      const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
      const { w, h } = start;
      let nw = w, nh = h;
      if (mode.includes('e')) nw = w + lx;
      if (mode.includes('w')) nw = w - lx;
      if (mode.includes('s')) nh = h + ly;
      if (mode.includes('n')) nh = h - ly;
      nw = Math.max(8, nw); nh = Math.max(8, nh);
      const keep = mode.length === 2 && (el.type === 'image' ? !ev.shiftKey : ev.shiftKey);
      if (keep) { const r = w / h; if (nw / w > nh / h) nh = nw / r; else nw = nh * r; }
      const ox = mode.includes('w') ? w - nw : 0, oy = mode.includes('n') ? h - nh : 0;
      const lcx = ox + nw / 2 - w / 2, lcy = oy + nh / 2 - h / 2;
      const cx = start.x + w / 2 + lcx * cos - lcy * sin;
      const cy = start.y + h / 2 + lcx * sin + lcy * cos;
      el.w = Math.round(nw); el.h = Math.round(nh);
      el.x = Math.round(cx - nw / 2); el.y = Math.round(cy - nh / 2);
    }
    const n = nodeOf(el.id);
    if (n) paint(n, el);
    updateSel();
    updateStatus();
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    showSnap(null, null);
    if (moved) commit();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

function snapMove(x, y, w, h, id) {
  const T = 6 / zoom;
  const xs = [0, doc.w / 2, doc.w], ys = [0, doc.h / 2, doc.h];
  if (view.margins) { const m = margin(); xs.push(m, doc.w - m); ys.push(m, doc.h - m); }
  for (const o of page().elements) {
    if (o.id === id) continue;
    xs.push(o.x, o.x + o.w / 2, o.x + o.w);
    ys.push(o.y, o.y + o.h / 2, o.y + o.h);
  }
  const best = (pos, size, targets) => {
    let b = null;
    for (const off of [0, size / 2, size]) for (const t of targets) {
      const d = t - (pos + off);
      if (Math.abs(d) < T && (!b || Math.abs(d) < Math.abs(b.d))) b = { d, t };
    }
    return b;
  };
  const bx = best(x, w, xs), by = best(y, h, ys);
  return { x: x + (bx ? bx.d : 0), y: y + (by ? by.d : 0), gx: bx ? bx.t : null, gy: by ? by.t : null };
}

function showSnap(gx, gy) {
  const v = $('#snap-v'), h = $('#snap-h');
  v.hidden = gx == null; h.hidden = gy == null;
  if (gx != null) v.style.left = gx + 'px';
  if (gy != null) h.style.top = gy + 'px';
}

// ---------- Element operations ----------
let cascade = 0;
function placeCenter(w, h) {
  const off = (cascade++ % 6) * 14;
  return { x: Math.round((doc.w - w) / 2 + off), y: Math.round((doc.h - h) / 2 + off) };
}

function addElement(el, edit = false) {
  stopEditing();
  page().elements.push(el);
  content.appendChild(createNode(el));
  select(el.id);
  commit();
  if (edit) startEditing(el.id);
}

const small = () => doc.w < 520;

function addText(o = {}) {
  const w = Math.round(Math.min(380, doc.w * 0.6)), h = small() ? 40 : 70;
  addElement(Object.assign(makeEl('text'), placeCenter(w, h), { w, h, size: small() ? 10 : 14 }, o), true);
}

const commands = {
  undo, redo,
  backstage: openBackstage,
  'close-backstage': closeBackstage,
  'open-file': () => openFromDisk(),
  'save-file': () => saveFile(),
  'save-as': () => saveFile(true),
  print: printDoc,
  'export-pdf': () => exportPDF(),
  install: installApp,
  'close-modal': () => closeModal(false),

  'add-text': () => addText(),
  'add-heading': () => {
    const size = small() ? 20 : 40, w = Math.round(doc.w * 0.75), h = Math.round(size * 1.333 * 1.25 + 10);
    addText({ html: 'A Fine Heading', font: '@heading', size, w, h, lineHeight: 1.1, ...placeCenter(w, h) });
  },
  'add-quote': () => {
    const w = Math.round(doc.w * 0.6), h = small() ? 60 : 110;
    addText({ html: '“A well-made page is a quiet pleasure.”', font: '@heading', italic: true, size: small() ? 14 : 24, align: 'center', valign: 'middle', color: '@accent', lineHeight: 1.25, w, h, ...placeCenter(w, h) });
  },
  'add-image': () => pickImage('insert'),
  'add-placeholder': () => {
    const w = Math.round(doc.w * 0.5), h = Math.round(Math.min(doc.h * 0.3, w * 0.66));
    addElement(Object.assign(makeEl('image'), placeCenter(w, h), { w, h }));
  },
  'add-shape': (b) => {
    const k = b.dataset.shape;
    const base = Math.round(Math.min(doc.w, doc.h) * 0.25);
    let el;
    if (k === 'line' || k === 'ornament') {
      const w = Math.round(doc.w * 0.4);
      el = Object.assign(makeEl('line'), placeCenter(w, 16), { w, h: 16, strokeWidth: k === 'ornament' ? 1.25 : 2, cap: k === 'ornament' ? 'diamond' : 'none', stroke: k === 'ornament' ? '@accent2' : '@ink' });
    } else {
      const type = k === 'rounded' ? 'rect' : k;
      el = Object.assign(makeEl(type), placeCenter(base, base), { w: base, h: base, radius: k === 'rounded' ? Math.round(base * 0.12) : 0, fill: k === 'star' ? '@accent2' : '@accent' });
    }
    addElement(el);
  },
  'add-page': () => {
    stopEditing();
    doc.pages.splice(pageIndex + 1, 0, newPage());
    pageIndex++; selId = null;
    renderCanvas(); renderThumbs(); commit();
  },
  'dup-page': () => duplicatePage(pageIndex),

  cut: () => { commands.copy(); deleteSel(); },
  copy: () => { const el = selected(); if (el) { clipboard = clone(el); toast('Copied'); } },
  paste: () => pasteInternal(),
  duplicate: () => {
    const el = selected();
    if (el) addElement(Object.assign(clone(el), { id: uid(), x: el.x + 16, y: el.y + 16 }));
  },
  delete: () => deleteSel(),

  front: () => reorder((arr, i) => arr.push(arr.splice(i, 1)[0])),
  back: () => reorder((arr, i) => arr.unshift(arr.splice(i, 1)[0])),
  forward: () => reorder((arr, i) => { if (i < arr.length - 1) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; }),
  backward: () => reorder((arr, i) => { if (i > 0) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]]; }),
  'align-page': (b) => {
    const el = selected(); if (!el) return;
    const v = b.dataset.value;
    if (v === 'left') el.x = 0;
    if (v === 'center') el.x = Math.round((doc.w - el.w) / 2);
    if (v === 'right') el.x = doc.w - el.w;
    if (v === 'top') el.y = 0;
    if (v === 'middle') el.y = Math.round((doc.h - el.h) / 2);
    if (v === 'bottom') el.y = doc.h - el.h;
    refreshEl(el); commit();
  },
  rotate: (b) => { const el = selected(); if (el) { el.rot = normAngle(el.rot + +b.dataset.value); refreshEl(el); commit(); } },
  grow: () => stepFont(1),
  shrink: () => stepFont(-1),
  'replace-image': () => pickImage('replace'),
  orient: (b) => setOrientation(b.dataset.value),

  'zoom-in': () => setZoom(zoom * 1.2),
  'zoom-out': () => setZoom(zoom / 1.2),
  'zoom-fit': () => { fitMode = true; applyZoom(); },
  'zoom-100': () => setZoom(1)
};

function stepFont(dir) {
  const el = selected();
  if (!el || el.type !== 'text') return;
  el.size = dir > 0 ? (FONT_STEPS.find((s) => s > el.size) || el.size + 12) : ([...FONT_STEPS].reverse().find((s) => s < el.size) || Math.max(1, el.size - 1));
  refreshEl(el); commit();
}

function reorder(fn) {
  const el = selected(); if (!el) return;
  stopEditing();
  const arr = page().elements;
  fn(arr, arr.indexOf(el));
  renderCanvas(); commit();
}

function deleteSel() {
  const el = selected(); if (!el) return;
  stopEditing();
  const arr = page().elements;
  arr.splice(arr.indexOf(el), 1);
  nodeOf(el.id)?.remove();
  select(null);
  commit();
}

function pasteInternal() {
  if (!clipboard) { toast('Nothing to paste yet — copy an object first'); return; }
  clipboard.x += 16; clipboard.y += 16;
  addElement(Object.assign(clone(clipboard), { id: uid() }));
}

function duplicatePage(i) {
  stopEditing();
  const p = clone(doc.pages[i]);
  p.id = uid();
  p.elements.forEach((e) => { e.id = uid(); });
  doc.pages.splice(i + 1, 0, p);
  pageIndex = i + 1; selId = null;
  renderCanvas(); renderThumbs(); commit();
  toast('Page duplicated');
}

function deletePage(i) {
  if (doc.pages.length < 2) return;
  stopEditing();
  doc.pages.splice(i, 1);
  pageIndex = clamp(pageIndex >= i ? pageIndex - 1 : pageIndex, 0, doc.pages.length - 1);
  selId = null;
  renderCanvas(); renderThumbs(); commit();
  toast('Page deleted — press Ctrl+Z to undo');
}

function setPageSize(key) {
  if (!SIZES[key]) return;
  const s = SIZES[key];
  const landscape = doc.w > doc.h, natLandscape = s.w > s.h;
  [doc.w, doc.h] = landscape === natLandscape || s.w === s.h ? [s.w, s.h] : [s.h, s.w];
  fitMode = true;
  populatePageSizes(); renderAll(); commit();
}

function setOrientation(o) {
  if ((o === 'landscape') === (doc.w > doc.h) || doc.w === doc.h) return;
  [doc.w, doc.h] = [doc.h, doc.w];
  fitMode = true;
  renderAll(); commit();
}

function setZoom(z) { fitMode = false; zoom = clamp(z, 0.1, 4); applyZoom(); }

// ---------- Pictures ----------
function pickImage(mode) { pickMode = mode; $('#file-image').value = ''; $('#file-image').click(); }

$('#file-image').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) insertImageFile(f);
});

function readAsDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}

async function prepareImage(file) {
  const raw = await readAsDataURL(file);
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = raw; });
  let w = img.naturalWidth || 400, h = img.naturalHeight || 300;
  if (/svg|gif/.test(file.type)) return { src: raw, w, h };
  const k = Math.min(1, 2000 / Math.max(w, h));
  if (k === 1 && file.size < 1.2e6) return { src: raw, w, h };
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const png = file.type === 'image/png';
  return { src: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.88), w: c.width, h: c.height };
}

async function insertImageFile(file, at) {
  let data;
  try { data = await prepareImage(file); } catch { toast('That picture could not be opened'); return; }
  const el = selected();
  if (pickMode === 'replace' && el?.type === 'image') {
    el.src = data.src; refreshEl(el); commit();
  } else {
    const k = Math.min(1, (doc.w * 0.6) / data.w, (doc.h * 0.6) / data.h);
    const w = Math.round(data.w * k), h = Math.round(data.h * k);
    const pos = at ? { x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2) } : placeCenter(w, h);
    addElement(Object.assign(makeEl('image'), pos, { w, h, src: data.src }));
  }
  pickMode = 'insert';
}

stage.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
stage.addEventListener('drop', (e) => {
  const pub = [...e.dataTransfer.files].find((x) => /\.(folio|json)$/i.test(x.name));
  if (pub) { e.preventDefault(); openFileObject(pub); return; }
  const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
  if (!f) return;
  e.preventDefault();
  pickMode = 'insert';
  insertImageFile(f, toPage(e));
});

// ---------- Colour popover ----------
const pop = $('#colorpop');
function openColorPop(btn) {
  const scope = btn.dataset.scope, prop = btn.dataset.color;
  const obj = scope === 'page' ? page() : selected();
  if (!obj) return;
  popTarget = { scope, prop, id: selId, btn };
  const cur = obj[prop];
  $('#pop-scheme').innerHTML = Object.keys(SCHEME_LABELS).map((k) =>
    `<button data-pop-color="@${k}" title="${SCHEME_LABELS[k]}" class="${cur === '@' + k ? 'on' : ''}" style="background:${doc.scheme[k]}"></button>`).join('');
  $('#pop-standard').innerHTML = STANDARD.map((c) =>
    `<button data-pop-color="${c}" title="${c}" class="${cur === c ? 'on' : ''}" style="background:${c}"></button>`).join('');
  $('#pop-custom').value = /^#[0-9a-f]{6}$/i.test(col(cur)) ? col(cur) : '#7d2a2a';
  pop.hidden = false;
  const r = btn.getBoundingClientRect(), ph = pop.offsetHeight;
  pop.style.left = clamp(r.left, 8, innerWidth - pop.offsetWidth - 8) + 'px';
  pop.style.top = (r.bottom + 6 + ph > innerHeight ? Math.max(8, r.top - ph - 6) : r.bottom + 6) + 'px';
}
function setColor(v, doCommit = true) {
  if (!popTarget) return;
  if (popTarget.scope === 'page') {
    page().bg = v;
    content.style.background = col(v);
    queueThumb();
  } else {
    const el = findEl(popTarget.id);
    if (!el) return;
    el[popTarget.prop] = v;
    if ((popTarget.prop === 'stroke') && !el.strokeWidth && v !== 'transparent') el.strokeWidth = el.type === 'line' ? 2 : 1;
    refreshEl(el);
  }
  if (doCommit) { commit(); hidePop(); } else syncUI();
}
pop.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pop-color]');
  if (b) setColor(b.dataset.popColor);
});
$('#pop-custom').addEventListener('input', (e) => setColor(e.target.value, false));
$('#pop-custom').addEventListener('change', (e) => setColor(e.target.value, true));
function hidePop() { pop.hidden = true; }

// ---------- Context menu ----------
const ctx = $('#ctxmenu');
pageEl.addEventListener('contextmenu', (e) => {
  if (editingId && e.target.closest('.editing')) return;
  e.preventDefault();
  ctx.hidden = false;
  const has = !!selected();
  $$('button', ctx).forEach((b) => { b.disabled = b.dataset.cmd === 'paste' ? !clipboard : !has; });
  ctx.style.left = clamp(e.clientX, 4, innerWidth - ctx.offsetWidth - 4) + 'px';
  ctx.style.top = clamp(e.clientY, 4, innerHeight - ctx.offsetHeight - 4) + 'px';
});
function hideMenus() { ctx.hidden = true; hidePop(); }

// ---------- Global click routing ----------
document.addEventListener('mousedown', (e) => {
  // Keep the text caret when using toolbar buttons while editing.
  if (e.target.closest('.rb, .seg button, .icon-btn, .swatches button, [data-pop-color]')) e.preventDefault();
});

document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('#colorpop, [data-color]')) hidePop();
  if (!e.target.closest('#ctxmenu')) ctx.hidden = true;
}, true);

document.addEventListener('click', (e) => {
  const cmdBtn = e.target.closest('[data-cmd]');
  if (cmdBtn && !cmdBtn.disabled) {
    commands[cmdBtn.dataset.cmd]?.(cmdBtn, e);
    if (cmdBtn.closest('#ctxmenu')) ctx.hidden = true;
    return;
  }
  const tg = e.target.closest('[data-toggle]');
  if (tg && !tg.disabled) {
    const el = selected();
    if (el) { el[tg.dataset.toggle] = !el[tg.dataset.toggle]; refreshEl(el); commit(); }
    return;
  }
  const st = e.target.closest('[data-set]');
  if (st && !st.disabled) {
    const el = selected();
    if (el) { el[st.dataset.set] = st.dataset.value; refreshEl(el); commit(); }
    return;
  }
  const cb = e.target.closest('[data-color]');
  if (cb && !cb.disabled) { if (!pop.hidden && popTarget?.btn === cb) hidePop(); else openColorPop(cb); return; }
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    $$('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === tab.dataset.tab));
    return;
  }
  const th = e.target.closest('[data-theme-set]');
  if (th) { view.theme = th.dataset.themeSet; applyView(); return; }
  const vb = e.target.closest('[data-view]');
  if (vb) { view[vb.dataset.view] = !view[vb.dataset.view]; applyView(); return; }
  const sc = e.target.closest('[data-scheme]');
  if (sc) {
    doc.schemeName = sc.dataset.scheme;
    doc.scheme = { ...SCHEMES[sc.dataset.scheme].colors };
    stopEditing(); renderCanvas(); renderThumbs(); renderGalleries(); commit();
    return;
  }
  const fs = e.target.closest('[data-fontscheme]');
  if (fs) {
    doc.fontScheme = fs.dataset.fontscheme;
    stopEditing(); populateFontSelects(); renderCanvas(); renderThumbs(); renderGalleries(); commit();
    return;
  }
  const tpl = e.target.closest('[data-template]');
  if (tpl) { useTemplate(tpl.dataset.template); return; }
  const m = e.target.closest('[data-m]');
  if (m) { closeModal(m.dataset.m === '1'); return; }
  if (e.target.id === 'modal') closeModal(false);
});

// ---------- Keyboard & clipboard ----------
const isField = (t) => t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName));

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === 's') { e.preventDefault(); saveFile(e.shiftKey); return; }
  if (mod && k === 'p') { e.preventDefault(); printDoc(); return; }
  if (mod && k === 'o') { e.preventDefault(); openFromDisk(); return; }
  if (mod && k === 'n') { e.preventDefault(); openBackstage(); return; }
  if (e.key === 'Escape') {
    if (!$('#modal').hidden) return closeModal(false);
    if (!pop.hidden || !ctx.hidden) return hideMenus();
    if (!$('#backstage').hidden) return closeBackstage();
    if (editingId) { stopEditing(); return; }
    select(null);
    return;
  }
  if (editingId || isField(e.target) || !$('#backstage').hidden || !$('#modal').hidden) return;

  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k === 'y') { e.preventDefault(); redo(); return; }
  if (mod && k === 'c') { commands.copy(); return; }
  if (mod && k === 'x') { commands.cut(); return; }
  if (mod && k === 'd') { e.preventDefault(); commands.duplicate(); return; }
  if (mod && (k === '=' || k === '+')) { e.preventDefault(); commands['zoom-in'](); return; }
  if (mod && k === '-') { e.preventDefault(); commands['zoom-out'](); return; }
  if (mod && k === '0') { e.preventDefault(); commands['zoom-fit'](); return; }
  const el = selected();
  if (mod && ['b', 'i', 'u'].includes(k) && el?.type === 'text') {
    e.preventDefault();
    const p = { b: 'bold', i: 'italic', u: 'underline' }[k];
    el[p] = !el[p]; refreshEl(el); commit();
    return;
  }
  if (e.key === 'PageDown') { e.preventDefault(); goPage(pageIndex + 1); return; }
  if (e.key === 'PageUp') { e.preventDefault(); goPage(pageIndex - 1); return; }
  if (!el) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSel(); return; }
  if (e.key === 'Enter' && el.type === 'text') { e.preventDefault(); startEditing(el.id); return; }
  const step = e.shiftKey ? 10 : 1;
  const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (mv) { e.preventDefault(); el.x += mv[0]; el.y += mv[1]; refreshEl(el); commit(); }
});

document.addEventListener('paste', (e) => {
  if (editingId) {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    return;
  }
  if (isField(e.target) || !$('#backstage').hidden) return;
  const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
  if (file) { e.preventDefault(); pickMode = 'insert'; insertImageFile(file); return; }
  if (clipboard) { e.preventDefault(); pasteInternal(); return; }
  const t = e.clipboardData?.getData('text/plain');
  if (t) { e.preventDefault(); addText({ html: esc(t).replace(/\n/g, '<br>') }); stopEditing(); }
});

stage.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
}, { passive: false });

$('#zoom-range').addEventListener('input', (e) => setZoom(e.target.value / 100));
window.addEventListener('resize', () => { if (fitMode) applyZoom(); hideMenus(); });

// ---------- Files, print ----------
async function saveFile(saveAs = false) {
  stopEditing();
  const data = JSON.stringify({ app: 'folio', version: 1, ...doc });
  if (desktop) {
    try {
      const r = await desktop.saveFile({ path: filePath, data, suggestedName: doc.title, saveAs: saveAs === true });
      if (!r) return false;
      filePath = r.path;
      savedHash = docHash();
      updateDocState();
      saveLocal();
      toast(`Saved to ${r.name}`);
      return true;
    } catch (err) {
      toast(`Could not save — ${err.message || err}`);
      return false;
    }
  }
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (doc.title.replace(/[^\w\- ]+/g, '').trim() || 'publication') + '.folio';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Saved a copy to your downloads');
  return true;
}

function openText(text, path) {
  let d;
  try {
    d = JSON.parse(text);
    if (!d || !Array.isArray(d.pages)) throw new Error('not a publication');
  } catch {
    toast('That file is not a Folio publication');
    return false;
  }
  loadDoc(d, { path });
  closeBackstage();
  toast(`Opened “${doc.title}”`);
  return true;
}

async function openFileObject(f) {
  if (!(await confirmReplace())) return;
  if (desktop) {
    try {
      const r = await desktop.openDropped(f);
      if (r) { openText(r.text, r.path); return; }
    } catch {}
  }
  openText(await f.text(), null);
}

async function openFromDisk() {
  if (!desktop) { $('#file-open').click(); return; }
  if (!(await confirmReplace())) return;
  try {
    const r = await desktop.openFile();
    if (r) openText(r.text, r.path);
  } catch (err) {
    toast(`Could not open that file — ${err.message || err}`);
  }
}

$('#file-open').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openFileObject(f); });
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async (params) => {
    const h = params.files && params.files[0];
    if (h) openFileObject(await h.getFile());
  });
}

function preparePrint() {
  stopEditing();
  const root = $('#print-root');
  root.replaceChildren(...doc.pages.map((p) => { const pc = document.createElement('div'); pc.className = 'page-content'; renderPageInto(pc, p); return pc; }));
  let st = $('#print-page-style');
  if (!st) { st = document.createElement('style'); st.id = 'print-page-style'; document.head.appendChild(st); }
  st.textContent = `@page { size: ${doc.w / 96}in ${doc.h / 96}in; margin: 0; } .print-root .placeholder { visibility: hidden; }`;
}

function printDoc() {
  preparePrint();
  document.fonts.ready.then(() => setTimeout(() => window.print(), 60));
}

async function exportPDF() {
  if (!desktop) { printDoc(); return; }
  preparePrint();
  await document.fonts.ready;
  try {
    const r = await desktop.exportPDF({ suggestedName: doc.title, width: doc.w, height: doc.h });
    if (r) toast(`Exported ${r.name}`, { label: 'Show in folder', run: () => desktop.showExport() });
  } catch (err) {
    toast(`PDF export failed — ${err.message || err}`);
  }
}

// ---------- Backstage ----------
function openBackstage() {
  stopEditing();
  hideMenus();
  const where = filePath ? esc(fileName()) : desktop ? 'kept automatically' : 'saved in this browser';
  $('#bs-continue').innerHTML = hasWork() || filePath
    ? `<button class="continue-card" data-cmd="close-backstage"><svg><use href="#i-page"/></svg><div><strong>Continue “${esc(doc.title)}”</strong><span>${doc.pages.length} page${doc.pages.length > 1 ? 's' : ''} · ${where}</span></div></button>`
    : '';
  const box = $('#templates');
  if (!box.childElementCount) {
    for (const [key, t] of Object.entries(TEMPLATES)) {
      const d = buildTemplate(key);
      const s = Math.min(176 / d.w, 196 / d.h);
      const card = document.createElement('button');
      card.className = 'tpl';
      card.dataset.template = key;
      card.innerHTML = `<div class="tpl-preview"><div class="tpl-sheet" style="width:${d.w * s}px;height:${d.h * s}px"></div></div>` +
        `<div class="tpl-name">${t.name}</div><div class="tpl-meta">${t.meta}</div>`;
      const pc = document.createElement('div');
      pc.className = 'page-content';
      renderPageInto(pc, d.pages[0], d);
      pc.style.transform = `scale(${s})`;
      $('.tpl-sheet', card).appendChild(pc);
      box.appendChild(card);
    }
  }
  $('#backstage').hidden = false;
}
function closeBackstage() { $('#backstage').hidden = true; if (fitMode) applyZoom(); }

async function useTemplate(key) {
  if (!(await confirmReplace())) return;
  loadDoc(buildTemplate(key));
  closeBackstage();
  toast(`${TEMPLATES[key].name} ready — double-click any text to edit`);
}

// ---------- Modal & toast ----------
function showModal(html) { $('#modal-body').innerHTML = html; $('#modal').hidden = false; }
function closeModal(v) { $('#modal').hidden = true; if (modalResolve) { modalResolve(v); modalResolve = null; } }
function confirmModal(title, text, ok) {
  return new Promise((res) => {
    modalResolve = res;
    showModal(`<h2>${title}</h2><p>${text}</p><div class="actions"><button class="btn btn-ghost" data-m="0">Cancel</button><button class="btn btn-primary" data-m="1">${ok}</button></div>`);
  });
}

let toastTimer = 0;
function toast(msg, action) {
  const t = $('#toast');
  t.textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.className = 'toast-action';
    b.textContent = action.label;
    b.addEventListener('click', () => { t.hidden = true; action.run(); });
    t.appendChild(b);
  }
  t.hidden = false;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 6000 : 2600);
}

// ---------- Install (PWA) ----------
const isStandalone = () => !!desktop || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true;
if (!isStandalone()) $('#btn-install').hidden = false;
$$('.bs-install').forEach((b) => { b.hidden = isStandalone(); });

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  if (desktop) return;
  installEvt = e;
  $('#btn-install').hidden = false;
});
window.addEventListener('appinstalled', () => {
  installEvt = null;
  $('#btn-install').hidden = true;
  toast('Folio is installed — open it from your apps');
});

async function installApp() {
  if (installEvt) {
    installEvt.prompt();
    const r = await installEvt.userChoice;
    installEvt = null;
    if (r.outcome === 'accepted') $('#btn-install').hidden = true;
    return;
  }
  if (isStandalone()) { toast('Folio is already installed'); return; }
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
  const firefox = /firefox|fxios/i.test(ua);
  let steps;
  if (ios) steps = '<li>Tap the <b>Share</b> button in Safari’s toolbar.</li><li>Choose <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b> — Folio appears with your apps.</li>';
  else if (safari) steps = '<li>In Safari’s menu bar choose <b>File → Add to Dock…</b></li><li>Click <b>Add</b> — Folio opens in its own window.</li>';
  else if (firefox) steps = '<li>Firefox on Android: open the menu and choose <b>Install</b>.</li><li>Firefox on desktop does not install web apps — open this page in Chrome, Edge or Safari to install.</li>';
  else steps = '<li>Look for the <b>install</b> icon at the right of the address bar, or open the browser menu.</li><li>Choose <b>Install Folio Publisher…</b> (or <b>Apps → Install this site as an app</b>).</li><li>Folio will open in its own window and work offline.</li>';
  showModal(`<h2>Install Folio</h2><p>Keep Folio in your dock or on your home screen. It runs in its own window and keeps working without a connection.</p><ol>${steps}</ol>` +
    (location.protocol !== 'https:' && location.hostname !== 'localhost' ? '<p><em>Note: installing requires the site to be served over HTTPS.</em></p>' : '') +
    '<div class="actions"><button class="btn btn-primary" data-m="0">Got it</button></div>');
}

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// ---------- Boot ----------
(async function boot() {
  if (desktop) {
    document.documentElement.classList.add('is-desktop', 'platform-' + desktop.platform);
    $$('[data-desktop-only]').forEach((x) => { x.hidden = false; });
    $$('[data-web-only]').forEach((x) => { x.hidden = true; });
  }
  applyView();
  let saved = null;
  try { saved = JSON.parse(desktop ? await desktop.loadAutosave() : localStorage.getItem(STORE_KEY)); } catch {}
  if (saved && saved.doc && Array.isArray(saved.doc.pages)) {
    pageIndex = saved.pageIndex || 0;
    loadDoc(saved.doc, { keepPage: true, path: desktop ? saved.filePath : null, hash: desktop ? saved.savedHash : null });
  } else {
    loadDoc(buildTemplate('blank'));
    openBackstage();
  }
  // Re-measure once web fonts arrive so text metrics are right.
  document.fonts?.ready.then(() => { renderCanvas(); renderThumbs(); });
  if (desktop) {
    desktop.onOpenFile(async (f) => { if (await confirmReplace()) openText(f.text, f.path); });
    desktop.onSaveAndClose(async () => { if (await saveFile()) desktop.closeNow(); });
    desktop.ready();
  }
})();

})();
