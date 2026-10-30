/**
 * Punto de composición del proceso principal de Asistencia Desktop.
 *
 * Mantiene la coordinación de ventanas, IPC, cola offline y ciclo de vida de
 * Electron. Las fronteras extraídas viven en `src/main/` y se consumen por
 * funciones de delegación documentadas más abajo, lo que permite probarlas sin
 * arrancar Electron completo.
 *
 * @see apps/asistencia/desktop/src/main/persistence/sqlite-adapter.js
 * @see apps/asistencia/desktop/src/main/security/auth-state.js
 * @see apps/asistencia/desktop/src/main/sync/remote-client.js
 * @see https://www.electronjs.org/docs/latest/tutorial/context-isolation
 */
const { app, BrowserWindow, globalShortcut, screen, safeStorage, ipcMain } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createSqliteAdapter } = require('./src/main/persistence/sqlite-adapter');
const { createAuthStateStore } = require('./src/main/security/auth-state');
const { createLocalEncryptionKeyStore } = require('./src/main/security/local-encryption-key');
const { hashOfflinePassword, verifyOfflinePassword } = require('./src/main/security/offline-password');
const { assertAuthorizedSender } = require('./src/main/security/ipc-sender');
const { createRemoteClient } = require('./src/main/sync/remote-client');

const sqlite3 = require('@journeyapps/sqlcipher').verbose();

const isDev = !app.isPackaged;
const WIN_STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
const TOKEN_STATE_FILE = path.join(app.getPath('userData'), 'sync-auth-asistencia.json');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');
// Frontera de persistencia de sesión; no expone tokens al renderer directamente.
const authStateStore = createAuthStateStore({ filePath: TOKEN_STATE_FILE, fs, safeStorage });
const localEncryptionKeyStore = createLocalEncryptionKeyStore({
  filePath: path.join(app.getPath('userData'), 'local_db.key'),
  legacyFilePath: path.join(app.getPath('userData'), 'local_db_fallback.key'),
  fs,
  crypto,
  safeStorage,
});

let apiHost = 'localhost';
try {
  const config = require('./desktop-config.json');
  if (config.api_host) {
    apiHost = config.api_host;
  }
} catch (e) {
  console.warn('No se pudo cargar desktop-config.json, usando localhost por defecto.');
}

const DEFAULT_DEVICE_CONFIG = {
  terminal_id: 'TERM-001',
  sede_id: '84c8a8ca-8ea4-41e9-add6-2b077bcd701a',
  api_base_url: `http://${apiHost}:43000`,
  sync_interval_seconds: 30,
};

let db;
let dbAdapter;
let mainWindow;
let syncTimer = null;
let syncInProgress = false;
let authState = { accessToken: null, refreshToken: null };
// El cliente remoto encapsula HTTP, refresh JWT y reintentos de conectividad.
const remoteClient = createRemoteClient({
  http: require('http'),
  https: require('https'),
  getAuthState: () => authState,
  saveAuthState,
});
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

/**
 * Carga el estado JWT al iniciar el proceso principal.
 *
 * @returns {{accessToken: string|null, refreshToken: string|null}}
 * @see apps/asistencia/desktop/src/main/security/auth-state.js#createAuthStateStore
 */
function loadAuthState() {
  return authStateStore.load();
}

/**
 * Persiste y actualiza en memoria el estado JWT usado por sincronización.
 *
 * @param {Object} nextState Tokens devueltos por login o refresh.
 * @returns {void}
 * @see apps/asistencia/desktop/src/main/security/auth-state.js#createAuthStateStore
 */
function saveAuthState(nextState) {
  authState = authStateStore.save(nextState);
}

/**
 * Obtiene la clave usada por la apertura de la base local.
 * `safeStorage` es obligatorio; una instalación sin almacenamiento seguro no
 * puede abrir la base local.
 *
 * @returns {string} Clave para `PRAGMA key`.
 * @see apps/asistencia/desktop/schema.sql
 * @see docs/02_arquitectura/PLAN_DOCUMENTACION_Y_MANTENIMIENTO_HITO_1.md
 */
function getOrCreateEncryptionKey() {
  return localEncryptionKeyStore.loadOrCreate();
}

// Compatibility aliases keep the domain code independent from the callback
// driver while the main-process extraction proceeds incrementally.
// @see apps/asistencia/desktop/src/main/persistence/sqlite-adapter.js#createSqliteAdapter
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

/**
 * Abre la base local, aplica la clave, migra el legado y ejecuta el esquema.
 *
 * @returns {Promise<void>}
 * @see apps/asistencia/desktop/src/main/persistence/sqlite-adapter.js#createSqliteAdapter
 * @see apps/asistencia/desktop/schema.sql
 */
async function initDB() {
  const dbPath = path.join(app.getPath('userData'), 'local_db.sqlite');
  db = new sqlite3.Database(dbPath);
  dbAdapter = createSqliteAdapter(db);

  const encryptionKey = getOrCreateEncryptionKey();
  const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf8');

  await dbExec(`PRAGMA key = '${encryptionKey}'`);
  await assertSqlCipherAvailable();
  await migrateLegacySchemaIfNeeded(schemaSql);
  await dbExec(schemaSql);

  // CREATE TABLE IF NOT EXISTS does not add columns to legacy databases.
  try {
    const localUsersColumns = await getColumnNames('local_users');
    if (localUsersColumns.length > 0) {
      const requiredColumns = [
        ['nombres', "TEXT NOT NULL DEFAULT ''"],
        ['apellido_paterno', "TEXT NOT NULL DEFAULT ''"],
        ['apellido_materno', "TEXT NOT NULL DEFAULT ''"],
        ['name', "TEXT NOT NULL DEFAULT ''"],
        ['role', "TEXT NOT NULL DEFAULT 'usuario'"],
        ['sede', "TEXT NOT NULL DEFAULT 'Sede Universitaria'"],
        ['condicion', 'TEXT'],
        ['cargo', 'TEXT'],
        ['updated_at', 'TEXT'],
      ];
      for (const [columnName, definition] of requiredColumns) {
        if (!localUsersColumns.includes(columnName)) {
          await dbRun(`ALTER TABLE local_users ADD COLUMN ${columnName} ${definition}`);
          console.log(`SQLite: Column "${columnName}" added to local_users table.`);
        }
      }
    }
  } catch (e) {
    console.error('Error migrating local_users columns:', e.message);
  }

  // Schema updates for attendance (estado_auditoria column)
  try {
    const attendanceColumns = await getColumnNames('attendance');
    if (attendanceColumns.length > 0) {
      if (!attendanceColumns.includes('estado_auditoria')) {
        await dbRun("ALTER TABLE attendance ADD COLUMN estado_auditoria TEXT NOT NULL DEFAULT 'normal'");
        console.log('SQLite: Column "estado_auditoria" added to attendance table.');
      }
    }
  } catch (e) {
    console.error('Error migrating attendance columns:', e.message);
  }

  // Versiones anteriores generaban marcaciones simuladas ("simulated-in-*" / "simulated-out-*") en el primer
  // arranque. Se eliminan de las bases locales existentes; las marcaciones reales nunca usan esos identificadores.
  try {
    await dbRun("DELETE FROM attendance WHERE local_id LIKE 'simulated-in-%' OR local_id LIKE 'simulated-out-%'");
  } catch (e) {
    console.error('Error limpiando marcaciones simuladas:', e.message);
  }

  await ensureDeviceConfig();
}

