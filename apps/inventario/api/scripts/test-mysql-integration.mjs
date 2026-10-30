import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const initSchemaPath = path.resolve(currentDirectory, '../../database/init/001_create_inventory_schema.sql');
const hardeningMigrationPath = path.resolve(currentDirectory, '../../database/init/002_harden_inventory_integrity.sql');
const databaseUrl = process.env.INVENTARIO_INTEGRATION_DATABASE_URL;

function getDatabaseConfig(rawUrl) {
  if (!rawUrl?.trim()) {
    throw new Error(
      'Defina INVENTARIO_INTEGRATION_DATABASE_URL apuntando a una base de pruebas; no se usa DATABASE_URL por seguridad.',
    );
  }

  const parsedUrl = new URL(rawUrl);
  if (!['mysql:', 'mariadb:'].includes(parsedUrl.protocol)) {
    throw new Error('INVENTARIO_INTEGRATION_DATABASE_URL debe usar el protocolo mysql:// o mariadb://.');
  }

  const database = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));
  if (!database || !/(test|integration|ci)/i.test(database)) {
    throw new Error(
      `La base "${database || '(sin nombre)'}" no parece de pruebas. Use un nombre que contenga test, integration o ci.`,
    );
  }

  return {
    host: parsedUrl.hostname || '127.0.0.1',
    port: Number(parsedUrl.port || 3306),
    user: decodeURIComponent(parsedUrl.username),
    password: decodeURIComponent(parsedUrl.password),
    database,
    waitForConnections: true,
    connectionLimit: 4,
    connectTimeout: 5000,
  };
}

function splitSqlStatements(sql) {
  const statements = [];
  let delimiter = ';';
  let buffer = '';

  for (const line of sql.split(/\r?\n/)) {
    const delimiterMatch = line.match(/^\s*DELIMITER\s+(.+?)\s*$/i);
    if (delimiterMatch) {
      delimiter = delimiterMatch[1];
      continue;
    }

    buffer += `${line}\n`;
    const trimmedBuffer = buffer.trimEnd();
    if (!trimmedBuffer.endsWith(delimiter)) {
      continue;
    }

    const statement = trimmedBuffer.slice(0, -delimiter.length).trim();
    if (statement) {
      statements.push(statement);
    }
    buffer = '';
  }

  const remaining = buffer.trim();
  if (remaining) {
    statements.push(remaining);
  }

  return statements;
}

async function runSqlFile(pool, filePath) {
  const sql = await readFile(filePath, 'utf8');
  for (const statement of splitSqlStatements(sql)) {
    await pool.query(statement);
  }
}

