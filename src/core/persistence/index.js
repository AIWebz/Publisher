// Persistence bootstrap: installs app.platform and app.files, autosaves recovery copies, offers
// recovery at startup, and wires the desktop shell (files from the OS, the native menu, the
// multi-document close flow) and the web page lifecycle (unload warning, browser-menu printing,
// dropped .folio files). Call installPersistence() once at boot; startPersistence() after the UI
// is mounted (both idempotent; startPersistence also runs on its own shortly after load).

import { app as defaultApp } from '../app.js';
import { registry } from '../registry.js';
import { platform as defaultPlatform } from '../platform.js';
import { RecoveryManager } from './recovery.js';
import { FilesController } from './files.js';
import { showDocumentProperties } from './properties.js';
import { renderPage } from '../render/index.js';
import './persistence.css';

const INSTANCE = `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const ALIVE_KEY = 'folio:alive:';
const ALIVE_MS = 5000;
const DOC_FILE = /\.(folio|json)$/i;

let installed = null;

function storage() {
  try { return window.localStorage; } catch { return null; }
}

/** Web: is another browser tab with this instance id still running? */
function isAlive(instance) {
  const ts = Number(storage()?.getItem(ALIVE_KEY + instance) || 0);
  return Date.now() - ts < ALIVE_MS * 3;
}

/**
 * Install persistence services on the app (idempotent).
 * @param {{ app?: object, platform?: object }} [opts]
 * @returns {{ files: FilesController, recovery: RecoveryManager, platform: object, start: () => Promise<void> }}
 */
export function installPersistence({ app = defaultApp, platform = defaultPlatform } = {}) {
  if (installed) return installed;
  if (!app.platform) app.platform = platform;
  platform = app.platform;

  const recovery = new RecoveryManager({
    storage: platform.recovery,
    instance: platform.isDesktop ? null : INSTANCE,
    onError: (err) => console.error('Recovery copy failed', err)
  });
  const files = new FilesController({ app, platform, recovery, instance: platform.isDesktop ? null : INSTANCE, isAlive: platform.isDesktop ? () => false : isAlive });
  app.files = files;
  files.showProperties = () => showDocumentProperties(app);

  // ---- autosave ----
  app.on('doc-change', ({ session }) => recovery.schedule(session));
  app.on('dirty', (session) => recovery.schedule(session));
  app.on('session-closed', (session) => { if (!session.dirty) recovery.discard(session); });

  // ---- commit focused inputs (inspector fields commit on 'change') before save/close ----
  if (typeof document !== 'undefined') {
    app.addFlusher(() => {
      const el = document.activeElement;
      if (!el || el.closest?.('.dlg')) return;
      const tag = el.tagName;
      const texty = tag === 'TEXTAREA' || (tag === 'INPUT' && /^(text|number|search|url|email|tel|)$/i.test(el.type || ''));
      if (texty && !el.readOnly && !el.disabled) el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  const desktopState = () => {
    const s = app.session;
    const dirty = app.dirtySessions();
    return { dirty: dirty.length > 0, names: dirty.map((d) => d.displayName), title: s ? s.displayName : '', path: s ? s.filePath : null };
  };

  if (typeof window !== 'undefined') {
    installChrome(platform);
    installPrinting(app, platform);
    installDrop(app, platform, files);
    if (platform.isDesktop) installDesktop(app, platform, files, desktopState);
    else installWeb(app, recovery);
  }

  let started = null;
  const start = () => (started ||= (async () => {
    if (platform.isDesktop) platform.send('app:ready');
    try { await files.offerRecovery(); } catch (err) { console.error('Recovery check failed', err); }
  })());

  installed = { files, recovery, platform, start };
  if (typeof window !== 'undefined') {
    const later = () => setTimeout(start, 120);
    if (document.readyState === 'complete') later();
    else window.addEventListener('load', later, { once: true });
  }
  return installed;
}

/** Run the startup work (signal the desktop shell, offer recovery copies). Idempotent. */
export function startPersistence() {
  return (installed || installPersistence()).start();
}

// ------------------------------------------------------------------------------------------------

function installChrome(platform) {
  const root = document.documentElement;
  root.classList.add(platform.isDesktop ? 'is-desktop' : 'is-web', `os-${platform.os}`);
  if (platform.isMac) root.classList.add('is-mac');
  // Space kept free for the window controls: caption buttons (Windows/Linux overlay, right) or
  // the macOS traffic lights (left). The shell's title bar and the File view use these.
  root.style.setProperty('--caption-inset-right', platform.isDesktop && platform.os !== 'darwin' ? '138px' : '0px');
  root.style.setProperty('--caption-inset-left', platform.isDesktop && platform.os === 'darwin' ? '80px' : '0px');
}

function installDesktop(app, platform, files, desktopState) {
  platform.on('file:opened', (f) => {
    if (f && typeof f.text === 'string') files.openText(f.text, { path: f.path, name: f.name });
  });
  platform.on('menu:command', (id, arg) => {
    if (registry.getCommand(id)) app.exec(id, arg);
  });
  let closing = false;
  platform.on('app:close-request', async () => {
    platform.send('app:close-ack');
    if (closing) return;
    closing = true;
    let ok = false;
    try {
      app.ui.closeMenus?.();
      ok = await files.prepareQuit();
    } catch (err) {
      console.error('Close failed', err);
    } finally {
      closing = false;
    }
    platform.send(ok ? 'app:close-now' : 'app:close-cancel');
  });

  let last = '';
  const sendState = () => {
    const st = desktopState();
    const key = JSON.stringify(st);
    if (key === last) return;
    last = key;
    platform.send('app:doc-state', st);
  };
  for (const ev of ['dirty', 'session', 'sessions', 'saved', 'doc-change']) app.on(ev, sendState);

  let menuTimer = null;
  const sendCommands = () => {
    clearTimeout(menuTimer);
    menuTimer = setTimeout(() => platform.send('app:menu-commands', [...registry.commands.keys()]), 200);
  };
  registry.on('change', (kinds) => { if (kinds.includes('command')) sendCommands(); });
  sendCommands();
}

function installWeb(app, recovery) {
  const st = storage();
  const beat = () => { try { st?.setItem(ALIVE_KEY + INSTANCE, String(Date.now())); } catch { /* full */ } };
  beat();
  setInterval(beat, ALIVE_MS);
  try {
    for (let i = st ? st.length - 1 : -1; i >= 0; i--) {
      const k = st.key(i);
      if (k && k.startsWith(ALIVE_KEY) && Date.now() - Number(st.getItem(k) || 0) > 86400000) st.removeItem(k);
    }
  } catch { /* blocked */ }

  window.addEventListener('beforeunload', (e) => {
    app.flush();
    if (!app.dirtySessions().length) return;
    recovery.flushAll();
    e.preventDefault();
    e.returnValue = '';
  });
  window.addEventListener('pagehide', () => {
    app.flush();
    recovery.flushAll();
    try { st?.removeItem(ALIVE_KEY + INSTANCE); } catch { /* blocked */ }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { app.flush(); recovery.flushAll(); beat(); }
  });
}

// Browser-menu printing (Ctrl+P / File > Print in the browser): fill #print-root when nothing
// has prepared it, so the printout shows the publication instead of a blank page.
function installPrinting(app, platform) {
  let auto = null;
  window.addEventListener('beforeprint', () => {
    let root = document.getElementById('print-root');
    if (root && root.childElementCount) return;   // prepared by an explicit print/export
    if (!app.doc) return;
    if (!root) {
      root = document.createElement('div');
      root.id = 'print-root';
      document.body.appendChild(root);
    }
    let handled = false;
    for (const fn of platform._printPreparers || []) {
      try { if (fn(root, app.doc) !== false) handled = true; } catch (err) { console.error('print preparer failed', err); }
    }
    if (!handled || !root.childElementCount) preparePrintRoot(root, app.doc);
    const style = document.createElement('style');
    style.id = 'folio-auto-print';
    const wIn = app.doc.setup.width / 96, hIn = app.doc.setup.height / 96;
    style.textContent = `@page { size: ${wIn}in ${hIn}in; margin: 0; }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; height: auto !important; overflow: visible !important; }
  body.folio-auto-printing > *:not(#print-root) { display: none !important; }
  body.folio-auto-printing #print-root { display: block !important; position: static !important; }
  #print-root .print-page { break-after: page; page-break-after: always; overflow: hidden; position: relative; }
  #print-root .print-page:last-child { break-after: auto; page-break-after: auto; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}`;
    document.head.appendChild(style);
    document.body.classList.add('folio-auto-printing');
    auto = { root, style };
  });
  window.addEventListener('afterprint', () => {
    if (!auto) return;
    auto.root.replaceChildren();
    auto.style.remove();
    document.body.classList.remove('folio-auto-printing');
    auto = null;
  });
}

