// Text tools: Home Font / Paragraph / Styles groups, the Text Box Format contextual tab, linked text
// frames (create/break links, overflow), hyperlinks, symbols and page/date fields.

import { app } from '../../core/app.js';
import { registry } from '../../core/registry.js';
import { findElement, getChain, createTextFrame, walkElements } from '../../core/model.js';
import { FONTS, resolveColor } from '../../core/theme.js';
import { h } from '../../core/ui/dom.js';
import { icon } from '../../core/ui/icons.js';
import { setTip } from '../../core/ui/tooltip.js';
import { colorPicker } from '../../core/ui/colorpicker.js';
import { row, lengthField, numberField, selectField, colorField, segmented } from '../../core/ui/fields.js';
import { applyToSelection } from '../core-common.js';
import * as rt from '../../engines/text/richtext.js';
import { fieldSpan } from '../../engines/text/fields.js';
import './text.css';
import './icons.js';

const SIZES = [6, 7, 8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 54, 60, 72, 96];
const textSel = (ctx) => !!ctx.editing || (ctx.selection || []).some((e) => e.type === 'text');
const editing = () => app.editing && app.editing.root;

/**
 * Run a rich-text operation on the current text selection; when frames are selected but not being
 * edited, apply it to all of their text (one undo step per frame).
 */
function withText(fn) {
  if (editing()) { fn(app.editing.root); app.textEdit.commit(); refreshState(); return; }
  const frames = (app.selection || []).filter((e) => e.type === 'text');
  if (!frames.length) return;
  const ids = app.selectionIds;
  for (const f of frames) {
    if (!app.textEdit.start(f.id, { selectAll: true })) continue;
    const root = app.editing.root;
    const r = document.createRange(); r.selectNodeContents(root);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    fn(root);
    app.textEdit.commit();
    app.textEdit.stop();
  }
  app.select(ids);
}

// ---------------------------------------------------------------- character commands
const fmt = (id, label, icon, fn, shortcut) => registry.command({ id, label, icon, shortcut, allowInText: true, enabled: textSel, checked: () => !!(state && state[id.split('.')[1]]), run: () => withText(fn) });
fmt('text.bold', 'Bold', 'bold', rt.toggleBold, 'Mod+B');
fmt('text.italic', 'Italic', 'italic', rt.toggleItalic, 'Mod+I');
fmt('text.underline', 'Underline', 'underline', rt.toggleUnderline, 'Mod+U');
fmt('text.strike', 'Strikethrough', 'strike', rt.toggleStrike);
fmt('text.sup', 'Superscript', 'superscript', rt.toggleSuper, 'Mod+Shift+=');
fmt('text.sub', 'Subscript', 'subscript', rt.toggleSub, 'Mod+=');
registry.command({ id: 'text.clear', label: 'Clear Formatting', icon: 'clear-format', allowInText: true, enabled: textSel, run: () => withText(rt.clearFormatting) });
registry.command({ id: 'text.font', label: 'Font', allowInText: true, enabled: textSel, run: (ctx, fam) => withText((r) => rt.setFontFamily(r, fam)) });
registry.command({ id: 'text.size', label: 'Font Size', allowInText: true, enabled: textSel, run: (ctx, pt) => withText((r) => rt.setFontSize(r, Math.max(1, Math.min(999, +pt)))) });
const step = (dir) => (r) => {
  const cur = (rt.getSelectionState(r) || {}).size || 12;
  const next = dir > 0 ? SIZES.find((s) => s > cur) || cur + 12 : [...SIZES].reverse().find((s) => s < cur) || Math.max(1, cur - 1);
  rt.setFontSize(r, next);
};
registry.command({ id: 'text.grow', label: 'Increase Font Size', icon: 'font-grow', shortcut: 'Mod+Shift+.', allowInText: true, enabled: textSel, run: () => withText(step(1)) });
registry.command({ id: 'text.shrink', label: 'Decrease Font Size', icon: 'font-shrink', shortcut: 'Mod+Shift+,', allowInText: true, enabled: textSel, run: () => withText(step(-1)) });
registry.command({ id: 'text.color', label: 'Font Colour', icon: 'font-color', allowInText: true, enabled: textSel, run: (ctx, c) => withText((r) => rt.setColor(r, c)) });
registry.command({ id: 'text.highlight', label: 'Highlight', icon: 'highlight', allowInText: true, enabled: textSel, run: (ctx, c) => withText((r) => rt.setHighlight(r, c === 'transparent' ? null : c)) });
registry.command({ id: 'text.spacing', label: 'Character Spacing', allowInText: true, enabled: textSel, run: (ctx, px) => withText((r) => rt.applyInlineStyle(r, 'letter-spacing', px ? `${px}px` : null)) });
registry.command({ id: 'text.case', label: 'Change Case', allowInText: true, enabled: textSel, run: (ctx, mode) => withText((r) => rt.applyInlineStyle(r, 'text-transform', mode === 'none' ? null : mode)) });

