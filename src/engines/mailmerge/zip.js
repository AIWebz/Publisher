// Minimal ZIP reader (enough for .xlsx and .ods): end-of-central-directory (incl. ZIP64), central
// directory, local headers, stored and deflated entries (inflated with DecompressionStream
// 'deflate-raw', available in browsers and Node 18+), CRC-32 verification. Entry sizes always come
// from the central directory, so entries written with data descriptors (flag bit 3) read fine.
// Runs in node and the browser.

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_EOCD64_LOC = 0x07064b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;

let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[n] = c >>> 0;
  }
  return CRC_TABLE;
}

/**
 * CRC-32 (IEEE) of bytes.
 * @param {Uint8Array} bytes
 * @returns {number} unsigned 32-bit
 */
export function crc32(bytes) {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Inflate raw DEFLATE data.
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array>}
 */
export async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('This environment cannot decompress ZIP data (DecompressionStream is missing).');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError('Expected an ArrayBuffer or Uint8Array.');
}

/** True when bytes start with a ZIP local-file (or empty-archive) signature. */
export function isZip(input) {
  const b = toBytes(input);
  return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && ((b[2] === 3 && b[3] === 4) || (b[2] === 5 && b[3] === 6));
}

const utf8 = new TextDecoder('utf-8');

/**
 * Open a ZIP archive.
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{ names: string[], has(name: string): boolean, entry(name: string): object|null,
 *   read(name: string): Promise<Uint8Array>, readText(name: string): Promise<string> }}
 *   read/readText reject when the entry is missing; use has() first for optional parts.
 */
export function openZip(input) {
  const bytes = toBytes(input);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = bytes.length;
  const u16 = (o) => dv.getUint16(o, true);
  const u32 = (o) => dv.getUint32(o, true);
  const u64 = (o) => {
    const v = dv.getUint32(o, true) + dv.getUint32(o + 4, true) * 0x100000000;
    if (!Number.isSafeInteger(v)) throw new Error('The ZIP archive is too large.');
    return v;
  };
  if (len < 22) throw new Error('The file is not a valid ZIP archive (too short).');

  // end of central directory: search backwards (comment may be up to 65535 bytes)
  let eocd = -1;
  for (let o = len - 22, stop = Math.max(0, len - 22 - 65535); o >= stop; o--) {
    if (u32(o) === SIG_EOCD && o + 22 + u16(o + 20) <= len) { eocd = o; break; }
  }
  if (eocd < 0) throw new Error('The file is not a valid ZIP archive (no end of central directory).');
  if (u16(eocd + 4) !== 0 && u16(eocd + 4) !== 0xffff) throw new Error('Multi-volume (split) ZIP archives are not supported.');
  let count = u16(eocd + 10);
  let cdSize = u32(eocd + 12);
  let cdOffset = u32(eocd + 16);

  // ZIP64 end of central directory locator sits right before the EOCD
  if (eocd >= 20 && u32(eocd - 20) === SIG_EOCD64_LOC) {
    const rec = u64(eocd - 20 + 8);
    if (rec + 56 > len || u32(rec) !== SIG_EOCD64) throw new Error('The ZIP64 archive is damaged (bad ZIP64 end record).');
    count = u64(rec + 32);
    cdSize = u64(rec + 40);
    cdOffset = u64(rec + 48);
  } else if (count === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    throw new Error('The ZIP64 archive is damaged (missing ZIP64 locator).');
  }
  if (cdOffset + cdSize > len) throw new Error('The ZIP archive is truncated or damaged (central directory out of range).');

  const entries = new Map();
  let p = cdOffset;
  for (let k = 0; k < count; k++) {
    if (p + 46 > len || u32(p) !== SIG_CEN) throw new Error('The ZIP archive is damaged (bad central directory entry).');
    const flags = u16(p + 8);
    const method = u16(p + 10);
    const crc = u32(p + 16);
    let csize = u32(p + 20);
    let usize = u32(p + 24);
    const nameLen = u16(p + 28), extraLen = u16(p + 30), commentLen = u16(p + 32);
    let offset = u32(p + 42);
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    // ZIP64 extended information extra field (0x0001): only the fields whose 32-bit value is 0xFFFFFFFF
    let e = p + 46 + nameLen;
    const eEnd = e + extraLen;
    while (e + 4 <= eEnd) {
      const id = u16(e), size = u16(e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (usize === 0xffffffff) { usize = u64(q); q += 8; }
        if (csize === 0xffffffff) { csize = u64(q); q += 8; }
        if (offset === 0xffffffff) { offset = u64(q); q += 8; }
      }
      e += 4 + size;
    }
    entries.set(name, { name, flags, method, crc, csize, usize, offset, dir: name.endsWith('/') });
    p += 46 + nameLen + extraLen + commentLen;
  }

  async function read(name) {
    const ent = entries.get(name);
    if (!ent) throw new Error(`The archive has no "${name}".`);
    if (ent.flags & 1) throw new Error('The file is password protected (encrypted). Remove the password and try again.');
    const o = ent.offset;
    if (o + 30 > len || u32(o) !== SIG_LOC) throw new Error(`The ZIP archive is damaged (bad local header for "${name}").`);
    const start = o + 30 + u16(o + 26) + u16(o + 28);
    if (start + ent.csize > len) throw new Error(`The ZIP archive is truncated ("${name}").`);
    const raw = bytes.subarray(start, start + ent.csize);
    let out;
    if (ent.method === 0) out = raw.slice();
    else if (ent.method === 8) {
      try { out = await inflateRaw(raw); } catch (err) { throw new Error(`The ZIP archive is damaged (cannot inflate "${name}").`); }
    } else throw new Error(`Unsupported ZIP compression method ${ent.method} for "${name}".`);
    if (out.length !== ent.usize || crc32(out) !== ent.crc) throw new Error(`The ZIP archive is damaged (checksum mismatch in "${name}").`);
    return out;
  }

  return {
    names: [...entries.keys()],
    has: (name) => entries.has(name),
    entry: (name) => entries.get(name) || null,
    read,
    async readText(name) { return utf8.decode(await read(name)).replace(/^﻿/, ''); }
  };
}
