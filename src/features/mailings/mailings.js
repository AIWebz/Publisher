// Mailings: recipients (import CSV/TSV/XLSX/ODS or type a list), Edit Recipient List (edit, include/exclude,
// sort, filter), merge fields, address block / greeting line, preview results, Finish & Merge.

import { app } from '../../core/app.js';
import { registry } from '../../core/registry.js';
import { createTextFrame, clone } from '../../core/model.js';
import { h } from '../../core/ui/dom.js';
import * as MM from '../../engines/mailmerge/index.js';
import { fieldSpan } from '../../engines/text/fields.js';
import * as rt from '../../engines/text/richtext.js';
import { exportPDF, printDocument } from '../../engines/export/index.js';
import { exportRenderer } from '../output/output.js';
import './mailings.css';
import { plural } from '../../core/i18n.js';

const hasData = (ctx) => !!(ctx.doc && ctx.doc.data && ctx.doc.data.columns && ctx.doc.data.columns.length);
const hasDoc = (ctx) => !!ctx.doc;
let previewOn = false;

function pickDataFile() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: '.csv,.tsv,.txt,.xlsx,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet', style: { display: 'none' } });
    input.addEventListener('change', () => { resolve(input.files[0] || null); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}

// ---------------------------------------------------------------- recipients
registry.command({
  id: 'mail.import', label: 'Use an Existing List…', icon: 'open', enabled: hasDoc,
  run: async (ctx, given) => {
    const file = given && typeof given.arrayBuffer === 'function' ? given : await pickDataFile();
    if (!file) return;
    let res;
    try { res = await MM.importFile(file.name, await file.arrayBuffer()); } catch (err) { app.ui.alert ? app.ui.alert('Could not read the list', err.message || String(err)) : app.ui.toast(err.message || String(err)); return; }
    let sheet = res.sheets[0];
    const usable = res.sheets.filter((s) => s.columns.length);
    if (usable.length > 1) {
      const r = await app.ui.dialog({ title: 'Choose a Sheet', fields: [{ name: 's', label: `${file.name} has several sheets`, type: 'select', value: '0', options: usable.map((s, i) => ({ value: String(i), label: `${s.name} (${s.rows.length} rows)` })) }],
        buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'OK', value: 'ok', primary: true }] });
      if (!r || r.button !== 'ok') return;
      sheet = usable[+r.values.s];
    }
    if (!sheet || !sheet.columns.length) { app.ui.toast('That file has no data.'); return; }
    app.transact('Select Recipients', (doc) => { doc.data = MM.createMergeData(file.name, sheet.columns, sheet.rows); });
    app.ui.toast(`${sheet.rows.length} recipients imported from ${file.name}`);
  }
});
registry.command({
  id: 'mail.newList', label: 'Type a New List…', icon: 'table', enabled: hasDoc,
  run: async () => {
    const r = await app.ui.dialog({ title: 'New Recipient List', fields: [{ name: 'cols', label: 'Columns (comma separated)', type: 'text', value: 'First Name, Last Name, Company, Address, City, State, ZIP, Email' }],
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Create', value: 'ok', primary: true }] });
    if (!r || r.button !== 'ok') return;
    const cols = String(r.values.cols).split(',').map((s) => s.trim()).filter(Boolean);
    if (!cols.length) return;
    app.transact('New Recipient List', (doc) => { doc.data = MM.createMergeData('Typed list', cols, [cols.map(() => '')]); });
    app.exec('mail.edit');
  }
});
registry.command({ id: 'mail.clear', label: 'Remove Recipient List', icon: 'trash', enabled: hasData, run: () => { previewOn = false; app.previewRecord = null; app.transact('Remove Recipients', (doc) => { doc.data = null; }); } });

registry.command({
  id: 'mail.edit', label: 'Edit Recipient List', icon: 'table', enabled: hasData,
  run: async () => {
    const work = MM.cloneMergeData(app.doc.data);
    const renames = {};
    let find = '';
    const body = h('div', { class: 'mm-editor' });
    const toolbar = h('div', { class: 'mm-toolbar' });
    const gridWrap = h('div', { class: 'mm-grid-wrap' });
    const status = h('div', { class: 'mm-status' });
    const filtersBox = h('div', { class: 'mm-filters' });
    const btn = (label, fn) => h('button', { type: 'button', class: 'btn sm', text: label, onclick: fn });
    const findInput = h('input', { class: 'field mm-find', placeholder: 'Find recipient…', type: 'search' });
    findInput.addEventListener('input', () => { find = findInput.value.toLowerCase(); draw(); });
    toolbar.append(btn('Add Row', () => { MM.addRow(work); draw(true); }), btn('Add Column', async () => {
      const n = await app.ui.prompt('Add Column', 'Column name', 'New column');
      if (n && n.trim()) { MM.addColumn(work, n.trim()); draw(); }
    }), btn('Add Filter', () => { work.filters = [...(work.filters || []), { column: work.columns[0], op: 'contains', value: '' }]; drawFilters(); draw(); }),
    btn('Clear Sort', () => { MM.setSort(work, []); draw(); }), findInput);

    function drawFilters() {
      filtersBox.replaceChildren(...(work.filters || []).map((f, i) => {
        const col = h('select', { class: 'field' }, ...work.columns.map((c) => h('option', { value: c, text: c })));
        col.value = f.column;
        const op = h('select', { class: 'field' }, ...MM.FILTER_OPS.map((o) => h('option', { value: o.id || o.value || o.op, text: o.label })));
        op.value = f.op;
        const val = h('input', { class: 'field', value: f.value || '' });
        const apply = () => { const list = [...work.filters]; list[i] = { column: col.value, op: op.value, value: val.value }; MM.setFilters(work, list); draw(); };
        col.onchange = apply; op.onchange = apply; val.oninput = apply;
        return h('div', { class: 'mm-filter' }, col, op, val, h('button', { type: 'button', class: 'btn sm btn-ghost', text: 'Remove', onclick: () => { MM.setFilters(work, work.filters.filter((_, j) => j !== i)); drawFilters(); draw(); } }));
      }));
    }
    function draw(scrollEnd) {
      const view = MM.viewIndices(work, { includeExcluded: true });
      const shown = find ? view.filter((r) => work.rows[r].some((v) => String(v).toLowerCase().includes(find))) : view;
      const sortOf = (c) => (work.sort || []).find((s) => s.column === c);
      const head = h('tr', {}, h('th', { class: 'mm-inc', text: '✓' }), ...work.columns.map((c) => {
        const s = sortOf(c);
        const th = h('th', {}, h('span', { text: c + (s ? (s.dir === 'asc' ? ' ▲' : ' ▼') : '') }));
        th.title = 'Click to sort · double-click to rename · right-click to delete';
        th.addEventListener('click', () => { const cur = sortOf(c); MM.setSort(work, [{ column: c, dir: cur && cur.dir === 'asc' ? 'desc' : 'asc' }]); draw(); });
        th.addEventListener('dblclick', async () => {
          const n = await app.ui.prompt('Rename Column', 'New name', c);
          if (n && n.trim() && n.trim() !== c) { const res = MM.renameColumn(work, c, n.trim()); if (res) Object.assign(renames, res.map); draw(); drawFilters(); }
        });
        th.addEventListener('contextmenu', async (e) => {
          e.preventDefault();
          if (await app.ui.confirm('Delete column?', `Delete the column “${c}” and its data?`, 'Delete')) { MM.deleteColumn(work, c); draw(); drawFilters(); }
        });
        return th;
      }), h('th', {}));
      const excluded = new Set(work.excluded || []);
      const rows = shown.map((r) => h('tr', { class: excluded.has(r) ? 'mm-excl' : '' },
        h('td', { class: 'mm-inc' }, (() => { const cb = h('input', { type: 'checkbox', checked: !excluded.has(r) }); cb.onchange = () => { MM.toggleExcluded(work, r, !cb.checked); draw(); }; return cb; })()),
        ...work.columns.map((c, ci) => { const inp = h('input', { class: 'mm-cell', value: work.rows[r][ci] ?? '' }); inp.onchange = () => { MM.setCell(work, r, ci, inp.value); }; return h('td', {}, inp); }),
        h('td', {}, h('button', { type: 'button', class: 'mm-del', title: 'Delete row', text: '×', onclick: () => { MM.deleteRow(work, r); draw(); } }))));
      gridWrap.replaceChildren(h('table', { class: 'mm-grid' }, h('thead', {}, head), h('tbody', {}, ...rows)));
      const included = MM.viewIndices(work).length;
      status.textContent = `${included} of ${work.rows.length} recipients included in the merge${(work.filters || []).length ? ' (filtered)' : ''}`;
      if (scrollEnd) gridWrap.scrollTop = gridWrap.scrollHeight;
    }
    body.append(toolbar, filtersBox, gridWrap, status);
    drawFilters(); draw();
    const r = await app.ui.dialog({ title: `Recipients — ${work.name || 'list'}`, body, width: 980, buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'OK', value: 'ok', primary: true }] });
    if (!r || r.button !== 'ok') return;
    app.transact('Edit Recipient List', (doc) => {
      doc.data = work;
      if (Object.keys(renames).length) MM.renameFieldsInDocument(doc, renames);
    });
    refreshPreview();
  }
});

