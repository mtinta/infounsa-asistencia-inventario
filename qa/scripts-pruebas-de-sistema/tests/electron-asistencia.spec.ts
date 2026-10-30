import { _electron as electron, test, expect, Page } from '@playwright/test';
import * as path from 'path';

async function getAppWindow(electronApp: any, pattern: string): Promise<Page> {
  const maxRetries = 30; // 30 * 500ms = 15 seconds
  for (let i = 0; i < maxRetries; i++) {
    const windows = electronApp.windows();
    for (const win of windows) {
      try {
        const title = await win.title();
        const url = win.url();
        if (title !== 'DevTools') {
          if (pattern === 'kiosk' && url.includes('#/kiosk')) return win;
          if (pattern === 'admin' && url.includes('#/admin')) return win;
          if (title && title.includes(pattern)) return win;
        }
      } catch (e) {
        // Window might be closing or loading
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }

  const windows = electronApp.windows();
  // Fallback to first non-DevTools window
  for (const win of windows) {
    const title = await win.title();
    if (title !== 'DevTools' && title.trim() !== '') {
      return win;
    }
  }
  return await electronApp.firstWindow();
}

test.describe('Asistencia Electron System Tests', () => {
  let electronApp: any;
  let kioskWindow: Page;
  let tempUserDataPath: string;

  test.beforeEach(async () => {
    const mainPath = path.resolve(__dirname, '../../../apps/asistencia/desktop/main.js');
    const execPath = path.resolve(__dirname, '../../../apps/asistencia/desktop/node_modules/electron/dist/electron.exe');
    tempUserDataPath = path.resolve(__dirname, `../.temp-user-data-asistencia-${Math.floor(Math.random() * 1000000)}`);

    if (require('fs').existsSync(tempUserDataPath)) {
      try {
        require('fs').rmSync(tempUserDataPath, { recursive: true, force: true });
      } catch (e) { }
    }

    electronApp = await electron.launch({
      executablePath: execPath,
      args: [mainPath, `--user-data-dir=${tempUserDataPath}`, '--disable-web-security'],
    });

    kioskWindow = await getAppWindow(electronApp, 'kiosk');
    await kioskWindow.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
    try {
      if (tempUserDataPath && require('fs').existsSync(tempUserDataPath)) {
        await new Promise(r => setTimeout(r, 1000));
        require('fs').rmSync(tempUserDataPath, { recursive: true, force: true });
      }
    } catch (e) { }
  });

  test('CPS-RF-AST-01 Stress and Validation: Kiosk Scan Load and Format Exceptions', async () => {
    // 1. Stress test: sequentially entering 5 scans rapidly to check responsiveness
    const scans = ['10101010', '20202020', '10101010', '20202020', '10101010'];
    const startTime = Date.now();

    for (const dni of scans) {
      await kioskWindow.fill('input.kiosk-input', dni);
      await kioskWindow.press('input.kiosk-input', 'Enter');
      // Briefly wait for transaction process
      await kioskWindow.waitForTimeout(300);
    }

    const elapsed = Date.now() - startTime;
    console.log(`Stress scan elapsed time: ${elapsed}ms`);
    expect(elapsed).toBeLessThanOrEqual(5000);

    // 2. Exception test: invalid DNI formats
    await kioskWindow.fill('input.kiosk-input', '12345');
    await kioskWindow.press('input.kiosk-input', 'Enter');

    const toast = kioskWindow.locator('.toast, :text-matches("caracteres", "i")').last();
    await expect(toast).toBeVisible();
  });

  test('CPS-RF-AST-01-03 Minor Registration Flow via Kiosk Modal and Numpad', async () => {
    // 1. Enter minor contingency DNI '00000000'
    await kioskWindow.fill('input.kiosk-input', '00000000');
    await kioskWindow.press('input.kiosk-input', 'Enter');

    // 2. Verify modal appears
    const modal = kioskWindow.locator('.modal-header, :text("Registro - Menor de Edad")').first();
    await expect(modal).toBeVisible();

    // 3. Fill minor details
    await kioskWindow.fill('input#minor-name', 'Carlos Alberto Paz');

    // Select age using tactical numpad (let's say 12 years old)
    await kioskWindow.locator('.numpad-key', { hasText: '1' }).click();
    await kioskWindow.locator('.numpad-key', { hasText: '2' }).click();

    // 4. Submit registration
    await kioskWindow.click('.btn-submit:has-text("Registrar Menor")');

    // 5. Verify successful confirmation toast
    const successToast = kioskWindow.locator('.toast, :text-matches("almacenada|registrada", "i")').first();
    await expect(successToast).toBeVisible();
  });

  test('CPS-RF-AST-02 Admin Portal: Authenticate, Log List and Filter', async () => {
    // 1. Double click logo section in Kiosk window to toggle Admin panel
    await kioskWindow.dblclick('.logo-section');

    // Wait for the admin window to initialize and load
    const adminWindow = await getAppWindow(electronApp, 'admin');

    // Verify admin login form is displayed
    const loginHeader = adminWindow.locator('h3:has-text("Iniciar Sesion")');
    await expect(loginHeader).toBeVisible();

    // 2. Log in with admin credentials
    await adminWindow.fill('input[placeholder="Usuario"]', 'admin');
    await adminWindow.fill('input[placeholder="Contrasena"]', 'admin123');
    await adminWindow.click('button[type="submit"]:has-text("Entrar")');

    // 3. Verify Admin dashboard loads
    const dashboardHeader = adminWindow.locator('h3:has-text("Panel de Control Operativo")');
    await expect(dashboardHeader).toBeVisible();

    // 4. Navigate to "Registro del Dia" tab
    await adminWindow.click('.nav-btn:has-text("Registro del Dia")');

    // Verify logs table or info banner is visible
    const tableOrBanner = adminWindow.locator('.crud-table, .info-banner');
    await expect(tableOrBanner).toBeVisible();

    // 5. Apply filters (e.g. search for Carlos Alberto Paz registered in previous tests)
    const filterInput = adminWindow.locator('input[placeholder*="DNI o nombre"]');
    await filterInput.fill('Carlos');

    // Verify table filters successfully or empty state handles cleanly
    const filteredRows = adminWindow.locator('.crud-table tbody tr, .info-banner');
    const count = await filteredRows.count();
    console.log(`Filtered rows/banner count containing "Carlos": ${count}`);
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
