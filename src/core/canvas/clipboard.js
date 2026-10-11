// Object clipboard on the canvas: cut/copy/paste/duplicate/delete, the OS clipboard (pasting
// pictures and plain text from other apps, copying plain text out) and drag-and-drop of picture
// and publication files. The internal clip is shared by all document tabs.

import { app } from '../app.js';
import { makeClip, pasteClip, nextPasteOffset, clipText } from '../clipboard.js';
import { deleteElements } from '../ops.js';
import { isTextTarget } from '../shortcuts.js';
import { dialogOpen } from '../ui/dialog.js';
import { insertPictures, insertTextBox } from '../insert.js';

let clip = null;
let nativeTimer = 0;

const CLIP_MIME = 'application/x-folio-clip';

/** True if there is something to paste from the internal clipboard. */
export function hasClip() { return !!clip; }

function selectedTop() {
  return app.selection;
}

/** Copy the selection into the internal clipboard. Returns the plain text for the OS clipboard. */
export function copySelection() {
  const doc = app.doc, page = app.page;
  const sel = selectedTop();
  if (!doc || !sel.length) return null;
  clip = makeClip(doc, sel, { pageId: page ? page.id : null });
  clip.text = clipText(clip);
  return clip.text;
}

/** Delete the selection (locked objects are kept). Returns the number deleted. */
export function deleteSelection(label = 'Delete') {
  const sel = selectedTop();
  if (!sel.length) return 0;
  const ids = sel.filter((el) => !el.locked).map((el) => el.id);
  if (!ids.length) { app.ui.toast('Locked objects cannot be deleted. Unlock them first.'); return 0; }
  if (ids.length < sel.length) app.ui.toast('Locked objects were not deleted.');
  let n = 0;
  app.transact(label, (doc) => { n = deleteElements(doc, ids); app.select([]); });
  return n;
}

/** Cut = copy + delete (one undo step "Cut"). */
export function cutSelection() {
  const sel = selectedTop();
  if (!sel.length) return null;
  const text = copySelection();
  clip.pastes = -1;
  deleteSelection('Cut');
  return text;
}

/** Paste the internal clip onto the current page (offset on repeated pastes). */
export function pasteInternal() {
  const doc = app.doc, page = app.page;
  if (!clip || !doc || !page) return false;
  const offset = nextPasteOffset(clip, doc.id, page.id);
  app.transact('Paste', (d) => {
    const els = pasteClip(clip, d, { offset, pageWidth: d.setup.width, pageHeight: d.setup.height });
    app.page.elements.push(...els);
    app.select(els.map((e) => e.id));
  });
  return true;
}

/** Duplicate the selection in place (offset 12 px). */
export function duplicateSelection() {
  const doc = app.doc, page = app.page;
  const sel = selectedTop();
  if (!doc || !page || !sel.length) return false;
  const c = makeClip(doc, sel, { pageId: page.id });
  app.transact('Duplicate', (d) => {
    const els = pasteClip(c, d, { offset: 12, pageWidth: d.setup.width, pageHeight: d.setup.height });
    app.page.elements.push(...els);
    app.select(els.map((e) => e.id));
  });
  return true;
}

/**
 * Paste from a DataTransfer-like source: pictures become picture frames, plain text that is not the
 * text of our own last copy becomes a text box, otherwise the internal clip is pasted.
 * @param {{ files: File[], text: string, html?: string, folio?: boolean }} data
 */
