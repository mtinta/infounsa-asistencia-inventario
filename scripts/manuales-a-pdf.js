// Proceso principal de Electron: imprime a PDF los HTML indicados.
// Uso (lo invoca generar-manuales-pdf.py): electron manuales-a-pdf.js <entrada.html> <salida.pdf> [<entrada.html> <salida.pdf> ...]
const { app, BrowserWindow } = require('electron');

const pares = process.argv.filter((a) => /\.(html|pdf)$/i.test(a));

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  let codigo = 0;
  const fs = require('fs');
  try {
    const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
    for (let i = 0; i + 1 < pares.length; i += 2) {
      await win.loadFile(pares[i]);
      const pdf = await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { top: 0.7, bottom: 0.7, left: 0.7, right: 0.7 },
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate:
          '<div style="width:100%;font-size:8px;color:#666;text-align:center;font-family:Arial,sans-serif">' +
          'Plataforma InfoUNSA &nbsp;·&nbsp; Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>',
      });
      fs.writeFileSync(pares[i + 1], pdf);
      console.log('PDF generado:', pares[i + 1]);
    }
  } catch (err) {
    console.error('Error generando PDF:', err);
    codigo = 1;
  } finally {
    app.exit(codigo);
  }
});
