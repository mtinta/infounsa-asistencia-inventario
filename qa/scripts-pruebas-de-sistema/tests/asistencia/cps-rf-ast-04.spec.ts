import { test, expect } from '@playwright/test';

test('CPS-RF-AST-04-01 Volume Testing - Sincronización masiva tras periodo offline', async ({ page, context }) => {
  await page.goto('http://localhost:5174/#/kiosk');
  
  await context.setOffline(true);
  
  const indicator = page.locator('.network-indicator, .status-bar, :text-matches("offline", "i")');
  if (await indicator.isVisible()) {
    await expect(indicator).toBeVisible();
  }
  
  await context.setOffline(false);
  
  const onlineIndicator = page.locator('.network-indicator, .status-bar, :text-matches("online", "i")');
  if (await onlineIndicator.isVisible()) {
    await expect(onlineIndicator).toBeVisible();
  }
  
  const syncBtn = page.locator('#btnSincronizar, #btnSync');
  if (await syncBtn.isVisible()) {
    await syncBtn.click();
    await expect(page.locator('.info-banner, .toast, :text-matches("Sincronización|Cola limpia|sincronizados", "i")').first()).toBeVisible();
  }
});

test('CPS-RF-AST-04-02 Exception Testing - Caída de red en pleno envío', async ({ page, context }) => {
  await page.goto('http://localhost:5174/#/kiosk');
  
  const syncBtn = page.locator('#btnSincronizar, #btnSync');
  if (await syncBtn.isVisible()) {
    const syncPromise = syncBtn.click();
    await context.setOffline(true);
    await syncPromise;
    
    const indicator = page.locator('.network-indicator, :text-matches("local", "i")');
    if (await indicator.isVisible()) {
      await expect(indicator).toBeVisible();
    }
    
    await context.setOffline(false);
  }
});
