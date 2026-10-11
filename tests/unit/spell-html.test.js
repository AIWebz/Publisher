import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenizeHtml, serializeTokens, getPlainText, replaceTextInHtml, rangeHasAtom
} from '../../src/engines/spell/html-text.js';

const SAMPLES = [
  '<p>Hello <b>world</b></p>',
  '<p style="text-align: center; margin-top: 4px">A &amp; B &lt;c&gt; &nbsp;&copy; &#169; &#x1F600; &bogus; x</p>',
  '<ul><li>One</li><li><span style="color: #ff0000; font-size: 12pt">Two</span></li></ul>',
  '<p>Dear <span class="field" data-field="First Name" contenteditable="false">«First Name»</span>,<br>hi</p>',
  '<p><a href="https://x.test/?a=1&amp;b=2">link</a> 5 > 3 < 4</p>',
  '<p>unterminated <b>bold',
  '<!-- c --><p title=\'a>b\'>q</p>'
];

test('tokenizeHtml/serializeTokens round-trip exactly', () => {
  for (const html of SAMPLES) assert.equal(serializeTokens(tokenizeHtml(html)), html);
});

test('getPlainText decodes entities and joins paragraphs with newlines', () => {
  const p = getPlainText('<p>A &amp; B</p><p></p><p>C&nbsp;D</p>');
  assert.equal(p.text, 'A & B\n\nC D');
  assert.deepEqual(p.blocks, [{ start: 0, end: 5 }, { start: 6, end: 6 }, { start: 7, end: 10 }]);
  const l = getPlainText('<ul><li>One</li><li>Two</li></ul>');
  assert.equal(l.text, 'One\nTwo');
});

test('getPlainText maps characters back to text tokens', () => {
  const p = getPlainText('<p>Hel<b>lo</b></p>');
  assert.equal(p.text, 'Hello');
  const t0 = p.tokens[p.map[0].t];
  const t4 = p.tokens[p.map[4].t];
  assert.equal(t0.raw, 'Hel');
  assert.equal(t4.raw, 'lo');
  assert.equal(p.map[4].o, 1);
});

test('fields and breaks are atoms', () => {
  const p = getPlainText('<p>Dear <span class="field" data-field="Name" contenteditable="false">«Name»</span>,<br>hi</p>');
  assert.equal(p.text, 'Dear «Name»,\nhi');
  assert.deepEqual(p.atoms.map((a) => a.kind), ['field', 'break']);
  assert.ok(rangeHasAtom(p, 5, 7));
  assert.ok(!rangeHasAtom(p, 0, 4));
  assert.ok(rangeHasAtom(p, 11, 13));
});

test('replaceTextInHtml keeps the first character formatting and prunes emptied tags', () => {
  assert.equal(replaceTextInHtml('<p>Hel<b>lo</b> there</p>', 0, 5, 'Hi'), '<p>Hi there</p>');
  assert.equal(replaceTextInHtml('<p>say <b>Hel</b>lo</p>', 4, 9, 'Bye'), '<p>say <b>Bye</b></p>');
  assert.equal(replaceTextInHtml('<p>a <i>bc</i> d</p>', 2, 4, 'XY'), '<p>a <i>XY</i> d</p>');
});

test('replaceTextInHtml preserves entities, attributes and pre-existing empty elements', () => {
  const html = '<p style="color: red">Tom &amp; Jerry<span></span> &lt;3</p>';
  assert.equal(replaceTextInHtml(html, 0, 3, 'Tim'), '<p style="color: red">Tim &amp; Jerry<span></span> &lt;3</p>');
  assert.equal(replaceTextInHtml('<p>x</p>', 0, 1, 'a<b>&c'), '<p>a&lt;b&gt;&amp;c</p>');
});

test('replaceTextInHtml refuses ranges touching fields or breaks', () => {
  const html = '<p>A <span class="field" data-field="N">«N»</span> B</p>';
  assert.equal(replaceTextInHtml(html, 2, 4, 'z'), null);
  assert.equal(replaceTextInHtml(html, 0, 1, 'Z'), '<p>Z <span class="field" data-field="N">«N»</span> B</p>');
});