/**
 * Render every page of `doc` (export mode) into `root` as .print-page boxes.
 * @param {HTMLElement} root
 * @param {object} doc
 */
export function preparePrintRoot(root, doc) {
  root.replaceChildren();
  doc.pages.forEach((page, i) => {
    const box = document.createElement('div');
    box.className = 'print-page';
    renderPage(box, doc, page, { mode: 'export', pageIndex: i });
    root.appendChild(box);
  });
}

// Publication files dropped anywhere on the window open in new tabs. Other drops (pictures on
// the canvas) are left to their handlers; stray drops never navigate away from the app.
function installDrop(app, platform, files) {
  const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  window.addEventListener('dragover', (e) => {
    if (hasFiles(e) && !e.defaultPrevented) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
  });
  window.addEventListener('drop', async (e) => {
    if (!hasFiles(e)) return;
    const docs = [...(e.dataTransfer.files || [])].filter((f) => DOC_FILE.test(f.name));
    if (!docs.length) return;
    e.preventDefault();
    e.stopPropagation();
    for (const f of docs) {
      try {
        const r = await platform.readFile(f);
        // A dropped file's path is shown and used as the default location, but the first save
        // still asks where to save (renderer-supplied paths are not trusted for silent writes).
        await files.openText(r.text, { path: r.path, name: r.name });
      } catch (err) {
        app.reportError(err, `Opening ${f.name}`);
      }
    }
  }, true);
  window.addEventListener('drop', (e) => { if (hasFiles(e) && !e.defaultPrevented) e.preventDefault(); });
}
