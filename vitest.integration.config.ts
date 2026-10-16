import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Integrationstests laufen gegen das echte Supabase-dev-Projekt (Zugangsdaten aus .env.local).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  test: {
    include: ["apps/worker/test/**/*.itest.ts", "apps/dashboard/test/**/*.itest.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