// ---------------------------------------------------------------- paragraph commands
for (const [a, key] of [['left', 'Mod+L'], ['center', 'Mod+E'], ['right', 'Mod+R'], ['justify', 'Mod+J']]) {
  registry.command({ id: `text.align-${a}`, label: { left: 'Align Left', center: 'Center', right: 'Align Right', justify: 'Justify' }[a], icon: `text-${a}`, shortcut: key, allowInText: true, enabled: textSel,
    checked: () => !!state && state.align === a, run: () => withText((r) => rt.setParagraphStyle(r, { align: a })) });
}
registry.command({ id: 'text.lineSpacing', label: 'Line Spacing', icon: 'line-spacing', allowInText: true, enabled: textSel, run: (ctx, v) => withText((r) => rt.setParagraphStyle(r, { lineHeight: +v })) });
registry.command({
  id: 'text.paragraph', label: 'Paragraph…', icon: 'line-spacing', allowInText: true, enabled: textSel,
  run: async () => {
    const st = state || {};
    const r = await app.ui.dialog({ title: 'Paragraph', fields: [
      { name: 'align', label: 'Alignment', type: 'select', value: st.align || 'left', options: ['left', 'center', 'right', 'justify'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })), half: true },
      { name: 'lh', label: 'Line spacing (× size)', type: 'number', value: st.lineHeight || 1.25, min: 0.5, max: 5, step: 0.05, half: true },
      { name: 'before', label: 'Space before (pt)', type: 'number', value: 0, min: 0, max: 200, half: true },
      { name: 'after', label: 'Space after (pt)', type: 'number', value: 6, min: 0, max: 200, half: true },
      { name: 'indent', label: 'Left indent (pt)', type: 'number', value: 0, min: 0, max: 500, half: true },
      { name: 'first', label: 'First line (pt)', type: 'number', value: 0, min: -200, max: 500, half: true }
    ], buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'OK', value: 'ok', primary: true }] });
    if (!r || r.button !== 'ok') return;
    const v = r.values, pt = (x) => (+x || 0) / 0.75;
    withText((root) => rt.setParagraphStyle(root, { align: v.align, lineHeight: +v.lh || 1.25, spaceBefore: pt(v.before), spaceAfter: pt(v.after), indentLeft: pt(v.indent), firstLine: pt(v.first) }));
  }
});
registry.command({ id: 'text.bullets', label: 'Bullets', icon: 'list-bullet', allowInText: true, enabled: textSel, checked: () => !!state && state.list === 'ul', run: () => withText((r) => rt.toggleList(r, 'ul')) });
registry.command({ id: 'text.numbering', label: 'Numbering', icon: 'list-number', allowInText: true, enabled: textSel, checked: () => !!state && state.list === 'ol', run: () => withText((r) => rt.toggleList(r, 'ol')) });
registry.command({ id: 'text.indent', label: 'Increase Indent', icon: 'indent', allowInText: true, enabled: textSel, run: () => withText((r) => rt.changeIndent(r, 1)) });
registry.command({ id: 'text.outdent', label: 'Decrease Indent', icon: 'outdent', allowInText: true, enabled: textSel, run: () => withText((r) => rt.changeIndent(r, -1)) });

