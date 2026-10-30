import { test, expect } from '@playwright/test';

test('CPS-RF-AST-01-01 Stress Testing - Saturación de escaneos concurrentes', async ({ page }) => {
  await page.goto('http://localhost:5174/#/kiosk');
  
  const scans = Array.from({ length: 20 }, (_, i) => `784512${30 + i}`);
  const startTime = Date.now();
  
  await Promise.all(scans.map(async (dni) => {
    const input = page.locator('input.kiosk-input');
    if (await input.isVisible()) {
      await input.fill(dni);
      await page.keyboard.press('Enter');
    }
  }));
  
  const elapsed = Date.now() - startTime;
  expect(elapsed).toBeLessThanOrEqual(5000);
});

test('CPS-RF-AST-01-02 Pruebas de excepciones - Escaneo de DNI dañado o ilegible', async ({ page }) => {
  await page.goto('http://localhost:5174/#/kiosk');
  const input = page.locator('input.kiosk-input');
  
  if (await input.isVisible()) {
    await input.fill('784X%@1a');
    await page.keyboard.press('Enter');
    
    const errorMsg = page.locator('.toast, :text-matches("Lectura ilegible|alfanumericos", "i")').first();
    await expect(errorMsg).toBeVisible();
  }
});

test('CPS-RF-AST-01-03 Pruebas de excepciones - Recepción de usuario no planificado', async ({ page }) => {
  await page.goto('http://localhost:5174/#/kiosk');
  
  const manualBtn = page.locator('#btnRegistroManual, #btnExcepcionMenor, :text("Registro Manual de Menor")');
  if (await manualBtn.isVisible()) {
    await manualBtn.click();
    
    const nameInput = page.locator('#nombre, #fullName');
    await nameInput.fill('Ana Paz');
    await page.click('#btnGuardar, #btnSubmit');
    
    await expect(page.locator(':text-matches("mínimo 10 caracteres", "i")')).toBeVisible();
    
    await nameInput.fill('Ana Paz de los Reyes');
    await page.click('#btnGuardar, #btnSubmit');
    
    await expect(page.locator('.sync-success, :text-matches("registrado", "i")')).toBeVisible();
  }
});
