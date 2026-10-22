// File flows behind app.files: new, open (validated, new tab unless the current tab is an untouched
// blank document), save / save as (exact snapshot hashed before awaiting the platform), close with
// Save / Don't Save / Cancel, close all, recent files and recovery-copy restore.

import { readPublication, saveSnapshot, suggestedName, formatWhen, OpenError } from './format.js';
import { recoverableEntries } from './recovery.js';
import { esc } from '../ui/dom.js';
import { plural } from '../i18n.js';
import { importPub } from '../../engines/import/pub.js';

const PUB_PREFIX = 'folio-import:pub;base64,';

/** File-flow controller installed as `app.files`. */
export class FilesController {
  /**
   * @param {{ app: object, platform: object, recovery: import('./recovery.js').RecoveryManager,
   *           instance?: string|null, isAlive?: (instance: string) => boolean }} opts
   */
  constructor({ app, platform, recovery, instance = null, isAlive = () => false }) {
    this.app = app;
    this.platform = platform;
    this.recovery = recovery;
    this.instance = instance;
    this.isAlive = isAlive;
    this._saving = new Map();   // session -> Promise
  }

  get ui() { return this.app.ui; }

  // ---------------------------------------------------------------- new / open

  /** Create a blank publication in a new tab (model.createDocument options). */
  newDocument(opts = {}) {
    return this.app.newDocument(opts);
  }

  /** True for a never-saved, unchanged document with no undo history (replaced by an open). */
  isUntouchedBlank(session) {
    return !!session && !session.filePath && !session.fileHandle && !session.dirty && !session.restored &&
      session.history.undoStack.length === 0 && session.history.redoStack.length === 0;
  }

  /** Ask for a publication file and open it. Resolves the session or null. */
  async open() {
    let r;
    try {
      r = await this.platform.openPublication();
    } catch (err) {
      await this._error('Can’t open publication', err);
      return null;
    }
    if (!r) return null;
    return this.openText(r.text, { path: r.path, name: r.name, handle: r.handle });
  }

  /**
   * Open publication text in a new tab (or focus the tab already showing that file).
   * Invalid or newer files get a clear error dialog and resolve null.
   * @param {string} text
   * @param {{ path?: string, name?: string, handle?: any, recent?: boolean }} [opts]
   */
  async openText(text, { path = null, name = null, handle = null, recent = true } = {}) {
    const app = this.app;
    const fileName = name || (path ? path.split(/[\\/]/).pop() : null);
    if (path) {
      const already = app.sessions.find((s) => s.filePath && samePath(s.filePath, path));
      if (already) {
        app.activate(already);
        this.ui.toast(`“${already.displayName}” is already open`);
        return already;
      }
    }
    if (typeof text === 'string' && text.startsWith(PUB_PREFIX)) return this.openPub(text.slice(PUB_PREFIX.length), fileName || 'Publication.pub');
    let doc;
    try {
      doc = readPublication(text, fileName || 'This file');
    } catch (err) {
      if (err instanceof OpenError) await this._alert(err.title, esc(err.message));
      else await this._error('Can’t open publication', err);
      return null;
    }
    const blank = app.session && this.isUntouchedBlank(app.session) ? app.session : null;
    const session = app.addSession(doc, { filePath: path || null, fileName, fileHandle: handle || null });
    if (blank && blank !== session) app.removeSession(blank);
    if (recent) this._addRecent(session);
    this._showDocument();
    return session;
  }

  /**
   * Open a Microsoft Publisher file: its text and pictures become a new, unsaved Folio publication
   * (Publisher's layout is not kept, and saving writes a .folio file, never over the .pub).
   */
  async openPub(base64, fileName) {
    const app = this.app;
    let res;
    try {
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      res = importPub(bytes, fileName.replace(/\.pub$/i, ''));
    } catch (err) {
      await this._alert('Can’t open publication', esc(`“${fileName}” could not be read as a Microsoft Publisher file. ${err && err.message ? err.message : ''}`));
      return null;
    }
    const blank = app.session && this.isUntouchedBlank(app.session) ? app.session : null;
    const session = app.addSession(res.doc, { fileName: fileName.replace(/\.pub$/i, ''), dirty: true });
    if (blank && blank !== session) app.removeSession(blank);
    this._showDocument();
    this.ui.toast(`Imported the text and pictures of “${fileName}”. Publisher’s layout is not kept; save it as a Folio publication.`);
    return session;
  }

