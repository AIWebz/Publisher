// Builds the application window: title bar, ribbon, document tabs, pages panel, canvas, right
// panel, status bar and backstage; installs UI services, keyboard dispatch, theme handling, the
// desktop bridge (doc state, close requests, menu commands) and the print fallback.

import { app } from '../app.js';
import { prefs } from '../prefs.js';
import { $ } from '../ui/dom.js';
import { installUI } from '../ui/index.js';
import { installCanvas } from '../canvas/index.js';
import { buildTitlebar } from './titlebar.js';
import { Ribbon } from './ribbon.js';
import { buildDocTabs } from './doctabs.js';
import { buildPagesPanel } from './pagespanel.js';
import { buildRightPanel } from './rightpanel.js';
import { buildStatusBar } from './statusbar.js';
import { buildBackstage } from './backstage.js';
import { installKeyboard } from './keyboard.js';
import { installTheme } from './theme.js';
import { installDesktopBridge } from './desktop.js';
import { installPrintFallback } from './print.js';

/** Platform as seen by the renderer: 'win32' | 'darwin' | 'linux' | 'web'. */
export function shellPlatform() {
  const d = globalThis.folioDesktop;
  return d && d.platform ? d.platform : 'web';
}

/**
 * Build the shell into the mount points of app/index.html.
 * @returns {{ ribbon: Ribbon, canvas: object }}
 */
export function buildShell() {
  const os = shellPlatform();
  document.body.classList.add(os === 'web' ? 'is-web' : 'is-desktop', `os-${os}`);
  installUI();
  installTheme();
  buildTitlebar($('#titlebar'));
  const ribbon = new Ribbon($('#ribbon'));
  app.ribbon = ribbon;
  buildDocTabs($('#doctabs'));
  buildPagesPanel($('#pages-panel'));
  const canvas = installCanvas($('#canvas'));
  buildRightPanel($('#right-panel'));
  buildStatusBar($('#statusbar'));
  buildBackstage($('#backstage'));
  installKeyboard();
  installDesktopBridge();
  installPrintFallback();
  const applyPanels = () => {
    document.body.classList.toggle('hide-pages', !prefs.get('pagesPanel'));
    document.body.classList.toggle('hide-right', !prefs.get('rightPanel'));
  };
  prefs.on('change', applyPanels);
  applyPanels();
  app.on('session', (s) => document.body.classList.toggle('no-doc', !s));
  document.body.classList.toggle('no-doc', !app.session);
  // keep the browser from navigating away when files are dropped outside the canvas
  window.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) e.preventDefault(); });
  return { ribbon, canvas };
}
