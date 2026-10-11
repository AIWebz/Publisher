import test from 'node:test';
import assert from 'node:assert/strict';
import { listFields, substituteFields, renderFields, fieldSpan, findFields, parseFieldName, isPageField, formatPageNumber,
  formatDate, formatTime, resolvePageField, PAGE_FIELDS } from '../../src/engines/text/fields.js';
import { sanitizeHtml } from '../../src/engines/text/sanitize.js';

const html = `<p>Dear ${fieldSpan('First Name')} ${fieldSpan('Last')},</p><p>page ${fieldSpan('#page')} of ${fieldSpan('#pages')}; again ${fieldSpan('First Name')}</p>`;

test('fieldSpan produces the contract markup and survives sanitize', () => {
  assert.equal(fieldSpan('City'), '<span class="field" data-field="City" contenteditable="false">«City»</span>');
  assert.equal(fieldSpan('a"<b>'), '<span class="field" data-field="a&quot;&lt;b&gt;" contenteditable="false">«a"&lt;b&gt;»</span>');
  assert.equal(sanitizeHtml(html), html);
});

test('listFields returns unique names in order', () => {
  assert.deepEqual(listFields(html), ['First Name', 'Last', '#page', '#pages']);
  assert.deepEqual(listFields('<p>none <span class="x" data-field="y">n</span></p>'), []);
});

test('substituteFields replaces spans with escaped values and keeps unresolved fields', () => {
  const out = substituteFields(html, (n) => ({ 'First Name': 'Ann & <Bo>', '#page': 3, '#pages': 9 })[n]);
  assert.equal(out, `<p>Dear Ann &amp; &lt;Bo&gt; ${fieldSpan('Last')},</p><p>page 3 of 9; again Ann &amp; &lt;Bo&gt;</p>`);
  assert.equal(substituteFields(html, () => null), html);
});

test('renderFields keeps spans and fills their content', () => {
  const out = renderFields(`<p>${fieldSpan('A')}</p>`, (n) => (n === 'A' ? 'x<y' : null));
  assert.equal(out, '<p><span class="field" data-field="A" contenteditable="false">x&lt;y</span></p>');
  assert.equal(renderFields(`<p>${fieldSpan('B')}</p>`, () => null), `<p>${fieldSpan('B')}</p>`);
});

test('findFields gives source ranges including nested spans', () => {
  const src = '<p>a<span class="field" data-field="N"><span>v</span></span>b</p>';
  const [f] = findFields(src);
  assert.equal(src.slice(f.start, f.end), '<span class="field" data-field="N"><span>v</span></span>');
  assert.equal(src.slice(f.innerStart, f.innerEnd), '<span>v</span>');
});

test('page number formats', () => {
  assert.equal(formatPageNumber(4), '4');
  assert.equal(formatPageNumber(14, 'roman'), 'xiv');
  assert.equal(formatPageNumber(1999, 'ROMAN'), 'MCMXCIX');
  assert.equal(formatPageNumber(28, 'alpha'), 'ab');
  assert.equal(formatPageNumber(3, 'ALPHA'), 'C');
  assert.equal(formatPageNumber(7, '000'), '007');
});

test('date and time formats', () => {
  const d = new Date(2026, 2, 5, 14, 7, 9);
  assert.equal(formatDate(d, 'iso'), '2026-03-05');
  assert.equal(formatDate(d, 'YYYY/MM/DD HH:mm:ss'), '2026/03/05 14:07:09');
  assert.equal(formatDate(d, 'D.M.YY [at] h:mm a', 'en-US'), '5.3.26 at 2:07 pm');
  assert.equal(formatDate(d, 'MMMM D, YYYY', 'en-US'), 'March 5, 2026');
  assert.equal(formatDate(d, 'dddd', 'en-US'), 'Thursday');
  assert.equal(formatDate(d, 'long', 'en-US'), 'March 5, 2026');
  assert.equal(formatTime(d, 'HH:mm'), '14:07');
  assert.equal(formatDate(new Date('bad')), '');
});

test('page field resolution', () => {
  const d = new Date(2026, 0, 2);
  assert.deepEqual(parseFieldName('#date:long'), { base: '#date', format: 'long' });
  assert.deepEqual(parseFieldName('City:x'), { base: 'City:x', format: '' });
  assert.ok(isPageField('#page:roman') && !isPageField('Name'));
  assert.equal(resolvePageField('#page', { page: 3 }), '3');
  assert.equal(resolvePageField('#page:roman', { page: 3 }), 'iii');
  assert.equal(resolvePageField('#pages', { pages: 12 }), '12');
  assert.equal(resolvePageField('#page', {}), null);
  assert.equal(resolvePageField('#date:iso', { date: d }), '2026-01-02');
  assert.equal(resolvePageField('Name', { page: 1 }), null);
  assert.deepEqual(PAGE_FIELDS.map((f) => f.name), ['#page', '#pages', '#date', '#time']);
});
