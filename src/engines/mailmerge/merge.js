// Mail-merge data (doc.data): recipient view (exclusions, filters, sort), record access, editing.
//
// MergeData = { name, columns: string[], rows: string[][], excluded: number[] (row indices),
//               filters: [{ column, op, value }], sort: [{ column, dir: 'asc'|'desc' }],
//               current: number (position in the filtered/sorted view) }
//
// The view functions (viewIndices, recordAt, …) are pure. The editing helpers (setCell, addRow,
// deleteRow, addColumn, renameColumn, deleteColumn, toggleExcluded, moveColumn, setFilters, setSort)
// MUTATE the MergeData they are given and keep its derived state (excluded indices, filters, sort,
// current) consistent, so they fit inside `app.transact(label, (doc) => addRow(doc.data))`.
// Use cloneMergeData() first when you need an untouched copy.

import { uniqueColumnNames } from './csv.js';

/** Filter operators with UI labels. */
export const FILTER_OPS = [
  { id: 'equals', label: 'Equals' },
  { id: 'notEquals', label: 'Does not equal' },
  { id: 'contains', label: 'Contains' },
  { id: 'notContains', label: 'Does not contain' },
  { id: 'startsWith', label: 'Begins with' },
  { id: 'endsWith', label: 'Ends with' },
  { id: 'lessThan', label: 'Is less than' },
  { id: 'greaterThan', label: 'Is greater than' },
  { id: 'empty', label: 'Is blank' },
  { id: 'notEmpty', label: 'Is not blank' }
];

const str = (v) => (v === null || v === undefined ? '' : String(v));

/**
 * Create merge data. Column names are made unique/non-blank; rows are converted to strings and
 * padded/truncated to the column count.
 * @param {string} name source name shown in the UI (file or sheet name)
 * @param {string[]} columns
 * @param {Array<Array<*>>} rows
 * @returns {object} MergeData
 */
export function createMergeData(name, columns, rows) {
  const cols = uniqueColumnNames(columns || []);
  return {
    name: str(name) || 'Recipients',
    columns: cols,
    rows: (rows || []).map((r) => fitRow(r, cols.length)),
    excluded: [],
    filters: [],
    sort: [],
    current: 0
  };
}

function fitRow(r, w) {
  const out = Array.from(r || [], str).slice(0, w);
  while (out.length < w) out.push('');
  return out;
}

/**
 * Repair possibly incomplete merge data (e.g. from a file): fills defaults, pads rows, drops
 * out-of-range exclusions and filters/sorts on unknown columns. Returns a new object, or null.
 * @param {object|null} raw
 * @returns {object|null}
 */
export function normalizeMergeData(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.columns)) return null;
  const d = createMergeData(raw.name, raw.columns, Array.isArray(raw.rows) ? raw.rows : []);
  const has = new Set(d.columns);
  d.excluded = [...new Set((raw.excluded || []).filter((i) => Number.isInteger(i) && i >= 0 && i < d.rows.length))].sort((a, b) => a - b);
  d.filters = (raw.filters || []).filter((f) => f && has.has(f.column) && FILTER_OPS.some((o) => o.id === f.op)).map((f) => ({ column: f.column, op: f.op, value: str(f.value) }));
  d.sort = (raw.sort || []).filter((s) => s && has.has(s.column)).map((s) => ({ column: s.column, dir: s.dir === 'desc' ? 'desc' : 'asc' }));
  d.current = Number.isInteger(raw.current) && raw.current >= 0 ? raw.current : 0;
  return d;
}

/**
 * Deep copy of merge data.
 * @param {object} data
 * @returns {object}
 */
export function cloneMergeData(data) {
  return data ? JSON.parse(JSON.stringify(data)) : data;
}

