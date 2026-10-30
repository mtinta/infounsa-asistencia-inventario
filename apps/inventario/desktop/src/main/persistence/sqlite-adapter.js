/**
 * Adaptador de persistencia SQLite desacoplado para Inventario Desktop.
 *
 * Sigue el patrón maduro de persistencia asíncrona implementado en Asistencia Desktop,
 * desacoplando el driver SQLite subyacente y la lógica de acceso a datos de las APIs de Electron.
 */

/**
 * Resultado mínimo que devuelve sqlite3 después de una operación de escritura.
 *
 * @typedef {Object} SqliteRunResult
 * @property {number} lastID Identificador generado por SQLite, si aplica.
 * @property {number} changes Número de filas afectadas por la operación.
 */

/**
 * Contrato mínimo para acceder a SQLite mediante callbacks.
 *
 * @typedef {Object} SqliteDatabase
 * @property {Function} run Método callback de escritura del driver.
 * @property {Function} get Método callback para una fila.
 * @property {Function} all Método callback para varias filas.
 * @property {Function} exec Método callback para SQL de esquema o migración.
 */

/**
 * Crea la frontera asíncrona de persistencia basada en Promesas.
 *
 * @param {SqliteDatabase} database Instancia compatible con sqlite3.
 * @returns {{run: Function, get: Function, all: Function, exec: Function}}
 * @throws {TypeError} Cuando no se recibe un driver compatible.
 */
