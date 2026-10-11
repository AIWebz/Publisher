import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { crc32, setPngDpi, getPngDpi, setJpegDpi, getJpegDpi, safeFileName, pageFileName } from '../../src/engines/export/imagemeta.js';

const require = createRequire(import.meta.url);
const ipc = require('../../desktop/ipc-export.js');

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(new Uint8Array(Buffer.concat([Buffer.from(type, 'ascii'), data]))), 0);
  return Buffer.concat([head, data, crc]);
}
function tinyPng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  const idat = zlib.deflateSync(Buffer.from([0, 255, 0, 0, 255]));
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
}

test('crc32 matches zlib', () => {
  const b = Buffer.from('Folio Publisher');
  assert.equal(crc32(new Uint8Array(b)), zlib.crc32(b));
});

test('setPngDpi inserts a valid pHYs chunk after IHDR and replaces an existing one', () => {
  const png = tinyPng();
  assert.equal(getPngDpi(png), null);
  const out = setPngDpi(png, 300);
  assert.equal(out.length, png.length + 21);
  assert.equal(getPngDpi(out), 300);
  assert.equal(Buffer.from(out.subarray(37, 41)).toString('ascii'), 'pHYs');
  // chunk CRC valid
  const dv = new DataView(out.buffer);
  assert.equal(dv.getUint32(33 + 17), crc32(out.subarray(37, 50)));
  const again = setPngDpi(out, 72);
  assert.equal(again.length, out.length);
  assert.equal(getPngDpi(again), 72);
  assert.equal(setPngDpi(new Uint8Array([1, 2, 3]), 300).length, 3);
});

test('setJpegDpi edits the JFIF density or inserts an APP0 segment', () => {
  const jfif = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
  const out = setJpegDpi(jfif, 300);
  assert.equal(getJpegDpi(out), 300);
  assert.equal(out.length, jfif.length);
  const bare = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 2, 0xff, 0xd9]);
  const ins = setJpegDpi(bare, 150);
  assert.equal(ins.length, bare.length + 18);
  assert.equal(getJpegDpi(ins), 150);
  assert.deepEqual([...ins.subarray(ins.length - 6)], [0xff, 0xdb, 0, 2, 0xff, 0xd9]);
});

test('safeFileName / pageFileName', () => {
  assert.equal(safeFileName('a/b\\c:d*?.png'), 'a b c d .png');
  assert.equal(safeFileName('..\\..\\evil'), 'evil');
  assert.equal(safeFileName('  '), 'Untitled');
  assert.equal(safeFileName('CON'), '_CON');
  assert.equal(pageFileName({ baseName: 'Flyer.folio', ext: 'png', pageIndex: 0, total: 1 }), 'Flyer.png');
  assert.equal(pageFileName({ baseName: 'News', ext: 'jpg', pageIndex: 2, total: 4 }), 'News - Page 3.jpg');
  assert.equal(pageFileName({ baseName: 'Card', ext: 'png', pageIndex: 0, total: 2, recordIndex: 4, recordCount: 12 }), 'Card - Record 05 - Page 1.png');
});

test('ipc-export: safeName strips paths and unsafe characters', () => {
  assert.equal(ipc.safeName('../../etc/passwd'), 'passwd');
  assert.equal(ipc.safeName('C:\\Windows\\system32\\x.dll'), 'x.dll');
  assert.equal(ipc.safeName('..'), 'Untitled');
  assert.equal(ipc.safeName('a<b>|c?.png'), 'a b c .png');
  assert.equal(ipc.safeName('nul.txt'), '_nul.txt');
  assert.equal(ipc.withExt('Flyer', ['pdf']), 'Flyer.pdf');
  assert.equal(ipc.withExt('Flyer.PDF', ['pdf']), 'Flyer.PDF');
});

test('ipc-export: uniqueName never overwrites', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-export-'));
  fs.writeFileSync(path.join(dir, 'a.png'), 'x');
  fs.writeFileSync(path.join(dir, 'a (2).png'), 'x');
  assert.equal(ipc.uniqueName(dir, 'a.png'), 'a (3).png');
  assert.equal(ipc.uniqueName(dir, 'b.png'), 'b.png');
  assert.equal(ipc.uniqueName(dir, 'b.png', new Set(['b.png'])), 'b (2).png');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ipc-export: buffers, filters, sizes and print options', () => {
  assert.equal(ipc.toBuffer('hé').length, 3);
  assert.deepEqual([...ipc.toBuffer(new Uint8Array([1, 2, 3]).subarray(1))], [2, 3]);
  assert.throws(() => ipc.toBuffer({}), TypeError);
  assert.deepEqual(ipc.cleanFilters([{ name: 'PNG image', extensions: ['.png', 'x/y'] }]), [{ name: 'PNG image', extensions: ['png', 'xy'] }]);
  assert.deepEqual(ipc.cleanFilters(null, 'pdf'), [{ name: 'PDF', extensions: ['pdf'] }]);
  assert.deepEqual(ipc.pageSizeIn(8.5, 11, true), { width: 11, height: 8.5 });
  assert.equal(ipc.pageSizeIn(0, 11), null);
  const p = ipc.normalizePrintOptions({ copies: '3', duplex: 'longEdge', landscape: 1, pageRanges: [{ from: 0, to: 1 }, { from: -1, to: 2 }], deviceName: 'Office', widthIn: 8.5, heightIn: 11 });
  assert.deepEqual(p, {
    silent: false, printBackground: true, copies: 3, duplexMode: 'longEdge', landscape: true,
    margins: { marginType: 'none' }, color: true, pageRanges: [{ from: 0, to: 1 }], deviceName: 'Office',
    pageSize: { width: 215900, height: 279400 }
  });
  const d = ipc.normalizePrintOptions({ duplex: 'sideways', copies: 0, silent: true });
  assert.equal(d.duplexMode, 'simplex'); assert.equal(d.copies, 1); assert.equal(d.silent, false);
});