// ---------------------------------------------------------------- styles
const STYLES = {
  normal: { label: 'Normal', font: '@body', size: 12, bold: false, italic: false, color: '@ink', before: 0, after: 6 },
  title: { label: 'Title', font: '@heading', size: 36, bold: false, italic: false, color: '@accent', before: 0, after: 12 },
  subtitle: { label: 'Subtitle', font: '@heading', size: 18, bold: false, italic: true, color: '@muted', before: 0, after: 10 },
  h1: { label: 'Heading 1', font: '@heading', size: 24, bold: true, italic: false, color: '@ink', before: 12, after: 6 },
  h2: { label: 'Heading 2', font: '@heading', size: 18, bold: true, italic: false, color: '@accent', before: 10, after: 4 },
  h3: { label: 'Heading 3', font: '@body', size: 14, bold: true, italic: false, color: '@ink', before: 8, after: 4 },
  quote: { label: 'Quote', font: '@heading', size: 16, bold: false, italic: true, color: '@accent', before: 6, after: 6 },
  caption: { label: 'Caption', font: '@body', size: 9, bold: false, italic: true, color: '@muted', before: 2, after: 2 }
};
registry.command({
  id: 'text.style', label: 'Text Style', allowInText: true, enabled: textSel,
  run: (ctx, id) => {
    const s = STYLES[id]; if (!s) return;
    withText((r) => {
      rt.setFontFamily(r, s.font); rt.setFontSize(r, s.size); rt.setColor(r, s.color);
      const st = rt.getSelectionState(r) || {};
      if (!!st.bold !== s.bold) rt.toggleBold(r);
      if (!!st.italic !== s.italic) rt.toggleItalic(r);
      rt.setParagraphStyle(r, { spaceBefore: s.before / 0.75, spaceAfter: s.after / 0.75 });
    });
  }
});

