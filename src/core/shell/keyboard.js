// Global keyboard shortcut dispatch from registry.shortcut bindings. While text is being edited or
// a form field has focus only combos with Mod/Ctrl/Alt are dispatched (commands can opt in or out
// with allowInText; nativeInText leaves the key to the browser). Clipboard commands
// (nativeClipboard) let the native copy/cut/paste event run so the OS clipboard is used.

import { app } from '../app.js';
import { registry } from '../registry.js';
import { eventCombo, isTextTarget } from '../shortcuts.js';
import { dialogOpen } from '../ui/dialog.js';
import { expectNativeClipboard } from '../canvas/clipboard.js';

/**
 * Decide whether a command bound to `combo` should run for a key event.
 * @param {object} cmd registry command
 * @param {string} combo canonical combo
 * @param {{ textTarget: boolean, backstage: boolean }} where
 * @returns {boolean}
 */
export function shouldDispatch(cmd, combo, where) {
  const hasMod = /(^|\+)(mod|ctrl|meta|alt)\+/.test(combo) || /^f\d+$/.test(combo);
  if (where.textTarget) {
    if (cmd.nativeInText) return false;
    if (cmd.allowInText === false) return false;
    if (!hasMod && cmd.allowInText !== true) return false;
  }
  if (where.backstage && !cmd.global && !cmd.allowInBackstage) return false;
  return true;
}

/** Install the window keydown dispatcher. */
export function installKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing || dialogOpen()) return;
    if (document.querySelector('.menu, .color-pop')) return;
    const combo = eventCombo(e);
    const id = registry.commandForCombo(combo);
    if (!id) return;
    const cmd = registry.getCommand(id);
    if (!cmd) return;
    const textTarget = isTextTarget(e.target);
    const backstage = !!(app.ui.backstage && app.ui.backstage.isOpen);
    if (!shouldDispatch(cmd, combo, { textTarget, backstage })) return;
    if (cmd.nativeClipboard && !textTarget) {
      if (app.isEnabled(id)) expectNativeClipboard(() => app.exec(id));
      return;
    }
    e.preventDefault();
    if (!app.isEnabled(id)) return;
    app.exec(id);
  });
}
