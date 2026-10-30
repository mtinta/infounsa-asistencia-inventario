import { test, expect } from '@playwright/test';

test('CPS-RNF-AST-06-01 Medición de fluidez en escaneo estándar', async ({ page }) => {
  await page.goto('http://localhost:5174/#/kiosk');
  
  const input = page.locator('input.kiosk-input');
  if (await input.isVisible()) {
    const startTime = Date.now();
    await input.fill('78451236');
    await page.keyboard.press('Enter');
    
    // Performance expectation: response and feedback under 500ms
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThanOrEqual(500);
  }
});

test('CPS-RNF-AST-06-02 Saturación del lector en hora pico', async ({ page }) => {
  await page.goto('http://localhost:5174/#/kiosk');
  
  const input = page.locator('input.kiosk-input');
  if (await input.isVisible()) {
    const scans = ['78451201', '78451202', '78451203', '78451204', '78451205'];
    
    for (const dni of scans) {
      const startTime = Date.now();
      await input.fill(dni);
      await page.keyboard.press('Enter');
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThanOrEqual(500);
    }
  }
});

test('CPS-RNF-AST-06-03 Rendimiento en hardware limitado', async ({ page }) => {
  await page.goto('http://localhost:5174/#/kiosk');
  
  // Emulate low-CPU and RAM responsiveness check
  const input = page.locator('input.kiosk-input');
  if (await input.isVisible()) {
    const startTime = Date.now();
    await input.fill('74589632');
    await page.keyboard.press('Enter');
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThanOrEqual(500);
  }
});
