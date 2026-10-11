import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, toCSV, detectDelimiter, splitRecords, uniqueColumnNames } from '../../src/engines/mailmerge/csv.js';

test('parses quoted fields, escaped quotes and embedded newlines', () => {
  const text = 'Name,Note\r\n"Smith, John","He said ""hi""\r\nthen left"\r\nAnn,plain\r\n';
  const r = parseCSV(text);
  assert.deepEqual(r.columns, ['Name', 'Note']);
  assert.deepEqual(r.rows, [['Smith, John', 'He said "hi"\r\nthen left'], ['Ann', 'plain']]);
});

test('handles LF, CR and CRLF line breaks, BOM and missing trailing newline', () => {
  for (const nl of ['\n', '\r', '\r\n']) {
    const r = parseCSV(`﻿a,b${nl}1,2${nl}3,4`);
    assert.deepEqual(r.columns, ['a', 'b']);
    assert.deepEqual(r.rows, [['1', '2'], ['3', '4']]);
  }
});

test('trailing newline does not add a record; blank lines are skipped', () => {
  assert.equal(splitRecords('a,b\n1,2\n', ',').length, 2);
  const r = parseCSV('a,b\n\n1,2\n\n\n3,4\n');
  assert.deepEqual(r.rows, [['1', '2'], ['3', '4']]);
});

test('ragged rows are padded; extra fields add generated columns', () => {
  const r = parseCSV('a,b,c\n1\n1,2,3,4\n');
  assert.deepEqual(r.columns, ['a', 'b', 'c', 'Column 4']);
  assert.deepEqual(r.rows, [['1', '', '', ''], ['1', '2', '3', '4']]);
});

test('blank and duplicate header names are made unique', () => {
  assert.deepEqual(uniqueColumnNames(['Name', '', 'name', ' Name ', 'Column 2', '']), ['Name', 'Column 3', 'name (2)', 'Name (3)', 'Column 2', 'Column 6']);
  const r = parseCSV('Name,,Name\nx,y,z\n');
  assert.deepEqual(r.columns, ['Name', 'Column 2', 'Name (2)']);
});

test('trailing empty columns (blank header and data) are dropped', () => {
  const r = parseCSV('a,b,,\n1,2,,\n');
  assert.deepEqual(r.columns, ['a', 'b']);
  assert.deepEqual(r.rows, [['1', '2']]);
});

test('auto-detects comma, semicolon, tab and pipe delimiters', () => {
  assert.equal(detectDelimiter('a,b,c\n1,2,3\n'), ',');
  assert.equal(detectDelimiter('a;b;c\n1;2,5;3\n'), ';');
  assert.equal(detectDelimiter('a\tb\n1\t2\n'), '\t');
  assert.equal(detectDelimiter('a|b|c\n1|2|3\n'), '|');
  assert.equal(detectDelimiter('"x;y",b\n"1;2",3\n'), ',');
  assert.equal(detectDelimiter('single\nvalues\n'), ',');
  const r = parseCSV('Name;Price\nTea;2,50\n');
  assert.equal(r.delimiter, ';');
  assert.deepEqual(r.rows, [['Tea', '2,50']]);
});

test('explicit delimiter and header:false', () => {
  const r = parseCSV('1|2\n3|4', { delimiter: '|', header: false });
  assert.deepEqual(r.columns, ['Column 1', 'Column 2']);
  assert.deepEqual(r.rows, [['1', '2'], ['3', '4']]);
});

test('lenient quotes: literal quote mid-field, unterminated quote, text after closing quote', () => {
  assert.deepEqual(splitRecords('a "b" c,d', ','), [['a "b" c', 'd']]);
  assert.deepEqual(splitRecords('"open,x\ny', ','), [['open,x\ny']]);
  assert.deepEqual(splitRecords('"ab"cd,e', ','), [['abcd', 'e']]);
  assert.deepEqual(splitRecords('a,', ','), [['a', '']]);
  assert.deepEqual(splitRecords('', ','), []);
});

test('toCSV quotes when needed and round-trips through parseCSV', () => {
  const columns = ['Name', 'Note', 'N'];
  const rows = [['Smith, J', 'say "hi"', '1'], ['multi\nline', ' padded ', null]];
  const text = toCSV(columns, rows);
  assert.equal(text, 'Name,Note,N\r\n"Smith, J","say ""hi""",1\r\n"multi\nline"," padded ",\r\n');
  const back = parseCSV(text);
  assert.deepEqual(back.columns, columns);
  assert.deepEqual(back.rows, [['Smith, J', 'say "hi"', '1'], ['multi\nline', ' padded ', '']]);
  assert.equal(toCSV(['a', 'b'], [['1;2', 'x']], { delimiter: ';', newline: '\n' }), 'a;b\n"1;2";x\n');
});
