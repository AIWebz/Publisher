// The application store: open documents (sessions), transactions and gestures, undo/redo,
// selection, current page, editing state, command execution and events. No DOM access here;
// the shell, canvas and UI modules subscribe to events and install `app.ui`, `app.canvas`,
// `app.files` and `app.platform` at boot. See ARCHITECTURE.md ("Core API details").

import { Emitter } from './events.js';
import { registry } from './registry.js';
import { prefs } from './prefs.js';
import { DocSession } from './session.js';
import { snapshotDoc, restoreSnapshot } from './history.js';
import { createDocument, findElement } from './model.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function uiFallback() {
  return {
    toast: (msg) => console.info('[toast]', msg),
    confirm: async () => false,
    dialog: async () => null,
    prompt: async () => null,
    colorPicker: () => {},
    contextMenu: () => {}
  };
}

/** The application singleton's class (exported for tests). */
export class App extends Emitter {
  constructor() {
    super();
    this.registry = registry;
    this.prefs = prefs;
    /** @type {DocSession[]} */
    this.sessions = [];
    /** @type {DocSession|null} */
    this.session = null;
    /** Installed at boot: platform services (see core/platform.js). */
    this.platform = null;
    /** Installed at boot by core/ui: toast, confirm, dialog, prompt, colorPicker, contextMenu. */
    this.ui = uiFallback();
    /** Installed at boot by core/canvas: zoom/scroll helpers. */
    this.canvas = null;
    /** Installed at boot by core/persistence: newDocument/open/save/saveAs/close flows. */
    this.files = null;
    /** Active in-place text edit: { frameId, root, session } or null. */
    this.editing = null;
    /** Active gesture (drag/resize/rotate) or null. */
    this.gesture = null;
    this._flushers = new Set();
    this._txDepth = 0;
    this._selPending = false;
  }

  // ------------------------------------------------------------------ accessors

  /** Current document or null. */
  get doc() { return this.session ? this.session.doc : null; }

  /** Current session's view state ({ pageIndex, zoom, fit, scroll, masterMode, masterIndex }). */
  get view() { return this.session ? this.session.view : null; }

  /** Index of the current page (in master mode: the page last shown before entering it). */
  get pageIndex() { return this.session ? clamp(this.session.view.pageIndex, 0, this.session.doc.pages.length - 1) : -1; }

  /** True while editing master pages. */
  get isMasterMode() { return !!(this.session && this.session.view.masterMode); }

  /** The master being edited in master mode, else null. */
  get master() {
    const s = this.session;
    if (!s || !s.view.masterMode) return null;
    return s.doc.masters[clamp(s.view.masterIndex, 0, s.doc.masters.length - 1)] || null;
  }

  /** The editing surface: the current page, or the current master in master mode. */
  get page() {
    const s = this.session;
    if (!s) return null;
    return this.master || s.doc.pages[this.pageIndex] || null;
  }

  /** Selected element ids. */
  get selectionIds() { return this.session ? [...this.session.selection] : []; }

  /** Selected elements (resolved from ids). */
  get selection() {
    const s = this.session;
    if (!s) return [];
    const out = [];
    for (const id of s.selection) {
      const hit = findElement(s.doc, id);
      if (hit) out.push(hit.el);
    }
    return out;
  }

  /** Context object handed to commands, ribbon items and inspectors. */
  ctx() {
    return {
      app: this,
      doc: this.doc,
      session: this.session,
      page: this.page,
      pageIndex: this.pageIndex,
      master: this.master,
      selection: this.selection,
      editing: this.editing ? this.editing.frameId : null
    };
  }

  // ------------------------------------------------------------------ sessions

  /**
   * Open a document in a new tab and make it current.
   * @param {object} doc normalised document
   * @param {object} [opts] DocSession options ({ filePath, fileName, fileHandle, dirty, id })
   */
  addSession(doc, opts = {}) {
    const s = new DocSession(doc, opts);
    this.sessions.push(s);
    this.emit('sessions', this.sessions);
    this.activate(s);
    return s;
  }