function createSqliteAdapter(database) {
  if (!database || typeof database.run !== 'function') {
    throw new TypeError('A sqlite3-compatible database instance is required.');
  }

  return {
    /**
     * Ejecuta una escritura y conserva metadata (lastID, changes).
     *
     * @param {string} sql Sentencia SQL parametrizada.
     * @param {unknown[]} [params=[]] Valores de los placeholders SQL.
     * @returns {Promise<SqliteRunResult>}
     */
    run(sql, params = []) {
      return new Promise((resolve, reject) => {
        database.run(sql, params, function onRun(error) {
          if (error) {
            reject(error);
            return;
          }
          resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    },

    /**
     * Obtiene una sola fila; devuelve `undefined` si no existe.
     *
     * @param {string} sql Sentencia SQL parametrizada.
     * @param {unknown[]} [params=[]] Valores de los placeholders SQL.
     * @returns {Promise<Object|undefined>}
     */
    get(sql, params = []) {
      return new Promise((resolve, reject) => {
        database.get(sql, params, (error, row) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(row);
        });
      });
    },

    /**
     * Obtiene varias filas y normaliza la respuesta vacía a `[]`.
     *
     * @param {string} sql Sentencia SQL parametrizada.
     * @param {unknown[]} [params=[]] Valores de los placeholders SQL.
     * @returns {Promise<Object[]>}
     */
    all(sql, params = []) {
      return new Promise((resolve, reject) => {
        database.all(sql, params, (error, rows) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(rows || []);
        });
      });
    },

    /**
     * Ejecuta SQL sin devolver filas, usado para esquema y migraciones.
     *
     * @param {string} sql Sentencia SQL, potencialmente multilínea.
     * @returns {Promise<void>}
     */
    exec(sql) {
      return new Promise((resolve, reject) => {
        database.exec(sql, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

/**
 * Crea el repositorio desacoplado de persistencia de inventario.
 *
 * @param {ReturnType<typeof createSqliteAdapter>} adapter
 */
function createInventoryPersistence(adapter) {
  if (!adapter || typeof adapter.run !== 'function' || typeof adapter.exec !== 'function') {
    throw new TypeError('A valid sqlite adapter is required.');
  }

  return {
    adapter,

    /**
     * Inicializa el esquema declarativo y aplica migraciones de columnas si es necesario.
     *
     * @param {string} schemaSql Contenido SQL de apps/inventario/desktop/schema.sql.
     */
    async initSchema(schemaSql) {
      await adapter.exec(schemaSql);

      // Migraciones seguras para bases de datos legadas existentes
      const legacyMigrations = [
        "ALTER TABLE inventory_movements ADD COLUMN id_operacion_local TEXT",
        "ALTER TABLE inventory_movements ADD COLUMN status TEXT DEFAULT 'pending'",
        "ALTER TABLE inventory_movements ADD COLUMN destinatario_name TEXT",
        "ALTER TABLE inventory_movements ADD COLUMN observations TEXT",
        "ALTER TABLE inventory_movements ADD COLUMN operator_name TEXT",
        "ALTER TABLE inventory_movements ADD COLUMN area_id INTEGER",
        "ALTER TABLE sync_queue ADD COLUMN status TEXT DEFAULT 'pending'",
        "ALTER TABLE sync_queue ADD COLUMN entity_local_id TEXT",
        "ALTER TABLE sync_queue ADD COLUMN payload TEXT",
      ];

      for (const statement of legacyMigrations) {
        try {
          await adapter.exec(statement);
        } catch {
          // Si la columna ya existe en SQLite, se ignora silenciosamente.
        }
      }
    },

    /**
     * Obtiene el estado actual para la interfaz de escritorio (últimos 100 movimientos y cola pendiente).
     */
    async getDesktopState() {
      const movements = await adapter.all(`
        SELECT 
          m.id_local,
          m.id_operacion_local,
          m.code,
          m.code as item_barcode,
          m.type,
          m.quantity,
          m.registered_at,
          m.status,
          m.status as sync_status,
          m.destinatario_name,
          m.observations,
          m.operator_name,
          m.area_id,
          i.name as item_name
        FROM inventory_movements m
        LEFT JOIN inventory_items i ON m.code = i.code
        ORDER BY m.registered_at DESC 
        LIMIT 100
      `);

      const syncQueue = await adapter.all(
        "SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY id_local ASC"
      );

      return { movements, syncQueue };
    },

    /**
     * Registra un movimiento de forma atómica: actualiza el catálogo local, guarda el movimiento
     * y encola la operación en la cola de sincronización offline (outbox).
     *
     * @param {Object} payload Datos del movimiento a registrar.
     */
    async registerMovement(payload) {
      await adapter.exec('BEGIN TRANSACTION');
      try {
        const cachedItem = await adapter.get(
          'SELECT id_local FROM inventory_items WHERE code = ? LIMIT 1',
          [payload.item_barcode]
        );

        if (cachedItem) {
          await adapter.run(
            `UPDATE inventory_items
             SET name = ?,
                 category = CASE WHEN ? != '' THEN ? ELSE category END,
                 stock = ?
             WHERE id_local = ?`,
            [
              payload.item_name || payload.item_barcode,
              payload.item_category || '',
              payload.item_category || '',
              Number(payload.item_stock) || 0,
              cachedItem.id_local,
            ]
          );
        } else {
          await adapter.run(
            `INSERT INTO inventory_items (code, name, category, stock)
             VALUES (?, ?, ?, ?)`,
            [
              payload.item_barcode,
              payload.item_name || payload.item_barcode,
              payload.item_category || '',
              Number(payload.item_stock) || 0,
            ]
          );
        }

        await adapter.run(
          `INSERT INTO inventory_movements (id_operacion_local, code, type, quantity, registered_at, status, destinatario_name, observations, operator_name, area_id)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
          [
            payload.id_operacion_local,
            payload.item_barcode,
            payload.type,
            payload.quantity,
            payload.registered_at,
            payload.destinatario_name || null,
            payload.observations || null,
            payload.operator_name || 'admin',
            payload.area_id || null,
          ]
        );

        await adapter.run(
          `INSERT INTO sync_queue (entity_local_id, payload, status)
           VALUES (?, ?, 'pending')`,
          [payload.id_operacion_local, JSON.stringify(payload)]
        );

        await adapter.exec('COMMIT');
      } catch (err) {
        await adapter.exec('ROLLBACK');
        throw err;
      }

      return this.getDesktopState();
    },

    /**
     * Reemplaza el caché de artículos y movimientos recibido del backend de forma atómica,
     * conservando las operaciones pendientes en el outbox.
     *
     * @param {Array<Object>} items Lista de artículos del backend.
     * @param {Array<Object>} movements Lista de movimientos del backend.
     */
    async replaceCatalogCache(items = [], movements = []) {
      await adapter.exec('BEGIN TRANSACTION');
      try {
        await adapter.run('DELETE FROM inventory_items');
        await adapter.run('DELETE FROM inventory_movements');
        await adapter.run("DELETE FROM sync_queue WHERE status != 'pending'");

        const itemList = Array.isArray(items) ? items : (items.data || []);
        for (const item of itemList) {
          await adapter.run(
            `INSERT OR REPLACE INTO inventory_items (code, name, category, stock)
             VALUES (?, ?, ?, ?)`,
            [
              item.barcode || item.code,
              item.name,
              item.category_name || item.category?.name || item.category || '',
              item.quantity ?? item.stock ?? 0,
            ]
          );
        }

        const movementList = Array.isArray(movements) ? movements : [];
        for (const mv of movementList) {
          const codeVal = mv.item_barcode || mv.code || '0000000';
          const typeVal = mv.type || 'entrada';
          const qtyVal = Number(mv.quantity) || 0;
          const dateVal = mv.registered_at || new Date().toISOString();

          await adapter.run(
            `INSERT OR REPLACE INTO inventory_movements (id_operacion_local, code, type, quantity, registered_at, status, destinatario_name, observations, operator_name, area_id)
             VALUES (?, ?, ?, ?, ?, 'sincronizado', ?, ?, ?, ?)`,
            [
              mv.id_operacion_local || `server-${mv.id}`,
              codeVal,
              typeVal,
              qtyVal,
              dateVal,
              mv.destinatario_name || null,
              mv.observations || null,
              mv.operator_name || 'admin',
              mv.area_id || null,
            ]
          );
        }

        await adapter.exec('COMMIT');
      } catch (err) {
        await adapter.exec('ROLLBACK');
        throw err;
      }
    },

    /**
     * Obtiene los elementos pendientes en la cola de sincronización.
     *
     * @param {number} [limit=500]
     */
    async getPendingSyncQueue(limit = 500) {
      return adapter.all(
        'SELECT * FROM sync_queue WHERE status = ? LIMIT ?',
        ['pending', limit]
      );
    },

    /**
     * Marca un lote de elementos como 'sending'.
     *
     * @param {number[]} ids
     */
    async markQueueSending(ids = []) {
      if (!ids.length) return;
      const placeholders = ids.map(() => '?').join(',');
      await adapter.run(
        `UPDATE sync_queue SET status = 'sending' WHERE id_local IN (${placeholders})`,
        ids
      );
    },

    /**
     * Confirma la sincronización exitosa de operaciones: elimina de la cola y actualiza el movimiento local.
     *
     * @param {string[]} localIds
     */
    async markSyncSuccess(localIds = []) {
      if (!localIds.length) return;
      await adapter.exec('BEGIN TRANSACTION');
      try {
        for (const localId of localIds) {
          await adapter.run('DELETE FROM sync_queue WHERE entity_local_id = ?', [localId]);
          await adapter.run(
            "UPDATE inventory_movements SET status = 'sincronizado' WHERE id_operacion_local = ?",
            [localId]
          );
        }
        await adapter.exec('COMMIT');
      } catch (err) {
        await adapter.exec('ROLLBACK');
        throw err;
      }
    },

    /**
     * Restaura los elementos en envío de nuevo a 'pending' en caso de error transitorio.
     *
     * @param {number[]} ids
     */
    async markQueuePending(ids = []) {
      if (!ids.length) return;
      const placeholders = ids.map(() => '?').join(',');
      await adapter.run(
        `UPDATE sync_queue SET status = 'pending' WHERE id_local IN (${placeholders})`,
        ids
      );
    },

    /**
     * Obtiene las categorías cacheadas localmente.
     */
    async getCachedCategories() {
      return adapter.all('SELECT * FROM categories ORDER BY name ASC');
    },

    /**
     * Guarda o actualiza categorías en el caché local.
     *
     * @param {Array<{id: number, name: string, description?: string}>} categories
     */
    async upsertCategories(categories = []) {
      await adapter.exec('BEGIN TRANSACTION');
      try {
        for (const cat of categories) {
          await adapter.run(
            `INSERT OR REPLACE INTO categories (id, name, description)
             VALUES (?, ?, ?)`,
            [cat.id, cat.name, cat.description || null]
          );
        }
        await adapter.exec('COMMIT');
      } catch (err) {
        await adapter.exec('ROLLBACK');
        throw err;
      }
    },

    /**
     * Obtiene las alertas cacheadas localmente.
     */
    async getCachedAlerts() {
      return adapter.all('SELECT * FROM alerts ORDER BY triggered_at DESC');
    },

    /**
     * Guarda una alerta en la tabla local.
     *
     * @param {{item_id?: number, code?: string, message: string}} alert
     */
    async saveAlert(alert) {
      return adapter.run(
        `INSERT INTO alerts (item_id, code, message)
         VALUES (?, ?, ?)`,
        [alert.item_id || null, alert.code || null, alert.message]
      );
    },
  };
}

module.exports = {
  createSqliteAdapter,
  createInventoryPersistence,
  createInventoryRepository: createInventoryPersistence,
};
