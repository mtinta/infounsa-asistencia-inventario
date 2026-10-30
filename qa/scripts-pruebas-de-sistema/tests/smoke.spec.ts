import { test, expect } from '@playwright/test';

test('Smoke Test - Verificar inicio de suite de pruebas', async ({ page }) => {
  await page.goto('https://example.com');
  const title = await page.title();
  expect(title).toContain('Example Domain');
});