// ---------------------------------------------------------------- frame-level (Text Box Format)
const frameIds = () => (app.selection || []).filter((e) => e.type === 'text').map((e) => e.id);
const frameSel = (ctx) => (ctx.selection || []).some((e) => e.type === 'text') || !!ctx.editing;
function onFrames(label, fn) {
  const ids = app.editing ? [app.editing.frameId] : frameIds();
  if (!ids.length) return;
  app.transact(label, (doc) => { for (const id of ids) { const hit = findElement(doc, id); if (hit && hit.el.type === 'text') fn(hit.el, doc); } });
}
registry.command({ id: 'text.autofit', label: 'Text Fit', icon: 'text-fit', enabled: frameSel, checked: (ctx, v) => !!ctx.selection[0] && ctx.selection[0].autofit === v, run: (ctx, v) => onFrames('Text Fit', (el) => { el.autofit = v; }) });
registry.command({
  id: 'text.bestFit', label: 'Best Fit', icon: 'text-fit', enabled: frameSel,
  run: () => onFrames('Best Fit', (el) => { el.autofit = 'shrink'; })
});
registry.command({ id: 'text.valign', label: 'Vertical Alignment', enabled: frameSel, run: (ctx, v) => onFrames('Vertical Alignment', (el) => { el.valign = v; }) });
registry.command({
  id: 'text.margins', label: 'Text Box Margins…', icon: 'margins', enabled: frameSel,
  run: async () => {
    const f = app.selection.find((e) => e.type === 'text');
    const p = f.padding || { top: 4, right: 4, bottom: 4, left: 4 };
    const r = await app.ui.dialog({ title: 'Text Box Margins', fields: ['top', 'bottom', 'left', 'right'].map((k) => ({ name: k, label: k[0].toUpperCase() + k.slice(1), type: 'length', value: p[k], min: 0, half: true })),
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'OK', value: 'ok', primary: true }] });
    if (r && r.button === 'ok') onFrames('Text Box Margins', (el) => { el.padding = { top: r.values.top, right: r.values.right, bottom: r.values.bottom, left: r.values.left }; });
  }
});
registry.command({
  id: 'text.columns', label: 'Columns…', icon: 'columns', enabled: frameSel,
  run: async () => {
    const f = app.selection.find((e) => e.type === 'text');
    const r = await app.ui.dialog({ title: 'Text Box Columns', fields: [
      { name: 'n', label: 'Number of columns', type: 'number', value: f.columns || 1, min: 1, max: 8, step: 1, half: true },
      { name: 'gap', label: 'Spacing', type: 'length', value: f.colGap ?? 12, min: 0, half: true }],
    buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'OK', value: 'ok', primary: true }] });
    if (r && r.button === 'ok') onFrames('Columns', (el) => { el.columns = Math.max(1, Math.min(8, Math.round(+r.values.n || 1))); el.colGap = r.values.gap; });
  }
});
// ---------------------------------------------------------------- linked frames
registry.command({
  id: 'text.createLink', label: 'Create Link', icon: 'link-frames', title: 'Continue this story in another text box. Select the overflowing text box and an empty one, or just the first to add a new box on the next page.',
  enabled: (ctx) => frameIds().length >= 1,
  run: () => {
    const sel = app.selection.filter((e) => e.type === 'text');
    const doc = app.doc;
    const src = getChain(doc, sel[0].id).slice(-1)[0];
    if (sel.length >= 2) {
      const tgt = sel[1];
      const story = doc.stories[tgt.storyId];
      const empty = !story || !story.html.replace(/<[^>]+>/g, '').trim();
      if (getChain(doc, tgt.id).length > 1 || !empty) { app.ui.toast('The second text box must be empty and not already linked.'); return; }
      if (getChain(doc, src.id).some((f) => f.id === tgt.id)) return;
      app.transact('Link Text Boxes', (d) => {
        const a = findElement(d, src.id).el, b = findElement(d, tgt.id).el;
        delete d.stories[b.storyId];
        b.storyId = a.storyId; a.next = b.id;
      });
      return;
    }
    // new frame on the next page (created when needed), same geometry
    let made = null;
    app.transact('Continue on Next Page', (d) => {
      const pi = Math.max(0, d.pages.findIndex((p) => { let f = false; walkElements(p.elements, (e) => { if (e.id === src.id) f = true; }); return f; }));
      if (!d.pages[pi + 1]) d.pages.splice(pi + 1, 0, { id: `p${Date.now().toString(36)}`, masterId: d.pages[pi].masterId, background: null, guides: { v: [], h: [] }, elements: [] });
      const a = findElement(d, src.id).el;
      const b = createTextFrame(d, { x: a.x, y: a.y, w: a.w, h: a.h, style: { ...a.style }, padding: { ...a.padding }, columns: a.columns, colGap: a.colGap });
      delete d.stories[b.storyId];
      b.storyId = a.storyId; a.next = b.id;
      d.pages[pi + 1].elements.push(b);
      made = { id: b.id, page: pi + 1 };
    });
    if (made) { app.goToPage(made.page); app.select([made.id]); app.ui.toast('The story now continues on this page.'); }
  }
});
registry.command({
  id: 'text.breakLink', label: 'Break', icon: 'unlink', title: 'Break the link to the next text box. Text after this box stays with this story as overflow.',
  enabled: (ctx) => (ctx.selection || []).some((e) => e.type === 'text' && e.next),
  run: () => app.transact('Break Link', (doc) => {
    for (const id of frameIds()) {
      const a = findElement(doc, id).el;
      if (!a.next) continue;
      const next = findElement(doc, a.next);
      a.next = null;
      // the rest of the chain gets a new empty story
      if (next) {
        const fresh = { id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, html: '<p></p>' };
        doc.stories[fresh.id] = fresh;
        for (let f = next.el; f; f = f.next ? findElement(doc, f.next)?.el : null) f.storyId = fresh.id;
      }
    }
  })
});
registry.command({ id: 'text.nextFrame', label: 'Next Box', icon: 'chevron-right', enabled: (ctx) => (ctx.selection || []).some((e) => e.type === 'text' && e.next),
  run: () => { const f = app.selection.find((e) => e.next); const pi = findPage(f.next); if (pi >= 0) app.goToPage(pi); app.select([f.next]); } });
registry.command({ id: 'text.prevFrame', label: 'Previous Box', icon: 'chevron-left', enabled: (ctx) => (ctx.selection || []).some((e) => e.type === 'text' && getChain(ctx.doc, e.id)[0].id !== e.id),
  run: () => { const f = app.selection.find((e) => e.type === 'text'); const ch = getChain(app.doc, f.id); const i = ch.findIndex((x) => x.id === f.id); const p = ch[i - 1]; if (p) { const pi = findPage(p.id); if (pi >= 0) app.goToPage(pi); app.select([p.id]); } } });
function findPage(id) { return app.doc.pages.findIndex((p) => { let f = false; walkElements(p.elements, (e) => { if (e.id === id) f = true; }); return f; }); }

