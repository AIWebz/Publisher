import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMergeData, normalizeMergeData, viewIndices, recordAt, currentRecord, recordCount, rowValues, naturalCompare, numericValue,
  matchesFilter, setCell, addRow, deleteRow, addColumn, renameColumn, deleteColumn, moveColumn, toggleExcluded, setFilters, setSort,
  guessFieldMapping, formatAddressBlock
} from '../../src/engines/mailmerge/merge.js';

const sample = () => createMergeData('people.csv', ['Name', 'City', 'Amount'], [
  ['Item 10', 'Boston', '10.5'],
  ['item 2', 'boston', '9.75'],
  ['Zed', 'Austin', '-3'],
  ['Amy', '', '1,200'],
  ['bob', 'Bostonia', '']
]);

test('createMergeData normalises columns and rows', () => {
  const d = createMergeData('x', ['A', '', 'A'], [[1, null], ['a', 'b', 'c', 'd']]);
  assert.deepEqual(d.columns, ['A', 'Column 2', 'A (2)']);
  assert.deepEqual(d.rows, [['1', '', ''], ['a', 'b', 'c']]);
  assert.deepEqual({ ex: d.excluded, f: d.filters, s: d.sort, c: d.current }, { ex: [], f: [], s: [], c: 0 });
});

test('natural / numeric comparison', () => {
  assert.ok(naturalCompare('Item 2', 'item 10') < 0);
  assert.ok(naturalCompare('10.5', '9.75') > 0);
  assert.ok(naturalCompare('-3', '1,200') < 0);
  assert.ok(naturalCompare('$5.00', '$12') < 0);
  assert.equal(naturalCompare('abc', 'ABC'), 0);
  assert.equal(numericValue('1,200'), 1200);
  assert.equal(numericValue('45%'), 45);
  assert.equal(numericValue('-$3.50'), -3.5);
  assert.equal(numericValue('12 Main St'), null);
  assert.equal(numericValue(''), null);
});

test('filters are case-insensitive and AND-combined', () => {
  const d = sample();
  assert.ok(matchesFilter('Boston', { op: 'equals', value: 'BOSTON' }));
  assert.ok(matchesFilter(' 5 ', { op: 'equals', value: '5.0' }));
  d.filters = [{ column: 'City', op: 'startsWith', value: 'bos' }];
  assert.deepEqual(viewIndices(d), [0, 1, 4]);
  d.filters.push({ column: 'City', op: 'notEquals', value: 'bostonia' });
  assert.deepEqual(viewIndices(d), [0, 1]);
  d.filters = [{ column: 'City', op: 'empty' }];
  assert.deepEqual(viewIndices(d), [3]);
  d.filters = [{ column: 'Amount', op: 'notEmpty' }, { column: 'Name', op: 'contains', value: 'E' }];
  assert.deepEqual(viewIndices(d), [0, 1, 2]);
  d.filters = [{ column: 'Amount', op: 'greaterThan', value: '9.8' }];
  assert.deepEqual(viewIndices(d), [0, 3]);
  d.filters = [{ column: 'Gone', op: 'equals', value: 'x' }];
  assert.deepEqual(viewIndices(d), [0, 1, 2, 3, 4], 'filters on unknown columns are ignored');
});

test('multi-key sort with natural compare, blanks last, stable', () => {
  const d = sample();
  d.sort = [{ column: 'Name', dir: 'asc' }];
  assert.deepEqual(viewIndices(d).map((i) => d.rows[i][0]), ['Amy', 'bob', 'item 2', 'Item 10', 'Zed']);
  d.sort = [{ column: 'Amount', dir: 'desc' }];
  assert.deepEqual(viewIndices(d).map((i) => d.rows[i][2]), ['1,200', '10.5', '9.75', '-3', '']);
  d.sort = [{ column: 'City', dir: 'asc' }, { column: 'Name', dir: 'desc' }];
  assert.deepEqual(viewIndices(d), [2, 0, 1, 4, 3]);
});

test('exclusions, recordAt and currentRecord', () => {
  const d = sample();
  toggleExcluded(d, 1);
  assert.deepEqual(d.excluded, [1]);
  assert.deepEqual(viewIndices(d), [0, 2, 3, 4]);
  assert.deepEqual(viewIndices(d, { includeExcluded: true }), [0, 1, 2, 3, 4]);
  assert.equal(recordCount(d), 4);
  const r = recordAt(d, 1);
  assert.deepEqual(r, { index: 2, position: 1, count: 4, values: { Name: 'Zed', City: 'Austin', Amount: '-3' } });
  assert.equal(recordAt(d, 4), null);
  assert.equal(recordAt(d, -1), null);
  d.current = 99;
  assert.equal(currentRecord(d).index, 4);
  assert.equal(toggleExcluded(d, 1), false);
  assert.equal(toggleExcluded(d, 3, true), true);
  assert.equal(toggleExcluded(d, 3, true), true);
  assert.deepEqual(d.excluded, [3]);
});

test('row editing keeps exclusions consistent', () => {
  const d = sample();
  toggleExcluded(d, 2);
  toggleExcluded(d, 4);
  assert.equal(addRow(d, { Name: 'New', Amount: 5 }, 1), 1);
  assert.deepEqual(d.rows[1], ['New', '', '5']);
  assert.deepEqual(d.excluded, [3, 5]);
  assert.equal(addRow(d, ['Last', 'X']), 6);
  assert.deepEqual(d.rows[6], ['Last', 'X', '']);
  assert.ok(deleteRow(d, 3));
  assert.deepEqual(d.excluded, [4]);
  assert.equal(deleteRow(d, 99), false);
  assert.ok(setCell(d, 0, 'City', 'Denver'));
  assert.equal(setCell(d, 0, 1, 'Denver'), false, 'unchanged');
  assert.equal(d.rows[0][1], 'Denver');
  assert.equal(setCell(d, 0, 'Nope', 'x'), false);
});