  /** Open a recent-files entry; offers to remove entries whose file is gone. */
  async openRecent(entry) {
    if (!entry) return null;
    if (entry.path) {
      const open = this.app.sessions.find((s) => s.filePath && samePath(s.filePath, entry.path));
      if (open) { this.app.activate(open); return open; }
    }
    let r = null;
    try {
      r = entry.missing ? null : await this.platform.openRecentEntry(entry);
    } catch (err) {
      await this._error('Can’t open publication', err);
      return null;
    }
    if (!r) {
      const remove = await this.ui.confirm('File not found',
        `<p>“${esc(entry.title || entry.name)}” could not be found${entry.path ? ` at <code>${esc(entry.path)}</code>` : ''}. It may have been moved, renamed or deleted.</p><p>Remove it from the recent list?</p>`, 'Remove');
      if (remove) await this.removeRecent(entry);
      return null;
    }
    return this.openText(r.text, { path: r.path, name: r.name, handle: r.handle });
  }

  /** Recent publications (most recent first). */
  async recentList() {
    try { return (await this.platform.recent.list()) || []; } catch (err) { console.error(err); return []; }
  }

  /** Remove an entry from the recent list. */
  async removeRecent(entry) {
    await this.platform.recent.remove(entry.key || entry.path);
    this.app.emit('recent', null);
  }

  /** Forget every recent publication. */
  async clearRecent() {
    await this.platform.recent.clear();
    this.app.emit('recent', null);
  }

  _addRecent(session) {
    const entry = { path: session.filePath, handle: session.fileHandle, name: session.fileName, title: session.doc.title, pages: session.doc.pages.length };
    if (!entry.path && !entry.handle) return;
    Promise.resolve(this.platform.recent.add(entry)).then(() => this.app.emit('recent', null)).catch((err) => console.error('recent', err));
  }

  // ---------------------------------------------------------------- save

  /**
   * Save a document (to its file, or ask where). Resolves true when saved.
   * In-progress edits are committed first; the exact text written is hashed before the platform
   * call, so changes made while the save is in flight keep the document dirty.
   * @param {object} [session]
   * @param {{ saveAs?: boolean }} [opts]
   */
  async save(session = this.app.session, { saveAs = false } = {}) {
    if (!session) return false;
    const prev = this._saving.get(session);
    if (prev) { await prev.catch(() => {}); if (!saveAs && !session.dirty && (session.filePath || session.fileHandle)) return true; }
    const p = this._save(session, saveAs);
    this._saving.set(session, p);
    try { return await p; } finally { if (this._saving.get(session) === p) this._saving.delete(session); }
  }

  /** Save under a new name/location. */
  saveAs(session = this.app.session) {
    return this.save(session, { saveAs: true });
  }

  async _save(session, saveAs) {
    const app = this.app;
    app.flush();
    if (app.gesture && app.gesture.session === session) app.endGesture(true);
    const { text, hash } = saveSnapshot(session.doc);
    const firstSave = !session.filePath && !session.fileHandle;
    let r;
    try {
      r = await this.platform.savePublication({
        path: session.filePath, handle: session.fileHandle, text,
        suggestedName: suggestedName(session), saveAs: saveAs || firstSave
      });
    } catch (err) {
      await this._error(`Couldn’t save “${session.displayName}”`, err);
      return false;
    }
    if (!r) return false;
    session.markSaved(hash, {
      filePath: r.path !== undefined ? r.path || null : session.filePath,
      fileName: r.name || session.fileName,
      fileHandle: r.handle !== undefined ? r.handle : (r.downloaded ? null : session.fileHandle)
    });
    session.restored = false;
    app.notifyDirty(session);
    app.emit('saved', { session, path: session.filePath, name: session.fileName });
    this._addRecent(session);
    await this.recovery.saved(session);
    this.ui.toast(r.downloaded ? `Downloaded “${r.name}”` : `Saved “${session.displayName}”`);
    return true;
  }