// Clicking the overflow marker continues the story in a new box on the next page.
document.addEventListener('pointerdown', (e) => {
  const mark = e.target.closest && e.target.closest('.tx-overflow');
  if (!mark) return;
  const node = mark.closest('[data-id]');
  if (!node) return;
  e.preventDefault(); e.stopPropagation();
  app.select([node.dataset.id]);
  app.exec('text.createLink');
}, true);

// ---------------------------------------------------------------- insert: links, symbols, fields
registry.command({
  id: 'text.link', label: 'Link', icon: 'link', shortcut: 'Mod+K', allowInText: true, enabled: (ctx) => !!ctx.editing,
  run: async () => {
    const root = app.editing.root;
    const sel = getSelection();
    const saved = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const cur = (rt.getSelectionState(root) || {}).link || 'https://';
    const r = await app.ui.dialog({ title: 'Hyperlink', fields: [{ name: 'url', label: 'Address (https://… or mailto:…)', type: 'text', value: cur }, { name: 'text', label: 'Text to display (when nothing is selected)', type: 'text', value: '' }],
      buttons: [{ label: 'Remove Link', value: 'remove' }, { label: 'Cancel', value: 'cancel' }, { label: 'OK', value: 'ok', primary: true }] });
    if (!r || r.button === 'cancel') return;
    root.focus();
    if (saved) { sel.removeAllRanges(); sel.addRange(saved); }
    if (r.button === 'remove') rt.removeLink(root);
    else if (/^(https?:\/\/|mailto:)/i.test(r.values.url.trim())) rt.insertLink(root, r.values.url.trim(), r.values.text || undefined);
    else { app.ui.toast('Links must start with https://, http:// or mailto:'); return; }
    app.textEdit.commit();
  }
});
const SYMBOLS = '© ® ™ § ¶ † ‡ • · … – — ‘ ’ “ ” « » ‹ › ° ± × ÷ ≈ ≠ ≤ ≥ ∞ √ ∑ π µ ½ ¼ ¾ ⅓ ⅔ € £ ¥ ¢ $ ¤ → ← ↑ ↓ ↔ ⇒ ★ ☆ ✓ ✔ ✗ ♥ ♦ ♣ ♠ ♪ ☎ ✉ ☀ ☂ ❦ ❧ ✿ ❖ ◆ ◇ ■ □ ● ○ ▲ △ ▼ ▽ ¡ ¿ æ Æ œ Œ ß ø Ø å Å é è ê ë ñ ç ü ö ä'.split(' ');
registry.command({
  id: 'text.symbol', label: 'Symbol', icon: 'symbol', allowInText: true, enabled: (ctx) => !!ctx.editing,
  run: () => {
    const root = app.editing.root;
    const sel = getSelection();
    const saved = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const grid = h('div', { class: 'sym-grid' }, ...SYMBOLS.map((s) => h('button', { type: 'button', class: 'sym', text: s, onclick: () => {
      root.focus(); if (saved) { sel.removeAllRanges(); sel.addRange(saved); }
      document.execCommand('insertText', false, s);
      if (sel.rangeCount) saved.setStart(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
      app.textEdit.commit();
    } })));
    app.ui.dialog({ title: 'Symbol', body: grid, width: 480, buttons: [{ label: 'Close', value: 'close', primary: true }] });
  }
});
for (const [name, label, ic] of [['#page', 'Page Number', 'page-number'], ['#pages', 'Number of Pages', 'page-number'], ['#date', 'Date', 'calendar']]) {
  registry.command({
    id: `text.field-${name.slice(1)}`, label, icon: ic, allowInText: true, enabled: (ctx) => !!ctx.doc,
    run: () => {
      if (editing()) { rt.insertField(app.editing.root, name); app.textEdit.commit(); return; }
      // not editing: add a small text box with the field at the bottom centre of the page / master
      const d = app.doc;
      app.transact(`Insert ${label}`, (doc) => {
        const f = createTextFrame(doc, { x: doc.setup.width / 2 - 72, y: doc.setup.height - doc.setup.margins.bottom + 8, w: 144, h: 24, style: { font: '@body', size: 10, color: '@muted', align: 'center' } }, `<p style="text-align:center">${fieldSpan(name)}</p>`);
        app.page.elements.push(f);
        app.select([f.id]);
      });
      void d;
    }
  });
}

// ---------------------------------------------------------------- selection state for controls
let state = null;
function refreshState() {
  state = editing() ? rt.getSelectionState(app.editing.root) : null;
  if (app.ribbon && app.ribbon.update) app.ribbon.update();
}
document.addEventListener('selectionchange', () => { if (editing()) refreshState(); });
app.on('edit-start', refreshState);
app.on('edit-end', refreshState);

// ---------------------------------------------------------------- ribbon controls
function fontControls() {
  return {
    type: 'custom', className: 'rb-fontbox',
    render(el) {
      const fonts = h('select', { class: 'field rb-font', 'aria-label': 'Font' });
      const fill = () => {
        const doc = app.doc;
        const th = doc ? doc.theme.fonts : { heading: 'Heading', body: 'Body' };
        fonts.replaceChildren(h('optgroup', { label: 'Theme fonts' }, h('option', { value: '@heading', text: `${th.heading} (Headings)` }), h('option', { value: '@body', text: `${th.body} (Body)` })),
          h('optgroup', { label: 'All fonts' }, ...FONTS.map((f) => h('option', { value: f, text: f, style: { fontFamily: f } }))));
      };
      fill();
      fonts.addEventListener('mousedown', () => fill());
      fonts.addEventListener('change', () => { restoreRange(); app.exec('text.font', fonts.value); });
      const size = h('input', { class: 'field rb-sizein', list: 'folio-sizes', 'aria-label': 'Font size', inputmode: 'decimal' });
      const dl = h('datalist', { id: 'folio-sizes' }, ...SIZES.map((s) => h('option', { value: String(s) })));
      // apply a size once: on Enter, on leaving the box, or as soon as one is picked from the list
      let applied = null;
      const apply = () => {
        const v = parseFloat(size.value);
        if (!(v > 0) || v === applied) return;
        applied = v;
        restoreRange();
        app.exec('text.size', v);
      };
      size.addEventListener('focus', () => { applied = parseFloat(size.value) || null; });
      size.addEventListener('change', apply);
      size.addEventListener('input', (e) => { if (!e.inputType || e.inputType === 'insertReplacementText') apply(); });
      size.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
      setTip(fonts, 'Font'); setTip(size, 'Font size (pt)');
      // keep the text selection when using these controls while editing
      for (const c of [fonts, size]) c.addEventListener('pointerdown', () => saveRange());
      el.append(h('div', { class: 'rb-row' }, fonts, size, dl));
      return {
        update(ctx) {
          const on = textSel(ctx);
          fonts.disabled = size.disabled = !on;
          if (document.activeElement === size || document.activeElement === fonts) return;
          const f = ctx.selection && ctx.selection.find((e) => e.type === 'text');
          const fam = state ? state.fontRef || state.font : f ? f.style.font : '';
          if (fam && ![...fonts.options].some((o) => o.value === fam)) fonts.append(h('option', { value: fam, text: fam }));
          fonts.value = fam || '';
          size.value = state && state.size ? String(state.size) : f ? String(f.style.size) : '';
        }
      };
    }
  };
}
let savedRange = null;
function saveRange() {
  const s = getSelection();
  if (editing() && s.rangeCount && app.editing.root.contains(s.getRangeAt(0).commonAncestorContainer)) savedRange = s.getRangeAt(0).cloneRange();
}
/** Put the text selection back (the ribbon's font and size boxes take focus from the text being edited). */
function restoreRange() {
  if (!editing() || !savedRange) return;
  app.editing.root.focus({ preventScroll: true });
  const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange);
}