// ---------------------------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------------------------

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const NUM_RE = /^\s*[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?\s*%?\s*$/;
const CURRENCY_RE = /^\s*[-+]?\s*[$€£¥]\s*/;

/**
 * Parse a cell as a number when the whole value is numeric ('1,234.5', '-3', '45%', '$12.00').
 * @param {string} v
 * @returns {number|null}
 */
export function numericValue(v) {
  let s = str(v).trim();
  if (!s) return null;
  let sign = 1;
  if (CURRENCY_RE.test(s)) {
    if (/^\s*-/.test(s)) sign = -1;
    s = s.replace(CURRENCY_RE, '');
  }
  if (!NUM_RE.test(s) || !/\d/.test(s)) return null;
  const n = Number(s.replace(/[,%\s]/g, ''));
  return Number.isFinite(n) ? n * sign : null;
}

/**
 * Natural, case-insensitive comparison: numbers (including decimals and negatives) compare
 * numerically, text compares with embedded digit runs as numbers ('Item 2' < 'Item 10').
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function naturalCompare(a, b) {
  const x = str(a), y = str(b);
  const nx = numericValue(x), ny = numericValue(y);
  if (nx !== null && ny !== null) return nx < ny ? -1 : nx > ny ? 1 : 0;
  return collator.compare(x.trim(), y.trim());
}

// ---------------------------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------------------------

/**
 * Test one value against a filter (case-insensitive; surrounding spaces ignored).
 * @param {string} value
 * @param {{ op: string, value?: string }} filter
 * @returns {boolean}
 */
export function matchesFilter(value, filter) {
  const v = str(value).trim().toLowerCase();
  const q = str(filter.value).trim().toLowerCase();
  switch (filter.op) {
    case 'contains': return v.includes(q);
    case 'notContains': return !v.includes(q);
    case 'equals': return v === q || (numericValue(v) !== null && numericValue(v) === numericValue(q));
    case 'notEquals': return !(v === q || (numericValue(v) !== null && numericValue(v) === numericValue(q)));
    case 'startsWith': return v.startsWith(q);
    case 'endsWith': return v.endsWith(q);
    case 'lessThan': return v !== '' && naturalCompare(v, q) < 0;
    case 'greaterThan': return v !== '' && naturalCompare(v, q) > 0;
    case 'empty': return v === '';
    case 'notEmpty': return v !== '';
    default: return true;
  }
}

/**
 * Row indices in view order: excluded rows removed, filters applied (AND), then sorted by the sort
 * keys in order (natural compare; blanks last; stable — ties keep the original order).
 * Filters and sort keys on columns that no longer exist are ignored.
 * @param {object} data MergeData
 * @param {{ includeExcluded?: boolean }} [opts] includeExcluded keeps excluded rows (for the recipient grid)
 * @returns {number[]}
 */
export function viewIndices(data, opts = {}) {
  if (!data || !Array.isArray(data.rows)) return [];
  const colIdx = new Map((data.columns || []).map((c, i) => [c, i]));
  const excluded = new Set(opts.includeExcluded ? [] : data.excluded || []);
  const filters = (data.filters || []).filter((f) => f && colIdx.has(f.column));
  const out = [];
  for (let i = 0; i < data.rows.length; i++) {
    if (excluded.has(i)) continue;
    const row = data.rows[i];
    if (filters.every((f) => matchesFilter(row[colIdx.get(f.column)], f))) out.push(i);
  }
  const keys = (data.sort || []).filter((s) => s && colIdx.has(s.column)).map((s) => ({ i: colIdx.get(s.column), dir: s.dir === 'desc' ? -1 : 1 }));
  if (keys.length) {
    out.sort((a, b) => {
      for (const k of keys) {
        const va = str(data.rows[a][k.i]), vb = str(data.rows[b][k.i]);
        const ea = va.trim() === '', eb = vb.trim() === '';
        if (ea !== eb) return ea ? 1 : -1;
        const c = naturalCompare(va, vb) * k.dir;
        if (c) return c;
      }
      return a - b;
    });
  }
  return out;
}

/**
 * Values of one row as an object keyed by column name.
 * @param {object} data
 * @param {number} rowIndex
 * @returns {Object<string,string>|null}
 */
export function rowValues(data, rowIndex) {
  const row = data && data.rows && data.rows[rowIndex];
  if (!row) return null;
  const values = {};
  data.columns.forEach((c, i) => { values[c] = str(row[i]); });
  return values;
}

/**
 * The record at a position in the view.
 * @param {object} data
 * @param {number} viewPos 0-based position in viewIndices(data)
 * @returns {{ index: number, position: number, count: number, values: Object<string,string> }|null}
 *   index is the row index in data.rows; null when the position is out of range
 */
export function recordAt(data, viewPos) {
  const view = viewIndices(data);
  if (!Number.isInteger(viewPos) || viewPos < 0 || viewPos >= view.length) return null;
  const index = view[viewPos];
  return { index, position: viewPos, count: view.length, values: rowValues(data, index) };
}

/**
 * The record at data.current (clamped into the view), or null when the view is empty.
 * @param {object} data
 * @returns {{ index: number, position: number, count: number, values: Object<string,string> }|null}
 */
export function currentRecord(data) {
  if (!data) return null;
  const n = viewIndices(data).length;
  if (!n) return null;
  return recordAt(data, Math.min(Math.max(0, data.current | 0), n - 1));
}

/**
 * Number of records in the view.
 * @param {object} data
 * @returns {number}
 */
export function recordCount(data) {
  return viewIndices(data).length;
}

// ---------------------------------------------------------------------------------------------
// Editing (mutating)
// ---------------------------------------------------------------------------------------------

function colIndexOf(data, column) {
  if (typeof column === 'number') return column >= 0 && column < data.columns.length ? column : -1;
  return data.columns.indexOf(column);
}

function clampCurrent(data) {
  const n = viewIndices(data).length;
  data.current = Math.max(0, Math.min(data.current | 0, Math.max(0, n - 1)));
}

/**
 * Set one cell. MUTATES data.
 * @param {object} data
 * @param {number} rowIndex index in data.rows
 * @param {string|number} column column name or index
 * @param {*} value
 * @returns {boolean} true when changed
 */
export function setCell(data, rowIndex, column, value) {
  const c = colIndexOf(data, column);
  const row = data.rows[rowIndex];
  if (c < 0 || !row) return false;
  const v = str(value);
  if (row[c] === v) return false;
  row[c] = v;
  return true;
}

/**
 * Add a row. MUTATES data. Exclusions after the insertion point shift down.
 * @param {object} data
 * @param {Array<*>|Object<string,*>} [values] array in column order or object keyed by column
 * @param {number} [at] insertion index (default: end)
 * @returns {number} the new row's index
 */
export function addRow(data, values = [], at = data.rows.length) {
  const w = data.columns.length;
  const row = Array.isArray(values) ? fitRow(values, w) : data.columns.map((c) => str(values && values[c]));
  const i = Math.max(0, Math.min(at | 0, data.rows.length));
  data.rows.splice(i, 0, row);
  data.excluded = (data.excluded || []).map((x) => (x >= i ? x + 1 : x));
  return i;
}

/**
 * Delete a row. MUTATES data. Its exclusion is dropped and later exclusions shift up; current is clamped.
 * @param {object} data
 * @param {number} rowIndex
 * @returns {boolean}
 */
export function deleteRow(data, rowIndex) {
  if (!data.rows[rowIndex]) return false;
  data.rows.splice(rowIndex, 1);
  data.excluded = (data.excluded || []).filter((x) => x !== rowIndex).map((x) => (x > rowIndex ? x - 1 : x));
  clampCurrent(data);
  return true;
}

/**
 * A column name not yet used (case-insensitive): 'Name', 'Name (2)', …
 * @param {object} data
 * @param {string} name
 * @returns {string}
 */
export function uniqueColumnName(data, name, ignoreIndex = -1) {
  const base = str(name).replace(/\s+/g, ' ').trim() || `Column ${data.columns.length + 1}`;
  const used = new Set(data.columns.filter((_, i) => i !== ignoreIndex).map((c) => c.toLowerCase()));
  let out = base;
  for (let k = 2; used.has(out.toLowerCase()); k++) out = `${base} (${k})`;
  return out;
}

/**
 * Add a column. MUTATES data.
 * @param {object} data
 * @param {string} name desired name (made unique)
 * @param {{ at?: number, fill?: string }} [opts]
 * @returns {string} the name actually used
 */
export function addColumn(data, name, opts = {}) {
  const n = uniqueColumnName(data, name);
  const at = opts.at === undefined ? data.columns.length : Math.max(0, Math.min(opts.at | 0, data.columns.length));
  data.columns.splice(at, 0, n);
  for (const r of data.rows) r.splice(at, 0, str(opts.fill));
  return n;
}

/**
 * Rename a column. MUTATES data (filters and sort keys follow). The new name is made unique.
 * Callers should update merge-field spans with the returned map (see renameFieldsInDocument).
 * @param {object} data
 * @param {string|number} column current name or index
 * @param {string} newName
 * @returns {{ from: string, to: string, map: Object<string,string> }|null} null when the column does not exist;
 *   map is {} when the name did not change
 */
export function renameColumn(data, column, newName) {
  const c = colIndexOf(data, column);
  if (c < 0) return null;
  const from = data.columns[c];
  const to = uniqueColumnName(data, newName || from, c);
  if (to === from) return { from, to, map: {} };
  data.columns[c] = to;
  for (const f of data.filters || []) if (f.column === from) f.column = to;
  for (const s of data.sort || []) if (s.column === from) s.column = to;
  return { from, to, map: { [from]: to } };
}

/**
 * Delete a column. MUTATES data; filters and sort keys on it are removed.
 * @param {object} data
 * @param {string|number} column
 * @returns {boolean}
 */
export function deleteColumn(data, column) {
  const c = colIndexOf(data, column);
  if (c < 0) return false;
  const name = data.columns[c];
  data.columns.splice(c, 1);
  for (const r of data.rows) r.splice(c, 1);
  data.filters = (data.filters || []).filter((f) => f.column !== name);
  data.sort = (data.sort || []).filter((s) => s.column !== name);
  clampCurrent(data);
  return true;
}

/**
 * Move a column to a new position. MUTATES data.
 * @param {object} data
 * @param {string|number} column
 * @param {number} to target index
 * @returns {boolean}
 */
export function moveColumn(data, column, to) {
  const c = colIndexOf(data, column);
  if (c < 0) return false;
  const t = Math.max(0, Math.min(to | 0, data.columns.length - 1));
  if (t === c) return false;
  const [name] = data.columns.splice(c, 1);
  data.columns.splice(t, 0, name);
  for (const r of data.rows) { const [v] = r.splice(c, 1); r.splice(t, 0, v); }
  return true;
}

/**
 * Include or exclude a row from the merge. MUTATES data.
 * @param {object} data
 * @param {number} rowIndex
 * @param {boolean} [exclude] omit to toggle
 * @returns {boolean} true when the row is now excluded
 */
export function toggleExcluded(data, rowIndex, exclude) {
  if (!data.rows[rowIndex]) return false;
  const set = new Set(data.excluded || []);
  const now = exclude === undefined ? !set.has(rowIndex) : !!exclude;
  if (now) set.add(rowIndex); else set.delete(rowIndex);
  data.excluded = [...set].sort((a, b) => a - b);
  clampCurrent(data);
  return now;
}

/**
 * Replace the filters (unknown columns / operators dropped). MUTATES data; current resets to 0.
 * @param {object} data
 * @param {Array<{column: string, op: string, value?: string}>} filters
 */
export function setFilters(data, filters) {
  const has = new Set(data.columns);
  data.filters = (filters || []).filter((f) => f && has.has(f.column) && FILTER_OPS.some((o) => o.id === f.op))
    .map((f) => ({ column: f.column, op: f.op, value: str(f.value) }));
  data.current = 0;
}

/**
 * Replace the sort keys (unknown columns dropped). MUTATES data; current resets to 0.
 * @param {object} data
 * @param {Array<{column: string, dir?: 'asc'|'desc'}>} sort
 */
export function setSort(data, sort) {
  const has = new Set(data.columns);
  data.sort = (sort || []).filter((s) => s && has.has(s.column)).map((s) => ({ column: s.column, dir: s.dir === 'desc' ? 'desc' : 'asc' }));
  data.current = 0;
}

// ---------------------------------------------------------------------------------------------
// Address blocks
// ---------------------------------------------------------------------------------------------

/** Address-block parts in display order, with the column-name synonyms used by guessFieldMapping. */
export const ADDRESS_FIELDS = [
  { key: 'title', label: 'Title', synonyms: ['title', 'courtesy title', 'salutation', 'prefix', 'honorific', 'mr mrs'] },
  { key: 'firstName', label: 'First name', synonyms: ['first name', 'firstname', 'first', 'given name', 'forename', 'fname', 'christian name'] },
  { key: 'middleName', label: 'Middle name', synonyms: ['middle name', 'middle', 'middle initial', 'mi'] },
  { key: 'lastName', label: 'Last name', synonyms: ['last name', 'lastname', 'last', 'surname', 'family name', 'lname'] },
  { key: 'suffix', label: 'Suffix', synonyms: ['suffix', 'name suffix'] },
  { key: 'fullName', label: 'Full name', synonyms: ['full name', 'name', 'contact name', 'contact', 'recipient', 'display name', 'customer name', 'attendee', 'guest'] },
  { key: 'jobTitle', label: 'Job title', synonyms: ['job title', 'position', 'role'] },
  { key: 'company', label: 'Company', synonyms: ['company', 'company name', 'organization', 'organisation', 'business', 'firm', 'employer'] },
  { key: 'address1', label: 'Address line 1', synonyms: ['address line 1', 'address 1', 'address1', 'address', 'street', 'street address', 'addr1', 'mailing address', 'line 1'] },
  { key: 'address2', label: 'Address line 2', synonyms: ['address line 2', 'address 2', 'address2', 'addr2', 'suite', 'apartment', 'apt', 'line 2', 'unit'] },
  { key: 'city', label: 'City', synonyms: ['city', 'town', 'locality', 'suburb'] },
  { key: 'state', label: 'State', synonyms: ['state', 'province', 'region', 'county', 'state province', 'st'] },
  { key: 'postalCode', label: 'Postal code', synonyms: ['zip', 'zip code', 'zipcode', 'postal code', 'postcode', 'post code', 'postal'] },
  { key: 'country', label: 'Country', synonyms: ['country', 'country region', 'nation'] },
  { key: 'email', label: 'Email', synonyms: ['email', 'e mail', 'email address', 'mail'] },
  { key: 'phone', label: 'Phone', synonyms: ['phone', 'telephone', 'phone number', 'tel', 'mobile', 'cell', 'home phone', 'work phone'] }
];

const normKey = (s) => str(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Guess which columns hold the address-block parts. Exact synonym matches win over partial ones; each
 * column is used at most once.
 * @param {string[]} columns
 * @returns {Object<string, string|null>} key (see ADDRESS_FIELDS) -> column name or null
 */
export function guessFieldMapping(columns) {
  const cols = (columns || []).map((c) => ({ name: c, key: normKey(c), compact: normKey(c).replace(/ /g, '') }));
  const used = new Set();
  const mapping = {};
  for (const f of ADDRESS_FIELDS) mapping[f.key] = null;
  // pass 1: exact matches (spaces optional)
  for (const f of ADDRESS_FIELDS) {
    const hit = cols.find((c) => !used.has(c.name) && f.synonyms.some((s) => c.key === s || c.compact === s.replace(/ /g, '')));
    if (hit) { mapping[f.key] = hit.name; used.add(hit.name); }
  }
  // pass 2: whole-word containment for still-unmapped parts (e.g. "Home Street", "Business City")
  for (const f of ADDRESS_FIELDS) {
    if (mapping[f.key]) continue;
    const hit = cols.find((c) => !used.has(c.name) && f.synonyms.some((s) => s.length > 2 && new RegExp(`(^| )${s}( |$)`).test(c.key)));
    if (hit) { mapping[f.key] = hit.name; used.add(hit.name); }
  }
  return mapping;
}

/**
 * Format an address block from record values:
 *   [Title First Middle Last Suffix] (or Full name), Job title, Company, Address 1, Address 2,
 *   "City, State Postal", Country — blank lines omitted.
 * @param {Object<string,string>} values record values keyed by column
 * @param {Object<string,string|null>} mapping from guessFieldMapping (or edited by the user)
 * @param {{ includeTitle?: boolean, includeCompany?: boolean, includeCountry?: boolean|string,
 *   includeJobTitle?: boolean, separator?: string }} [opts] includeCountry may be a country name to omit (e.g. the home country)
 * @returns {string} lines joined by opts.separator (default '\n')
 */
export function formatAddressBlock(values, mapping, opts = {}) {
  const get = (k) => {
    const col = mapping && mapping[k];
    return col && values ? str(values[col]).trim() : '';
  };
  const lines = [];
  const nameParts = [opts.includeTitle === false ? '' : get('title'), get('firstName'), get('middleName'), get('lastName'), get('suffix')].filter(Boolean);
  const name = nameParts.length && (get('firstName') || get('lastName')) ? nameParts.join(' ') : get('fullName') || nameParts.join(' ');
  if (name) lines.push(name);
  if (opts.includeJobTitle && get('jobTitle')) lines.push(get('jobTitle'));
  if (opts.includeCompany !== false && get('company')) lines.push(get('company'));
  if (get('address1')) lines.push(...get('address1').split(/\r\n|\r|\n/).map((s) => s.trim()).filter(Boolean));
  if (get('address2')) lines.push(get('address2'));
  const city = get('city'), state = get('state'), zip = get('postalCode');
  const cityLine = [city && (state || zip) ? `${city},` : city, state, zip].filter(Boolean).join(' ');
  if (cityLine) lines.push(cityLine);
  const country = get('country');
  const omitCountry = opts.includeCountry === false || (typeof opts.includeCountry === 'string' && country.toLowerCase() === opts.includeCountry.toLowerCase());
  if (country && !omitCountry) lines.push(country);
  return lines.join(opts.separator ?? '\n');
}
