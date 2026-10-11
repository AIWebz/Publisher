// Minimal writers/readers for the Apple Icon Image (.icns) and Windows icon (.ico) containers.
// Pure functions over Uint8Array/Buffer so they can be unit-tested without a renderer.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** True when `data` starts with the PNG signature. */
export const isPng = (data) => PNG_SIGNATURE.every((b, i) => data[i] === b);

/** Reads width/height from a PNG's IHDR chunk. */
export function pngSize(data) {
  if (!isPng(data)) throw new Error('Not a PNG');
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

/**
 * Builds an .icns file from PNG chunks.
 * @param {{ type: string, data: Uint8Array }[]} chunks  four-character OSType (e.g. 'ic10') + PNG bytes
 * @returns {Buffer}
 */
export function icnsFile(chunks) {
  const parts = [];
  let total = 8;
  for (const { type, data } of chunks) {
    if (!/^[\x20-\x7e]{4}$/.test(type)) throw new Error(`Bad icns type ${type}`);
    const head = Buffer.alloc(8);
    head.write(type, 0, 'latin1');
    head.writeUInt32BE(data.length + 8, 4);
    parts.push(head, Buffer.from(data));
    total += data.length + 8;
  }
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'latin1');
  header.writeUInt32BE(total, 4);
  return Buffer.concat([header, ...parts], total);
}

/**
 * Parses an .icns file into its chunks.
 * @param {Uint8Array} buf
 * @returns {{ type: string, data: Buffer }[]}
 */
export function readIcns(buf) {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (b.toString('latin1', 0, 4) !== 'icns') throw new Error('Not an icns file');
  const total = b.readUInt32BE(4);
  if (total !== b.length) throw new Error(`icns length ${total} != file size ${b.length}`);
  const chunks = [];
  for (let off = 8; off < total;) {
    const type = b.toString('latin1', off, off + 4);
    const len = b.readUInt32BE(off + 4);
    if (len < 8 || off + len > total) throw new Error(`Bad icns chunk ${type}`);
    chunks.push({ type, data: b.subarray(off + 8, off + len) });
    off += len;
  }
  return chunks;
}

/** 32-bit BGRA DIB (BITMAPINFOHEADER + bottom-up pixels + AND mask) for one icon image. */
function dib(size, rgba) {
  if (rgba.length !== size * size * 4) throw new Error(`Expected ${size}x${size} RGBA pixels`);
  const maskStride = Math.ceil(size / 32) * 4;
  const pixels = size * size * 4;
  const out = Buffer.alloc(40 + pixels + maskStride * size);
  out.writeUInt32LE(40, 0);
  out.writeInt32LE(size, 4);
  out.writeInt32LE(size * 2, 8);       // XOR + AND masks
  out.writeUInt16LE(1, 12);            // planes
  out.writeUInt16LE(32, 14);           // bits per pixel
  out.writeUInt32LE(0, 16);            // BI_RGB
  out.writeUInt32LE(pixels + maskStride * size, 20);
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * size * 4;   // bottom-up
    for (let x = 0; x < size; x++) {
      const s = src + x * 4;
      const d = 40 + (y * size + x) * 4;
      out[d] = rgba[s + 2]; out[d + 1] = rgba[s + 1]; out[d + 2] = rgba[s]; out[d + 3] = rgba[s + 3];
      if (rgba[s + 3] === 0) {
        const m = 40 + pixels + y * maskStride + (x >> 3);
        out[m] |= 0x80 >> (x & 7);
      }
    }
  }
  return out;
}

/**
 * Builds a .ico file. Each entry is either `{ size, png }` (stored PNG-compressed; used for 256 px)
 * or `{ size, rgba }` (raw RGBA pixels, stored as a classic 32-bit DIB for maximum compatibility).
 * @param {({ size: number, png: Uint8Array } | { size: number, rgba: Uint8Array })[]} entries
 * @returns {Buffer}
 */
export function icoFile(entries) {
  const sorted = [...entries].sort((a, b) => a.size - b.size);
  const images = sorted.map((e) => (e.png ? Buffer.from(e.png) : dib(e.size, e.rgba)));
  const header = Buffer.alloc(6 + 16 * sorted.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sorted.length, 4);
  let offset = header.length;
  sorted.forEach((e, i) => {
    if (e.size < 1 || e.size > 256) throw new Error(`Bad icon size ${e.size}`);
    const p = 6 + i * 16;
    header[p] = e.size >= 256 ? 0 : e.size;
    header[p + 1] = e.size >= 256 ? 0 : e.size;
    header.writeUInt16LE(1, p + 4);
    header.writeUInt16LE(32, p + 6);
    header.writeUInt32LE(images[i].length, p + 8);
    header.writeUInt32LE(offset, p + 12);
    offset += images[i].length;
  });
  return Buffer.concat([header, ...images]);
}

/**
 * Parses an .ico directory.
 * @param {Uint8Array} buf
 * @returns {{ width: number, height: number, bitCount: number, png: boolean, data: Buffer }[]}
 */
export function readIco(buf) {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (b.readUInt16LE(0) !== 0 || b.readUInt16LE(2) !== 1) throw new Error('Not an ico file');
  const n = b.readUInt16LE(4);
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = 6 + i * 16;
    const len = b.readUInt32LE(p + 8);
    const off = b.readUInt32LE(p + 12);
    if (off + len > b.length) throw new Error('Truncated ico');
    const data = b.subarray(off, off + len);
    out.push({ width: b[p] || 256, height: b[p + 1] || 256, bitCount: b.readUInt16LE(p + 6), png: isPng(data), data });
  }
  return out;
}
