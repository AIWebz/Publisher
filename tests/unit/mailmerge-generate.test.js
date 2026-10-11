import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, createTextFrame, createElement, allElements, validateDocument } from '../../src/core/model.js';
import { fieldSpan, listFields } from '../../src/engines/text/fields.js';
import { createMergeData, toggleExcluded } from '../../src/engines/mailmerge/merge.js';
import {
  mergeDocumentForRecord, buildMergedPublication, fillSheetFromRecords, findSheetSlots, listDocumentFields,
  renameFieldsInHtml, renameFieldsInDocument, mergeHtml, recordResolver
} from '../../src/engines/mailmerge/generate.js';

const people = () => createMergeData('people', ['First', 'City', 'Address'], [
  ['Ann', 'Boston', '1 Main St\nApt 2'],
  ['Bob', 'Austin', '2 Oak Rd'],
  ['Cy <b>', 'Denver', ''],
  ['Di', 'Paris', '4 Rue']
]);

function letterDoc() {
  const doc = createDocument({ pages: 2 });
  doc.data = people();
  const a = createTextFrame(doc, { x: 10, y: 10, w: 200, h: 50 }, `<p>Dear ${fieldSpan('First')}, page ${fieldSpan('#page')}</p>`);
  const b = createTextFrame(doc, { x: 10, y: 10, w: 200, h: 50 });
  b.storyId = a.storyId; // continuation frame of the same story on page 2
  a.next = b.id;
  doc.pages[0].elements.push(a);
  doc.pages[1].elements.push(b);
  const table = createElement('table', {
    x: 0, y: 100, w: 200, h: 40, cols: [100, 100], rows: [20],
    cells: [[{ html: `<p>${fieldSpan('City')}</p>`, fill: null, rowSpan: 1, colSpan: 1 }, { html: `<p>${fieldSpan('Unknown')}</p>`, fill: null, rowSpan: 1, colSpan: 1 }]]
  });
  doc.pages[1].elements.push(table);
  const footer = createTextFrame(doc, { x: 0, y: 0, w: 100, h: 20 }, `<p>${fieldSpan('#page')}</p>`);
  doc.masters[0].elements.push(footer);
  return doc;
}

test('mergeHtml substitutes, escapes and turns line breaks into <br>', () => {
  const html = `<p>${fieldSpan('First')} ${fieldSpan('Address')} ${fieldSpan('#page')} ${fieldSpan('Missing')}</p>`;
  const out = mergeHtml(html, recordResolver({ First: 'A & B', Address: 'x\ny' }));
  assert.equal(out, `<p>A &amp; B x<br>y ${fieldSpan('#page')} </p>`);
  const keep = mergeHtml(html, recordResolver({ First: 'A' }, { keepUnknown: true }));
  assert.ok(keep.includes(fieldSpan('Missing')));
  assert.ok(mergeHtml(html, recordResolver((n) => (n === 'First' ? 'Fn' : null))).startsWith('<p>Fn '));
});

test('mergeDocumentForRecord substitutes stories and table cells, removes data, keeps input intact', () => {
  const doc = letterDoc();
  const before = JSON.stringify(doc);
  const out = mergeDocumentForRecord(doc, { First: 'Ann', City: 'Boston' });
  assert.equal(JSON.stringify(doc), before, 'input not modified');
  assert.equal(out.data, null);
  const frame = out.pages[0].elements[0];
  assert.match(out.stories[frame.storyId].html, /Dear Ann, page <span class="field" data-field="#page"/);
  const table = out.pages[1].elements[1];
  assert.equal(table.cells[0][0].html, '<p>Boston</p>');
  assert.equal(table.cells[0][1].html, '<p></p>', 'unknown fields become blank');
  assert.deepEqual(listDocumentFields(out), []);
  assert.deepEqual(listDocumentFields(doc), ['First', 'City', 'Unknown']);
});