// ---------------------------------------------------------------- fields
function insertHtmlField(html, label) {
  if (app.editing && app.editing.root) {
    app.editing.root.focus();
    document.execCommand('insertHTML', false, html);
    if (app.textEdit) app.textEdit.commit();
    return;
  }
  app.transact(label, (doc) => {
    const f = createTextFrame(doc, { x: doc.setup.width / 2 - 150, y: doc.setup.height / 2 - 40, w: 300, h: 90, style: { font: '@body', size: 12, color: '@ink' } }, `<p>${html}</p>`);
    app.page.elements.push(f);
    app.select([f.id]);
  });
}
registry.command({
  id: 'mail.field', label: 'Insert Merge Field', icon: 'mail', enabled: hasData, allowInText: true,
  run: (ctx, name) => {
    if (!name) return;
    if (app.editing && app.editing.root) { rt.insertField(app.editing.root, name); if (app.textEdit) app.textEdit.commit(); return; }
    insertHtmlField(fieldSpan(name), 'Insert Merge Field');
  }
});
registry.command({
  id: 'mail.addressBlock', label: 'Address Block', icon: 'mail', enabled: hasData, allowInText: true,
  run: () => {
    const m = MM.guessFieldMapping(app.doc.data.columns);
    const line = (...keys) => keys.map((k) => m[k]).filter(Boolean).map((c) => fieldSpan(c)).join(' ');
    const lines = [m.fullName ? fieldSpan(m.fullName) : line('title', 'firstName', 'lastName'), line('company'), line('address1'), line('address2'),
      [m.city && fieldSpan(m.city), [m.state && fieldSpan(m.state), m.postalCode && fieldSpan(m.postalCode)].filter(Boolean).join(' ')].filter(Boolean).join(', '), line('country')].filter((l) => l && l.trim());
    if (!lines.length) { app.ui.toast('No address columns found. Insert fields one by one instead.'); return; }
    insertHtmlField(lines.join('<br>'), 'Address Block');
  }
});
registry.command({
  id: 'mail.greeting', label: 'Greeting Line', icon: 'mail', enabled: hasData, allowInText: true,
  run: () => {
    const m = MM.guessFieldMapping(app.doc.data.columns);
    const name = m.firstName ? fieldSpan(m.firstName) : m.fullName ? fieldSpan(m.fullName) : '';
    insertHtmlField(`Dear ${name || 'Friend'},`, 'Greeting Line');
  }
});
registry.command({
  id: 'mail.highlight', label: 'Highlight Merge Fields', icon: 'sparkle', global: true,
  checked: () => !document.body.classList.contains('no-field-highlight'),
  run: () => document.body.classList.toggle('no-field-highlight')
});