export function pasteData(data) {
  if (data.folio && clip) return pasteInternal();
  const images = (data.files || []).filter((f) => /^image\//.test(f.type));
  if (images.length) { insertPictures(images).catch((err) => app.reportError(err, 'Paste')); return true; }
  const text = (data.text || '').replace(/\r\n?/g, '\n');
  if (clip && (text === (clip.text || '') || !text.trim())) return pasteInternal();
  if (text.trim()) { insertTextBox(text); return true; }
  return pasteInternal();
}

/** Paste via the async Clipboard API (ribbon/menu Paste), falling back to the internal clip. */
export async function pasteFromSystem() {
  if (!navigator.clipboard || !navigator.clipboard.read) return pasteInternal();
  try {
    const items = await navigator.clipboard.read();
    const files = [];
    let text = '';
    for (const it of items) {
      const img = it.types.find((t) => /^image\//.test(t));
      if (img) { const b = await it.getType(img); files.push(new File([b], `pasted.${img.split('/')[1] || 'png'}`, { type: img })); continue; }
      if (it.types.includes('text/plain')) text = await (await it.getType('text/plain')).text();
    }
    return pasteData({ files, text });
  } catch {
    return pasteInternal();
  }
}

/**
 * The keyboard dispatcher calls this for Mod+C/X/V so the native copy/cut/paste event (which can
 * reach the OS clipboard) handles them; `fallback` runs if no native event arrives.
 */
export function expectNativeClipboard(fallback) {
  clearTimeout(nativeTimer);
  nativeTimer = setTimeout(fallback, 120);
}

function canHandle(e) {
  if (!app.session || dialogOpen()) return false;
  const t = document.activeElement;
  if (isTextTarget(e.target) || (t && isTextTarget(t))) return false;
  if (app.editing) return false;
  return true;
}

/** Install document clipboard listeners and canvas drag-and-drop. */
export function installCanvasClipboard(cv) {
  document.addEventListener('copy', (e) => {
    if (!canHandle(e)) return;
    clearTimeout(nativeTimer);
    const text = copySelection();
    if (text === null) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', text);
    e.clipboardData.setData(CLIP_MIME, clip.id);
  });
  document.addEventListener('cut', (e) => {
    if (!canHandle(e)) return;
    clearTimeout(nativeTimer);
    if (!app.selection.length) return;
    const text = cutSelection();
    e.preventDefault();
    e.clipboardData.setData('text/plain', text || '');
    if (clip) e.clipboardData.setData(CLIP_MIME, clip.id);
  });
  document.addEventListener('paste', (e) => {
    if (!canHandle(e)) return;
    clearTimeout(nativeTimer);
    const dt = e.clipboardData;
    if (!dt) return;
    e.preventDefault();
    const ownId = dt.getData(CLIP_MIME);
    pasteData({ files: [...(dt.files || [])], text: dt.getData('text/plain'), folio: !!(ownId && clip && ownId === clip.id) });
  });

  const vp = cv.viewport;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  vp.addEventListener('dragover', (e) => {
    if (!hasFiles(e) || !app.session) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    vp.classList.add('drop-target');
  });
  vp.addEventListener('dragleave', (e) => { if (!vp.contains(e.relatedTarget)) vp.classList.remove('drop-target'); });
  vp.addEventListener('drop', async (e) => {
    vp.classList.remove('drop-target');
    if (!hasFiles(e) || !app.session) return;
    e.preventDefault();
    e.stopPropagation();
    const files = [...e.dataTransfer.files];
    const images = files.filter((f) => /^image\//.test(f.type));
    const pubs = files.filter((f) => /\.(folio|json)$/i.test(f.name));
    if (images.length) {
      const p = cv.clientToPage(e.clientX, e.clientY);
      if (p.slot && !app.isMasterMode && p.slot.index !== app.pageIndex) app.goToPage(p.slot.index);
      await insertPictures(images, { at: { x: p.x, y: p.y } });
    }
    for (const f of pubs) {
      if (!app.files || !app.files.openText) { app.ui.toast('Opening files is not available.'); break; }
      try { await app.files.openText(await f.text(), { name: f.name }); } catch (err) { app.reportError(err, `Opening ${f.name}`); }
    }
    if (!images.length && !pubs.length) app.ui.toast('Drop pictures (PNG, JPEG, GIF, WebP, SVG) or .folio publications.');
  });
}
