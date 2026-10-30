const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const {
  createSqliteAdapter,
  createInventoryPersistence,
} = require('./sqlite-adapter');

/**
 * Crea un driver SQLite en memoria compatible con la interfaz callback de sqlite3
 * para ejecutar pruebas reales y aisladas sin requerir el runtime de Electron.
 */
function createInMemoryDriver() {
  const db = new DatabaseSync(':memory:');
  return {
    run(sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      try {
        const stmt = db.prepare(sql);
        const result = stmt.run(...(params || []));
        callback.call(
          { lastID: Number(result.lastInsertRowid), changes: Number(result.changes) },
          null
        );
      } catch (err) {
        callback(err);
      }
    },
    get(sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      try {
        const stmt = db.prepare(sql);
        const row = stmt.get(...(params || []));
        callback(null, row || undefined);
      } catch (err) {
        callback(err);
      }
    },
    all(sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      try {
        const stmt = db.prepare(sql);
        const rows = stmt.all(...(params || []));
        callback(null, rows || []);
      } catch (err) {
        callback(err);
      }
    },
    exec(sql, callback) {
      try {
        db.exec(sql);
        callback(null);
      } catch (err) {
        callback(err);
      }
    },
  };
}

test('createSqliteAdapter: adapts sqlite callbacks to promises and preserves write metadata', async () => {
  const fakeDb = {
    run(sql, params, callback) {
      assert.equal(sql, 'INSERT INTO test VALUES (?)');
      assert.deepEqual(params, ['sample']);
      callback.call({ lastID: 42, changes: 1 }, null);
    },
    get(sql, params, callback) {
      assert.equal(sql, 'SELECT * FROM test WHERE id = ?');
      assert.deepEqual(params, [42]);
      callback(null, { id: 42, name: 'sample' });
    },
    all(sql, _params, callback) {
      assert.equal(sql, 'SELECT * FROM test');
      callback(null, undefined);
    },
    exec(sql, callback) {
      assert.equal(sql, 'CREATE TABLE test (id INT)');
      callback(null);
    },
  };

  const adapter = createSqliteAdapter(fakeDb);

  const runRes = await adapter.run('INSERT INTO test VALUES (?)', ['sample']);
  assert.deepEqual(runRes, { lastID: 42, changes: 1 });

  const getRes = await adapter.get('SELECT * FROM test WHERE id = ?', [42]);
  assert.deepEqual(getRes, { id: 42, name: 'sample' });

  const allRes = await adapter.all('SELECT * FROM test');
  assert.deepEqual(allRes, []);

  await adapter.exec('CREATE TABLE test (id INT)');
});

test('createSqliteAdapter: propagates driver errors', async () => {
  const expectedErr = new Error('database disk failure');
  const adapter = createSqliteAdapter({
    run(_sql, _params, callback) {
      callback(expectedErr);
    },
  });

  await assert.rejects(adapter.run('INSERT INTO dummy'), expectedErr);
});

test('createSqliteAdapter: throws TypeError when invalid driver provided', () => {
  assert.throws(() => createSqliteAdapter(null), TypeError);
  assert.throws(() => createSqliteAdapter({}), TypeError);
});