  /** Create a blank publication (model.createDocument options) in a new tab. */
  newDocument(opts = {}) {
    return this.addSession(createDocument(opts));
  }

  /** Switch to another open document. */
  activate(sessionOrId) {
    const s = typeof sessionOrId === 'string' ? this.sessions.find((x) => x.id === sessionOrId) : sessionOrId;
    if (!s || s === this.session) return;
    this.flush();
    if (this.gesture) this.endGesture(true);
    this.session = s;
    this.emit('session', s);
    this.emit('page', this.pageIndex);
    this.emit('selection', this.selection);
    this.emit('view', s.view);
  }

  /** Remove a session without prompting (callers handle "save changes?"). */
  removeSession(session) {
    const i = this.sessions.indexOf(session);
    if (i < 0) return;
    if (this.session === session) this.flush();
    if (this.gesture && this.gesture.session === session) this.gesture = null;
    this.sessions.splice(i, 1);
    this.emit('session-closed', session);
    this.emit('sessions', this.sessions);
    if (this.session === session) {
      this.session = null;
      const next = this.sessions[Math.min(i, this.sessions.length - 1)] || null;
      if (next) this.activate(next);
      else this.emit('session', null);
    }
  }

  /** Sessions with unsaved changes. */
  dirtySessions() { return this.sessions.filter((s) => s.dirty); }

  // ------------------------------------------------------------------ transactions

  /**
   * Apply a change as ONE undo step. `fn(doc, ctx)` mutates the document in place. If it throws,
   * the document is restored and the error re-thrown. Returns fn's result.
   * opts.coalesce: steps with the same key merge (within 1.5 s; keys starting "session:" always merge).
   * @param {string} label  e.g. "Move", shown as "Undo Move"
   * @param {(doc: object, ctx: object) => any} fn
   * @param {{ coalesce?: string }} [opts]
   */
  transact(label, fn, opts = {}) {
    const s = this.session;
    if (!s) return undefined;
    if (this.gesture && this.gesture.session === s) {
      const r = fn(s.doc, this.ctx());
      this.preview();
      return r;
    }
    const before = snapshotDoc(s.doc);
    const selBefore = [...s.selection];
    const pageBefore = s.view.pageIndex;
    let result;
    this._txDepth++;
    try {
      result = fn(s.doc, this.ctx());
    } catch (err) {
      this._txDepth--;
      s.doc = restoreSnapshot(before, s.doc.assets);
      s.selection = selBefore;
      this._afterChange(s, { label, reverted: true });
      throw err;
    }
    this._txDepth--;
    const after = snapshotDoc(s.doc);
    if (after === before) {
      this._flushSelection(s);
      return result;
    }
    this._validateSelection(s);
    s.history.push({ label, before, after, selBefore, selAfter: [...s.selection], pageBefore, pageAfter: s.view.pageIndex, coalesce: opts.coalesce || null });
    this._afterChange(s, { label, after });
    return result;
  }

  /** Start a drag-style change: mutate app.doc freely, call preview(), then endGesture(). */
  beginGesture(label) {
    const s = this.session;
    if (!s) return;
    if (this.gesture) this.endGesture(true);
    this.gesture = { session: s, label, before: snapshotDoc(s.doc), selBefore: [...s.selection], pageBefore: s.view.pageIndex };
  }

  /** Re-render after in-gesture mutations (no history, no dirty). `ids` limits the update. */
  preview(ids) {
    if (!this.session) return;
    this.emit('preview', { session: this.session, ids: ids || null });
  }

  /**
   * Finish the gesture. commit=true records one undo step (if anything changed);
   * commit=false reverts the document to its state at beginGesture. Returns true if a step was recorded.
   */
  endGesture(commit = true) {
    const g = this.gesture;
    if (!g) return false;
    this.gesture = null;
    const s = g.session;
    if (!this.sessions.includes(s)) return false;
    if (!commit) {
      s.doc = restoreSnapshot(g.before, s.doc.assets);
      s.selection = g.selBefore.filter((id) => findElement(s.doc, id));
      this._afterChange(s, { label: g.label, reverted: true });
      return false;
    }
    const after = snapshotDoc(s.doc);
    if (after === g.before) {
      this.emit('preview', { session: s, ids: null });
      return false;
    }
    this._validateSelection(s);
    s.history.push({ label: g.label, before: g.before, after, selBefore: g.selBefore, selAfter: [...s.selection], pageBefore: g.pageBefore, pageAfter: s.view.pageIndex });
    this._afterChange(s, { label: g.label, after });
    return true;
  }

