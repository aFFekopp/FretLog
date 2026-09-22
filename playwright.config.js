const { defineConfig, devices } = require('@playwright/test');
const os = require('os');
const path = require('path');
const fs = require('fs');

const e2eDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fretlog-e2e-'));

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:5000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'python server.py',
    url: 'http://127.0.0.1:5000',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      ...process.env,
      DATABASE_PATH: path.join(e2eDataDir, 'fretlog.db')
    }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } }
  ]
});
