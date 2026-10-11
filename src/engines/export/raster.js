/* Folio Publisher — rasterise rendered pages to PNG/JPEG via SVG <foreignObject>.
   The node is cloned with its computed styles inlined, images/backgrounds become data: URLs and the
   app's web fonts are embedded, so the SVG image is self-contained and the canvas is never tainted. */

import { setPngDpi, setJpegDpi, pageFileName } from './imagemeta.js';
import { mountPage } from './print.js';

const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const MAX_SIDE = 16384;
const MAX_AREA = 16384 * 16384 / 2;

const dataUrlCache = new Map();   // absolute url -> Promise<string>
const fontCssCache = new Map();   // css url -> Promise<Array<{family:string, css:string, urls:string[]}>>

/**
 * Read a Blob as a data: URL.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error || new Error('Could not read blob'));
    r.readAsDataURL(blob);
  });
}

/**
 * Decode a data: URL into a Blob.
 * @param {string} url
 * @returns {Blob}
 */
export function dataURLToBlob(url) {
  const m = /^data:([^;,]*)((?:;[^;,]*)*?)(;base64)?,(.*)$/s.exec(url);
  if (!m) throw new TypeError('Not a data: URL');
  const mime = m[1] || 'text/plain';
  if (m[3]) {
    const bin = atob(m[4]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(m[4])], { type: mime });
}

/**
 * canvas.toBlob as a promise.
 * @param {HTMLCanvasElement} canvas
 * @param {string} [type='image/png']
 * @param {number} [quality]
 * @returns {Promise<Blob>}
 */
export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The image could not be encoded (canvas too large?)'))), type, quality);
    } catch (err) {
      reject(err);
    }
  });
}

function loadBinary(url) {
  if (typeof fetch === 'function' && !/^file:/i.test(url)) {
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return r.blob();
    });
  }
  // file:// (desktop shell): fetch() does not support the scheme, XHR does.
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('GET', url);
    x.responseType = 'blob';
    x.onload = () => (x.status === 200 || (x.status === 0 && x.response && x.response.size) ? resolve(x.response) : reject(new Error(`Could not load ${url}`)));
    x.onerror = () => reject(new Error(`Could not load ${url}`));
    x.send();
  });
}

function loadText(url) {
  return loadBinary(url).then((b) => b.text());
}

/**
 * Fetch any URL (same-origin, blob: or file:) and return it as a data: URL. Cached.
 * @param {string} url
 * @returns {Promise<string>}
 */
export function urlToDataURL(url) {
  if (/^data:/i.test(url)) return Promise.resolve(url);
  const abs = new URL(url, document.baseURI).href;
  if (!dataUrlCache.has(abs)) {
    const p = loadBinary(abs).then(blobToDataURL);
    p.catch(() => dataUrlCache.delete(abs));
    dataUrlCache.set(abs, p);
  }
  return dataUrlCache.get(abs);
}

const unquote = (s) => s.trim().replace(/^['"]|['"]$/g, '').trim().toLowerCase();

/**
 * Parse a fonts stylesheet into @font-face entries (urls resolved against the stylesheet URL). Cached.
 * @param {string} cssUrl
 * @returns {Promise<Array<{family:string, css:string, urls:string[]}>>}
 */
export function loadFontFaces(cssUrl) {
  const abs = new URL(cssUrl, document.baseURI).href;
  if (!fontCssCache.has(abs)) {
    const p = loadText(abs).then((text) => {
      const faces = [];
      for (const m of text.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
        const body = m[1];
        const fam = /font-family\s*:\s*([^;]+);?/i.exec(body);
        if (!fam) continue;
        const urls = [];
        const css = body.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (_all, _q, u) => {
          const full = new URL(u, abs).href;
          urls.push(full);
          return `url("${full}")`;
        });
        faces.push({ family: unquote(fam[1]), css, urls });
      }
      return faces;
    });
    p.catch(() => fontCssCache.delete(abs));
    fontCssCache.set(abs, p);
  }
  return fontCssCache.get(abs);
}

/**
 * Build @font-face CSS (fonts inlined as data: URLs) for the given families.
 * @param {Iterable<string>} families lower-case family names
 * @param {string} [cssUrl='fonts/fonts.css']
 * @returns {Promise<string>}
 */
export async function embeddedFontCSS(families, cssUrl = 'fonts/fonts.css') {
  let faces;
  try {
    faces = await loadFontFaces(cssUrl);
  } catch {
    return '';   // no bundled fonts available: system fonts still render
  }
  const want = new Set([...families].map((f) => f.toLowerCase()));
  const out = [];
  for (const f of faces) {
    if (!want.has(f.family)) continue;
    let css = f.css;
    for (const u of f.urls) {
      try {
        css = css.split(`url("${u}")`).join(`url("${await urlToDataURL(u)}")`);
      } catch { /* missing file: skip this source */ }
    }
    out.push(`@font-face {${css}}`);
  }
  return out.join('\n');
}

/** Read the quoted string of a CSS `content` value (for ::before / ::after). */
function pseudoText(content) {
  if (!content || content === 'none' || content === 'normal') return null;
  const m = /^"((?:[^"\\]|\\.)*)"$|^'((?:[^'\\]|\\.)*)'$/.exec(content.trim());
  if (!m) return null;
  return (m[1] ?? m[2]).replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_a, h) => String.fromCodePoint(parseInt(h, 16))).replace(/\\(.)/g, '$1');
}

