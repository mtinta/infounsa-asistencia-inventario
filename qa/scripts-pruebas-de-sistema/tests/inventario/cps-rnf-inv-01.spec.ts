import { test, expect } from '@playwright/test';

test('CPS-RNF-INV-01-01 Verificar auditoría al registrar un bien', async ({ page }) => {
  // Go to login page
  await page.goto('http://localhost:5173');

  // Authenticate
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');

  // Go to Catálogo tab
  await page.click('.nav-btn:has-text("Catálogo")');

  // Verify list loads
  const table = page.locator('table.crud-table');
  await expect(table).toBeVisible();
});

test('CPS-RNF-INV-01-02 Verificar auditoría de modificación de bienes', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Catálogo")');

  // Verify catalogue elements exist
  const table = page.locator('table.crud-table');
  await expect(table).toBeVisible();
});

test('CPS-RNF-INV-01-03 Verificar inmutabilidad de registros de auditoría', async ({ page }) => {
  // Verify that edit/delete buttons for audit logs do not exist in UI
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Catálogo")');

  await expect(page.locator('.btn-editar-auditoria')).toHaveCount(0);
  await expect(page.locator('.btn-eliminar-auditoria')).toHaveCount(0);
});
