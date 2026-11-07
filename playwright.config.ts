import { defineConfig, devices } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";

// E2E runs the production build against the *_test database only.
const env: Record<string, string> = {};
if (existsSync(".env")) for (const l of readFileSync(".env", "utf8").split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m) env[m[1]] = m[2]; }
const TEST_DB = process.env.TEST_DATABASE_URL ?? env.TEST_DATABASE_URL;
if (!TEST_DB || !/_test/.test(TEST_DB)) throw new Error("TEST_DATABASE_URL (…_test) is required for e2e");
process.env.DATABASE_URL = TEST_DB;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure", locale: "az-AZ" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next start -p 3100 -H 127.0.0.1",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: TEST_DB, NODE_ENV: "production", UPLOAD_DIR: "./test-results/uploads" },
  },
});