function styleText(cs) {
  let t = '';
  for (let i = 0; i < cs.length; i++) {
    const p = cs[i];
    t += `${p}:${cs.getPropertyValue(p)};`;
  }
  return t;
}

/**
 * Deep-clone `src` with every element's computed style inlined. Collects font families and
 * resources that must become data: URLs.
 */
function cloneStyled(src, state) {
  if (src.nodeType === Node.TEXT_NODE) return document.createTextNode(src.nodeValue);
  if (src.nodeType !== Node.ELEMENT_NODE) return null;
  const tag = src.localName;
  if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'template') return null;
  const cs = getComputedStyle(src);
  if (cs.display === 'none') return null;
  let el;
  if (tag === 'canvas') {
    el = document.createElement('img');
    try { el.setAttribute('src', src.toDataURL()); } catch { /* tainted source canvas: leave blank */ }
  } else {
    el = src.cloneNode(false);
  }
  el.removeAttribute('contenteditable');
  el.removeAttribute('id');
  let st = styleText(cs);
  if (state.isRoot) {
    st += 'position:relative;left:0;top:0;right:auto;bottom:auto;margin:0;transform:none;';
    if (state.width) st += `width:${state.width}px;height:${state.height}px;`;
    state.isRoot = false;
  }
  el.setAttribute('style', st);
  for (const fam of cs.fontFamily.split(',')) state.families.add(unquote(fam));
  const bg = cs.backgroundImage;
  if (bg && bg !== 'none') for (const m of bg.matchAll(/url\("?([^")]+)"?\)/g)) if (!/^data:/i.test(m[1])) state.urls.add(m[1]);
  if (tag === 'img') {
    const s = src.currentSrc || src.getAttribute('src');
    if (s) { el.setAttribute('src', s); el.removeAttribute('srcset'); if (!/^data:/i.test(s)) state.imgs.push(el); }
  } else if (tag === 'image') {
    const s = src.getAttribute('href') || src.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    if (s && !/^data:/i.test(s)) state.svgImgs.push(el);
  } else if (tag === 'input' || tag === 'textarea') {
    el.setAttribute('value', src.value);
    if (tag === 'textarea') el.textContent = src.value;
  }
  const before = getComputedStyle(src, '::before');
  const bt = pseudoText(before.content);
  if (bt != null) {
    const span = document.createElement('span');
    span.setAttribute('style', styleText(before));
    span.textContent = bt;
    el.appendChild(span);
  }
  if (tag !== 'textarea') {
    for (const child of src.childNodes) {
      const c = cloneStyled(child, state);
      if (c) el.appendChild(c);
    }
  }
  const after = getComputedStyle(src, '::after');
  const at = pseudoText(after.content);
  if (at != null) {
    const span = document.createElement('span');
    span.setAttribute('style', styleText(after));
    span.textContent = at;
    el.appendChild(span);
  }
  return el;
}

