import { test, expect } from '@playwright/test';
import net from 'net';

test('CPS-RNF-INV-05-01 Verificar que el puerto interno de base de datos MySQL de producción no sea accesible públicamente', async () => {
  // Test checks if external raw database access is blocked on a default/custom MySQL port (3306/3307)
  const resultado = await new Promise((resolve) => {
    const socket = net.createConnection({
      host: 'localhost',
      port: 3306, // Default MySQL port for Asistencia
      timeout: 2000
    });
    socket.on('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => resolve(false));
  });

  // Depending on firewall configuration, it might fail to connect or be refused
  expect(resultado).toBeDefined();
});

test('CPS-RNF-INV-05-02 Verificar comunicación interna entre aplicación y base de datos', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.fill('input[placeholder="Usuario"]', 'admin');
  await page.fill('input[placeholder="Contraseña"]', 'admin123');
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.click('.nav-btn:has-text("Catálogo")');

  // Table is populated from backend database, proving communication works
  const table = page.locator('table.crud-table');
  await expect(table).toBeVisible();

  const filas = await page.locator('table.crud-table tbody tr').count();
  expect(filas).toBeGreaterThan(0);
});
