import { defineConfig, devices } from '@playwright/test';

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { getBaseUrl } from './config/env';

const localEnvPath = resolve(__dirname, '.env.local');
if (existsSync(localEnvPath)) {
  loadEnvFile(localEnvPath);
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : Number(process.env.WORKERS) || undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  //reporter: 'html',
  reporter: [
  ['list'],
  ['html', { open: 'never' }],
  // detail:false keeps only our labelled test.step()s in Allure; Playwright's internal API steps
  // (e.g. `Fill "<value>"`) would otherwise print typed values, including passwords.
  ['allure-playwright', { resultsDir: 'allure-results', detail: false }],
  ['./reporters/neon-tracker.ts'],
  ...(process.env.CI
    ? [['json', { outputFile: 'playwright-summary.json' }] as ['json', { outputFile: string }]]
    : [['./reporters/local-slack.ts'] as [string]])
],
globalSetup: './allure-setup.ts',
globalTeardown: process.env.CI || process.env.NO_REPORT_OPEN ? undefined : './allure-teardown.ts',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
     baseURL: getBaseUrl(),

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: process.env.EVIDENCE_MODE === '1' ? 'on' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.EVIDENCE_MODE === '1' ? { mode: 'on', size: { width: 1440, height: 900 } } : { mode: 'on', size: { width: 1280, height: 720 } },
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(process.env.EVIDENCE_MODE === '1' ? { viewport: { width: 1440, height: 900 } } : {}) },
    },

    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },

  
});

