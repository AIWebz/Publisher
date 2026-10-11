// Arrange: grouping, stacking order, alignment, distribution, rotation, flipping, locking, hiding and
// keyboard nudging. Registered on Home and on every contextual Format tab.

import { app } from '../core/app.js';
import { registry } from '../core/registry.js';
import { findElement, unionBounds, walkElements } from '../core/model.js';
import { groupElements, ungroupElement, reorderElements, alignElements, distributeElements, nudgeElements } from '../core/ops.js';
import { rotateEachElement, flipElements, pageMargins } from '../core/geometry.js';
import { sizeRibbonItem } from './core-common.js';
import { prefs } from '../core/prefs.js';

const hasSel = (ctx) => !!(ctx.selection && ctx.selection.length);
const unlocked = (ctx) => hasSel(ctx) && !ctx.selection.some((e) => e.locked);
const roots = (doc) => app.selectionIds.map((id) => findElement(doc, id)).filter(Boolean).map((h) => h.el);

function withSelection(label, fn) {
  if (!app.selectionIds.length) return;
  app.transact(label, (doc) => fn(roots(doc), doc));
}

// ---------------------------------------------------------------- group / order
registry.command({
  id: 'arrange.group', label: 'Group', icon: 'group', shortcut: 'Mod+G',
  enabled: (ctx) => (ctx.selection || []).length > 1 && unlocked(ctx),
  run: () => app.transact('Group', (doc) => {
    const g = groupElements(doc, app.selectionIds);
    if (g) app.select([g.id]);
    else app.ui.toast('Objects on different layers cannot be grouped.');
  })
});
registry.command({
  id: 'arrange.ungroup', label: 'Ungroup', icon: 'ungroup', shortcut: 'Mod+Shift+G',
  enabled: (ctx) => (ctx.selection || []).some((e) => e.type === 'group' && !e.locked),
  run: () => app.transact('Ungroup', (doc) => {
    const ids = [];
    for (const el of roots(doc)) if (el.type === 'group') ids.push(...ungroupElement(doc, el.id)); else ids.push(el.id);
    app.select(ids);
  })
});
for (const [mode, label, icon, key] of [['front', 'Bring to Front', 'bring-front', 'Mod+Shift+]'], ['forward', 'Bring Forward', 'bring-forward', 'Mod+]'],
  ['backward', 'Send Backward', 'send-backward', 'Mod+['], ['back', 'Send to Back', 'send-back', 'Mod+Shift+[']]) {
  registry.command({
    id: `arrange.${mode}`, label, icon, shortcut: key, enabled: hasSel,
    run: () => app.transact(label, (doc) => { reorderElements(doc, app.selectionIds, mode); })
  });
}

// ---------------------------------------------------------------- align / distribute
/** Reference box: the selection when several objects, else the page margins (or page). */
function alignRef(doc, els) {
  const mode = prefs.get('alignTo') || 'auto';
  if (mode === 'page') return { x: 0, y: 0, w: doc.setup.width, h: doc.setup.height };
  if ((mode === 'selection' || mode === 'auto') && els.length > 1) return unionBounds(els);
  const m = pageMargins(doc, Math.max(0, app.pageIndex));
  return { x: m.left, y: m.top, w: doc.setup.width - m.left - m.right, h: doc.setup.height - m.top - m.bottom };
}
for (const [mode, label] of [['left', 'Align Left'], ['center', 'Align Center'], ['right', 'Align Right'], ['top', 'Align Top'], ['middle', 'Align Middle'], ['bottom', 'Align Bottom']]) {
  registry.command({
    id: `arrange.align${mode[0].toUpperCase()}${mode.slice(1)}`, label, icon: `align-${mode}`, enabled: unlocked,
    run: () => withSelection(label, (els, doc) => alignElements(els, mode, alignRef(doc, els)))
  });
}
registry.command({
  id: 'arrange.alignTo', label: 'Align Relative To', icon: 'margins',
  run: (ctx, arg) => prefs.set('alignTo', arg),
  checked: () => false
});
for (const [axis, label] of [['h', 'Distribute Horizontally'], ['v', 'Distribute Vertically']]) {
  registry.command({
    id: `arrange.distribute${axis.toUpperCase()}`, label, icon: `distribute-${axis}`,
    enabled: (ctx) => (ctx.selection || []).length > 2 && unlocked(ctx),
    run: () => withSelection(label, (els) => distributeElements(els, axis))
  });
}

// ---------------------------------------------------------------- rotate / flip
registry.command({ id: 'arrange.rotateLeft', label: 'Rotate Left 90°', icon: 'rotate-left', enabled: unlocked, run: () => withSelection('Rotate', (els) => rotateEachElement(els, -90)) });
registry.command({ id: 'arrange.rotateRight', label: 'Rotate Right 90°', icon: 'rotate-right', enabled: unlocked, run: () => withSelection('Rotate', (els) => rotateEachElement(els, 90)) });
registry.command({
  id: 'arrange.flipH', label: 'Flip Horizontal', icon: 'flip-h', enabled: unlocked,
  run: () => withSelection('Flip', (els) => { const b = unionBounds(els); flipElements(els, 'h', { x: b.x + b.w / 2, y: b.y + b.h / 2 }); })
});
registry.command({
  id: 'arrange.flipV', label: 'Flip Vertical', icon: 'flip-v', enabled: unlocked,
  run: () => withSelection('Flip', (els) => { const b = unionBounds(els); flipElements(els, 'v', { x: b.x + b.w / 2, y: b.y + b.h / 2 }); })
});

