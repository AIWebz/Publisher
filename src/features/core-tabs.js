// Built-in ribbon tabs (File is the backstage button). Contextual tabs appear, accent coloured, while
// the selection matches.

import { registry } from '../core/registry.js';
import { allOf, selected } from './core-common.js';

registry.tab({ id: 'home', label: 'Home', order: 10 });
registry.tab({ id: 'insert', label: 'Insert', order: 20 });
registry.tab({ id: 'pageDesign', label: 'Page Design', order: 30 });
registry.tab({ id: 'mailings', label: 'Mailings', order: 40 });
registry.tab({ id: 'review', label: 'Review', order: 50 });
registry.tab({ id: 'view', label: 'View', order: 60 });

const isTable = (ctx) => !ctx.editing && selected(ctx).length === 1 && selected(ctx)[0].type === 'table';

registry.tab({
  id: 'textFormat', label: 'Text Box Format', caption: 'Text Box Tools', order: 100, accent: '#2b6b64',
  contextual: (ctx) => !!ctx.editing || allOf(ctx, ['text'])
});
registry.tab({
  id: 'pictureFormat', label: 'Picture Format', caption: 'Picture Tools', order: 110, accent: '#8a5a2b',
  contextual: (ctx) => !ctx.editing && allOf(ctx, ['image'])
});
registry.tab({
  id: 'shapeFormat', label: 'Shape Format', caption: 'Drawing Tools', order: 120, accent: '#5a3e6b',
  contextual: (ctx) => !ctx.editing && allOf(ctx, ['shape', 'line'])
});
registry.tab({ id: 'tableDesign', label: 'Table Design', caption: 'Table Tools', order: 130, accent: '#2c4a6e', contextual: isTable });
registry.tab({ id: 'tableLayout', label: 'Table Layout', caption: 'Table Tools', order: 131, accent: '#2c4a6e', contextual: isTable });
