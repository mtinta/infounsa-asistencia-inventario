const test = require('node:test');
const assert = require('node:assert/strict');
const { isAuthorizedSender, assertAuthorizedSender } = require('./ipc-sender');

function createWindow(sender, destroyed = false) {
  return { webContents: sender, isDestroyed: () => destroyed };
}

test('acepta únicamente el webContents de una ventana autorizada', () => {
  const sender = {};
  assert.equal(isAuthorizedSender({ sender }, [createWindow(sender)]), true);
  assert.equal(isAuthorizedSender({ sender: {} }, [createWindow(sender)]), false);
});

test('rechaza ventanas destruidas o eventos sin sender', () => {
  const sender = {};
  assert.equal(isAuthorizedSender({ sender }, [createWindow(sender, true)]), false);
  assert.equal(isAuthorizedSender({}, [createWindow(sender)]), false);
  assert.throws(
    () => assertAuthorizedSender({ sender: {} }, [createWindow(sender)], 'inv:register-movement'),
    /Emisor IPC no autorizado/,
  );
});
