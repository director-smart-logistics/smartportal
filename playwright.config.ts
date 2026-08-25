import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, 'playwright/.auth/user.json');

export default defineConfig({
  testDir: './playwright',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['html', { open: 'always', outputFolder: 'playwright-report' }],
    ['line'],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on',
  },
  timeout: 1_800_000, // 30 min — 290 clientes ~3-4s c/u ≈ ~15-20 min total
  expect: { timeout: 10_000 },
  projects: [
    // ── STEP 1: Capturar sesión Firebase (correr solo una vez, omitido en CI ya que se usa mock auth) ─────────────
    ...(process.env.CI ? [] : [
      {
        name: 'setup-auth',
        testMatch: /auth\.setup\.ts/,
        use: {
          ...devices['Desktop Chrome'],
          headless: false,
          viewport: { width: 1440, height: 900 },
        },
      }
    ]),

    // ── STEP 2: Tests de verificación usando la sesión real ────────────────
    {
      name: 'chromium',
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        headless: !!process.env.CI,
        viewport: { width: 1440, height: 900 },
        // Reusar sesión Firebase real en local; en CI se usa mock auth
        ...(process.env.CI ? {} : { storageState: AUTH_FILE }),
      },
      dependencies: [],  // No dependency — usar auth file directamente
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
