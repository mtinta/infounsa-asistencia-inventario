const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  onSyncUpdate: (callback) => {
    ipcRenderer.on('sync-update', (event, data) => callback(data));
  },
  getAuthStateSync: () => ipcRenderer.sendSync('inv:get-auth-state-sync'),
  setAuthToken: (tokens) => ipcRenderer.invoke('inv:set-auth-token', tokens),
  registerMovement: (movement) => ipcRenderer.invoke('inv:register-movement', movement),
  getState: () => ipcRenderer.invoke('inv:get-state'),
  forceSync: () => ipcRenderer.invoke('inv:force-sync'),
});
