// Review: Spelling (F7), Find & Replace (Mod+F / Mod+H), Design Checker, Document Statistics.

import { app } from '../../core/app.js';
import { registry } from '../../core/registry.js';
import { allElements, walkElements } from '../../core/model.js';
import { h } from '../../core/ui/dom.js';
import { runPreflight } from '../../core/preflight.js';
import { spellcheckDocument, applyCorrection, changeAll } from '../../engines/spell/spell.js';
import { langOfTarget, getChecker, langLabel } from './language.js';
import { findAll, replaceMatch, replaceAll } from '../../engines/spell/find.js';
import { getTargetHtml, collectTextTargets } from '../../engines/spell/targets.js';
import { getPlainText } from '../../engines/spell/html-text.js';
import './review.css';

const hasDoc = (ctx) => !!ctx.doc;

/** Navigate to a text target (story or table cell) and select its object. */
function goToTarget(t) {
  if (!t) return;
  const id = t.kind === 'cell' ? t.elementId : t.frameId;
  if (t.pageIndex >= 0) { if (app.isMasterMode) app.setMasterMode(false); app.goToPage(t.pageIndex); }
  app.select([id]);
  if (app.canvas && app.canvas.scrollToElement) app.canvas.scrollToElement(id);
}
const plainOf = (t) => { const p = getPlainText(getTargetHtml(app.doc, t) || ''); return typeof p === 'string' ? p : p.text; };

// ---------------------------------------------------------------- spelling

registry.command({
  id: 'review.spelling', label: 'Spelling', icon: 'spell', shortcut: 'F7', enabled: hasDoc,
  run: async () => {
    app.flush();
    const langs = new Set(collectTextTargets(app.doc).map((tg) => langOfTarget(app.doc, tg)));
    langs.delete('none');
    const checkers = new Map();
    const slow = setTimeout(() => app.ui.toast('Loading spelling dictionaries…'), 400);
    try {
      for (const id of langs) checkers.set(id, await getChecker(id));
    } catch (err) { clearTimeout(slow); app.ui.toast(`The dictionary could not be loaded: ${err.message || err}`); return; }
    clearTimeout(slow);
    const pick = (tg) => checkers.get(langOfTarget(app.doc, tg)) || null;
    const ignored = new Set();
    let issues = [];
    let i = 0;
    const body = h('div', { class: 'sp-body' });
    const refresh = () => { issues = spellcheckDocument(app.doc, pick).filter((x) => !ignored.has(x.word.toLowerCase())); };
    const draw = () => {
      if (i >= issues.length) {
        body.replaceChildren(h('div', { class: 'sp-done' }, h('strong', { text: 'Spelling check complete.' }), h('p', { text: issues.length ? '' : 'No spelling errors were found.' })));
        return;
      }
      const it = issues[i];
      goToTarget(it.target);
      const plain = plainOf(it.target);
      const a = Math.max(0, it.start - 50), b = Math.min(plain.length, it.end + 50);
      const ctx = h('div', { class: 'sp-context' }, (a > 0 ? '…' : '') + plain.slice(a, it.start), h('mark', { text: plain.slice(it.start, it.end) }), plain.slice(it.end, b) + (b < plain.length ? '…' : ''));
      const sugg = h('select', { class: 'field sp-sugg', size: 6 }, ...(it.suggestions.length ? it.suggestions : ['(no suggestions)']).map((s) => h('option', { value: it.suggestions.length ? s : '', text: s })));
      if (it.suggestions.length) sugg.selectedIndex = 0;
      const change = h('input', { class: 'field', value: it.suggestions[0] || it.word });
      sugg.onchange = () => { if (sugg.value) change.value = sugg.value; };
      const b1 = (label, fn, primary) => h('button', { type: 'button', class: `btn sm${primary ? ' btn-primary' : ''}`, text: label, onclick: fn });
      body.replaceChildren(h('div', { class: 'sp-head', text: `Not in dictionary (${i + 1} of ${issues.length}) · ${langLabel(langOfTarget(app.doc, it.target))}` }), ctx,
        h('div', { class: 'sp-grid' }, h('div', {}, h('label', { class: 'dlg-label', text: 'Change to' }), change, h('label', { class: 'dlg-label', text: 'Suggestions' }), sugg),
          h('div', { class: 'sp-btns' },
            b1('Ignore', () => { i++; draw(); }),
            b1('Ignore All', () => { ignored.add(it.word.toLowerCase()); refresh(); draw(); }),
            b1('Add to Dictionary', () => { const c = pick(it.target); if (c) c.addWord(it.word); refresh(); draw(); }),
            b1('Change', () => { const w = change.value; app.transact('Spelling', (doc) => applyCorrection(doc, it, w)); refresh(); draw(); }, true),
            b1('Change All', () => { const w = change.value; app.transact('Spelling', (doc) => changeAll(doc, it.word, w)); refresh(); draw(); }))));
    };
    refresh(); draw();
    await app.ui.dialog({ title: 'Spelling', body, width: 560, buttons: [{ label: 'Close', value: 'close' }] });
  }
});

