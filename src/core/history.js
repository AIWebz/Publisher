// Undo/redo history for one document. Each step stores the document JSON before and after
// (assets excluded: they are immutable and append-only), a label, and the selection/page so
// undo restores the user's context too.

/** Maximum number of undo steps kept per document. */
export const HISTORY_DEPTH = 200;

/** Default window (ms) within which coalescing steps (same `coalesce` key) merge. */
export const COALESCE_WINDOW = 1500;

/**
 * Serialise a document for history/dirty tracking: JSON without the `assets` map.
 * @param {object} doc
 * @returns {string}
 */
export function snapshotDoc(doc) {
  const { assets, ...rest } = doc;
  return JSON.stringify(rest);
}

/**
 * Rebuild a document from a snapshot, re-attaching the (shared, immutable) assets map.
 * @param {string} snapshot
 * @param {object} assets
 */
export function restoreSnapshot(snapshot, assets) {
  const doc = JSON.parse(snapshot);
  doc.assets = assets || {};
  return doc;
}

/**
 * @typedef {object} HistoryStep
 * @property {string} label
 * @property {string} before   snapshot before the change
 * @property {string} after    snapshot after the change
 * @property {string[]} [selBefore]
 * @property {string[]} [selAfter]
 * @property {number} [pageBefore]
 * @property {number} [pageAfter]
 * @property {string|null} [coalesce]   steps with the same key within the window merge
 * @property {number} [time]
 */

/** Linear undo/redo stacks with labelled, coalescable steps. */
export class History {
  /** @param {{ depth?: number, window?: number, now?: () => number }} [opts] */
  constructor(opts = {}) {
    this.depth = opts.depth ?? HISTORY_DEPTH;
    this.window = opts.window ?? COALESCE_WINDOW;
    this.now = opts.now || (() => Date.now());
    /** @type {HistoryStep[]} */
    this.undoStack = [];
    /** @type {HistoryStep[]} */
    this.redoStack = [];
    this._sealed = false;
  }

  /**
   * Record a step. If it has the same `coalesce` key as the previous step and arrives within the
   * coalescing window (or the key starts with "session:", which never times out), the two merge
   * into one step that keeps the earliest `before`.
   * @param {HistoryStep} step
   * @returns {HistoryStep} the recorded (possibly merged) step
   */
  push(step) {
    const now = this.now();
    const top = this.undoStack[this.undoStack.length - 1];
    this.redoStack.length = 0;
    if (top && !this._sealed && step.coalesce && top.coalesce === step.coalesce &&
        (step.coalesce.startsWith('session:') || now - (top.time || 0) <= this.window)) {
      top.after = step.after;
      top.selAfter = step.selAfter;
      top.pageAfter = step.pageAfter;
      top.time = now;
      if (top.before === top.after) this.undoStack.pop();
      return top;
    }
    this._sealed = false;
    const rec = { coalesce: null, ...step, time: now };
    this.undoStack.push(rec);
    if (this.undoStack.length > this.depth) this.undoStack.splice(0, this.undoStack.length - this.depth);
    return rec;
  }

  /** Prevent the next push from merging into the current top step. */
  seal() { this._sealed = true; }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get undoLabel() { const s = this.undoStack[this.undoStack.length - 1]; return s ? s.label : ''; }
  get redoLabel() { const s = this.redoStack[this.redoStack.length - 1]; return s ? s.label : ''; }

  /** Pop a step for undo (moves it to the redo stack). Returns the step or null. */
  undo() {
    const s = this.undoStack.pop();
    if (!s) return null;
    this.redoStack.push(s);
    this._sealed = true;
    return s;
  }

  /** Pop a step for redo (moves it back to the undo stack). Returns the step or null. */
  redo() {
    const s = this.redoStack.pop();
    if (!s) return null;
    this.undoStack.push(s);
    this._sealed = true;
    return s;
  }

  /** Forget everything. */
  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this._sealed = false;
  }
}
