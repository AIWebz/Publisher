// File > New: template gallery (built-in catalogue + My Templates + blank sizes), live thumbnails,
// colour/font scheme choice, Save as Template.

import { app } from '../../core/app.js';
import { registry } from '../../core/registry.js';
import { h } from '../../core/ui/dom.js';
import { icon } from '../../core/ui/icons.js';
import { renderThumb } from '../../core/render/thumbs.js';
import { createDocument, PAGE_SIZES, allElements, getChain } from '../../core/model.js';
import { layoutStories } from '../../engines/text/flow.js';
import { COLOR_SCHEMES, FONT_SCHEMES } from '../../core/theme.js';
import { CATEGORIES, TEMPLATES } from '../../engines/templates/catalog.js';
import { createTemplateRecord, docFromTemplate, searchTemplates, MY_TEMPLATES } from '../../engines/templates/custom.js';
import { listCustomTemplates, saveCustomTemplate, deleteCustomTemplate } from './store.js';
import './gallery.css';
import { plural } from '../../core/i18n.js';

const BLANKS = ['letter', 'a4', 'a5', 'halfLetter', 'tabloid', 'legal', 'businessCard', 'postcard', 'card5x7', 'square8', 'envelope10', 'certificate'];
const docCache = new Map();
/** Make template text fit its frames with the bundled fonts: grow slightly short frames, shrink the rest. */
export function fitTemplateText(doc) {
  let lay;
  try { lay = layoutStories(doc, {}); } catch { return doc; }
  for (const el of allElements(doc, 'text')) {
    const v = lay.get(el.id);
    if (!v || !v.overflow || el.autofit !== 'none' && el.autofit) continue;
    if (getChain(doc, el.id).length > 1) {
      // last frame of a linked story: grow down to the bottom margin if that is enough room
      const room = doc.setup.height - doc.setup.margins.bottom - el.y;
      if (v.contentHeight && v.contentHeight <= room) el.h = Math.ceil(v.contentHeight + 2);
      continue;
    }
    const need = v.contentHeight;
    if (need && need <= el.h * 1.35) el.h = Math.ceil(need + 2);
    else el.autofit = 'shrink';
  }
  return doc;
}
const builtDoc = (t) => { if (!docCache.has(t.id)) docCache.set(t.id, fitTemplateText(t.build())); return docCache.get(t.id); };

function openDoc(doc) {
  app.addSession(doc);
  if (app.ui.backstage) app.ui.backstage.close();
  setTimeout(() => app.canvas && app.canvas.fitPage(), 30);
}

function thumbFor(doc, w = 168, hgt = 168) {
  const box = h('div', { class: 'tg-thumb' });
  const sheet = h('div', { class: 'tg-sheet' });
  box.appendChild(sheet);
  requestAnimationFrame(() => { try { renderThumb(sheet, doc, doc.pages[0], { width: w, height: hgt, pageIndex: 0 }); } catch (err) { sheet.textContent = '—'; console.error(err); } });
  return box;
}

