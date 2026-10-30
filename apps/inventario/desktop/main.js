const { app, BrowserWindow, globalShortcut, screen, safeStorage, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { createLocalEncryptionKeyStore } = require('./src/main/security/local-encryption-key');
const { assertAuthorizedSender } = require('./src/main/security/ipc-sender');
const { createSqliteAdapter, createInventoryPersistence } = require('./src/main/persistence/sqlite-adapter');

const sqlite3 = require('@journeyapps/sqlcipher').verbose();

const isDev = !app.isPackaged;
let db;
let dbAdapter;
let persistence;
let mainWindow;
let syncTimer = null;
let authState = { accessToken: null, refreshToken: null };
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

let apiHost = 'localhost';
try {
  const config = require('./desktop-config.json');
  if (config.api_host) {
    apiHost = config.api_host;
  }
} catch (e) {
  console.warn('No se pudo cargar desktop-config.json, usando localhost por defecto.');
}

function migrateLegacyApiUrl(value) {
  try {
    const url = new URL(value);
    const isPreviousRemote = url.hostname === '217.216.90.70' && url.port === '43001';
    const isLegacyLocalPort = (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.port === '3001';
    if (isPreviousRemote || isLegacyLocalPort) {
      return `http://${apiHost}:43001`;
    }
  } catch {}
  return value || `http://${apiHost}:43001`;
}

const WIN_STATE_FILE = path.join(app.getPath('userData'), 'window-state-inventario.json');
const TOKEN_STATE_FILE = path.join(app.getPath('userData'), 'sync-auth-inventario.json');
const localEncryptionKeyStore = createLocalEncryptionKeyStore({
  filePath: path.join(app.getPath('userData'), 'local_inventory_db.key'),
  fs,
  crypto: require('crypto'),
  safeStorage,
});

// ── Window State Management ────────────────────────────────────

function loadWindowState() {
  try {
    if (fs.existsSync(WIN_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(WIN_STATE_FILE, 'utf8'));
    }
  } catch {}
  return null;
}

function saveWindowState(win) {
  try {
    if (!win.isDestroyed() && !win.isMinimized()) {
      const bounds = win.getBounds();
      fs.writeFileSync(WIN_STATE_FILE, JSON.stringify({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        maximized: win.isMaximized(),
        fullscreen: win.isFullScreen(),
      }));
    }
  } catch {}
}

// ── Auth Token Security (safeStorage) ──────────────────────────

function loadAuthState() {
  try {
    if (fs.existsSync(TOKEN_STATE_FILE)) {
      if (!safeStorage.isEncryptionAvailable()) {
        console.error('No se cargan tokens locales: safeStorage no esta disponible.');
        return { accessToken: null, refreshToken: null };
      }

      const fileData = fs.readFileSync(TOKEN_STATE_FILE);
      try {
        const decrypted = safeStorage.decryptString(fileData);
        const parsed = JSON.parse(decrypted);
        return {
          accessToken: parsed?.accessToken || null,
          refreshToken: parsed?.refreshToken || null,
          apiUrl: parsed?.apiUrl || null,
        };
      } catch {
        // Migra una instalacion anterior solo si puede reescribirla cifrada.
        const legacy = JSON.parse(fileData.toString('utf8'));
        const migrated = {
          accessToken: legacy?.accessToken || null,
          refreshToken: legacy?.refreshToken || null,
          apiUrl: legacy?.apiUrl || null,
        };
        fs.writeFileSync(TOKEN_STATE_FILE, safeStorage.encryptString(JSON.stringify(migrated)));
        return migrated;
      }
    }
  } catch {}
  return { accessToken: null, refreshToken: null };
}

function saveAuthState(nextState) {
  authState = {
    accessToken: nextState?.accessToken || null,
    refreshToken: nextState?.refreshToken || null,
    apiUrl: nextState?.apiUrl || null,
  };
  if (!safeStorage.isEncryptionAvailable()) {
    console.error('No se guardan tokens locales: safeStorage no esta disponible.');
    return;
  }

  try {
    fs.writeFileSync(TOKEN_STATE_FILE, safeStorage.encryptString(JSON.stringify(authState)));
  } catch (err) {
    console.error('No se pudo guardar el estado de autenticacion cifrado:', err);
  }
}

// ── Encryption Key for SQLCipher ───────────────────────────────

function getOrCreateEncryptionKey() {
  return localEncryptionKeyStore.loadOrCreate();
}

// ── SQLite Promisified Helpers & Persistence ───────────────────

const dbRun = (...args) => dbAdapter.run(...args);
const dbGet = (...args) => dbAdapter.get(...args);
const dbAll = (...args) => dbAdapter.all(...args);
const dbExec = (...args) => dbAdapter.exec(...args);

async function assertSqlCipherAvailable() {
  const row = await dbGet('PRAGMA cipher_version');
  const version = row && Object.values(row).find((value) => typeof value === 'string' && value.trim());
  if (!version) {
    throw new Error('SQLCipher no esta disponible; se cancela el arranque para evitar SQLite sin cifrado.');
  }
}

// ── Database Initialization ─────────────────────────────────────

async function initDB() {
  const dbPath = path.join(app.getPath('userData'), 'local_inventory_db.sqlite');
  db = new sqlite3.Database(dbPath);
  dbAdapter = createSqliteAdapter(db);
  persistence = createInventoryPersistence(dbAdapter);

  const encryptionKey = getOrCreateEncryptionKey();
  const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf8');

  await dbExec(`PRAGMA key = '${encryptionKey}'`);
  await assertSqlCipherAvailable();
  await persistence.initSchema(schemaSql);
}


// ── Get Desktop State ──────────────────────────────────────────

async function getDesktopState() {
  return persistence.getDesktopState();
}

// ── Online Cache Refresh ───────────────────────────────────────────
// Called on login when the server is reachable.
// Flow: sync pending → drop local cache → fetch fresh items from API.
async function refreshCacheFromServer(apiBaseUrl, accessToken) {
  // 1. First flush any pending movements to the server
  await syncPendingQueue();

  // 2. Fetch fresh inventory items from the backend
  const target = new URL('/inventory-items', apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`);
  const transport = target.protocol === 'https:' ? require('https') : require('http');

  const items = await new Promise((resolve, reject) => {
    const options = {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      timeout: 8000,
      headers: { 'Authorization': `Bearer ${accessToken}` }
    };
    const req = transport.request(options, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(body));
        else reject(new Error(`HTTP ${res.statusCode}`));
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });

  // Fetch movements from the server to keep observations log populated locally
  const movements = await new Promise((resolve) => {
    const targetMv = new URL('/inventory-movements', apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`);
    const options = {
      protocol: targetMv.protocol,
      hostname: targetMv.hostname,
      port: targetMv.port || (targetMv.protocol === 'https:' ? 443 : 80),
      path: `${targetMv.pathname}${targetMv.search}`,
      method: 'GET',
      timeout: 8000,
      headers: { 'Authorization': `Bearer ${accessToken}` }
    };
    const req = transport.request(options, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(body));
        else resolve([]);
      });
    });
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.on('error', () => { resolve([]); });
    req.end();
  });

  // 3. Clear and replace local cache tables (keep sync_queue pending items safe — already flushed above)
  const itemList = Array.isArray(items) ? items : (items?.data || []);
  const movementList = Array.isArray(movements) ? movements : [];
  await persistence.replaceCatalogCache(itemList, movementList);
  console.log(`[Cache] Refresco exitoso: ${itemList.length} items y ${movementList.length} movimientos cargados desde el servidor.`);
}