  /** Undo the last step of the current document. */
  undo() {
    const s = this.session;
    if (!s) return false;
    this.flush();
    if (this.gesture) this.endGesture(false);
    const step = s.history.undo();
    if (!step) return false;
    this._restore(s, step.before, step.selBefore, step.pageBefore, { undo: true, label: step.label });
    return true;
  }

  /** Redo the last undone step. */
  redo() {
    const s = this.session;
    if (!s) return false;
    this.flush();
    if (this.gesture) this.endGesture(false);
    const step = s.history.redo();
    if (!step) return false;
    this._restore(s, step.after, step.selAfter, step.pageAfter, { redo: true, label: step.label });
    return true;
  }

  _restore(s, snap, sel, page, info) {
    const prevPage = s.view.pageIndex;
    s.doc = restoreSnapshot(snap, s.doc.assets);
    s.selection = (sel || []).slice();
    if (s.view.masterMode) s.view.masterIndex = clamp(s.view.masterIndex, 0, s.doc.masters.length - 1);
    if (Number.isInteger(page)) s.view.pageIndex = page;
    s.view.pageIndex = clamp(s.view.pageIndex, 0, s.doc.pages.length - 1);
    this._afterChange(s, { ...info, after: snap, forceSelection: true });
    if (s === this.session && prevPage !== s.view.pageIndex) this.emit('page', s.view.pageIndex);
  }

  _validateSelection(s) {
    const before = s.selection.length;
    s.selection = s.selection.filter((id) => findElement(s.doc, id));
    if (s.selection.length !== before) this._selPending = true;
  }

  _flushSelection(s) {
    if (!this._selPending || this._txDepth) return;
    this._selPending = false;
    if (s === this.session) this.emit('selection', this.selection);
  }

  _afterChange(s, info) {
    this._validateSelection(s);
    if (s.view.pageIndex >= s.doc.pages.length) s.view.pageIndex = s.doc.pages.length - 1;
    const dirtyChanged = s.refreshDirty(info.after);
    this.emit('doc-change', { session: s, ...info });
    if (info.forceSelection) this._selPending = true;
    this._flushSelection(s);
    if (dirtyChanged) this.emit('dirty', s);
  }

  /** Re-check dirtiness of a session (e.g. after a save) and emit 'dirty' if it changed. */
  notifyDirty(s = this.session) {
    if (s) this.emit('dirty', s);
  }

  // ------------------------------------------------------------------ selection, pages, view

  /**
   * Select elements by id (or element objects). opts.add unions, opts.toggle toggles each id.
   * @param {string|string[]|object|object[]|null} ids
   * @param {{ add?: boolean, toggle?: boolean }} [opts]
   */
  select(ids, opts = {}) {
    const s = this.session;
    if (!s) return;
    let list = ids == null ? [] : Array.isArray(ids) ? ids : [ids];
    list = list.map((x) => (typeof x === 'string' ? x : x && x.id)).filter(Boolean);
    let next;
    if (opts.toggle) {
      next = [...s.selection];
      for (const id of list) {
        const i = next.indexOf(id);
        if (i >= 0) next.splice(i, 1); else next.push(id);
      }
    } else if (opts.add) {
      next = [...s.selection, ...list.filter((id) => !s.selection.includes(id))];
    } else {
      next = [...new Set(list)];
    }
    next = next.filter((id) => findElement(s.doc, id));
    if (next.length === s.selection.length && next.every((id, i) => id === s.selection[i])) return;
    s.selection = next;
    this._selPending = true;
    this._flushSelection(s);
  }

