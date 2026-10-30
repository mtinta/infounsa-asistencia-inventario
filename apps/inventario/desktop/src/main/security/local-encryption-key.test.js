const test = require('node:test');
const assert = require('node:assert/strict');
const { createLocalEncryptionKeyStore } = require('./local-encryption-key');

function createMemoryFs() {
  const files = new Map();
  return {
    files,
    existsSync: (filePath) => files.has(filePath),
    readFileSync: (filePath) => files.get(filePath),
    writeFileSync: (filePath, value) => files.set(filePath, Buffer.from(value)),
    chmodSync: () => {},
  };
}

function createSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    decryptString: (value) => value.toString('utf8').replace(/^encrypted:/, ''),
  };
}

test('genera y recupera una clave SQLCipher cifrada', () => {
  const fs = createMemoryFs();
  const options = {
    filePath: 'local_inventory_db.key',
    fs,
    crypto: { randomBytes: () => Buffer.alloc(32, 0xef) },
    safeStorage: createSafeStorage(),
  };

  const key = createLocalEncryptionKeyStore(options).loadOrCreate();
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.match(fs.files.get('local_inventory_db.key').toString('utf8'), /^encrypted:/);
  assert.equal(createLocalEncryptionKeyStore(options).loadOrCreate(), key);
});

test('bloquea la apertura cuando safeStorage no esta disponible', () => {
  const fs = createMemoryFs();
  assert.throws(
    () => createLocalEncryptionKeyStore({
      filePath: 'local_inventory_db.key',
      fs,
      crypto: { randomBytes: () => Buffer.alloc(32) },
      safeStorage: { isEncryptionAvailable: () => false },
    }).loadOrCreate(),
    /safeStorage no esta disponible/,
  );
  assert.equal(fs.files.size, 0);
});
