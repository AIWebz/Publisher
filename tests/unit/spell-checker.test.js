import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDocument, createTextFrame, createElement } from '../../src/core/model.js';
import { tokenizeWords } from '../../src/engines/spell/tokenizer.js';
import {
  createSpellChecker, getSpellChecker, peekSpellChecker, resetSpellChecker, spellcheckDocument, spellcheckHtml,
  applyCorrection, changeAll, createSpellingSession
} from '../../src/engines/spell/spell.js';

const DICT = new URL('../../node_modules/dictionary-en/', import.meta.url);
let loads = 0;
const loadDictionary = async () => {
  loads++;
  const [aff, dic] = await Promise.all([readFile(new URL('index.aff', DICT)), readFile(new URL('index.dic', DICT))]);
  return { aff, dic };
};
const checkerP = createSpellChecker({ loadDictionary });

const words = (text, opts) => tokenizeWords(text, opts).filter((t) => !t.skip).map((t) => t.word);

test('tokenizer: apostrophes, hyphens, numbers, caps, urls, emails, fields', () => {
  assert.deepEqual(words("don't don’t 'quoted' rock'n'roll"), ["don't", 'don’t', 'quoted', "rock'n'roll"]);
  const hy = tokenizeWords('well-known')[0];
  assert.deepEqual(hy.parts.map((p) => [p.word, p.start, p.end]), [['well', 0, 4], ['known', 5, 10]]);
  assert.deepEqual(words('1st 22nd 3rd 1,000 42 A4 mp3'), []);
  assert.deepEqual(words('A4', { skipWordsWithNumbers: false }), ['A4']);
  assert.deepEqual(words('NASA HTML ok'), ['ok']);
  assert.deepEqual(words('NASA', { skipAllCaps: false }), ['NASA']);
  assert.deepEqual(words('see https://exmpl.test/a-b?x=1 or www.foo-bar.test and mail jo.smth@exmpl.org now'),
    ['see', 'or', 'and', 'mail', 'now']);
  assert.deepEqual(words('visit folioapp.com today'), ['visit', 'today']);
  assert.deepEqual(words('Dear «Frist Name», hi'), ['Dear', 'hi']);
  const t = tokenizeWords('ab cd');
  assert.deepEqual(t.map((x) => [x.start, x.end]), [[0, 2], [3, 5]]);
});

test('dictionary: receive correct, recieve wrong with receive suggested', async () => {
  const c = await checkerP;
  assert.equal(c.correct('receive'), true);
  assert.equal(c.correct('recieve'), false);
  assert.ok(c.suggest('recieve').includes('receive'));
  assert.ok(c.suggest('teh').length <= 8);
  assert.equal(c.correct('don’t'), true);
  assert.equal(c.correct("John's"), true);
  assert.deepEqual(c.suggest('dont’s').every((s) => !s.includes("'")), true);
});

test('checkText reports offsets; hyphenated parts checked separately', async () => {
  const c = await checkerP;
  assert.deepEqual(c.checkText('I recieve teh mail.'), [{ word: 'recieve', start: 2, end: 9 }, { word: 'teh', start: 10, end: 13 }]);
  assert.deepEqual(c.checkText('a well-known e-mail'), []);
  assert.deepEqual(c.checkText('a well-knwon fact'), [{ word: 'knwon', start: 7, end: 12 }]);
  assert.deepEqual(c.checkText('The 21st NASA meeting at www.x.test, «Nmae»'), []);
});

test('personal dictionary with persistence callback, ignore list', async () => {
  const saved = [];
  const c = await createSpellChecker({ loadDictionary, personal: ['Folio'], onPersonalChange: (w) => saved.push(w) });
  assert.equal(c.correct('Folio'), true);
  assert.equal(c.correct('Zorblax'), false);
  assert.equal(c.addWord('Zorblax'), true);
  assert.equal(c.addWord('Zorblax'), false);
  assert.equal(c.correct('Zorblax'), true);
  assert.deepEqual(saved, [['Folio', 'Zorblax']]);
  assert.equal(c.removeWord('Zorblax'), true);
  assert.equal(c.correct('Zorblax'), false);
  c.ignore('qwzx');
  assert.equal(c.correct('Qwzx'), true);
  assert.equal(c.isIgnored('QWZX'), true);
  c.clearIgnored();
  assert.equal(c.correct('qwzx'), false);
});

