// Microsoft Publisher (.pub) import: the text and the pictures of a publication, placed on Folio
// pages. Publisher's own layout (frame positions, styles, page size) lives in an undocumented binary
// format and is not kept: the text flows into linked text boxes on Letter pages, followed by the pictures.
import { readCfb, isCfb } from './cfb.js';
import { createDocument, createPage, createTextFrame, createElement, addAsset } from '../../core/model.js';

export { isCfb };

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

/** The publication's text: Quill/QuillSub/CONTENTS holds a chunk table; the TEXT chunk is UTF-16. */
export function pubText(streams) {
  const q = streams.get('Quill/QuillSub/CONTENTS');
  if (!q || q.length < 0x20) return '';
  const dv = new DataView(q.buffer, q.byteOffset, q.byteLength);
  const name = (o) => String.fromCharCode(q[o], q[o + 1], q[o + 2], q[o + 3]);
  let text = '';
  // chunk entries are 24 bytes from 0x20: u16 size, name, u16, u16 id, u16, name, u32 offset, u32 length
  for (let o = 0x20; o + 24 <= Math.min(q.length, 0x1000); o += 24) {
    if (dv.getUint16(o, true) !== 0x18) break;
    if (name(o + 2) !== 'TEXT') continue;
    const off = dv.getUint32(o + 16, true), len = dv.getUint32(o + 20, true);
    if (off + len > q.length) break;
    for (let i = off; i + 1 < off + len; i += 2) text += String.fromCharCode(dv.getUint16(i, true));
  }
  return text;
}

/** Pictures stored as Escher (Office Drawing) BLIP records: JPEG and PNG data. */
export function pubPictures(streams) {
  const out = [];
  for (const key of ['Escher/EscherDelayStm', 'Escher/EscherStm']) {
    const s = streams.get(key);
    if (!s) continue;
    const dv = new DataView(s.buffer, s.byteOffset, s.byteLength);
    const scan = (from, to) => {
      for (let o = from; o + 8 <= to;) {
        const verInst = dv.getUint16(o, true), type = dv.getUint16(o + 2, true), len = dv.getUint32(o + 4, true);
        const body = o + 8, end = Math.min(to, body + len);
        if ((verInst & 0xf) === 0xf) scan(body, end); // container
        else if (type === 0xf01d || type === 0xf01e || type === 0xf02a) {
          const inst = verInst >> 4;
          const twoUids = type === 0xf01e ? inst === 0x6e1 : inst === 0x46b || inst === 0x6e3;
          const data = s.subarray(body + 16 + (twoUids ? 16 : 0) + 1, end);
          const mime = type === 0xf01e ? 'image/png' : 'image/jpeg';
          const dim = imageSize(data, mime);
          if (dim) out.push({ mime, data, ...dim });
        } else if (type === 0xf007 && len > 36) scan(body + 36, end); // BSE: may embed its BLIP
        if (len === 0 && (verInst & 0xf) !== 0xf) break;
        o = body + len;
      }
    };
    scan(0, s.length);
  }
  return out;
}

function imageSize(d, mime) {
  if (mime === 'image/png') {
    if (d.length < 24 || d[1] !== 0x50 || d[2] !== 0x4e) return null;
    const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (d[0] !== 0xff || d[1] !== 0xd8) return null;
  for (let o = 2; o + 9 < d.length;) {
    if (d[o] !== 0xff) { o++; continue; }
    const m = d[o + 1], len = (d[o + 2] << 8) | d[o + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: (d[o + 5] << 8) | d[o + 6], width: (d[o + 7] << 8) | d[o + 8] };
    o += 2 + len;
  }
  return null;
}

const toDataUrl = (bytes, mime) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
};

/**
 * Build a Folio document from .pub bytes. Throws when the file is not a Publisher file.
 * @returns {{ doc: object, paragraphs: number, pictures: number }}
 */
export function importPub(bytes, title = 'Imported publication') {
  const streams = readCfb(bytes);
  if (!streams.has('Contents') || !streams.has('Quill/QuillSub/CONTENTS')) throw new Error('This is not a Microsoft Publisher file.');
  const text = pubText(streams).replace(/\u0000/g, '');
  const paras = text.split(/\r\n?|\n|\u000b|\u000c/).map((p) => p.replace(/[\u0000-\u0008\u000e-\u001f]/g, '').trim()).filter(Boolean);
  const pics = pubPictures(streams);

  const doc = createDocument({ title, pages: 1 });
  const { width: W, height: H, margins: m } = doc.setup;
  const box = { x: m.left, y: m.top, w: W - m.left - m.right, h: H - m.top - m.bottom };

  if (paras.length) {
    // one story flowing through linked boxes, one page per ~45 lines of 12pt text
    const html = paras.map((p) => `<p>${esc(p)}</p>`).join('');
    const lines = paras.reduce((n, p) => n + Math.ceil(p.length / 80), 0);
    const pageCount = Math.max(1, Math.ceil(lines / 45));
    const first = createTextFrame(doc, { ...box, name: 'Imported text' }, html);
    let prev = first;
    doc.pages[0].elements.push(first);
    for (let i = 1; i < pageCount; i++) {
      const page = createPage(doc);
      doc.pages.push(page);
      const next = createElement('text', { ...box, storyId: first.storyId, name: 'Imported text' });
      prev.next = next.id;
      page.elements.push(next);
      prev = next;
    }
  }
  pics.forEach((p, i) => {
    const page = !paras.length && i === 0 ? doc.pages[0] : createPage(doc);
    if (page !== doc.pages[0]) doc.pages.push(page);
    const scale = Math.min(box.w / p.width, box.h / p.height, 1);
    const w = Math.round(p.width * scale), h = Math.round(p.height * scale);
    const assetId = addAsset(doc, { name: `Picture ${i + 1}`, mime: p.mime, data: toDataUrl(p.data, p.mime), width: p.width, height: p.height });
    page.elements.push(createElement('image', { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h, assetId, name: `Picture ${i + 1}` }));
  });
  return { doc, paragraphs: paras.length, pictures: pics.length };
}
