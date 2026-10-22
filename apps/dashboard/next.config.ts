import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import type { NextConfig } from "next";

// Smartphone-Zugriff im Heimnetz während der Entwicklung: nur die eigenen privaten IPv4-Adressen dieses Rechners.
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((n): n is NonNullable<typeof n> => !!n && n.family === "IPv4" && !n.internal)
  .map((n) => n.address)
  .filter((ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip));

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
  allowedDevOrigins: lanAddresses,
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
