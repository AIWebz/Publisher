import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseXLSX, parseODS, columnIndex, columnLetters, excelSerialToString, classifyFormat, formatNumber, displayNumber } from '../../src/engines/mailmerge/xlsx.js';
import { importFile, decodeText } from '../../src/engines/mailmerge/import.js';
import { openZip, crc32 } from '../../src/engines/mailmerge/zip.js';
import { xmlTokens } from '../../src/engines/mailmerge/xml.js';

const FIX = new URL('../fixtures/mailmerge/', import.meta.url);
const load = (name) => {
  const b = readFileSync(new URL(name, FIX));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); // a real ArrayBuffer
};

const RECIPIENTS = {
  name: 'Recipients',
  columns: ['First Name', 'Last Name', 'City', 'Joined', 'Balance', 'Active', 'Note', 'First Name (2)'],
  rows: [
    ['Ada Grace', 'Lovelace', 'London & Paris', '2024-01-15', '$1,234.50', 'TRUE', 'ab', 'Line1\nLine2'],
    ['Bob', '', '', '2000-01-01', '0.3', 'FALSE', '#N/A', ''],
    ['  spaced  ', '42', 'London & Paris', '2024-01-15 18:00', '12.50%', '1,234,567', '', '']
  ],
  hidden: false
};

for (const file of ['people.xlsx', 'people-stored.xlsx', 'people-stream.xlsx', 'people-zip64.xlsx']) {
  test(`parseXLSX reads ${file} (deflate/stored/data descriptors/zip64)`, async () => {
    const { sheets } = await parseXLSX(load(file));
    assert.deepEqual(sheets.map((s) => s.name), ['Recipients', 'Second & More', 'Secret']);
    assert.deepEqual(sheets[0], RECIPIENTS);
    const s2 = sheets[1];
    assert.equal(s2.columns.length, 27); // sparse cell at AA3
    assert.deepEqual(s2.columns.slice(0, 5), ['Code', 'Column 2', 'Time', 'Code (2)', 'Column 5']);
    assert.deepEqual(s2.rows[0].slice(0, 4), ['7', '8', '13:30:00', '2024-03-05']);
    assert.equal(s2.rows[1][26], 'far');
    assert.equal(sheets[2].hidden, true);
    assert.deepEqual(sheets[2].rows, [['hidden value']]);
  });
}

test('parseXLSX reads an openpyxl-written workbook', { skip: !existsSync(new URL('openpyxl.xlsx', FIX)) }, async () => {
  const { sheets } = await parseXLSX(load('openpyxl.xlsx'));
  assert.equal(sheets[0].name, 'Members');
  assert.deepEqual(sheets[0].columns, ['Name', 'Email', 'Birthday', 'Fee', 'Member', 'Zip']);
  assert.deepEqual(sheets[0].rows, [
    ['Zoë Ångström', 'zoe@example.com', '1990-07-04', '$12.50', 'TRUE', '02134'],
    ['Li Wei', '', '1985-12-31 14:30:00', '7', 'FALSE', '10001'],
    ['Omar', 'omar@example.com', '', '', '', '']
  ]);
  assert.deepEqual(sheets[1], { name: 'Empty', columns: [], rows: [], hidden: false });
});

test('parseODS: repeated rows/cols, value types, annotations, hidden table', async () => {
  const { sheets } = await parseODS(load('people.ods'));
  assert.equal(sheets.length, 2);
  const g = sheets[0];
  assert.equal(g.name, 'Guests');
  assert.deepEqual(g.columns, ['Name', 'Date', 'Amount', 'Column 4', 'Flag', 'Time']);
  assert.deepEqual(g.rows, [
    ['Ann  Lee', '2024-01-15', '$1,234.50', 'extra', 'TRUE', '13:30'],
    ['dup', 'dup', '3', '', '', ''],
    ['dup', 'dup', '3', '', '', ''],
    ['Two\nLines', '2024-02-29 08:05', '25%', '', '', '']
  ]);
  assert.equal(g.hidden, false);
  assert.deepEqual(sheets[1], { name: 'Hidden Sheet', columns: ['H'], rows: [['1.5']], hidden: true });
});

test('importFile dispatches on signature and extension', async () => {
  assert.equal((await importFile('x.xlsx', load('people.xlsx'))).format, 'xlsx');
  assert.equal((await importFile('misnamed.csv', load('people.xlsx'))).format, 'xlsx');
  assert.equal((await importFile('people.ods', load('people.ods'))).format, 'ods');
  const cp = await importFile('cp1252.csv', load('cp1252.csv'));
  assert.equal(cp.format, 'csv');
  assert.equal(cp.sheets[0].name, 'cp1252');
  assert.deepEqual(cp.sheets[0].columns, ['Name', 'City', 'Price']);
  assert.deepEqual(cp.sheets[0].rows, [['José', 'Zürich', '€5'], ['Smith; Jr.', 'Köln', '“quoted”']]);
  const bom = await importFile('bom-utf8.csv', load('bom-utf8.csv'));
  assert.deepEqual(bom.sheets[0].rows, [['Ann', 'multi\nline'], ['Bob', 'ünïcödé']]);
  const u16 = await importFile('utf16.txt', load('utf16.txt'));
  assert.deepEqual(u16.sheets[0], { name: 'utf16', columns: ['A', 'B'], rows: [['1', '2']] });
  const tsv = await importFile('tabs.tsv', load('tabs.tsv'));
  assert.deepEqual(tsv.sheets[0].rows, [['Ann', 'Boston, MA']]);
});

