import { parseFabricEnv } from "@ecom-fabric/core";
import { assertWorkerRole, connect } from "./db";
import { defaultHandlers } from "./handlers";
import { createWorkerIdentity } from "./identity";
import { FabricQueue } from "./queue";
import { runWorker } from "./runner";

/**
 * Worker-Prozess. Startbar auf Laptop und PC gleichzeitig – die Queue verhindert Doppelausführung.
 *
 *   npm run dev:worker            # läuft dauerhaft
 *   npm start -w @ecom-fabric/worker -- --once   # verfügbare Jobs abarbeiten, dann beenden
 */
const VERSION = "0.1.0";

async function main(): Promise<number> {
  const env = parseFabricEnv(process.env);
  if (!env.FABRIC_WORKER_DB_URL) {
    console.error("[worker] FABRIC_WORKER_DB_URL fehlt – einmalig `npm run db:setup-worker` ausführen.");
    return 1;
  }
  const once = process.argv.includes("--once");
  const identity = createWorkerIdentity();
  const log = (m: string) => console.log(`[worker ${identity.workerId}] ${m}`);

  const sql = connect(env.FABRIC_WORKER_DB_URL);
  const queue = new FabricQueue(sql, identity.workerId);
  const stop = new AbortController();
  const onSignal = () => {
    log("Stoppsignal empfangen – beende nach laufenden Jobs");
    stop.abort();
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    await assertWorkerRole(sql);
    await queue.register(identity.host, identity.pid, VERSION);
    log(`gestartet (Umgebung ${env.FABRIC_ENV}, Handler: ${Object.keys(defaultHandlers).join(", ")})`);
    const stats = await runWorker({ queue, handlers: defaultHandlers, once, log }, stop.signal);
    log(`beendet: ${stats.succeeded} erfolgreich, ${stats.failed} fehlgeschlagen, ${stats.fenced} verworfen`);
    return 0;
  } catch (err) {
    console.error(`[worker] Fehler: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    await queue.stop().catch(() => {});
    await sql.end({ timeout: 5 });
  }
}

main().then((code) => process.exit(code));
