// Autosave of recovery copies: one copy per open document, written a few seconds after changes
// (coalesced; only when the content changed since the last copy), removed when the document is
// saved or closed cleanly. Pure logic with injectable storage and timers (unit-tested in node).

import { snapshotDoc } from '../history.js';
import { hashString } from '../hash.js';
import { serialize } from '../model.js';

/** Default delay between a change and its recovery write (ms). */
export const RECOVERY_DELAY = 3000;

/**
 * @typedef {object} RecoveryStorage
 * @property {(id: string, text: string, meta: object) => Promise<any>} save
 * @property {(id: string) => Promise<any>} remove
 */

/** Coalescing recovery-copy writer. */
export class RecoveryManager {
  /**
   * @param {{ storage: RecoveryStorage, delay?: number, setTimer?: Function, clearTimer?: Function,
   *           now?: () => number, instance?: string, onError?: (err: Error) => void }} opts
   */
  constructor(opts) {
    this.storage = opts.storage;
    this.delay = opts.delay ?? RECOVERY_DELAY;
    this.setTimer = opts.setTimer || ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer || ((t) => clearTimeout(t));
    this.now = opts.now || (() => Date.now());
    this.instance = opts.instance || null;
    this.onError = opts.onError || ((err) => console.error('Recovery copy failed', err));
    this.enabled = true;
    /** @type {Map<string, { session: any, timer: any, writing: Promise<any>|null, again: boolean, hash: string|null, stored: boolean, dead: boolean }>} */
    this.states = new Map();
    /** Number of copies written (for tests and diagnostics). */
    this.writes = 0;
  }

  _state(session) {
    let st = this.states.get(session.id);
    if (!st) this.states.set(session.id, (st = { session, timer: null, writing: null, again: false, hash: null, stored: false, dead: false }));
    st.session = session;
    return st;
  }

  /** Note that `session` changed: a copy is written after the delay (several changes coalesce). */
  schedule(session) {
    if (!this.enabled || !session) return;
    const st = this._state(session);
    if (st.dead || st.timer) return;
    st.timer = this.setTimer(() => { st.timer = null; this._run(st); }, this.delay);
  }

  /** Write (or remove) the copy for `session` now. Resolves when stored. */
  async flushNow(session) {
    const st = this._state(session);
    if (st.timer) { this.clearTimer(st.timer); st.timer = null; }
    await this._run(st);
    while (st.writing) await st.writing;
  }

  /** Write every pending copy now (e.g. when the page is hidden). */
  async flushAll() {
    await Promise.all([...this.states.values()].filter((st) => st.timer || st.writing).map((st) => this.flushNow(st.session)));
  }

  _run(st) {
    if (st.dead || !this.enabled) return Promise.resolve();
    if (st.writing) { st.again = true; return st.writing; }
    const s = st.session;
    let job;
    if (!s.dirty) {
      if (!st.stored) return Promise.resolve();
      job = this.storage.remove(s.id).then(() => { st.stored = false; st.hash = null; });
    } else {
      const hash = hashString(snapshotDoc(s.doc));
      if (hash === st.hash && st.stored) return Promise.resolve();
      const text = serialize(s.doc);
      const meta = {
        title: s.displayName || s.doc.title || 'Untitled publication',
        filePath: s.filePath || null,
        fileName: s.fileName || null,
        pages: s.doc.pages.length,
        instance: this.instance,
        savedAt: this.now()
      };
      job = Promise.resolve(this.storage.save(s.id, text, meta)).then(() => { st.hash = hash; st.stored = true; this.writes++; });
    }
    st.writing = job.catch((err) => this.onError(err)).finally(() => {
      st.writing = null;
      if (st.again && !st.dead) { st.again = false; this._run(st); }
    });
    return st.writing;
  }

  /**
   * Stop autosaving `session` and delete its copy (after any write in flight). Call when the
   * document was saved and is clean, or closed without saving.
   */
  async discard(session) {
    const st = this.states.get(session.id);
    if (st) {
      st.dead = true;
      if (st.timer) { this.clearTimer(st.timer); st.timer = null; }
      while (st.writing) await st.writing;
      this.states.delete(session.id);
    }
    try { await this.storage.remove(session.id); } catch (err) { this.onError(err); }
  }

  /** After a save: drop the copy if the document is clean now, else keep autosaving. */
  async saved(session) {
    const st = this._state(session);
    if (session.dirty) { this.schedule(session); return; }
    if (st.timer) { this.clearTimer(st.timer); st.timer = null; }
    while (st.writing) await st.writing;
    if (session.dirty) { this.schedule(session); return; }
    try { await this.storage.remove(session.id); } catch (err) { this.onError(err); }
    st.stored = false;
    st.hash = null;
  }

  /** True while a copy is waiting to be written or being written. */
  pending(session) {
    const st = this.states.get(session.id);
    return !!(st && (st.timer || st.writing));
  }
}

/**
 * Pick the recovery entries to offer at startup: skip ids of documents open in this window and
 * (web) entries owned by another live browser tab.
 * @param {object[]} entries recovery.list() result
 * @param {{ openIds?: Set<string>, instance?: string|null, isAlive?: (instance: string) => boolean }} [opts]
 */
export function recoverableEntries(entries, { openIds = new Set(), instance = null, isAlive = () => false } = {}) {
  return (entries || []).filter((e) => e && e.id && !openIds.has(e.id) &&
    !(e.instance && e.instance !== instance && isAlive(e.instance)));
}
