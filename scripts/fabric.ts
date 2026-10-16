/**
 * Kommandozeile für den Factory Core (läuft mit der eingeschränkten Worker-Rolle).
 *
 *   npm run fabric -- status
 *   npm run fabric -- enqueue <agent> <typ> [--payload-file datei.json | --payload '{...}'] [--key idempotenz-key]
 *       [--approval B|C --summary "Text"]   # Job wartet auf Freigabe im Dashboard
 *
 * Beispiel:
 *   npm run fabric -- enqueue unit-economics unit-economics.analyze --payload-file data/products/spingrip.json
 */
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { parseFabricEnv } from "@ecom-fabric/core";
import { assertWorkerRole, connect } from "../apps/worker/src/db";
import { FabricQueue, type Json } from "../apps/worker/src/queue";

const [command, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};
const eur = (cents: number) => (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

const env = parseFabricEnv(process.env);
if (!env.FABRIC_WORKER_DB_URL) {
  console.error("✗ FABRIC_WORKER_DB_URL fehlt – einmalig `npm run db:setup-worker` ausführen.");
  process.exit(1);
}
const sql = connect(env.FABRIC_WORKER_DB_URL, 1);
const queue = new FabricQueue(sql, `cli:${hostname().toLowerCase()}`);

try {
  await assertWorkerRole(sql);
  if (command === "status") {
    const s = (await queue.status()) as {
      kill_switch: boolean;
      jobs: Record<string, number>;
      pending_approvals: number;
      active_workers: Array<{ id: string; last_heartbeat_at: string }>;
      budgets: Array<{ category: string; period: string; limit_cents: number; spent_cents: number }>;
      agents: Array<{ id: string; enabled: boolean }>;
    };
    console.log(`Kill-Switch:      ${s.kill_switch ? "AKTIV" : "aus"}`);
    console.log(`Offene Freigaben: ${s.pending_approvals}`);
    console.log(`Jobs:             ${Object.entries(s.jobs).map(([k, v]) => `${k} ${v}`).join(" · ") || "keine"}`);
    console.log(`Aktive Worker:    ${s.active_workers.map((w) => w.id).join(", ") || "keine"}`);
    console.log(`Agenten aktiv:    ${s.agents.filter((a) => a.enabled).map((a) => a.id).join(", ")}`);
    console.log("Budgets:");
    for (const b of s.budgets) {
      const ratio = b.limit_cents > 0 ? Math.round((b.spent_cents / b.limit_cents) * 100) : 0;
      console.log(`  ${`${b.category}/${b.period}`.padEnd(14)} ${eur(b.spent_cents).padStart(10)} von ${eur(b.limit_cents).padStart(10)} (${ratio} %)`);
    }
  } else if (command === "enqueue") {
    const [agentId, type] = rest;
    if (!agentId || !type) throw new Error("Aufruf: enqueue <agent> <typ> [--payload-file f.json | --payload '{...}']");
    const file = flag("--payload-file");
    const inline = flag("--payload");
    const payload = (file ? JSON.parse(readFileSync(file, "utf8")) : inline ? JSON.parse(inline) : {}) as Json;
    const level = flag("--approval");
    if (level !== undefined && level !== "B" && level !== "C") throw new Error("--approval muss B oder C sein");
    const job = await queue.enqueue({
      agentId,
      type,
      payload,
      idempotencyKey: flag("--key"),
      approval: level ? { level, summary: flag("--summary") ?? type } : undefined,
    });
    console.log(`✓ Job ${job.id} (${job.type}) – Status ${job.status}${job.approvalId ? ` · Freigabe ${job.approvalId}` : ""}`);
  } else {
    console.log(
      "Befehle: status | enqueue <agent> <typ> [--payload-file f.json | --payload '{...}'] [--key k] [--approval B|C --summary text]",
    );
    process.exitCode = command ? 1 : 0;
  }
} catch (err) {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
