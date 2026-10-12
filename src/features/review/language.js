// Proofing languages: Review › Language › Set Proofing Language (85 languages), the document and
// app default language, File › Options › Proofing and Language, and check-spelling-as-you-type
// (wavy underlines while editing text in place, with suggestions on right-click).
// Also the display language: the interface follows the default editing language unless one is
// chosen in File › Options › Language; its catalog (app/i18n/<code>.json) is loaded and installed,
// and core/ui/translate.js switches everything on screen to it.

import { app } from '../../core/app.js';
import { registry } from '../../core/registry.js';
import { prefs } from '../../core/prefs.js';
import { findElement } from '../../core/model.js';
import { h } from '../../core/ui/dom.js';
import { t, setCatalog, currentLanguage, onLanguageChange } from '../../core/i18n.js';
import { PROOFING, LANGUAGES, proofing, matchLanguage } from '../../core/languages.js';
import { checkerFor, peekChecker, setCheckerOptions, dictionaryManifest } from '../../engines/spell/dictionaries.js';
import { optCheck, optSelect } from '../../core/shell/options.js';
import './language.css';

prefs.define({
  proofLang: matchLanguage(globalThis.navigator && navigator.language),
  uiLang: 'follow',
  spellAsYouType: true,
  spellIgnoreCaps: true,
  spellIgnoreNumbers: true
});

const checkerOptions = () => ({ skipAllCaps: prefs.get('spellIgnoreCaps'), skipWordsWithNumbers: prefs.get('spellIgnoreNumbers') });

/** Proofing language of an element (text box or table), falling back to the document and app defaults. */
export function langOf(doc, el) {
  return (el && el.lang) || (doc && doc.meta && doc.meta.lang) || prefs.get('proofLang') || 'en-US';
}

/** Proofing language of a spelling target (story or table cell). */
export function langOfTarget(doc, target) {
  const hit = findElement(doc, target.kind === 'cell' ? target.elementId : target.frameId);
  return langOf(doc, hit && hit.el);
}

const personalKey = (id) => (id === 'en-US' ? 'spell:personal' : `spell:personal:${id}`);
async function personalWords(id) { try { return (await app.platform.store.get(personalKey(id))) || []; } catch { return []; } }

/** Load the checker for a proofing id with its personal dictionary (null for 'none'). */
export async function getChecker(id) {
  if (!id || id === 'none') return null;
  const loadedAlready = peekChecker(id);
  if (loadedAlready) return loadedAlready;
  const personal = await personalWords(id);
  return checkerFor(id, { personal, onPersonalChange: (words) => app.platform.store.set(personalKey(id), words), ...checkerOptions() });
}

// ------------------------------------------------------------------------------------------------
// Display language
// ------------------------------------------------------------------------------------------------

const I18N_BASE = 'i18n/';
let catalogs = null;        // promise of the codes that have a catalog (app/i18n/index.json)

