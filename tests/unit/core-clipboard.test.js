import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeClip, pasteClip, nextPasteOffset, clipText, htmlToPlainText, plainTextToHtml } from '../../src/core/clipboard.js';
import { createDocument, createElement, createTextFrame, addAsset, updateGroupBounds } from '../../src/core/model.js';

function source() {
  const doc = createDocument();
  const t = createTextFrame(doc, { id: 't1', x: 10, y: 10 }, '<p>Hello &amp; welcome</p><p>Line 2</p>');
  const assetId = addAsset(doc, { name: 'p.png', mime: 'image/png', data: 'data:image/png;base64,QUJD', width: 3, height: 1 });
  const img = createElement('image', { id: 'i1', assetId, x: 100, y: 100 });
  const g = updateGroupBounds(createElement('group', { id: 'g1', children: [createElement('shape', { id: 'c1' }), createElement('shape', { id: 'c2', x: 200 })] }));
  doc.pages[0].elements.push(t, img, g);
  return { doc, t, img, g };
}

test('copy within a document creates independent copies with new ids', () => {
  const { doc, t } = source();
  const clip = makeClip(doc, [t], { pageId: doc.pages[0].id });
  const [copy] = pasteClip(clip, doc, { offset: 12 });
  assert.notEqual(copy.id, 't1');
  assert.notEqual(copy.storyId, t.storyId);
  assert.equal(doc.stories[copy.storyId].html, doc.stories[t.storyId].html);
  assert.equal(copy.x, 22);
  doc.stories[copy.storyId].html = '<p>changed</p>';
  assert.notEqual(doc.stories[t.storyId].html, '<p>changed</p>');
});

test('paste into another document brings stories and assets along', () => {
  const { doc, img, t, g } = source();
  const clip = makeClip(doc, [t, img, g]);
  const other = createDocument();
  const els = pasteClip(clip, other);
  assert.equal(els.length, 3);
  assert.ok(other.stories[els[0].storyId]);
  assert.equal(other.assets[els[1].assetId].data, 'data:image/png;base64,QUJD');
  assert.equal(els[2].children.length, 2);
  assert.notEqual(els[2].children[0].id, 'c1');
});

test('a clip survives changes to (or closing of) its source document', () => {
  const { doc, t } = source();
  const clip = makeClip(doc, [t]);
  doc.stories[t.storyId].html = '<p>edited later</p>';
  t.x = 999;
  const [copy] = pasteClip(clip, createDocument());
  assert.equal(copy.x, 10);
});

test('paste offsets increase on the same page and reset elsewhere; cut pastes in place first', () => {
  const { doc, t } = source();
  const clip = makeClip(doc, [t], { pageId: 'p1' });
  assert.equal(nextPasteOffset(clip, doc.id, 'p1'), 12);
  assert.equal(nextPasteOffset(clip, doc.id, 'p1'), 24);
  assert.equal(nextPasteOffset(clip, doc.id, 'p2'), 0);
  assert.equal(nextPasteOffset(clip, 'other-doc', 'p1'), 0);
  const cut = makeClip(doc, [t], { pageId: 'p1', cut: true });
  assert.equal(nextPasteOffset(cut, doc.id, 'p1'), 0);
  assert.equal(nextPasteOffset(cut, doc.id, 'p1'), 12);
});

test('objects pasted entirely off a smaller page are centred on it', () => {
  const { doc } = source();
  const far = createElement('shape', { x: 2000, y: 2000, w: 100, h: 50 });
  doc.pages[0].elements.push(far);
  const [p] = pasteClip(makeClip(doc, [far]), createDocument(), { pageWidth: 500, pageHeight: 400 });
  assert.deepEqual([p.x, p.y], [200, 175]);
});

test('plain text conversion', () => {
  const { doc, t } = source();
  assert.equal(clipText(makeClip(doc, [t])), 'Hello & welcome\nLine 2');
  assert.equal(htmlToPlainText('<p>a<br>b</p><ul><li>c</li></ul>'), 'a\nb\nc');
  assert.equal(plainTextToHtml('x < y\n\nz'), '<p>x &lt; y</p><p><br></p><p>z</p>');
});
