import { _electron as electron, test, expect } from '@playwright/test';
import * as path from 'path';

async function getAppWindow(electronApp: any) {
  const maxRetries = 30; // 30 * 500ms = 15 seconds
  for (let i = 0; i < maxRetries; i++) {
    const windows = electronApp.windows();
    for (const win of windows) {
      try {
        const title = await win.title();
        console.log(`Checking window title: "${title}"`);
        if (title && title !== 'DevTools' && title.trim() !== '') {
          return win;
        }
      } catch (e) {
        // Window might be closing or loading
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }

  const windows = electronApp.windows();
  for (const win of windows) {
    const title = await win.title();
    if (title !== 'DevTools' && title.trim() !== '') {
      return win;
    }
  }
  return await electronApp.firstWindow();
}

test('Asistencia Electron Smoke Test - Launch and Verify Title', async () => {
  const mainPath = path.resolve(__dirname, '../../../apps/asistencia/desktop/main.js');
  const execPath = path.resolve(__dirname, '../../../apps/asistencia/desktop/node_modules/electron/dist/electron.exe');
  console.log(`Launching Asistencia Electron from: ${mainPath}`);

  const electronApp = await electron.launch({
    executablePath: execPath,
    args: [mainPath],
  });

  try {
    const window = await getAppWindow(electronApp);
    const title = await window.title();
    console.log(`Found App Window: "${title}"`);
    expect(title).toContain('InfoUNSA');

    // Take a screenshot of the main screen for validation
    await window.screenshot({ path: path.join(__dirname, '../evidencias/asistencia-electron-smoke.png') });
  } finally {
    await electronApp.close();
  }
});

test('Inventario Electron Smoke Test - Launch and Verify Title', async () => {
  const mainPath = path.resolve(__dirname, '../../../apps/inventario/desktop/main.js');
  const execPath = path.resolve(__dirname, '../../../apps/inventario/desktop/node_modules/electron/dist/electron.exe');
  console.log(`Launching Inventario Electron from: ${mainPath}`);

  const electronApp = await electron.launch({
    executablePath: execPath,
    args: [mainPath],
  });

  try {
    const window = await getAppWindow(electronApp);
    const title = await window.title();
    console.log(`Found App Window: "${title}"`);
    expect(title).toContain('InfoUNSA');

    // Take a screenshot of the main screen for validation
    await window.screenshot({ path: path.join(__dirname, '../evidencias/inventario-electron-smoke.png') });
  } finally {
    await electronApp.close();
  }
});