// ── Synchronization Motor with Transactional Handshake ───────────

function isTransientNetworkError(err) {
  const msg = err.message.toLowerCase();
  return (
    msg.includes('socket hang up') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('error de red al conectar') ||
    msg.includes('timeout')
  );
}

function sendInventarioSyncOnce(apiBaseUrl, payload) {
  return new Promise((resolve, reject) => {
    const reqData = JSON.stringify(payload);
    const target = new URL('/inventory-movements/sync', apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`);
    const transport = target.protocol === 'https:' ? require('https') : require('http');

    const options = {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: 'POST',
      timeout: 10000, // 10 seconds timeout
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(reqData),
        'Authorization': `Bearer ${authState.accessToken}`
      }
    };

    const req = transport.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(responseBody);
        } else {
          reject(new Error(`HTTP ${res.statusCode}${responseBody ? ` - ${responseBody}` : ''}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tiempo de espera agotado al conectar al servidor de inventario'));
    });

    req.on('error', (reqErr) => {
      reject(new Error(`Error de red al conectar al servidor de inventario: ${reqErr.message}`));
    });

    req.write(reqData);
    req.end();
  });
}

function sendInventarioSyncWithRetry(apiBaseUrl, payload, retries = 2, delayMs = 2000) {
  return new Promise((resolve, reject) => {
    function attempt(remaining) {
      sendInventarioSyncOnce(apiBaseUrl, payload)
        .then(resolve)
        .catch((err) => {
          if (remaining > 0 && isTransientNetworkError(err)) {
            console.warn(`Error de red transitorio detectable en inventario (${err.message}). Reintentando en ${delayMs}ms... (Intentos restantes: ${remaining})`);
            setTimeout(() => attempt(remaining - 1), delayMs);
          } else {
            reject(err);
          }
        });
    }
    attempt(retries);
  });
}

