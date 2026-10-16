/**
 * Prüft die Supabase-Konfiguration aus .env.local, ohne Schlüssel auszugeben.
 *
 *   npm run check:supabase
 */
import { EnvError, maskKey, parseFabricEnv } from "@ecom-fabric/core";

async function main(): Promise<number> {
  let env;
  try {
    env = parseFabricEnv(process.env);
  } catch (err) {
    console.error(`✗ Konfiguration ungültig: ${err instanceof EnvError ? err.message : String(err)}`);
    return 1;
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  console.log(`Umgebung:         ${env.FABRIC_ENV}`);
  console.log(`Supabase-URL:     ${url ?? "— fehlt"}`);
  console.log(`Publishable Key:  ${key ? maskKey(key) : "— fehlt"}`);
  console.log(`Secret Key:       ${env.SUPABASE_SECRET_KEY ? maskKey(env.SUPABASE_SECRET_KEY) : "— (erst M1)"}`);
  console.log(`DB-Verbindung:    ${env.SUPABASE_DB_URL ? "gesetzt" : "— (erst M1)"}`);

  if (!url || !key) {
    console.error("\n✗ URL oder Publishable Key fehlt in .env.local.");
    return 1;
  }

  // Lesender Aufruf, der nur prüft, ob Projekt erreichbar und Schlüssel gültig ist.
  const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
  if (res.ok) {
    console.log(`\n✓ Verbindung erfolgreich (HTTP ${res.status}). Projekt erreichbar, Publishable Key gültig.`);
    return 0;
  }
  console.error(`\n✗ Verbindung fehlgeschlagen (HTTP ${res.status}). Schlüssel oder URL prüfen.`);
  return 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`✗ Netzwerkfehler: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