async function tableExists(tableName) {
  const row = await dbGet(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [tableName],
  );
  return Boolean(row);
}

async function getColumnNames(tableName) {
  if (!(await tableExists(tableName))) {
    return [];
  }
  const rows = await dbAll(`PRAGMA table_info(${tableName})`);
  return rows.map((row) => row.name);
}

async function migrateLegacySchemaIfNeeded(schemaSql) {
  const attendanceColumns = await getColumnNames('attendance');
  const syncQueueColumns = await getColumnNames('sync_queue');
  const isLegacyAttendance = attendanceColumns.includes('type') && attendanceColumns.includes('registered_at') && !attendanceColumns.includes('tipo_marca');
  const isLegacySyncQueue = syncQueueColumns.includes('payload') && syncQueueColumns.includes('id_local') && !syncQueueColumns.includes('estado');

  if (!isLegacyAttendance && !isLegacySyncQueue) {
    return;
  }

  const legacyAttendance = isLegacyAttendance
    ? await dbAll(`SELECT id_local, dni, name, type, registered_at, status FROM attendance ORDER BY registered_at DESC`)
    : [];
  const legacyQueue = isLegacySyncQueue
    ? await dbAll(`SELECT id_local, payload FROM sync_queue ORDER BY id_local ASC`)
    : [];

  await dbExec(`
    DROP TABLE IF EXISTS sync_queue;
    DROP TABLE IF EXISTS sync_logs;
    DROP TABLE IF EXISTS attendance;
    DROP TABLE IF EXISTS device_config;
  `);
  await dbExec(schemaSql);

  for (const row of legacyAttendance) {
    const payload = legacyQueue.find((item) => String(item.id_local) === String(row.id_local));
    const observacion = payload?.payload ? JSON.parse(payload.payload).name?.startsWith('Visitante:') ? JSON.parse(payload.payload).name : null : null;
    await dbRun(
      `INSERT INTO attendance (local_id, usuario_id, dni, nombre, tipo_marca, fecha_hora, id_terminal, observacion, es_menor_manual, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        row.dni === '00000000' ? null : row.dni,
        row.dni,
        row.name,
        row.type === 'entrada' ? 'entrada' : 'salida',
        row.registered_at,
        DEFAULT_DEVICE_CONFIG.terminal_id,
        observacion,
        row.dni === '00000000' ? 1 : 0,
        row.status === 'sincronizado' ? 'Sincronizado' : 'Pendiente',
      ],
    );
  }

  const migratedRows = await dbAll(
    `SELECT local_id, usuario_id, dni, nombre, tipo_marca, fecha_hora, observacion, es_menor_manual, sync_status
     FROM attendance`,
  );
  for (const row of migratedRows.filter((item) => item.sync_status !== 'Sincronizado')) {
    const syncPayload = {
      id_operacion_local: row.local_id,
      usuario_id: row.usuario_id,
      dni: row.dni,
      nombre: row.nombre,
      fecha_hora_marca: row.fecha_hora,
      tipo: row.tipo_marca,
      es_menor_manual: Boolean(row.es_menor_manual),
      observacion: row.observacion,
      datos_menor: row.es_menor_manual ? { nombre_completo: row.nombre, dni_contingencia: '00000000' } : undefined,
    };
    await dbRun(
      `INSERT INTO sync_queue (idempotency_key, entity_local_id, payload, estado)
       VALUES (?, ?, ?, 'Pendiente')`,
      [row.local_id, row.local_id, JSON.stringify(syncPayload)],
    );
  }

  await recordSyncLog('info', migratedRows.length, 'Migracion automatica de esquema legacy completada.');
}

async function ensureDeviceConfig() {
  const existing = await dbGet('SELECT id, api_base_url FROM device_config WHERE id = 1');
  if (!existing) {
    await dbRun(
      `INSERT INTO device_config (id, terminal_id, sede_id, api_base_url, sync_interval_seconds)
       VALUES (1, ?, ?, ?, ?)`,
      [
        DEFAULT_DEVICE_CONFIG.terminal_id,
        DEFAULT_DEVICE_CONFIG.sede_id,
        DEFAULT_DEVICE_CONFIG.api_base_url,
        DEFAULT_DEVICE_CONFIG.sync_interval_seconds,
      ],
    );
  } else if (
    isLegacyLocalApiUrl(existing.api_base_url, '3000')
    || isPreviousRemoteApiUrl(existing.api_base_url, '43000')
  ) {
    if (isPreviousRemoteApiUrl(existing.api_base_url, '43000')) {
      saveAuthState({ accessToken: null, refreshToken: null });
    }
    await dbRun(
      `UPDATE device_config SET api_base_url = ?, updated_at = ? WHERE id = 1`,
      [DEFAULT_DEVICE_CONFIG.api_base_url, new Date().toISOString()],
    );
  }
}

function isPreviousRemoteApiUrl(value, expectedPort) {
  try {
    const url = new URL(value);
    return url.hostname === '217.216.90.70' && url.port === expectedPort;
  } catch {
    return false;
  }
}

function isLegacyLocalApiUrl(value, legacyPort) {
  try {
    const url = new URL(value);
    return (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.port === legacyPort;
  } catch {
    return false;
  }
}

async function findLocalUserByDni(dni) {
  return (
    await dbGet(
      `SELECT dni, nombres, apellido_paterno, apellido_materno, name, role, sede, condicion, cargo
       FROM local_users
       WHERE dni = ?`,
      [dni],
    )
  ) || null;
}

async function saveLocalUser(user) {
  const originalDni = user?.originalDni;
  const payload = {
    dni: user?.dni,
    nombres: user?.nombres || '',
    apellido_paterno: user?.apellido_paterno || '',
    apellido_materno: user?.apellido_materno || '',
    name: user?.name,
    role: user?.role || 'operador',
    sede: user?.sede || 'Sede Universitaria',
    condicion: user?.condicion || null,
    cargo: user?.cargo || null,
  };

  if (!payload.dni || !payload.name) {
    throw new Error('El usuario local requiere dni y name.');
  }

  if (originalDni && originalDni !== payload.dni) {
    await dbRun(
      `UPDATE local_users
       SET dni = ?, nombres = ?, apellido_paterno = ?, apellido_materno = ?, name = ?, role = ?, sede = ?, condicion = ?, cargo = ?, updated_at = ?
       WHERE dni = ?`,
      [payload.dni, payload.nombres, payload.apellido_paterno, payload.apellido_materno, payload.name, payload.role, payload.sede, payload.condicion, payload.cargo, new Date().toISOString(), originalDni],
    );
  } else {
    await dbRun(
      `INSERT INTO local_users (dni, nombres, apellido_paterno, apellido_materno, name, role, sede, condicion, cargo, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(dni) DO UPDATE SET
         nombres = excluded.nombres,
         apellido_paterno = excluded.apellido_paterno,
         apellido_materno = excluded.apellido_materno,
         name = excluded.name,
         role = excluded.role,
         sede = excluded.sede,
         condicion = excluded.condicion,
         cargo = excluded.cargo,
         updated_at = excluded.updated_at`,
      [payload.dni, payload.nombres, payload.apellido_paterno, payload.apellido_materno, payload.name, payload.role, payload.sede, payload.condicion, payload.cargo, new Date().toISOString()],
    );
  }

  return payload;
}

async function getPendingAttendanceRows() {
  const rows = await dbAll(
    `SELECT local_id, dni, nombre, tipo_marca, fecha_hora, sync_status, visitante_nombre
     FROM attendance
     WHERE sync_status IN ('Pendiente', 'Enviando', 'Error', 'Conflicto')
     ORDER BY fecha_hora ASC`,
  );

  return rows.map((row) => ({
    id_local: row.local_id,
    dni: row.dni,
    name: row.visitante_nombre || row.nombre,
    type: row.tipo_marca,
    registered_at: row.fecha_hora,
    sync_status: normalizeSyncStatus(row.sync_status),
  }));
}

async function getDeviceConfig() {
  return (
    await dbGet(
      `SELECT terminal_id, sede_id, api_base_url, sync_interval_seconds
       FROM device_config
       WHERE id = 1`,
    )
  ) || { ...DEFAULT_DEVICE_CONFIG };
}

function sendSyncUpdate(status, message) {
  if (kioskWindow && !kioskWindow.isDestroyed()) {
    kioskWindow.webContents.send('sync-update', { status, message });
    kioskWindow.webContents.send('database:changed');
  }
  if (adminWindow && !adminWindow.isDestroyed()) {
    adminWindow.webContents.send('sync-update', { status, message });
    adminWindow.webContents.send('database:changed');
  }
}

async function recordSyncLog(type, count, message) {
  await dbRun(
    `INSERT INTO sync_logs (type, count, message) VALUES (?, ?, ?)`,
    [type, count, message],
  );
}

async function mapAttendanceRows(limit = 100) {
  const rows = await dbAll(
    `SELECT local_id, usuario_id, dni, nombre, tipo_marca, fecha_hora, observacion, es_menor_manual,
            visitante_nombre, visitante_motivo, visitante_observacion, sync_status, estado_auditoria
     FROM attendance
     ORDER BY fecha_hora DESC, rowid DESC
     LIMIT ?`,
    [limit],
  );

  return rows.map((row) => ({
    id_local: row.local_id,
    usuario_id: row.usuario_id,
    dni: row.dni,
    name: row.visitante_nombre || row.nombre,
    type: row.tipo_marca,
    registered_at: row.fecha_hora,
    observacion: row.observacion,
    es_menor_manual: Boolean(row.es_menor_manual),
    visitante_nombre: row.visitante_nombre || null,
    visitante_motivo: row.visitante_motivo || null,
    visitante_observacion: row.visitante_observacion || null,
    sync_status: normalizeSyncStatus(row.sync_status),
    estado_auditoria: row.estado_auditoria || 'normal',
  }));
}

async function mapSyncQueue() {
  const rows = await dbAll(
    `SELECT q.id_sync, q.idempotency_key, q.entity_local_id, q.estado, q.intentos, q.next_retry_at, q.mensaje_error, q.payload,
            a.dni, a.nombre, a.tipo_marca, a.fecha_hora, a.visitante_nombre, a.visitante_motivo, a.visitante_observacion, a.estado_auditoria
     FROM sync_queue q
     LEFT JOIN attendance a ON a.local_id = q.entity_local_id
     WHERE q.estado IN ('Pendiente', 'Enviando', 'Error', 'Conflicto')
     ORDER BY q.fecha_creacion ASC`,
  );

  return rows.map((row) => {
    let payload = {};
    try {
      payload = JSON.parse(row.payload);
    } catch {
      // The queue remains visible so an invalid local record can be diagnosed.
    }
    return {
      id_sync: row.id_sync,
      id_local: row.entity_local_id,
      idempotency_key: row.idempotency_key,
      dni: row.dni || payload.dni || 'No disponible',
      name: row.visitante_nombre || row.nombre || payload.visitante_nombre || payload.nombre || 'Registro local invalido',
      type: row.tipo_marca || payload.tipo || 'entrada',
      registered_at: row.fecha_hora || payload.fecha_hora_marca || new Date().toISOString(),
      sync_status: normalizeSyncStatus(row.estado),
      observacion: payload.observacion || null,
      visitante_nombre: row.visitante_nombre || payload.visitante_nombre || null,
      visitante_motivo: row.visitante_motivo || payload.visitante_motivo || null,
      visitante_observacion: row.visitante_observacion || payload.visitante_observacion || null,
      estado_auditoria: payload.estado_auditoria || row.estado_auditoria || 'normal',
      intentos: row.intentos,
      next_retry_at: row.next_retry_at,
      mensaje_error: row.mensaje_error,
    };
  });
}

async function mapSyncLogs(limit = 50) {
  return dbAll(
    `SELECT id, timestamp, type, count, message
     FROM sync_logs
     ORDER BY timestamp DESC
     LIMIT ?`,
    [limit],
  );
}

async function mapLocalUsers(limit = 200) {
  return dbAll(
    `SELECT dni, nombres, apellido_paterno, apellido_materno, name, role, sede, condicion, cargo
     FROM local_users
     ORDER BY updated_at DESC
     LIMIT ?`,
    [limit],
  );
}

function normalizeSyncStatus(status) {
  const statusMap = {
    Pendiente: 'pendiente',
    Enviando: 'enviando',
    Error: 'error',
    Conflicto: 'conflicto',
    Sincronizado: 'sincronizado',
  };
  return statusMap[status] || 'pendiente';
}

async function getDesktopState() {
  const [records, syncQueue, syncLogs, deviceConfig, users] = await Promise.all([
    mapAttendanceRows(),
    mapSyncQueue(),
    mapSyncLogs(),
    getDeviceConfig(),
    mapLocalUsers(),
  ]);

  return { records, syncQueue, syncLogs, deviceConfig, users };
}

async function registerMark(payload) {
  const config = await getDeviceConfig();
  const localId = crypto.randomUUID();
  const registeredAt = payload.registered_at || new Date().toISOString();
  const observacion = payload.observacion || null;
  const syncPayload = {
    id_operacion_local: localId,
    usuario_id: payload.usuario_id || null,
    dni: payload.dni,
    nombre: payload.name,
    fecha_hora_marca: registeredAt,
    tipo: payload.type,
    es_menor_manual: Boolean(payload.es_menor_manual),
    observacion,
    datos_menor: payload.es_menor_manual ? payload.datos_menor : undefined,
    visitante_nombre: payload.visitante_nombre || null,
    visitante_motivo: payload.visitante_motivo || null,
    visitante_observacion: payload.visitante_observacion || null,
  };

  await dbRun(
    `INSERT INTO attendance (
       local_id, usuario_id, dni, nombre, tipo_marca, fecha_hora, id_terminal, observacion,
       es_menor_manual, visitante_nombre, visitante_motivo, visitante_observacion, sync_status
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente')`,
    [
      localId,
      payload.usuario_id || null,
      payload.dni,
      payload.name,
      payload.type,
      registeredAt,
      config.terminal_id,
      observacion,
      payload.es_menor_manual ? 1 : 0,
      payload.visitante_nombre || null,
      payload.visitante_motivo || null,
      payload.visitante_observacion || null,
    ],
  );

  await dbRun(
    `INSERT INTO sync_queue (idempotency_key, entity_local_id, payload, estado)
     VALUES (?, ?, ?, 'Pendiente')`,
    [localId, localId, JSON.stringify(syncPayload)],
  );

  if (adminWindow && !adminWindow.isDestroyed()) adminWindow.webContents.send('database:changed');
  if (kioskWindow && !kioskWindow.isDestroyed()) kioskWindow.webContents.send('database:changed');

  return localId;
}

async function resetLocalState() {
  await dbExec(`
    DELETE FROM sync_queue;
    DELETE FROM sync_logs;
    DELETE FROM attendance;
    DELETE FROM local_users;
  `);
  await recordSyncLog('info', 0, 'Reinicio manual de estado local ejecutado.');
  return getDesktopState();
}

function scheduleNextRetry(intentos) {
  const seconds = Math.min(300, Math.max(30, intentos * 30));
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function syncPendingQueue(force = false) {
  if (syncInProgress) {
    return { processed: 0, skipped: true, reason: 'sync-in-progress' };
  }

  syncInProgress = true;
  try {
    return await runPendingQueueSync(force);
  } finally {
    syncInProgress = false;
  }
}

async function runPendingQueueSync(force = false) {
  const config = await getDeviceConfig();

  // 1. Descargar siempre usuarios y marcaciones consolidadas del servidor central
  if (authState.accessToken) {
    try {
      const remoteUsers = await pullUsersFromServer(config.api_base_url);
      for (const u of remoteUsers) {
        await dbRun(
          `INSERT INTO local_users (dni, name, role, sede, condicion, cargo, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(dni) DO UPDATE SET
             name = excluded.name,
             role = excluded.role,
             sede = excluded.sede,
             condicion = excluded.condicion,
             cargo = excluded.cargo,
             updated_at = excluded.updated_at`,
          [u.dni, u.nombre_completo, 'usuario', 'Sede Universitaria', u.condicion, u.cargo, new Date().toISOString()]
        );
      }

      const remoteMarks = await pullAttendanceFromServer(config.api_base_url);
      for (const m of remoteMarks) {
        await dbRun(
          `INSERT INTO attendance (
             local_id, usuario_id, dni, nombre, tipo_marca, fecha_hora, id_terminal, observacion, sync_status, estado_auditoria
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Sincronizado', ?)
           ON CONFLICT(local_id) DO UPDATE SET
             sync_status = 'Sincronizado',
             nombre = excluded.nombre,
             tipo_marca = excluded.tipo_marca,
             observacion = excluded.observacion,
             estado_auditoria = excluded.estado_auditoria`,
          [m.local_id, m.usuario_id, m.dni, m.nombre, m.tipo_marca, m.fecha_hora, m.id_terminal, m.observacion, m.estado_auditoria || 'normal']
        );
      }

      if (adminWindow && !adminWindow.isDestroyed()) adminWindow.webContents.send('database:changed');
      if (kioskWindow && !kioskWindow.isDestroyed()) kioskWindow.webContents.send('database:changed');
    } catch (e) {
      console.warn('Error al descargar datos en sincronizacion automatica:', e.message);
    }
  }

  // 2. Procesar cola de salida (asistencias pendientes)
  const thirtySecsAgo = new Date(Date.now() - 30000).toISOString();
  const sql = force
    ? `SELECT id_sync, idempotency_key, entity_local_id, payload, intentos
       FROM sync_queue
       WHERE estado IN ('Pendiente', 'Error', 'Conflicto', 'Enviando')
       ORDER BY fecha_creacion ASC
       LIMIT 500`
    : `SELECT id_sync, idempotency_key, entity_local_id, payload, intentos
       FROM sync_queue
       WHERE estado IN ('Pendiente', 'Error')
          OR (estado = 'Enviando' AND updated_at <= ?)
       ORDER BY fecha_creacion ASC
       LIMIT 500`;

  const params = force ? [] : [thirtySecsAgo];
  const pendingRows = await dbAll(sql, params);

  if (pendingRows.length === 0) {
    return { processed: 0, skipped: true };
  }

  if (!authState.accessToken) {
    const message = 'Sin token JWT activo. Inicie sesion antes de sincronizar.';
    await recordSyncLog('error', 0, message);
    sendSyncUpdate('error', message);
    return { processed: 0, skipped: true };
  }

  const rows = [];
  for (const row of pendingRows) {
    try {
      rows.push({ ...row, parsedPayload: JSON.parse(row.payload) });
    } catch {
      const message = 'Payload local invalido; el registro requiere revision manual.';
      await dbRun(
        `UPDATE sync_queue
         SET estado = 'Conflicto', mensaje_error = ?, updated_at = ?
         WHERE entity_local_id = ?`,
        [message, new Date().toISOString(), row.entity_local_id],
      );
      await dbRun(
        `UPDATE attendance
         SET sync_status = 'Error', last_error = ?, updated_at = ?
         WHERE local_id = ?`,
        [message, new Date().toISOString(), row.entity_local_id],
      );
      await recordSyncLog('error', 1, `${message} ID: ${row.entity_local_id}`);
    }
  }

  if (rows.length === 0) {
    const message = 'No se enviaron registros: todos los payloads pendientes requieren revision.';
    sendSyncUpdate('error', message);
    return { processed: 0, skipped: true };
  }

  const ids = rows.map((row) => row.entity_local_id);
  await dbRun(
    `UPDATE sync_queue
     SET estado = 'Enviando', fecha_envio = ?, updated_at = ?, mensaje_error = NULL
     WHERE entity_local_id IN (${ids.map(() => '?').join(',')})`,
    [new Date().toISOString(), new Date().toISOString(), ...ids],
  );
  await dbRun(
    `UPDATE attendance
     SET sync_status = 'Enviando', last_error = NULL, updated_at = ?
     WHERE local_id IN (${ids.map(() => '?').join(',')})`,
    [new Date().toISOString(), ...ids],
  );

  const payload = {
    terminal_id: config.terminal_id,
    sede_id: config.sede_id,
    registros: rows.map((row) => row.parsedPayload),
  };

  try {
    let response;
    try {
      response = await sendSyncRequest(config.api_base_url, payload);
    } catch (error) {
      if (error.message.includes('HTTP 401') && authState.refreshToken) {
        try {
          await refreshAccessToken(config.api_base_url);
          // Retry request with updated token
          response = await sendSyncRequest(config.api_base_url, payload);
        } catch (refreshError) {
          // If refresh fails too, propagate original 401 error
          throw error;
        }
      } else {
        throw error;
      }
    }

    const processedIds = Array.isArray(response.processed_local_ids)
      ? response.processed_local_ids
      : [];
    const processedCount = processedIds.length;

    if (processedIds.length > 0) {
      await dbRun(
        `UPDATE sync_queue
         SET estado = 'Sincronizado', updated_at = ?, mensaje_error = NULL
         WHERE entity_local_id IN (${processedIds.map(() => '?').join(',')})`,
         [new Date().toISOString(), ...processedIds],
      );
      await dbRun(
        `UPDATE attendance
         SET sync_status = 'Sincronizado', last_error = NULL, updated_at = ?
         WHERE local_id IN (${processedIds.map(() => '?').join(',')})`,
         [new Date().toISOString(), ...processedIds],
      );
    }

    const missingIds = ids.filter((id) => !processedIds.includes(id));
    if (missingIds.length > 0) {
      const message = 'El servidor no confirmo este registro en el handshake.';
      for (const row of rows.filter((item) => missingIds.includes(item.entity_local_id))) {
        const nextIntentos = row.intentos + 1;
        await dbRun(
          `UPDATE sync_queue
           SET estado = 'Error', intentos = ?, next_retry_at = ?, mensaje_error = ?, updated_at = ?
           WHERE entity_local_id = ?`,
          [nextIntentos, scheduleNextRetry(nextIntentos), message, new Date().toISOString(), row.entity_local_id],
        );
      }
      await dbRun(
        `UPDATE attendance
         SET sync_status = 'Error', last_error = ?, updated_at = ?
         WHERE local_id IN (${missingIds.map(() => '?').join(',')})`,
        [message, new Date().toISOString(), ...missingIds],
      );
    }

    const summary = missingIds.length > 0
      ? `Sincronizados ${processedCount}; ${missingIds.length} registros pendientes de confirmacion.`
      : `Sincronizacion completada para ${processedCount} registros.`;
    await recordSyncLog(missingIds.length > 0 ? 'info' : 'success', processedCount, summary);
    sendSyncUpdate(missingIds.length > 0 ? 'info' : 'success', summary);

    return { processed: processedCount, skipped: false };
  } catch (error) {
    let errorDetail = error.message || 'Error de conexión desconocido al contactar el servidor';
    if (error.code === 'ECONNREFUSED' || error.message.includes('fetch failed')) {
      errorDetail = `Fallo de conexión de red: No se pudo establecer conexión con el servidor central (${config.api_base_url}).`;
    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      errorDetail = 'Fallo de autenticación: Token JWT expirado o no autorizado en el servidor central.';
    } else if (error.message.includes('400') || error.message.includes('Bad Request')) {
      errorDetail = `Estructura de datos inválida en el payload de sincronización: ${error.message}`;
    }

    for (const row of rows) {
      const nextIntentos = row.intentos + 1;
      await dbRun(
        `UPDATE sync_queue
         SET estado = 'Error',
             intentos = ?,
             next_retry_at = ?,
             mensaje_error = ?,
             updated_at = ?
         WHERE entity_local_id = ?`,
        [
          nextIntentos,
          scheduleNextRetry(nextIntentos),
          errorDetail,
          new Date().toISOString(),
          row.entity_local_id,
        ],
      );
      await dbRun(
        `UPDATE attendance
         SET sync_status = 'Error', last_error = ?, updated_at = ?
         WHERE local_id = ?`,
        [errorDetail, new Date().toISOString(), row.entity_local_id],
      );
    }
    await recordSyncLog('error', rows.length, errorDetail);
    sendSyncUpdate('error', errorDetail);
    return { processed: 0, skipped: false, error: errorDetail };
  }
}

/**
 * Fachada compatible para la cola y los handlers existentes.
 *
 * @param {string} apiBaseUrl URL base del API.
 * @returns {Promise<Object[]>}
 * @see apps/asistencia/desktop/src/main/sync/remote-client.js#pullUsersFromServer
 */
async function pullUsersFromServer(apiBaseUrl) {
  return remoteClient.pullUsersFromServer(apiBaseUrl);
}

/**
 * Fachada para descargar marcaciones sin exponer transporte HTTP al dominio.
 *
 * @param {string} apiBaseUrl URL base del API.
 * @returns {Promise<Object[]>}
 * @see apps/asistencia/desktop/src/main/sync/remote-client.js#pullAttendanceFromServer
 */
async function pullAttendanceFromServer(apiBaseUrl) {
  return remoteClient.pullAttendanceFromServer(apiBaseUrl);
}

/**
 * Fachada para enviar la cola offline y conservar el contrato de `main.js`.
 *
 * @param {string} apiBaseUrl URL base del API.
 * @param {Object} payload Lote pendiente de sincronización.
 * @returns {Promise<Object|Array>}
 * @see apps/asistencia/desktop/src/main/sync/remote-client.js#sendSyncRequest
 * @see apps/asistencia/api/src/modules/attendance/attendance.controller.ts
 */
function sendSyncRequest(apiBaseUrl, payload) {
  return remoteClient.sendSyncRequest(apiBaseUrl, payload);
}

/**
 * Fachada para renovar el access token sin duplicar lógica HTTP.
 *
 * @param {string} apiBaseUrl URL base del API.
 * @returns {Promise<string>}
 * @see apps/asistencia/desktop/src/main/sync/remote-client.js#refreshAccessToken
 */
function refreshAccessToken(apiBaseUrl) {
  return remoteClient.refreshAccessToken(apiBaseUrl);
}

async function restartSyncTimer() {
  if (syncTimer) {
    clearInterval(syncTimer);
  }

  const config = await getDeviceConfig();
  syncTimer = setInterval(() => {
    syncPendingQueue().catch((err) => {
      recordSyncLog('error', 0, err.message).catch(() => {});
      sendSyncUpdate('error', err.message);
    });
  }, Math.max(5, Number(config.sync_interval_seconds) || 30) * 1000);
}

function getAuthorizedIpcWindows() {
  return [mainWindow, adminWindow].filter(Boolean);
}

function registerIpcHandler(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertAuthorizedSender(event, getAuthorizedIpcWindows(), channel);
    return handler(event, ...args);
  });
}

function registerIpcSyncHandler(channel, handler) {
  ipcMain.on(channel, (event, ...args) => {
    assertAuthorizedSender(event, getAuthorizedIpcWindows(), channel);
    handler(event, ...args);
  });
}

function registerIpcHandlers() {
  registerIpcHandler('ast:get-state', async () => getDesktopState());
  registerIpcHandler('ast:get-device-config', async () => getDeviceConfig());
  registerIpcSyncHandler('ast:get-auth-state-sync', (event) => {
    event.returnValue = authState;
  });
  registerIpcHandler('ast:set-auth-token', async (_event, nextState) => {
    saveAuthState({
      accessToken: nextState?.accessToken || null,
      refreshToken: nextState?.refreshToken || null,
    });
    if (nextState?.accessToken) {
      try {
        const config = await getDeviceConfig();
        const remoteUsers = await pullUsersFromServer(config.api_base_url);
        for (const u of remoteUsers) {
          await dbRun(
            `INSERT INTO local_users (dni, name, role, sede, condicion, cargo, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(dni) DO UPDATE SET
               name = excluded.name,
               role = excluded.role,
               sede = excluded.sede,
               condicion = excluded.condicion,
               cargo = excluded.cargo,
               updated_at = excluded.updated_at`,
            [u.dni, u.nombre_completo, 'usuario', 'Sede Universitaria', u.condicion, u.cargo, new Date().toISOString()]
          );
        }
        const remoteMarks = await pullAttendanceFromServer(config.api_base_url);
        for (const m of remoteMarks) {
          await dbRun(
            `INSERT INTO attendance (
               local_id, usuario_id, dni, nombre, tipo_marca, fecha_hora, id_terminal, observacion, sync_status, estado_auditoria
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Sincronizado', ?)
             ON CONFLICT(local_id) DO UPDATE SET
               sync_status = 'Sincronizado',
               nombre = excluded.nombre,
               tipo_marca = excluded.tipo_marca,
               observacion = excluded.observacion,
               estado_auditoria = excluded.estado_auditoria`,
            [m.local_id, m.usuario_id, m.dni, m.nombre, m.tipo_marca, m.fecha_hora, m.id_terminal, m.observacion, m.estado_auditoria || 'normal']
          );
        }

        if (adminWindow && !adminWindow.isDestroyed()) adminWindow.webContents.send('database:changed');
        if (kioskWindow && !kioskWindow.isDestroyed()) kioskWindow.webContents.send('database:changed');
      } catch (err) {
        console.warn('Error al descargar datos tras setAuthToken:', err.message);
      }
    }
    return { ok: true };
  });
  registerIpcHandler('ast:update-device-config', async (_event, nextConfig) => {
    const merged = { ...(await getDeviceConfig()), ...nextConfig };
    await dbRun(
      `UPDATE device_config
       SET terminal_id = ?, sede_id = ?, api_base_url = ?, sync_interval_seconds = ?, updated_at = ?
       WHERE id = 1`,
      [
        merged.terminal_id,
        merged.sede_id,
        merged.api_base_url,
        merged.sync_interval_seconds,
        new Date().toISOString(),
      ],
    );
    await restartSyncTimer();
    return getDeviceConfig();
  });
  registerIpcHandler('ast:register-mark', async (_event, payload) => {
    const localId = await registerMark(payload);
    return { ok: true, localId, state: await getDesktopState() };
  });
  registerIpcHandler('ast:find-local-user', async (_event, dni) => findLocalUserByDni(dni));
  registerIpcHandler('ast:save-local-user', async (_event, usuario) => saveLocalUser(usuario));
  registerIpcHandler('ast:delete-local-user', async (_event, dni) => {
    await dbRun('DELETE FROM local_users WHERE dni = ?', [dni]);
    if (adminWindow) adminWindow.webContents.send('database:changed');
    if (kioskWindow) kioskWindow.webContents.send('database:changed');
    return { success: true };
  });
  registerIpcHandler('ast:force-sync', async () => {
    await syncPendingQueue();
    return getDesktopState();
  });
  registerIpcHandler('ast:reset-local-data', async () => resetLocalState());
  registerIpcHandler('ast:update-mark', async (_event, localId, fields) => {
    const existing = await dbGet('SELECT * FROM attendance WHERE local_id = ?', [localId]);
    if (!existing) throw new Error('El registro no existe localmente.');

    let newFechaHora = existing.fecha_hora;
    if (fields.fecha_hora) {
      try {
        const origMin = new Date(existing.fecha_hora).toISOString().slice(0, 16);
        const newMin = new Date(fields.fecha_hora).toISOString().slice(0, 16);
        if (origMin !== newMin) {
          newFechaHora = fields.fecha_hora;
        }
      } catch {
        newFechaHora = fields.fecha_hora;
      }
    }
    const newObservacion = fields.observacion ?? existing.observacion;
    const newTipoMarca = fields.tipo_marca || existing.tipo_marca;
    const newEstadoAuditoria = fields.estado_auditoria || 'editado';

    await dbRun(
      `UPDATE attendance
       SET fecha_hora = ?, observacion = ?, tipo_marca = ?, estado_auditoria = ?, sync_status = 'Pendiente', last_error = NULL, updated_at = ?
       WHERE local_id = ?`,
      [newFechaHora, newObservacion, newTipoMarca, newEstadoAuditoria, new Date().toISOString(), localId]
    );

    const syncPayload = {
      id_operacion_local: localId,
      usuario_id: existing.usuario_id,
      dni: existing.dni,
      nombre: existing.nombre,
      fecha_hora_marca: newFechaHora,
      tipo: newTipoMarca,
      es_menor_manual: Boolean(existing.es_menor_manual),
      observacion: newObservacion,
      estado_auditoria: newEstadoAuditoria,
      visitante_nombre: existing.visitante_nombre || null,
      visitante_motivo: existing.visitante_motivo || null,
      visitante_observacion: existing.visitante_observacion || null,
    };

    await dbRun(
      `INSERT INTO sync_queue (idempotency_key, entity_local_id, payload, estado, updated_at)
       VALUES (?, ?, ?, 'Pendiente', ?)
       ON CONFLICT(idempotency_key) DO UPDATE SET payload = excluded.payload, estado = 'Pendiente', updated_at = excluded.updated_at`,
      [localId, localId, JSON.stringify(syncPayload), new Date().toISOString()]
    );

    if (adminWindow && !adminWindow.isDestroyed()) adminWindow.webContents.send('database:changed');
    if (kioskWindow && !kioskWindow.isDestroyed()) kioskWindow.webContents.send('database:changed');
    return { ok: true, state: await getDesktopState() };
  });

  registerIpcHandler('ast:delete-mark', async (_event, localId) => {
    const existing = await dbGet('SELECT * FROM attendance WHERE local_id = ?', [localId]);
    if (!existing) throw new Error('El registro no existe localmente.');

    await dbRun(
      `UPDATE attendance
       SET estado_auditoria = 'borrado', sync_status = 'Sincronizado', last_error = NULL, updated_at = ?
       WHERE local_id = ?`,
      [new Date().toISOString(), localId]
    );

    // Remove from sync_queue so deleted marks stay purely local in SQLite for audit history
    await dbRun('DELETE FROM sync_queue WHERE entity_local_id = ?', [localId]);

    if (adminWindow && !adminWindow.isDestroyed()) adminWindow.webContents.send('database:changed');
    if (kioskWindow && !kioskWindow.isDestroyed()) kioskWindow.webContents.send('database:changed');
    return { ok: true, state: await getDesktopState() };
  });

  registerIpcHandler('ast:create-manual-mark', async (_event, payload) => {
    const config = await getDeviceConfig();
    const localId = crypto.randomUUID();
    const registeredAt = payload.registered_at || new Date().toISOString();
    const observacion = payload.observacion || 'Ingreso manual por administrador';
    const syncPayload = {
      id_operacion_local: localId,
      usuario_id: payload.usuario_id || null,
      dni: payload.dni,
      nombre: payload.name,
      fecha_hora_marca: registeredAt,
      tipo: payload.type,
      es_menor_manual: false,
      observacion,
      estado_auditoria: 'nuevo',
      visitante_nombre: null,
      visitante_motivo: null,
      visitante_observacion: null,
    };

    await dbRun(
      `INSERT INTO attendance (
         local_id, usuario_id, dni, nombre, tipo_marca, fecha_hora, id_terminal, observacion,
         es_menor_manual, sync_status, estado_auditoria
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'Pendiente', 'nuevo')`,
      [
        localId,
        payload.usuario_id || null,
        payload.dni,
        payload.name,
        payload.type,
        registeredAt,
        config.terminal_id,
        observacion,
      ],
    );

    await dbRun(
      `INSERT INTO sync_queue (idempotency_key, entity_local_id, payload, estado)
       VALUES (?, ?, ?, 'Pendiente')`,
      [localId, localId, JSON.stringify(syncPayload)],
    );

    if (adminWindow && !adminWindow.isDestroyed()) adminWindow.webContents.send('database:changed');
    if (kioskWindow && !kioskWindow.isDestroyed()) kioskWindow.webContents.send('database:changed');
    return { ok: true, state: await getDesktopState() };
  });

  registerIpcHandler('ast:find-last-mark', async (_event, dni) => findLastMarkForDni(dni));
  registerIpcHandler('ast:save-offline-credentials', async (_event, payload) => saveOfflineCredentials(payload));
  registerIpcHandler('ast:verify-offline-credentials', async (_event, payload) => verifyOfflineCredentials(payload));
}

async function findLastMarkForDni(dni) {
  return (
    await dbGet(
      `SELECT local_id, usuario_id, dni, nombre, tipo_marca, fecha_hora, observacion, sync_status
       FROM attendance
       WHERE dni = ? AND estado_auditoria != 'borrado'
       ORDER BY fecha_hora DESC
       LIMIT 1`,
      [dni],
    )
  ) || null;
}

async function saveOfflineCredentials({ username, password, user }) {
  if (!username || !password || !user) return;
  const passHash = hashOfflinePassword(password);
  const cleanUsername = String(username).trim().toLowerCase();
  const cleanEmail = user.email ? String(user.email).trim().toLowerCase() : null;
  const userDataJson = JSON.stringify(user);

  await dbRun(
    `INSERT INTO offline_auth_cache (username, password_hash, dni, full_name, role, email, user_data_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET
       password_hash = excluded.password_hash,
       dni = excluded.dni,
       full_name = excluded.full_name,
       role = excluded.role,
       email = excluded.email,
       user_data_json = excluded.user_data_json,
       updated_at = excluded.updated_at`,
    [
      cleanUsername,
      passHash,
      user.dni || user.id || null,
      user.full_name || user.username || cleanUsername,
      user.role || 'operador',
      cleanEmail,
      userDataJson,
      new Date().toISOString()
    ]
  );
  console.log(`SQLite: Saved offline auth credentials for user ${cleanUsername}`);
}

async function verifyOfflineCredentials({ username, password }) {
  if (!username || !password) {
    return { ok: false, error: 'Usuario y contraseña requeridos.' };
  }
  const cleanInput = String(username).trim().toLowerCase();

  const cachedUser = await dbGet(
    `SELECT * FROM offline_auth_cache WHERE LOWER(username) = ? OR LOWER(email) = ?`,
    [cleanInput, cleanInput]
  );

  if (cachedUser && verifyOfflinePassword(password, cachedUser.password_hash)) {
    let userData = {};
    try {
      userData = JSON.parse(cachedUser.user_data_json);
    } catch {}
    return {
      ok: true,
      user: {
        id: userData.id || cachedUser.dni || 'offline-id',
        username: cachedUser.username,
        email: cachedUser.email,
        full_name: cachedUser.full_name,
        role: cachedUser.role,
        isOfflineSession: true
      }
    };
  }

  return { ok: false, error: 'Credenciales inválidas en modo offline.' };
}

let kioskWindow = null;
let adminWindow = null;
let isQuitting = false;

function createWindows() {
  const savedState = loadWindowState();
  const primaryDisp = screen.getPrimaryDisplay().workAreaSize;
  const defaultW = Math.max(900, Math.round(primaryDisp.width * 0.8));
  const defaultH = Math.max(620, Math.round(primaryDisp.height * 0.8));

  // 1. Crear Ventana del Kiosco Público (que será mainWindow para el SyncEngine)
  kioskWindow = new BrowserWindow({
    x: savedState?.x ?? undefined,
    y: savedState?.y ?? undefined,
    width: savedState?.width ?? defaultW,
    height: savedState?.height ?? defaultH,
    kiosk: false,
    fullscreen: false,
    autoHideMenuBar: isDev ? false : true,
    frame: true,
    resizable: true,
    maximizable: true,
    minimizable: true,
    fullscreenable: true,
    minWidth: 860,
    minHeight: 560,
    title: 'InfoUNSA - Kiosco de Asistencia',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow = kioskWindow;

  if (savedState?.maximized) kioskWindow.maximize();
  if (savedState?.fullscreen) kioskWindow.setFullScreen(true);

  const persistState = () => saveWindowState(kioskWindow);
  kioskWindow.on('resize', persistState);
  kioskWindow.on('move', persistState);
  kioskWindow.on('maximize', persistState);
  kioskWindow.on('unmaximize', persistState);

  if (isDev) {
    kioskWindow.loadURL('http://localhost:5174/#/kiosk');
    kioskWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    kioskWindow.loadFile('dist/index.html', { hash: 'kiosk' });
  }

  kioskWindow.on('close', (event) => {
    isQuitting = true;
    app.quit();
  });

  kioskWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      kioskWindow.setFullScreen(!kioskWindow.isFullScreen());
    } else if (input.key === 'F11') {
      event.preventDefault();
    }
  });

  // 2. Crear Ventana del Panel de Administración (oculta al inicio)
  adminWindow = new BrowserWindow({
    width: 1050,
    height: 750,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    adminWindow.loadURL('http://localhost:5174/#/admin');
  } else {
    adminWindow.loadFile('dist/index.html', { hash: 'admin' });
  }

  adminWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      adminWindow.hide();
    }
  });
}

