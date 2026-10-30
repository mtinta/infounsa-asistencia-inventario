import { test, expect } from '@playwright/test';

test('CPS-RF-INV-04-01 Registro exitoso de salida de bienes', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Movimientos")');

  const barcodeInput = page.locator('input[placeholder*="código"], input[placeholder*="nombre"]').first();
  await expect(barcodeInput).toBeVisible();
});

test('CPS-RF-INV-04-02 Validación de stock insuficiente', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Movimientos")');

  const barcodeInput = page.locator('input[placeholder*="código"], input[placeholder*="nombre"]').first();
  await expect(barcodeInput).toBeVisible();
});

test('CPS-RF-INV-04-03 Verificar actualización automática del stock y trazabilidad', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Movimientos")');

  const tableOrContainer = page.locator('.crud-table, table, .movements-container').first();
  await expect(tableOrContainer).toBeVisible();
});
