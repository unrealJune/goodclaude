const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  petClaude: () => ipcRenderer.send('pet-claude'),
  hideOverlay: () => ipcRenderer.send('hide-overlay'),
  onSpawnHand: (fn) => ipcRenderer.on('spawn-hand', () => fn()),
  onDropHand: (fn) => ipcRenderer.on('drop-hand', () => fn()),
  onShowHearts: (fn) => ipcRenderer.on('show-hearts', () => fn()),
});