  // ---------------------------------------------------------------- close

  /**
   * Ask "Save changes?" for a dirty document. Resolves 'save' | 'discard' | 'cancel'
   * ('save' only after a successful save).
   */
  async confirmSave(session) {
    if (!session.dirty) return 'discard';
    if (this.app.session !== session) this.app.activate(session);
    const where = session.filePath ? `<p class="dlg-hint">${esc(session.filePath)}</p>` : '';
    const r = await this.ui.dialog({
      title: 'Save changes?',
      body: `<p>Do you want to save the changes you made to “${esc(session.displayName)}”?</p>${where}<p>Your changes will be lost if you don’t save them.</p>`,
      width: 460,
      buttons: [
        { label: 'Don’t Save', value: 'discard', left: true },
        { label: 'Cancel', value: null },
        { label: 'Save', value: 'save', primary: true }
      ]
    });
    if (!r) return 'cancel';
    if (r.button === 'discard') return 'discard';
    return (await this.save(session)) ? 'save' : 'cancel';
  }

  /**
   * Close a document tab with Save / Don't Save / Cancel when it has unsaved changes.
   * Resolves true when the tab was closed.
   */
  async close(session = this.app.session) {
    if (!session) return false;
    this.app.flush();
    if (session.dirty) {
      const choice = await this.confirmSave(session);
      if (choice === 'cancel') return false;
    }
    await this.recovery.discard(session);
    this.app.removeSession(session);
    return true;
  }

  /** Close every document (prompting for each dirty one). Resolves true when all closed. */
  async closeAll() {
    this.app.flush();
    for (const s of [...this.app.sessions]) {
      if (!(await this.close(s))) return false;
    }
    return true;
  }

  /**
   * Quit flow (desktop window close): commit edits, then Save / Don't Save / Cancel for every
   * dirty document without closing tabs. Resolves true when it is safe to quit; recovery copies of
   * every document are then removed.
   */
  async prepareQuit() {
    this.app.flush();
    for (const s of this.app.dirtySessions()) {
      if (!this.app.sessions.includes(s) || !s.dirty) continue;
      const choice = await this.confirmSave(s);
      if (choice === 'cancel') return false;
    }
    this.recovery.enabled = false;
    await Promise.all(this.app.sessions.map((s) => this.recovery.discard(s)));
    return true;
  }

  // ---------------------------------------------------------------- recovery

  /** Unsaved recovery copies from earlier runs (excluding documents open here). */
  async recoverable() {
    let list = [];
    try { list = (await this.platform.recovery.list()) || []; } catch (err) { console.error(err); return []; }
    return recoverableEntries(list, { openIds: new Set(this.app.sessions.map((s) => s.id)), instance: this.instance, isAlive: this.isAlive });
  }

  /**
   * Restore a recovery copy into a new tab (dirty, keeping its original file path).
   * The restored tab keeps the copy's id, so autosave continues to update the same copy.
   */
  async restore(entry) {
    const text = await this.platform.recovery.read(entry.id);
    if (text == null) {
      await this.platform.recovery.remove(entry.id).catch(() => {});
      this.ui.toast(`The recovery copy of “${entry.title}” is no longer available`);
      return null;
    }
    let doc;
    try {
      doc = readPublication(text, entry.title || 'Recovered publication');
    } catch (err) {
      await this._alert('Can’t restore publication', esc(err.message));
      return null;
    }
    const app = this.app;
    const existing = app.sessions.find((s) => s.id === entry.id);
    if (existing) { app.activate(existing); return existing; }
    const blank = app.session && this.isUntouchedBlank(app.session) ? app.session : null;
    const session = app.addSession(doc, { id: entry.id, filePath: entry.filePath || null, fileName: entry.fileName || (entry.filePath ? entry.filePath.split(/[\\/]/).pop() : null), dirty: true });
    session.restored = true;
    if (blank && blank !== session) app.removeSession(blank);
    app.notifyDirty(session);
    this.recovery.schedule(session);
    this._showDocument();
    return session;
  }

