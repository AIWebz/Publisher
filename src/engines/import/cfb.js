// Reader for Microsoft Compound File Binary containers (the OLE "structured storage" that .pub, .doc
// and .xls files are stored in). readCfb(bytes) -> Map of stream path ('Quill/QuillSub/CONTENTS') to bytes.

const FREE = 0xffffffff, END = 0xfffffffe;

export function isCfb(bytes) {
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return bytes && bytes.length >= 512 && sig.every((b, i) => bytes[i] === b);
}

export function readCfb(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!isCfb(bytes)) throw new Error('Not a compound file');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o) => dv.getUint16(o, true), u32 = (o) => dv.getUint32(o, true);
  const shift = u16(0x1e), size = 1 << shift, miniSize = 1 << u16(0x20);
  const cutoff = u32(0x38);
  const sector = (id) => bytes.subarray((id + 1) * size, (id + 2) * size);

  // FAT: the sectors listed in the header's DIFAT and its continuation sectors
  const fatSectors = [];
  for (let i = 0; i < 109; i++) { const s = u32(0x4c + i * 4); if (s !== FREE) fatSectors.push(s); }
  for (let d = u32(0x44), n = u32(0x48); n-- > 0 && d !== END && d !== FREE;) {
    const off = (d + 1) * size;
    for (let i = 0; i < size / 4 - 1; i++) { const s = u32(off + i * 4); if (s !== FREE) fatSectors.push(s); }
    d = u32(off + size - 4);
  }
  const fat = [];
  for (const s of fatSectors) { const off = (s + 1) * size; for (let i = 0; i < size / 4; i++) fat.push(u32(off + i * 4)); }
  const chain = (start, table) => {
    const out = [];
    for (let s = start, guard = 0; s !== END && s !== FREE && s < table.length && guard < table.length; guard++) { out.push(s); s = table[s]; }
    return out;
  };
  const readChain = (start) => {
    const ids = chain(start, fat);
    const out = new Uint8Array(ids.length * size);
    ids.forEach((id, i) => out.set(sector(id), i * size));
    return out;
  };

  // directory
  const dir = readChain(u32(0x30));
  const ddv = new DataView(dir.buffer);
  const entries = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const len = ddv.getUint16(o + 64, true);
    let name = '';
    for (let i = 0; i < Math.max(0, len / 2 - 1); i++) name += String.fromCharCode(ddv.getUint16(o + i * 2, true));
    entries.push({ name, type: dir[o + 66], left: ddv.getUint32(o + 68, true), right: ddv.getUint32(o + 72, true),
      child: ddv.getUint32(o + 76, true), start: ddv.getUint32(o + 116, true), size: ddv.getUint32(o + 120, true) });
  }
  const root = entries[0];

  // mini stream (small streams live inside the root entry's stream, in 64-byte mini sectors)
  const miniFat = [];
  if (u32(0x40)) { const mf = readChain(u32(0x3c)); const mdv = new DataView(mf.buffer); for (let i = 0; i < mf.length / 4; i++) miniFat.push(mdv.getUint32(i * 4, true)); }
  const ministream = root && root.start !== END ? readChain(root.start) : new Uint8Array(0);
  const readMini = (start, n) => {
    const ids = chain(start, miniFat);
    const out = new Uint8Array(ids.length * miniSize);
    ids.forEach((id, i) => out.set(ministream.subarray(id * miniSize, (id + 1) * miniSize), i * miniSize));
    return out.subarray(0, n);
  };

  const streams = new Map();
  const seen = new Set();
  const walk = (id, prefix) => {
    if (id === FREE || id >= entries.length || seen.has(id)) return;
    seen.add(id);
    const e = entries[id];
    walk(e.left, prefix);
    walk(e.right, prefix);
    const path = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.type === 2) streams.set(path, e.size < cutoff ? readMini(e.start, e.size) : readChain(e.start).subarray(0, e.size));
    else if (e.type === 1) walk(e.child, path);
  };
  if (root) walk(root.child, '');
  return streams;
}
