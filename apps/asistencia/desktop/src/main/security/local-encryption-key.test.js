const test = require('node:test');
const assert = require('node:assert/strict');
const { createLocalEncryptionKeyStore } = require('./local-encryption-key');

function createMemoryFs(initialFiles = []) {
  const files = new Map(initialFiles.map(([name, value]) => [name, Buffer.from(value)]));
  return {
    files,
    existsSync: (filePath) => files.has(filePath),
    readFileSync: (filePath, encoding) => {
      const value = files.get(filePath);
      if (!value) throw new Error(`Missing file: ${filePath}`);
      return encoding === 'utf8' ? value.toString('utf8') : value;
    },
    writeFileSync: (filePath, value) => files.set(filePath, Buffer.from(value)),
    chmodSync: () => {},
    unlinkSync: (filePath) => files.delete(filePath),
  };
}

function createSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    decryptString: (value) => {
      const raw = value.toString('utf8');
      if (!raw.startsWith('encrypted:')) throw new Error('legacy plaintext');
      return raw.slice('encrypted:'.length);
    },
  };
}

test('genera y recupera una clave SQLCipher cifrada', () => {
  const fs = createMemoryFs();
  const safeStorage = createSafeStorage();
  const options = {
    filePath: 'local_db.key',
    fs,
    crypto: { randomBytes: () => Buffer.alloc(32, 0xab) },
    safeStorage,
  };

  const key = createLocalEncryptionKeyStore(options).loadOrCreate();
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.match(fs.files.get('local_db.key').toString('utf8'), /^encrypted:/);
  assert.equal(createLocalEncryptionKeyStore(options).loadOrCreate(), key);
});

test('migra una clave plana legada y elimina su archivo', () => {
  const legacyKey = 'ab'.repeat(32);
  const fs = createMemoryFs([['local_db_fallback.key', legacyKey]]);
  const key = createLocalEncryptionKeyStore({
    filePath: 'local_db.key',
    legacyFilePath: 'local_db_fallback.key',
    fs,
    crypto: { randomBytes: () => Buffer.alloc(32, 0xcd) },
    safeStorage: createSafeStorage(),
  }).loadOrCreate();

  assert.equal(key, legacyKey);
  assert.equal(fs.files.has('local_db_fallback.key'), false);
  assert.match(fs.files.get('local_db.key').toString('utf8'), /^encrypted:/);
});

test('bloquea la apertura cuando safeStorage no esta disponible', () => {
  const fs = createMemoryFs();
  assert.throws(
    () => createLocalEncryptionKeyStore({
      filePath: 'local_db.key',
      fs,
      crypto: { randomBytes: () => Buffer.alloc(32) },
      safeStorage: { isEncryptionAvailable: () => false },
    }).loadOrCreate(),
    /safeStorage no esta disponible/,
  );
  assert.equal(fs.files.size, 0);
});
