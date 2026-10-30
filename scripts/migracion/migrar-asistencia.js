#!/usr/bin/env node
/*
 * Migra los datos de la base central de Asistencia de una VERSION ANTERIOR (MySQL) a la base de la
 * version actual.
 *
 * Las versiones anteriores guardaban los datos en dos juegos de tablas paralelos:
 *   - administrativas (ids numericos): roles, sedes, users, terminals, attendance
 *   - de sincronizacion (ids de texto): sync_sedes, sync_terminales, sync_usuarios, sync_asistencias
 * La version actual los unifica en: roles, sedes, users, terminals, attendance, sync_logs.
 *
 * El script NO modifica la base de origen (solo lee). Escribe en la base de destino, que debe estar
 * creada con el esquema actual (npx prisma db push). Se puede ejecutar varias veces (es idempotente).
 * Se adapta a las columnas que tenga la base antigua (condicion, cargo, nombres, estado_auditoria...).
 *
 * Uso:
 *   node scripts/migracion/migrar-asistencia.js --origen "mysql://usuario:clave@host:3306/base_antigua" \
 *        --destino "mysql://usuario:clave@host:3306/base_nueva" [--simular]
 *
 *   --simular   hace todo el proceso dentro de una transaccion y la revierte (solo muestra el informe)
 */
'use strict';

const path = require('path');

function argumentos() {
  const out = { simular: false };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--origen') out.origen = a[++i];
    else if (a[i] === '--destino') out.destino = a[++i];
    else if (a[i] === '--simular') out.simular = true;
    else if (a[i] === '--ayuda' || a[i] === '-h') out.ayuda = true;
  }
  return out;
}

function cargarMysql() {
  const apiDir = path.join(__dirname, '..', '..', 'apps', 'asistencia', 'api');
  try {
    return require(require.resolve('mysql2/promise', { paths: [apiDir, process.cwd()] }));
  } catch (e) {
    console.error('No se encontro el modulo mysql2. Ejecuta "pnpm install" en la raiz del repositorio.');
    process.exit(1);
  }
}

const mysql = cargarMysql();

function conectar(url) {
  const u = new URL(url);
  return mysql.createConnection({
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    dateStrings: true, // conserva las fechas tal cual estan en la base, sin convertir zonas horarias
    charset: 'utf8mb4',
  });
}

async function columnas(cx, tabla) {
  const [rows] = await cx.query(
    'SELECT COLUMN_NAME AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?',
    [tabla],
  );
  return new Set(rows.map((r) => r.c));
}

async function leer(cx, tabla) {
  const cols = await columnas(cx, tabla);
  if (cols.size === 0) return { existe: false, cols, filas: [] };
  const [filas] = await cx.query(`SELECT * FROM \`${tabla}\``);
  return { existe: true, cols, filas };
}


// Separa un nombre completo en nombres y apellidos (misma convencion que el seed: "Paterno Materno Nombres"
// o "Paterno Materno, Nombres"). Solo se usa cuando la base antigua no tenia los campos separados.
function separarNombre(completo) {
  const t = String(completo || '').trim();
  if (!t) return { nombres: '', paterno: '', materno: '' };
  if (t.includes(',')) {
    const [ap, nom] = t.split(',').map((x) => x.trim());
    const partes = ap.split(/\s+/);
    return { nombres: nom || '', paterno: partes[0] || '', materno: partes.slice(1).join(' ') || '' };
  }
  const p = t.split(/\s+/);
  if (p.length === 1) return { nombres: p[0], paterno: '', materno: '' };
  if (p.length === 2) return { nombres: p[0], paterno: p[1], materno: '' };
  return { nombres: p.slice(2).join(' ') || p[0], paterno: p[0], materno: p[1] };
}

const v = (fila, col, def = null) => (fila[col] === undefined || fila[col] === '' ? def : fila[col]);
const bool = (x) => (x === 1 || x === true || x === '1' ? 1 : 0);