async function syncPendingQueue() {
  if (!db || !mainWindow || mainWindow.isDestroyed()) {
    return { processed: 0, skipped: true };
  }

  if (!authState.accessToken) {
    mainWindow.webContents.send('sync-update', {
      status: 'info',
      message: 'Sin token JWT activo. Inicie sesión antes de sincronizar.'
    });
    return { processed: 0, skipped: true };
  }

  mainWindow.webContents.send('sync-update', {
    status: 'info',
    message: 'Iniciando escaneo de sincronización de movimientos...'
  });

  const rows = await persistence.getPendingSyncQueue(500);
  if (rows.length === 0) {
    mainWindow.webContents.send('sync-update', { status: 'info', message: 'No hay movimientos pendientes.' });
    return { processed: 0, skipped: true };
  }

  const ids = rows.map(r => r.id_local);
  const localUUIDs = rows.map(r => r.entity_local_id);

  // Mark in-transit
  await persistence.markQueueSending(ids);

  const payload = {
    batch: rows.map(r => {
      const item = JSON.parse(r.payload);
      return {
        item_id: item.item_id,
        type: item.type,
        quantity: item.quantity,
        user_id: item.user_id || null,
        registered_at: item.registered_at,
        id_operacion_local: r.entity_local_id,
        observations: item.observations || '',
        destinatario_name: item.destinatario_name || null,
      };
    })
  };

  const apiBaseUrl = authState.apiUrl || `http://${apiHost}:43001`;

  try {
    const responseBody = await sendInventarioSyncWithRetry(apiBaseUrl, payload, 2, 2000);
    const result = JSON.parse(responseBody);
    const confirmedIds = result.processed_local_ids || [];

    // Perform Transactional Handshake Purge in local database
    await persistence.markSyncSuccess(confirmedIds);

    mainWindow.webContents.send('sync-update', {
      status: 'success',
      message: `Sincronización completada. Procesados ${confirmedIds.length} movimientos.`
    });
    return { processed: confirmedIds.length, skipped: false };
  } catch (err) {
    // Restore status to pending on error
    await persistence.markQueuePending(ids);
    mainWindow.webContents.send('sync-update', {
      status: 'error',
      message: `Fallo al sincronizar con el servidor: ${err.message}`
    });
    return { processed: 0, skipped: false };
  }
}

function startSyncTimer() {
  if (syncTimer) {
    clearInterval(syncTimer);
  }
  syncTimer = setInterval(() => {
    syncPendingQueue().catch(() => {});
  }, 30000); // 30 seconds
}

// ── IPC Handlers Registration ───────────────────────────────────

function registerIpcHandler(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertAuthorizedSender(event, [mainWindow], channel);
    return handler(event, ...args);
  });
}

