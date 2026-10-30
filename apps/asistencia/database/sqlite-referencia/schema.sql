PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS device_config (
    id                    INTEGER PRIMARY KEY CHECK (id = 1),
    terminal_id           TEXT NOT NULL,
    sede_id               TEXT NOT NULL,
    api_base_url          TEXT NOT NULL,
    sync_interval_seconds INTEGER NOT NULL DEFAULT 30,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance (
    local_id         TEXT PRIMARY KEY,
    usuario_id       TEXT,
    dni              TEXT NOT NULL,
    nombre           TEXT NOT NULL,
    tipo_marca       TEXT NOT NULL CHECK (tipo_marca IN ('entrada', 'salida')),
    fecha_hora       TEXT NOT NULL,
    id_terminal      TEXT NOT NULL,
    observacion      TEXT,
    es_menor_manual  INTEGER NOT NULL DEFAULT 0,
    sync_status      TEXT NOT NULL DEFAULT 'Pendiente'
                     CHECK (sync_status IN ('Pendiente', 'Enviando', 'Sincronizado', 'Error', 'Conflicto')),
    last_error       TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_attendance_fecha_hora
    ON attendance(fecha_hora DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_sync_status
    ON attendance(sync_status);

CREATE TABLE IF NOT EXISTS sync_queue (
    id_sync          INTEGER PRIMARY KEY AUTOINCREMENT,
    idempotency_key  TEXT NOT NULL UNIQUE,
    entity_type      TEXT NOT NULL DEFAULT 'attendance'
                     CHECK (entity_type IN ('attendance')),
    entity_local_id  TEXT NOT NULL UNIQUE,
    payload          TEXT NOT NULL,
    estado           TEXT NOT NULL DEFAULT 'Pendiente'
                     CHECK (estado IN ('Pendiente', 'Enviando', 'Sincronizado', 'Error', 'Rechazado', 'Conflicto')),
    intentos         INTEGER NOT NULL DEFAULT 0,
    max_intentos     INTEGER NOT NULL DEFAULT 8,
    next_retry_at    TEXT,
    mensaje_error    TEXT,
    fecha_creacion   TEXT NOT NULL DEFAULT (datetime('now')),
    fecha_envio      TEXT,
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_estado_retry
    ON sync_queue(estado, next_retry_at);

CREATE TABLE IF NOT EXISTS sync_logs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp         TEXT NOT NULL DEFAULT (datetime('now')),
    type              TEXT NOT NULL CHECK (type IN ('success', 'error', 'info')),
    count             INTEGER NOT NULL DEFAULT 0,
    message           TEXT NOT NULL
);
