// CSV / delimited text for mail merge (RFC 4180, lenient).
//
//   parseCSV(text, { delimiter: 'auto'|','|';'|'\t'|'|', header: true }) -> { columns, rows, delimiter }
//   toCSV(columns, rows, { delimiter, newline }) -> string
//   uniqueColumnNames(names) -> string[]   blank names become "Column N", duplicates "Name (2)"
//
// Runs unchanged in node and the browser (no Node-only APIs).

export const DELIMITERS = [',', ';', '\t', '|'];

/**
 * Split delimited text into records (arrays of raw field strings).
 * Quoted fields may contain the delimiter, doubled quotes ("") and line breaks. A quote only opens a
 * quoted field at the start of a field; elsewhere it is literal. Text after a closing quote (before the
 * next delimiter) is appended to the field, as spreadsheets do. Records end at CRLF, LF or CR. A final
 * line break does not start an extra record.
 * @param {string} text
 * @param {string} delimiter single character
 * @param {number} [maxRecords] stop after this many records (used for delimiter sniffing)
 * @returns {string[][]}
 */
export function splitRecords(text, delimiter, maxRecords = Infinity) {
  const src = String(text ?? '');
  const n = src.length;
  const records = [];
  let row = [];
  let i = 0;
  if (n === 0) return records;
  while (i <= n && records.length < maxRecords) {
    // parse one field starting at i
    let field = '';
    if (src[i] === '"') {
      i++;
      for (;;) {
        const q = src.indexOf('"', i);
        if (q < 0) { field += src.slice(i); i = n; break; }
        field += src.slice(i, q);
        if (src[q + 1] === '"') { field += '"'; i = q + 2; continue; }
        i = q + 1;
        break;
      }
      // lenient: keep anything between the closing quote and the next delimiter / line break
      let j = i;
      while (j < n && src[j] !== delimiter && src[j] !== '\n' && src[j] !== '\r') j++;
      if (j > i) field += src.slice(i, j);
      i = j;
    } else {
      let j = i;
      while (j < n && src[j] !== delimiter && src[j] !== '\n' && src[j] !== '\r') j++;
      field = src.slice(i, j);
      i = j;
    }
    row.push(field);
    if (i >= n) { records.push(row); break; }
    const c = src[i];
    if (c === delimiter) { i++; if (i === n) { row.push(''); records.push(row); break; } continue; }
    // line break
    i += c === '\r' && src[i + 1] === '\n' ? 2 : 1;
    records.push(row);
    row = [];
    if (i >= n) break;
  }
  return records;
}

/**
 * Guess the delimiter of delimited text: the candidate that splits the first records into the most
 * consistent number (> 1) of fields. Defaults to ','.
 * @param {string} text
 * @returns {string}
 */
export function detectDelimiter(text) {
  const sample = String(text ?? '').replace(/^﻿/, '').slice(0, 65536);
  let best = ',', bestScore = 0;
  for (const d of DELIMITERS) {
    const recs = splitRecords(sample, d, 50).filter((r) => !(r.length === 1 && r[0] === ''));
    if (recs.length > 1 && sample.length === 65536) recs.pop(); // last record may be cut off
    if (!recs.length) continue;
    const counts = new Map();
    for (const r of recs) counts.set(r.length, (counts.get(r.length) || 0) + 1);
    let mode = 1, modeN = 0;
    for (const [len, k] of counts) if (k > modeN || (k === modeN && len > mode)) { mode = len; modeN = k; }
    if (mode < 2) continue;
    // consistency first, then the number of fields
    const score = (modeN / recs.length) * 1000 + Math.min(mode, 999);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/**
 * Make header names usable as merge-field names: trimmed, blank names become "Column N" (N is the
 * 1-based column position) and duplicates get " (2)", " (3)"… (case-insensitive uniqueness).
 * @param {Array<string|null|undefined>} names
 * @returns {string[]}
 */
export function uniqueColumnNames(names) {
  const out = [];
  const used = new Set();
  const list = Array.from(names || [], (s) => String(s ?? '').replace(/\s+/g, ' ').trim());
  // reserve the explicit non-blank names first so generated names never steal them
  const explicit = new Set(list.filter(Boolean).map((s) => s.toLowerCase()));
  list.forEach((raw, i) => {
    let base = raw || `Column ${i + 1}`;
    let name = base;
    if (!raw) {
      let k = i + 1;
      while (used.has(name.toLowerCase()) || explicit.has(name.toLowerCase())) name = `Column ${++k}`;
      base = name;
    }
    for (let k = 2; used.has(name.toLowerCase()); k++) name = `${base} (${k})`;
    used.add(name.toLowerCase());
    out.push(name);
  });
  return out;
}

/**
 * Parse delimited text into columns and rows.
 * - strips a UTF-8 byte-order mark; accepts CRLF, LF and CR line breaks
 * - delimiter 'auto' (default) sniffs ',', ';', tab and '|'
 * - header (default true): the first record names the columns (see uniqueColumnNames); otherwise
 *   columns are "Column 1"…
 * - ragged rows are padded with '' (and extra fields add "Column N" columns); blank records are skipped
 * @param {string} text
 * @param {{ delimiter?: 'auto'|','|';'|'\t'|'|', header?: boolean }} [opts]
 * @returns {{ columns: string[], rows: string[][], delimiter: string }}
 */
export function parseCSV(text, opts = {}) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const delimiter = !opts.delimiter || opts.delimiter === 'auto' ? detectDelimiter(src) : opts.delimiter;
  const header = opts.header !== false;
  const records = splitRecords(src, delimiter).filter((r) => r.some((f) => f.trim() !== ''));
  let head = header && records.length ? records.shift() : [];
  const width = Math.max(head.length, ...records.map((r) => r.length), 0);
  head = head.concat(Array(width - head.length).fill(''));
  // trim trailing columns that are blank in the header and in every row
  let w = width;
  while (w > 0 && !head[w - 1].trim() && records.every((r) => !(r[w - 1] || '').trim())) w--;
  const columns = uniqueColumnNames(head.slice(0, w));
  const rows = records.map((r) => {
    const row = r.slice(0, w);
    while (row.length < w) row.push('');
    return row;
  });
  return { columns, rows, delimiter };
}

/**
 * Serialise columns and rows as CSV. Fields containing the delimiter, quotes, line breaks or
 * leading/trailing spaces are quoted; quotes are doubled.
 * @param {string[]} columns
 * @param {Array<Array<string|number|null|undefined>>} rows
 * @param {{ delimiter?: string, newline?: string, header?: boolean }} [opts]
 * @returns {string}
 */
export function toCSV(columns, rows, opts = {}) {
  const d = opts.delimiter || ',';
  const nl = opts.newline || '\r\n';
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return s.includes(d) || /["\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [];
  if (opts.header !== false) lines.push((columns || []).map(esc).join(d));
  const w = (columns || []).length;
  for (const r of rows || []) {
    const cells = [];
    for (let i = 0; i < Math.max(w, r.length); i++) cells.push(esc(r[i]));
    lines.push(cells.join(d));
  }
  return lines.join(nl) + (lines.length ? nl : '');
}
