import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, createTextFrame, addAsset, createElement, serialize, parseDocument } from '../../src/core/model.js';
import { snapshotDoc } from '../../src/core/history.js';
import { DocSession } from '../../src/core/session.js';
import { serializeForSave, saveSnapshot, readPublication, OpenError, docStats, countWords, htmlToText, formatBytes, formatWhen, suggestedName, pageSizeName } from '../../src/core/persistence/format.js';

function sampleDoc() {
  const doc = createDocument({ size: 'letter', title: 'Spring Fair' });
  const frame = createTextFrame(doc, { x: 10, y: 10, w: 200, h: 100 }, '<p>Hello <b>wide</b> world</p><p>Second line.</p>');
  doc.pages[0].elements.push(frame);
  const assetId = addAsset(doc, { name: 'used.png', mime: 'image/png', data: 'data:image/png;base64,AAAA', width: 2, height: 2 });
  doc.pages[0].elements.push(createElement('image', { assetId, x: 0, y: 0, w: 50, h: 50 }));
  addAsset(doc, { name: 'orphan.png', mime: 'image/png', data: 'data:image/png;base64,BBBB', width: 2, height: 2 });
  doc.stories.orphan = { id: 'orphan', html: '<p>unused</p>' };
  return doc;
}

test('serializeForSave prunes unused assets and stories without touching the live document', () => {
  const doc = sampleDoc();
  const before = JSON.stringify(doc);
  const text = serializeForSave(doc);
  assert.equal(JSON.stringify(doc), before, 'live document unchanged');
  const saved = JSON.parse(text);
  assert.equal(Object.keys(saved.assets).length, 1);
  assert.equal(saved.assets[Object.keys(saved.assets)[0]].name, 'used.png');
  assert.ok(!saved.stories.orphan);
  assert.equal(Object.keys(saved.stories).length, 1);
});

test('save round trip: reopened document equals the pruned saved document', () => {
  const doc = sampleDoc();
  const text = serializeForSave(doc);
  const reopened = readPublication(text, 'spring.folio');
  assert.equal(serialize(reopened), text);
  assert.deepEqual(reopened.pages, doc.pages);
  assert.equal(reopened.title, 'Spring Fair');
});

test('saveSnapshot hash matches DocSession dirty tracking, and later edits stay dirty', () => {
  const doc = sampleDoc();
  const s = new DocSession(doc, { dirty: true });
  s.refreshDirty();
  assert.equal(s.dirty, true);
  const { hash } = saveSnapshot(s.doc);
  // an edit lands while the save is in flight
  s.doc.pages[0].elements[0].x = 99;
  s.refreshDirty(snapshotDoc(s.doc));
  s.markSaved(hash, { filePath: '/tmp/x.folio', fileName: 'x.folio' });
  assert.equal(s.dirty, true, 'edit made during save keeps the document dirty');
  const again = saveSnapshot(s.doc);
  s.markSaved(again.hash, {});
  assert.equal(s.dirty, false);
});

test('readPublication rejects invalid, empty, foreign and newer files with clear errors', () => {
  assert.throws(() => readPublication('', 'a.folio'), (e) => e instanceof OpenError && e.reason === 'empty');
  assert.throws(() => readPublication('{not json', 'a.folio'), (e) => e instanceof OpenError && e.reason === 'invalid' && /a\.folio/.test(e.message));
  assert.throws(() => readPublication('{"hello":1}', 'b.json'), (e) => e instanceof OpenError && e.reason === 'invalid');
  const newer = JSON.stringify({ ...createDocument(), version: 99 });
  assert.throws(() => readPublication(newer, 'n.folio'), (e) => e instanceof OpenError && e.reason === 'newer' && /newer version/.test(e.message));
});

test('readPublication migrates version-1 files', () => {
  const v1 = { version: 1, title: 'Old', w: 816, h: 1056, pages: [{ bg: '@paper', elements: [{ type: 'text', x: 1, y: 2, w: 100, h: 40, html: '<p>Hi</p>' }] }] };
  const doc = readPublication(JSON.stringify(v1), 'old.json');
  assert.equal(doc.format, 'folio-publication');
  assert.equal(doc.version, 2);
  assert.equal(doc.pages.length, 1);
  assert.equal(doc.pages[0].elements[0].type, 'text');
  assert.equal(parseDocument(serialize(doc)).title, 'Old');
});

test('docStats counts pages, objects, words and size', () => {
  const doc = sampleDoc();
  const st = docStats(doc);
  assert.equal(st.pages, 1);
  assert.equal(st.objects, 2);
  assert.equal(st.pictures, 1);
  assert.equal(st.textFrames, 1);
  assert.equal(st.words, 5);
  assert.ok(st.bytes > 100);
  assert.equal(countWords("It's a well-known fact 42"), 5);
  assert.equal(htmlToText('<p>a&amp;b</p><p>c</p>').trim(), 'a&b\nc');
});

test('formatting helpers', () => {
  assert.equal(formatBytes(512), '512 bytes');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(3.5 * 1024 * 1024), '3.5 MB');
  const now = Date.UTC(2026, 5, 10, 12, 0, 0);
  assert.equal(formatWhen(now - 10000, now), 'Just now');
  assert.equal(formatWhen(now - 5 * 60000, now), '5 minutes ago');
  assert.match(formatWhen(now - 3 * 86400000, now), /2026/);
  assert.equal(suggestedName({ fileName: 'flyer.folio', doc: { title: 'x' } }), 'flyer');
  assert.equal(suggestedName({ fileName: null, doc: { title: 'Untitled publication' } }), 'Publication');
  assert.equal(suggestedName({ fileName: null, doc: { title: 'Bake Sale' } }), 'Bake Sale');
  assert.equal(pageSizeName({ width: 816, height: 1056 }), 'Letter · Portrait');
  assert.equal(pageSizeName({ width: 1056, height: 816 }), 'Letter · Landscape');
});
