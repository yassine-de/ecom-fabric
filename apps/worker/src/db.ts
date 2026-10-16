import postgres from "postgres";

export type Sql = postgres.Sql;

export const WORKER_ROLE = "fabric_worker";

export function connect(url: string, max = 2): Sql {
  return postgres(url, {
    max,
    // Supabase-Pooler: keine benannten Prepared Statements nötig, vermeidet Pooler-Sonderfälle.
    prepare: false,
    connect_timeout: 15,
    idle_timeout: 30,
    onnotice: () => {},
  });
}

/**
 * Worker dürfen nur mit der eingeschränkten Rolle arbeiten. Eine Admin-Verbindung würde
 * Freigabe- und Budgetschutz umgehen – daher harter Abbruch.
 */
export async function assertWorkerRole(sql: Sql): Promise<void> {
  const [row] = await sql<{ user: string }[]>`select current_user as user`;
  if (row?.user !== WORKER_ROLE) {
    throw new Error(`Worker verweigert Start: verbunden als "${row?.user}", erlaubt ist nur "${WORKER_ROLE}"`);
  }
}
