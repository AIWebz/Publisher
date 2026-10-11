import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeFragments, getStoryText, layoutStories, frameTextCSS, themeCSSVars, FLOW_CSS, countOverflowChars, invalidateLayout, onLayoutInvalidated } from '../../src/engines/text/flow.js';
import { createDocument, createElement, createStory } from '../../src/core/model.js';
import { sanitizeHtml } from '../../src/engines/text/sanitize.js';
import { fieldSpan } from '../../src/engines/text/fields.js';

test('mergeFragments rejoins a paragraph split inside nested formatting', () => {
  const story = '<p>a</p><p style="text-indent: 12px;">hello <span style="color: #aa0000;"><b>bold words</b> more</span> end</p><p>z</p>';
  const frags = [
    '<p>a</p><p style="text-indent: 12px;" data-split="">hello <span style="color: #aa0000;"><b>bold </b></span></p>',
    '<p style="text-indent: 12px;" data-cont=""><span style="color: #aa0000;"><b>words</b> more</span> end</p><p>z</p>'
  ];
  assert.equal(mergeFragments(frags), story);
});

test('mergeFragments handles a paragraph spanning three frames and empty frames', () => {
  const story = '<p>one two three four five</p>';
  const frags = ['<p data-split="justify">one two </p>', '<p data-cont="" data-split="">three </p>', '', '<p data-cont="">four five</p>'];
  assert.equal(mergeFragments(frags), story);
});

test('mergeFragments rejoins continued lists and list items, restoring numbering', () => {
  const story = '<p>x</p><ol start="3"><li>alpha beta</li><li>gamma</li><li>delta</li></ol><ul><li>u</li></ul>';
  const frags = [
    '<p>x</p><ol start="3"><li data-split="">alpha </li></ol>',
    '<ol start="3" data-cont=""><li data-cont="">beta</li><li>gamma</li></ol>',
    '<ol start="5" data-cont=""><li>delta</li></ol><ul><li>u</li></ul>'
  ];
  assert.equal(mergeFragments(frags), story);
});

test('mergeFragments does not join blocks that are not continuations', () => {
  const frags = ['<p>a</p>', '<p>b</p>', '<ul><li>c</li></ul>', '<ul><li>d</li></ul>'];
  assert.equal(mergeFragments(frags), '<p>a</p><p>b</p><ul><li>c</li></ul><ul><li>d</li></ul>');
});

test('mergeFragments restores field placeholders and output is canonical', () => {
  const story = sanitizeHtml(`<p>Dear ${fieldSpan('Name')}, page ${fieldSpan('#page')}</p>`);
  const frags = ['<p data-split="">Dear <span class="field" data-field="Name" contenteditable="false">Ann</span>, </p>',
    '<p data-cont="">page <span class="field" data-field="#page" contenteditable="false">2</span></p>'];
  const merged = mergeFragments(frags);
  assert.equal(merged, story);
  assert.equal(sanitizeHtml(merged), merged);
});

test('getStoryText', () => {
  assert.equal(getStoryText('<p>a<br>b</p><p><br></p><ul><li>x</li><li>y<br></li></ul><p>a&amp;b&nbsp;c</p>'), 'a\nb\n\nx\ny\na&b c');
  assert.equal(getStoryText(`<p>Hi ${fieldSpan('N')}</p>`), 'Hi «N»');
  assert.equal(getStoryText('loose <b>text</b><p>p</p>'), 'loose text\np');
  assert.equal(getStoryText(''), '');
});

test('frameTextCSS mirrors the frame style; themeCSSVars exposes theme colours and fonts', () => {
  const doc = createDocument();
  const css = frameTextCSS(doc, { font: '@heading', size: 14, color: '@accent', bold: true, italic: false, underline: true, caps: true,
    letterSpacing: 1, lineHeight: 1.4, align: 'justify', spaceBefore: 3, spaceAfter: 6 });
  assert.equal(css['font-size'], '14pt');
  assert.equal(css['font-weight'], '700');
  assert.equal(css['text-decoration'], 'underline');
  assert.equal(css['text-transform'], 'uppercase');
  assert.equal(css['text-align'], 'justify');
  assert.equal(css['--space-after'], '6px');
  assert.equal(css.color, doc.theme.colors.accent);
  assert.ok(css['font-family'].includes(doc.theme.fonts.heading));
  const vars = themeCSSVars(doc);
  assert.equal(vars['--folio-accent'], doc.theme.colors.accent);
  assert.ok(vars['--folio-body'].includes(doc.theme.fonts.body));
  assert.match(FLOW_CSS, /orphans:1;widows:1/);
  assert.match(FLOW_CSS, /li\[data-cont\]\{list-style-type:none/);
});

test('layoutStories without a DOM puts the story in the head frame of each chain', () => {
  const doc = createDocument({ pages: 2 });
  const s = createStory(`<p>Page ${fieldSpan('#page')}</p>`);
  doc.stories[s.id] = s;
  const a = createElement('text', { storyId: s.id, w: 100, h: 50 });
  const b = createElement('text', { storyId: s.id, w: 100, h: 50 });
  a.next = b.id;
  doc.pages[0].elements.push(a);
  doc.pages[1].elements.push(b);
  const s2 = createStory('<p>solo</p>');
  doc.stories[s2.id] = s2;
  const c = createElement('text', { storyId: s2.id });
  doc.pages[1].elements.push(c);
  const lay = layoutStories(doc, { resolveField: (n, f) => (n === '#page' ? (f.id === a.id ? '1' : '2') : null) });
  assert.equal(lay.get(a.id).html, '<p>Page <span class="field" data-field="#page" contenteditable="false">1</span></p>');
  assert.equal(lay.get(b.id).html, '');
  assert.equal(lay.get(c.id).html, '<p>solo</p>');
  assert.equal(lay.get(a.id).overflow, false);
  assert.equal(lay.get(a.id).scale, 1);
  const only = layoutStories(doc, { frames: [b.id] });
  assert.deepEqual([...only.keys()].sort(), [a.id, b.id].sort());
  assert.equal(countOverflowChars(lay, a.id), 0);
  let called = 0;
  const off = onLayoutInvalidated(() => called++);
  invalidateLayout();
  off();
  assert.equal(called, 0); // explicit invalidation does not notify; only font loading does
});
