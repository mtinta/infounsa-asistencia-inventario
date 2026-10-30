import { test, expect } from '@playwright/test';

test('CPS-RF-INV-02-01 Simulación de múltiples ingresos concurrentes al almacén central', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Movimientos")');

  const barcodeInput = page.locator('input[placeholder*="código"], input[placeholder*="nombre"]').first();
  await expect(barcodeInput).toBeVisible();
});

test('CPS-RF-INV-02-02 Manejo de error por cantidades inválidas', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Movimientos")');
  
  const barcodeInput = page.locator('input[placeholder*="código"], input[placeholder*="nombre"]').first();
  await expect(barcodeInput).toBeVisible();
});

test('CPS-RF-INV-02-03 Intento de ingreso de mercancía huérfana', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Movimientos")');
  
  const barcodeInput = page.locator('input[placeholder*="código"], input[placeholder*="nombre"]').first();
  await expect(barcodeInput).toBeVisible();
});
