// File > Export (PDF / PNG / JPEG) and File > Print (live preview, paper, layout, copies, duplex).

import { app } from '../../core/app.js';
import { registry } from '../../core/registry.js';
import { h } from '../../core/ui/dom.js';
import { icon } from '../../core/ui/icons.js';
import { renderPage } from '../../core/render/index.js';
import { exportPDF, exportImages, printDocument, buildPreview, parsePageRange, PAPER_SIZES } from '../../engines/export/index.js';
import './output.css';
import { plural } from '../../core/i18n.js';

/** renderPage adapter for the export engine. */
export function exportRenderer(doc) {
  return (container, pageIndex, opts = {}) => renderPage(container, doc, doc.pages[pageIndex], { mode: 'export', pageIndex, record: opts.record || null });
}

const field = (label, control, hint) => h('label', { class: 'out-field' }, h('span', { class: 'out-label', text: label }), control, hint ? h('small', { text: hint }) : null);
const select = (opts, value) => { const s = h('select', { class: 'field' }, ...opts.map(([v, l]) => h('option', { value: v, text: l }))); s.value = value; return s; };
const input = (value, attrs = {}) => h('input', { class: 'field', value: String(value), ...attrs });
const check = (label, on = false) => { const i = h('input', { type: 'checkbox', checked: on }); return { el: h('label', { class: 'check' }, i, h('span', { text: label })), get: () => i.checked, input: i }; };

function rangeControls(doc) {
  const mode = select([['all', 'All pages'], ['current', 'Current page'], ['custom', 'Custom range']], 'all');
  const custom = input('', { placeholder: `e.g. 1-3, 5 (of ${doc.pages.length})`, hidden: true });
  mode.addEventListener('change', () => { custom.hidden = mode.value !== 'custom'; });
  return {
    els: [field('Pages', mode), custom],
    value: () => (mode.value === 'all' ? 'all' : mode.value === 'current' ? String(app.pageIndex + 1) : custom.value.trim() || 'all'),
    onChange: (fn) => { mode.addEventListener('change', fn); custom.addEventListener('input', fn); }
  };
}

function layoutControls(doc, { forPrint = false } = {}) {
  const paperOpts = [['page', 'Same as page size'], ...Object.entries(PAPER_SIZES).map(([k, s]) => [k, s.name])];
  const paper = select(paperOpts, forPrint ? 'letter' : 'page');
  const mode = select([['single', 'One page per sheet'], ['repeat', 'Multiple copies per sheet'], ['nup', 'Multiple pages per sheet'], ['booklet', 'Booklet (folded, saddle-stitched)']], 'single');
  const orient = select([['auto', 'Automatic'], ['portrait', 'Portrait'], ['landscape', 'Landscape']], 'auto');
  const marks = check('Crop marks');
  const bleed = check(`Include bleed (${doc.setup.bleed ? `${(doc.setup.bleed / 96).toFixed(2)} in` : 'none set'})`);
  const fit = check('Scale to fit paper');
  return {
    els: [field('Paper', paper), field('Layout', mode), field('Orientation', orient), marks.el, bleed.el, fit.el],
    value: () => ({ paper: paper.value, mode: mode.value, orientation: orient.value, cropMarks: marks.get(), includeBleed: bleed.get(), fit: fit.get(), margins: paper.value === 'page' ? 0 : 24, gap: mode.value === 'single' ? 0 : 12 }),
    onChange: (fn) => [paper, mode, orient, marks.input, bleed.input, fit.input].forEach((c) => c.addEventListener('change', fn))
  };
}

function previewPane() {
  const pane = h('div', { class: 'out-preview' });
  let current = null;
  return {
    el: pane,
    draw(doc, options) {
      if (current) current.destroy();
      pane.replaceChildren();
      try {
        current = buildPreview(pane, doc, exportRenderer(doc), { ...options, width: Math.max(320, pane.clientWidth || 520), height: 560, maxSheets: 24 });
        const n = current.sheetCount;
        pane.prepend(h('div', { class: 'out-count', text: `${plural(n, '{n} sheet', '{n} sheets')}${n > 24 ? ' (showing the first 24)' : ''}` }));
      } catch (err) {
        pane.replaceChildren(h('p', { class: 'out-error', text: err.message || String(err) }));
      }
    }
  };
}

