// Spreadsheet import for mail merge: Office Open XML (.xlsx/.xlsm) and OpenDocument (.ods).
//
//   parseXLSX(arrayBuffer) -> Promise<{ sheets: [{ name, columns, rows, hidden }] }>
//   parseODS(arrayBuffer)  -> Promise<{ sheets: [{ name, columns, rows, hidden }] }>
//
// Each sheet's first non-empty row is the header (see uniqueColumnNames); fully empty rows are
// skipped; every row is padded to the column count. Values are strings as a reader would see them:
// dates become 'YYYY-MM-DD' (date-times 'YYYY-MM-DD HH:MM[:SS]', times 'HH:MM[:SS]'), booleans
// 'TRUE'/'FALSE', errors their code ('#N/A'), numbers use the cell's number format where it is a
// plain 0 / #,##0.00 / percent / currency pattern and otherwise the shortest exact decimal.
// Runs in node and the browser (ZIP via ./zip.js, XML via ./xml.js).

import { openZip } from './zip.js';
import { xmlTokens, attr } from './xml.js';
import { uniqueColumnNames } from './csv.js';

const OLE_SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** True when bytes start with the OLE2 compound-file signature (legacy .xls/.doc). */
export function isOLE(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  return b.length >= 8 && OLE_SIG.every((v, i) => b[i] === v);
}

export const LEGACY_XLS_MESSAGE = 'This is a legacy Excel 97-2003 (.xls) workbook, which cannot be read. Open it in your spreadsheet program and save it as .xlsx or .csv, then try again.';

// ---------------------------------------------------------------------------------------------
// Column references
// ---------------------------------------------------------------------------------------------

/**
 * Column letters to a 0-based index: 'A' -> 0, 'Z' -> 25, 'AA' -> 26. Accepts a cell reference ('B12').
 * @param {string} ref
 * @returns {number} -1 when there are no letters
 */
export function columnIndex(ref) {
  const m = /^\$?([A-Za-z]+)/.exec(String(ref || ''));
  if (!m) return -1;
  let n = 0;
  for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * 0-based column index to letters: 0 -> 'A', 26 -> 'AA'.
 * @param {number} index
 * @returns {string}
 */
export function columnLetters(index) {
  let n = Math.floor(index) + 1, s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// ---------------------------------------------------------------------------------------------
// Number formats and dates
// ---------------------------------------------------------------------------------------------

// Built-in number formats (ECMA-376 18.8.30) that matter for display.
const BUILTIN_FORMATS = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00',
  12: '# ?/?', 13: '# ??/??', 14: 'yyyy-mm-dd', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM',
  19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'yyyy-mm-dd h:mm', 37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)',
  39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@'
};
// locale-dependent built-in date formats (CJK) — treated as dates
for (const id of [27, 28, 29, 30, 31, 36, 50, 51, 52, 53, 54, 57, 58]) BUILTIN_FORMATS[id] = 'yyyy-mm-dd';
for (const id of [32, 33, 34, 35, 55, 56]) BUILTIN_FORMATS[id] = 'h:mm:ss';

/** Remove quoted literals, escapes, colours/conditions and fill/pad characters from a format section. */
function stripFormat(section) {
  return section
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/[_*]./g, '')
    .replace(/\[(?!h+\]|m+\]|s+\])[^\]]*\]/gi, '');
}

function splitSections(code) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === '"') q = !q;
    if (c === '\\' && !q) { cur += c + (code[i + 1] ?? ''); i++; continue; }
    if (c === ';' && !q) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Classify an Excel number format code.
 * @param {string} code
 * @returns {{ kind: 'general'|'text'|'date'|'time'|'datetime'|'elapsed'|'number', seconds: boolean }}
 */
