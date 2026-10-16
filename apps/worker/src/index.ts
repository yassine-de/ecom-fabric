import { createWorkerIdentity } from "./identity";

/**
 * M0: Worker-Skelett. Ab M1 holt der Worker Jobs atomar aus der Postgres-Queue,
 * meldet Heartbeats und führt externe Aktionen nur mit gültiger Freigabe aus.
 */
const identity = createWorkerIdentity();
const env = process.env.FABRIC_ENV ?? "dev";

console.log(`[worker] ${identity.workerId} gestartet (Umgebung: ${env}, PID ${identity.pid})`);
console.log("[worker] Noch keine Queue angebunden (folgt in M1). Beende.");