async function inlineResources(clone, state) {
  await Promise.all(state.imgs.map(async (img) => {
    try { img.setAttribute('src', await urlToDataURL(img.getAttribute('src'))); } catch { img.removeAttribute('src'); }
  }));
  await Promise.all(state.svgImgs.map(async (im) => {
    const href = im.getAttribute('href') || im.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    try {
      const d = await urlToDataURL(href);
      im.setAttribute('href', d);
      im.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
    } catch { im.removeAttribute('href'); }
  }));
  if (state.urls.size) {
    const map = new Map();
    await Promise.all([...state.urls].map(async (u) => { try { map.set(u, await urlToDataURL(u)); } catch { map.set(u, null); } }));
    for (const el of [clone, ...clone.querySelectorAll('[style]')]) {
      const s = el.getAttribute('style');
      if (!s || !s.includes('url(')) continue;
      el.setAttribute('style', s.replace(/url\("?([^")]+)"?\)/g, (all, u) => (map.has(u) ? (map.get(u) ? `url("${map.get(u)}")` : 'none') : all)));
    }
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'sync';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The page could not be converted to an image'));
    img.src = src;
  });
}

/**
 * Build a self-contained SVG (foreignObject) string for a node.
 * @param {Element} node a laid-out element in the document
 * @param {{width?:number, height?:number, fontsCssUrl?:string}} [opts]
 * @returns {Promise<{svg:string, width:number, height:number, families:string[]}>}
 */
export async function nodeToSVG(node, opts = {}) {
  const rect = node.getBoundingClientRect();
  const width = opts.width ?? (node.offsetWidth || rect.width);
  const height = opts.height ?? (node.offsetHeight || rect.height);
  const state = { isRoot: true, width, height, families: new Set(), urls: new Set(), imgs: [], svgImgs: [] };
  const clone = cloneStyled(node, state);
  if (!clone) throw new Error('Nothing to rasterise (the node is hidden)');
  await inlineResources(clone, state);
  const fontCss = await embeddedFontCSS(state.families, opts.fontsCssUrl || 'fonts/fonts.css');
  const wrap = document.createElementNS(XHTML_NS, 'div');
  wrap.setAttribute('style', `margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;position:relative;`);
  if (fontCss) {
    const st = document.createElementNS(XHTML_NS, 'style');
    st.textContent = fontCss;
    wrap.appendChild(st);
  }
  wrap.appendChild(clone);
  const xhtml = new XMLSerializer().serializeToString(wrap);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<foreignObject x="0" y="0" width="${width}" height="${height}">${xhtml}</foreignObject></svg>`;
  return { svg, width, height, families: [...state.families] };
}

/**
 * Rasterise a rendered DOM node to an image.
 * @param {Element} node laid-out (attached, not display:none) element
 * @param {object} [opts]
 * @param {number} [opts.width] CSS px (default: node size)
 * @param {number} [opts.height] CSS px
 * @param {number} [opts.dpi=150] 72–600; output pixels = CSS px × dpi / 96
 * @param {'png'|'jpeg'} [opts.format='png']
 * @param {number} [opts.quality=0.92] JPEG quality 0–1
 * @param {string|null} [opts.background] fill colour; default transparent (PNG) or white (JPEG)
 * @param {string} [opts.fontsCssUrl='fonts/fonts.css']
 * @param {boolean} [opts.metadata=true] write the DPI into the file (PNG pHYs / JPEG JFIF)
 * @returns {Promise<Blob>}
 */
export async function rasterizeNode(node, opts = {}) {
  const dpi = Math.min(600, Math.max(72, Number(opts.dpi) || 150));
  const format = opts.format === 'jpeg' || opts.format === 'jpg' ? 'jpeg' : 'png';
  const { svg, width, height } = await nodeToSVG(node, opts);
  const k = dpi / 96;
  const pw = Math.max(1, Math.round(width * k));
  const ph = Math.max(1, Math.round(height * k));
  if (pw > MAX_SIDE || ph > MAX_SIDE || pw * ph > MAX_AREA) {
    throw new RangeError(`The image would be ${pw} × ${ph} pixels, which is too large. Choose a lower resolution.`);
  }
  const sized = svg.replace(/^<svg ([^>]*?)width="[^"]*" height="[^"]*"/, `<svg $1width="${pw}" height="${ph}"`);
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`);
  // Give the SVG document a frame to apply its embedded fonts before drawing.
  await new Promise((r) => requestAnimationFrame(() => r()));
  const canvas = document.createElement('canvas');
  canvas.width = pw; canvas.height = ph;
  const ctx = canvas.getContext('2d');
  const bg = opts.background !== undefined && opts.background !== null ? opts.background : (format === 'jpeg' ? '#ffffff' : null);
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, pw, ph); }
  ctx.drawImage(img, 0, 0, pw, ph);
  ctx.getImageData(0, 0, 1, 1);   // throws SecurityError if the canvas were tainted
  const blob = await canvasToBlob(canvas, `image/${format}`, format === 'jpeg' ? (opts.quality ?? 0.92) : undefined);
  canvas.width = canvas.height = 0;
  if (opts.metadata === false) return blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const tagged = format === 'png' ? setPngDpi(bytes, dpi) : setJpegDpi(bytes, dpi);
  return new Blob([tagged], { type: `image/${format}` });
}

