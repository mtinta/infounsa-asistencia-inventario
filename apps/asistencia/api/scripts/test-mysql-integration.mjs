import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const initSchemaPath = path.resolve(currentDirectory, '../../database/init/001_create_attendance_schema.sql');
const hardeningMigrationPath = path.resolve(currentDirectory, '../../database/init/002_align_prisma_mysql_schema.sql');
const databaseUrl = process.env.ASISTENCIA_INTEGRATION_DATABASE_URL;

function getDatabaseConfig(rawUrl) {
  if (!rawUrl?.trim()) {
    throw new Error(
      'Defina ASISTENCIA_INTEGRATION_DATABASE_URL apuntando a una base de pruebas; no se usa DATABASE_URL por seguridad.',
    );
  }

  const parsedUrl = new URL(rawUrl);
  if (!['mysql:', 'mariadb:'].includes(parsedUrl.protocol)) {
    throw new Error('ASISTENCIA_INTEGRATION_DATABASE_URL debe usar el protocolo mysql:// o mariadb://.');
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

async function main() {
  const pool = mysql.createPool(getDatabaseConfig(databaseUrl));
  const operationPrefix = `integration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const attendanceId = randomUUID();

  try {
    await pool.query('SELECT 1');
    const [baseTables] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'sync_sedes'`,
    );
    if (Number(baseTables[0].total) === 0) {
      await runSqlFile(pool, initSchemaPath);
    }
    await runSqlFile(pool, hardeningMigrationPath);
    await runSqlFile(pool, hardeningMigrationPath);

    const [migrations] = await pool.query(
      `SELECT version FROM asistencia_schema_migrations
       WHERE version = '002_align_prisma_mysql_schema'`,
    );
    assert.equal(migrations.length, 1, 'La migracion de Asistencia debe quedar registrada una sola vez');

    const [indexes] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'sync_asistencias'
         AND column_name = 'id_operacion_local'
         AND non_unique = 0`,
    );
    assert.equal(Number(indexes[0].total), 1, 'id_operacion_local debe tener unicidad en sync_asistencias');

    await pool.query(
      `INSERT INTO sync_asistencias
        (id, id_operacion_local, usuario_id, terminal_id, sede_id, tipo, fecha_hora_marca, observacion)
       VALUES (?, ?, 'USR-001', 'TERM-001', '84c8a8ca-8ea4-41e9-add6-2b077bcd701a', 'entrada', NOW(3), 'Prueba de integracion')`,
      [attendanceId, `${operationPrefix}-sync`],
    );

    await expectSqlFailure(
      () =>
        pool.query(
          `INSERT INTO sync_asistencias
            (id, id_operacion_local, usuario_id, terminal_id, sede_id, tipo, fecha_hora_marca, observacion)
           VALUES (?, ?, 'USR-001', 'TERM-001', '84c8a8ca-8ea4-41e9-add6-2b077bcd701a', 'entrada', NOW(3), 'Duplicado')`,
          [randomUUID(), `${operationPrefix}-sync`],
        ),
      /duplicate|unique/i,
      'Unicidad de id_operacion_local',
    );

    const [rows] = await pool.query(
      `SELECT id_operacion_local, usuario_id, terminal_id
       FROM sync_asistencias WHERE id = ?`,
      [attendanceId],
    );
    assert.equal(rows.length, 1, 'La marcacion de prueba debe persistir');
    assert.equal(rows[0].usuario_id, 'USR-001');
    assert.equal(rows[0].terminal_id, 'TERM-001');

    console.log('OK: esquema, migracion idempotente, claves foraneas y unicidad de Asistencia verificados contra MySQL.');
  } finally {
    await pool.query('DELETE FROM sync_asistencias WHERE id = ?', [attendanceId]).catch(() => undefined);
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`FALLO: ${error.message}`);
  process.exitCode = 1;
});
