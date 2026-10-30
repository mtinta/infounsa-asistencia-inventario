import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import * as http from 'http';

// Start a simple proxy from 5175 to 5173 so that the Electron app (which is hardcoded to 5175)
// can communicate with the Vite dev server running on 5173.
try {
  const proxy = http.createServer((req, res) => {
    const options = {
      hostname: 'localhost',
      port: 5173,
      path: req.url,
      method: req.method,
      headers: req.headers,
    };
    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });
    proxyReq.on('error', (err) => {
      res.writeHead(502);
      res.end(`Proxy error: ${err.message}`);
    });
    req.pipe(proxyReq, { end: true });
  });
  proxy.on('error', (err) => {
    // Silence EADDRINUSE or other server errors when loaded by multiple workers
  });
  proxy.listen(5175, () => {
    console.log('Proxy listening on port 5175 -> forwarding to 5173');
  });
  // Unref the server so it doesn't prevent Node from exiting
  proxy.unref();
} catch (e) {
  // Silence synchronous errors
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  outputDir: path.join(__dirname, 'evidencias', 'test-results'),
  reporter: [
    ['html', { outputFolder: path.join(__dirname, 'evidencias', 'html-report'), open: 'never' }],
    ['json', { outputFile: path.join(__dirname, 'evidencias', 'results.json') }],
    ['list']
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Webkit'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../../apps/asistencia/desktop',
      port: 5174,
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command: 'npm run dev',
      cwd: '../../apps/inventario/desktop',
      port: 5173,
      reuseExistingServer: true,
      timeout: 120000,
    }
  ],
});