test('column editing: add, rename (with map), move, delete', () => {
  const d = sample();
  d.filters = [{ column: 'City', op: 'equals', value: 'Boston' }];
  d.sort = [{ column: 'City', dir: 'asc' }];
  assert.equal(addColumn(d, 'city'), 'city (2)');
  assert.equal(addColumn(d, 'Zip', { at: 1, fill: '000' }), 'Zip');
  assert.deepEqual(d.columns, ['Name', 'Zip', 'City', 'Amount', 'city (2)']);
  assert.deepEqual(d.rows[0], ['Item 10', '000', 'Boston', '10.5', '']);
  const r = renameColumn(d, 'City', 'Town');
  assert.deepEqual(r, { from: 'City', to: 'Town', map: { City: 'Town' } });
  assert.equal(d.filters[0].column, 'Town');
  assert.equal(d.sort[0].column, 'Town');
  assert.equal(renameColumn(d, 'Town', 'name').to, 'name (2)', 'renamed names stay unique');
  assert.deepEqual(renameColumn(d, 'Zip', 'Zip').map, {});
  assert.equal(renameColumn(d, 'Missing', 'X'), null);
  assert.ok(moveColumn(d, 'Amount', 0));
  assert.deepEqual(d.columns, ['Amount', 'Name', 'Zip', 'name (2)', 'city (2)']);
  assert.deepEqual(d.rows[0], ['10.5', 'Item 10', '000', 'Boston', '']);
  assert.ok(deleteColumn(d, 'name (2)'));
  assert.deepEqual(d.filters, []);
  assert.deepEqual(d.sort, []);
  assert.deepEqual(d.rows[0], ['10.5', 'Item 10', '000', '']);
});

test('setFilters / setSort / normalizeMergeData drop invalid entries', () => {
  const d = sample();
  setFilters(d, [{ column: 'City', op: 'contains', value: 'bos' }, { column: 'X', op: 'equals' }, { column: 'Name', op: 'bogus' }]);
  assert.deepEqual(d.filters, [{ column: 'City', op: 'contains', value: 'bos' }]);
  setSort(d, [{ column: 'Name' }, { column: 'Nope', dir: 'desc' }]);
  assert.deepEqual(d.sort, [{ column: 'Name', dir: 'asc' }]);
  const n = normalizeMergeData({ name: 'n', columns: ['A'], rows: [['1', 'extra'], []], excluded: [5, 1, 1, -1], filters: [{ column: 'B', op: 'equals' }], current: 1 });
  assert.deepEqual(n.rows, [['1'], ['']]);
  assert.deepEqual(n.excluded, [1]);
  assert.deepEqual(n.filters, []);
  assert.equal(normalizeMergeData(null), null);
  assert.deepEqual(rowValues(n, 0), { A: '1' });
});

test('guessFieldMapping recognises common address columns', () => {
  const m = guessFieldMapping(['E-mail Address', 'First Name', 'Surname', 'Company Name', 'Street', 'Address 2', 'Town', 'State/Province', 'ZIP Code', 'Country/Region', 'Notes']);
  assert.equal(m.firstName, 'First Name');
  assert.equal(m.lastName, 'Surname');
  assert.equal(m.company, 'Company Name');
  assert.equal(m.address1, 'Street');
  assert.equal(m.address2, 'Address 2');
  assert.equal(m.city, 'Town');
  assert.equal(m.state, 'State/Province');
  assert.equal(m.postalCode, 'ZIP Code');
  assert.equal(m.country, 'Country/Region');
  assert.equal(m.email, 'E-mail Address');
  assert.equal(m.fullName, null);
  const m2 = guessFieldMapping(['Name', 'Address', 'City', 'Zip']);
  assert.equal(m2.fullName, 'Name');
  assert.equal(m2.address1, 'Address');
  assert.equal(m2.postalCode, 'Zip');
  const m3 = guessFieldMapping(['Home Street', 'Home City', 'firstname']);
  assert.equal(m3.address1, 'Home Street');
  assert.equal(m3.city, 'Home City');
  assert.equal(m3.firstName, 'firstname');
});

test('formatAddressBlock builds lines and skips blanks', () => {
  const mapping = guessFieldMapping(['Title', 'First Name', 'Last Name', 'Company', 'Address 1', 'Address 2', 'City', 'State', 'Zip', 'Country']);
  const values = { Title: 'Dr.', 'First Name': 'Ada', 'Last Name': 'Lovelace', Company: 'Engines Ltd', 'Address 1': '12 Main St', 'Address 2': '', City: 'Boston', State: 'MA', Zip: '02134', Country: 'USA' };
  assert.equal(formatAddressBlock(values, mapping), 'Dr. Ada Lovelace\nEngines Ltd\n12 Main St\nBoston, MA 02134\nUSA');
  assert.equal(formatAddressBlock(values, mapping, { includeTitle: false, includeCompany: false, includeCountry: 'usa', separator: ' | ' }), 'Ada Lovelace | 12 Main St | Boston, MA 02134');
  assert.equal(formatAddressBlock({ City: 'Paris' }, mapping), 'Paris');
  assert.equal(formatAddressBlock({ Name: 'Bob Smith', Address: 'A\nB' }, guessFieldMapping(['Name', 'Address'])), 'Bob Smith\nA\nB');
});