  /** Go to page `i` (0-based; clamped). Leaves master mode. Clears the selection. */
  goToPage(i) {
    const s = this.session;
    if (!s) return;
    this.flush();
    const idx = clamp(Math.round(i), 0, s.doc.pages.length - 1);
    const leaving = s.view.masterMode;
    if (idx === s.view.pageIndex && !leaving) return;
    s.view.pageIndex = idx;
    s.view.masterMode = false;
    if (s.selection.length) { s.selection = []; this.emit('selection', []); }
    this.emit('page', idx);
    if (leaving) this.emit('view', s.view);
  }

  /** Enter (true) or leave (false) master-page editing; optionally pick the master index. */
  setMasterMode(on, masterIndex) {
    const s = this.session;
    if (!s) return;
    this.flush();
    const wasOn = s.view.masterMode;
    if (on) {
      let idx = masterIndex;
      if (!Number.isInteger(idx)) {
        const page = s.doc.pages[this.pageIndex];
        idx = wasOn ? s.view.masterIndex : Math.max(0, s.doc.masters.findIndex((m) => page && m.id === page.masterId));
      }
      idx = clamp(idx, 0, s.doc.masters.length - 1);
      if (wasOn && idx === s.view.masterIndex) return;
      s.view.masterIndex = idx;
      s.view.masterMode = true;
    } else {
      if (!wasOn) return;
      s.view.masterMode = false;
    }
    if (s.selection.length) { s.selection = []; this.emit('selection', []); }
    this.emit('view', s.view);
    this.emit('page', this.pageIndex);
  }

  /** Merge a patch into the current view state and emit 'view'. */
  setView(patch) {
    const s = this.session;
    if (!s) return;
    Object.assign(s.view, patch);
    this.emit('view', s.view);
  }

  // ------------------------------------------------------------------ editing & flushing

  /** Called by the text editor: begin ({ frameId, root }) or end (null) in-place editing. */
  setEditing(state) {
    const prev = this.editing;
    if (!state && !prev) return;
    this.editing = state ? { ...state, session: this.session } : null;
    if (prev) this.emit('edit-end', prev);
    if (state) this.emit('edit-start', this.editing);
  }

  /**
   * Register a function that commits pending UI state (focused inputs, text editing) into the
   * document. All flushers run before save, close, undo/redo and document switches.
   */
  addFlusher(fn) {
    this._flushers.add(fn);
    return () => this._flushers.delete(fn);
  }

  /** Commit in-progress edits (text editing, focused fields) into the model. */
  flush() {
    for (const fn of [...this._flushers]) {
      try { fn(); } catch (err) { console.error('flush failed', err); }
    }
  }

  // ------------------------------------------------------------------ commands

  /** Run a registered command with the current context. Returns the command's result. */
  exec(id, arg) {
    const cmd = registry.getCommand(id);
    if (!cmd) { console.warn(`Unknown command: ${id}`); return undefined; }
    if (!this.isEnabled(id)) return undefined;
    try {
      const r = cmd.run(this.ctx(), arg);
      if (r && typeof r.then === 'function') return r.catch((err) => this.reportError(err, cmd.label || id));
      return r;
    } catch (err) {
      this.reportError(err, cmd.label || id);
      return undefined;
    }
  }

  /** Whether a command can run now. Commands need an open document unless `global: true`. */
  isEnabled(id) {
    const cmd = registry.getCommand(id);
    if (!cmd) return false;
    if (!this.session && !cmd.global) return false;
    if (!cmd.enabled) return true;
    try { return !!cmd.enabled(this.ctx()); } catch (err) { console.error(`enabled() of ${id} failed`, err); return false; }
  }

  /** Whether a toggle command is on. */
  isChecked(id) {
    const cmd = registry.getCommand(id);
    if (!cmd || !cmd.checked || (!this.session && !cmd.global)) return false;
    try { return !!cmd.checked(this.ctx()); } catch { return false; }
  }

  /** Log an error and tell the user. */
  reportError(err, what = 'That action') {
    console.error(err);
    this.ui.toast(`${what} failed — ${err && err.message ? err.message : err}`);
  }
}

/** The application singleton. */
export const app = new App();
