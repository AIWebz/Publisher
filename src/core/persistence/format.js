// Pure helpers for the .folio format: save serialisation, validated open, statistics and display
// formatting. No DOM, no platform access (unit-tested in node).

import { serialize, parseDocument, pruneUnused, allElements, PAGE_SIZES, matchPageSize, VERSION } from '../model.js';
import { snapshotDoc } from '../history.js';
import { hashString } from '../hash.js';
import { plural } from '../i18n.js';

/** File extension of native publications. */
export const EXTENSION = 'folio';

/**
 * Serialise a document for saving: unused assets and stories are pruned from a shallow copy
 * (the live document keeps them, since undo steps may still refer to them).
 * @param {object} doc
 * @returns {string} UTF-8 JSON text
 */
export function serializeForSave(doc) {
  const copy = { ...doc, assets: { ...(doc.assets || {}) }, stories: { ...(doc.stories || {}) } };
  pruneUnused(copy);
  return serialize(copy);
}

/**
 * Take an exact save snapshot of a document: the file text plus the content hash that
 * DocSession dirty tracking compares against (hash of snapshotDoc of the live document).
 * Both are computed synchronously, before any await, so edits made while saving stay dirty.
 * @param {object} doc
 * @returns {{ text: string, hash: string }}
 */
export function saveSnapshot(doc) {
  const snap = snapshotDoc(doc);
  return { text: serializeForSave(doc), hash: hashString(snap) };
}

/** Error raised for files that cannot be opened; `title` and `message` are user-facing. */
export class OpenError extends Error {
  constructor(title, message, reason) {
    super(message);
    this.name = 'OpenError';
    this.title = title;
    this.reason = reason;
  }
}

/**
 * Parse and validate publication text (version-1 files are migrated).
 * @param {string} text
 * @param {string} [name] file name used in messages
 * @returns {object} normalised document
 * @throws {OpenError}
 */
export function readPublication(text, name = 'This file') {
  const label = `“${name}”`;
  if (typeof text !== 'string' || !text.trim()) {
    throw new OpenError('Can’t open publication', `${label} is empty.`, 'empty');
  }
  let raw;
  try { raw = JSON.parse(text); } catch {
    throw new OpenError('Can’t open publication', `${label} is not a Folio publication, or it is damaged (it is not valid JSON).`, 'invalid');
  }
  if (raw && raw.format === 'folio-publication' && Number(raw.version) > VERSION) {
    throw new OpenError('Newer publication', `${label} was made with a newer version of Folio Publisher (format version ${raw.version}). Update Folio Publisher to open it.`, 'newer');
  }
  try {
    return parseDocument(text);
  } catch (err) {
    throw new OpenError('Can’t open publication', `${label} is not a Folio publication. ${err && err.message ? err.message : ''}`.trim(), 'invalid');
  }
}

/** Plain text of rich-text HTML (tags removed, common entities decoded). */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<(br|\/p|\/li|\/div)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

/** Count words in plain text. */
export function countWords(text) {
  const m = String(text || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu);
  return m ? m.length : 0;
}

/**
 * Document statistics for the properties dialog.
 * @param {object} doc
 * @param {string} [savedText] serialised file text (for the file size)
 */
export function docStats(doc, savedText) {
  const byType = {};
  let objects = 0;
  for (const el of allElements(doc)) {
    byType[el.type] = (byType[el.type] || 0) + 1;
    if (el.type !== 'group') objects++;
  }
  let words = 0, characters = 0;
  const used = new Set(allElements(doc, 'text').map((f) => f.storyId));
  for (const id of used) {
    const t = htmlToText(doc.stories[id] && doc.stories[id].html);
    words += countWords(t);
    characters += t.replace(/\s+/g, '').length;
  }
  for (const tb of allElements(doc, 'table')) {
    for (const row of tb.cells || []) for (const c of row || []) {
      if (!c || c.covered) continue;
      const t = htmlToText(c.html);
      words += countWords(t);
      characters += t.replace(/\s+/g, '').length;
    }
  }
  const text = savedText ?? serializeForSave(doc);
  return {
    pages: doc.pages.length,
    masters: doc.masters.length,
    objects,
    byType,
    pictures: byType.image || 0,
    textFrames: byType.text || 0,
    tables: byType.table || 0,
    words,
    characters,
    stories: used.size,
    bytes: utf8Length(text)
  };
}

/** UTF-8 byte length of a string. */
export function utf8Length(s) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
  return unescape(encodeURIComponent(s)).length;
}

/** Human-readable size ("12 KB", "3.4 MB"). */
export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Relative timestamp for lists ("Just now", "5 minutes ago", "Today at 14:05", "Yesterday at…", date).
 * @param {number} ts
 * @param {number} [now]
 */
export function formatWhen(ts, now = Date.now()) {
  if (!Number.isFinite(ts)) return '';
  const d = new Date(ts), n = new Date(now);
  const diff = now - ts;
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (diff >= 0 && diff < 60000) return 'Just now';
  if (diff >= 0 && diff < 3600000) { const m = Math.round(diff / 60000); return plural(m, '{n} minute ago', '{n} minutes ago'); }
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(n) - day(d)) / 86400000);
  if (days === 0) return `Today at ${time}`;
  if (days === 1) return `Yesterday at ${time}`;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) + ` at ${time}`;
}

/** Name of the document's page size ("Letter", "A4", or "Custom"), with orientation. */
export function pageSizeName(setup) {
  const key = matchPageSize(setup.width, setup.height);
  const name = key ? PAGE_SIZES[key].name : 'Custom size';
  const orient = setup.width > setup.height ? 'Landscape' : setup.width < setup.height ? 'Portrait' : 'Square';
  return `${name} · ${orient}`;
}

/** Default file name (without extension) for a session's save dialog. */
export function suggestedName(session) {
  if (session.fileName) return session.fileName.replace(/\.(folio|json)$/i, '');
  const t = String(session.doc.title || '').trim();
  return t && t !== 'Untitled publication' ? t : 'Publication';
}
