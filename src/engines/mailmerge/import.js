// Recipient-list import: picks the parser from the file's signature and extension.
//
//   importFile(name, arrayBuffer, { delimiter?, header? }) -> Promise<{ sheets: [{ name, columns, rows, hidden? }], format }>
//   decodeText(bytes) -> string   UTF-8 (BOM-aware), UTF-16 with BOM, else windows-1252
//
// Runs in node and the browser.

import { parseCSV } from './csv.js';
import { parseXLSX, parseODS, isOLE, LEGACY_XLS_MESSAGE } from './xlsx.js';
import { isZip, openZip } from './zip.js';

// windows-1252 code points for 0x80..0x9F (undefined bytes map to the C1 control of the same value)
const CP1252 = [0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178];

function decode1252(bytes) {
  let out = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const part = bytes.subarray(i, i + CHUNK);
    const codes = new Array(part.length);
    for (let k = 0; k < part.length; k++) { const b = part[k]; codes[k] = b >= 0x80 && b <= 0x9f ? CP1252[b - 0x80] : b; }
    out += String.fromCharCode.apply(null, codes);
  }
  return out;
}

/**
 * Decode text bytes: UTF-16LE/BE when a BOM says so, UTF-8 when valid (BOM stripped), otherwise
 * windows-1252 (what spreadsheet programs write for "CSV" on Western Windows systems).
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {string}
 */
export function decodeText(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return decode1252(bytes);
  }
}

const ext = (name) => { const m = /\.([^./\\]+)$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
const baseName = (name) => String(name || 'Recipients').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') || 'Recipients';

/**
 * Import a recipient list from a file's bytes. Supported: .csv/.tsv/.txt (delimited text; tab for
 * .tsv, otherwise auto-detected), .xlsx/.xlsm (Office Open XML) and .ods (OpenDocument). Detection
 * is by signature first, so a mis-named file still works; legacy binary .xls is rejected with a
 * "save as .xlsx or .csv" message.
 * @param {string} name file name (used for the extension and, for text files, the sheet name)
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {{ delimiter?: string, header?: boolean }} [opts] options for delimited text
 * @returns {Promise<{ sheets: Array<{ name: string, columns: string[], rows: string[][], hidden?: boolean }>, format: 'csv'|'xlsx'|'ods' }>}
 */
export async function importFile(name, buffer, opts = {}) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const e = ext(name);
  if (isOLE(bytes)) throw new Error(LEGACY_XLS_MESSAGE);
  if (isZip(bytes)) {
    let zip;
    try { zip = openZip(bytes); } catch (err) { throw new Error(`The file "${name}" is damaged or not a spreadsheet. ${err.message}`); }
    if (zip.has('content.xml') && (zip.has('mimetype') || e === 'ods')) return { ...(await parseODS(bytes)), format: 'ods' };
    if (zip.has('[Content_Types].xml') || zip.names.some((n) => /^xl\/workbook\.xml$/.test(n))) return { ...(await parseXLSX(bytes)), format: 'xlsx' };
    throw new Error(`"${name}" is a ZIP archive but not a spreadsheet. Use a .xlsx, .ods or .csv file.`);
  }
  if (e === 'xls') throw new Error(LEGACY_XLS_MESSAGE);
  if (['xlsx', 'xlsm', 'ods'].includes(e)) throw new Error(`"${name}" is not a valid ${e === 'ods' ? 'OpenDocument' : 'Excel'} spreadsheet.`);
  if (['numbers', 'pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'gif'].includes(e)) throw new Error(`"${name}" is not a recipient list. Use a .csv, .txt, .xlsx or .ods file.`);
  const text = decodeText(bytes);
  if (text.indexOf('\u0000') >= 0) throw new Error(`"${name}" is a binary file, not a recipient list.`);
  const delimiter = opts.delimiter || (e === 'tsv' || e === 'tab' ? '\t' : 'auto');
  const { columns, rows } = parseCSV(text, { delimiter, header: opts.header !== false });
  return { sheets: [{ name: baseName(name), columns, rows }], format: 'csv' };
}
