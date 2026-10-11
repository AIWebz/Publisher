// Fallback for printing from the browser's own menu (Ctrl+P handled by the browser, File > Print in
// a browser menu): if nothing prepared #print-root, render every page into it in export mode so the
// printout is never blank. The export feature prepares #print-root itself for its print command.

import { app } from '../app.js';
import { renderPage } from '../render/index.js';

let filled = false;

/** Render all pages of the current document into #print-root (one page per sheet). */
export function fillPrintRoot(root = document.getElementById('print-root')) {
  const doc = app.doc;
  if (!root || !doc) return false;
  const pages = doc.pages.map((page, i) => {
    const sheet = document.createElement('div');
    sheet.className = 'print-sheet';
    sheet.style.width = `${doc.setup.width}px`;
    sheet.style.height = `${doc.setup.height}px`;
    const inner = document.createElement('div');
    renderPage(inner, doc, page, { mode: 'export', pageIndex: i });
    sheet.appendChild(inner);
    return sheet;
  });
  root.replaceChildren(...pages);
  let style = document.getElementById('print-page-size');
  if (!style) { style = document.createElement('style'); style.id = 'print-page-size'; document.head.appendChild(style); }
  style.textContent = `@page { size: ${doc.setup.width / 96}in ${doc.setup.height / 96}in; margin: 0; }`;
  return true;
}

/** Install beforeprint/afterprint handlers. */
export function installPrintFallback() {
  window.addEventListener('beforeprint', () => {
    app.flush();
    const root = document.getElementById('print-root');
    if (!root || root.childElementCount) return;
    filled = fillPrintRoot(root);
  });
  window.addEventListener('afterprint', () => {
    if (!filled) return;
    filled = false;
    const root = document.getElementById('print-root');
    if (root) root.replaceChildren();
    document.getElementById('print-page-size')?.remove();
  });
}
