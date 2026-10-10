/* Folio Publisher — preload bridge between the sandboxed page and the desktop shell */
'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('folioDesktop', {
  platform: process.platform,
  ready: () => ipcRenderer.send('app:ready'),
  info: () => ipcRenderer.invoke('app:info'),
  setTheme: (theme) => ipcRenderer.send('app:theme', String(theme)),
  setDocState: (dirty, name) => ipcRenderer.send('doc:state', { dirty: !!dirty, name: String(name || '') }),
  closeNow: () => ipcRenderer.send('app:close-now'),
  openFile: () => ipcRenderer.invoke('file:open'),
  openDropped: (file) => ipcRenderer.invoke('file:open-path', webUtils.getPathForFile(file)),
  saveFile: (opts) => ipcRenderer.invoke('file:save', opts),
  exportPDF: (opts) => ipcRenderer.invoke('file:export-pdf', opts),
  showExport: () => ipcRenderer.invoke('file:show-export'),
  loadAutosave: () => ipcRenderer.invoke('autosave:load'),
  autosave: (data) => ipcRenderer.invoke('autosave:save', data),
  onOpenFile: (cb) => ipcRenderer.on('file:opened', (_e, file) => cb(file)),
  onSaveAndClose: (cb) => ipcRenderer.on('app:save-and-close', () => cb())
});