function colorButton(id, label, ic, getDefault) {
  return {
    type: 'custom',
    render(el) {
      let last = getDefault();
      const bar = h('span', { class: 'rb-colorbar' });
      const main = h('button', { type: 'button', class: 'rb rb-icon rb-colormain' }, h('span', { class: 'rb-ic' }, icon(ic), bar));
      const caret = h('button', { type: 'button', class: 'rb rb-icon rb-colorcaret' }, icon('chevron-down'));
      setTip(main, label); setTip(caret, `${label} options`);
      main.addEventListener('pointerdown', (e) => { e.preventDefault(); });
      caret.addEventListener('pointerdown', (e) => { e.preventDefault(); saveRange(); });
      main.addEventListener('click', () => app.exec(id, last));
      caret.addEventListener('click', () => colorPicker(caret, last, (v) => { last = v; paint(); restoreRange(); app.exec(id, v); }, { allowNone: id === 'text.highlight', title: label }));
      const paint = () => { bar.style.background = last && last !== 'transparent' ? resolveColor(app.doc, last) : 'transparent'; };
      paint();
      el.append(h('div', { class: 'rb-split' }, main, caret));
      return { update(ctx) { main.disabled = caret.disabled = !textSel(ctx); paint(); } };
    }
  };
}

// Ribbon buttons must not steal focus from the text being edited.
document.addEventListener('mousedown', (e) => {
  if (editing() && e.target.closest && e.target.closest('#ribbon .rb, .menu-item')) e.preventDefault();
}, true);