function toggleAdminWindow() {
  if (!adminWindow) return;
  if (adminWindow.isVisible()) {
    adminWindow.hide();
  } else {
    adminWindow.show();
    adminWindow.focus();
  }
}

app.on('before-quit', () => {
  isQuitting = true;
  if (syncTimer) {
    clearInterval(syncTimer);
  }
  if (db) {
    db.close();
  }
});

// Puente IPC cruzado entre ventanas (Cross-Window IPC)
ipcMain.on('kiosk:unknown-dni', (event, dni) => {
  assertAuthorizedSender(event, [mainWindow], 'kiosk:unknown-dni');
  console.log(`[IPC Main] Kiosk reported unknown DNI: ${dni}. Notifying Admin window.`);
  if (adminWindow) {
    adminWindow.webContents.send('admin:register-visitor', dni);
    adminWindow.show();
    adminWindow.focus();
  }
});

ipcMain.on('admin:visitor-registered-success', (event, data) => {
  assertAuthorizedSender(event, [adminWindow], 'admin:visitor-registered-success');
  console.log(`[IPC Main] Admin registered visitor ${data.name} for DNI ${data.dni}. Notifying Kiosk window.`);
  if (kioskWindow) {
    kioskWindow.webContents.send('kiosk:visitor-registered-success', data);
  }
});

