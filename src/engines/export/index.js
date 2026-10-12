/* Folio Publisher — export & print engine: the browser-side API the export/print UI calls.
   renderPage(container, pageIndex, { mode:'export', record, recordIndex, sheetIndex, side }) renders one
   page into `container` (the core renderer wrapped by the caller). `platform` is core/platform.js. */

import { parsePageRange, computeLayout, applyRecords, layoutStats, PAPER_SIZES } from './imposition.js';
import { preparePrintRoot, clearPrintRoot, buildSheetElement, whenRendered } from './print.js';
import { exportPagesAsImages } from './raster.js';
import { safeFileName } from './imagemeta.js';
import { plural } from '../../core/i18n.js';

export { parsePageRange, computeLayout, applyRecords, layoutStats, PAPER_SIZES } from './imposition.js';
export { preparePrintRoot, clearPrintRoot, buildSheetElement, mountPage } from './print.js';
export { rasterizeNode, exportPagesAsImages, canvasToBlob, blobToDataURL, dataURLToBlob, urlToDataURL, nodeToSVG } from './raster.js';
export { safeFileName, pageFileName, setPngDpi, setJpegDpi } from './imagemeta.js';

const baseNameOf = (doc, options) => safeFileName(String(options.fileName || doc.title || 'Publication').replace(/\.(folio|json|pdf|png|jpe?g)$/i, ''), 'Publication');

/**
 * Selected page indices for an options object ({ pages: '1-3, 5' | number[] | 'all' }).
 * @param {object} doc
 * @param {object} [options]
 * @returns {number[]}
 */
export function selectedPages(doc, options = {}) {
  const pages = parsePageRange(options.pages ?? 'all', doc.pages.length);
  if (!pages.length) throw new RangeError('No pages selected');
  return pages;
}

/**
 * Impose the selected pages of `doc` with export/print options (records applied).
 * @param {object} doc
 * @param {object} [options] computeLayout options plus { pages, records, perCell, includeBleed }
 *   `bleed` defaults to doc.setup.bleed when `includeBleed` is true (or cropMarks are on), else 0.
 * @returns {object} layout (see computeLayout), with `pageW`, `pageH`, `records`
 */
export function layoutFor(doc, options = {}) {
  const pages = selectedPages(doc, options);
  const bleed = options.bleed ?? ((options.includeBleed || options.cropMarks) ? (doc.setup.bleed || 0) : 0);
  let layout = computeLayout({
    pageW: doc.setup.width, pageH: doc.setup.height, pageCount: doc.pages.length, pages,
    mode: options.mode || 'single', paper: options.paper ?? 'page', orientation: options.orientation || 'auto',
    margins: options.margins ?? 0, gap: options.gap ?? 0, bleed, cropMarks: !!options.cropMarks,
    marksOffset: options.marksOffset, marksLength: options.marksLength,
    copiesPerSheet: options.copiesPerSheet || 'auto', duplex: options.duplex === 'simplex' ? false : (options.duplex || false),
    fit: !!options.fit
  });
  const records = options.records && options.records.length ? options.records : null;
  if (records) layout = applyRecords(layout, records.length, { perCell: !!options.perCell });
  return { ...layout, pageW: doc.setup.width, pageH: doc.setup.height, records };
}

function desktopInvoke(platform, options) {
  if (typeof options.invoke === 'function') return options.invoke;
  if (platform && typeof platform.invoke === 'function') return platform.invoke.bind(platform);
  const d = globalThis.folioDesktop;
  return d && typeof d.invoke === 'function' ? d.invoke.bind(d) : null;
}

/**
 * Export the publication as PDF (desktop: printToPDF + Save dialog; web: the browser print dialog).
 * With options.records and options.perRecordFiles, the desktop writes one PDF per record into a folder.
 * @param {object} doc
 * @param {(container:HTMLElement, pageIndex:number, opts:object) => any} renderPage
 * @param {object} [options] layoutFor options plus { fileName, records, perRecordFiles, recordName(record, i) }
 * @param {object} platform core/platform.js
 * @returns {Promise<{name:string, path?:string}|{folder:string, count:number}|null>} null when cancelled
 */