test('buildMergedPublication repeats pages per record with new ids and per-record stories', () => {
  const doc = letterDoc();
  toggleExcluded(doc.data, 2);
  doc.data.sort = [{ column: 'First', dir: 'desc' }];
  const out = buildMergedPublication(doc, doc.data);
  assert.equal(out.pages.length, 3 * 2);
  assert.equal(out.data, null);
  assert.equal(out.masters.length, 1, 'master without merge fields is shared');
  assert.equal(out.masters[0].id, doc.masters[0].id);
  const ids = allElements(out).map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'element ids unique');
  assert.equal(new Set(out.pages.map((p) => p.id)).size, 6);
  for (const p of out.pages) assert.ok(!doc.pages.some((q) => q.id === p.id));
  const heads = out.pages.filter((_, i) => i % 2 === 0).map((p) => p.elements[0]);
  const texts = heads.map((f) => out.stories[f.storyId].html);
  assert.deepEqual(texts.map((t) => /Dear (\w+)/.exec(t)[1]), ['Di', 'Bob', 'Ann']);
  // chain preserved within each record: head -> continuation frame on the next page
  out.pages.forEach((p, i) => {
    if (i % 2) return;
    const head = p.elements[0];
    const cont = out.pages[i + 1].elements[0];
    assert.equal(head.next, cont.id);
    assert.equal(head.storyId, cont.storyId);
    assert.equal(out.pages[i + 1].elements[1].cells[0][0].html, `<p>${['Paris', 'Austin', 'Boston'][i / 2]}</p>`);
  });
  assert.equal(new Set(heads.map((h) => h.storyId)).size, 3, 'stories duplicated per record');
  assert.deepEqual(validateDocument(out).filter((x) => x.level === 'error'), []);
  // the source story is gone; the master story is kept
  const srcStory = doc.pages[0].elements[0].storyId;
  assert.equal(out.stories[srcStory], undefined);
  assert.ok(out.stories[doc.masters[0].elements[0].storyId]);
});

test('buildMergedPublication honours indices/pageIndices and copies masters that hold merge fields', () => {
  const doc = letterDoc();
  const m = doc.masters[0];
  doc.stories[m.elements[0].storyId].html = `<p>${fieldSpan('City')} ${fieldSpan('#page')}</p>`;
  const out = buildMergedPublication(doc, doc.data, { indices: [3, 0], pageIndices: [1] });
  assert.equal(out.pages.length, 2);
  assert.equal(out.masters.length, 2);
  assert.ok(!out.masters.some((x) => x.id === m.id));
  const masterText = out.pages.map((p) => out.stories[out.masters.find((x) => x.id === p.masterId).elements[0].storyId].html);
  assert.ok(masterText[0].startsWith('<p>Paris '));
  assert.ok(masterText[1].startsWith('<p>Boston '));
  assert.equal(out.pages[0].elements[0].next, null);
  assert.deepEqual(validateDocument(out).filter((x) => x.level === 'error'), []);
  assert.throws(() => buildMergedPublication(doc, doc.data, { indices: [] }), /no recipients/);
});

function labelDoc(mode) {
  const doc = createDocument({ size: 'letter' });
  doc.data = people();
  const header = createTextFrame(doc, { x: 0, y: 0, w: 300, h: 20, name: 'Header' }, `<p>Sheet for ${fieldSpan('First')}</p>`);
  doc.pages[0].elements.push(header);
  if (mode === 'named') {
    for (let k = 1; k <= 3; k++) {
      const f = createTextFrame(doc, { x: 0, y: 30 + k * 100, w: 200, h: 90, name: `slot-${k}` }, `<p>${fieldSpan('First')}</p><p>${fieldSpan('City')}</p>`);
      doc.pages[0].elements.push(f);
    }
    const shape = createElement('shape', { x: 0, y: 130, w: 5, h: 5, name: 'Slot 1' });
    doc.pages[0].elements.push(shape);
  } else {
    const f = createTextFrame(doc, { x: 20, y: 40, w: 180, h: 90, name: 'Label' }, `<p>${fieldSpan('First')}, ${fieldSpan('City')}</p>`);
    doc.pages[0].elements.push(f);
    doc.pages[0].repeat = { cols: 2, rows: 2, gapX: 10, gapY: 5, x: 20, y: 40, w: 180, h: 90 };
  }
  return doc;
}

