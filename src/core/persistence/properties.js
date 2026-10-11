// Document Properties dialog: title, author, subject, keywords, comments, category, plus a
// page-setup summary and statistics. Changes are one undo step.

import { docStats, formatBytes, pageSizeName } from './format.js';
import { formatUnit, UNITS } from '../units.js';
import { esc } from '../ui/dom.js';

const TYPE_LABELS = { text: 'text boxes', image: 'pictures', shape: 'shapes', line: 'lines', table: 'tables', group: 'groups' };

/** HTML summary of page setup and statistics for a session's document. */
export function propertiesSummaryHTML(session) {
  const doc = session.doc;
  const s = doc.setup;
  const u = s.units in UNITS ? s.units : 'in';
  const st = docStats(doc);
  const m = s.margins;
  const kinds = Object.entries(st.byType).filter(([t]) => t !== 'group').map(([t, n]) => `${n} ${TYPE_LABELS[t] || t}`).join(', ') || 'none';
  const rows = [
    ['Page size', `${esc(pageSizeName(s))} — ${formatUnit(s.width, u)} × ${formatUnit(s.height, u, true)}`],
    ['Margins', `${formatUnit(m.top, u)} top, ${formatUnit(m.bottom, u)} bottom, ${formatUnit(m.left, u)} left, ${formatUnit(m.right, u, true)} right`],
    ['Layout', `${s.columns.count} column${s.columns.count === 1 ? '' : 's'}${s.facing ? ' · facing pages' : ''}${s.bleed ? ` · ${formatUnit(s.bleed, u, true)} bleed` : ''}`],
    ['Pages', `${st.pages} page${st.pages === 1 ? '' : 's'} · ${st.masters} master page${st.masters === 1 ? '' : 's'}`],
    ['Objects', `${st.objects} (${esc(kinds)})`],
    ['Text', `${st.words.toLocaleString()} word${st.words === 1 ? '' : 's'} · ${st.characters.toLocaleString()} characters`],
    ['Size', esc(formatBytes(st.bytes))],
    ['Location', session.filePath ? esc(session.filePath) : session.fileName ? esc(session.fileName) : 'Not saved yet'],
    ['Status', session.dirty ? 'Unsaved changes' : 'Saved']
  ];
  return `<dl class="props-summary">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

/**
 * Show the Document Properties dialog for the current document. Resolves true when changed.
 * @param {object} app
 */
export async function showDocumentProperties(app) {
  const session = app.session;
  if (!session) return false;
  app.flush();
  const doc = session.doc;
  const meta = doc.meta || {};
  const r = await app.ui.dialog({
    title: 'Document Properties',
    width: 560,
    body: propertiesSummaryHTML(session),
    fields: [
      { name: 'title', label: 'Title', value: doc.title || '', required: true, spellcheck: true },
      { name: 'author', label: 'Author', value: meta.author || '', half: true },
      { name: 'category', label: 'Category', value: meta.category || '', half: true },
      { name: 'subject', label: 'Subject', value: meta.subject || '' },
      { name: 'keywords', label: 'Keywords', value: meta.keywords || '', placeholder: 'Separate keywords with commas' },
      { name: 'comments', label: 'Comments', type: 'textarea', value: meta.comments || '', rows: 3 }
    ],
    buttons: [{ label: 'Cancel', value: null }, { label: 'OK', value: 'ok', primary: true }]
  });
  if (!r || !app.sessions.includes(session)) return false;
  const v = r.values;
  const next = {
    title: String(v.title || '').trim() || doc.title,
    meta: { author: v.author.trim(), subject: v.subject.trim(), keywords: v.keywords.trim(), comments: v.comments, category: v.category.trim() }
  };
  const same = next.title === doc.title && Object.keys(next.meta).every((k) => (meta[k] || '') === next.meta[k]);
  if (same) return false;
  if (app.session !== session) app.activate(session);
  app.transact('Document Properties', (d) => {
    d.title = next.title;
    d.meta = { ...(d.meta || {}), ...next.meta };
  });
  return true;
}