test('legacy .xls and bad files are rejected with clear errors', async () => {
  await assert.rejects(importFile('old.xls', load('legacy.xls')), /save it as \.xlsx or \.csv/);
  await assert.rejects(parseXLSX(load('legacy.xls')), /\.xlsx or \.csv/);
  await assert.rejects(importFile('fake.xlsx', new TextEncoder().encode('hello').buffer), /not a valid Excel/);
  await assert.rejects(parseXLSX(new Uint8Array([1, 2, 3])), /not a valid \.xlsx/);
  await assert.rejects(importFile('x.ods', load('people.xlsx')).then(() => parseODS(load('people.xlsx'))), /content\.xml is missing/);
});

test('ZIP reader detects corruption via CRC', async () => {
  const bytes = new Uint8Array(load('people-stored.xlsx'));
  const zip = openZip(bytes);
  const ent = zip.entry('xl/workbook.xml');
  const start = ent.offset + 30 + new DataView(bytes.buffer).getUint16(ent.offset + 26, true) + new DataView(bytes.buffer).getUint16(ent.offset + 28, true);
  const broken = bytes.slice();
  broken[start + 10] ^= 0xff;
  await assert.rejects(openZip(broken).read('xl/workbook.xml'), /checksum/);
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('column letters <-> indices', () => {
  assert.equal(columnIndex('A1'), 0);
  assert.equal(columnIndex('Z9'), 25);
  assert.equal(columnIndex('AA3'), 26);
  assert.equal(columnIndex('$XFD$1'), 16383);
  assert.equal(columnLetters(0), 'A');
  assert.equal(columnLetters(26), 'AA');
  assert.equal(columnLetters(16383), 'XFD');
  for (let i = 0; i < 2000; i += 37) assert.equal(columnIndex(columnLetters(i)), i);
});

test('Excel serial dates and number formats', () => {
  assert.equal(excelSerialToString(1), '1900-01-01');
  assert.equal(excelSerialToString(59), '1900-02-28');
  assert.equal(excelSerialToString(60), '1900-02-29');
  assert.equal(excelSerialToString(61), '1900-03-01');
  assert.equal(excelSerialToString(45306), '2024-01-15');
  assert.equal(excelSerialToString(0, { date1904: true }), '1904-01-01');
  assert.equal(excelSerialToString(0.5, { kind: 'time' }), '12:00');
  assert.equal(excelSerialToString(45306.999999, { kind: 'datetime' }), '2024-01-16 00:00');
  assert.equal(excelSerialToString(1.5, { kind: 'elapsed', seconds: true }), '36:00:00');
  assert.equal(classifyFormat('dd/mm/yyyy').kind, 'date');
  assert.equal(classifyFormat('h:mm AM/PM').kind, 'time');
  assert.equal(classifyFormat('yyyy-mm-dd hh:mm:ss').kind, 'datetime');
  assert.equal(classifyFormat('[h]:mm').kind, 'elapsed');
  assert.equal(classifyFormat('"$"#,##0.00').kind, 'number');
  assert.equal(classifyFormat('[Red]0.00').kind, 'number');
  assert.equal(classifyFormat('#,##0 "days"').kind, 'number');
  assert.equal(formatNumber(1234.5, '#,##0.00'), '1,234.50');
  assert.equal(formatNumber(-1234.5, '#,##0.00;(#,##0.00)'), '(1,234.50)');
  assert.equal(formatNumber(-5, '"$"0.00'), '-$5.00');
  assert.equal(formatNumber(0.4567, '0.0%'), '45.7%');
  assert.equal(formatNumber(2134, '00000'), '02134');
  assert.equal(formatNumber(1234.5, '[$€-407] #,##0.00'), '€ 1,234.50');
  assert.equal(formatNumber(1.5, '0.0#'), '1.5');
  assert.equal(formatNumber(1234567, '#,##0,"K"'), '1,235K');
  assert.equal(formatNumber(5551234, '000-0000'), null);
  assert.equal(displayNumber('5551234', '000-0000'), '5551234');
  assert.equal(displayNumber('0.1', 'General'), '0.1');
  assert.equal(displayNumber('1e21', 'General'), '1e+21');
});

test('XML tokenizer: entities, CDATA, comments, prefixes', () => {
  const toks = [...xmlTokens('<?xml version="1.0"?><!-- c --><a:x b="1 &amp; 2" c=\'q\'>t&lt;&#65;&#x42;<![CDATA[<raw>]]><y/></a:x>')];
  assert.deepEqual(toks.map((t) => t.type), ['start', 'text', 'text', 'start', 'end']);
  assert.equal(toks[0].local, 'x');
  assert.deepEqual(toks[0].attrs, { b: '1 & 2', c: 'q' });
  assert.equal(toks[1].text, 't<AB');
  assert.equal(toks[2].text, '<raw>');
  assert.equal(toks[3].selfClosing, true);
});

test('decodeText falls back to windows-1252', () => {
  assert.equal(decodeText(new Uint8Array([0x80, 0x41, 0xe9])), '€Aé');
  assert.equal(decodeText(new TextEncoder().encode('﻿é')), 'é');
});