// ---------------------------------------------------------------- export
registry.backstage({
  id: 'export', label: 'Export', icon: 'export', order: 40, enabled: (ctx) => !!ctx.doc,
  render(page) {
    const doc = app.doc;
    if (!doc) { page.append(h('p', { text: 'Open a publication to export it.' })); return; }
    const fmt = select([['pdf', 'PDF document (.pdf)'], ['png', 'PNG image (.png)'], ['jpeg', 'JPEG image (.jpg)']], 'pdf');
    const range = rangeControls(doc);
    const layout = layoutControls(doc);
    const dpi = select([['72', '72 dpi (screen)'], ['150', '150 dpi (standard)'], ['300', '300 dpi (print)'], ['600', '600 dpi (high)']], '300');
    const quality = input('90', { type: 'number', min: 10, max: 100 });
    const transparent = check('Transparent background (PNG)');
    const imageOpts = h('div', { class: 'out-group', hidden: true }, field('Resolution', dpi), field('JPEG quality (%)', quality), transparent.el);
    const layoutBox = h('div', { class: 'out-group' }, ...layout.els);
    const preview = previewPane();
    const status = h('p', { class: 'out-status' });
    const go = h('button', { type: 'button', class: 'btn btn-primary out-go' }, icon('export'), h('span', { text: 'Export' }));
    const opts = () => ({ pages: range.value(), ...layout.value(), fileName: doc.title });
    const redraw = () => { imageOpts.hidden = fmt.value === 'pdf'; layoutBox.hidden = fmt.value !== 'pdf'; if (fmt.value === 'pdf') preview.draw(doc, opts()); else preview.draw(doc, { pages: range.value(), paper: 'page' }); };
    fmt.addEventListener('change', redraw); range.onChange(redraw); layout.onChange(redraw);
    go.addEventListener('click', async () => {
      go.disabled = true; status.textContent = 'Exporting…';
      try {
        app.flush();
        let r;
        if (fmt.value === 'pdf') r = await exportPDF(doc, exportRenderer(doc), opts(), app.platform);
        else {
          r = await exportImages(doc, exportRenderer(doc), { pages: range.value(), format: fmt.value, dpi: +dpi.value, quality: Math.max(0.1, Math.min(1, (+quality.value || 90) / 100)), background: fmt.value === 'png' && transparent.get() ? 'transparent' : '#ffffff', fileName: doc.title,
            onProgress: (i, n) => { status.textContent = `Rendering page ${i} of ${n}…`; } }, app.platform);
          r = r && r.result;
        }
        if (!r) { status.textContent = 'Export cancelled.'; return; }
        status.textContent = r.viaPrintDialog ? 'Choose “Save as PDF” in the print dialog to finish.' : r.folder ? `Saved ${r.count} files to ${r.folder}` : `Saved ${r.name || 'file'}${r.path ? ` to ${r.path}` : ''}`;
        app.ui.toast(status.textContent);
      } catch (err) {
        status.textContent = `Export failed: ${err.message || err}`;
      } finally { go.disabled = false; }
    });
    page.classList.add('out-page');
    page.append(h('div', { class: 'out-settings' }, h('h1', { text: 'Export' }), h('p', { class: 'bs-sub', text: 'Save a print-ready PDF or images of your pages. Selection handles, guides and empty placeholders are never included.' }),
      field('Format', fmt), ...range.els, imageOpts, layoutBox, h('div', { class: 'out-actions' }, go), status), preview.el);
    requestAnimationFrame(redraw);
  }
});

// ---------------------------------------------------------------- print
registry.command({ id: 'file.print', label: 'Print', icon: 'print', shortcut: 'Mod+P', enabled: (ctx) => !!ctx.doc, run: () => app.ui.backstage.open('print') });
registry.command({ id: 'file.export', label: 'Export', icon: 'export', shortcut: 'Mod+Shift+E', enabled: (ctx) => !!ctx.doc, run: () => app.ui.backstage.open('export') });
registry.backstage({
  id: 'print', label: 'Print', icon: 'print', order: 38, enabled: (ctx) => !!ctx.doc,
  render(page) {
    const doc = app.doc;
    if (!doc) { page.append(h('p', { text: 'Open a publication to print it.' })); return; }
    const printer = select([['', 'System default printer']], '');
    const copies = input('1', { type: 'number', min: 1, max: 999 });
    const duplex = select([['simplex', 'Print on one side'], ['longEdge', 'Both sides — flip on long edge'], ['shortEdge', 'Both sides — flip on short edge']], 'simplex');
    const range = rangeControls(doc);
    const layout = layoutControls(doc, { forPrint: true });
    const preview = previewPane();
    const status = h('p', { class: 'out-status' });
    const go = h('button', { type: 'button', class: 'btn btn-primary out-go' }, icon('print'), h('span', { text: 'Print' }));
    const opts = () => ({ pages: range.value(), ...layout.value() });
    const redraw = () => preview.draw(doc, opts());
    range.onChange(redraw); layout.onChange(redraw);
    if (app.platform.isDesktop && app.platform.printers) {
      app.platform.printers().then((list) => {
        for (const p of list || []) printer.append(h('option', { value: p.name, text: p.displayName || p.name }));
      }).catch(() => {});
    }
    go.addEventListener('click', async () => {
      go.disabled = true; status.textContent = 'Sending to printer…';
      try {
        app.flush();
        const ok = await printDocument(doc, exportRenderer(doc), { ...opts(), copies: +copies.value || 1, duplex: duplex.value, deviceName: printer.value || undefined }, app.platform);
        status.textContent = ok ? 'Sent to the printer.' : 'Printing was cancelled.';
      } catch (err) { status.textContent = `Printing failed: ${err.message || err}`; } finally { go.disabled = false; }
    });
    page.classList.add('out-page');
    page.append(h('div', { class: 'out-settings' }, h('h1', { text: 'Print' }),
      h('div', { class: 'out-actions' }, go, field('Copies', copies)),
      field('Printer', printer, app.platform.isDesktop ? null : 'Your browser’s print dialog chooses the printer.'), ...range.els, ...layout.els,
      app.platform.isDesktop ? field('Sides', duplex) : null, status), preview.el);
    requestAnimationFrame(redraw);
  }
});
void parsePageRange;
