const test = require('node:test');
const assert = require('node:assert/strict');
const { hashOfflinePassword, verifyOfflinePassword } = require('./offline-password');

test('genera hashes scrypt con sal aleatoria y verifica la contraseña', () => {
  const firstHash = hashOfflinePassword('Clave segura de prueba');
  const secondHash = hashOfflinePassword('Clave segura de prueba');

  assert.match(firstHash, /^scrypt\$[^$]+\$[^$]+$/);
  assert.notEqual(firstHash, secondHash);
  assert.equal(verifyOfflinePassword('Clave segura de prueba', firstHash), true);
  assert.equal(verifyOfflinePassword('otra clave', firstHash), false);
});

test('rechaza hashes legacy o malformados', () => {
  assert.equal(verifyOfflinePassword('123456', 'sha256$123456'), false);
  assert.equal(verifyOfflinePassword('admin', 'infounsa_fallback_crypt_key_444'), false);
  assert.equal(verifyOfflinePassword('clave', null), false);
});