const fontGroup = [
  fontControls(),
  { command: 'text.grow', size: 'icon' }, { command: 'text.shrink', size: 'icon' }, { command: 'text.clear', size: 'icon' },
  { command: 'text.bold', size: 'icon' }, { command: 'text.italic', size: 'icon' }, { command: 'text.underline', size: 'icon' },
  { command: 'text.strike', size: 'icon' }, { command: 'text.sub', size: 'icon' }, { command: 'text.sup', size: 'icon' },
  colorButton('text.color', 'Font Colour', 'font-color', () => '#c0392b'),
  colorButton('text.highlight', 'Text Highlight Colour', 'highlight', () => '#fff176'),
  { type: 'menu', label: 'Case', icon: 'change-case', size: 'icon', items: () => [
    { label: 'UPPERCASE', command: 'text.case', arg: 'uppercase' }, { label: 'lowercase', command: 'text.case', arg: 'lowercase' },
    { label: 'Capitalise Each Word', command: 'text.case', arg: 'capitalize' }, { label: 'Normal case', command: 'text.case', arg: 'none' }] },
  { type: 'menu', label: 'Spacing', icon: 'char-spacing', size: 'icon', items: () => [
    { label: 'Very tight', command: 'text.spacing', arg: -1.5 }, { label: 'Tight', command: 'text.spacing', arg: -0.75 }, { label: 'Normal', command: 'text.spacing', arg: 0 },
    { label: 'Loose', command: 'text.spacing', arg: 1.5 }, { label: 'Very loose', command: 'text.spacing', arg: 3 }] }
];
const paraGroup = [
  { command: 'text.bullets', size: 'icon' }, { command: 'text.numbering', size: 'icon' }, { command: 'text.outdent', size: 'icon' }, { command: 'text.indent', size: 'icon' },
  { command: 'text.align-left', size: 'icon' }, { command: 'text.align-center', size: 'icon' }, { command: 'text.align-right', size: 'icon' }, { command: 'text.align-justify', size: 'icon' },
  { type: 'menu', label: 'Line Spacing', icon: 'line-spacing', size: 'icon', items: () => [
    ...[1, 1.15, 1.25, 1.5, 2, 2.5, 3].map((v) => ({ label: String(v), command: 'text.lineSpacing', arg: v, checked: !!state && state.lineHeight === v })), '-',
    { label: 'Paragraph Options…', command: 'text.paragraph' }] }
];
const stylesGroup = [{ type: 'menu', label: 'Styles', icon: 'styles', size: 'large', items: () => Object.entries(STYLES).map(([id, s]) => ({ label: s.label, command: 'text.style', arg: id })) }];

registry.group({ tab: 'home', id: 'font', label: 'Font', order: 20, items: fontGroup });
registry.group({ tab: 'home', id: 'paragraph', label: 'Paragraph', order: 30, items: paraGroup });
registry.group({ tab: 'home', id: 'styles', label: 'Styles', order: 40, items: stylesGroup });

