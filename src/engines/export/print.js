/* Folio Publisher — print root: imposed sheets as DOM, printed (or saved as PDF) one sheet per page. */

const ROOT_ID = 'print-root';
const BASE_STYLE_ID = 'print-root-style';
const PAGE_STYLE_ID = 'print-page-style';
const SVG_NS = 'http://www.w3.org/2000/svg';
const MARK_PX = 0.25 * 96 / 72;   // 0.25pt crop mark
const HALO_PX = MARK_PX + 1.5;    // white halo so marks show on dark bleed/backgrounds

const BASE_CSS = `
#${ROOT_ID} { position: fixed; left: -200000px; top: 0; pointer-events: none; contain: layout style; }
#${ROOT_ID} .print-sheet { position: relative; overflow: hidden; box-sizing: border-box; margin: 0; padding: 0; }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: none !important; height: auto !important;
    min-height: 0 !important; overflow: visible !important; display: block !important; }
  body > *:not(#${ROOT_ID}) { display: none !important; }
  #${ROOT_ID} { position: static !important; left: auto !important; display: block !important; contain: none; }
  #${ROOT_ID} .print-sheet { break-after: page; page-break-after: always; break-inside: avoid; page-break-inside: avoid; }
  #${ROOT_ID} .print-sheet:last-child { break-after: auto; page-break-after: auto; }
  #${ROOT_ID}, #${ROOT_ID} * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}`;

const pxs = (v) => `${Math.round(v * 1000) / 1000}px`;

/**
 * Render one placed page: a clip box of trim + bleed (in sheet coordinates) holding the page rendered
 * at its natural size and scaled. Shared by print, preview and raster export.
 * @param {object} o
 * @param {number|null} o.pageIndex page to render (null = blank)
 * @param {(container:HTMLElement, pageIndex:number, opts:object) => any} o.renderPage
 * @param {number} o.pageW natural page width (px)
 * @param {number} o.pageH natural page height (px)
 * @param {number} [o.x=0] trim-box left on the sheet
 * @param {number} [o.y=0] trim-box top on the sheet
 * @param {number} [o.scale=1]
 * @param {number} [o.rot=0] 0 or 180
 * @param {{top:number,right:number,bottom:number,left:number}} [o.bleed] scaled bleed per side
 * @param {object} [o.renderOpts] passed through to renderPage
 * @returns {{ clip: HTMLElement, page: HTMLElement, result: any }}
 */
export function mountPage(o) {
  const scale = o.scale ?? 1;
  const b = o.bleed || { top: 0, right: 0, bottom: 0, left: 0 };
  const w = o.pageW * scale; const h = o.pageH * scale;
  const clip = document.createElement('div');
  clip.className = 'print-clip';
  Object.assign(clip.style, {
    position: 'absolute', left: pxs((o.x || 0) - b.left), top: pxs((o.y || 0) - b.top),
    width: pxs(w + b.left + b.right), height: pxs(h + b.top + b.bottom), overflow: 'hidden'
  });
  const page = document.createElement('div');
  page.className = 'print-page';
  Object.assign(page.style, {
    position: 'absolute', left: pxs(b.left), top: pxs(b.top), width: pxs(o.pageW), height: pxs(o.pageH),
    transformOrigin: '0 0',
    transform: o.rot === 180
      ? `scale(${scale}) rotate(180deg) translate(${-o.pageW}px, ${-o.pageH}px)`
      : (scale === 1 ? 'none' : `scale(${scale})`)
  });
  clip.appendChild(page);
  let result = null;
  if (o.pageIndex != null) {
    result = o.renderPage(page, o.pageIndex, { mode: 'export', ...(o.renderOpts || {}) });
    // The page renderer clips to the trim; with bleed, let content run into the bleed box and
    // extend the page background under it.
    if (b.top || b.right || b.bottom || b.left) {
      page.style.overflow = 'visible';
      const s = page.style;
      clip.style.backgroundColor = s.backgroundColor;
      if (s.backgroundImage && s.backgroundImage !== 'none') {
        clip.style.backgroundImage = s.backgroundImage;
        clip.style.backgroundSize = s.backgroundSize;
        clip.style.backgroundRepeat = s.backgroundRepeat;
        clip.style.backgroundPosition = s.backgroundPosition;
      }
    }
    page.style.position = 'absolute';
  }
  return { clip, page, result };
}

/**
 * Build the DOM for one imposed sheet (exact sheet size, overflow hidden, crop marks as SVG lines).
 * @param {object} sheet a sheet from computeLayout / applyRecords
 * @param {object} o
 * @param {(container:HTMLElement, pageIndex:number, opts:object) => any} o.renderPage
 * @param {number} o.pageW natural page width
 * @param {number} o.pageH natural page height
 * @param {Array<object>|null} [o.records] merge records indexed by item.recordIndex
 * @param {object|null} [o.record] record used when an item has no recordIndex
 * @param {string|null} [o.background] sheet (paper) colour, e.g. '#ffffff'; null = transparent
 * @param {boolean} [o.cropMarks=true] draw the sheet's marks
 * @param {number} [o.sheetIndex=0]
 * @returns {HTMLElement}
 */