test('getSpellChecker loads lazily once and caches the instance', async () => {
  resetSpellChecker();
  const before = loads;
  assert.equal(peekSpellChecker(), null);
  const p1 = getSpellChecker({ loadDictionary });
  const p2 = getSpellChecker({ loadDictionary });
  assert.equal(p1, p2);
  const c = await p1;
  assert.equal(peekSpellChecker(), c);
  assert.equal(loads, before + 1);
  resetSpellChecker();
  await assert.rejects(getSpellChecker({ loadDictionary: async () => { throw new Error('offline'); } }), /offline/);
  assert.ok(await getSpellChecker({ loadDictionary }));
});

function makeDoc() {
  const doc = createDocument({ pages: 1 });
  const a = createTextFrame(doc, { x: 10, y: 10 }, '<p>We <b>recie</b>ve teh mail. <span class="field" data-field="Nmae" contenteditable="false">«Nmae»</span></p>');
  const b = createTextFrame(doc, { x: 10, y: 300 }, '<p>Teh end of teh story.</p>');
  const table = createElement('table', { x: 300, y: 10, cols: [80], rows: [20], cells: [[{ html: '<p>Speling &amp; more</p>' }]] });
  doc.pages[0].elements.push(b, table, a);
  return { doc, a, b, table };
}

test('spellcheckDocument finds issues across stories and cells, skipping fields', async () => {
  const c = await checkerP;
  const { doc, a, table } = makeDoc();
  const issues = spellcheckDocument(doc, c, { includeMasters: false });
  assert.deepEqual(issues.map((i) => i.word), ['recieve', 'teh', 'Speling', 'Teh', 'teh']);
  assert.equal(issues[0].target.storyId, a.storyId);
  assert.deepEqual([issues[0].start, issues[0].end], [3, 10]);
  assert.ok(issues[0].suggestions.includes('receive'));
  assert.equal(issues[2].target.elementId, table.id);
  assert.deepEqual(spellcheckHtml('<p>fine words</p>', c), []);
});

test('applyCorrection keeps formatting; changeAll is whole-word and case-sensitive', async () => {
  const c = await checkerP;
  const { doc, a, b, table } = makeDoc();
  const issues = spellcheckDocument(doc, c);
  assert.ok(applyCorrection(doc, issues[0], 'receive'));
  assert.equal(doc.stories[a.storyId].html.startsWith('<p>We <b>receive</b> teh mail.'), true);
  assert.equal(applyCorrection(doc, issues[0], 'receive'), false);
  assert.equal(changeAll(doc, 'teh', 'the'), 2);
  assert.equal(doc.stories[b.storyId].html, '<p>Teh end of the story.</p>');
  assert.ok(applyCorrection(doc, spellcheckDocument(doc, c).find((i) => i.target.elementId === table.id), 'Spelling'));
  assert.equal(table.cells[0][0].html, '<p>Spelling &amp; more</p>');
});

test('spelling session walks issues: ignore, ignore all, add, change, change all', async () => {
  const c = await createSpellChecker({ loadDictionary });
  const { doc, a, b } = makeDoc();
  const s = createSpellingSession(doc, c, { includeMasters: false });
  assert.equal(s.next().word, 'recieve');
  assert.equal(s.change('receive').word, 'teh');
  assert.equal(s.ignore().word, 'Speling');
  assert.equal(s.addToDictionary().word, 'Teh');
  assert.equal(s.changeAll('The').word, 'teh');
  assert.equal(s.ignoreAll(), null);
  assert.equal(s.current, null);
  assert.match(doc.stories[a.storyId].html, /^<p>We <b>receive<\/b> teh mail\./);
  assert.equal(doc.stories[b.storyId].html, '<p>The end of teh story.</p>');
  assert.ok(c.personalWords().includes('Speling'));
  assert.deepEqual(spellcheckDocument(doc, c), []);
});