// ---------------------------------------------------------------- lock / hide
registry.command({
  id: 'arrange.lock', label: 'Lock', icon: 'lock', shortcut: 'Mod+Shift+L', enabled: hasSel,
  labelFor: (ctx) => ((ctx.selection || []).length && ctx.selection.every((e) => e.locked) ? 'Unlock' : 'Lock'),
  iconFor: (ctx) => ((ctx.selection || []).length && ctx.selection.every((e) => e.locked) ? 'unlock' : 'lock'),
  checked: (ctx) => (ctx.selection || []).length > 0 && ctx.selection.every((e) => e.locked),
  run: (ctx) => {
    const lock = !ctx.selection.every((e) => e.locked);
    withSelection(lock ? 'Lock' : 'Unlock', (els) => els.forEach((e) => { e.locked = lock; }));
  }
});
registry.command({
  id: 'arrange.hide', label: 'Hide', icon: 'eye-off', enabled: hasSel,
  run: () => withSelection('Hide', (els) => { els.forEach((e) => { e.hidden = true; }); app.select([]); })
});
registry.command({
  id: 'arrange.showAll', label: 'Show All Hidden', icon: 'eye',
  enabled: (ctx) => !!ctx.page && ctx.page.elements.some((e) => e.hidden),
  run: () => app.transact('Show All', () => { walkElements(app.page.elements, (e) => { e.hidden = false; }); })
});

// ---------------------------------------------------------------- nudge
for (const [key, dx, dy] of [['ArrowLeft', -1, 0], ['ArrowRight', 1, 0], ['ArrowUp', 0, -1], ['ArrowDown', 0, 1]]) {
  for (const [mod, step] of [['', 1], ['Shift+', 10], ['Alt+', 0.25]]) {
    registry.command({
      id: `arrange.nudge-${mod.replace('+', '')}${key}`, label: 'Nudge', shortcut: `${mod}${key}`, hidden: true,
      enabled: unlocked,
      run: () => app.transact('Nudge', (doc) => nudgeElements(roots(doc), dx * step, dy * step), { coalesce: 'nudge' })
    });
  }
}

// ---------------------------------------------------------------- ribbon
const arrangeItems = [
  { command: 'arrange.front', size: 'small' }, { command: 'arrange.back', size: 'small' }, { command: 'arrange.group', size: 'small' },
  { command: 'arrange.forward', size: 'small' }, { command: 'arrange.backward', size: 'small' }, { command: 'arrange.ungroup', size: 'small' },
  {
    type: 'menu', label: 'Align', icon: 'align-left', size: 'small', items: () => [
      { label: 'Align Left', icon: 'align-left', command: 'arrange.alignLeft' },
      { label: 'Align Center', icon: 'align-center', command: 'arrange.alignCenter' },
      { label: 'Align Right', icon: 'align-right', command: 'arrange.alignRight' },
      '-',
      { label: 'Align Top', icon: 'align-top', command: 'arrange.alignTop' },
      { label: 'Align Middle', icon: 'align-middle', command: 'arrange.alignMiddle' },
      { label: 'Align Bottom', icon: 'align-bottom', command: 'arrange.alignBottom' },
      '-',
      { label: 'Distribute Horizontally', icon: 'distribute-h', command: 'arrange.distributeH' },
      { label: 'Distribute Vertically', icon: 'distribute-v', command: 'arrange.distributeV' },
      '-',
      { label: 'Relative to Selection (or Margins)', command: 'arrange.alignTo', arg: 'auto', checked: (prefs.get('alignTo') || 'auto') === 'auto' },
      { label: 'Relative to Margins', command: 'arrange.alignTo', arg: 'margins', checked: prefs.get('alignTo') === 'margins' },
      { label: 'Relative to Page', command: 'arrange.alignTo', arg: 'page', checked: prefs.get('alignTo') === 'page' }
    ]
  },
  {
    type: 'menu', label: 'Rotate', icon: 'rotate', size: 'small', items: () => [
      { label: 'Rotate Right 90°', icon: 'rotate-right', command: 'arrange.rotateRight' },
      { label: 'Rotate Left 90°', icon: 'rotate-left', command: 'arrange.rotateLeft' },
      { label: 'Flip Horizontal', icon: 'flip-h', command: 'arrange.flipH' },
      { label: 'Flip Vertical', icon: 'flip-v', command: 'arrange.flipV' }
    ]
  },
  { command: 'arrange.lock', size: 'small' }
];
registry.group({ tab: 'home', id: 'arrange', label: 'Arrange', order: 70, items: arrangeItems });
for (const tab of ['textFormat', 'pictureFormat', 'shapeFormat', 'tableLayout']) {
  registry.group({ tab, id: 'arrange', label: 'Arrange', order: 80, items: arrangeItems });
  registry.group({ tab, id: 'size', label: 'Size', order: 90, items: [sizeRibbonItem()] });
}