export function classifyFormat(code) {
  const c = String(code ?? 'General');
  if (!c || /^general$/i.test(c.trim())) return { kind: 'general', seconds: false };
  const first = stripFormat(splitSections(c)[0]);
  if (first.trim() === '@') return { kind: 'text', seconds: false };
  const seconds = /s/i.test(first);
  if (/\[(h+|m+|s+)\]/i.test(first)) return { kind: 'elapsed', seconds };
  const hasY = /y/i.test(first), hasD = /d/i.test(first), hasH = /h/i.test(first), hasS = /s/i.test(first);
  const hasAmPm = /AM\/PM|A\/P/i.test(first);
  const hasM = /m/i.test(first.replace(/AM\/PM|A\/P/gi, ''));
  const hasTime = hasH || hasS || hasAmPm;
  const hasDate = hasY || hasD || (hasM && !hasTime);
  if (!hasDate && !hasTime) return { kind: 'number', seconds: false };
  return { kind: hasDate && hasTime ? 'datetime' : hasDate ? 'date' : 'time', seconds };
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

/**
 * Convert an Excel serial date to text. 1900 system (default; serial 1 = 1900-01-01, including
 * Excel's fictitious 1900-02-29 at serial 60) or 1904 system (serial 0 = 1904-01-01).
 * @param {number} serial
 * @param {{ kind?: 'date'|'time'|'datetime'|'elapsed', seconds?: boolean, date1904?: boolean }} [opts]
 * @returns {string} 'YYYY-MM-DD', 'HH:MM[:SS]' or 'YYYY-MM-DD HH:MM[:SS]'
 */
export function excelSerialToString(serial, opts = {}) {
  const kind = opts.kind || 'date';
  const v = Number(serial);
  if (!Number.isFinite(v)) return String(serial);
  let totalSec = Math.round(v * 86400);
  if (kind === 'elapsed') {
    const neg = totalSec < 0 ? '-' : '';
    totalSec = Math.abs(totalSec);
    const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60;
    return `${neg}${h}:${pad(m)}${opts.seconds ? ':' + pad(s) : ''}`;
  }
  let days = Math.floor(totalSec / 86400);
  const secs = totalSec - days * 86400;
  const time = `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}${opts.seconds || (kind === 'datetime' && secs % 60) ? ':' + pad(secs % 60) : ''}`;
  if (kind === 'time') return time;
  let date;
  if (opts.date1904) date = new Date(Date.UTC(1904, 0, 1 + days));
  else if (days === 60) date = null; // 1900-02-29 (does not exist; Excel shows it)
  else date = new Date(Date.UTC(1899, 11, days < 60 ? 31 + days : 30 + days));
  const ds = date ? `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` : '1900-02-29';
  return kind === 'datetime' ? `${ds} ${time}` : ds;
}

/** Shortest decimal for a stored double, rounded to Excel's 15 significant digits. */
export function plainNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  const r = Number(n.toPrecision(15));
  if (Math.abs(r) >= 1e21 || (Math.abs(r) < 1e-6 && r !== 0)) return String(r);
  return String(r);
}

