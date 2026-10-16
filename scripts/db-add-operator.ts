/**
 * Schaltet einen registrierten Nutzer als Operator (Mensch mit Freigaberecht) frei – oder entzieht das Recht.
 * Admin-Werkzeug: nutzt SUPABASE_DB_URL und den Secret Key, läuft nur lokal beim Admin.
 *
 *   npm run db:add-operator -- --email du@example.com [--name "Vorname"]
 *   npm run db:add-operator -- --email du@example.com --remove
 */
import postgres from "postgres";
import { parseFabricEnv } from "@ecom-fabric/core";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const email = flag("--email")?.toLowerCase();
const remove = args.includes("--remove");

const env = parseFabricEnv(process.env);
if (!email || !env.SUPABASE_DB_URL || !env.SUPABASE_SECRET_KEY || !env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error("Aufruf: npm run db:add-operator -- --email <adresse> [--name <name>] [--remove]");
  console.error("Benötigt SUPABASE_DB_URL, SUPABASE_SECRET_KEY und NEXT_PUBLIC_SUPABASE_URL in .env.local.");
  process.exit(1);
}

const sql = postgres(env.SUPABASE_DB_URL, { max: 1, prepare: false, onnotice: () => {} });
try {
  const [user] = await sql<{ id: string; email_confirmed_at: Date | null }[]>`
    select id, email_confirmed_at from auth.users where lower(email) = ${email}`;
  if (!user) throw new Error(`Kein registrierter Nutzer mit ${email} – zuerst im Dashboard registrieren.`);

  if (remove) {
    const res = await sql`delete from fabric.operators where user_id = ${user.id}`;
    await sql`select fabric.audit('system', 'admin-cli', 'operator.removed', 'operator', ${user.id}, ${sql.json({ email })})`;
    console.log(res.count ? `✓ Operator-Recht für ${email} entzogen.` : `– ${email} war kein Operator.`);
  } else {
    if (!user.email_confirmed_at) {
      // Supabase-Standard-SMTP stellt nur an Team-Adressen zu; daher Bestätigung durch den Admin.
      const key = env.SUPABASE_SECRET_KEY;
      const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
        method: "PUT",
        headers: {
          apikey: key,
          "Content-Type": "application/json",
          ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({ email_confirm: true }),
      });
      if (!res.ok) throw new Error(`E-Mail-Bestätigung fehlgeschlagen: HTTP ${res.status}`);
      console.log(`✓ E-Mail-Adresse ${email} bestätigt.`);
    }
    const name = flag("--name") ?? email.split("@")[0]!;
    await sql`insert into fabric.operators (user_id, display_name) values (${user.id}, ${name})
              on conflict (user_id) do update set display_name = excluded.display_name`;
    await sql`select fabric.audit('system', 'admin-cli', 'operator.added', 'operator', ${user.id}, ${sql.json({ email, name })})`;
    console.log(`✓ ${email} ist Operator („${name}“). Anmeldung im Dashboard mit Zwei-Faktor-Code.`);
  }
} catch (err) {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
