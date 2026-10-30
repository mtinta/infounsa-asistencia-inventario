/**
 * Contrato de regresión para `createAuthStateStore`, incluida la migración de
 * estado plano legacy cuando `safeStorage` no puede descifrarlo.
 *
 * @see ./auth-state.js
 * @see ../../../main.js#loadAuthState
 * @see ../../../main.js#saveAuthState
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthStateStore } = require('./auth-state');

test('normalizes and persists auth state through safeStorage', () => {
  const files = new Map();
  const store = createAuthStateStore({
    filePath: 'auth.json',
    fs: {
      existsSync: (file) => files.has(file),
      readFileSync: (file) => files.get(file),
      writeFileSync: (file, value) => files.set(file, value),
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(`encrypted:${value}`),
      decryptString: (value) => value.toString().replace('encrypted:', ''),
    },
  });

  const saved = store.save({ accessToken: 'access', refreshToken: '' });
  assert.deepEqual(saved, { accessToken: 'access', refreshToken: null });
  assert.deepEqual(store.load(), saved);
});

test('migrates legacy plaintext to safeStorage when encrypted decoding fails', () => {
  const files = new Map([['auth.json', Buffer.from('{"accessToken":"legacy","refreshToken":null}')]]);
  const store = createAuthStateStore({
    filePath: 'auth.json',
    fs: {
      existsSync: (file) => files.has(file),
      readFileSync: (file) => files.get(file),
      writeFileSync: (file, value) => files.set(file, value),
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(`encrypted:${value}`),
      decryptString: (value) => {
        const raw = value.toString();
        if (!raw.startsWith('encrypted:')) throw new Error('not encrypted');
        return raw.slice('encrypted:'.length);
      },
    },
  });

  assert.deepEqual(store.load(), { accessToken: 'legacy', refreshToken: null });
  assert.match(files.get('auth.json').toString(), /^encrypted:/);
});

test('no persiste tokens cuando safeStorage no esta disponible', () => {
  const files = new Map();
  const store = createAuthStateStore({
    filePath: 'auth.json',
    fs: {
      existsSync: (file) => files.has(file),
      readFileSync: (file) => files.get(file),
      writeFileSync: (file, value) => files.set(file, value),
    },
    safeStorage: { isEncryptionAvailable: () => false },
  });

  assert.deepEqual(store.save({ accessToken: 'access', refreshToken: 'refresh' }), {
    accessToken: 'access',
    refreshToken: 'refresh',
  });
  assert.equal(files.size, 0);
});