  /** Delete a recovery copy. */
  async discardRecovery(entry) {
    await this.platform.recovery.remove(entry.id);
    this.app.emit('recovery', null);
  }

  /**
   * Show the "Recover unsaved publications" dialog when copies exist (startup, after a crash).
   * Resolves the restored sessions.
   * @param {{ force?: boolean }} [opts] force: show even when there is nothing (says so)
   */
  async offerRecovery({ force = false } = {}) {
    const list = await this.recoverable();
    if (!list.length) {
      if (force) await this._alert('Recover unsaved publications', '<p>There are no unsaved publications to recover.</p>');
      return [];
    }
    const rows = list.map((e, i) => `
      <label class="recover-row">
        <input type="checkbox" data-i="${i}" checked>
        <span class="recover-info"><strong>${esc(e.title || 'Untitled publication')}</strong>
        <span class="recover-meta">${esc(formatWhen(e.savedAt))} · ${plural(e.pages || 0, '{n} page', '{n} pages')}${e.filePath ? ` · ${esc(e.filePath)}` : ' · never saved'}</span></span>
      </label>`).join('');
    let checked = list.map(() => true);
    const r = await this.ui.dialog({
      title: 'Recover unsaved publications',
      width: 540,
      body: `<p>Folio Publisher closed before ${list.length === 1 ? 'this publication was' : 'these publications were'} saved. Restore the latest recovery ${list.length === 1 ? 'copy' : 'copies'}?</p><div class="recover-list">${rows}</div>`,
      onRender: (root) => {
        root.querySelectorAll('input[type=checkbox][data-i]').forEach((cb) => cb.addEventListener('change', () => { checked[+cb.dataset.i] = cb.checked; }));
      },
      buttons: [
        { label: 'Discard', value: 'discard', danger: true, left: true },
        { label: 'Decide Later', value: null },
        { label: 'Restore', value: 'restore', primary: true }
      ]
    });
    if (!r) return [];
    if (r.button === 'discard') {
      const sure = await this.ui.confirm('Discard recovery copies?', `<p>The unsaved changes in ${list.length === 1 ? 'this publication' : `these ${list.length} publications`} will be lost.</p>`, 'Discard', { danger: true });
      if (!sure) return this.offerRecovery();
      for (const e of list) await this.platform.recovery.remove(e.id).catch(() => {});
      this.app.emit('recovery', null);
      return [];
    }
    const restored = [];
    for (let i = 0; i < list.length; i++) {
      if (checked[i]) {
        const s = await this.restore(list[i]);
        if (s) restored.push(s);
      } else {
        await this.platform.recovery.remove(list[i].id).catch(() => {});
      }
    }
    this.app.emit('recovery', null);
    if (restored.length) this.ui.toast(plural(restored.length, 'Restored {n} publication — save to keep the changes', 'Restored {n} publications — save to keep the changes'));
    return restored;
  }

  // ---------------------------------------------------------------- helpers

  /** Leave the File view (start screen) so a newly opened document is visible. */
  _showDocument() {
    const bs = this.ui.backstage;
    if (bs && typeof bs.close === 'function') { try { bs.close(); } catch (err) { console.error(err); } }
  }

  async _alert(title, html) {
    if (this.ui.alert) return this.ui.alert(title, `<p>${html}</p>`);
    return this.ui.dialog({ title, body: `<p>${html}</p>`, buttons: [{ label: 'OK', value: 'ok', primary: true }] });
  }

  async _error(title, err) {
    console.error(err);
    return this._alert(title, esc(err && err.message ? err.message : String(err)));
  }
}

/** Compare file paths (case-insensitive on Windows-style paths). */
export function samePath(a, b) {
  if (!a || !b) return false;
  const norm = (p) => String(p).replace(/\\/g, '/');
  const win = /^[a-z]:[\\/]/i.test(a) || a.includes('\\');
  return win ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
}