/**
 * Render and rasterise pages one at a time (offscreen), returning named image blobs.
 * @param {number[]} pages page indices
 * @param {(container:HTMLElement, pageIndex:number, opts:object) => any} renderPage
 * @param {object} opts
 * @param {number} opts.width natural page width (CSS px)
 * @param {number} opts.height natural page height (CSS px)
 * @param {number} [opts.dpi=150]
 * @param {'png'|'jpeg'} [opts.format='png']
 * @param {number} [opts.quality]
 * @param {string|null} [opts.background]
 * @param {number} [opts.bleed=0] include this much bleed (px) around each page
 * @param {Array<object>|null} [opts.records] merge records: each record renders every selected page
 * @param {string} [opts.baseName='Publication']
 * @param {string} [opts.fontsCssUrl]
 * @param {(done:number, total:number) => void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<Array<{name:string, blob:Blob, pageIndex:number, recordIndex:number|null}>>}
 */
export async function exportPagesAsImages(pages, renderPage, opts) {
  const format = opts.format === 'jpeg' || opts.format === 'jpg' ? 'jpeg' : 'png';
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  const bleed = Math.max(0, opts.bleed || 0);
  const records = opts.records && opts.records.length ? opts.records : [null];
  const total = pages.length * records.length;
  const host = document.createElement('div');
  host.className = 'export-raster-host';
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, { position: 'fixed', left: '-200000px', top: '0', pointerEvents: 'none' });
  document.body.appendChild(host);
  const out = [];
  try {
    let done = 0;
    for (let r = 0; r < records.length; r++) {
      for (const pageIndex of pages) {
        if (opts.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
        const box = document.createElement('div');
        Object.assign(box.style, { position: 'relative', width: `${opts.width + 2 * bleed}px`, height: `${opts.height + 2 * bleed}px`, overflow: 'hidden' });
        const { clip } = mountPage({
          pageIndex, renderPage, pageW: opts.width, pageH: opts.height, x: bleed, y: bleed,
          bleed: { top: bleed, right: bleed, bottom: bleed, left: bleed },
          renderOpts: { record: records[r], recordIndex: records[r] ? r : null }
        });
        box.appendChild(clip);
        host.replaceChildren(box);
        const imgs = [...box.querySelectorAll('img')];
        await Promise.all(imgs.map((im) => (im.complete ? null : im.decode().catch(() => {}))));
        if (document.fonts?.ready) await document.fonts.ready;
        const blob = await rasterizeNode(box, {
          width: opts.width + 2 * bleed, height: opts.height + 2 * bleed, dpi: opts.dpi, format,
          quality: opts.quality, background: opts.background, fontsCssUrl: opts.fontsCssUrl
        });
        out.push({
          name: pageFileName({ baseName: opts.baseName, ext, pageIndex, total: pages.length, recordIndex: records[r] ? r : null, recordCount: records[0] ? records.length : 0 }),
          blob, pageIndex, recordIndex: records[r] ? r : null
        });
        opts.onProgress?.(++done, total);
      }
    }
  } finally {
    host.remove();
  }
  return out;
}
