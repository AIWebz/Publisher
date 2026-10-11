// Keyboard shortcut parsing, matching and display. "Mod" means Cmd on macOS and Ctrl elsewhere.

const KEY_ALIASES = {
  plus: '=', '+': '=', equal: '=', equals: '=', minus: '-', esc: 'escape', del: 'delete', ins: 'insert',
  up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright', space: ' ', spacebar: ' ',
  return: 'enter', pgup: 'pageup', pgdn: 'pagedown', pageup: 'pageup', pagedown: 'pagedown',
  comma: ',', period: '.', slash: '/', backslash: '\\', semicolon: ';', quote: "'", backquote: '`',
  bracketleft: '[', bracketright: ']', cmd: 'mod', command: 'mod', control: 'ctrl', option: 'alt', opt: 'alt'
};

const CODE_KEYS = {
  Equal: '=', Minus: '-', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
  Comma: ',', Period: '.', Slash: '/', Backquote: '`', Space: ' ', NumpadAdd: '=', NumpadSubtract: '-',
  Numpad0: '0', Numpad1: '1', Numpad2: '2', Numpad3: '3', Numpad4: '4', Numpad5: '5', Numpad6: '6', Numpad7: '7',
  Numpad8: '8', Numpad9: '9', NumpadEnter: 'enter', NumpadDecimal: '.', NumpadMultiply: '*', NumpadDivide: '/'
};

/** True when running on macOS (renderer or Electron). */
export function isMac() {
  if (typeof globalThis.folioDesktop === 'object' && globalThis.folioDesktop) return globalThis.folioDesktop.platform === 'darwin';
  const nav = globalThis.navigator;
  if (!nav) return false;
  const p = (nav.userAgentData && nav.userAgentData.platform) || nav.platform || '';
  return /mac/i.test(p);
}

/**
 * Normalise a combo string such as "Mod+Shift+L" or "ctrl+=" into a canonical form
 * ("mod+shift+l"). Modifiers are ordered mod, ctrl, meta, alt, shift.
 * @param {string} combo
 * @returns {string}
 */
export function normalizeCombo(combo) {
  const parts = String(combo).split(/\+(?!$)/).map((p) => p.trim().toLowerCase()).filter(Boolean);
  const mods = new Set();
  let key = '';
  for (let p of parts) {
    p = KEY_ALIASES[p] ?? p;
    if (['mod', 'ctrl', 'meta', 'alt', 'shift'].includes(p)) mods.add(p);
    else key = p;
  }
  if (!key) throw new Error(`Shortcut "${combo}" has no key`);
  return ['mod', 'ctrl', 'meta', 'alt', 'shift'].filter((m) => mods.has(m)).concat(key).join('+');
}

/** Key name for a KeyboardEvent (layout-independent for letters and digits). */
export function eventKey(e) {
  const code = e.code || '';
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1].toLowerCase();
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1];
  if (CODE_KEYS[code]) return CODE_KEYS[code];
  const k = (e.key || '').toLowerCase();
  if (k === '+') return '=';
  if (k === 'spacebar') return ' ';
  return k;
}

/**
 * Canonical combo string for a keyboard event.
 * @param {KeyboardEvent} e
 * @param {boolean} [mac]
 */
export function eventCombo(e, mac = isMac()) {
  const mods = [];
  if (mac ? e.metaKey : e.ctrlKey) mods.push('mod');
  if (mac && e.ctrlKey) mods.push('ctrl');
  if (!mac && e.metaKey) mods.push('meta');
  if (e.altKey) mods.push('alt');
  if (e.shiftKey) mods.push('shift');
  return mods.concat(eventKey(e)).join('+');
}

const KEY_LABELS = {
  arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', escape: 'Esc', delete: 'Del', backspace: 'Backspace',
  pageup: 'PgUp', pagedown: 'PgDn', enter: 'Enter', ' ': 'Space', tab: 'Tab', insert: 'Ins', home: 'Home', end: 'End'
};

/**
 * Human-readable shortcut ("Ctrl+Shift+L" or "⌘⇧L").
 * @param {string} combo
 * @param {boolean} [mac]
 */
export function formatCombo(combo, mac = isMac()) {
  const parts = normalizeCombo(combo).split('+');
  const key = parts.pop();
  const label = KEY_LABELS[key] || (key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1));
  if (mac) {
    const sym = { mod: '⌘', ctrl: '⌃', meta: '⌘', alt: '⌥', shift: '⇧' };
    return parts.map((p) => sym[p]).join('') + label;
  }
  const names = { mod: 'Ctrl', ctrl: 'Ctrl', meta: 'Win', alt: 'Alt', shift: 'Shift' };
  return parts.map((p) => names[p]).concat(label).join('+');
}

/** True if the event target is a text-entry control or contenteditable. */
export function isTextTarget(t) {
  if (!t || t.nodeType !== 1) return false;
  if (t.isContentEditable) return true;
  if (t.tagName === 'TEXTAREA') return true;
  if (t.tagName === 'SELECT') return true;
  if (t.tagName === 'INPUT') {
    const type = (t.type || 'text').toLowerCase();
    return !['button', 'checkbox', 'radio', 'range', 'color', 'submit', 'reset', 'file', 'image'].includes(type);
  }
  return false;
}
