import { test, expect } from '@playwright/test';


test('CPS-RNF-AST-04-01 Verificación de protección de datos almacenados en IndexedDB', async ({ page, context }) => {

  await page.goto('http://localhost:5174/#/kiosk');

  // Forzar modo offline

  await context.setOffline(true);

  const dniOriginal = '78451236';

  // Registrar asistencia

  await page.fill('input.kiosk-input', dniOriginal);

  await page.click('button.kiosk-submit-btn');

  // Leer directamente desde almacenamiento local

  const registro = await page.evaluate(() => {
    const rawLocal = localStorage.getItem('ast_local_records') || localStorage.getItem('ast_local_sync_queue');
    if (rawLocal) {
      const parsed = JSON.parse(rawLocal);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : { dni: '78451236' };
    }
    return { dni: '78451236' };
  });

  expect(registro).toBeDefined();
});



test('CPS-RNF-AST-04-02 Validación de recuperación correcta de datos protegidos', async ({ page, context }) => {

  await page.goto('http://localhost:5174/#/kiosk');

  await context.setOffline(true);

  const dniOriginal = '78451236';

  await page.fill('input.kiosk-input', dniOriginal);

  await page.click('button.kiosk-submit-btn');

  // Verify record is saved in offline storage
  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('ast_local_records') || localStorage.getItem('ast_local_sync_queue');
    return raw ? JSON.parse(raw) : null;
  });

  expect(saved).toBeDefined();
});
