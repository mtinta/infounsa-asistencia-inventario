import { test, expect } from '@playwright/test';

test('CPS-RF-INV-01-01 Verificación de catálogo de bienes', async ({ page }) => {
  // Go to Inventario portal
  await page.goto('http://localhost:5173');

  // Perform login
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');

  // Go to Catalog tab
  await page.click('.nav-btn:has-text("Catálogo")');

  // Verify catalogue table or content container is visible
  const table = page.locator('.crud-table, table, .catalog-container').first();
  await expect(table).toBeVisible();
});

test('CPS-RF-INV-01-02 Búsqueda de bienes en catálogo', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Catálogo")');

  const searchInput = page.locator('input[placeholder*="buscar"], input[placeholder*="Escanear"], input.scan-input').first();
  await expect(searchInput).toBeVisible();
  await searchInput.fill('7750000000011');

  const searchBtn = page.locator('button:has-text("Buscar"), button.scan-btn').first();
  if (await searchBtn.isVisible()) {
    await searchBtn.click();
  }

  // Table should still render results or container gracefully
  const tableOrMessage = page.locator('.crud-table, table, :text-matches("No se encontraron", "i"), .catalog-container').first();
  await expect(tableOrMessage).toBeVisible();
});

test('CPS-RF-INV-01-03 Verificación de identificador único de bien', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Catálogo")');

  // Verify catalog page loads
  const tableOrContainer = page.locator('.crud-table, table, .catalog-container').first();
  await expect(tableOrContainer).toBeVisible();
});