function groupThousands(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format a number with a simple Excel number format: digit placeholders 0 # with optional
 * thousands separator and decimals, %, literal text ("…", \x, [$€-407]) before/after, and
 * positive;negative;zero sections. Returns null for formats it does not understand (fractions,
 * scientific, conditions), so callers can fall back to plainNumber().
 * @param {number} value
 * @param {string} code
 * @returns {string|null}
 */
export function formatNumber(value, code) {
  const sections = splitSections(String(code ?? ''));
  let v = Number(value);
  if (!Number.isFinite(v)) return null;
  let sec = sections[0];
  let negInFormat = false;
  if (v < 0 && sections.length > 1 && sections[1].trim() !== '') { sec = sections[1]; negInFormat = true; } else if (v === 0 && sections.length > 2 && sections[2].trim() !== '') sec = sections[2];
  if (/\[[<>=]/.test(sec) || /[?/]|E[+-]/i.test(stripFormat(sec))) return null;
  // literal pieces become text; find the numeric core
  let prefix = '', suffix = '', core = '', inCore = false, coreDone = false;
  const lit = (t) => { if (!inCore) prefix += t; else { coreDone = true; suffix += t; } };
  for (let i = 0; i < sec.length; i++) {
    const c = sec[i];
    if (c === '"') { const e = sec.indexOf('"', i + 1); lit(sec.slice(i + 1, e < 0 ? sec.length : e)); i = e < 0 ? sec.length : e; continue; }
    if (c === '\\') { lit(sec[i + 1] ?? ''); i++; continue; }
    if (c === '_') { lit(' '); i++; continue; }
    if (c === '*') { i++; continue; }
    if (c === '[') {
      const e = sec.indexOf(']', i);
      const body = sec.slice(i + 1, e < 0 ? sec.length : e);
      if (body[0] === '$') lit(body.slice(1).split('-')[0]);
      i = e < 0 ? sec.length : e;
      continue;
    }
    if (/[0#.,]/.test(c) && !coreDone) { inCore = true; core += c; continue; }
    if (c === '%' ) { lit('%'); continue; }
    if (/[0#]/.test(c)) return null; // digits split by literals (e.g. phone formats)
    lit(c);
  }
  if (!core) return prefix + suffix || null;
  const percent = (prefix + suffix).includes('%') && /%/.test(sec.replace(/"[^"]*"/g, ''));
  if (percent) v *= 100;
  // trailing commas scale by 1000
  let scaled = core;
  while (/,$/.test(scaled)) { v /= 1000; scaled = scaled.slice(0, -1); }
  const dot = scaled.indexOf('.');
  const intPart = dot < 0 ? scaled : scaled.slice(0, dot);
  const decPart = dot < 0 ? '' : scaled.slice(dot + 1).replace(/,/g, '');
  const minDec = (decPart.match(/0/g) || []).length;
  const maxDec = decPart.length;
  const thousands = intPart.includes(',');
  const minInt = (intPart.match(/0/g) || []).length;
  const abs = Math.abs(v);
  let s = abs.toFixed(maxDec);
  if (maxDec > minDec) s = s.replace(new RegExp(`0{1,${maxDec - minDec}}$`), '').replace(/\.$/, '');
  let [ip, dp] = s.split('.');
  if (ip === '0' && minInt === 0) ip = '';
  ip = ip.padStart(minInt, '0');
  if (thousands) ip = groupThousands(ip);
  const num = dp !== undefined ? `${ip}.${dp}` : ip;
  const neg = v < 0 && !negInFormat && Number(s) !== 0 ? '-' : '';
  return `${neg}${prefix}${num}${suffix}`;
}

/**
 * Display text for a numeric cell given its number format code.
 * @param {number|string} raw stored value
 * @param {string} code number format code
 * @param {boolean} [date1904]
 * @returns {string}
 */
export function displayNumber(raw, code, date1904 = false) {
  const v = Number(raw);
  if (!Number.isFinite(v)) return String(raw);
  const cls = classifyFormat(code);
  if (cls.kind === 'date' || cls.kind === 'time' || cls.kind === 'datetime' || cls.kind === 'elapsed') {
    return excelSerialToString(v, { kind: cls.kind, seconds: cls.seconds, date1904 });
  }
  if (cls.kind === 'number') {
    const f = formatNumber(v, code);
    if (f !== null) return f;
  }
  return plainNumber(v);
}

// ---------------------------------------------------------------------------------------------
// Sheet assembly
// ---------------------------------------------------------------------------------------------

/**
 * Turn sparse cell rows into { columns, rows }: first non-empty row is the header, empty rows are
 * dropped, rows are padded, trailing all-empty columns removed.
 * @param {Array<Array<string>|undefined>} grid rows of cell text (sparse arrays allowed)
 * @returns {{ columns: string[], rows: string[][] }}
 */
export function gridToTable(grid) {
  const nonEmpty = [];
  for (const r of grid) {
    if (!r) continue;
    const row = Array.from(r, (v) => (v === undefined || v === null ? '' : String(v)));
    if (row.some((v) => v.trim() !== '')) nonEmpty.push(row);
  }
  if (!nonEmpty.length) return { columns: [], rows: [] };
  let width = 0;
  for (const r of nonEmpty) {
    for (let i = r.length - 1; i >= 0; i--) if (r[i].trim() !== '') { width = Math.max(width, i + 1); break; }
  }
  const pad = (r) => { const o = r.slice(0, width); while (o.length < width) o.push(''); return o; };
  const header = pad(nonEmpty[0]);
  return { columns: uniqueColumnNames(header), rows: nonEmpty.slice(1).map(pad) };
}

// ---------------------------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------------------------

function resolvePart(base, target) {
  if (!target) return '';
  if (target.startsWith('/')) return target.slice(1);
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  const parts = (dir + target).split('/');
  const out = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p); }
  return out.join('/');
}

function relsPath(part) {
  const i = part.lastIndexOf('/');
  return `${part.slice(0, i + 1)}_rels/${part.slice(i + 1)}.rels`;
}

async function readRels(zip, part) {
  const p = relsPath(part);
  const out = [];
  if (!zip.has(p)) return out;
  for (const t of xmlTokens(await zip.readText(p))) {
    if (t.type === 'start' && t.local === 'Relationship') {
      out.push({ id: t.attrs.Id, type: t.attrs.Type || '', target: t.attrs.TargetMode === 'External' ? '' : resolvePart(part, t.attrs.Target) });
    }
  }
  return out;
}

/** Rich or plain string item (<si>/<is>) text; phonetic runs (<rPh>) are ignored. */
function collectStringItems(xml, itemLocal) {
  const items = [];
  let cur = null, inT = false, skip = 0;
  for (const t of xmlTokens(xml)) {
    if (t.type === 'start') {
      if (t.local === itemLocal && !t.selfClosing) { cur = ''; continue; }
      if (t.local === itemLocal && t.selfClosing) { items.push(''); continue; }
      if (t.local === 'rPh' || t.local === 'phoneticPr') { if (!t.selfClosing) skip++; continue; }
      if (t.local === 't' && !t.selfClosing) inT = true;
    } else if (t.type === 'end') {
      if (t.local === itemLocal) { items.push(cur ?? ''); cur = null; continue; }
      if (t.local === 'rPh' || t.local === 'phoneticPr') { skip = Math.max(0, skip - 1); continue; }
      if (t.local === 't') inT = false;
    } else if (inT && !skip && cur !== null) cur += t.text;
  }
  return items;
}

async function readStyles(zip, path) {
  const formats = []; // per cellXfs index: format code
  if (!path || !zip.has(path)) return formats;
  const custom = {};
  let inXfs = false;
  for (const t of xmlTokens(await zip.readText(path))) {
    if (t.type === 'start') {
      if (t.local === 'numFmt') custom[t.attrs.numFmtId] = t.attrs.formatCode ?? '';
      else if (t.local === 'cellXfs') inXfs = !t.selfClosing;
      else if (t.local === 'xf' && inXfs) {
        const id = Number(t.attrs.numFmtId || 0);
        formats.push(custom[id] ?? BUILTIN_FORMATS[id] ?? 'General');
      }
    } else if (t.type === 'end' && t.local === 'cellXfs') inXfs = false;
  }
  return formats;
}

const OFFICE_DOC = /\/officeDocument$/;

function decodeEscapes(s) {
  // _xHHHH_ escapes used by Excel for control characters
  return s.indexOf('_x') < 0 ? s : s.replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
}

function parseWorksheet(xml, shared, formats, date1904) {
  const grid = [];
  let rowIdx = -1, colIdx = -1;
  let cell = null; // { col, t, s, v, is, f }
  let mode = ''; // 'v' | 'is' | 'f'
  let inIsT = false, skip = 0;
  let inSheetData = false;
  for (const t of xmlTokens(xml)) {
    if (t.type === 'start') {
      const L = t.local;
      if (L === 'sheetData') { inSheetData = !t.selfClosing; continue; }
      if (!inSheetData) continue;
      if (L === 'row') {
        rowIdx = t.attrs.r ? Number(t.attrs.r) - 1 : rowIdx + 1;
        colIdx = -1;
        if (!t.selfClosing) grid[rowIdx] = grid[rowIdx] || [];
      } else if (L === 'c') {
        colIdx = t.attrs.r ? columnIndex(t.attrs.r) : colIdx + 1;
        if (rowIdx < 0) rowIdx = 0;
        cell = { col: colIdx, t: t.attrs.t || 'n', s: Number(t.attrs.s || 0), v: null, is: '' };
        if (t.selfClosing) { finishCell(); }
      } else if (cell) {
        if (L === 'v') mode = 'v';
        else if (L === 'is') mode = 'is';
        else if (L === 'rPh') { if (!t.selfClosing) skip++; }
        else if (L === 't' && mode === 'is' && !t.selfClosing) inIsT = true;
        else if (L === 'f') mode = t.selfClosing ? mode : 'f';
      }
    } else if (t.type === 'end') {
      const L = t.local;
      if (L === 'sheetData') { inSheetData = false; continue; }
      if (!cell) continue;
      if (L === 'c') finishCell();
      else if (L === 'v' || L === 'f') mode = '';
      else if (L === 'is') mode = '';
      else if (L === 'rPh') skip = Math.max(0, skip - 1);
      else if (L === 't') inIsT = false;
    } else if (cell) {
      if (mode === 'v') cell.v = (cell.v ?? '') + t.text;
      else if (mode === 'is' && inIsT && !skip) cell.is += t.text;
    }
  }
  return grid;

  function finishCell() {
    const c = cell;
    cell = null; mode = ''; inIsT = false; skip = 0;
    if (!c || c.col < 0) return;
    let text = '';
    const v = c.v;
    switch (c.t) {
      case 's': text = v === null ? '' : shared[Number(v)] ?? ''; break;
      case 'inlineStr': text = c.is || (v ?? ''); break;
      case 'str': text = v ?? ''; break;
      case 'b': text = v === null || v === '' ? '' : Number(v) ? 'TRUE' : 'FALSE'; break;
      case 'e': text = v ?? ''; break;
      case 'd': {
        const s = (v ?? '').trim();
        const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(:\d{2})?)?/.exec(s);
        if (!m) text = s;
        else if (!m[2] || (m[2] === '00:00' && (!m[3] || m[3] === ':00'))) text = m[1];
        else text = `${m[1]} ${m[2]}${m[3] && m[3] !== ':00' ? m[3] : ''}`;
        break;
      }
      default: text = v === null || v === '' ? '' : displayNumber(v, formats[c.s] ?? 'General', date1904);
    }
    text = decodeEscapes(text);
    if (text === '') return;
    (grid[rowIdx] = grid[rowIdx] || [])[c.col] = text;
  }
}

/**
 * Parse an .xlsx / .xlsm workbook.
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {Promise<{ sheets: Array<{ name: string, columns: string[], rows: string[][], hidden: boolean }> }>}
 */
export async function parseXLSX(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (isOLE(bytes)) throw new Error(LEGACY_XLS_MESSAGE);
  let zip;
  try { zip = openZip(bytes); } catch (err) { throw new Error(`This is not a valid .xlsx workbook. ${err.message}`); }
  let wbPath = 'xl/workbook.xml';
  const rootRels = await readRels(zip, '');
  const off = rootRels.find((r) => OFFICE_DOC.test(r.type));
  if (off && zip.has(off.target)) wbPath = off.target;
  if (!zip.has(wbPath)) {
    if (zip.has('content.xml')) throw new Error('This looks like an OpenDocument spreadsheet; open it as .ods.');
    throw new Error('This is not an Excel workbook (xl/workbook.xml is missing).');
  }
  const rels = await readRels(zip, wbPath);
  const relById = new Map(rels.map((r) => [r.id, r]));
  const dir = wbPath.slice(0, wbPath.lastIndexOf('/') + 1);

  const sheetsMeta = [];
  let date1904 = false;
  for (const t of xmlTokens(await zip.readText(wbPath))) {
    if (t.type !== 'start') continue;
    if (t.local === 'workbookPr') date1904 = /^(1|true)$/i.test(t.attrs.date1904 || '');
    if (t.local === 'sheet') {
      sheetsMeta.push({ name: t.attrs.name || `Sheet${sheetsMeta.length + 1}`, rid: attr(t.attrs, 'id'), hidden: !!t.attrs.state && t.attrs.state !== 'visible' });
    }
  }
  const ssRel = rels.find((r) => /\/sharedStrings$/.test(r.type));
  const ssPath = ssRel ? ssRel.target : `${dir}sharedStrings.xml`;
  const shared = zip.has(ssPath) ? collectStringItems(await zip.readText(ssPath), 'si').map(decodeEscapes) : [];
  const stRel = rels.find((r) => /\/styles$/.test(r.type));
  const formats = await readStyles(zip, stRel ? stRel.target : `${dir}styles.xml`);

  const sheets = [];
  for (const meta of sheetsMeta) {
    const rel = relById.get(meta.rid);
    if (!rel || !/\/worksheet$/.test(rel.type)) continue; // chart sheets, dialog sheets…
    if (!zip.has(rel.target)) continue;
    const grid = parseWorksheet(await zip.readText(rel.target), shared, formats, date1904);
    sheets.push({ name: meta.name, ...gridToTable(grid), hidden: meta.hidden });
  }
  if (!sheets.length) throw new Error('The workbook has no worksheets.');
  return { sheets };
}

// ---------------------------------------------------------------------------------------------
// ODS
// ---------------------------------------------------------------------------------------------

const MAX_REPEAT_ROWS = 100000;
const MAX_REPEAT_COLS = 16384;

function odsDate(v) {
  const m = /^(-?\d{4,}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(v || '');
  if (!m) return v || '';
  if (!m[2] || (m[2] === '00' && m[3] === '00' && (!m[4] || m[4] === '00'))) return m[1];
  return `${m[1]} ${m[2]}:${m[3]}${m[4] && m[4] !== '00' ? ':' + m[4] : ''}`;
}

function odsTime(v) {
  const m = /^-?P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/.exec(v || '');
  if (!m) return v || '';
  const total = Math.round((Number(m[1] || 0) * 24 + Number(m[2] || 0)) * 3600 + Number(m[3] || 0) * 60 + Number(m[4] || 0));
  const h = Math.floor(total / 3600), mi = Math.floor((total % 3600) / 60), s = total % 60;
  return `${pad(h)}:${pad(mi)}${s ? ':' + pad(s) : ''}`;
}

/**
 * Parse an OpenDocument spreadsheet (.ods).
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {Promise<{ sheets: Array<{ name: string, columns: string[], rows: string[][], hidden: boolean }> }>}
 */
export async function parseODS(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (isOLE(bytes)) throw new Error(LEGACY_XLS_MESSAGE);
  let zip;
  try { zip = openZip(bytes); } catch (err) { throw new Error(`This is not a valid .ods spreadsheet. ${err.message}`); }
  if (zip.has('mimetype')) {
    const mt = (await zip.readText('mimetype')).trim();
    if (mt && !/spreadsheet/.test(mt)) throw new Error(`This OpenDocument file is not a spreadsheet (${mt}).`);
  }
  if (!zip.has('content.xml')) throw new Error('This is not an OpenDocument spreadsheet (content.xml is missing).');
  const xml = await zip.readText('content.xml');

  // hidden tables are marked through automatic table styles (style:table-properties table:display="false")
  const hiddenStyles = new Set();
  const sheets = [];
  let styleName = null;
  let table = null; // { name, grid, style }
  let row = null, rowRepeat = 1, rowIdx = 0;
  let cell = null; // { repeat, type, value, text, paras }
  let colIdx = 0;
  let skip = 0; // inside annotations
  let para = null;

  for (const t of xmlTokens(xml)) {
    if (t.type === 'start') {
      const L = t.local;
      if (skip) { if (!t.selfClosing) skip++; continue; }
      if (L === 'style' && t.attrs['style:family'] === 'table') styleName = t.attrs['style:name'];
      else if (L === 'table-properties' && styleName && attr(t.attrs, 'display') === 'false') hiddenStyles.add(styleName);
      else if (L === 'table' && t.name !== 'table:table-properties') {
        if (t.selfClosing) continue;
        table = { name: attr(t.attrs, 'name') || `Sheet${sheets.length + 1}`, grid: [], style: attr(t.attrs, 'style-name') };
        rowIdx = 0;
      } else if (!table) continue;
      else if (L === 'table-row') {
        rowRepeat = Math.max(1, Number(attr(t.attrs, 'number-rows-repeated') || 1));
        row = [];
        colIdx = 0;
        if (t.selfClosing) endRow();
      } else if ((L === 'table-cell' || L === 'covered-table-cell') && row) {
        cell = {
          repeat: Math.max(1, Number(attr(t.attrs, 'number-columns-repeated') || 1)),
          type: attr(t.attrs, 'value-type') || '',
          attrs: t.attrs,
          paras: []
        };
        if (t.selfClosing) endCell();
      } else if (cell) {
        if (L === 'annotation') { if (!t.selfClosing) skip = 1; }
        else if (L === 'p' || L === 'h') { para = ''; if (t.selfClosing) { cell.paras.push(''); para = null; } }
        else if (para !== null) {
          if (L === 's') para += ' '.repeat(Math.max(1, Number(attr(t.attrs, 'c') || 1)));
          else if (L === 'tab') para += '\t';
          else if (L === 'line-break') para += '\n';
        }
      }
    } else if (t.type === 'end') {
      const L = t.local;
      if (skip) { skip--; continue; }
      if (L === 'style') styleName = null;
      if (!table) continue;
      if (L === 'table') {
        sheets.push({ name: table.name, ...gridToTable(table.grid), hidden: hiddenStyles.has(table.style) });
        table = null;
      } else if (L === 'table-row' && row) endRow();
      else if ((L === 'table-cell' || L === 'covered-table-cell') && cell) endCell();
      else if ((L === 'p' || L === 'h') && cell && para !== null) { cell.paras.push(para); para = null; }
    } else if (cell && para !== null && !skip) para += t.text;
  }
  if (!sheets.length) throw new Error('The spreadsheet has no sheets.');
  return { sheets };

  function cellText(c) {
    const a = c.attrs;
    const text = c.paras.join('\n');
    switch (c.type) {
      case 'date': return odsDate(attr(a, 'date-value'));
      case 'time': return odsTime(attr(a, 'time-value'));
      case 'boolean': {
        const b = attr(a, 'boolean-value');
        return b === undefined ? text : /^(true|1)$/i.test(b) ? 'TRUE' : 'FALSE';
      }
      case 'float': case 'percentage': case 'currency':
        return text !== '' ? text : plainNumber(attr(a, 'value'));
      case 'string': return text !== '' ? text : attr(a, 'string-value') ?? '';
      default: return text;
    }
  }

  function endCell() {
    const c = cell;
    cell = null; para = null;
    const v = cellText(c);
    if (v === '') { colIdx += c.repeat; return; }
    const n = Math.min(c.repeat, MAX_REPEAT_COLS - colIdx);
    for (let k = 0; k < n; k++) row[colIdx + k] = v;
    colIdx += c.repeat;
  }

  function endRow() {
    const r = row;
    row = null;
    const empty = !r.some((v) => v !== undefined && v !== '');
    if (empty) { rowIdx += rowRepeat; return; }
    const n = Math.min(rowRepeat, MAX_REPEAT_ROWS);
    for (let k = 0; k < n; k++) table.grid[rowIdx + k] = k ? r.slice() : r;
    rowIdx += rowRepeat;
  }
}