// ---------------------------------------------------------------- preview
function viewPos() { const d = app.doc && app.doc.data; return d ? Math.max(0, d.current || 0) : 0; }
function refreshPreview() {
  const d = app.doc && app.doc.data;
  const rec = previewOn && d ? MM.recordAt(d, viewPos()) : null;
  app.previewRecord = rec ? rec.values : null;
  if (app.canvas) app.canvas.requestRender();
  if (app.ribbon && app.ribbon.update) app.ribbon.update();
}
registry.command({ id: 'mail.preview', label: 'Preview Results', icon: 'eye', enabled: hasData, checked: () => previewOn, run: () => { previewOn = !previewOn; refreshPreview(); } });
const go = (fn) => () => { const d = app.doc.data; const n = MM.viewIndices(d).length; if (!n) return; const p = Math.max(0, Math.min(n - 1, fn(viewPos(), n))); app.doc.data.current = p; previewOn = true; refreshPreview(); };
registry.command({ id: 'mail.first', label: 'First Record', icon: 'first-page', enabled: hasData, run: go(() => 0) });
registry.command({ id: 'mail.prev', label: 'Previous Record', icon: 'chevron-left', enabled: hasData, run: go((p) => p - 1) });
registry.command({ id: 'mail.next', label: 'Next Record', icon: 'chevron-right', enabled: hasData, run: go((p) => p + 1) });
registry.command({ id: 'mail.last', label: 'Last Record', icon: 'last-page', enabled: hasData, run: go((p, n) => n - 1) });
app.on('session', () => { previewOn = false; app.previewRecord = null; });
app.on('doc-change', () => { if (previewOn) { const d = app.doc && app.doc.data; const rec = d ? MM.recordAt(d, viewPos()) : null; app.previewRecord = rec ? rec.values : null; } });

