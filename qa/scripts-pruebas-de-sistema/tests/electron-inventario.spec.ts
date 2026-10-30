import { _electron as electron, test, expect, Page } from '@playwright/test';
import * as path from 'path';

async function getAppWindow(electronApp: any, titlePattern: string): Promise<Page> {
  const maxRetries = 30; // 30 * 500ms = 15 seconds
  for (let i = 0; i < maxRetries; i++) {
    const windows = electronApp.windows();
    for (const win of windows) {
      try {
        const title = await win.title();
        if (title && title.includes(titlePattern) && title !== 'DevTools') {
          return win;
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

test.describe('Inventario Electron System Tests', () => {
  let electronApp: any;
  let appWindow: Page;
  let tempUserDataPath: string;

  test.beforeEach(async () => {
    const mainPath = path.resolve(__dirname, '../../../apps/inventario/desktop/main.js');
    const execPath = path.resolve(__dirname, '../../../apps/inventario/desktop/node_modules/electron/dist/electron.exe');
    tempUserDataPath = path.resolve(__dirname, `../.temp-user-data-inventario-${Math.floor(Math.random() * 1000000)}`);

    if (require('fs').existsSync(tempUserDataPath)) {
      try {
        require('fs').rmSync(tempUserDataPath, { recursive: true, force: true });
      } catch (e) { }
    }

    electronApp = await electron.launch({
      executablePath: execPath,
      args: [mainPath, `--user-data-dir=${tempUserDataPath}`, '--disable-web-security'],
    });

    appWindow = await getAppWindow(electronApp, 'Gestión de Inventario');
    await appWindow.waitForLoadState('domcontentloaded');
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

  test('CPS-RF-INV-01 Admin Login and Navigation', async () => {
    // 1. Verify Login screen is loaded
    const title = await appWindow.title();
    expect(title).toContain('Gestión de Inventario');

    const loginHeader = appWindow.locator('h3:has-text("Iniciar Sesión")');
    await expect(loginHeader).toBeVisible();

    // 2. Perform authentication
    await appWindow.fill('input[placeholder="Usuario"]', 'admin');
    await appWindow.fill('input[placeholder="Contraseña"]', 'admin123');
    await appWindow.click('button[type="submit"]:has-text("Entrar")');

    // 3. Verify landing on Dashboard
    const dashboardHeader = appWindow.locator('h3:has-text("Resumen General de Almacén")');
    await expect(dashboardHeader).toBeVisible();
  });

  test('CPS-RF-INV-02 Catalogue Listing Verification', async () => {
    // 1. Authenticate first
    await appWindow.fill('input[placeholder="Usuario"]', 'admin');
    await appWindow.fill('input[placeholder="Contraseña"]', 'admin123');
    await appWindow.click('button[type="submit"]:has-text("Entrar")');
    await expect(appWindow.locator('h3:has-text("Resumen General de Almacén")')).toBeVisible();

    // 2. Navigate to "Catálogo"
    await appWindow.click('.nav-btn:has-text("Catálogo")');

    // 3. Verify items are displayed in the catalog table
    const table = appWindow.locator('.crud-table');
    await expect(table).toBeVisible();

    const laptopRow = appWindow.locator('tr:has-text("Laptop QA")');
    await expect(laptopRow).toBeVisible();
  });

  test('CPS-RF-INV-03 Register Stock Entry (Entrada)', async () => {
    // 1. Authenticate first
    await appWindow.fill('input[placeholder="Usuario"]', 'admin');
    await appWindow.fill('input[placeholder="Contraseña"]', 'admin123');
    await appWindow.click('button[type="submit"]:has-text("Entrar")');
    await expect(appWindow.locator('h3:has-text("Resumen General de Almacén")')).toBeVisible();

    // 2. Navigate to "Movimientos"
    await appWindow.click('.nav-btn:has-text("Movimientos")');

    // 3. Fill movement registration form for Laptop QA (barcode: 7750000000011)
    await appWindow.fill('input[placeholder="Escanee o escriba código"]', '7750000000011');

    // Select transaction type: ENTRADA (Ingreso)
    await appWindow.selectOption('select', 'entrada');

    // Set Quantity
    await appWindow.fill('input[type="number"]', '5');

    // Fill observations
    await appWindow.fill('textarea[placeholder="Detalle o justificación"]', 'Ingreso de laptops por pruebas automatizadas');

    // 4. Submit operation
    await appWindow.click('button[type="submit"]:has-text("Registrar Operación")');

    // 5. Verify the registered movement is displayed in the recent operations history table
    const recentMovement = appWindow.locator('.crud-table tr:has-text("Ingreso de laptops por pruebas")').first();
    await expect(recentMovement).toBeVisible();
  });

  test('CPS-RF-INV-04 Register Stock Output (Salida) Validation Exception', async () => {
    // 1. Authenticate first
    await appWindow.fill('input[placeholder="Usuario"]', 'admin');
    await appWindow.fill('input[placeholder="Contraseña"]', 'admin123');
    await appWindow.click('button[type="submit"]:has-text("Entrar")');
    await expect(appWindow.locator('h3:has-text("Resumen General de Almacén")')).toBeVisible();

    // 2. Navigate to "Movimientos"
    await appWindow.click('.nav-btn:has-text("Movimientos")');

    // 3. Request a larger output than available stock (Stock is around 8-13)
    await appWindow.fill('input[placeholder="Escanee o escriba código"]', '7750000000011');
    await appWindow.selectOption('select', 'salida');
    await appWindow.fill('input[type="number"]', '9999');

    // 4. Verify validation error text appears
    const validationError = appWindow.locator(':text-matches("Stock insuficiente", "i")');
    await expect(validationError).toBeVisible();

    // 5. Verify the submit button is disabled
    const submitBtn = appWindow.locator('button[type="submit"]:has-text("Registrar Operación")');
    await expect(submitBtn).toBeDisabled();
  });
});