function getText(url) {
  return fetch(url).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} loading ${url}`); return r.text(); }).catch((err) => {
    // file:// pages (Electron) may refuse fetch(); XMLHttpRequest still works there
    if (typeof XMLHttpRequest === 'undefined') throw err;
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('GET', url);
      x.onload = () => (x.status === 200 || (x.status === 0 && x.responseText) ? resolve(x.responseText) : reject(err));
      x.onerror = () => reject(err);
      x.send();
    });
  });
}

/** The display languages with a catalog (codes such as 'de', 'pt', 'sr-Latn'), English excluded. */
export function displayLanguages() {
  if (!catalogs) catalogs = getText(`${I18N_BASE}index.json`).then((s) => JSON.parse(s)).catch(() => []);
  return catalogs;
}

/** The catalog code for a language tag or proofing id ('de-AT' -> 'de'), or 'en' when there is none. */
export function catalogFor(tag, codes) {
  const id = String(tag || 'en');
  if (codes.includes(id)) return id;
  const base = id.split('-')[0];
  if (base === 'nn' && codes.includes('nb') && !codes.includes('nn')) return 'nb';
  return codes.includes(base) ? base : 'en';
}

/** The language name in its own language ('de' -> 'Deutsch'). */
export function nativeName(code) {
  try {
    const n = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    if (n && n !== code) return n.charAt(0).toLocaleUpperCase(code) + n.slice(1);
  } catch { /* unknown to this browser */ }
  const l = LANGUAGES.find((x) => x.code === code.split('-')[0]);
  return l ? l.native : code;
}

let applying = 0;
async function applyDisplayLanguage() {
  const ticket = ++applying;
  const codes = await displayLanguages();
  const want = prefs.get('uiLang') === 'follow' ? prefs.get('proofLang') : prefs.get('uiLang');
  const code = catalogFor(want, codes);
  if (code === currentLanguage() && ticket === applying) return;
  let strings = null;
  if (code !== 'en') {
    try { strings = JSON.parse(await getText(`${I18N_BASE}${code}.json`)); } catch (err) { console.warn(`Display language ${code} could not be loaded`, err); }
  }
  if (ticket !== applying) return;
  setCatalog(strings ? code : 'en', strings);
}

onLanguageChange((code) => {
  document.documentElement.lang = code;
  const d = globalThis.folioDesktop;
  if (d && d.send) d.send('app:language', code);
});
prefs.on('change', (p) => { if (p === 'uiLang' || (p === 'proofLang' && prefs.get('uiLang') === 'follow')) applyDisplayLanguage(); });
applyDisplayLanguage();

/** Display name of a proofing id, in the display language ('de-AT' -> 'German (Austria)'). */
export function langLabel(id) {
  if (id === 'none') return t('Do not check spelling');
  const p = proofing(id);
  if (!p) return id;
  let name = '';
  try { name = new Intl.DisplayNames([currentLanguage(), 'en'], { type: 'language' }).of(id) || ''; } catch { /* unknown tag */ }
  if (!name || name === id || name.toLowerCase() === id.toLowerCase()) name = p.label;
  name = name.charAt(0).toLocaleUpperCase() + name.slice(1);
  return `${name}${p.native && p.native !== name ? ` — ${p.native}` : ''}`;
}

prefs.on('change', (p) => {
  if (p === 'spellIgnoreCaps' || p === 'spellIgnoreNumbers') setCheckerOptions(checkerOptions());
  if (p.startsWith('spell') || p === 'proofLang') live.recheck();
});

// ------------------------------------------------------------------------------------------------
// Set Proofing Language
// ------------------------------------------------------------------------------------------------

function proofTargets() {
  const doc = app.doc;
  if (!doc) return [];
  if (app.editing) { const hit = findElement(doc, app.editing.frameId); return hit ? [hit.el] : []; }
  return app.selectionIds.map((id) => findElement(doc, id)?.el).filter((el) => el && (el.type === 'text' || el.type === 'table'));
}

registry.command({
  id: 'review.language', label: 'Set Proofing Language', icon: 'language', enabled: (ctx) => !!ctx.doc,
  title: 'Choose the language used to check spelling of the selected text boxes (or the whole publication)',
  run: async () => {
    if (app.textEdit && app.textEdit.commit) app.textEdit.commit();
    const targets = proofTargets();
    const current = targets.length ? langOf(app.doc, targets[0]) : langOf(app.doc, null);
    const search = h('input', { class: 'field', type: 'search', placeholder: t('Search languages') });
    const list = h('select', { class: 'field lang-list', size: 14 });
    const fill = () => {
      const q = search.value.trim().toLowerCase();
      const items = [{ id: 'none', label: t('Do not check spelling'), native: '' }, ...PROOFING];
      list.replaceChildren(...items.filter((p) => !q || p.label.toLowerCase().includes(q) || (p.native || '').toLowerCase().includes(q) || p.id.toLowerCase().startsWith(q))
        .map((p) => h('option', { value: p.id, text: p.id === 'none' ? p.label : langLabel(p.id) })));
      list.value = current;
      if (list.selectedIndex < 0 && list.options.length) list.selectedIndex = 0;
    };
    search.addEventListener('input', fill);
    fill();
    const asDefault = h('input', { type: 'checkbox' });
    // the interface follows along when the whole publication changes language (or when asked)
    const asDisplay = h('input', { type: 'checkbox', checked: !targets.length });
    const scope = targets.length ? t('Applies to the selected text ({n} object(s)).', { n: targets.length }) : t('Applies to the whole publication.');
    const body = h('div', { class: 'lang-dlg' }, h('p', { class: 'dlg-hint', text: scope }), search, list,
      h('label', { class: 'check' }, asDefault, h('span', { text: t('Set as default for new publications') })),
      h('label', { class: 'check' }, asDisplay, h('span', { text: t('Show Folio’s menus and buttons in this language') })));
    list.addEventListener('dblclick', () => api && api.submit('ok'));
    let api = null;
    const r = await app.ui.dialog({ title: t('Language'), body, width: 460, onRender: (_root, a) => { api = a; } });
    if (!r) return;
    const id = list.value;
    if (!id) return;
    app.transact('Set Proofing Language', (doc) => {
      if (targets.length) for (const el of targets) { const hit = findElement(doc, el.id); if (hit) hit.el.lang = id; }
      else doc.meta.lang = id;
    });
    if (asDefault.checked && id !== 'none') prefs.set('proofLang', id);
    if (asDisplay.checked && id !== 'none') prefs.set('uiLang', catalogFor(id, await displayLanguages()));
    live.recheck();
  }
});

registry.group({ tab: 'review', id: 'language', label: 'Language', order: 20, items: [{ command: 'review.language', size: 'large' }] });
registry.icon('language', '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>');

// ------------------------------------------------------------------------------------------------
// Options
// ------------------------------------------------------------------------------------------------

registry.optionsSection({
  page: 'proofing', id: 'spelling', title: 'When correcting spelling', order: 10,
  render(box) {
    box.append(
      optCheck('Check spelling as you type', () => prefs.get('spellAsYouType'), (v) => prefs.set('spellAsYouType', v)),
      optCheck('Ignore words in UPPERCASE', () => prefs.get('spellIgnoreCaps'), (v) => prefs.set('spellIgnoreCaps', v)),
      optCheck('Ignore words that contain numbers', () => prefs.get('spellIgnoreNumbers'), (v) => prefs.set('spellIgnoreNumbers', v))
    );
  }
});

registry.optionsSection({
  page: 'language', id: 'display', title: 'Display language', order: 5,
  render(box) {
    const sel = h('select', { class: 'field' }, h('option', { value: 'follow', text: t('Same as the default editing language') }), h('option', { value: 'en', translate: 'no', text: 'English' }));
    sel.value = prefs.get('uiLang');
    sel.addEventListener('change', () => prefs.set('uiLang', sel.value));
    displayLanguages().then((codes) => {
      const opts = codes.map((c) => ({ c, n: nativeName(c) })).sort((a, b) => a.n.localeCompare(b.n));
      sel.append(...opts.map(({ c, n }) => h('option', { value: c, lang: c, translate: 'no', text: n })));
      sel.value = prefs.get('uiLang');
      if (sel.selectedIndex < 0) sel.value = 'follow';
    });
    box.append(h('label', { class: 'opt-row' }, h('span', { text: t('Menus, buttons and messages') }), sel),
      h('p', { class: 'dlg-hint', text: t('Folio’s interface switches to this language at once. Your publications are not changed.') }));
  }
});

registry.optionsSection({
  page: 'language', id: 'proofing', title: 'Editing languages', order: 10,
  render(box) {
    box.appendChild(optSelect('Default proofing language', PROOFING.map((p) => ({ value: p.id, label: langLabel(p.id) })), () => prefs.get('proofLang'), (v) => prefs.set('proofLang', v), { raw: true }));
    const info = h('p', { class: 'dlg-hint', text: t('{n} proofing languages are installed.', { n: LANGUAGES.length }) });
    box.appendChild(info);
    dictionaryManifest().then((m) => {
      const mb = Object.values(m).reduce((n, e) => n + (e.bytes || 0), 0) / 1048576;
      info.textContent = t('{n} proofing languages are installed ({d} dictionaries, {mb} MB).', { n: LANGUAGES.length, d: Object.keys(m).length, mb: mb.toFixed(0) });
    }).catch(() => { info.textContent = t('The spelling dictionaries could not be found.'); });
  }
});

// ------------------------------------------------------------------------------------------------
// Check spelling as you type
// ------------------------------------------------------------------------------------------------

const HAS_HL = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';

const live = {
  root: null, lang: null, timer: 0, ranges: [],
  attach(ed) {
    this.detach();
    if (!ed || !ed.root) return;
    this.root = ed.root;
    const hit = findElement(app.doc, ed.frameId);
    this.lang = langOf(app.doc, hit && hit.el);
    this.root.spellcheck = false;
    if (this.lang !== 'none') this.root.lang = this.lang;
    const p = proofing(this.lang);
    if (p && p.dir === 'rtl') this.root.dir = 'rtl';
    this.onInput = () => { clearTimeout(this.timer); this.timer = setTimeout(() => this.check(), 350); };
    this.onMenu = (e) => this.menu(e);
    this.root.addEventListener('input', this.onInput);
    this.root.addEventListener('contextmenu', this.onMenu, true);
    this.check();
  },
  detach() {
    clearTimeout(this.timer);
    if (this.root) { this.root.removeEventListener('input', this.onInput); this.root.removeEventListener('contextmenu', this.onMenu, true); }
    this.root = null;
    this.ranges = [];
    if (HAS_HL) CSS.highlights.delete('folio-spell');
  },
  recheck() { if (this.root) { const hit = findElement(app.doc, app.editing && app.editing.frameId); this.lang = langOf(app.doc, hit && hit.el); this.check(); } },
  async check() {
    const root = this.root;
    if (!root || !HAS_HL) return;
    if (!prefs.get('spellAsYouType') || this.lang === 'none') { this.ranges = []; CSS.highlights.delete('folio-spell'); return; }
    let checker;
    try { checker = await getChecker(this.lang); } catch { return; }
    if (!checker || root !== this.root) return;
    const ranges = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && n.parentElement.closest('.field,[data-wrapx]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      for (const hit of checker.checkText(n.data)) {
        const r = new Range();
        r.setStart(n, hit.start); r.setEnd(n, hit.end);
        ranges.push({ range: r, word: hit.word });
      }
    }
    this.ranges = ranges;
    this.checker = checker;
    CSS.highlights.set('folio-spell', new Highlight(...ranges.map((x) => x.range)));
  },
  menu(e) {
    if (!this.ranges.length || !document.caretRangeFromPoint) return;
    const at = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (!at) return;
    const hit = this.ranges.find((x) => x.range.isPointInRange(at.startContainer, at.startOffset));
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();
    const checker = this.checker;
    const replace = (word) => {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(hit.range);
      document.execCommand('insertText', false, word);
    };
    const sugg = checker.suggest(hit.word);
    app.ui.contextMenu(e.clientX, e.clientY, [
      ...(sugg.length ? sugg.slice(0, 6).map((s) => ({ label: s, run: () => replace(s) })) : [{ label: t('(no suggestions)'), disabled: true }]),
      '-',
      { label: t('Ignore All'), run: () => { checker.ignore(hit.word); this.check(); } },
      { label: t('Add to Dictionary'), run: () => { checker.addWord(hit.word); this.check(); } },
      { label: t('Set Proofing Language…'), run: () => app.exec('review.language') }
    ]);
  }
};

app.on('edit-start', (ed) => live.attach(ed || app.editing));
app.on('edit-end', () => live.detach());
app.on('doc-change', () => { if (live.root) live.recheck(); });
