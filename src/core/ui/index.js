// Installs the UI services into app.ui (toast, dialogs, menus, colour picker) and global behaviours
// (icons, tooltips, live translation of the interface into the display language).

import { app } from '../app.js';
import { toast } from './toast.js';
import { dialog, confirm, prompt, alert, dialogOpen } from './dialog.js';
import { colorPicker } from './colorpicker.js';
import { contextMenu, openMenu, closeMenus } from './menu.js';
import { installSprite } from './icons.js';
import { installTooltips } from './tooltip.js';
import { installTranslation } from './translate.js';

/** Install UI services. Call once at boot, after the DOM is ready. */
export function installUI() {
  installSprite();
  installTooltips();
  installTranslation();
  Object.assign(app.ui, {
    toast: (msg, action, opts) => toast(msg, action, opts),
    dialog: (opts) => dialog({ unit: app.doc ? app.doc.setup.units : 'in', doc: app.doc, ...opts }),
    confirm,
    prompt: (title, label, value, opts = {}) => prompt(title, label, value, { unit: app.doc ? app.doc.setup.units : 'in', ...opts }),
    alert,
    colorPicker,
    contextMenu,
    menu: openMenu,
    closeMenus,
    dialogOpen
  });
}
