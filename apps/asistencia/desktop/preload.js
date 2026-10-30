/**
 * Puente explícito entre renderer y proceso principal.
 *
 * Solo se exponen operaciones de negocio concretas; no se entrega `ipcRenderer`
 * ni acceso Node genérico al renderer. Los canales deben coincidir con los
 * handlers registrados en `apps/asistencia/desktop/main.js#registerIpcHandlers`.
 *
 * @see https://www.electronjs.org/docs/latest/tutorial/context-isolation
 * @see https://www.electronjs.org/docs/latest/tutorial/security
 */
const { contextBridge, ipcRenderer } = require('electron');

// API de estado, autenticación, marcas, sincronización y comunicación entre ventanas.
contextBridge.exposeInMainWorld('electronAPI', {
  onSyncUpdate: (callback) => {
    ipcRenderer.on('sync-update', (_event, data) => callback(data));
  },
  getState: () => ipcRenderer.invoke('ast:get-state'),
  getDeviceConfig: () => ipcRenderer.invoke('ast:get-device-config'),
  getAuthStateSync: () => ipcRenderer.sendSync('ast:get-auth-state-sync'),
  updateDeviceConfig: (config) => ipcRenderer.invoke('ast:update-device-config', config),
  setAuthToken: (tokens) => ipcRenderer.invoke('ast:set-auth-token', tokens),
  registerMark: (payload) => ipcRenderer.invoke('ast:register-mark', payload),
  findLocalUserByDni: (dni) => ipcRenderer.invoke('ast:find-local-user', dni),
  saveLocalUser: (usuario) => ipcRenderer.invoke('ast:save-local-user', usuario),
  deleteLocalUser: (dni) => ipcRenderer.invoke('ast:delete-local-user', dni),
  forceSync: () => ipcRenderer.invoke('ast:force-sync'),
  resetLocalData: () => ipcRenderer.invoke('ast:reset-local-data'),
  updateMark: (localId, fields) => ipcRenderer.invoke('ast:update-mark', localId, fields),
  deleteMark: (localId) => ipcRenderer.invoke('ast:delete-mark', localId),
  createManualMark: (payload) => ipcRenderer.invoke('ast:create-manual-mark', payload),
  findLastMarkForDni: (dni) => ipcRenderer.invoke('ast:find-last-mark', dni),
  saveOfflineCredentials: (payload) => ipcRenderer.invoke('ast:save-offline-credentials', payload),
  verifyOfflineCredentials: (payload) => ipcRenderer.invoke('ast:verify-offline-credentials', payload),

  // Cross-Window IPC communication
  sendUnknownDni: (dni) => ipcRenderer.send('kiosk:unknown-dni', dni),
  sendVisitorRegisteredSuccess: (data) => ipcRenderer.send('admin:visitor-registered-success', data),
  sendSimulateScan: (dni) => ipcRenderer.send('admin:simulate-kiosk-scan', dni),
  toggleAdminWindow: () => ipcRenderer.send('kiosk:toggle-admin'),
  notifyDatabaseChanged: () => ipcRenderer.send('database:changed'),

  onRegisterVisitor: (callback) => {
    const listener = (event, dni) => callback(dni);
    ipcRenderer.on('admin:register-visitor', listener);
    return () => ipcRenderer.removeListener('admin:register-visitor', listener);
  },

  onVisitorRegisteredSuccess: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('kiosk:visitor-registered-success', listener);
    return () => ipcRenderer.removeListener('kiosk:visitor-registered-success', listener);
  },

  onSimulateScan: (callback) => {
    const listener = (event, dni) => callback(dni);
    ipcRenderer.on('kiosk:simulate-scan', listener);
    return () => ipcRenderer.removeListener('kiosk:simulate-scan', listener);
  },

  onDatabaseChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('database:changed', listener);
    return () => ipcRenderer.removeListener('database:changed', listener);
  },
});