export async function exportPDF(doc, renderPage, options = {}, platform) {
  const base = baseNameOf(doc, options);
  const records = options.records && options.records.length ? options.records : null;
  if (records && options.perRecordFiles) {
    const invoke = platform?.isDesktop !== false ? desktopInvoke(platform, options) : null;
    if (invoke) return exportPDFPerRecord(doc, renderPage, options, invoke, base, records);
    // Web: a browser cannot write several PDFs; print every record in one job instead.
  }
  const layout = layoutFor(doc, options);
  const info = await preparePrintRoot({ doc, layout, renderPage, records: layout.records, cropMarks: true, background: options.background ?? '#ffffff' });
  try {
    return await platform.printToPDF({ widthIn: info.widthIn, heightIn: info.heightIn, suggestedName: `${base}.pdf`, landscape: info.landscape });
  } finally {
    clearPrintRoot();
  }
}

async function exportPDFPerRecord(doc, renderPage, options, invoke, base, records) {
  const layout = layoutFor(doc, { ...options, records: null });
  const nameOf = (rec, i) => {
    const custom = typeof options.recordName === 'function' ? options.recordName(rec, i) : '';
    const n = safeFileName(custom || `${base} - ${String(i + 1).padStart(String(records.length).length, '0')}`);
    return `${n}.pdf`;
  };
  const files = records.map((r, i) => ({ name: nameOf(r, i) }));
  const W = layout.sheetW; const H = layout.sheetH;
  const begin = await invoke('export:pdf-batch', { action: 'begin', files, widthIn: W / 96, heightIn: H / 96 });
  if (!begin) return null;
  let ok = false;
  try {
    for (let i = 0; i < records.length; i++) {
      if (options.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
      await preparePrintRoot({ doc, layout, renderPage, record: records[i], cropMarks: true, background: options.background ?? '#ffffff' });
      await invoke('export:pdf-batch', { action: 'print', batchId: begin.batchId, index: i });
      options.onProgress?.(i + 1, records.length);
    }
    ok = true;
  } finally {
    clearPrintRoot();
    if (!ok) await Promise.resolve(invoke('export:pdf-batch', { action: 'end', batchId: begin.batchId, cancel: true })).catch(() => {});
  }
  return invoke('export:pdf-batch', { action: 'end', batchId: begin.batchId });
}

/**
 * Export pages as PNG or JPEG images. One image → Save dialog; several → a folder (desktop) or
 * one download per file (web).
 * @param {object} doc
 * @param {(container:HTMLElement, pageIndex:number, opts:object) => any} renderPage
 * @param {object} [options] { pages, format:'png'|'jpeg', dpi, quality, background, includeBleed, records,
 *   fileName, fontsCssUrl, onProgress, signal }
 * @param {object} platform
 * @returns {Promise<{ files:number, result: object|null }>}
 */
export async function exportImages(doc, renderPage, options = {}, platform) {
  const pages = selectedPages(doc, options);
  const format = options.format === 'jpeg' || options.format === 'jpg' ? 'jpeg' : 'png';
  const images = await exportPagesAsImages(pages, renderPage, {
    width: doc.setup.width, height: doc.setup.height, dpi: options.dpi ?? 150, format, quality: options.quality,
    background: options.background, bleed: options.includeBleed ? (doc.setup.bleed || 0) : 0,
    records: options.records && options.records.length ? options.records : null,
    baseName: baseNameOf(doc, options), fontsCssUrl: options.fontsCssUrl, onProgress: options.onProgress, signal: options.signal
  });
  const filters = format === 'png' ? [{ name: 'PNG image', extensions: ['png'] }] : [{ name: 'JPEG image', extensions: ['jpg', 'jpeg'] }];
  if (images.length === 1) {
    const data = new Uint8Array(await images[0].blob.arrayBuffer());
    const result = await platform.saveBinary({ data, suggestedName: images[0].name, filters });
    return { files: 1, result };
  }
  const files = await Promise.all(images.map(async (im) => ({ name: im.name, data: new Uint8Array(await im.blob.arrayBuffer()) })));
  const result = await platform.saveFilesToFolder(files);
  return { files: files.length, result };
}

/**
 * Print the publication through the system print dialog, imposed on paper.
 * @param {object} doc
 * @param {(container:HTMLElement, pageIndex:number, opts:object) => any} renderPage
 * @param {object} [options] layoutFor options plus { copies, duplex:'simplex'|'longEdge'|'shortEdge' }
 *   (paper defaults to 'page' — the printer scales to its paper — pass e.g. 'letter' to impose)
 * @param {object} platform
 * @returns {Promise<boolean>}
 */
export async function printDocument(doc, renderPage, options = {}, platform) {
  const layout = layoutFor(doc, options);
  const info = await preparePrintRoot({ doc, layout, renderPage, records: layout.records, cropMarks: true, background: options.background ?? '#ffffff' });
  try {
    const duplex = options.duplex === true ? 'longEdge' : (options.duplex || 'simplex');
    const r = await platform.print({
      copies: Math.max(1, Math.floor(options.copies || 1)), duplex, landscape: info.landscape, silent: false,
      widthIn: info.widthIn, heightIn: info.heightIn
    });
    return typeof r === 'object' && r !== null ? !!r.ok : !!r;
  } finally {
    clearPrintRoot();
  }
}

/**
 * Render the imposed sheets, scaled, into a preview container (print preview / export dialog).
 * @param {HTMLElement} container
 * @param {object} doc
 * @param {(container:HTMLElement, pageIndex:number, opts:object) => any} renderPage
 * @param {object} [options] layoutFor options plus
 *   { width (px available, default container width), height (max px per sheet), maxSheets=40, showMargins=true }
 * @returns {{ layout:object, sheetCount:number, scale:number, ready:Promise<void>, destroy:() => void }}
 */
export function buildPreview(container, doc, renderPage, options = {}) {
  const layout = layoutFor(doc, options);
  const availW = Math.max(60, (options.width ?? container.clientWidth ?? 400) - 24);
  const availH = Math.max(60, options.height ?? Infinity);
  const scale = Math.min(availW / layout.sheetW, availH / layout.sheetH, 1);
  const wrap = document.createElement('div');
  wrap.className = 'export-preview';
  Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '12px 0' });
  const max = options.maxSheets ?? 40;
  const margins = typeof options.margins === 'number'
    ? { top: options.margins, right: options.margins, bottom: options.margins, left: options.margins } : options.margins;
  layout.sheets.slice(0, max).forEach((sheet, i) => {
    const fig = document.createElement('figure');
    fig.className = 'export-preview-sheet';
    Object.assign(fig.style, { margin: '0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' });
    const frame = document.createElement('div');
    Object.assign(frame.style, {
      position: 'relative', width: `${layout.sheetW * scale}px`, height: `${layout.sheetH * scale}px`, overflow: 'hidden',
      background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,.22), 0 6px 18px rgba(0,0,0,.12)'
    });
    const el = buildSheetElement({ ...sheet, w: layout.sheetW, h: layout.sheetH }, {
      renderPage, pageW: layout.pageW, pageH: layout.pageH, records: layout.records, background: '#ffffff', sheetIndex: i
    });
    Object.assign(el.style, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0', transform: `scale(${scale})` });
    frame.appendChild(el);
    if (options.showMargins !== false && margins && options.paper && options.paper !== 'page') {
      const m = document.createElement('div');
      Object.assign(m.style, {
        position: 'absolute', left: `${margins.left * scale}px`, top: `${margins.top * scale}px`,
        right: `${margins.right * scale}px`, bottom: `${margins.bottom * scale}px`,
        outline: '1px dashed rgba(60,120,200,.55)', pointerEvents: 'none'
      });
      frame.appendChild(m);
    }
    const cap = document.createElement('figcaption');
    cap.className = 'export-preview-caption';
    cap.textContent = `Sheet ${i + 1}${sheet.side ? ` · ${sheet.side === 'front' ? 'Front' : 'Back'}` : ''}`;
    Object.assign(cap.style, { font: '12px/1.3 system-ui, sans-serif', opacity: '.7' });
    fig.append(frame, cap);
    wrap.appendChild(fig);
  });
  if (layout.sheets.length > max) {
    const more = document.createElement('p');
    more.className = 'export-preview-more';
    more.textContent = `+ ${plural(layout.sheets.length - max, '{n} more sheet', '{n} more sheets')}`;
    Object.assign(more.style, { font: '12px system-ui, sans-serif', opacity: '.7', margin: '0' });
    wrap.appendChild(more);
  }
  container.replaceChildren(wrap);
  return {
    layout, sheetCount: layout.sheets.length, scale,
    ready: whenRendered(wrap),
    destroy: () => wrap.remove()
  };
}
