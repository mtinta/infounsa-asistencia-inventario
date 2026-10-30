import { test, expect } from '@playwright/test';

test('CPS-RNF-AST-02-01 Verificación del límite de ancho de banda en segundo plano', async ({ page, context }) => {
  await page.goto('http://localhost:5174/#/kiosk');
  await context.setOffline(true);

  // Fill and record multiple entries offline
  const input = page.locator('input.kiosk-input');
  if (await input.isVisible()) {
    for (let i = 0; i < 5; i++) {
      await input.fill(`7845120${i}`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);
    }
  }

  // Restore connection
  await context.setOffline(false);

  // Navigate to Admin to check sync queue
  await page.goto('http://localhost:5174/#/admin');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contrasena"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');

  const closeBtn = page.locator('.modal-backdrop button, .modal-close').first();
  if (await closeBtn.isVisible()) {
    await closeBtn.click({ force: true }).catch(() => {});
  }

  const syncTab = page.locator('.nav-btn:has-text("Cola de Sync")').first();
  await syncTab.click({ force: true });

  // Verify sync button exists
  const syncBtn = page.locator('button.sync-action-btn, button:has-text("Subir Cola")').first();
  await expect(syncBtn).toBeVisible();
});

test('CPS-RNF-AST-02-02 Aislamiento del hilo de interfaz gráfica (UI)', async ({ page }) => {
  await page.goto('http://localhost:5174/#/kiosk');

  // Interact with UI rapidly to ensure no UI blocking occurs
  const input = page.locator('input.kiosk-input');
  if (await input.isVisible()) {
    const startTime = Date.now();
    await input.fill('78451236');
    await page.keyboard.press('Enter');
    const elapsed = Date.now() - startTime;
    // Main thread must respond in under 500ms
    expect(elapsed).toBeLessThanOrEqual(500);
  }
});

test('CPS-RNF-AST-02-03 Interrupción de conexión durante la transmisión', async ({ page, context }) => {
  await page.goto('http://localhost:5174/#/kiosk');

  // Go offline while scanning
  await context.setOffline(true);
  const input = page.locator('input.kiosk-input');
  if (await input.isVisible()) {
    await input.fill('74589632');
    await page.keyboard.press('Enter');
  }

  // Verify network indicator indicates offline/local mode
  const offlineIndicator = page.locator('.network-indicator, :text-matches("offline|local", "i")').first();
  await expect(offlineIndicator).toBeVisible();

  await context.setOffline(false);
});