test('createInventoryPersistence: initializes declarative schema from schema.sql', async () => {
  const driver = createInMemoryDriver();
  const adapter = createSqliteAdapter(driver);
  const persistence = createInventoryPersistence(adapter);

  const schemaPath = path.resolve(__dirname, '../../../schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  await persistence.initSchema(schemaSql);

  // Verifica que las tablas principales existen
  const items = await adapter.all('SELECT * FROM inventory_items');
  const movements = await adapter.all('SELECT * FROM inventory_movements');
  const outbox = await adapter.all('SELECT * FROM sync_queue');
  const categories = await adapter.all('SELECT * FROM categories');
  const alerts = await adapter.all('SELECT * FROM alerts');

  assert.deepEqual(items, []);
  assert.deepEqual(movements, []);
  assert.deepEqual(outbox, []);
  assert.deepEqual(categories, []);
  assert.deepEqual(alerts, []);

  // Verifica vistas canónicas
  const vItems = await adapter.all('SELECT * FROM items');
  const vMovements = await adapter.all('SELECT * FROM movements');
  const vOutbox = await adapter.all('SELECT * FROM outbox');

  assert.deepEqual(vItems, []);
  assert.deepEqual(vMovements, []);
  assert.deepEqual(vOutbox, []);
});

test('createInventoryPersistence: registers movement, updates catalog cache and enqueues offline outbox', async () => {
  const driver = createInMemoryDriver();
  const adapter = createSqliteAdapter(driver);
  const persistence = createInventoryPersistence(adapter);

  const schemaPath = path.resolve(__dirname, '../../../schema.sql');
  await persistence.initSchema(fs.readFileSync(schemaPath, 'utf8'));

  const payload = {
    id_operacion_local: 'mov-local-001',
    item_barcode: '7751234567890',
    item_name: 'Resma de Papel A4',
    item_category: 'Papelería',
    item_stock: 50,
    type: 'entrada',
    quantity: 10,
    registered_at: '2026-10-29T12:00:00Z',
    destinatario_name: 'Facultad de Ingeniería',
    observations: 'Entrega inicial de útiles',
    operator_name: 'operador1',
    area_id: 2,
  };

  const state = await persistence.registerMovement(payload);

  assert.equal(state.movements.length, 1);
  assert.equal(state.movements[0].code, '7751234567890');
  assert.equal(state.movements[0].item_name, 'Resma de Papel A4');
  assert.equal(state.movements[0].status, 'pending');

  assert.equal(state.syncQueue.length, 1);
  assert.equal(state.syncQueue[0].entity_local_id, 'mov-local-001');
  assert.equal(state.syncQueue[0].status, 'pending');

  // Registrar un segundo movimiento para el mismo artículo actualiza el stock/nombre existente
  const payload2 = {
    id_operacion_local: 'mov-local-002',
    item_barcode: '7751234567890',
    item_name: 'Resma de Papel A4 80g',
    item_category: 'Papelería Premium',
    item_stock: 40,
    type: 'salida',
    quantity: 10,
    registered_at: '2026-10-29T12:30:00Z',
    destinatario_name: 'Decanato',
    observations: 'Despacho urgente',
    operator_name: 'operador1',
    area_id: 2,
  };

  const state2 = await persistence.registerMovement(payload2);
  assert.equal(state2.movements.length, 2);
  assert.equal(state2.syncQueue.length, 2);

  const cachedItems = await adapter.all('SELECT * FROM inventory_items WHERE code = ?', ['7751234567890']);
  assert.equal(cachedItems.length, 1);
  assert.equal(cachedItems[0].name, 'Resma de Papel A4 80g');
  assert.equal(cachedItems[0].stock, 40);
});

test('createInventoryPersistence: manages offline outbox sync transitions (pending -> sending -> success / rollback)', async () => {
  const driver = createInMemoryDriver();
  const adapter = createSqliteAdapter(driver);
  const persistence = createInventoryPersistence(adapter);

  const schemaPath = path.resolve(__dirname, '../../../schema.sql');
  await persistence.initSchema(fs.readFileSync(schemaPath, 'utf8'));

  await persistence.registerMovement({
    id_operacion_local: 'op-101',
    item_barcode: 'BAR101',
    item_name: 'Plumones',
    type: 'entrada',
    quantity: 5,
    registered_at: '2026-10-29T10:00:00Z',
  });

  await persistence.registerMovement({
    id_operacion_local: 'op-102',
    item_barcode: 'BAR102',
    item_name: 'Borradores',
    type: 'salida',
    quantity: 2,
    registered_at: '2026-10-29T10:05:00Z',
  });

  // 1. Obtener cola pendiente
  const pending = await persistence.getPendingSyncQueue();
  assert.equal(pending.length, 2);
  const ids = pending.map((row) => row.id_local);

  // 2. Marcar como sending
  await persistence.markQueueSending(ids);
  const sendingPending = await persistence.getPendingSyncQueue();
  assert.equal(sendingPending.length, 0);

  // 3. Simular fallo de red: restaurar a pending
  await persistence.markQueuePending(ids);
  const recoveredPending = await persistence.getPendingSyncQueue();
  assert.equal(recoveredPending.length, 2);

  // 4. Simular sincronización exitosa de op-101
  await persistence.markSyncSuccess(['op-101']);
  const remainingQueue = await persistence.getPendingSyncQueue();
  assert.equal(remainingQueue.length, 1);
  assert.equal(remainingQueue[0].entity_local_id, 'op-102');

  const syncedMovement = await adapter.get(
    'SELECT status FROM inventory_movements WHERE id_operacion_local = ?',
    ['op-101']
  );
  assert.equal(syncedMovement.status, 'sincronizado');
});

test('createInventoryPersistence: replaces catalog cache while preserving pending outbox records', async () => {
  const driver = createInMemoryDriver();
  const adapter = createSqliteAdapter(driver);
  const persistence = createInventoryPersistence(adapter);

  const schemaPath = path.resolve(__dirname, '../../../schema.sql');
  await persistence.initSchema(fs.readFileSync(schemaPath, 'utf8'));

  // Registrar un movimiento local pendiente de sincronización
  await persistence.registerMovement({
    id_operacion_local: 'local-preserve-1',
    item_barcode: 'LOC01',
    item_name: 'Item Local',
    type: 'entrada',
    quantity: 1,
    registered_at: '2026-10-29T09:00:00Z',
  });

  // Reemplazar caché desde el servidor
  const serverItems = [
    { barcode: 'SRV01', name: 'Servidor Item 1', category_name: 'Hardware', quantity: 15 },
    { barcode: 'SRV02', name: 'Servidor Item 2', category_name: 'Cables', quantity: 30 },
  ];
  const serverMovements = [
    { id: 99, item_barcode: 'SRV01', type: 'entrada', quantity: 15, registered_at: '2026-10-29T08:00:00Z' },
  ];

  await persistence.replaceCatalogCache(serverItems, serverMovements);

  // Verificar que los ítems del servidor fueron almacenados
  const items = await adapter.all('SELECT * FROM inventory_items ORDER BY code ASC');
  assert.equal(items.length, 2);
  assert.equal(items[0].code, 'SRV01');
  assert.equal(items[1].code, 'SRV02');

  // Verificar que la cola pendiente offline local sigue intacta
  const pending = await persistence.getPendingSyncQueue();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].entity_local_id, 'local-preserve-1');
});

