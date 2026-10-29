import { defineConfig } from '@playwright/test';

// Tests run against a second copy of the app on port 3100 so they never touch the rate limits of the copy you use.
// TRUST_PROXY lets each test pretend to be a different visitor (X-Forwarded-For), so sign-up limits do not stop the suite.
// Needs the stand-in servers in tests/ running (fake Google :4010, mail :1025, AI :4011, fake GitHub :4012) and the database from .env.local.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  outputDir: 'e2e/results',
  webServer: {
    command: 'npx next start -p 3100',
    url: 'http://localhost:3100/api/ready',
    reuseExistingServer: true,
    timeout: 60_000,
    env: { TRUST_PROXY: 'true', BASE_URL: 'http://localhost:3100', ALLOW_DEMO: 'true' },
  },
});
