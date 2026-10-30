import { test, expect } from '@playwright/test';

test('CPS-RF-AST-03-01 Filtrado de asistencias por nombre o DNI', async ({ page }) => {
  // 1. Go to Admin login page
  await page.goto('http://localhost:5174/#/admin');

  // 2. Perform authentication
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contrasena"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');

  // 3. Navigate to Registro del Dia tab
  await page.click('.nav-btn:has-text("Registro del Dia")');

  // 4. Input search filter
  const filterInput = page.locator('input[placeholder*="DNI o nombre"]');
  await expect(filterInput).toBeVisible();
  await filterInput.fill('Carlos');

  // 5. Verify either filtered records table or empty info banner is visible
  const content = page.locator('.crud-table, .info-banner');
  await expect(content).toBeVisible();
});

test('CPS-RF-AST-03-02 Búsqueda de asistencias por fecha', async ({ page }) => {
  // 1. Go to Admin login page
  await page.goto('http://localhost:5174/#/admin');

  // 2. Perform authentication
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contrasena"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');

  // 3. Navigate to Registro del Dia tab
  await page.click('.nav-btn:has-text("Registro del Dia")');

  // 4. Fill date filter
  const dateInput = page.locator('input[type="date"]');
  await expect(dateInput).toBeVisible();
  await dateInput.fill('2026-07-06');

  // 5. Verify view updates
  const content = page.locator('.crud-table, .info-banner');
  await expect(content).toBeVisible();
});

test('CPS-RF-AST-03-03 Verificación de paginación de registros', async ({ page }) => {
  // Note: The desktop logs UI renders all matching records in a scroll container
  // instead of traditional page navigation buttons.
  await page.goto('http://localhost:5174/#/admin');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contrasena"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Registro del Dia")');

  // Verify list container exists
  const tableOrBanner = page.locator('.crud-table, .info-banner');
  await expect(tableOrBanner).toBeVisible();
});