function recordNav() {
  return {
    type: 'custom', className: 'mm-nav',
    render(el) {
      const label = h('span', { class: 'mm-pos' });
      el.append(label);
      return {
        update(ctx) {
          const d = ctx.doc && ctx.doc.data;
          if (!d || !d.columns) { label.textContent = 'No recipients'; return; }
          const n = MM.viewIndices(d).length;
          label.textContent = n ? `Record ${Math.min(viewPos(), n - 1) + 1} of ${n}` : 'No records included';
        }
      };
    }
  };
}

// ---------------------------------------------------------------- finish & merge
const records = () => { const d = app.doc.data; return MM.viewIndices(d).map((i) => MM.rowValues(d, i)); };
function warnMissing() {
  const fields = MM.listDocumentFields(app.doc).filter((f) => !f.startsWith('#'));
  const missing = fields.filter((f) => !app.doc.data.columns.includes(f));
  if (missing.length) app.ui.toast(`These fields are not in the recipient list and will be blank: ${missing.join(', ')}`);
}
registry.command({
  id: 'mail.mergeNew', label: 'Merge to New Publication', icon: 'new', enabled: hasData,
  run: () => {
    app.flush(); warnMissing();
    const doc = app.doc;
    const n = MM.viewIndices(doc.data).length;
    if (!n) { app.ui.toast('No recipients are included.'); return; }
    const pi = app.pageIndex;
    const slots = MM.findSheetSlots(doc, pi);
    let merged;
    if (slots && slots.count > 1) {
      const res = MM.fillSheetFromRecords(doc, pi, doc.data, {});
      merged = res.doc;
      app.ui.toast(res.sheets === 1 ? `Filled 1 sheet with ${res.records} records` : `Filled ${res.sheets} sheets with ${res.records} records`);
    } else {
      merged = MM.buildMergedPublication(doc, doc.data, {});
      app.ui.toast(plural(n, 'Created {n} personalised copy', 'Created {n} personalised copies'));
    }
    merged.title = `${doc.title} (merged)`;
    app.addSession(merged);
  }
});
registry.command({
  id: 'mail.pdf', label: 'Merge to PDF', icon: 'export', enabled: hasData,
  run: async (ctx, perRecord) => {
    app.flush(); warnMissing();
    const doc = app.doc;
    const recs = records();
    if (!recs.length) { app.ui.toast('No recipients are included.'); return; }
    try {
      const r = await exportPDF(doc, exportRenderer(doc), { records: recs, perRecordFiles: !!perRecord, fileName: doc.title,
        recordName: (rec, i) => Object.values(rec).filter(Boolean).slice(0, 2).join(' ') || `Record ${i + 1}` }, app.platform);
      if (r) app.ui.toast(r.folder ? `Saved ${r.count} PDFs to ${r.folder}` : r.viaPrintDialog ? 'Choose “Save as PDF” in the print dialog.' : `Saved ${r.name}`);
    } catch (err) { app.ui.toast(`Merge failed: ${err.message || err}`); }
  }
});
registry.command({
  id: 'mail.print', label: 'Print Merged', icon: 'print', enabled: hasData,
  run: async () => {
    app.flush();
    const recs = records();
    if (!recs.length) { app.ui.toast('No recipients are included.'); return; }
    await printDocument(app.doc, exportRenderer(app.doc), { records: recs, copies: 1 }, app.platform);
  }
});

