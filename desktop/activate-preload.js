/* Folio Publisher — preload for the activation window (desktop/activate.html). */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('folioLicense', {
  strings: () => ipcRenderer.invoke('license:strings'),
  activate: (serial) => ipcRenderer.invoke('license:activate', String(serial || '')),
  quit: () => ipcRenderer.send('license:quit')
});
