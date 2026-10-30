/**
 * Contrato de regresión para `createSqliteAdapter`.
 *
 * @see ./sqlite-adapter.js
 * @see ../../../main.js#initDB
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSqliteAdapter } = require('./sqlite-adapter');

test('adapts sqlite callbacks to promises and preserves write metadata', async () => {
  const fakeDb = {
    run(sql, params, callback) {
      assert.equal(sql, 'INSERT');
      assert.deepEqual(params, ['value']);
      callback.call({ lastID: 7, changes: 1 }, null);
    },
    get(_sql, _params, callback) {
      callback(null, { id: 7 });
    },
    all(_sql, _params, callback) {
      callback(null, undefined);
    },
    exec(_sql, callback) {
      callback(null);
    },
  };

  const adapter = createSqliteAdapter(fakeDb);

  assert.deepEqual(await adapter.run('INSERT', ['value']), { lastID: 7, changes: 1 });
  assert.deepEqual(await adapter.get('SELECT'), { id: 7 });
  assert.deepEqual(await adapter.all('SELECT'), []);
  await adapter.exec('CREATE TABLE test');
});

test('propagates driver errors', async () => {
  const expected = new Error('sqlite failure');
  const adapter = createSqliteAdapter({
    run(_sql, _params, callback) {
      callback(expected);
    },
  });

  await assert.rejects(adapter.run('INSERT'), expected);
});