// ---------------------------------------------------------------- find & replace panel
let panel = null;
function openFind(replace) {
  if (!panel) panel = buildFind();
  panel.el.hidden = false;
  panel.setReplace(replace);
  panel.focus();
}
function buildFind() {
  const q = h('input', { class: 'field', placeholder: 'Find what', type: 'search' });
  const rep = h('input', { class: 'field', placeholder: 'Replace with' });
  const mk = (label) => { const i = h('input', { type: 'checkbox' }); return { el: h('label', { class: 'check' }, i, h('span', { text: label })), i }; };
  const mc = mk('Match case'), ww = mk('Whole words'), rx = mk('Regular expression');
  const info = h('div', { class: 'fr-info' });
  let matches = [], idx = -1;
  const opts = () => ({ matchCase: mc.i.checked, wholeWord: ww.i.checked, useRegex: rx.i.checked });
  const search = () => {
    try { matches = q.value ? findAll(app.doc, q.value, opts()) : []; } catch (err) { matches = []; info.textContent = err.message; return; }
    if (idx >= matches.length) idx = -1;
    info.textContent = q.value ? `${matches.length} match${matches.length === 1 ? '' : 'es'}` : '';
  };
  const show = () => {
    const m = matches[idx]; if (!m) return;
    goToTarget(m.target);
    info.textContent = `${idx + 1} of ${matches.length}: “…${(m.context || m.text || '').slice(0, 60)}…”`;
  };
  const next = (dir) => { search(); if (!matches.length) return; idx = (idx + dir + matches.length) % matches.length; show(); };
  q.addEventListener('input', () => { idx = -1; if (app.doc) search(); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); next(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') el.hidden = true; });
  [mc.i, ww.i, rx.i].forEach((c) => c.addEventListener('change', () => { idx = -1; search(); }));
  const btn = (label, fn, primary) => h('button', { type: 'button', class: `btn sm${primary ? ' btn-primary' : ''}`, text: label, onclick: fn });
  const replaceRow = h('div', { class: 'fr-row' }, rep, btn('Replace', () => {
    search(); const m = matches[idx]; if (!m) { next(1); return; }
    app.transact('Replace', (doc) => replaceMatch(doc, m, rep.value)); search(); if (matches.length) { idx = Math.min(idx, matches.length - 1); show(); }
  }), btn('Replace All', () => {
    if (!q.value) return;
    let n = 0;
    try { app.transact('Replace All', (doc) => { n = replaceAll(doc, q.value, rep.value, opts()); }); } catch (err) { info.textContent = err.message; return; }
    info.textContent = `Replaced ${n} occurrence${n === 1 ? '' : 's'}.`; matches = []; idx = -1;
  }));
  const el = h('div', { class: 'find-panel', role: 'dialog', 'aria-label': 'Find and Replace' },
    h('div', { class: 'fr-head' }, h('strong', { text: 'Find and Replace' }), h('button', { type: 'button', class: 'dlg-x', text: '×', onclick: () => { el.hidden = true; } })),
    h('div', { class: 'fr-row' }, q, btn('Previous', () => next(-1)), btn('Next', () => next(1), true)), replaceRow,
    h('div', { class: 'fr-opts' }, mc.el, ww.el, rx.el), info);
  document.body.appendChild(el);
  return { el, setReplace: (r) => { replaceRow.hidden = !r; }, focus: () => { q.focus(); q.select(); } };
}
registry.command({ id: 'review.find', label: 'Find', icon: 'zoom-in', shortcut: 'Mod+F', allowInText: true, enabled: hasDoc, run: () => openFind(false) });
registry.command({ id: 'review.replace', label: 'Replace', icon: 'replace-picture', shortcut: 'Mod+H', allowInText: true, enabled: hasDoc, run: () => openFind(true) });

// ---------------------------------------------------------------- design checker
function extraChecks(doc) {
  const out = [];
  doc.pages.forEach((p, pi) => walkElements(p.elements, (el) => {
    if (el.type === 'image' && el.assetId && doc.assets[el.assetId]) {
      const a = doc.assets[el.assetId];
      const dpi = a.width ? Math.min(a.width / (el.w / 96), a.height / (el.h / 96)) : 999;
      if (dpi < 150) out.push({ level: 'warning', message: `Low-resolution picture (${Math.round(dpi)} dpi at its printed size)`, pageIndex: pi, elementId: el.id });
    }
    if (el.type === 'text') {
      const st = doc.stories[el.storyId];
      const isHead = !Object.values(doc.pages).some(() => false);
      if (st && isHead && !st.html.replace(/<[^>]*>/g, '').trim() && !el.next) out.push({ level: 'info', message: 'Empty text box', pageIndex: pi, elementId: el.id });
    }
  }));
  const fields = new Set();
  for (const s of Object.values(doc.stories)) for (const m of s.html.matchAll(/data-field="([^"]+)"/g)) if (!m[1].startsWith('#')) fields.add(m[1]);
  if (fields.size && (!doc.data || !doc.data.columns)) out.push({ level: 'warning', message: `Merge fields (${[...fields].slice(0, 4).join(', ')}) have no recipient list`, pageIndex: -1 });
  return out;
}
registry.command({
  id: 'review.check', label: 'Design Checker', icon: 'warning', enabled: hasDoc,
  run: async () => {
    app.flush();
    const body = h('div', { class: 'dc-body' });
    const draw = () => {
      let issues = [];
      try { issues = [...runPreflight(app.doc), ...extraChecks(app.doc)]; } catch (err) { issues = [{ level: 'error', message: String(err.message || err) }]; }
      if (!issues.length) { body.replaceChildren(h('p', { class: 'dc-ok', text: 'No problems found. Your publication is ready to print.' })); return; }
      body.replaceChildren(h('p', { class: 'dc-sum', text: `${issues.length} item${issues.length > 1 ? 's' : ''} to review` }), h('ul', { class: 'dc-list' }, ...issues.map((it) => h('li', { class: `dc-item dc-${it.level || 'warning'}` },
        h('span', { class: 'dc-dot' }), h('span', { class: 'dc-msg', text: `${it.message}${it.pageIndex >= 0 ? ` — page ${it.pageIndex + 1}` : ''}` }),
        it.elementId ? h('button', { type: 'button', class: 'btn sm', text: 'Go To', onclick: () => goToTarget({ kind: 'cell', elementId: it.elementId, pageIndex: it.pageIndex }) }) : null))));
    };
    draw();
    await app.ui.dialog({ title: 'Design Checker', body, width: 600, buttons: [{ label: 'Close', value: 'close' }], onRender: () => {} });
  }
});
registry.command({
  id: 'review.stats', label: 'Statistics', icon: 'info', enabled: hasDoc,
  run: () => {
    const doc = app.doc;
    let words = 0, chars = 0;
    for (const t of collectTextTargets(doc)) { const p = plainOf(t); chars += p.length; words += (p.match(/[\p{L}\p{N}’']+/gu) || []).length; }
    const els = allElements(doc);
    const count = (ty) => els.filter((e) => e.type === ty).length;
    const rows = [['Pages', doc.pages.length], ['Master pages', doc.masters.length], ['Words', words], ['Characters', chars], ['Text boxes', count('text')], ['Pictures', count('image')], ['Shapes and lines', count('shape') + count('line')], ['Tables', count('table')], ['Recipients', doc.data && doc.data.rows ? doc.data.rows.length : 0]];
    app.ui.dialog({ title: 'Publication Statistics', body: h('dl', { class: 'stats-grid' }, ...rows.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: String(v) })])), buttons: [{ label: 'Close', value: 'close', primary: true }] });
  }
});

registry.group({ tab: 'review', id: 'proofing', label: 'Proofing', order: 10, items: [
  { command: 'review.spelling', size: 'large' }, { command: 'review.find', size: 'small' }, { command: 'review.replace', size: 'small' }
] });
registry.group({ tab: 'review', id: 'checks', label: 'Checks', order: 20, items: [
  { command: 'review.check', size: 'large' }, { command: 'review.stats', size: 'large' }
] });
registry.group({ tab: 'home', id: 'find', label: 'Find', order: 95, items: [{ command: 'review.find', size: 'small' }, { command: 'review.replace', size: 'small' }] });
