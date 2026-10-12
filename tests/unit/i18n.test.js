// Interface translation: translateUI() (exact strings, placeholder patterns, composites) and the
// display-language catalogs in app/i18n (every translation keeps its English string's placeholders).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { setCatalog, translateUI, t, tp, currentLanguage } from '../../src/core/i18n.js';

const DIR = new URL('../../app/i18n/', import.meta.url);
const holes = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(' ');

test('translateUI: exact, patterns, composites, whitespace and fallbacks', () => {
  setCatalog('de', {
    Bold: 'Fett', Size: 'Größe', 'Text box': 'Textfeld', Columns: 'Spalten',
    'Page {1} of {2}': 'Seite {1} von {2}', '{1} is off the page': '{1} liegt außerhalb der Seite',
    '{n} page': '{n} Seite', '{n} pages': '{n} Seiten', 'Saved “{name}”': '„{name}“ gespeichert'
  });
  assert.equal(currentLanguage(), 'de');
  assert.equal(translateUI('Bold'), 'Fett');
  assert.equal(translateUI('  Bold\n'), '  Fett\n');
  assert.equal(translateUI('Bold (Ctrl+B)'), 'Fett (Ctrl+B)');
  assert.equal(translateUI('Page 3 of 12'), 'Seite 3 von 12');
  assert.equal(translateUI('Text box is off the page'), 'Textfeld liegt außerhalb der Seite');
  assert.equal(translateUI('Size: 12 pt'), 'Größe: 12 pt');
  assert.equal(translateUI('Columns…'), 'Spalten…');
  assert.equal(translateUI('Libre Bodoni'), 'Libre Bodoni');
  assert.equal(translateUI('12 pt'), '12 pt');
  assert.equal(t('Saved “{name}”', { name: 'Menu' }), '„Menu“ gespeichert');
  assert.equal(tp(1, '{n} page', '{n} pages'), '1 Seite');
  assert.equal(tp(3, '{n} page', '{n} pages'), '3 Seiten');
  setCatalog('en', null);
  assert.equal(translateUI('Bold'), 'Bold');
  assert.equal(tp(3, '{n} page', '{n} pages'), '3 pages');
});

test('catalogs: listed in index.json, translations keep their placeholders', async () => {
  assert.ok(JSON.parse(await readFile(new URL('strings.json', DIR), 'utf8')).length > 500);
  const index = JSON.parse(await readFile(new URL('index.json', DIR), 'utf8'));
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.json') && !['strings.json', 'index.json'].includes(f)).map((f) => f.slice(0, -5)).sort();
  assert.deepEqual(index, files);
  for (const code of files) {
    const cat = JSON.parse(await readFile(new URL(`${code}.json`, DIR), 'utf8'));
    for (const [k, v] of Object.entries(cat)) {
      assert.equal(typeof v, 'string', `${code}: ${k}`);
      assert.ok(v.trim(), `${code}: empty translation for ${k}`);
      assert.equal(holes(v), holes(k), `${code}: placeholders of ${JSON.stringify(k)}`);
    }
  }
});
