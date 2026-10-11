import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeHtml, sanitizePastedHtml, textToHtml, normalizeColor, normalizeFontFamily, normalizeFontSize, cleanHref, parseStyle } from '../../src/engines/text/sanitize.js';
import { tokenize, parseTree, serializeTree, decodeEntities } from '../../src/engines/text/html.js';

const S = sanitizeHtml;

test('allowed markup passes through unchanged', () => {
  const html = '<p style="text-align: center; line-height: 1.5;">a <b>b</b> <i>c</i> <u>d</u> <s>e</s> x<sub>2</sub> y<sup>3</sup> <a href="https://x.org/?a=1&amp;b=2">l</a><br>n</p>' +
    '<ul><li>one</li><li style="margin-left: 24px;">two</li></ul><ol start="3"><li>three</li></ol>';
  assert.equal(S(html), html);
});

test('inline content is wrapped in paragraphs and output is block structured', () => {
  assert.equal(S('hello <b>world</b>'), '<p>hello <b>world</b></p>');
  assert.equal(S('a<p>b</p>c'), '<p>a</p><p>b</p><p>c</p>');
  assert.equal(S('<div>x</div><div><br></div>'), '<p>x</p><p><br></p>');
  assert.equal(S(''), '');
  assert.equal(S('<p></p>'), '<p><br></p>');
});

test('dangerous content is dropped, unknown tags unwrapped', () => {
  assert.equal(S('a<script>alert(1)</script>b'), '<p>ab</p>');
  assert.equal(S('<style>p{color:red}</style><iframe src="x">inner</iframe>ok'), '<p>ok</p>');
  assert.equal(S('<img src=x onerror=alert(1)>t'), '<p>t</p>');
  assert.equal(S('<p onclick="x()" class="c" id="i">t</p>'), '<p>t</p>');
  assert.equal(S('<article><section><em>deep</em></section></article>'), '<p><em>deep</em></p>');
  assert.equal(S('<custom-tag>kept text</custom-tag>'), '<p>kept text</p>');
  assert.equal(S('<svg><script>x</script></svg>after'), '<p>after</p>');
});

test('links: only http(s) and mailto survive; target is stripped', () => {
  assert.equal(S('<a href="javascript:alert(1)">x</a>'), '<p>x</p>');
  assert.equal(S('<a href=" JaVaScRiPt:alert(1)">x</a>'), '<p>x</p>');
  assert.equal(S('<a href="data:text/html,hi">x</a>'), '<p>x</p>');
  assert.equal(S('<a href="https://a.b" target="_blank" rel="x">y</a>'), '<p><a href="https://a.b">y</a></p>');
  assert.equal(S('<a href="mailto:me@x.org">m</a>'), '<p><a href="mailto:me@x.org">m</a></p>');
  assert.equal(cleanHref('ftp://x'), null);
});

test('style properties are whitelisted and values validated', () => {
  assert.equal(S('<p style="position:absolute;color:red;text-align:center">x</p>'), '<p style="text-align: center;"><span style="color: #ff0000;">x</span></p>');
  assert.equal(S('<span style="font-size:16px;font-family:Arial, sans-serif;behavior:url(x)">t</span>'), '<p><span style="font-size: 12pt; font-family: &quot;Arial&quot;, sans-serif;">t</span></p>');
  assert.equal(S('<span style="color: expression(alert(1))">t</span>'), '<p>t</p>');
  assert.equal(S('<span style="background-color: url(javascript:x)">t</span>'), '<p>t</p>');
  assert.equal(S('<span style="color: var(--folio-accent); font-family: var(--folio-heading)">t</span>'), '<p><span style="color: var(--folio-accent); font-family: var(--folio-heading);">t</span></p>');
  assert.equal(S('<span style="color: var(--evil)">t</span>'), '<p>t</p>');
  assert.equal(S('<p style="margin: 10px 0 5pt 1in; line-height: 150%">m</p>'), '<p style="line-height: 1.5; margin-top: 10px; margin-bottom: 6.67px; margin-left: 96px;">m</p>');
  assert.equal(normalizeColor('rgb(255, 0, 0)'), '#ff0000');
  assert.equal(normalizeColor('#ABC'), '#aabbcc');
  assert.equal(normalizeColor('rgba(0,0,0,0.5)'), 'rgba(0, 0, 0, 0.5)');
  assert.equal(normalizeColor('nonsense'), null);
  assert.equal(normalizeFontFamily('"Lora", serif'), '"Lora", serif');
  assert.equal(normalizeFontFamily('x;y{}'), null);
  assert.equal(normalizeFontSize('16px'), '12pt');
  assert.equal(normalizeFontSize('2em'), null);
  assert.deepEqual(parseStyle('color: red; font-family: "a;b"; x'), [['color', 'red'], ['font-family', '"a;b"']]);
});

