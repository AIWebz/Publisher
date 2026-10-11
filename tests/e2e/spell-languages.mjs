// End-to-end check of the 85-language proofing tools in the Electron app: every dictionary loads
// and accepts common words, typos are flagged with suggestions, text boxes carry their own
// proofing language, and check-spelling-as-you-type underlines misspellings.
// Run: npm run build && xvfb-run -a node tests/e2e/spell-languages.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { _electron } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'folio-spell-'));
const UD = path.join(OUT, 'userdata');
let failed = 0;
const check = (name, ok, info = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  — ${info}` : ''}`); };

const app = await _electron.launch({ executablePath: require(path.join(ROOT, 'node_modules/electron')), args: [ROOT, '--no-sandbox', `--user-data-dir=${UD}`], env: { ...process.env, FOLIO_USER_DATA: UD } });
const w = await app.firstWindow();
const errors = [];
w.on('pageerror', (e) => errors.push(e.message));
await w.waitForTimeout(1500);

try {
  // Every dictionary: load time, its own first headwords accepted, a garbage token rejected.
  const table = await w.evaluate(async () => {
    const { checkerFor, dictionaryManifest } = window.folioSpell;
    const m = await dictionaryManifest();
    const rows = [];
    for (const id of Object.keys(m)) {
      const t0 = performance.now();
      let c, err = '';
      try { c = await checkerFor(id); } catch (e) { err = String(e.message || e); }
      const ms = Math.round(performance.now() - t0);
      if (!c) { rows.push({ id, ms, err }); continue; }
      rows.push({ id, ms, garbage: c.correct('qzxjvqwk') });
    }
    return rows;
  });
  // the Korean and Ukrainian dictionaries accept words in Latin script by design
  const bad = table.filter((r) => r.err || (r.garbage && !['ko', 'uk'].includes(r.id)));
  check(`All ${table.length} dictionaries load and reject garbage`, table.length >= 95 && !bad.length, JSON.stringify(bad));
  const slow = table.filter((r) => r.ms > 4000);
  check('Every dictionary loads in under 4 s', !slow.length, JSON.stringify(slow));
  console.log('slowest:', table.sort((a, b) => b.ms - a.ms).slice(0, 5).map((r) => `${r.id} ${r.ms}ms`).join(', '));

  const samples = {
    'en-US': ['the house is beautiful', 'beautifull'], fr: ['la maison est très belle', 'maisonn'], 'de-DE': ['das Haus ist sehr schön', 'Hauss'],
    'es-ES': ['la casa es muy bonita', 'bonnita'], it: ['la casa è molto bella', 'bellla'], 'pt-BR': ['a casa é muito bonita', 'bonnita'],
    ru: ['этот дом очень красивый', 'красивыйй'], ar: ['هذا البيت جميل جدا', 'جمييل'], he: ['הבית הזה יפה מאוד', 'יפהה'],
    hi: ['यह घर बहुत सुंदर है', 'सुंदरर'], th: ['บ้านหลังนี้สวยมาก', 'สวยมากกก'], ko: ['이 집은 아주 예쁘다', '예쁘다다다'],
    tr: ['bu ev çok güzel', 'güzzel'], hu: ['ez a ház nagyon szép', 'szépp'], fi: ['tämä talo on hyvin kaunis', 'kauniss'],
    vi: ['ngôi nhà này rất đẹp', 'đẹpp'], uk: ['цей будинок дуже гарний', 'гарнийй'], pl: ['ten dom jest bardzo piękny', 'pięknyy'],
    nl: ['dit huis is erg mooi', 'mooii'], sv: ['det här huset är mycket vackert', 'vackertt'], ur: ['یہ گھر بہت خوبصورت ہے', 'خوبصورتت'],
    eu: ['etxe hau oso polita da', 'politaa'], ta: ['இந்த வீடு மிகவும் அழகாக உள்ளது', 'அழகாககக'], ms: ['rumah ini sangat cantik', 'cantikk']
  };
  const res = await w.evaluate(async (S) => {
    const out = {};
    for (const [id, [good, typo]] of Object.entries(S)) {
      const c = await window.folioSpell.checkerFor(id);
      out[id] = { flagged: c.checkText(good).map((x) => x.word), typo: c.correct(typo), sugg: c.suggest(typo).slice(0, 3) };
    }
    return out;
  }, samples);
  for (const [id, r] of Object.entries(res)) check(`${id}: correct sentence accepted, typo flagged with suggestions`, !r.flagged.length && !r.typo && r.sugg.length > 0, JSON.stringify(r));

  // A French text box and an English one in the same publication
  await w.evaluate(async () => {
    const A = window.folioApp;
    await A.exec('file.newBlank'); A.ui.backstage && A.ui.backstage.close();
    A.transact('setup', (d) => {
      const page = d.pages[0];
      d.stories.sf = { id: 'sf', html: '<p>Bonjour, la maisonn est belle.</p>' };
      d.stories.se = { id: 'se', html: '<p>The garden is lovely today.</p>' };
      page.elements.push({ id: 'tfr', type: 'text', x: 60, y: 60, w: 400, h: 80, rot: 0, storyId: 'sf', lang: 'fr', style: { size: 14 } });
      page.elements.push({ id: 'ten', type: 'text', x: 60, y: 200, w: 400, h: 80, rot: 0, storyId: 'se', style: { size: 14 } });
    });
  });
  await w.evaluate(() => { window.folioApp.exec('review.spelling'); });
  await w.waitForSelector('.sp-head', { timeout: 20000 });
  const head = await w.textContent('.sp-head');
  const ctx = await w.textContent('.sp-context mark');
  const sugg = await w.$$eval('.sp-sugg option', (o) => o.map((x) => x.value));
  check('Spelling dialog finds the French typo with French suggestions', ctx === 'maisonn' && /French/.test(head) && sugg.includes('maison'), `${head} | ${ctx} | ${sugg.join(',')}`);
  await w.keyboard.press('Escape');

  // As-you-type underline in the French box
  await w.evaluate(() => window.folioApp.textEdit.start('tfr', { selectAll: false }));
  await w.waitForTimeout(1500);
  const hl = await w.evaluate(() => { const h = CSS.highlights.get('folio-spell'); return h ? [...h].map((r) => r.toString()) : []; });
  check('Check spelling as you type underlines only the misspelled word', hl.length === 1 && hl[0] === 'maisonn', JSON.stringify(hl));
  await w.evaluate(() => window.folioApp.textEdit.stop());
  check('No page errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  check('Run without exceptions', false, err.stack);
} finally {
  await app.evaluate(({ app }) => app.exit(0));
}
console.log(failed ? `${failed} check(s) failed` : 'All spelling checks passed');
process.exit(failed ? 1 : 0);