// ---------------------------------------------------------------- ribbon
registry.group({ tab: 'mailings', id: 'start', label: 'Start', order: 10, items: [
  { type: 'menu', label: 'Select Recipients', icon: 'mail', size: 'large', items: () => [
    { label: 'Use an Existing List… (CSV, Excel, OpenDocument)', command: 'mail.import' }, { label: 'Type a New List…', command: 'mail.newList' },
    '-', { label: 'Remove Recipient List', command: 'mail.clear' }] },
  { command: 'mail.edit', size: 'large', label: 'Edit Recipients' }
] });
registry.group({ tab: 'mailings', id: 'fields', label: 'Write & Insert Fields', order: 20, items: [
  { command: 'mail.highlight', size: 'small' }, { command: 'mail.addressBlock', size: 'small' }, { command: 'mail.greeting', size: 'small' },
  { type: 'menu', label: 'Insert Merge Field', icon: 'mail', size: 'large', items: () => (app.doc && app.doc.data ? app.doc.data.columns.map((c) => ({ label: c, command: 'mail.field', arg: c })) : [{ label: 'Select recipients first', disabled: true }]) }
] });
registry.group({ tab: 'mailings', id: 'preview', label: 'Preview Results', order: 30, items: [
  { command: 'mail.preview', size: 'large' },
  { command: 'mail.first', size: 'icon' }, { command: 'mail.prev', size: 'icon' }, { command: 'mail.next', size: 'icon' }, { command: 'mail.last', size: 'icon' },
  recordNav()
] });
registry.group({ tab: 'mailings', id: 'finish', label: 'Finish', order: 40, items: [
  { type: 'menu', label: 'Finish & Merge', icon: 'sparkle', size: 'large', items: () => [
    { label: 'Merge to New Publication', command: 'mail.mergeNew' },
    { label: 'Merge to a Single PDF…', command: 'mail.pdf', arg: false },
    { label: 'Merge to One PDF per Recipient…', command: 'mail.pdf', arg: true, disabled: !app.platform.isDesktop },
    { label: 'Print Merged…', command: 'mail.print' }] }
] });
void clone;