test('createInventoryPersistence: manages local categories and alerts', async () => {
  const driver = createInMemoryDriver();
  const adapter = createSqliteAdapter(driver);
  const persistence = createInventoryPersistence(adapter);

  const schemaPath = path.resolve(__dirname, '../../../schema.sql');
  await persistence.initSchema(fs.readFileSync(schemaPath, 'utf8'));

  await persistence.upsertCategories([
    { id: 1, name: 'Papelería', description: 'Útiles de oficina' },
    { id: 2, name: 'Limpieza', description: 'Productos de higiene' },
  ]);

  const categories = await persistence.getCachedCategories();
  assert.equal(categories.length, 2);
  assert.equal(categories[0].name, 'Limpieza');
  assert.equal(categories[1].name, 'Papelería');

  await persistence.saveAlert({
    item_id: 1,
    code: 'SRV01',
    message: 'Stock mínimo alcanzado (menos de 5 unidades)',
  });

  const alerts = await persistence.getCachedAlerts();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].code, 'SRV01');
  assert.ok(alerts[0].message.includes('Stock mínimo'));
});

test('canonical views: allow transparent writes via INSTEAD OF triggers', async () => {
  const driver = createInMemoryDriver();
  const adapter = createSqliteAdapter(driver);
  const persistence = createInventoryPersistence(adapter);

  const schemaPath = path.resolve(__dirname, '../../../schema.sql');
  await persistence.initSchema(fs.readFileSync(schemaPath, 'utf8'));

  // Inserción en la vista items
  await adapter.run(
    'INSERT INTO items (code, name, category, stock) VALUES (?, ?, ?, ?)',
    ['VIEW-01', 'Teclado USB', 'Computo', 12]
  );
  const itemRow = await adapter.get('SELECT * FROM inventory_items WHERE code = ?', ['VIEW-01']);
  assert.ok(itemRow);
  assert.equal(itemRow.name, 'Teclado USB');

  // Inserción en la vista movements
  await adapter.run(
    'INSERT INTO movements (id_operacion_local, code, type, quantity, registered_at) VALUES (?, ?, ?, ?, ?)',
    ['mov-view-1', 'VIEW-01', 'entrada', 12, '2026-10-29T11:00:00Z']
  );
  const movRow = await adapter.get('SELECT * FROM inventory_movements WHERE id_operacion_local = ?', ['mov-view-1']);
  assert.ok(movRow);
  assert.equal(movRow.quantity, 12);

  // Inserción en la vista outbox
  await adapter.run(
    'INSERT INTO outbox (entity_local_id, payload, status) VALUES (?, ?, ?)',
    ['mov-view-1', '{"test":true}', 'pending']
  );
  const outboxRow = await adapter.get('SELECT * FROM sync_queue WHERE entity_local_id = ?', ['mov-view-1']);
  assert.ok(outboxRow);
  assert.equal(outboxRow.status, 'pending');
});