async function main() {
  const args = argumentos();
  if (args.ayuda || !args.origen || !args.destino) {
    console.log('Uso: node scripts/migracion/migrar-asistencia.js --origen <url-mysql-antigua> --destino <url-mysql-nueva> [--simular]');
    process.exit(args.ayuda ? 0 : 1);
  }
  const origen = await conectar(args.origen);
  const destino = await conectar(args.destino);
  const informe = {};
  const sumar = (k, n = 1) => (informe[k] = (informe[k] || 0) + n);

  // --- Comprobaciones
  const dCols = await columnas(destino, 'users');
  const dAtt = await columnas(destino, 'attendance');
  if (!dCols.has('dni') || !dCols.has('username') || !dAtt.has('usuario_id')) {
    throw new Error('La base de destino no tiene el esquema actual. Ejecuta antes "npx prisma db push" apuntando a la base de destino.');
  }

  // --- Lectura del origen (solo lectura)
  const o = {
    roles: await leer(origen, 'roles'),
    sedes: await leer(origen, 'sedes'),
    users: await leer(origen, 'users'),
    terminals: await leer(origen, 'terminals'),
    attendance: await leer(origen, 'attendance'),
    syncSedes: await leer(origen, 'sync_sedes'),
    syncTerm: await leer(origen, 'sync_terminales'),
    syncUsers: await leer(origen, 'sync_usuarios'),
    syncAtt: await leer(origen, 'sync_asistencias'),
    syncLogs: await leer(origen, 'sync_logs'),
  };
  // Un origen ya "actual" (users con dni) no necesita migracion
  if (o.users.cols.has('dni')) {
    throw new Error('La base de origen ya tiene el esquema actual: no hay nada que migrar.');
  }
  for (const [k, t] of Object.entries(o)) informe[`origen_${k}`] = t.filas.length;

  await destino.beginTransaction();
  try {
    // ---------- ROLES (id antiguo -> id nuevo)
    const roleMap = new Map();
    for (const r of o.roles.filas) {
      const [ex] = await destino.query('SELECT id FROM roles WHERE name = ?', [r.name]);
      if (ex.length) {
        roleMap.set(r.id, ex[0].id);
      } else {
        const [ins] = await destino.query('INSERT INTO roles (name, description) VALUES (?, ?)', [r.name, v(r, 'description')]);
        roleMap.set(r.id, ins.insertId);
        sumar('roles_migrados');
      }
    }

    // ---------- SEDES: primero las de sincronizacion (uuid), luego las administrativas (id numerico)
    const sedeSync = new Map(); // nombre en minusculas -> id
    for (const s of o.syncSedes.filas) {
      const nombre = v(s, 'nombre', 'Sede');
      const [ex] = await destino.query('SELECT id FROM sedes WHERE id = ?', [s.id]);
      if (!ex.length) {
        await destino.query(
          'INSERT INTO sedes (id, nombre, name, estado) VALUES (?, ?, ?, ?)',
          [s.id, nombre, nombre, bool(v(s, 'estado', 1))],
        );
        sumar('sedes_migradas');
      }
      sedeSync.set(String(nombre).toLowerCase(), s.id);
    }
    const sedeMap = new Map(); // id numerico antiguo -> id nuevo
    for (const s of o.sedes.filas) {
      const nombre = v(s, 'name', 'Sede');
      const comun = sedeSync.get(String(nombre).toLowerCase());
      if (comun) {
        // Misma sede que en sincronizacion: se completan sus datos administrativos
        await destino.query(
          'UPDATE sedes SET name = ?, code = COALESCE(code, ?), direccion = COALESCE(direccion, ?), address = COALESCE(address, ?) WHERE id = ?',
          [nombre, v(s, 'code'), v(s, 'address'), v(s, 'address'), comun],
        );
        sedeMap.set(s.id, comun);
        continue;
      }
      const nuevoId = `legacy-sede-${s.id}`;
      const [ex] = await destino.query('SELECT id FROM sedes WHERE id = ? OR code = ?', [nuevoId, v(s, 'code')]);
      if (ex.length) {
        sedeMap.set(s.id, ex[0].id);
      } else {
        await destino.query(
          'INSERT INTO sedes (id, nombre, name, code, direccion, address, estado) VALUES (?, ?, ?, ?, ?, ?, 1)',
          [nuevoId, nombre, nombre, v(s, 'code'), v(s, 'address'), v(s, 'address')],
        );
        sedeMap.set(s.id, nuevoId);
        sumar('sedes_migradas');
      }
    }
    // Sede por defecto para marcaciones/usuarios que la requieran
    const sedeDefecto = [...sedeSync.values()][0] || [...sedeMap.values()][0] || null;

    // ---------- TERMINALES
    const termSync = new Set();
    for (const t of o.syncTerm.filas) {
      const [ex] = await destino.query('SELECT id FROM terminals WHERE id = ?', [t.id]);
      if (!ex.length) {
        await destino.query(
          'INSERT INTO terminals (id, nombre, sede_id, estado) VALUES (?, ?, ?, ?)',
          [t.id, t.id, v(t, 'sede_id'), bool(v(t, 'estado', 1))],
        );
        sumar('terminales_migradas');
      }
      termSync.add(t.id);
    }
    for (const t of o.terminals.filas) {
      const code = v(t, 'code');
      const nombre = v(t, 'name', code || `terminal-${t.id}`);
      const estado = String(v(t, 'status', 'activo')) === 'activo' ? 1 : 0;
      const destinoId = code && termSync.has(code) ? code : code || `legacy-term-${t.id}`;
      const [ex] = await destino.query('SELECT id FROM terminals WHERE id = ?', [destinoId]);
      if (ex.length) {
        await destino.query(
          'UPDATE terminals SET nombre = ?, name = ?, code = COALESCE(code, ?), status = ?, estado = ? WHERE id = ?',
          [nombre, nombre, code, v(t, 'status', 'activo'), estado, destinoId],
        );
      } else {
        await destino.query(
          'INSERT INTO terminals (id, nombre, name, code, sede_id, estado, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [destinoId, nombre, nombre, code, sedeDefecto, estado, v(t, 'status', 'activo')],
        );
        sumar('terminales_migradas');
      }
    }

    // ---------- USUARIOS
    const userMap = new Map(); // id numerico antiguo (cuenta administrativa) -> id nuevo
    // Personal del sistema de sincronizacion (id de texto, con DNI)
    for (const u of o.syncUsers.filas) {
      const dni = v(u, 'dni');
      const [ex] = await destino.query('SELECT id FROM users WHERE id = ? OR dni = ?', [u.id, dni]);
      if (ex.length) continue;
      const completo = v(u, 'nombre_completo') || [v(u, 'apellido_paterno'), v(u, 'apellido_materno'), v(u, 'nombres')].filter(Boolean).join(' ');
      const sep = v(u, 'nombres') || v(u, 'apellido_paterno') ? null : separarNombre(completo);
      await destino.query(
        `INSERT INTO users (id, dni, nombres, apellido_paterno, apellido_materno, nombre_completo, full_name, condicion, cargo, estado, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          u.id, dni, sep ? sep.nombres : v(u, 'nombres', ''), sep ? sep.paterno : v(u, 'apellido_paterno', ''), sep ? sep.materno : v(u, 'apellido_materno', ''),
          completo || null, completo || null, v(u, 'condicion'), v(u, 'cargo'),
          bool(v(u, 'estado', 1)), bool(v(u, 'estado', 1)) ? 'activo' : 'inactivo',
        ],
      );
      sumar('usuarios_personal_migrados');
    }
    // Cuentas administrativas (con usuario y contrasena)
    for (const u of o.users.filas) {
      const [ex] = await destino.query('SELECT id FROM users WHERE username = ? OR email = ?', [u.username, v(u, 'email')]);
      if (ex.length) {
        userMap.set(u.id, ex[0].id);
        continue;
      }
      const nuevoId = `legacy-user-${u.id}`;
      const completo = v(u, 'full_name') || [v(u, 'nombres'), v(u, 'apellido_paterno'), v(u, 'apellido_materno')].filter(Boolean).join(' ') || u.username;
      const sepU = v(u, 'nombres') || v(u, 'apellido_paterno') ? null : separarNombre(completo);
      await destino.query(
        `INSERT INTO users (id, username, email, password, nombres, apellido_paterno, apellido_materno, nombre_completo, full_name,
                            estado, status, role_id, sede_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW(3)), COALESCE(?, NOW(3)))`,
        [
          nuevoId, u.username, v(u, 'email'), v(u, 'password'),
          sepU ? sepU.nombres : v(u, 'nombres', ''), sepU ? sepU.paterno : v(u, 'apellido_paterno', ''), sepU ? sepU.materno : v(u, 'apellido_materno', ''), completo, completo,
          String(v(u, 'status', 'activo')) === 'activo' ? 1 : 0, v(u, 'status', 'activo'),
          roleMap.get(v(u, 'role_id')) ?? null, sedeMap.get(v(u, 'sede_id')) ?? null,
          v(u, 'created_at'), v(u, 'updated_at'),
        ],
      );
      userMap.set(u.id, nuevoId);
      sumar('cuentas_migradas');
    }

    // ---------- MARCACIONES
    for (const a of o.syncAtt.filas) {
      const [r] = await destino.query(
        `INSERT IGNORE INTO attendance (id, id_operacion_local, usuario_id, terminal_id, sede_id, tipo, fecha_hora_marca, creado_en,
                                        observacion, sync_status, estado_auditoria)
         VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW(3)), ?, 'sincronizado', ?)`,
        [
          a.id, v(a, 'id_operacion_local'), v(a, 'usuario_id'), v(a, 'terminal_id'), v(a, 'sede_id'),
          a.tipo, a.fecha_hora_marca, v(a, 'creado_en'), v(a, 'observacion'), v(a, 'estado_auditoria', 'normal'),
        ],
      );
      sumar(r.affectedRows ? 'marcaciones_migradas' : 'marcaciones_omitidas_duplicadas');
    }
    for (const a of o.attendance.filas) {
      const usuario = userMap.get(v(a, 'user_id')) ?? null;
      const [r] = await destino.query(
        `INSERT IGNORE INTO attendance (id, id_operacion_local, usuario_id, tipo, fecha_hora_marca, creado_en, sync_status, estado_auditoria)
         VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW(3)), ?, 'normal')`,
        [
          `legacy-att-${a.id}`, v(a, 'id_operacion_local'), usuario, a.type, a.registered_at,
          v(a, 'created_at'), v(a, 'sync_status', 'sincronizado'),
        ],
      );
      sumar(r.affectedRows ? 'marcaciones_migradas' : 'marcaciones_omitidas_duplicadas');
    }

    // ---------- BITACORA DE SINCRONIZACION
    for (const l of o.syncLogs.filas) {
      const [ex] = await destino.query(
        'SELECT id FROM sync_logs WHERE terminal_id = ? AND sync_at = ? AND status = ?',
        [l.terminal_id, l.sync_at, l.status],
      );
      if (ex.length) continue;
      await destino.query(
        'INSERT INTO sync_logs (terminal_id, sync_at, status, records_processed, error_message) VALUES (?, ?, ?, ?, ?)',
        [l.terminal_id, l.sync_at, l.status, v(l, 'records_processed', 0), v(l, 'error_message')],
      );
      sumar('bitacoras_migradas');
    }

    // ---------- Totales del destino
    for (const t of ['roles', 'sedes', 'terminals', 'users', 'attendance', 'sync_logs']) {
      const [[{ n }]] = await destino.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
      informe[`destino_${t}`] = n;
    }

    if (args.simular) {
      await destino.rollback();
      console.log('SIMULACION: no se guardo ningun cambio en la base de destino.');
    } else {
      await destino.commit();
    }
  } catch (e) {
    await destino.rollback();
    throw e;
  } finally {
    await origen.end();
    await destino.end();
  }

  console.log('\nInforme de migracion');
  console.log('--------------------');
  for (const [k, n] of Object.entries(informe)) console.log(`${k.padEnd(36)} ${n}`);
}

main().catch((e) => {
  console.error('\nERROR:', e.message);
  process.exit(1);
});
