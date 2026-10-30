PRAGMA foreign_keys = ON;

-- Catálogo local de artículos / inventario
CREATE TABLE IF NOT EXISTS inventory_items (
    id_local         INTEGER PRIMARY KEY AUTOINCREMENT,
    code             TEXT NOT NULL UNIQUE,
    name             TEXT NOT NULL,
    category         TEXT NOT NULL DEFAULT '',
    stock            INTEGER NOT NULL DEFAULT 0,
    unit             TEXT NOT NULL DEFAULT 'unidad',
    min_stock        INTEGER NOT NULL DEFAULT 5,
    category_id      INTEGER,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_code
    ON inventory_items(code);

-- Registro de movimientos locales de inventario
CREATE TABLE IF NOT EXISTS inventory_movements (
    id_local           INTEGER PRIMARY KEY AUTOINCREMENT,
    id_operacion_local TEXT UNIQUE,
    code               TEXT NOT NULL,
    type               TEXT NOT NULL,
    quantity           INTEGER NOT NULL,
    registered_at      TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'pending',
    destinatario_name  TEXT,
    observations       TEXT,
    operator_name      TEXT DEFAULT 'admin',
    area_id            INTEGER,
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_code
    ON inventory_movements(code);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_registered_at
    ON inventory_movements(registered_at DESC);

-- Cola de sincronización local / Outbox para operaciones pendientes
CREATE TABLE IF NOT EXISTS sync_queue (
    id_local         INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_local_id  TEXT NOT NULL UNIQUE,
    payload          TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending',
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status
    ON sync_queue(status);

-- Categorías cacheadas localmente para uso offline
CREATE TABLE IF NOT EXISTS categories (
    id               INTEGER PRIMARY KEY,
    name             TEXT NOT NULL UNIQUE,
    description      TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Alertas de stock cacheadas localmente
CREATE TABLE IF NOT EXISTS alerts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id          INTEGER,
    code             TEXT,
    message          TEXT,
    triggered_at     TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at      TEXT
);

-- Vistas canónicas de compatibilidad y nombres de dominio
CREATE VIEW IF NOT EXISTS items AS
    SELECT id_local, code, name, category, stock, unit, min_stock, category_id, created_at, updated_at
    FROM inventory_items;

CREATE VIEW IF NOT EXISTS movements AS
    SELECT id_local, id_operacion_local, code, type, quantity, registered_at, status, destinatario_name, observations, operator_name, area_id, created_at
    FROM inventory_movements;

CREATE VIEW IF NOT EXISTS outbox AS
    SELECT id_local, entity_local_id, payload, status, created_at, updated_at
    FROM sync_queue;

-- Triggers para habilitar escritura transparente en las vistas canónicas
CREATE TRIGGER IF NOT EXISTS trigger_items_insert
INSTEAD OF INSERT ON items
BEGIN
    INSERT INTO inventory_items (code, name, category, stock, unit, min_stock, category_id)
    VALUES (NEW.code, NEW.name, coalesce(NEW.category, ''), coalesce(NEW.stock, 0), coalesce(NEW.unit, 'unidad'), coalesce(NEW.min_stock, 5), NEW.category_id);
END;

CREATE TRIGGER IF NOT EXISTS trigger_movements_insert
INSTEAD OF INSERT ON movements
BEGIN
    INSERT INTO inventory_movements (id_operacion_local, code, type, quantity, registered_at, status, destinatario_name, observations, operator_name, area_id)
    VALUES (NEW.id_operacion_local, NEW.code, NEW.type, NEW.quantity, NEW.registered_at, coalesce(NEW.status, 'pending'), NEW.destinatario_name, NEW.observations, coalesce(NEW.operator_name, 'admin'), NEW.area_id);
END;

CREATE TRIGGER IF NOT EXISTS trigger_outbox_insert
INSTEAD OF INSERT ON outbox
BEGIN
    INSERT INTO sync_queue (entity_local_id, payload, status)
    VALUES (NEW.entity_local_id, NEW.payload, coalesce(NEW.status, 'pending'));
END;
