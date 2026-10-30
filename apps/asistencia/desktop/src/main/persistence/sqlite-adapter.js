/**
 * Resultado mínimo que devuelve sqlite3 después de una operación de escritura.
 *
 * @typedef {Object} SqliteRunResult
 * @property {number} lastID Identificador generado por SQLite, si aplica.
 * @property {number} changes Número de filas afectadas por la operación.
 */

/**
 * Contrato mínimo que necesita el proceso principal para acceder a SQLite.
 * Se mantiene deliberadamente pequeño para que el código de dominio no dependa
 * de la API callback de `sqlite3` ni del paquete opcional SQLCipher.
 *
 * @typedef {Object} SqliteDatabase
 * @property {Function} run Método callback de escritura del driver.
 * @property {Function} get Método callback para una fila.
 * @property {Function} all Método callback para varias filas.
 * @property {Function} exec Método callback para SQL de esquema o migración.
 */

/**
 * Crea la frontera asíncrona de persistencia local usada por Asistencia.
 *
 * @param {SqliteDatabase} database Instancia compatible con sqlite3.
 * @returns {{run: Function, get: Function, all: Function, exec: Function}}
 *   Operaciones de persistencia basadas en promesas.
 * @throws {TypeError} Cuando no se recibe un driver compatible.
 * @see apps/asistencia/desktop/main.js#initDB Inicializa esta frontera.
 * @see apps/asistencia/desktop/schema.sql Esquema consumido por `exec`.
 * @see docs/02_arquitectura/HITO_1_ASISTENCIA.md Trazabilidad del refactor.
 */
function createSqliteAdapter(database) {
  if (!database || typeof database.run !== 'function') {
    throw new TypeError('A sqlite3-compatible database instance is required.');
  }

  return {
    /**
     * Ejecuta una escritura y conserva la metadata que usa el código de marcas.
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

module.exports = { createSqliteAdapter };
