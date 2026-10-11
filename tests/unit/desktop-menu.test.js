// macOS application menu (desktop/main.js buildMenuTemplate): every role and accelerator must be
// one Electron accepts, no shortcut may be bound twice, and command items forward to the renderer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildMenuTemplate } = require('../../desktop/main.js');

// Electron MenuItem roles (electron/docs/api/menu-item.md).
const ROLES = new Set(['undo', 'redo', 'cut', 'copy', 'paste', 'pasteAndMatchStyle', 'delete', 'selectAll', 'reload',
  'forceReload', 'toggleDevTools', 'resetZoom', 'zoomIn', 'zoomOut', 'toggleSpellChecker', 'togglefullscreen', 'window',
  'minimize', 'close', 'help', 'about', 'services', 'hide', 'hideOthers', 'unhide', 'quit', 'showSubstitutions',
  'toggleSmartQuotes', 'toggleSmartDashes', 'toggleTextReplacement', 'startSpeaking', 'stopSpeaking', 'zoom', 'front',
  'appMenu', 'fileMenu', 'editMenu', 'viewMenu', 'shareMenu', 'recentDocuments', 'toggleTabBar', 'selectNextTab',
  'selectPreviousTab', 'showAllTabs', 'mergeAllWindows', 'clearRecentDocuments', 'moveTabToNewWindow', 'windowMenu']);
const MODIFIERS = new Set(['Command', 'Cmd', 'Control', 'Ctrl', 'CommandOrControl', 'CmdOrCtrl', 'Alt', 'Option', 'AltGr', 'Shift', 'Super', 'Meta']);
const KEY = /^([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|[)!@#$%^&*(:;:+=<,_\-.>?/~`{\]}|\\'"[]|Plus|Space|Tab|Capslock|Numlock|Scrolllock|Backspace|Delete|Insert|Return|Enter|Up|Down|Left|Right|Home|End|PageUp|PageDown|Escape|Esc|PrintScreen|num[0-9]|numdec|numadd|numsub|nummult|numdiv)$/;

function* walk(items) {
  for (const it of items) {
    yield it;
    if (Array.isArray(it.submenu)) yield* walk(it.submenu);
  }
}

/** Canonical accelerator (modifier aliases folded, sorted) for duplicate detection on macOS. */
function canon(acc) {
  const parts = acc.split('+');
  const key = parts.pop();
  const fold = { Command: 'Cmd', CommandOrControl: 'Cmd', CmdOrCtrl: 'Cmd', Control: 'Ctrl', Option: 'Alt', Super: 'Cmd', Meta: 'Cmd' };
  return [...new Set(parts.map((m) => fold[m] || m))].sort().concat(key.toUpperCase()).join('+');
}

const templates = {
  'all commands': buildMenuTemplate({ send: () => {} }),
  'development build': buildMenuTemplate({ isDev: true, send: () => {} }),
  'few commands': buildMenuTemplate({ available: new Set(['file.open']), send: () => {} })
};

for (const [name, tpl] of Object.entries(templates)) {
  test(`menu template (${name}): valid roles and accelerators, no duplicates`, () => {
    const seen = new Map();
    for (const it of walk(tpl)) {
      if (it.role) assert.ok(ROLES.has(it.role), `unknown role ${it.role}`);
      if (it.type) assert.ok(['normal', 'separator', 'submenu', 'checkbox', 'radio'].includes(it.type), it.type);
      if (it.type !== 'separator') assert.ok(it.label || it.role, 'item has a label or role');
      if (it.submenu) assert.ok(Array.isArray(it.submenu), 'submenu is a list');
      if (it.accelerator) {
        const parts = it.accelerator.split('+');
        const key = parts.pop();
        for (const m of parts) assert.ok(MODIFIERS.has(m), `modifier ${m} in ${it.accelerator}`);
        assert.match(key, KEY, `key in ${it.accelerator}`);
        const c = canon(it.accelerator);
        assert.ok(!seen.has(c), `${it.accelerator} bound to both "${seen.get(c)}" and "${it.label}"`);
        seen.set(c, it.label);
      }
    }
    // No empty or separator-only submenus, no leading/trailing/double separators.
    for (const it of walk(tpl)) {
      if (!Array.isArray(it.submenu) || it.role === 'recentDocuments') continue;
      const sub = it.submenu;
      if (!sub.length) continue;
      assert.notEqual(sub[0].type, 'separator', `${it.label || it.role} starts with a separator`);
      assert.notEqual(sub.at(-1).type, 'separator', `${it.label || it.role} ends with a separator`);
      sub.forEach((s, i) => assert.ok(!(s.type === 'separator' && sub[i + 1]?.type === 'separator'), 'double separator'));
    }
  });
}

test('macOS conventions: app menu first (About, Hide, Quit), then File, Edit, View, Window, Help', () => {
  const tpl = templates['all commands'];
  const roles = [...walk(tpl[0].submenu)].map((i) => i.role).filter(Boolean);
  for (const r of ['about', 'services', 'hide', 'hideOthers', 'unhide', 'quit']) assert.ok(roles.includes(r), r);
  assert.equal(tpl[1].label, 'File');
  assert.equal(tpl[2].label, 'Edit');
  assert.ok(tpl.some((m) => m.role === 'windowMenu'));
  assert.equal(tpl.at(-1).role, 'help');
  const edit = tpl[2].submenu.map((i) => i.role);
  for (const r of ['cut', 'copy', 'paste', 'selectAll']) assert.ok(edit.includes(r), `Edit › ${r} keeps native text fields working`);
});

test('command items forward their app command id to the renderer and hide when unregistered', () => {
  const sent = [];
  const tpl = buildMenuTemplate({ send: (id) => sent.push(id) });
  const cmds = [...walk(tpl)].filter((i) => typeof i.click === 'function');
  assert.ok(cmds.length >= 5);
  for (const it of cmds) {
    assert.match(it.id, /^cmd:[a-z]+\.[A-Za-z]+$/, it.label);
    it.click();
    assert.equal(sent.at(-1), it.id.slice(4));
  }
  const few = buildMenuTemplate({ available: new Set(['file.open']), send: () => {} });
  const ids = [...walk(few)].filter((i) => i.id).map((i) => i.id);
  assert.deepEqual(ids.filter((id) => id.startsWith('cmd:')), ['cmd:file.open']);
});

test('developer items only in development builds', () => {
  const roles = (t) => [...walk(t)].map((i) => i.role);
  assert.ok(!roles(templates['all commands']).includes('toggleDevTools'));
  assert.ok(roles(templates['development build']).includes('toggleDevTools'));
});
