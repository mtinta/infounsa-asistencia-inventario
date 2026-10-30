const KEY_BYTES = 32;
const KEY_PATTERN = /^[a-f0-9]{64}$/i;

function isValidLocalEncryptionKey(value) {
  return typeof value === 'string' && KEY_PATTERN.test(value);
}

/**
 * Gestiona la clave de SQLCipher sin conservar una alternativa predecible o
 * una clave en texto plano cuando `safeStorage` no esta disponible.
 *
 * @param {Object} options Dependencias para produccion y pruebas.
 * @param {string} options.filePath Archivo que contiene el valor cifrado por Electron.
 * @param {string} [options.legacyFilePath] Archivo plano legado que se migra una vez.
 * @param {Object} options.fs API de filesystem compatible con Node.
 * @param {Object} options.crypto API crypto compatible con Node.
 * @param {Object} options.safeStorage API `safeStorage` de Electron.
 * @returns {{loadOrCreate: Function}}
 */
function createLocalEncryptionKeyStore({ filePath, legacyFilePath, fs, crypto, safeStorage }) {
  if (!filePath || !fs || !crypto || !safeStorage) {
    throw new TypeError('Local encryption key store requires filePath, fs, crypto and safeStorage.');
  }

  function ensureSafeStorage() {
    let available = false;
    try {
      available = typeof safeStorage.isEncryptionAvailable === 'function'
        && safeStorage.isEncryptionAvailable();
    } catch {
      available = false;
    }

    if (!available || typeof safeStorage.encryptString !== 'function' || typeof safeStorage.decryptString !== 'function') {
      throw new Error('No se puede abrir la base local: Electron safeStorage no esta disponible.');
    }
  }

  function readEncryptedKey() {
    let rawKey;
    try {
      rawKey = safeStorage.decryptString(fs.readFileSync(filePath));
    } catch (error) {
      throw new Error(`No se pudo descifrar la clave local de SQLCipher: ${error.message}`);
    }

    if (!isValidLocalEncryptionKey(rawKey)) {
      throw new Error('La clave local de SQLCipher tiene un formato invalido.');
    }
    return rawKey;
  }

  function persistEncryptedKey(rawKey) {
    if (!isValidLocalEncryptionKey(rawKey)) {
      throw new Error('No se puede persistir una clave local de SQLCipher invalida.');
    }

    const encryptedKey = safeStorage.encryptString(rawKey);
    fs.writeFileSync(filePath, encryptedKey, { mode: 0o600 });
    if (typeof fs.chmodSync === 'function') {
      fs.chmodSync(filePath, 0o600);
    }
    return rawKey;
  }

  function migrateLegacyKey() {
    if (!legacyFilePath || !fs.existsSync(legacyFilePath)) {
      return null;
    }

    const legacyKey = fs.readFileSync(legacyFilePath, 'utf8').trim();
    if (!isValidLocalEncryptionKey(legacyKey)) {
      throw new Error('La clave local legada tiene un formato invalido y no se usara.');
    }

    const migratedKey = persistEncryptedKey(legacyKey);
    if (typeof fs.unlinkSync !== 'function') {
      throw new Error('No se puede eliminar la clave local legada en texto plano.');
    }
    fs.unlinkSync(legacyFilePath);
    return migratedKey;
  }

  function loadOrCreate() {
    ensureSafeStorage();

    if (fs.existsSync(filePath)) {
      return readEncryptedKey();
    }

    const migratedKey = migrateLegacyKey();
    if (migratedKey) {
      return migratedKey;
    }

    const rawKey = crypto.randomBytes(KEY_BYTES).toString('hex');
    return persistEncryptedKey(rawKey);
  }

  return { loadOrCreate };
}

module.exports = { createLocalEncryptionKeyStore, isValidLocalEncryptionKey };
