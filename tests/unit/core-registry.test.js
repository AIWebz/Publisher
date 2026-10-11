import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Registry, tabKey } from '../../src/core/registry.js';
import { normalizeCombo, eventCombo, formatCombo, isTextTarget } from '../../src/core/shortcuts.js';

test('tab ids are matched tolerantly', () => {
  assert.equal(tabKey('pageDesign'), 'pagedesign');
  assert.equal(tabKey('page-design'), 'pagedesign');
  assert.equal(tabKey('Design'), 'pagedesign');
  assert.equal(tabKey('Text Box Tools'), 'textformat');
  assert.equal(tabKey('picture'), 'pictureformat');
  assert.equal(tabKey('table-layout'), 'tablelayout');
});

test('groups attach to tabs by tolerant id and sort by order', async () => {
  const r = new Registry();
  r.tab({ id: 'pageDesign', label: 'Page Design', order: 30 });
  r.group({ tab: 'page-design', id: 'b', label: 'B', order: 20, items: ['cmd.x'] });
  r.group({ tab: 'design', id: 'a', label: 'A', order: 10, items: [] });
  assert.deepEqual(r.groupsFor('pageDesign').map((g) => g.id), ['a', 'b']);
  assert.deepEqual(r.groupsFor('pageDesign')[1].items, [{ command: 'cmd.x', size: 'small' }]);
  await Promise.resolve();
  let kinds = null;
  r.on('change', (k) => { kinds = k; });
  r.tab({ id: 'design', label: 'Renamed' });
  await Promise.resolve();
  assert.deepEqual(kinds, ['tab']);
  assert.equal(r.getTab('pageDesign').label, 'Renamed');
  assert.equal(r.tabList().length, 1);
});

test('commands register their shortcuts; later bindings win', () => {
  const r = new Registry();
  r.command({ id: 'a', label: 'A', shortcut: 'Mod+Shift+L', run() {} });
  assert.equal(r.commandForCombo('mod+shift+l'), 'a');
  r.shortcut('mod+shift+l', 'b');
  assert.equal(r.commandForCombo('mod+shift+l'), 'b');
  assert.equal(r.shortcutFor('b'), 'mod+shift+l');
  assert.throws(() => r.command({ id: 'x' }));
});

test('element types merge on re-registration', () => {
  const r = new Registry();
  const render = () => {};
  r.elementType('text', { label: 'Text', render });
  r.elementType('text', { onDoubleClick: () => 1 });
  const t = r.getElementType('text');
  assert.equal(t.render, render);
  assert.equal(t.onDoubleClick(), 1);
});

test('shortcut normalisation, event matching and display', () => {
  assert.equal(normalizeCombo('Shift+Mod+L'), 'mod+shift+l');
  assert.equal(normalizeCombo('Ctrl+Plus'), 'ctrl+=');
  assert.equal(normalizeCombo('Mod+]'), 'mod+]');
  assert.equal(normalizeCombo('Mod++'), 'mod+=');
  const ev = { ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, code: 'KeyZ', key: 'Z' };
  assert.equal(eventCombo(ev, false), 'mod+shift+z');
  assert.equal(eventCombo({ ...ev, ctrlKey: false, metaKey: true }, true), 'mod+shift+z');
  assert.equal(eventCombo({ ctrlKey: true, code: 'Equal', key: '=' }, false), 'mod+=');
  assert.equal(eventCombo({ code: 'PageDown', key: 'PageDown' }, false), 'pagedown');
  assert.equal(formatCombo('mod+shift+s', false), 'Ctrl+Shift+S');
  assert.equal(formatCombo('mod+shift+s', true), '⌘⇧S');
  assert.equal(formatCombo('delete', false), 'Del');
  assert.equal(isTextTarget(null), false);
  assert.equal(isTextTarget({ nodeType: 1, tagName: 'INPUT', type: 'range' }), false);
  assert.equal(isTextTarget({ nodeType: 1, tagName: 'INPUT', type: 'text' }), true);
});
