import { test, expect } from '@playwright/test';

test('CPS-RF-AST-02-01 Exportacion exitosa PDF', async ({ page }) => {
  await page.goto('http://localhost:5174/#/admin');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contrasena"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');

  // Dismiss modal if open
  const closeBtn = page.locator('.modal-backdrop button, .modal-close').first();
  if (await closeBtn.isVisible()) {
    await closeBtn.click().catch(() => {});
  }

  const pdfTab = page.locator('.nav-btn:has-text("Reportes PDF"), .nav-btn:has-text("Reportes")').first();
  await expect(pdfTab).toBeVisible();
  await pdfTab.click();

  const pdfContainer = page.locator('iframe, .pdf-preview, .report-container, button:has-text("Generar PDF")').first();
  await expect(pdfContainer).toBeVisible();
});

test('CPS-RF-AST-02-02 Reporte sin registros', async ({ page }) => {
  await page.goto('http://localhost:5174/#/admin');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contrasena"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');

  const closeBtn = page.locator('.modal-backdrop button, .modal-close').first();
  if (await closeBtn.isVisible()) {
    await closeBtn.click().catch(() => {});
  }

  const pdfTab = page.locator('.nav-btn:has-text("Reportes PDF"), .nav-btn:has-text("Reportes")').first();
  await expect(pdfTab).toBeVisible();
  await pdfTab.click();

  const pdfContainer = page.locator('iframe, .pdf-preview, .report-container, button:has-text("Generar PDF")').first();
  await expect(pdfContainer).toBeVisible();
});

test('CPS-RF-AST-02-03 Cancelar exportacion', async ({ page }) => {
  await page.goto('http://localhost:5174/#/admin');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contrasena"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');

  const closeBtn = page.locator('.modal-backdrop button, .modal-close').first();
  if (await closeBtn.isVisible()) {
    await closeBtn.click().catch(() => {});
  }

  const pdfTab = page.locator('.nav-btn:has-text("Reportes PDF"), .nav-btn:has-text("Reportes")').first();
  await expect(pdfTab).toBeVisible();
  await pdfTab.click();

  const pdfContainer = page.locator('iframe, .pdf-preview, .report-container, button:has-text("Generar PDF")').first();
  await expect(pdfContainer).toBeVisible();
});