async function expectSqlFailure(operation, expectedMessage, label) {
  let caughtError;
  try {
    await operation();
  } catch (error) {
    caughtError = error;
  }

  assert.ok(caughtError, `${label}: se esperaba un error SQL`);
  if (expectedMessage) {
    assert.match(String(caughtError.message), expectedMessage, `${label}: mensaje SQL inesperado`);
  }
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  const pool = mysql.createPool(getDatabaseConfig(databaseUrl));
  let itemId;
  const operationPrefix = `integration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    await pool.query('SELECT 1');
    await runSqlFile(pool, initSchemaPath);
    await runSqlFile(pool, hardeningMigrationPath);
    await runSqlFile(pool, hardeningMigrationPath);

    const [triggers] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM information_schema.triggers
       WHERE trigger_schema = DATABASE() AND trigger_name = 'tg_prevent_negative_stock'`,
    );
    assert.equal(Number(triggers[0].total), 1, 'Debe existir un unico trigger de stock');

    const [migrations] = await pool.query(
      `SELECT version FROM inventory_schema_migrations WHERE version = '002_harden_inventory_integrity'`,
    );
    assert.equal(migrations.length, 1, 'La migracion de integridad debe quedar registrada');

    const [itemResult] = await pool.query(
      `INSERT INTO inventory_items
        (barcode, name, quantity, min_stock, unit, sede_id, status)
       VALUES (?, 'Item de prueba de integridad', 10, 3, 'unidad', 1, 'activo')`,
      [`${operationPrefix}-item`],
    );
    itemId = itemResult.insertId;

    const triggerConnection = await pool.getConnection();
    try {
      await triggerConnection.beginTransaction();
      await expectSqlFailure(
        () => triggerConnection.query('UPDATE inventory_items SET quantity = -1 WHERE id = ?', [itemId]),
        /No se permite stock negativo/i,
        'Trigger de stock negativo',
      );
      await triggerConnection.rollback();
    } finally {
      triggerConnection.release();
    }

    await expectSqlFailure(
      () =>
        pool.query(
          `INSERT INTO inventory_movements
            (item_id, type, quantity, registered_at, id_operacion_local)
           VALUES (?, 'salida', 0, NOW(3), ?)`,
          [itemId, `${operationPrefix}-zero`],
        ),
      /check constraint|constraint/i,
      'Check de cantidad positiva',
    );

    const firstConnection = await pool.getConnection();
    const secondConnection = await pool.getConnection();
    try {
      await firstConnection.beginTransaction();
      const [firstRows] = await firstConnection.query('SELECT quantity FROM inventory_items WHERE id = ? FOR UPDATE', [itemId]);
      assert.equal(Number(firstRows[0].quantity), 10, 'El item de prueba debe iniciar con stock 10');

      await secondConnection.beginTransaction();
      const secondLockRead = secondConnection
        .query('SELECT quantity FROM inventory_items WHERE id = ? FOR UPDATE', [itemId])
        .then(([rows]) => rows[0]);

      await sleep(100);
      await firstConnection.query('UPDATE inventory_items SET quantity = quantity - 7 WHERE id = ?', [itemId]);
      await firstConnection.query(
        `INSERT INTO inventory_movements
          (item_id, type, quantity, registered_at, id_operacion_local)
         VALUES (?, 'salida', 7, NOW(3), ?)`,
        [itemId, `${operationPrefix}-concurrent-first`],
      );
      await firstConnection.commit();

      const secondRow = await secondLockRead;
      assert.equal(Number(secondRow.quantity), 3, 'El segundo lector debe ver el stock confirmado de 3');
      await secondConnection.rollback();
    } catch (error) {
      await firstConnection.rollback().catch(() => undefined);
      await secondConnection.rollback().catch(() => undefined);
      throw error;
    } finally {
      firstConnection.release();
      secondConnection.release();
    }

    await expectSqlFailure(
      () => pool.query('UPDATE inventory_items SET quantity = quantity - 4 WHERE id = ?', [itemId]),
      /No se permite stock negativo/i,
      'Rechazo de salida que agotaria el stock',
    );

    const [afterConcurrency] = await pool.query(
      `SELECT i.quantity, COUNT(m.id) AS movements
       FROM inventory_items i
       LEFT JOIN inventory_movements m ON m.item_id = i.id
       WHERE i.id = ?
       GROUP BY i.id, i.quantity`,
      [itemId],
    );
    assert.equal(Number(afterConcurrency[0].quantity), 3, 'El stock final debe ser 3');
    assert.equal(Number(afterConcurrency[0].movements), 1, 'Solo debe confirmarse una salida concurrente');

    const idempotentOperation = `${operationPrefix}-idempotent`;
    await pool.query(
      `INSERT INTO inventory_movements
        (item_id, type, quantity, registered_at, id_operacion_local)
       VALUES (?, 'entrada', 1, NOW(3), ?)`,
      [itemId, idempotentOperation],
    );
    await expectSqlFailure(
      () =>
        pool.query(
          `INSERT INTO inventory_movements
            (item_id, type, quantity, registered_at, id_operacion_local)
           VALUES (?, 'entrada', 1, NOW(3), ?)`,
          [itemId, idempotentOperation],
        ),
      /duplicate|unique/i,
      'Unicidad de id_operacion_local',
    );

    console.log('OK: esquema, migracion, trigger, check, bloqueo FOR UPDATE e idempotencia verificados contra MySQL.');
  } finally {
    if (itemId) {
      await pool.query('DELETE FROM inventory_movements WHERE item_id = ?', [itemId]);
      await pool.query('DELETE FROM alerts WHERE item_id = ?', [itemId]);
      await pool.query('DELETE FROM inventory_items WHERE id = ?', [itemId]);
    }
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`FALLO: ${error.message}`);
  process.exitCode = 1;
});
