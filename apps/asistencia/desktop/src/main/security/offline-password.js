const crypto = require('crypto');

const SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
};
const SALT_BYTES = 16;
const DERIVED_KEY_BYTES = 64;

function hashOfflinePassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derivedKey = crypto.scryptSync(String(password), salt, DERIVED_KEY_BYTES, SCRYPT_OPTIONS);
  return `scrypt$${salt.toString('base64')}$${derivedKey.toString('base64')}`;
}

function verifyOfflinePassword(password, encodedHash) {
  try {
    const [algorithm, saltEncoded, hashEncoded] = String(encodedHash || '').split('$');
    if (algorithm !== 'scrypt' || !saltEncoded || !hashEncoded) {
      return false;
    }

    const salt = Buffer.from(saltEncoded, 'base64');
    const expected = Buffer.from(hashEncoded, 'base64');
    if (salt.length !== SALT_BYTES || expected.length !== DERIVED_KEY_BYTES) {
      return false;
    }

    const actual = crypto.scryptSync(String(password), salt, DERIVED_KEY_BYTES, SCRYPT_OPTIONS);
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

module.exports = { hashOfflinePassword, verifyOfflinePassword };
