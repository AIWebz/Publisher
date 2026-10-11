import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, createTextFrame, createElement } from '../../src/core/model.js';
import { collectTextTargets } from '../../src/engines/spell/targets.js';
import { findAll, findInHtml, replaceMatch, replaceAll, expandReplacement } from '../../src/engines/spell/find.js';

function makeDoc() {
  const doc = createDocument({ pages: 2 });
  const lower = createTextFrame(doc, { x: 100, y: 500, w: 200, h: 100 }, '<p>Lower frame says Hello.</p>');
  const upper = createTextFrame(doc, { x: 100, y: 50, w: 200, h: 100 }, '<p>Hel<b>lo</b> world</p><p>hello again</p>');
  doc.pages[0].elements.push(lower, upper);
  // linked chain: head on page 1 (pages[1]), continuation on the same page
  const head = createTextFrame(doc, { x: 50, y: 50, w: 100, h: 100 }, '<p>Chained HELLO story</p>');
  const tail = createElement('text', { x: 50, y: 300, w: 100, h: 100, storyId: head.storyId });
  head.next = tail.id;
  const table = createElement('table', {
    x: 300, y: 50, w: 200, h: 60, cols: [100, 100], rows: [30, 30],
    cells: [[{ html: '<p>hello cell</p>' }, { html: '<p>B &amp; C</p>' }],
      [{ html: '<p>merged hello</p>', colSpan: 2 }, { html: '<p>hidden hello</p>', covered: true }]]
  });
  doc.pages[1].elements.push(tail, table, head);
  return { doc, lower, upper, head, tail, table };
}

test('collectTextTargets: reading order, chained stories once, covered cells skipped', () => {
  const { doc, lower, upper, head, table } = makeDoc();
  const t = collectTextTargets(doc, { includeMasters: false });
  assert.deepEqual(t.map((x) => (x.kind === 'story' ? x.frameId : `${x.elementId}:${x.r}:${x.c}`)), [
    upper.id, lower.id, head.id, `${table.id}:0:0`, `${table.id}:0:1`, `${table.id}:1:0`
  ]);
  assert.equal(t[2].pageIndex, 1);
  assert.equal(t[2].storyId, head.storyId);
});

test('findAll crosses inline formatting but not paragraphs', () => {
  const { doc, upper } = makeDoc();
  const m = findAll(doc, 'Hello', { matchCase: true });
  assert.equal(m.length, 2);
  assert.equal(m[0].target.frameId, upper.id);
  assert.deepEqual([m[0].start, m[0].end, m[0].text], [0, 5, 'Hello']);
  assert.equal(m[0].context.match, 'Hello');
  assert.equal(m[0].context.after, ' world');
  assert.equal(findInHtml('<p>ab</p><p>cd</p>', 'bc').length, 0);
});

test('findAll case-insensitive and whole-word options', () => {
  const { doc } = makeDoc();
  assert.equal(findAll(doc, 'hello').length, 6);
  assert.equal(findAll(doc, 'hello', { matchCase: true }).length, 3);
  assert.equal(findInHtml('<p>cat catalog scat cat.</p>', 'cat', { wholeWord: true }).length, 2);
  assert.equal(findInHtml('<p>cat catalog scat cat.</p>', 'cat').length, 4);
  assert.equal(findInHtml('<p>Café café</p>', 'CAFÉ').length, 2);
});

test('regex search, invalid regex throws, special chars literal without regex', () => {
  const m = findInHtml('<p>Call 555-1234 or 555-9876</p>', '\\d{3}-(\\d{4})', { useRegex: true });
  assert.deepEqual(m.map((x) => x.text), ['555-1234', '555-9876']);
  assert.deepEqual(m[0].captures, ['1234']);
  assert.throws(() => findInHtml('<p>x</p>', '(', { useRegex: true }), SyntaxError);
  assert.equal(findInHtml('<p>a.b axb</p>', 'a.b').length, 1);
  assert.equal(findInHtml('<p>x</p>', '').length, 0);
});

test('matches inside merge fields are skipped', () => {
  const html = '<p>Name: <span class="field" data-field="Name" contenteditable="false">«Name»</span> Name</p>';
  const m = findInHtml(html, 'Name');
  assert.deepEqual(m.map((x) => x.start), [0, 13]);
});

test('replaceMatch preserves formatting and detects stale matches', () => {
  const { doc, upper } = makeDoc();
  const [m] = findAll(doc, 'Hello', { matchCase: true });
  assert.ok(replaceMatch(doc, m, 'Howdy'));
  assert.equal(doc.stories[upper.storyId].html, '<p>Howdy world</p><p>hello again</p>');
  assert.equal(replaceMatch(doc, m, 'Again'), false);
});

test('replaceMatch expands regex groups', () => {
  const doc = createDocument();
  const f = createTextFrame(doc, {}, '<p>Smith, <i>John</i></p>');
  doc.pages[0].elements.push(f);
  const [m] = findAll(doc, '(\\w+), (\\w+)', { useRegex: true });
  assert.ok(replaceMatch(doc, m, '$2 $1'));
  assert.equal(doc.stories[f.storyId].html, '<p>John Smith</p>');
  assert.equal(expandReplacement('$$-$&-$<y>', { text: 'ab', captures: ['a'], groups: { y: 'b' } }), '$-ab-b');
});

test('replaceAll counts across stories and cells; keeps entities and fields', () => {
  const { doc, upper, table } = makeDoc();
  const n = replaceAll(doc, 'hello', 'Hi', {});
  assert.equal(n, 6);
  assert.equal(doc.stories[upper.storyId].html, '<p>Hi world</p><p>Hi again</p>');
  assert.equal(table.cells[0][0].html, '<p>Hi cell</p>');
  assert.equal(table.cells[1][1].html, '<p>hidden hello</p>');
  assert.equal(replaceAll(doc, '&', 'and'), 1);
  assert.equal(table.cells[0][1].html, '<p>B and C</p>');
  const doc2 = createDocument();
  const f = createTextFrame(doc2, {}, '<p>To <span class="field" data-field="To">«To»</span>: To&amp;co</p>');
  doc2.pages[0].elements.push(f);
  assert.equal(replaceAll(doc2, 'To', 'From', { matchCase: true }), 2);
  assert.equal(doc2.stories[f.storyId].html, '<p>From <span class="field" data-field="To">«To»</span>: From&amp;co</p>');
});

test('replaceAll with several matches in one text node and across tags', () => {
  const doc = createDocument();
  const f = createTextFrame(doc, {}, '<p><span style="color: #c00000">aXa</span> a<u>X</u>a aXa</p>');
  doc.pages[0].elements.push(f);
  assert.equal(replaceAll(doc, 'axa', 'b', { matchCase: false }), 3);
  assert.equal(doc.stories[f.storyId].html, '<p><span style="color: #c00000">b</span> b b</p>');
});
