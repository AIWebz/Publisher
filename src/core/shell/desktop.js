// Renderer side of the desktop shell protocol (see ARCHITECTURE.md "Desktop IPC channels"):
// app:doc-state (any document dirty + names), app:close-request (commit in-progress edits, run the
// Save / Don't Save / Cancel flow for every dirty document through app.files.closeAll, then
// app:close-now or app:close-cancel) and menu:command (native macOS menu -> app.exec).

import { app } from '../app.js';

/** Current document state for the main process. */
export function docState() {
  const dirty = app.dirtySessions();
  return { dirty: dirty.length > 0, names: dirty.map((s) => s.displayName), count: app.sessions.length };
}

/**
 * Handle a close request: flush edits, then close every document with the save flow.
 * Resolves true when the window may close.
 */
export async function handleCloseRequest() {
  app.flush();
  if (app.gesture) app.endGesture(true);
  if (app.files && typeof app.files.closeAll === 'function') return !!(await app.files.closeAll());
  if (!app.dirtySessions().length) return true;
  return app.ui.confirm('Quit without saving?', 'Some publications have unsaved changes. Quit anyway and lose them?', 'Quit', { danger: true });
}

/** Wire the desktop bridge (no-op on the web). */
export function installDesktopBridge() {
  const d = globalThis.folioDesktop;
  if (!d || typeof d.send !== 'function') return;
  let last = '';
  const send = () => {
    const st = docState();
    const key = JSON.stringify(st);
    if (key === last) return;
    last = key;
    d.send('app:doc-state', st);
  };
  for (const ev of ['dirty', 'sessions', 'saved', 'session']) app.on(ev, send);
  app.on('doc-change', send);
  send();
  let closing = false;
  d.on('app:close-request', async () => {
    d.send('app:close-ack');
    if (closing) return;
    closing = true;
    try {
      const ok = await handleCloseRequest();
      d.send(ok ? 'app:close-now' : 'app:close-cancel');
    } catch (err) {
      console.error('Close request failed', err);
      d.send('app:close-cancel');
    } finally {
      closing = false;
    }
  });
  d.on('menu:command', (id, arg) => {
    if (typeof id !== 'string') return;
    if (id === 'edit.undo' || id === 'edit.redo' || id === 'edit.selectAll' || id === 'edit.cut' || id === 'edit.copy' || id === 'edit.paste') {
      const t = document.activeElement;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName))) return;   // the native menu role handles text fields
    }
    app.exec(id, arg);
  });
}
