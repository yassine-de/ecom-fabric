/**
 * Prüft die Supabase-Konfiguration aus .env.local, ohne Schlüssel oder Passwörter auszugeben.
 *
 *   npm run check:supabase
 */
import postgres from "postgres";
import { EnvError, maskKey, parseFabricEnv } from "@ecom-fabric/core";

type Check = { label: string; ok: boolean | null; detail: string };

async function checkPublishable(url: string, key: string): Promise<Check> {
  const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
  return { label: "Publishable Key", ok: res.ok, detail: `HTTP ${res.status}` };
}

async function checkSecret(url: string, key: string): Promise<Check> {
  // Lesender Admin-Aufruf (1 Eintrag), bestätigt nur die Gültigkeit des Schlüssels.
  const headers: Record<string, string> = { apikey: key };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, { headers });
  return { label: "Secret Key", ok: res.ok, detail: `HTTP ${res.status}` };
}

async function checkDb(dbUrl: string): Promise<Check> {
  const sql = postgres(dbUrl, { max: 1, connect_timeout: 10, prepare: false, onnotice: () => {} });
  try {
    const [row] = await sql<{ user: string; version: string }[]>`
      select current_user as user, split_part(version(), ' ', 2) as version`;
    return { label: "Datenbank", ok: true, detail: `verbunden als ${row!.user}, PostgreSQL ${row!.version}` };
  } catch (err) {
    // Fehlermeldungen von postgres enthalten keine Passwörter.
    return { label: "Datenbank", ok: false, detail: err instanceof Error ? err.message : String(err) };
  } finally {
    await sql.end({ timeout: 2 });
  }
}

async function main(): Promise<number> {
  let env;
  try {
    env = parseFabricEnv(process.env);
  } catch (err) {
    console.error(`✗ Konfiguration ungültig: ${err instanceof EnvError ? err.message : String(err)}`);
    return 1;
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const pub = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = env.SUPABASE_SECRET_KEY;
  console.log(`Umgebung:        ${env.FABRIC_ENV}`);
  console.log(`Supabase-URL:    ${url ?? "— fehlt"}`);
  console.log(`Publishable Key: ${pub ? maskKey(pub) : "— fehlt"}`);
  console.log(`Secret Key:      ${secret ? maskKey(secret) : "— fehlt"}`);
  console.log(`DB-Verbindung:   ${env.SUPABASE_DB_URL ? "gesetzt" : "— fehlt"}\n`);

  if (!url) {
    console.error("✗ NEXT_PUBLIC_SUPABASE_URL fehlt.");
    return 1;
  }
  const checks: Check[] = [
    pub ? await checkPublishable(url, pub) : { label: "Publishable Key", ok: null, detail: "nicht gesetzt" },
    secret ? await checkSecret(url, secret) : { label: "Secret Key", ok: null, detail: "nicht gesetzt" },
    env.SUPABASE_DB_URL ? await checkDb(env.SUPABASE_DB_URL) : { label: "Datenbank", ok: null, detail: "nicht gesetzt" },
  ];
  for (const c of checks) console.log(`${c.ok === null ? "–" : c.ok ? "✓" : "✗"} ${c.label.padEnd(16)} ${c.detail}`);
  return checks.every((c) => c.ok !== false) && checks[0]!.ok ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`✗ Netzwerkfehler: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
