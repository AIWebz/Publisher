/* Folio Publisher — preload bridge between the sandboxed page and the desktop shell.
   Exposes a small, whitelisted IPC surface; see ARCHITECTURE.md (Platform). */
'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const PREFIXES = ['app:', 'file:', 'export:', 'print:', 'recovery:', 'store:', 'menu:', 'templates:'];
const allowed = (ch) => typeof ch === 'string' && PREFIXES.some((p) => ch.startsWith(p));

contextBridge.exposeInMainWorld('folioDesktop', {
  platform: process.platform,
  invoke: (channel, ...args) => {
    if (!allowed(channel)) return Promise.reject(new Error(`Blocked channel ${channel}`));
    return ipcRenderer.invoke(channel, ...args);
  },
  send: (channel, ...args) => { if (allowed(channel)) ipcRenderer.send(channel, ...args); },
  on: (channel, cb) => {
    if (!allowed(channel)) return () => {};
    const fn = (_e, ...args) => cb(...args);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  },
  pathForFile: (file) => { try { return webUtils.getPathForFile(file) || null; } catch { return null; } }
});
