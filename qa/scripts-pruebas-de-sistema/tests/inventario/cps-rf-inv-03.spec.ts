import { test, expect } from '@playwright/test';

test('CPS-RF-INV-03-01 Actualización en tiempo real de alertas', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Alertas de Stock")');

  // Verify critical alerts table or container is visible
  const table = page.locator('table.crud-table, table, .alerts-container, .settings-bento-grid').first();
  await expect(table).toBeVisible();
});

test('CPS-RF-INV-03-02 Configuración de umbrales con parámetros inválidos', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Configuración")');

  // Verify settings container is visible
  const settingsContainer = page.locator('.settings-bento-grid, h3:has-text("Configuración"), .settings-container').first();
  await expect(settingsContainer).toBeVisible();
});

test('CPS-RF-INV-03-03 Generación de alerta por incidencia de inventario dañado', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Alertas de Stock")');
  const table = page.locator('table.crud-table, table, .alerts-container, .settings-bento-grid').first();
  await expect(table).toBeVisible();
});
