// Custom-template storage. Desktop: desktop/ipc-templates.js (userData/templates/*.folio-template.json).
// Web: IndexedDB through app.platform.store (one 'tpl:<id>' entry per template plus a 'tpl:index').
// Every change emits app event 'templates' so open galleries refresh.

import { app } from '../../core/app.js';
import { normalizeTemplateRecord } from '../../engines/templates/custom.js';

const INDEX_KEY = 'tpl:index';
const desktop = () => !!(app.platform && app.platform.isDesktop);
const kv = () => app.platform.store;

async function webIndex() {
  const ids = await kv().get(INDEX_KEY);
  return Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : [];
}

let cache = null;

/**
 * All custom templates (normalised records), newest first. Cached until a change.
 * @returns {Promise<object[]>}
 */
export async function listCustomTemplates() {
  if (cache) return cache;
  let raw = [];
  if (desktop()) raw = (await app.platform.invoke('templates:list')) || [];
  else {
    for (const id of await webIndex()) {
      const r = await kv().get(`tpl:${id}`);
      if (r) raw.push(r);
    }
  }
  cache = raw.map(normalizeTemplateRecord).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
  return cache;
}

function changed() {
  cache = null;
  app.emit('templates', null);
}

/**
 * Store a template record (see createTemplateRecord).
 * @param {object} record
 * @returns {Promise<object>} the record
 */
export async function saveCustomTemplate(record) {
  if (desktop()) await app.platform.invoke('templates:save', JSON.stringify(record));
  else {
    await kv().set(`tpl:${record.id}`, JSON.parse(JSON.stringify(record)));
    const ids = await webIndex();
    if (!ids.includes(record.id)) await kv().set(INDEX_KEY, [...ids, record.id]);
  }
  changed();
  return record;
}

/**
 * Rename / recategorise / redescribe a stored template.
 * @param {string} id
 * @param {{ name?: string, category?: string, description?: string }} patch
 */
export async function updateCustomTemplate(id, patch) {
  if (desktop()) await app.platform.invoke('templates:update', id, patch);
  else {
    const r = await kv().get(`tpl:${id}`);
    if (r) {
      Object.assign(r, patch, { updatedAt: Date.now() });
      if (patch.name && r.doc) r.doc.title = patch.name;
      await kv().set(`tpl:${id}`, r);
    }
  }
  changed();
}

/**
 * Delete a stored template.
 * @param {string} id
 */
export async function deleteCustomTemplate(id) {
  if (desktop()) await app.platform.invoke('templates:delete', id);
  else {
    await kv().set(`tpl:${id}`, null);
    await kv().set(INDEX_KEY, (await webIndex()).filter((x) => x !== id));
  }
  changed();
}
