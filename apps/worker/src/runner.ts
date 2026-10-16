import { PermanentJobError, type HandlerRegistry } from "./handlers";
import type { FabricQueue, Job } from "./queue";

export interface RunnerOptions {
  queue: FabricQueue;
  handlers: HandlerRegistry;
  /** Wie viele Jobs gleichzeitig laufen dürfen. */
  concurrency?: number;
  leaseSeconds?: number;
  pollIntervalMs?: number;
  /** Nur diese Job-Typen übernehmen (Standard: alle Typen, für die ein Handler existiert). */
  types?: string[];
  /** Verfügbare Jobs abarbeiten und dann zurückkehren (für Tests und zeitgesteuerte Läufe). */
  once?: boolean;
  log?: (message: string) => void;
}

export interface RunnerStats {
  claimed: number;
  succeeded: number;
  failed: number;
  fenced: number;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

const errorText = (err: unknown) => (err instanceof Error ? `${err.name}: ${err.message}` : String(err));

/**
 * Holt Jobs atomar aus der Queue, führt sie mit Lease-Verlängerung aus und meldet das Ergebnis.
 * Bei aktivem Kill-Switch werden laufende Handler abgebrochen und keine neuen Jobs übernommen.
 */
export async function runWorker(opts: RunnerOptions, stopSignal: AbortSignal): Promise<RunnerStats> {
  const {
    queue,
    handlers,
    concurrency = 1,
    leaseSeconds = 300,
    pollIntervalMs = 5000,
    once = false,
    log = () => {},
  } = opts;
  const types = opts.types ?? Object.keys(handlers);
  const stats: RunnerStats = { claimed: 0, succeeded: 0, failed: 0, fenced: 0 };
  const active = new Map<string, { controller: AbortController; done: Promise<void> }>();

  const heartbeat = setInterval(
    async () => {
      try {
        const hb = await queue.heartbeat([...active.keys()], leaseSeconds);
        if (hb.killSwitch && active.size > 0) {
          log("Kill-Switch aktiv – breche laufende Jobs ab");
          for (const { controller } of active.values()) controller.abort(new Error("Kill-Switch aktiv"));
        }
      } catch (err) {
        log(`Heartbeat fehlgeschlagen: ${errorText(err)}`);
      }
    },
    Math.max(1000, (leaseSeconds * 1000) / 3),
  );

  const execute = async (job: Job, controller: AbortController) => {
    const handler = handlers[job.type];
    try {
      if (!handler) throw new PermanentJobError(`Kein Handler für Job-Typ ${job.type}`);
      const result = await handler({ job, queue, signal: controller.signal, log });
      if (controller.signal.aborted) throw controller.signal.reason ?? new Error("abgebrochen");
      await queue.complete(job.id, result);
      stats.succeeded++;
      log(`✓ ${job.type} ${job.id}`);
    } catch (err) {
      try {
        await queue.fail(job.id, errorText(err), { retryable: !(err instanceof PermanentJobError) });
        stats.failed++;
        log(`✗ ${job.type} ${job.id}: ${errorText(err)}`);
      } catch (failErr) {
        // Lease verloren und Job inzwischen von einem anderen Worker übernommen (Fencing).
        stats.fenced++;
        log(`! ${job.type} ${job.id}: Ergebnis verworfen – ${errorText(failErr)}`);
      }
    }
  };

  try {
    while (!stopSignal.aborted) {
      const free = concurrency - active.size;
      let claimed: Job[] = [];
      if (free > 0) {
        try {
          claimed = await queue.claim({ limit: free, leaseSeconds, types });
        } catch (err) {
          log(`Claim fehlgeschlagen: ${errorText(err)}`);
        }
      }
      for (const job of claimed) {
        stats.claimed++;
        const controller = new AbortController();
        const onStop = () => controller.abort(new Error("Worker stoppt"));
        stopSignal.addEventListener("abort", onStop, { once: true });
        const done = execute(job, controller).finally(() => {
          active.delete(job.id);
          stopSignal.removeEventListener("abort", onStop);
        });
        active.set(job.id, { controller, done });
      }
      if (claimed.length === 0) {
        if (active.size > 0) await Promise.race([...active.values()].map((a) => a.done));
        else if (once) break;
        else await sleep(pollIntervalMs, stopSignal);
      } else if (active.size >= concurrency) {
        await Promise.race([...active.values()].map((a) => a.done));
      }
    }
    await Promise.all([...active.values()].map((a) => a.done));
  } finally {
    clearInterval(heartbeat);
  }
  return stats;
}
