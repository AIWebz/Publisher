// Packaging artwork: the .icns/.ico readers/writers and the committed icon files in build/
// (generated from build/brand/logo-source.webp by build/tools/make-icons.py).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { icnsFile, readIcns, icoFile, readIco, pngSize, isPng } from '../../build/tools/icon-formats.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => readFileSync(path.join(ROOT, f));

// Pixel size of each PNG-bearing icns chunk type.
const ICNS_SIZE = { icp4: 16, icp5: 32, icp6: 64, ic07: 128, ic08: 256, ic09: 512, ic10: 1024, ic11: 32, ic12: 64, ic13: 256, ic14: 512 };

// 1×1 transparent PNG with a valid IHDR (width/height are what the reader looks at).
const fakePng = (w, h) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
};

test('icnsFile writes a header, chunk lengths and round-trips', () => {
  const a = fakePng(16, 16), b = fakePng(1024, 1024);
  const file = icnsFile([{ type: 'icp4', data: a }, { type: 'ic10', data: b }]);
  assert.equal(file.toString('latin1', 0, 4), 'icns');
  assert.equal(file.readUInt32BE(4), file.length);
  assert.equal(file.length, 8 + 8 + a.length + 8 + b.length);
  const chunks = readIcns(file);
  assert.deepEqual(chunks.map((c) => c.type), ['icp4', 'ic10']);
  assert.deepEqual(pngSize(chunks[1].data), { width: 1024, height: 1024 });
  assert.throws(() => icnsFile([{ type: 'toolong', data: a }]));
  assert.throws(() => readIcns(Buffer.from('nope0000')));
});

test('icoFile stores BMP entries bottom-up with an AND mask, and PNG for 256 px', () => {
  const size = 2;
  // Row 0: red opaque, transparent. Row 1: green opaque, blue half alpha.
  const rgba = Uint8Array.from([255, 0, 0, 255, 0, 0, 0, 0, 0, 255, 0, 255, 0, 0, 255, 128]);
  const png = fakePng(256, 256);
  const file = icoFile([{ size: 256, png }, { size, rgba }]);
  const entries = readIco(file);
  assert.deepEqual(entries.map((e) => [e.width, e.png, e.bitCount]), [[2, false, 32], [256, true, 32]]);
  const dib = entries[0].data;
  assert.equal(dib.readUInt32LE(0), 40);
  assert.equal(dib.readInt32LE(4), 2);
  assert.equal(dib.readInt32LE(8), 4, 'height covers XOR and AND masks');
  // First stored row is the bottom row: green then blue, as BGRA.
  assert.deepEqual([...dib.subarray(40, 48)], [0, 255, 0, 255, 255, 0, 0, 128]);
  assert.deepEqual([...dib.subarray(48, 56)], [0, 0, 255, 255, 0, 0, 0, 0]);
  // AND mask: bottom row fully opaque (0), top row second pixel transparent (bit 6 set).
  const mask = dib.subarray(56);
  assert.equal(mask.length, 8);
  assert.equal(mask[0], 0);
  assert.equal(mask[4], 0x40);
  assert.throws(() => icoFile([{ size: 3, rgba }]));
});

test('build/icon.icns has every macOS app icon size as PNG', () => {
  const chunks = readIcns(read('build/icon.icns')).filter((c) => c.type !== 'TOC ');  // table of contents
  const types = chunks.map((c) => c.type);
  for (const t of ['ic07', 'ic08', 'ic09', 'ic10', 'ic13', 'ic14']) assert.ok(types.includes(t), `missing ${t}`);
  for (const c of chunks) {
    assert.ok(isPng(c.data), `${c.type} is PNG`);
    const { width, height } = pngSize(c.data);
    assert.equal(width, ICNS_SIZE[c.type], c.type);
    assert.equal(height, ICNS_SIZE[c.type], c.type);
  }
});

test('build/folio.icns (document icon) is a valid icns with a 1024 px image', () => {
  const chunks = readIcns(read('build/folio.icns'));
  const big = chunks.find((c) => c.type === 'ic10');
  assert.ok(big);
  assert.deepEqual(pngSize(big.data), { width: 1024, height: 1024 });
});

test('Windows icons carry the sizes Explorer asks for', () => {
  for (const f of ['build/icon.ico', 'build/folio.ico']) {
    const sizes = readIco(read(f)).map((e) => e.width);
    for (const s of [16, 32, 48, 256]) assert.ok(sizes.includes(s), `${f} lacks ${s}px`);
  }
});

test('build/icon.png is 1024×1024 and the DMG backgrounds are 1x/2x pairs', () => {
  assert.deepEqual(pngSize(read('build/icon.png')), { width: 1024, height: 1024 });
  assert.deepEqual(pngSize(read('build/background.png')), { width: 540, height: 380 });
  assert.deepEqual(pngSize(read('build/background@2x.png')), { width: 1080, height: 760 });
});

test('the NSIS sidebar is a 164×314 BMP', () => {
  const bmp = read('build/installerSidebar.bmp');
  assert.equal(bmp.toString('latin1', 0, 2), 'BM');
  assert.equal(bmp.readInt32LE(18), 164);
  assert.equal(Math.abs(bmp.readInt32LE(22)), 314);
});
