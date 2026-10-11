/* Folio Publisher — small pure helpers for exported image files: DPI metadata and file names. */

let CRC_TABLE = null;

/**
 * CRC-32 (IEEE) of a byte array, as used by PNG chunks.
 * @param {Uint8Array} bytes
 * @returns {number} unsigned 32-bit CRC
 */
export function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

/**
 * Return a copy of a PNG with a pHYs chunk recording `dpi` (replacing any existing pHYs).
 * Non-PNG input is returned unchanged.
 * @param {Uint8Array} png
 * @param {number} dpi
 * @returns {Uint8Array}
 */
export function setPngDpi(png, dpi) {
  if (!(png instanceof Uint8Array) || png.length < 33 || PNG_SIG.some((b, i) => png[i] !== b)) return png;
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // 'pHYs'
  dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1; // unit: metre
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const parts = [png.subarray(0, 8)];
  const src = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let pos = 8; let inserted = false;
  while (pos + 12 <= png.length) {
    const len = src.getUint32(pos);
    const type = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
    const end = pos + 12 + len;
    if (type !== 'pHYs') parts.push(png.subarray(pos, end));
    if (type === 'IHDR' && !inserted) { parts.push(chunk); inserted = true; }
    pos = end;
  }
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/**
 * Read the DPI stored in a PNG pHYs chunk, or null.
 * @param {Uint8Array} png
 * @returns {number|null}
 */
export function getPngDpi(png) {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let pos = 8;
  while (pos + 12 <= png.length) {
    const len = dv.getUint32(pos);
    const type = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
    if (type === 'pHYs' && png[pos + 16] === 1) return Math.round(dv.getUint32(pos + 8) * 0.0254);
    if (type === 'IDAT') break;
    pos += 12 + len;
  }
  return null;
}

/**
 * Return a copy of a JPEG with its JFIF density set to `dpi` (inserting an APP0 JFIF segment when absent).
 * Non-JPEG input is returned unchanged.
 * @param {Uint8Array} jpg
 * @param {number} dpi
 * @returns {Uint8Array}
 */
export function setJpegDpi(jpg, dpi) {
  if (!(jpg instanceof Uint8Array) || jpg.length < 4 || jpg[0] !== 0xff || jpg[1] !== 0xd8) return jpg;
  const d = Math.max(1, Math.min(65535, Math.round(dpi)));
  const isJfif = jpg[2] === 0xff && jpg[3] === 0xe0 && jpg[6] === 0x4a && jpg[7] === 0x46 && jpg[8] === 0x49 && jpg[9] === 0x46 && jpg[10] === 0;
  if (isJfif) {
    const out = jpg.slice();
    out[13] = 1; out[14] = d >> 8; out[15] = d & 0xff; out[16] = d >> 8; out[17] = d & 0xff;
    return out;
  }
  const app0 = new Uint8Array([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, d >> 8, d & 0xff, d >> 8, d & 0xff, 0, 0]);
  const out = new Uint8Array(jpg.length + app0.length);
  out.set(jpg.subarray(0, 2), 0); out.set(app0, 2); out.set(jpg.subarray(2), 2 + app0.length);
  return out;
}

/**
 * Read the JFIF density of a JPEG in dots per inch, or null.
 * @param {Uint8Array} jpg
 * @returns {number|null}
 */
export function getJpegDpi(jpg) {
  if (jpg[2] !== 0xff || jpg[3] !== 0xe0 || jpg[6] !== 0x4a) return null;
  if (jpg[13] !== 1) return null;
  return (jpg[14] << 8) | jpg[15];
}

/**
 * Make a string safe to use as a file name on Windows, macOS and Linux.
 * @param {string} name
 * @param {string} [fallback='Untitled']
 * @returns {string}
 */
export function safeFileName(name, fallback = 'Untitled') {
  let s = String(name ?? '').normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^[. ]+/, '').replace(/[. ]+$/, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(s)) s = `_${s}`;
  if (s.length > 120) s = s.slice(0, 120).trim();
  return s || fallback;
}

/**
 * Build output file names for exported pages: 'Name.png' for one page, else 'Name - Page 3.png',
 * with ' - Record 2' when exporting merge records.
 * @param {{ baseName:string, ext:string, pageIndex:number, total:number, recordIndex?:number|null, recordCount?:number }} o
 * @returns {string}
 */
export function pageFileName({ baseName, ext, pageIndex, total, recordIndex = null, recordCount = 0 }) {
  const base = safeFileName(String(baseName || 'Publication').replace(/\.(folio|json|pdf|png|jpe?g)$/i, ''));
  const parts = [base];
  if (recordIndex != null && recordCount > 1) parts.push(`Record ${String(recordIndex + 1).padStart(String(recordCount).length, '0')}`);
  if (total > 1) parts.push(`Page ${pageIndex + 1}`);
  return `${parts.join(' - ')}.${ext}`;
}