export function buildSheetElement(sheet, o) {
  const el = document.createElement('div');
  el.className = 'print-sheet';
  if (sheet.side) el.dataset.side = sheet.side;
  Object.assign(el.style, {
    position: 'relative', width: pxs(sheet.w), height: pxs(sheet.h), overflow: 'hidden',
    boxSizing: 'border-box', margin: '0', padding: '0', background: o.background || 'transparent'
  });
  for (const it of sheet.items) {
    if (it.pageIndex == null) continue;
    const record = it.recordIndex != null && o.records ? o.records[it.recordIndex] : (o.record ?? null);
    const { clip } = mountPage({
      pageIndex: it.pageIndex, renderPage: o.renderPage, pageW: o.pageW, pageH: o.pageH,
      x: it.x, y: it.y, scale: it.scale ?? it.w / o.pageW, rot: it.rot, bleed: it.bleed,
      renderOpts: { record, recordIndex: it.recordIndex ?? null, sheetIndex: o.sheetIndex ?? 0, side: sheet.side ?? null }
    });
    el.appendChild(clip);
  }
  if (o.cropMarks !== false && sheet.marks && sheet.marks.length) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'print-marks');
    svg.setAttribute('width', String(sheet.w));
    svg.setAttribute('height', String(sheet.h));
    svg.setAttribute('viewBox', `0 0 ${sheet.w} ${sheet.h}`);
    Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', overflow: 'visible', pointerEvents: 'none' });
    for (const [color, width] of [['#ffffff', HALO_PX], ['#000000', MARK_PX]]) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('stroke', color);
      g.setAttribute('stroke-width', String(width));
      g.setAttribute('fill', 'none');
      for (const m of sheet.marks) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', m.x1); line.setAttribute('y1', m.y1);
        line.setAttribute('x2', m.x2); line.setAttribute('y2', m.y2);
        g.appendChild(line);
      }
      svg.appendChild(g);
    }
    el.appendChild(svg);
  }
  return el;
}

/**
 * Wait until every image under `root` has decoded and web fonts are ready.
 * @param {ParentNode} root
 * @returns {Promise<void>}
 */
export async function whenRendered(root) {
  const imgs = [...root.querySelectorAll('img')];
  await Promise.all(imgs.map((img) => (img.complete && img.naturalWidth ? Promise.resolve() : img.decode().catch(() => {}))));
  const svgImgs = [...root.querySelectorAll('image')];
  await Promise.all(svgImgs.map((im) => {
    const href = im.getAttribute('href') || im.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    if (!href) return null;
    const probe = new Image();
    probe.src = href;
    return probe.decode().catch(() => {});
  }));
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

function ensureBaseStyle() {
  let st = document.getElementById(BASE_STYLE_ID);
  if (!st) {
    st = document.createElement('style');
    st.id = BASE_STYLE_ID;
    st.textContent = BASE_CSS;
    document.head.appendChild(st);
  }
}

/**
 * Fill #print-root with one exactly-sized element per imposed sheet and set `@page` to the sheet size,
 * so printing (or Electron printToPDF) produces exactly one page per sheet.
 * @param {object} o
 * @param {object} [o.doc] the publication (used for the natural page size when pageW/pageH are omitted)
 * @param {{sheets:Array<object>, sheetW:number, sheetH:number}} o.layout from computeLayout / applyRecords
 * @param {(container:HTMLElement, pageIndex:number, opts:object) => any} o.renderPage
 * @param {number} [o.pageW] natural page width (default doc.setup.width)
 * @param {number} [o.pageH] natural page height (default doc.setup.height)
 * @param {Array<object>} [o.records] merge records, indexed by item.recordIndex
 * @param {object} [o.record] one record for every page
 * @param {boolean} [o.cropMarks=true] draw the layout's marks (computeLayout only creates them when asked)
 * @param {string|null} [o.background='#ffffff'] paper colour behind the pages
 * @returns {Promise<{ root:HTMLElement, sheetCount:number, widthPx:number, heightPx:number,
 *   widthIn:number, heightIn:number, landscape:boolean }>}
 */
export async function preparePrintRoot(o) {
  const { layout } = o;
  if (!layout || !Array.isArray(layout.sheets)) throw new TypeError('preparePrintRoot needs a layout');
  if (!layout.sheets.length) throw new RangeError('Nothing to print: the layout has no sheets');
  const pageW = o.pageW ?? o.doc?.setup?.width;
  const pageH = o.pageH ?? o.doc?.setup?.height;
  if (!(pageW > 0 && pageH > 0)) throw new TypeError('preparePrintRoot needs the page size (doc or pageW/pageH)');
  ensureBaseStyle();
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('aria-hidden', 'true');
    document.body.appendChild(root);
  } else if (root.parentNode !== document.body) {
    document.body.appendChild(root);
  }
  const W = layout.sheetW ?? layout.sheets[0].w;
  const H = layout.sheetH ?? layout.sheets[0].h;
  const frag = document.createDocumentFragment();
  layout.sheets.forEach((sheet, i) => {
    frag.appendChild(buildSheetElement({ ...sheet, w: W, h: H }, {
      renderPage: o.renderPage, pageW, pageH, records: o.records || null, record: o.record ?? null,
      background: o.background === undefined ? '#ffffff' : o.background, cropMarks: o.cropMarks !== false, sheetIndex: i
    }));
  });
  root.replaceChildren(frag);
  let ps = document.getElementById(PAGE_STYLE_ID);
  if (!ps) {
    ps = document.createElement('style');
    ps.id = PAGE_STYLE_ID;
    document.head.appendChild(ps);
  }
  ps.textContent = `@page { size: ${pxs(W)} ${pxs(H)}; margin: 0; }`;
  await whenRendered(root);
  return {
    root, sheetCount: layout.sheets.length, widthPx: W, heightPx: H,
    widthIn: W / 96, heightIn: H / 96, landscape: W > H
  };
}

/**
 * Remove the print root contents and the @page rule.
 * @returns {void}
 */
export function clearPrintRoot() {
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(PAGE_STYLE_ID)?.remove();
}
