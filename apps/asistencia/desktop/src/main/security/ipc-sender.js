/**
 * Restringe IPC a las ventanas creadas por este proceso principal.
 *
 * El renderer no recibe `ipcRenderer`, pero un contenido comprometido todavía
 * podría intentar invocar un canal expuesto por el preload. La validación del
 * `webContents` evita aceptar invocaciones desde una ventana inesperada.
 */
function isAuthorizedSender(event, windows) {
  const sender = event?.sender;
  return Boolean(sender && windows.some((win) => (
    win && !win.isDestroyed() && win.webContents === sender
  )));
}

function assertAuthorizedSender(event, windows, channel) {
  if (!isAuthorizedSender(event, windows)) {
    throw new Error(`Emisor IPC no autorizado para el canal ${channel}.`);
  }
}

module.exports = { isAuthorizedSender, assertAuthorizedSender };
