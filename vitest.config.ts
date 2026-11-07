import { defineConfig } from "vitest/config";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function loadEnv() {
  const out: Record<string, string> = {};
  if (!existsSync(".env")) return out;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const env = loadEnv();
const testDb = process.env.TEST_DATABASE_URL ?? env.TEST_DATABASE_URL;

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    // Integration tests share one database → run files sequentially
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: {
      // Integration tests NEVER touch the real database
      DATABASE_URL: testDb ?? "postgresql://invalid/never-use-real-db",
    },
  },
});
