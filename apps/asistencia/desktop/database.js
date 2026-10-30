const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('@journeyapps/sqlcipher').verbose();
const { app, safeStorage } = require('electron');
const { createLocalEncryptionKeyStore } = require('./src/main/security/local-encryption-key');

// Locate user data path to persist file securely
const dbPath = path.join(app.getPath('userData'), 'asistencia_offline.db');
console.log('Database path:', dbPath);

let db;
const localEncryptionKeyStore = createLocalEncryptionKeyStore({
  filePath: path.join(app.getPath('userData'), 'asistencia_offline.key'),
  fs,
  crypto,
  safeStorage,
});

function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening local SQLite database:', err);
        return reject(err);
      }
      
      // Configure SQLCipher Encryption; no se permite SQLite sin cifrado.
      const encryptionKey = localEncryptionKeyStore.loadOrCreate();
      db.serialize(() => {
        db.run(`PRAGMA key = '${encryptionKey}'`, (pragmaErr) => {
          if (pragmaErr) {
            console.error('Error setting SQLCipher key:', pragmaErr);
            return reject(pragmaErr);
          }
          
          // Create offline marks table
          db.run(`
            CREATE TABLE IF NOT EXISTS marcas_offline (
              id_local TEXT PRIMARY KEY,
              dni TEXT,
              name TEXT,
              type TEXT,
              registered_at TEXT,
              sync_status TEXT DEFAULT 'pendiente'
            )
          `);

          // Create users table
          db.run(`
            CREATE TABLE IF NOT EXISTS usuarios (
              dni TEXT PRIMARY KEY,
              name TEXT,
              role TEXT,
              sede TEXT
            )
          `, (tableErr) => {
            if (tableErr) {
              console.error('Error creating usuarios table:', tableErr);
              return reject(tableErr);
            }
            
            // Seed initial users if table is empty
            db.get("SELECT COUNT(*) as count FROM usuarios", (countErr, row) => {
              if (countErr) {
                console.error('Error counting users:', countErr);
                return reject(countErr);
              }
              
              if (row.count === 0) {
                const stmt = db.prepare("INSERT INTO usuarios (dni, name, role, sede) VALUES (?, ?, ?, ?)");
                stmt.run("11111111", "Yoset Cozco Mauri", "administrador", "Sede Universitaria");
                stmt.run("22222222", "Luis Quispe", "operador", "Sede Universitaria");
                stmt.run("33333333", "Melvin Castro", "operador", "Sede Universitaria");
                stmt.finalize((finalizeErr) => {
                  if (finalizeErr) {
                    console.error('Error finalizing seeder statement:', finalizeErr);
                    return reject(finalizeErr);
                  }
                  console.log('Local users table seeded successfully.');
                  resolve();
                });
              } else {
                console.log('Local SQLite/SQLCipher database initialized successfully.');
                resolve();
              }
            });
          });
        });
      });
    });
  });
}

function guardarMarca(record) {
  return new Promise((resolve, reject) => {
    const { id_local, dni, name, type, registered_at, sync_status } = record;
    const sql = `
      INSERT OR REPLACE INTO marcas_offline (id_local, dni, name, type, registered_at, sync_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    db.run(sql, [id_local, dni, name, type, registered_at, sync_status || 'pendiente'], function(err) {
      if (err) {
        console.error('Error inserting offline mark:', err);
        return reject(err);
      }
      resolve({ id: id_local, success: true });
    });
  });
}

function obtenerPendientes() {
  return new Promise((resolve, reject) => {
    const sql = "SELECT * FROM marcas_offline WHERE sync_status = 'pendiente' ORDER BY registered_at ASC";
    db.all(sql, [], (err, rows) => {
      if (err) {
        console.error('Error fetching pending marks:', err);
        return reject(err);
      }
      resolve(rows);
    });
  });
}

function marcarSincronizados(ids) {
  return new Promise((resolve, reject) => {
    if (!ids || ids.length === 0) {
      return resolve({ success: true, count: 0 });
    }
    const placeholders = ids.map(() => '?').join(',');
    const sql = `UPDATE marcas_offline SET sync_status = 'sincronizado' WHERE id_local IN (${placeholders})`;
    db.run(sql, ids, function(err) {
      if (err) {
        console.error('Error updating sync status:', err);
        return reject(err);
      }
      resolve({ success: true, count: this.changes });
    });
  });
}

function buscarUsuarioPorDni(dni) {
  return new Promise((resolve, reject) => {
    const sql = "SELECT * FROM usuarios WHERE dni = ?";
    db.get(sql, [dni], (err, row) => {
      if (err) {
        console.error('Error fetching user by DNI:', err);
        return reject(err);
      }
      resolve(row || null);
    });
  });
}

function guardarUsuario(usuario) {
  return new Promise((resolve, reject) => {
    const { dni, name, role, sede } = usuario;
    const sql = `
      INSERT OR REPLACE INTO usuarios (dni, name, role, sede)
      VALUES (?, ?, ?, ?)
    `;
    db.run(sql, [dni, name, role || 'operador', sede || 'Sede Universitaria'], function(err) {
      if (err) {
        console.error('Error inserting user:', err);
        return reject(err);
      }
      resolve({ dni, success: true });
    });
  });
}

function obtenerHistorial() {
  return new Promise((resolve, reject) => {
    const sql = "SELECT * FROM marcas_offline ORDER BY registered_at DESC LIMIT 50";
    db.all(sql, [], (err, rows) => {
      if (err) {
        console.error('Error fetching marks history:', err);
        return reject(err);
      }
      resolve(rows);
    });
  });
}

module.exports = {
  initDatabase,
  guardarMarca,
  obtenerPendientes,
  marcarSincronizados,
  buscarUsuarioPorDni,
  guardarUsuario,
  obtenerHistorial
};
