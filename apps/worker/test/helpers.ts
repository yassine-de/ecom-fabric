import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { parseFabricEnv } from "@ecom-fabric/core";
import { connect, type Sql } from "../src/db";
import { FabricQueue } from "../src/queue";

/**
 * Hilfen für Integrationstests gegen die dev-Datenbank.
 * Alle Testdaten tragen die Lauf-ID und werden in cleanup() entfernt (Audit-Einträge bleiben – append-only).
 */
export const env = parseFabricEnv(process.env);
if (env.FABRIC_ENV !== "dev") throw new Error("Integrationstests laufen nur gegen FABRIC_ENV=dev");
for (const key of ["SUPABASE_DB_URL", "FABRIC_WORKER_DB_URL", "SUPABASE_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_URL"] as const) {
  if (!env[key]) throw new Error(`${key} fehlt in .env.local`);
}

export const runId = randomBytes(4).toString("hex");
export const testType = (name: string) => `test.${runId}.${name}`;
export const testWorkerId = (name: string) => `test-${runId}-${name}`;
export const testCategory = `test${runId}`;

const opened: Sql[] = [];

/** Admin-Verbindung: nur für Testvorbereitung, Operator-Simulation und Aufräumen. */
export function adminSql(): Sql {
  const sql = postgres(env.SUPABASE_DB_URL!, { max: 2, prepare: false, onnotice: () => {} });
  opened.push(sql);
  return sql;
}

export function workerSql(max = 1): Sql {
  const sql = connect(env.FABRIC_WORKER_DB_URL!, max);
  opened.push(sql);
  return sql;
}

let shared: Sql | undefined;
/** Gemeinsame Worker-Verbindung – der Supabase-Pooler erlaubt im Session-Modus nur 15 Verbindungen. */
export function sharedWorkerSql(): Sql {
  shared ??= workerSql(2);
  return shared;
}

/** Eigene Verbindungen für Parallelitätstests; werden nach fn wieder geschlossen. */
export async function withWorkerClients<T>(n: number, fn: (clients: Sql[]) => Promise<T>): Promise<T> {
  const clients = Array.from({ length: n }, () => connect(env.FABRIC_WORKER_DB_URL!, 1));
  try {
    return await fn(clients);
  } finally {
    await Promise.all(clients.map((c) => c.end({ timeout: 5 })));
  }
}

export async function registeredQueue(name: string, sql: Sql = sharedWorkerSql()): Promise<FabricQueue> {
  const queue = new FabricQueue(sql, testWorkerId(name));
  await queue.register("integration-test", process.pid, "test");
  return queue;
}

const authHeaders = () => {
  const key = env.SUPABASE_SECRET_KEY!;
  return {
    apikey: key,
    "Content-Type": "application/json",
    ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
  };
};

/** Legt einen echten Auth-Nutzer an und schaltet ihn als Operator frei. */
export async function createTestOperator(admin: Sql): Promise<string> {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email: `fabric-test-${runId}@example.com`, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`Test-Operator konnte nicht angelegt werden: HTTP ${res.status}`);
  const user = (await res.json()) as { id: string };
  await admin`insert into fabric.operators (user_id, display_name) values (${user.id}, ${`Test ${runId}`})`;
  return user.id;
}

/** Führt fn so aus, wie PostgREST es für einen angemeldeten Nutzer tun würde (Rolle authenticated + JWT-Claims). */
export async function asUser<T>(admin: Sql, userId: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return (await admin.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    await tx.unsafe("set local role authenticated");
    return fn(tx);
  })) as T;
}

export async function cleanup(admin: Sql, operatorId?: string): Promise<void> {
  const typePattern = `test.${runId}.%`;
  const workerPattern = `test-${runId}-%`;
  await admin`delete from fabric.cost_ledger where created_by like ${workerPattern} or category = ${testCategory}`;
  const jobs = await admin<{ approval_id: string | null }[]>`
    delete from fabric.jobs where type like ${typePattern} or created_by like ${workerPattern} returning approval_id`;
  await admin`delete from fabric.approvals where requested_by like ${workerPattern}
              or id = any(${admin.array(jobs.map((j) => j.approval_id).filter((x): x is string => !!x))}::uuid[])`;
  await admin`delete from fabric.workers where id like ${workerPattern}`;
  await admin`delete from fabric.budgets where category = ${testCategory}`;
  if (operatorId) {
    await admin`delete from fabric.operators where user_id = ${operatorId}`;
    await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${operatorId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  }
}

export async function closeAll(): Promise<void> {
  await Promise.all(opened.splice(0).map((s) => s.end({ timeout: 5 })));
}
