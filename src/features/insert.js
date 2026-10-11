// Insert tab (core part): text boxes, pictures, picture placeholders, shapes, lines, pages.

import { app } from '../core/app.js';
import { registry } from '../core/registry.js';
import { findElement, SHAPE_KINDS } from '../core/model.js';
import { insertObject, insertPictures, fillPicture } from '../core/insert.js';
import { pickImageFiles } from '../core/images.js';
import { SHAPE_LABELS } from '../core/render/shapes.js';

const hasDoc = (ctx) => !!ctx.doc;

registry.command({
  id: 'insert.textBox', label: 'Draw Text Box', icon: 'text-box', title: 'Drag on the page to draw a text box, or click to place one.',
  enabled: hasDoc, checked: () => app.canvas && typeof app.canvas.tool === 'object' && app.canvas.tool.kind === 'text',
  run: () => app.canvas.setTool({ kind: 'text' })
});
registry.command({
  id: 'insert.picture', label: 'Pictures', icon: 'picture', title: 'Insert pictures from files on this computer.', enabled: hasDoc,
  run: async (ctx, given) => {
    const files = given && given.length ? [...given] : await pickImageFiles({ multiple: true });
    if (files && files.length) await insertPictures(files);
  }
});
registry.command({
  id: 'insert.placeholder', label: 'Picture Placeholder', icon: 'picture-placeholder', title: 'Insert an empty picture frame you can fill later.', enabled: hasDoc,
  run: () => insertObject({ kind: 'picture' })
});
registry.command({
  id: 'insert.shape', label: 'Shapes', icon: 'shapes', enabled: hasDoc,
  run: (ctx, arg) => app.canvas.setTool({ kind: 'shape', shape: arg || 'rect' })
});
registry.command({ id: 'insert.line', label: 'Line', icon: 'line', enabled: hasDoc, run: () => app.canvas.setTool({ kind: 'line' }) });
registry.command({ id: 'insert.arrow', label: 'Arrow', icon: 'arrow-line', enabled: hasDoc, run: () => app.canvas.setTool({ kind: 'line', arrow: true }) });

/** Change or fill the selected picture frame from a file. */
registry.command({
  id: 'picture.change', label: 'Change Picture', icon: 'replace-picture',
  enabled: (ctx) => (ctx.selection || []).length === 1 && ctx.selection[0].type === 'image',
  run: async (ctx) => {
    const el = ctx.selection[0];
    const files = await pickImageFiles({ multiple: false });
    if (files && files[0]) await fillPicture(el.id, files[0]);
  }
});
registry.command({
  id: 'picture.reset', label: 'Reset Picture', icon: 'reset-picture',
  enabled: (ctx) => (ctx.selection || []).length === 1 && ctx.selection[0].type === 'image' && !!ctx.selection[0].assetId,
  run: (ctx) => app.transact('Reset Picture', (doc) => {
    const hit = findElement(doc, ctx.selection[0].id);
    if (!hit) return;
    hit.el.content = null; hit.el.fit = 'fill'; hit.el.adjust = undefined; hit.el.flipH = false; hit.el.flipV = false;
  })
});

const shapeMenu = () => [
  ...SHAPE_KINDS.map((k) => ({ label: SHAPE_LABELS[k] || k, icon: 'shapes', command: 'insert.shape', arg: k })),
  '-',
  { label: 'Line', icon: 'line', command: 'insert.line' },
  { label: 'Arrow', icon: 'arrow-line', command: 'insert.arrow' }
];

registry.group({ tab: 'insert', id: 'pages', label: 'Pages', order: 5, items: [
  { command: 'page.insertAfter', size: 'large', label: 'Page' },
  { command: 'page.duplicate', size: 'small' }, { command: 'page.delete', size: 'small' }
] });
registry.group({ tab: 'insert', id: 'illustrations', label: 'Illustrations', order: 20, items: [
  { command: 'insert.picture', size: 'large' },
  { command: 'insert.placeholder', size: 'small' },
  { type: 'menu', label: 'Shapes', icon: 'shapes', size: 'small', items: shapeMenu },
  { command: 'insert.line', size: 'small' }
] });
registry.group({ tab: 'insert', id: 'text', label: 'Text', order: 30, items: [
  { command: 'insert.textBox', size: 'large', label: 'Text Box' }
] });
registry.group({ tab: 'home', id: 'objects', label: 'Objects', order: 60, items: [
  { command: 'insert.textBox', size: 'large', label: 'Text Box' },
  { command: 'insert.picture', size: 'small' },
  { type: 'menu', label: 'Shapes', icon: 'shapes', size: 'small', items: shapeMenu },
  { command: 'insert.placeholder', size: 'small', label: 'Placeholder' }
] });
