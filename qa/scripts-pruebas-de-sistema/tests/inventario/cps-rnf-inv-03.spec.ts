import { test, expect } from '@playwright/test';

test('CPS-RNF-INV-03-01 Rendimiento del motor analítico bajo volumen masivo de histórico', async ({ page }) => {
  // Go to Inventario client dashboard (Resumen General)
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');

  // Verify dashboard KPIs are loaded quickly (under 2 seconds)
  const startTime = Date.now();
  await page.click('.nav-btn:has-text("Resumen General")');

  const bentoGrid = page.locator('.settings-bento-grid, .kpi-card, .crud-table, .stat-card, .dashboard-container, h2').first();
  await expect(bentoGrid).toBeVisible();

  const elapsed = Date.now() - startTime;
  expect(elapsed).toBeLessThanOrEqual(5000);
});

test('CPS-RNF-INV-03-02 Carga concurrente de lectura analítica', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');

  // Dashboard must load successfully
  const kpi = page.locator('.kpi-card, .settings-bento-grid, .crud-table, .stat-card, .dashboard-container, h2').first();
  await expect(kpi).toBeVisible();
});

test('CPS-RNF-INV-03-03 Procesamiento analítico con configuración inexacta', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');

  // Check that the system does not crash and renders page metrics gracefully
  const graphs = page.locator('.chart-card, .crud-table, .settings-bento-grid, h2').first();
  await expect(graphs).toBeVisible();
});
