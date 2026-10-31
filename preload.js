// The bridge between the web page and Electron.
// Only these functions are exposed to the page, as window.electronAPI.
// On the website this file never runs, so window.electronAPI is undefined
// and app.js falls back to browser APIs.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSources: () => ipcRenderer.invoke('get-sources'),
  selectSource: (id) => ipcRenderer.invoke('select-source', id),
  saveRecording: (buffer, name) => ipcRenderer.invoke('save-recording', buffer, name),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
