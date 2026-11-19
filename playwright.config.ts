import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import { config } from "dotenv";
import { E2E_HOJA_DIARIA_ORIGIN, E2E_SSO_SECRET } from "./tests/sso-env";

config({
  path: ".env.local",
});

// SSO con Hoja Diaria (tests/e2e/sso-embed.test.ts): el servidor de pruebas
// hereda estas variables.
process.env.NEFROIA_SSO_SECRET ??= E2E_SSO_SECRET;
process.env.HOJA_DIARIA_ORIGIN ??= E2E_HOJA_DIARIA_ORIGIN;

/* Use process.env.PORT by default and fallback to port 3000 */
const PORT = process.env.PORT || 3000;

/**
 * Set webServer.url and use.baseURL with the location
 * of the WebServer respecting the correct set port
 */
const baseURL = `http://localhost:${PORT}`;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  expect: {
    timeout: 240 * 1000,
  },
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Usuario demo, protocolos y hojas de sesión sembrados (pnpm db:seed). */
  globalSetup: "./tests/global-setup.ts",

  /* Configure projects */
  projects: [
    {
      name: "e2e",
      testMatch: /e2e\/.*.test.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
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
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Retry on CI only */
  retries: 0,
  testDir: "./tests",

  /* Configure global timeout for each test */
  timeout: 240 * 1000, // 120 seconds
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "retain-on-failure",

    // Opcional: usar un Chrome ya instalado (p. ej. entornos sin descarga de Chromium).
    ...(process.env.PLAYWRIGHT_CHROME_PATH
      ? {
          launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROME_PATH },
        }
      : {}),
  },

  /* Run your local dev server before starting the tests */
  webServer: {
    command: process.env.CI ? "pnpm start" : "pnpm dev",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    url: `${baseURL}/ping`,
  },
  /* Limit workers to prevent browser crashes */
  workers: process.env.CI ? 2 : 2,
});
