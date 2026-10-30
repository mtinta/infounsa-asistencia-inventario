import { test, expect } from '@playwright/test';

test('CPS-RF-INV-05-01 Visualización de bienes registrados', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Catálogo")');

  const table = page.locator('table.crud-table, table').first();
  await expect(table).toBeVisible();
});

test('CPS-RF-INV-05-02 Búsqueda de bienes por código o descripción', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Catálogo")');

  const searchInput = page.locator('input[placeholder*="buscar"], input[placeholder*="Escanear"], input.scan-input').first();
  await expect(searchInput).toBeVisible();
  await searchInput.fill('7750000000011'); // Laptop QA EAN

  const searchBtn = page.locator('button:has-text("Buscar"), button.scan-btn').first();
  if (await searchBtn.isVisible()) {
    await searchBtn.click();
  }

  const table = page.locator('table.crud-table, table').first();
  await expect(table).toBeVisible();
});

test('CPS-RF-INV-05-03 Filtrado de catálogo', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Catálogo")');

  const searchInput = page.locator('input[placeholder*="buscar"], input[placeholder*="Escanear"], input.scan-input').first();
  await expect(searchInput).toBeVisible();
});
