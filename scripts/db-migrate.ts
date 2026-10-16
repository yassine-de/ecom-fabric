/**
 * Wendet ausstehende SQL-Migrationen aus supabase/migrations an (Admin-Verbindung SUPABASE_DB_URL).
 * Buchführung in supabase_migrations.schema_migrations – kompatibel zur Supabase-CLI.
 *
 *   npm run db:migrate              # anwenden
 *   npm run db:migrate -- --dry-run # nur anzeigen
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { parseFabricEnv } from "@ecom-fabric/core";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const dryRun = process.argv.includes("--dry-run");

const env = parseFabricEnv(process.env);
if (!env.SUPABASE_DB_URL) {
  console.error("✗ SUPABASE_DB_URL fehlt in .env.local");
  process.exit(1);
}
if (env.FABRIC_ENV === "prod" && !process.argv.includes("--confirm-prod")) {
  console.error("✗ Migrationen gegen prod sind Stufe C: nur mit --confirm-prod nach ausdrücklicher Freigabe.");
  process.exit(1);
}

const sql = postgres(env.SUPABASE_DB_URL, { max: 1, prepare: false, onnotice: () => {} });

try {
  await sql`create schema if not exists supabase_migrations`;
  await sql`create table if not exists supabase_migrations.schema_migrations (
    version text primary key, statements text[], name text)`;
  const applied = new Set(
    (await sql<{ version: string }[]>`select version from supabase_migrations.schema_migrations`).map((r) => r.version),
  );

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
  const pending = files.filter((f) => !applied.has(f.slice(0, 14)));
  console.log(`Umgebung ${env.FABRIC_ENV}: ${files.length} Migrationen, ${pending.length} ausstehend.`);

  for (const file of pending) {
    const version = file.slice(0, 14);
    const name = file.slice(15, -4);
    if (dryRun) {
      console.log(`  (dry-run) ${file}`);
      continue;
    }
    const body = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into supabase_migrations.schema_migrations (version, name, statements)
               values (${version}, ${name}, ${[body]})`;
    });
    console.log(`  ✓ ${file}`);
  }
} catch (err) {
  console.error(`✗ Migration fehlgeschlagen (Transaktion zurückgerollt): ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
