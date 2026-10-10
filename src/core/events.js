// Minimal synchronous event emitter used by the app store and the registry.

/** A tiny event emitter. Listener errors are caught and logged so one feature cannot break another. */
export class Emitter {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {Function} fn
   * @returns {() => void} unsubscribe function
   */
  on(event, fn) {
    if (typeof fn !== 'function') throw new TypeError('Listener must be a function');
    let set = this._listeners.get(event);
    if (!set) this._listeners.set(event, (set = new Set()));
    set.add(fn);
    return () => this.off(event, fn);
  }

  /** Subscribe for a single emission. */
  once(event, fn) {
    const off = this.on(event, (...args) => { off(); fn(...args); });
    return off;
  }

  /** Remove a listener. */
  off(event, fn) {
    const set = this._listeners.get(event);
    if (set) set.delete(fn);
  }

  /** Call every listener of `event` with `args`. */
  emit(event, ...args) {
    const set = this._listeners.get(event);
    if (!set || !set.size) return;
    for (const fn of [...set]) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`Error in "${event}" listener:`, err);
      }
    }
  }

  /** Number of listeners for an event (used by tests). */
  listenerCount(event) {
    const set = this._listeners.get(event);
    return set ? set.size : 0;
  }
}
