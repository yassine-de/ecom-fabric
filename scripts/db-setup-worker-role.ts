/**
 * Richtet die Login-Daten der eingeschränkten Datenbankrolle fabric_worker ein (oder rotiert sie)
 * und schreibt FABRIC_WORKER_DB_URL in .env.local.
 *
 * - Passwort wird lokal zufällig erzeugt und nie ausgegeben.
 * - An die Datenbank geht nur ein SCRAM-SHA-256-Verifier, nicht das Klartext-Passwort.
 *
 *   npm run db:setup-worker
 */
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { parseFabricEnv } from "@ecom-fabric/core";

const ENV_FILE = ".env.local";
const ROLE = "fabric_worker";
const ITERATIONS = 4096;

function scramVerifier(password: string): string {
  const salt = randomBytes(16);
  const salted = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${ITERATIONS}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

function upsertEnvLine(content: string, key: string, value: string, comment: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) return content.replace(re, line);
  return `${content.trimEnd()}\n\n${comment}\n${line}\n`;
}

const env = parseFabricEnv(process.env);
if (!env.SUPABASE_DB_URL) {
  console.error("✗ SUPABASE_DB_URL fehlt in .env.local");
  process.exit(1);
}

const adminUrl = new URL(env.SUPABASE_DB_URL);
// Supabase-Pooler erwartet den Benutzernamen als <rolle>.<projekt-ref>
const projectRef = decodeURIComponent(adminUrl.username).split(".")[1];
const password = randomBytes(24).toString("base64url"); // nur URL-sichere Zeichen
const workerUrl = new URL(env.SUPABASE_DB_URL);
workerUrl.username = projectRef ? `${ROLE}.${projectRef}` : ROLE;
workerUrl.password = password;

const admin = postgres(env.SUPABASE_DB_URL, { max: 1, prepare: false, onnotice: () => {} });
try {
  const [exists] = await admin`select 1 as ok from pg_roles where rolname = ${ROLE}`;
  if (!exists) throw new Error(`Rolle ${ROLE} existiert nicht – zuerst npm run db:migrate ausführen`);
  // Verifier enthält nur Base64-Zeichen und '$', ':' – kein Quoting-Risiko.
  await admin.unsafe(`alter role ${ROLE} with login noinherit password '${scramVerifier(password)}'`);
} finally {
  await admin.end({ timeout: 5 });
}

writeFileSync(
  ENV_FILE,
  upsertEnvLine(
    readFileSync(ENV_FILE, "utf8"),
    "FABRIC_WORKER_DB_URL",
    workerUrl.toString(),
    "# Eingeschränkte Worker-Rolle (automatisch erzeugt mit npm run db:setup-worker, Rotation: erneut ausführen)",
  ),
  "utf8",
);

// Verbindung mit der neuen Rolle prüfen.
const worker = postgres(workerUrl.toString(), { max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });
try {
  const [row] = await worker<{ user: string }[]>`select current_user as user`;
  console.log(`✓ Rolle ${ROLE} eingerichtet, Login erfolgreich als ${row!.user}. FABRIC_WORKER_DB_URL in ${ENV_FILE} gesetzt.`);
} catch (err) {
  console.error(`✗ Login mit ${ROLE} fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await worker.end({ timeout: 5 });
}