test('field spans are preserved as atoms with canonical content', () => {
  const f = '<span class="field" data-field="Name" contenteditable="false">«Name»</span>';
  assert.equal(S(`Dear ${f},`), `<p>Dear ${f},</p>`);
  assert.equal(S('<span class="field" data-field="#page">12</span>'), '<p><span class="field" data-field="#page" contenteditable="false">«#page»</span></p>');
  // markup inside a field is not interpreted
  assert.equal(S('<span class="field" data-field="X"><script>x</script><b>y</b></span>'), '<p><span class="field" data-field="X" contenteditable="false">«X»</span></p>');
});

test('entities are preserved', () => {
  assert.equal(S('<p>a &amp; b &lt; c &gt; d &nbsp; &copy; &#8217; &#x41;</p>'), '<p>a &amp; b &lt; c &gt; d &nbsp; © ’ A</p>');
  assert.equal(S('<p>&lt;script&gt;</p>'), '<p>&lt;script&gt;</p>');
  assert.equal(decodeEntities('&unknown; &amp;'), '&unknown; &');
});

test('lists: nested lists flatten to indented items; orphan items get a list; headings become styled paragraphs', () => {
  assert.equal(S('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>'), '<ul><li>a</li><li style="margin-left: 24px;">b</li><li>c</li></ul>');
  assert.equal(S('<li>x</li><li>y</li><p>z</p>'), '<ul><li>x</li><li>y</li></ul><p>z</p>');
  assert.equal(S('<h1>Title</h1>'), '<p><span style="font-size: 24pt; font-weight: bold;">Title</span></p>');
  assert.equal(S('<ol type="a"><li>q</li></ol>'), '<ol style="list-style-type: lower-alpha;"><li>q</li></ol>');
});

test('formatting crossing block boundaries is reconstructed per block', () => {
  assert.equal(S('<b><p>one</p><p>two</p></b>'), '<p><b>one</b></p><p><b>two</b></p>');
  assert.equal(S('<p><b><i>x</b>y</i></p>'), '<p><b><i>x</i></b><i>y</i></p>');
  assert.equal(S('<b>a</b><b>b</b>'), '<p><b>ab</b></p>');
});

test('sanitize is idempotent on a variety of inputs', () => {
  const inputs = [
    'Hello <b>world</b>', '<p style="color:red">x <script>y</script></p>', '<ul><li>a<ol><li>b</li></ol></li></ul>',
    '<table><tr><td>a</td><td>b</td></tr></table>', '<font color="red" face="Arial" size="5">F</font>', '<p>a<br><br>b</p>',
    '<span style="vertical-align: super">2</span>', '<pre>  code\n  more</pre>', '<a href="https://x"><b>bold link</b></a>',
    '<div><p>nested</p>tail</div>', '<p>  spaces   kept  </p>', '<ol start="5"><li>x</li><li>y</li></ol>'
  ];
  for (const i of inputs) {
    const once = S(i);
    assert.equal(S(once), once, i);
    const pasted = sanitizePastedHtml(i);
    // pasted HTML, once sanitized, is stable as story HTML
    assert.equal(S(pasted), pasted, i);
  }
});

test('pasted HTML collapses whitespace like a browser; plain text conversion', () => {
  assert.equal(sanitizePastedHtml('<p>  a \n  b  </p>\n<p>c</p>'), '<p>a b</p><p>c</p>');
  assert.equal(textToHtml('one\ntwo\n\nthree <x>'), '<p>one</p><p>two</p><p><br></p><p>three &lt;x&gt;</p>');
});

test('html tokenizer and tree round-trip', () => {
  const html = '<p class="a" data-x="1&amp;2">t<br>u</p><!-- c --><ul><li>i</li></ul>';
  const toks = tokenize(html);
  assert.equal(toks[0].type, 'start');
  assert.deepEqual(toks[0].attrs, [{ name: 'class', value: 'a' }, { name: 'data-x', value: '1&2' }]);
  assert.equal(serializeTree(parseTree(html)), '<p class="a" data-x="1&amp;2">t<br>u</p><ul><li>i</li></ul>');
});