test('fillSheetFromRecords with named slots', () => {
  const doc = labelDoc('named');
  const slots = findSheetSlots(doc, 0);
  assert.equal(slots.mode, 'named');
  assert.equal(slots.count, 3);
  const { doc: out, sheets, slotsPerSheet, records } = fillSheetFromRecords(doc, 0, doc.data);
  assert.deepEqual({ sheets, slotsPerSheet, records }, { sheets: 2, slotsPerSheet: 3, records: 4 });
  assert.equal(out.pages.length, 2);
  const textOf = (el) => out.stories[el.storyId].html;
  const p1 = out.pages[0].elements;
  assert.equal(p1.length, 1 + 3 + 1);
  assert.equal(textOf(p1[0]), '<p>Sheet for Ann</p>');
  assert.deepEqual(p1.slice(1, 4).map(textOf), ['<p>Ann</p><p>Boston</p>', '<p>Bob</p><p>Austin</p>', '<p>Cy &lt;b&gt;</p><p>Denver</p>']);
  const p2 = out.pages[1].elements;
  assert.equal(p2.length, 1 + 1 + 1, 'unused slots removed on the last sheet (slot-1 frame + its shape)');
  assert.equal(textOf(p2[1]), '<p>Di</p><p>Paris</p>');
  assert.equal(textOf(p2[0]), '<p>Sheet for Di</p>');
  const ids = allElements(out).map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(validateDocument(out).filter((x) => x.level === 'error'), []);
  const blank = fillSheetFromRecords(doc, 0, doc.data, { emptySlots: 'blank' }).doc;
  assert.deepEqual(blank.pages[1].elements.slice(1, 4).map((e) => blank.stories[e.storyId].html), ['<p>Di</p><p>Paris</p>', '<p></p><p></p>', '<p></p><p></p>']);
  const two = fillSheetFromRecords(doc, 0, doc.data, { perSheet: 2, startSlot: 1 });
  assert.equal(two.sheets, 3, '1 skipped + 4 records over 2 per sheet');
  assert.equal(two.doc.pages[0].elements.filter((e) => e.type === 'text').length, 2, 'header + slot 2 only');
});

test('fillSheetFromRecords with page.repeat grid and with explicit frameIds', () => {
  const doc = labelDoc('repeat');
  const slots = findSheetSlots(doc, 0);
  assert.equal(slots.mode, 'repeat');
  assert.deepEqual(slots.offsets, [{ dx: 0, dy: 0 }, { dx: 190, dy: 0 }, { dx: 0, dy: 95 }, { dx: 190, dy: 95 }]);
  const { doc: out, sheets } = fillSheetFromRecords(doc, 0, doc.data);
  assert.equal(sheets, 1);
  const labels = out.pages[0].elements.filter((e) => e.name === 'Label');
  assert.deepEqual(labels.map((e) => [e.x, e.y]), [[20, 40], [210, 40], [20, 135], [210, 135]]);
  assert.deepEqual(labels.map((e) => listFields(out.stories[e.storyId].html).length), [0, 0, 0, 0]);
  assert.equal(out.stories[labels[3].storyId].html, '<p>Di, Paris</p>');
  assert.equal(out.pages[0].repeat, undefined);

  const d2 = labelDoc('named');
  const frames = d2.pages[0].elements.filter((e) => /^slot-/.test(e.name)).map((e) => e.id);
  const byIds = fillSheetFromRecords(d2, 0, d2.data, { frameIds: [frames[2], frames[0]], keepOtherPages: true });
  assert.equal(byIds.slotsPerSheet, 2);
  assert.equal(byIds.sheets, 2);
  const firstSheet = byIds.doc.pages[0].elements;
  const html = (id) => byIds.doc.stories[firstSheet.find((e) => e.id === id).storyId].html;
  // element order is preserved: slot-1 (frameIds[1] -> 2nd record) comes before slot-3 (1st record)
  assert.equal(html(firstSheet[1].id), '<p>Bob</p><p>Austin</p>');
  assert.equal(html(firstSheet[2].id), '<p>Ann</p><p>Boston</p>');
  assert.throws(() => fillSheetFromRecords(createDocument(), 0, d2.data), /no label slots/);
});

test('renameFieldsInHtml / renameFieldsInDocument update field spans', () => {
  const html = `<p>${fieldSpan('First')} and ${fieldSpan('A & B')} ${fieldSpan('City')}</p>`;
  const out = renameFieldsInHtml(html, { First: 'Given', 'A & B': 'C' });
  assert.deepEqual(listFields(out), ['Given', 'C', 'City']);
  const doc = letterDoc();
  const n = renameFieldsInDocument(doc, { City: 'Town', First: 'Name' });
  assert.equal(n, 2);
  assert.deepEqual(listDocumentFields(doc), ['Name', 'Town', 'Unknown']);
  assert.equal(renameFieldsInDocument(doc, {}), 0);
});
