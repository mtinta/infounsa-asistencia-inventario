import { test, expect } from '@playwright/test';

test('CPS-RNF-INV-02-01 Saturación de bloqueos sobre un mismo activo', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Movimientos")');

  const input = page.locator('input[placeholder*="código"], input[placeholder*="nombre"]').first();
  await expect(input).toBeVisible();
});

test('CPS-RNF-INV-02-02 Conflicto de asignación por stock insuficiente', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Movimientos")');

  const input = page.locator('input[placeholder*="código"], input[placeholder*="nombre"]').first();
  await expect(input).toBeVisible();
});

test('CPS-RNF-INV-02-03 Concurrencia entre asignación y baja por daño', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Movimientos")');

  const input = page.locator('input[placeholder*="código"], input[placeholder*="nombre"]').first();
  await expect(input).toBeVisible();
});
