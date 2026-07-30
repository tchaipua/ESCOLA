const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const frontendDir = __dirname;
const workspaceDir = path.resolve(frontendDir, '..');
const backendDir = path.join(workspaceDir, 'backend');
const backendPort = Number(process.env.TCHA_E2E_BACKEND_PORT || 3001);
const frontendPort = Number(process.env.TCHA_E2E_FRONTEND_PORT || 3000);
const backendUrl = `http://127.0.0.1:${backendPort}`;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;

module.exports = defineConfig({
  testDir: './tests/e2e/specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: frontendUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  webServer: [
    {
      command: 'npx nest start',
      cwd: backendDir,
      env: {
        ...process.env,
        DATABASE_URL: 'file:./tmp-e2e.db',
        FRONTEND_URL: frontendUrl,
        NODE_ENV: 'development',
        PORT: String(backendPort),
      },
      url: `${backendUrl}/api/docs`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node .next/standalone/server.js',
      cwd: frontendDir,
      env: {
        ...process.env,
        HOSTNAME: '127.0.0.1',
        PORT: String(frontendPort),
      },
      url: frontendUrl,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
