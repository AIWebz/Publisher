// Per-user application preferences (view toggles, theme, recent colours…), kept in localStorage.
// Document-specific state lives in the document or its session, never here.

import { Emitter } from './events.js';

const KEY = 'folio:prefs:v2';

const DEFAULTS = {
  theme: 'system',            // 'system' | 'light' | 'dark'
  rulers: true,
  guides: { margins: true, columns: true, ruler: true, grid: false, boundaries: true },
  snap: { enabled: true, objects: true, guides: true, grid: true, page: true },
  alignTo: 'auto',            // 'auto' (selection when 2+, else margins) | 'page' | 'margins' | 'selection'
  showHidden: false,
  ribbonCollapsed: false,
  pagesPanel: true,
  rightPanel: true,
  rightTab: 'format',
  recentColors: [],
  nudge: 1
};

const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);

function merge(base, over) {
  const out = { ...base };
  if (!isObj(over)) return out;
  for (const [k, v] of Object.entries(over)) {
    if (!(k in base)) continue;
    out[k] = isObj(base[k]) ? merge(base[k], v) : typeof v === typeof base[k] || base[k] === null ? v : base[k];
  }
  return out;
}

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

class Prefs extends Emitter {
  constructor() {
    super();
    let saved = null;
    try { saved = JSON.parse(storage()?.getItem(KEY) || 'null'); } catch { saved = null; }
    this.values = merge(DEFAULTS, saved);
  }

  /** Read a preference by dotted path ("guides.grid"). */
  get(path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), this.values);
  }

  /** Set a preference by dotted path, persist and emit 'change'. */
  set(path, value) {
    const keys = path.split('.');
    let o = this.values;
    for (const k of keys.slice(0, -1)) o = o[k];
    if (o[keys[keys.length - 1]] === value) return;
    o[keys[keys.length - 1]] = value;
    try { storage()?.setItem(KEY, JSON.stringify(this.values)); } catch { /* storage full or blocked */ }
    this.emit('change', path, value);
  }

  /** Toggle a boolean preference. */
  toggle(path) { this.set(path, !this.get(path)); }

  /** Remember a recently used custom colour (most recent first, max 8). */
  addRecentColor(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color || '')) return;
    const list = [color.toLowerCase(), ...this.values.recentColors.filter((c) => c !== color.toLowerCase())].slice(0, 8);
    this.set('recentColors', list);
  }
}

/** Application preferences singleton. */
export const prefs = new Prefs();