function registerIpcSyncHandler(channel, handler) {
  ipcMain.on(channel, (event, ...args) => {
    assertAuthorizedSender(event, [mainWindow], channel);
    handler(event, ...args);
  });
}

function registerIpcHandlers() {
  registerIpcHandler('inv:get-state', async () => {
    return getDesktopState();
  });
  registerIpcSyncHandler('inv:get-auth-state-sync', (event) => {
    event.returnValue = authState;
  });

  registerIpcHandler('inv:set-auth-token', async (_event, nextState) => {
    const newApiUrl = nextState?.apiUrl || authState?.apiUrl || `http://${apiHost}:43001`;
    const newToken  = nextState?.accessToken || null;
    saveAuthState({
      accessToken: newToken,
      refreshToken: nextState?.refreshToken || null,
      apiUrl: newApiUrl
    });

    // Si hay token (usuario acaba de iniciar sesión) → refrescar cache en background
    if (newToken) {
      refreshCacheFromServer(newApiUrl, newToken)
        .then(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sync-update', {
              status: 'success',
              message: 'Cache local actualizado con datos frescos del servidor.'
            });
            mainWindow.webContents.send('inv:cache-refreshed');
          }
        })
        .catch((err) => {
          console.warn('[Cache] No se pudo refrescar cache al iniciar sesión (modo offline):', err.message);
        });
    }

    return { ok: true };
  });

  registerIpcHandler('inv:register-movement', async (_event, payload) => {
    return persistence.registerMovement(payload);
  });

  registerIpcHandler('inv:force-sync', async () => {
    await syncPendingQueue();
    return getDesktopState();
  });
}

// ── Main Window Creation ────────────────────────────────────────

function createWindow() {
  const savedState = loadWindowState();
  const primaryDisp = screen.getPrimaryDisplay().workAreaSize;

  const defaultW = Math.max(1024, Math.round(primaryDisp.width * 0.85));
  const defaultH = Math.max(660, Math.round(primaryDisp.height * 0.85));

  mainWindow = new BrowserWindow({
    x: savedState?.x ?? undefined,
    y: savedState?.y ?? undefined,
    width: savedState?.width ?? defaultW,
    height: savedState?.height ?? defaultH,
    resizable: true,
    maximizable: true,
    minimizable: true,
    fullscreenable: true,
    minWidth: 960,
    minHeight: 600,
    frame: true,
    autoHideMenuBar: true,
    title: 'InfoUNSA — Gestión de Inventario',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (savedState?.maximized) mainWindow.maximize();
  if (savedState?.fullscreen) mainWindow.setFullScreen(true);
  if (!savedState) mainWindow.maximize();

  const persistState = () => saveWindowState(mainWindow);
  mainWindow.on('resize', persistState);
  mainWindow.on('move', persistState);
  mainWindow.on('maximize', persistState);
  mainWindow.on('unmaximize', persistState);

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile('dist/index.html');
  }
}

app.on('before-quit', () => {
  if (syncTimer) {
    clearInterval(syncTimer);
  }
  if (db) {
    db.close();
  }
});

app.whenReady().then(async () => {
  authState = loadAuthState();
  const migratedApiUrl = migrateLegacyApiUrl(authState.apiUrl);
  if (migratedApiUrl !== authState.apiUrl) {
    saveAuthState({ accessToken: null, refreshToken: null, apiUrl: migratedApiUrl });
  }
  await initDB();
  registerIpcHandlers();
  createWindow();
  startSyncTimer();
  if (authState.accessToken) {
    refreshCacheFromServer(authState.apiUrl || `http://${apiHost}:43001`, authState.accessToken)
      .then(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('inv:cache-refreshed');
          mainWindow.webContents.send('sync-update', {
            status: 'success',
            message: 'Catalogo y movimientos verificados con el servidor al iniciar.'
          });
        }
      })
      .catch((err) => {
        console.warn('[Cache] Verificacion inicial omitida; se conserva el modo offline:', err.message);
      });
  }

  globalShortcut.register('CommandOrControl+Alt+Shift+K', () => {
    app.exit(0);
  });
}).catch((err) => {
  console.error('Fallo al iniciar inventario desktop:', err);
  app.exit(1);
});
