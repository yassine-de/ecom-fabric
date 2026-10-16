import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

export interface WorkerIdentity {
  /** Eindeutig je Prozess: Rechnername + Zufallsanteil, z. B. "desktop-pc:3f9c1a2b". */
  workerId: string;
  host: string;
  pid: number;
  startedAt: Date;
}

export function createWorkerIdentity(host = hostname(), uuid = randomUUID()): WorkerIdentity {
  const safeHost = host.toLowerCase().replace(/[^a-z0-9-]/g, "-") || "unknown";
  return { workerId: `${safeHost}:${uuid.slice(0, 8)}`, host, pid: process.pid, startedAt: new Date() };
}
