// One open document (a document tab): the doc, its history, file binding, view and selection.

import { History, snapshotDoc } from './history.js';
import { hashString } from './hash.js';
import { uid } from './model.js';

/** Default per-document view state. */
export function defaultView() {
  return { pageIndex: 0, zoom: 1, fit: 'page', scroll: { x: 0, y: 0 }, masterMode: false, masterIndex: 0 };
}

/** An open document. */
export class DocSession {
  /**
   * @param {object} doc normalised Folio document
   * @param {{ id?: string, filePath?: string|null, fileName?: string|null, fileHandle?: any, dirty?: boolean }} [opts]
   *   `dirty: true` marks the document as unsaved from the start (e.g. restored from recovery).
   */
  constructor(doc, opts = {}) {
    this.id = opts.id || uid('ses');
    this.doc = doc;
    this.history = new History();
    this.filePath = opts.filePath || null;
    this.fileName = opts.fileName || null;
    this.fileHandle = opts.fileHandle || null;
    this.view = defaultView();
    /** @type {string[]} selected element ids */
    this.selection = [];
    this.createdAt = Date.now();
    this.savedHash = opts.dirty ? null : this.contentHash();
    this._lastHash = this.savedHash;
    this._dirty = !!opts.dirty;
  }

  /** Hash of the document content (assets excluded; they are referenced by id and immutable). */
  contentHash(snapshot) {
    return hashString(snapshot ?? snapshotDoc(this.doc));
  }

  /** Recompute dirtiness from a snapshot (or the current doc). Returns true if it changed. */
  refreshDirty(snapshot) {
    const h = this.contentHash(snapshot);
    this._lastHash = h;
    const dirty = h !== this.savedHash;
    const changed = dirty !== this._dirty;
    this._dirty = dirty;
    return changed;
  }

  /** True when the document differs from what was last saved (or was never saved after changes). */
  get dirty() { return this._dirty; }

  /** Record that the content with hash `hash` is what is on disk now. */
  markSaved(hash, { filePath, fileName, fileHandle } = {}) {
    this.savedHash = hash;
    if (filePath !== undefined) this.filePath = filePath;
    if (fileName !== undefined) this.fileName = fileName;
    if (fileHandle !== undefined) this.fileHandle = fileHandle;
    this._dirty = this._lastHash !== hash;
    return this._dirty;
  }

  /** Display name for tabs and the title bar. */
  get displayName() {
    if (this.fileName) return this.fileName.replace(/\.(folio|json)$/i, '');
    return this.doc.title || 'Untitled publication';
  }
}
