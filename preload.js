'use strict';
const { contextBridge, ipcRenderer, webFrame } = require('electron');
contextBridge.exposeInMainWorld('fsdShell', {
  zoomSet: (f) => { try { webFrame.setZoomFactor(f); return webFrame.getZoomFactor(); } catch (e) { return null; } },
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  readFolder: (dir, mode) => ipcRenderer.invoke('read-folder', dir, mode),
  onProgress: (cb) => { ipcRenderer.on('scan-progress', (e, d) => { try { cb(d); } catch (err) {} }); },
  saveXlsx: (payload) => ipcRenderer.invoke('save-xlsx', payload),
  stateLoad: () => ipcRenderer.invoke('state-load'),
  stateSave: (s) => ipcRenderer.invoke('state-save', s),
  stateSaveNow: (s) => { try { ipcRenderer.send('state-save-fire', s); } catch (e) {} },
  stateClear: () => ipcRenderer.invoke('state-clear'),
  dataSave: (which, text) => ipcRenderer.invoke('data-save', which, text),
  dataLoad: () => ipcRenderer.invoke('data-load'),
  getPaths: () => ipcRenderer.invoke('get-paths'),
  aiChat: (payload) => ipcRenderer.invoke('ai-chat', payload),
  snapSave: (payload) => ipcRenderer.invoke('snap-save', payload),
  snapList: () => ipcRenderer.invoke('snap-list'),
  snapRead: (file) => ipcRenderer.invoke('snap-read', file),
  aiChatCli: (payload) => ipcRenderer.invoke('ai-chat-cli', payload),
  onAiStream: (cb) => { ipcRenderer.on('ai-stream', (e, d) => { try { cb(d); } catch (err) {} }); },
  electron: process.versions.electron
});
