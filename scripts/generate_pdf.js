const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
    await win.loadFile(path.join(__dirname, '../plan_actualizacion.html'));
    const pdfData = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      marginType: 'none'
    });
    const pdfPath = path.join(__dirname, '../Plan_de_Actualizacion_InfoUNSA.pdf');
    fs.writeFileSync(pdfPath, pdfData);
    console.log('SUCCESS: PDF GENERATED AT ' + pdfPath);
  } catch (err) {
    console.error('ERROR GENERATING PDF:', err);
  } finally {
    app.quit();
  }
});
