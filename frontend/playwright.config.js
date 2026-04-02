const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const frontendDir = __dirname;
const workspaceDir = path.resolve(frontendDir, '..');
const backendDir = path.join(workspaceDir, 'backend');

module.exports = defineConfig({
  testDir: './tests/e2e/specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  webServer: [
    {
      command: 'npm run start',
      cwd: backendDir,
      env: {
        ...process.env,
        DATABASE_URL: 'file:./tmp-e2e.db',
        FRONTEND_URL: 'http://127.0.0.1:3000',
        PORT: '3001',
      },
      url: 'http://127.0.0.1:3001/api/docs',
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'npm run start -- --hostname 127.0.0.1 --port 3000',
      cwd: frontendDir,
      env: {
        ...process.env,
        PORT: '3000',
      },
      url: 'http://127.0.0.1:3000',
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