registry.group({ tab: 'textFormat', id: 'font', label: 'Font', order: 10, items: fontGroup });
registry.group({ tab: 'textFormat', id: 'paragraph', label: 'Paragraph', order: 15, items: paraGroup });
registry.group({ tab: 'textFormat', id: 'fit', label: 'Text', order: 20, items: [
  { type: 'menu', label: 'Text Fit', icon: 'text-fit', size: 'large', items: () => [
    { label: 'Best Fit', command: 'text.bestFit' },
    { label: 'Shrink Text On Overflow', command: 'text.autofit', arg: 'shrink' },
    { label: 'Grow Text Box to Fit', command: 'text.autofit', arg: 'grow' },
    { label: 'Do Not Autofit', command: 'text.autofit', arg: 'none' }] },
  { type: 'menu', label: 'Align', icon: 'va-middle', size: 'small', items: () => [
    { label: 'Top', command: 'text.valign', arg: 'top' }, { label: 'Middle', command: 'text.valign', arg: 'middle' }, { label: 'Bottom', command: 'text.valign', arg: 'bottom' }] },
  { command: 'text.margins', size: 'small', label: 'Margins' }, { command: 'text.columns', size: 'small' }
] });
registry.group({ tab: 'textFormat', id: 'linking', label: 'Linking', order: 30, items: [
  { command: 'text.createLink', size: 'large' }, { command: 'text.breakLink', size: 'small' },
  { command: 'text.prevFrame', size: 'small' }, { command: 'text.nextFrame', size: 'small' }
] });
registry.group({ tab: 'insert', id: 'links', label: 'Links', order: 40, items: [{ command: 'text.link', size: 'large', label: 'Link' }] });
registry.group({ tab: 'insert', id: 'headerFooter', label: 'Header & Footer', order: 50, items: [
  { command: 'text.field-page', size: 'small' }, { command: 'text.field-pages', size: 'small' }, { command: 'text.field-date', size: 'small' }
] });
registry.group({ tab: 'insert', id: 'symbols', label: 'Symbols', order: 60, items: [{ command: 'text.symbol', size: 'large' }] });

// ---------------------------------------------------------------- inspector
registry.inspector({
  id: 'textbox', title: 'Text Box', order: 15,
  when: (ctx) => (ctx.selection || []).length > 0 && (ctx.selection || []).every((e) => e.type === 'text'),
  render(body) {
    const unit = () => (app.doc ? app.doc.setup.units : 'in');
    const fit = selectField({ options: [{ value: 'none', label: 'Do not autofit' }, { value: 'shrink', label: 'Shrink text on overflow' }, { value: 'grow', label: 'Grow box to fit' }], onChange: (v) => onFrames('Text Fit', (el) => { el.autofit = v; }) });
    const va = segmented({ options: [{ value: 'top', text: 'Top', label: 'Top' }, { value: 'middle', text: 'Middle', label: 'Middle' }, { value: 'bottom', text: 'Bottom', label: 'Bottom' }], onChange: (v) => onFrames('Vertical Alignment', (el) => { el.valign = v; }) });
    const pad = lengthField({ unit, min: 0, onChange: (v) => onFrames('Text Box Margins', (el) => { el.padding = { top: v, right: v, bottom: v, left: v }; }) });
    const cols = numberField({ min: 1, max: 8, integer: true, onChange: (v) => onFrames('Columns', (el) => { el.columns = v; }) });
    const size = numberField({ suffix: 'pt', min: 1, max: 999, onChange: (v) => onFrames('Font Size', (el) => { el.style = { ...el.style, size: v }; }) });
    const color = colorField({ title: 'Default text colour', allowNone: false, onChange: (v) => onFrames('Text Colour', (el) => { el.style = { ...el.style, color: v }; }) });
    const link = h('div', { class: 'ins-hint' });
    body.append(row('Fit', fit.el), row('Vertical', va.el), row('Margins', pad.el), row('Columns', cols.el), row('Base size', size.el), row('Base colour', color.el), link);
    return {
      update(ctx) {
        const f = ctx.selection[0];
        fit.set(f.autofit || 'none'); va.set(f.valign || 'top'); pad.set(f.padding ? f.padding.top : 4); cols.set(f.columns || 1);
        size.set(f.style.size); color.set(f.style.color);
        const ch = getChain(ctx.doc, f.id);
        link.textContent = ch.length > 1 ? `Linked story: box ${ch.findIndex((x) => x.id === f.id) + 1} of ${ch.length}.` : 'Double-click to edit text. Use Create Link to continue the story in another box.';
      }
    };
  }
});