registry.backstage({
  id: 'new', label: 'New', icon: 'new', order: 10,
  render(page) {
    let cat = 'featured';
    let query = '';
    let custom = [];
    let picked = null;
    const scheme = { color: '', font: '' };

    const side = h('nav', { class: 'tg-cats' });
    const grid = h('div', { class: 'tg-grid' });
    const detail = h('aside', { class: 'tg-detail' });
    const search = h('input', { class: 'field tg-search', type: 'search', placeholder: 'Search templates', 'aria-label': 'Search templates' });
    search.addEventListener('input', () => { query = search.value; cat = query ? 'all' : 'featured'; drawCats(); drawGrid(); });

    const cats = [{ id: 'featured', name: 'Featured' }, { id: 'blank', name: 'Blank sizes' }, ...CATEGORIES.filter((c) => c.id !== 'blank'), { id: MY_TEMPLATES, name: 'My Templates' }];
    function drawCats() {
      side.replaceChildren(...cats.map((c) => h('button', { type: 'button', class: `tg-cat${cat === c.id ? ' on' : ''}`, onclick: () => { cat = c.id; query = ''; search.value = ''; drawCats(); drawGrid(); } },
        h('span', { text: c.name }), h('em', { text: String(count(c.id)) }))));
    }
    const count = (id) => (id === 'featured' ? featured().length : id === 'blank' ? BLANKS.length : id === MY_TEMPLATES ? custom.length : TEMPLATES.filter((t) => t.category === id).length);
    const featured = () => CATEGORIES.filter((c) => c.id !== 'blank').map((c) => TEMPLATES.find((t) => t.category === c.id)).filter(Boolean);

    function card(item) {
      const el = h('button', { type: 'button', class: 'tg-card', onclick: () => select(item), ondblclick: () => create(item) },
        item.kind === 'blank' ? blankThumb(item) : thumbFor(item.doc()), h('div', { class: 'tg-name', text: item.name }), h('div', { class: 'tg-meta', text: item.meta }));
      if (picked && picked.key === item.key) el.classList.add('on');
      return el;
    }
    function blankThumb(item) {
      const s = PAGE_SIZES[item.size];
      const k = Math.min(150 / s.w, 150 / s.h);
      return h('div', { class: 'tg-thumb' }, h('div', { class: 'tg-sheet tg-blank', style: { width: `${s.w * k}px`, height: `${s.h * k}px` } }));
    }
    function items() {
      if (cat === 'blank') return BLANKS.map((k) => ({ key: `blank:${k}`, kind: 'blank', size: k, name: PAGE_SIZES[k].name, meta: 'Blank publication' }));
      if (cat === MY_TEMPLATES) return custom.map((r) => ({ key: `mine:${r.id}`, kind: 'mine', record: r, name: r.name, meta: r.sizeLabel || 'My template', description: r.description, doc: () => docFromTemplate(r) }));
      let list = cat === 'featured' ? featured() : cat === 'all' ? TEMPLATES : TEMPLATES.filter((t) => t.category === cat);
      if (query) list = searchTemplates(TEMPLATES, query, Object.fromEntries(CATEGORIES.map((c) => [c.id, c.name])));
      return list.map((t) => ({ key: `tpl:${t.id}`, kind: 'tpl', tpl: t, name: t.name, meta: t.sizeLabel || '', description: t.description, doc: () => builtDoc(t) }));
    }
    function drawGrid() {
      const list = items();
      grid.replaceChildren(...(list.length ? list.map(card) : [h('p', { class: 'tg-empty', text: cat === MY_TEMPLATES ? 'No templates yet. Open a publication and choose File › Save as Template.' : 'No templates match your search.' })]));
    }
    function select(item) {
      picked = item;
      grid.querySelectorAll('.tg-card').forEach((c, i) => c.classList.toggle('on', items()[i] && items()[i].key === item.key));
      const colorSel = h('select', { class: 'field' }, h('option', { value: '', text: 'Template default' }), ...Object.entries(COLOR_SCHEMES).map(([id, s]) => h('option', { value: id, text: s.name })));
      const fontSel = h('select', { class: 'field' }, h('option', { value: '', text: 'Template default' }), ...Object.entries(FONT_SCHEMES).map(([id, s]) => h('option', { value: id, text: `${s.name} (${s.heading} / ${s.body})` })));
      colorSel.value = scheme.color; fontSel.value = scheme.font;
      colorSel.onchange = () => { scheme.color = colorSel.value; };
      fontSel.onchange = () => { scheme.font = fontSel.value; };
      const preview = item.kind === 'blank' ? blankThumb(item) : thumbFor(item.doc(), 260, 300);
      const pages = item.kind === 'blank' ? 1 : item.doc().pages.length;
      const actions = [h('button', { type: 'button', class: 'btn btn-primary', text: 'Create', onclick: () => create(item) })];
      if (item.kind === 'mine') actions.push(h('button', { type: 'button', class: 'btn', text: 'Delete', onclick: async () => {
        if (!(await app.ui.confirm('Delete template?', `Delete “${item.name}” from My Templates?`, 'Delete'))) return;
        await deleteCustomTemplate(item.record.id); custom = await listCustomTemplates(); picked = null; detail.replaceChildren(); drawCats(); drawGrid();
      } }));
      detail.replaceChildren(h('div', { class: 'tg-preview' }, preview), h('h3', { text: item.name }), h('p', { class: 'tg-desc', text: item.description || item.meta }),
        h('p', { class: 'tg-meta', text: plural(pages, '{n} page', '{n} pages') }),
        item.kind === 'blank' ? null : h('label', { class: 'tg-opt' }, h('span', { text: 'Colour scheme' }), colorSel),
        item.kind === 'blank' ? null : h('label', { class: 'tg-opt' }, h('span', { text: 'Font scheme' }), fontSel),
        h('div', { class: 'tg-actions' }, ...actions));
    }
    function create(item) {
      if (item.kind === 'blank') { openDoc(createDocument({ size: item.size, title: 'Untitled publication' })); return; }
      const src = item.kind === 'mine' ? item.record : builtDoc(item.tpl);
      const doc = docFromTemplate(src, { schemeId: scheme.color || undefined, fontSchemeId: scheme.font || undefined });
      openDoc(doc);
    }

    page.classList.add('tg-page');
    page.append(h('header', { class: 'tg-head' }, h('div', {}, h('h1', { text: 'New publication' }), h('p', { class: 'bs-sub', text: 'Start from a template or a blank page. Every template is fully editable.' })), search),
      h('div', { class: 'tg-body' }, side, grid, detail));
    drawCats(); drawGrid();
    listCustomTemplates().then((list) => { custom = list || []; drawCats(); if (cat === MY_TEMPLATES) drawGrid(); }).catch(() => {});
  }
});

registry.command({
  id: 'file.saveTemplate', label: 'Save as Template…', icon: 'save-as',
  enabled: (ctx) => !!ctx.doc,
  run: async () => {
    app.flush();
    const doc = app.doc;
    const r = await app.ui.dialog({
      title: 'Save as Template',
      fields: [
        { name: 'name', label: 'Template name', type: 'text', value: doc.title || 'My template' },
        { name: 'category', label: 'Category', type: 'select', value: MY_TEMPLATES, options: [{ value: MY_TEMPLATES, label: 'My Templates' }, ...CATEGORIES.filter((c) => c.id !== 'blank').map((c) => ({ value: c.id, label: c.name }))] },
        { name: 'description', label: 'Description', type: 'textarea', value: '' }
      ],
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Save', value: 'ok', primary: true }]
    });
    if (!r || r.button !== 'ok') return;
    await saveCustomTemplate(createTemplateRecord(doc, { name: r.values.name, category: r.values.category, description: r.values.description }));
    app.ui.toast(`Saved “${r.values.name}” to My Templates`);
  }
});
registry.backstage({ id: 'saveTemplate', label: 'Save as Template', icon: 'save-as', order: 34, command: 'file.saveTemplate' });
