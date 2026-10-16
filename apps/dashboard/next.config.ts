import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import type { NextConfig } from "next";

// Gemeinsame .env.local im Projektstamm (auch vom Worker genutzt). Das Dashboard übernimmt daraus
// bewusst NUR die zwei öffentlichen Werte – Secret Key und DB-URLs erreichen diesen Prozess nie.
const rootEnvFile = resolve(process.cwd(), "..", "..", ".env.local");
const rootEnv = existsSync(rootEnvFile) ? parseEnv(readFileSync(rootEnvFile, "utf8")) : {};
const pick = (key: string) => process.env[key] ?? rootEnv[key] ?? "";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: pick("NEXT_PUBLIC_SUPABASE_URL"),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: pick("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