ipcMain.on('admin:simulate-kiosk-scan', (event, dni) => {
  assertAuthorizedSender(event, [adminWindow], 'admin:simulate-kiosk-scan');
  console.log(`[IPC Main] Admin requested scan simulation for DNI: ${dni}`);
  if (kioskWindow) {
    kioskWindow.webContents.send('kiosk:simulate-scan', dni);
  }
});

ipcMain.on('kiosk:toggle-admin', (event) => {
  assertAuthorizedSender(event, [mainWindow], 'kiosk:toggle-admin');
  console.log(`[IPC Main] Kiosk requested toggle admin window`);
  toggleAdminWindow();
});

ipcMain.on('database:changed', (event) => {
  assertAuthorizedSender(event, getAuthorizedIpcWindows(), 'database:changed');
  console.log(`[IPC Main] Database changed event received. Broadcasting to all windows.`);
  if (adminWindow) adminWindow.webContents.send('database:changed');
  if (kioskWindow) kioskWindow.webContents.send('database:changed');
});

app.whenReady().then(async () => {
  try {
    authState = loadAuthState();
    await initDB();
    registerIpcHandlers();
    createWindows();
    await restartSyncTimer();

    globalShortcut.register('CommandOrControl+Alt+Shift+K', () => {
      app.exit(0);
    });

    globalShortcut.register('CommandOrControl+Alt+A', () => {
      toggleAdminWindow();
    });
  } catch (err) {
    console.error('Fallo al iniciar asistencia desktop:', err);
    app.exit(1);
  }
});
