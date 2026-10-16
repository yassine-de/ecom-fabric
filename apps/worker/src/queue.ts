import type { Sql } from "./db";

export type JobStatus =
  | "awaiting_approval"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "dead"
  | "cancelled";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface Job {
  id: string;
  agentId: string;
  type: string;
  priority: number;
  status: JobStatus;
  payload: Json;
  result: Json;
  errors: Array<{ at: string; worker: string | null; attempt: number; error: string }>;
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  lockedBy: string | null;
  lockedUntil: Date | null;
  idempotencyKey: string | null;
  approvalId: string | null;
  costEstimateCents: number;
  costActualCents: number;
  createdBy: string;
}

type JobRow = {
  id: string;
  agent_id: string;
  type: string;
  priority: number;
  status: JobStatus;
  payload: Json;
  result: Json;
  errors: Job["errors"];
  attempts: number;
  max_attempts: number;
  run_at: Date;
  locked_by: string | null;
  locked_until: Date | null;
  idempotency_key: string | null;
  approval_id: string | null;
  cost_estimate_cents: number;
  cost_actual_cents: number;
  created_by: string;
};

function toJob(r: JobRow): Job {
  return {
    id: r.id,
    agentId: r.agent_id,
    type: r.type,
    priority: r.priority,
    status: r.status,
    payload: r.payload,
    result: r.result,
    errors: r.errors,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    runAt: r.run_at,
    lockedBy: r.locked_by,
    lockedUntil: r.locked_until,
    idempotencyKey: r.idempotency_key,
    approvalId: r.approval_id,
    costEstimateCents: r.cost_estimate_cents,
    costActualCents: r.cost_actual_cents,
    createdBy: r.created_by,
  };
}

export interface EnqueueInput {
  agentId: string;
  type: string;
  payload?: Json;
  priority?: number;
  runAt?: Date;
  maxAttempts?: number;
  idempotencyKey?: string;
  costEstimateCents?: number;
  /** Stufe B/C: Job wartet auf menschliche Freigabe, bevor er ausgeführt werden kann. */
  approval?: { level: "B" | "C"; summary: string; actionType?: string; expiresHours?: number };
}

export type CostReservation =
  | { allowed: true; reservationId: string; warnings: Array<{ category: string; period: string; usedRatio: number }> }
  | { allowed: false; reason: string; [key: string]: unknown };

export type ApprovalConsumption = { ok: true; approvalId: string; level: "B" | "C" } | { ok: false; reason: string };

/**
 * Typisierter Zugriff auf die Factory-Core-Funktionen (Schema fabric).
 * Jede Methode ruft genau eine SECURITY-DEFINER-Funktion auf; direkte Tabellenzugriffe gibt es nicht.
 */
export class FabricQueue {
  constructor(
    readonly sql: Sql,
    readonly workerId: string,
  ) {}

  async register(host: string, pid: number, version?: string): Promise<void> {
    await this.sql`select fabric.register_worker(${this.workerId}, ${host}, ${pid}, ${version ?? null})`;
  }

  async stop(): Promise<number> {
    const [row] = await this.sql<{ n: number }[]>`select fabric.stop_worker(${this.workerId}) as n`;
    return row!.n;
  }

  async heartbeat(jobIds: string[], leaseSeconds = 300): Promise<{ killSwitch: boolean; leasesExtended: number }> {
    const [row] = await this.sql<{ r: { kill_switch: boolean; leases_extended: number } }[]>`
      select fabric.heartbeat(${this.workerId}, ${this.sql.array(jobIds)}::uuid[], ${leaseSeconds}) as r`;
    return { killSwitch: row!.r.kill_switch, leasesExtended: row!.r.leases_extended };
  }

  async enqueue(input: EnqueueInput): Promise<Job> {
    const approval = input.approval
      ? {
          level: input.approval.level,
          summary: input.approval.summary,
          action_type: input.approval.actionType ?? input.type,
          expires_hours: input.approval.expiresHours ?? 72,
        }
      : null;
    const [row] = await this.sql<JobRow[]>`
      select * from fabric.enqueue_job(
        ${this.workerId}, ${input.agentId}, ${input.type},
        ${this.sql.json(input.payload ?? {})}::jsonb,
        ${input.priority ?? 0}, ${input.runAt ?? null}::timestamptz, ${input.maxAttempts ?? 3},
        ${input.idempotencyKey ?? null}, ${input.costEstimateCents ?? 0},
        ${approval ? this.sql.json(approval) : null}::jsonb)`;
    return toJob(row!);
  }

  async claim(opts: { limit?: number; leaseSeconds?: number; types?: string[] } = {}): Promise<Job[]> {
    const rows = await this.sql<JobRow[]>`
      select * from fabric.claim_jobs(
        ${this.workerId}, ${opts.limit ?? 1}, ${opts.leaseSeconds ?? 300},
        ${opts.types ? this.sql.array(opts.types) : null}::text[])`;
    return rows.map(toJob);
  }

  async complete(jobId: string, result: Json = {}): Promise<Job> {
    const [row] = await this.sql<JobRow[]>`
      select * from fabric.complete_job(${this.workerId}, ${jobId}, ${this.sql.json(result)}::jsonb)`;
    return toJob(row!);
  }

  async fail(jobId: string, error: string, opts: { retryable?: boolean; retryInSeconds?: number } = {}): Promise<Job> {
    const [row] = await this.sql<JobRow[]>`
      select * from fabric.fail_job(${this.workerId}, ${jobId}, ${error},
        ${opts.retryable ?? true}, ${opts.retryInSeconds ?? null}::integer)`;
    return toJob(row!);
  }

  async requestApproval(input: {
    actionType: string;
    level: "B" | "C";
    summary: string;
    payload: Json;
    costEstimateCents?: number;
    expiresHours?: number;
  }): Promise<string> {
    const [row] = await this.sql<{ id: string }[]>`
      select fabric.request_approval(${this.workerId}, ${input.actionType}, ${input.level}, ${input.summary},
        ${this.sql.json(input.payload)}::jsonb, ${input.costEstimateCents ?? 0}, ${input.expiresHours ?? 72}) as id`;
    return row!.id;
  }

  /** Muss unmittelbar vor einer externen Aktion aufgerufen werden; gelingt pro Freigabe genau einmal. */
  async consumeApproval(approvalId: string, payload: Json): Promise<ApprovalConsumption> {
    const [row] = await this.sql<{ r: { ok: boolean; reason?: string; approval_id?: string; level?: "B" | "C" } }[]>`
      select fabric.consume_approval(${this.workerId}, ${approvalId}, ${this.sql.json(payload)}::jsonb) as r`;
    const r = row!.r;
    return r.ok ? { ok: true, approvalId: r.approval_id!, level: r.level! } : { ok: false, reason: r.reason! };
  }

  async reserveCost(input: {
    category: string;
    provider: string;
    estimatedCents: number;
    jobId?: string;
    note?: string;
  }): Promise<CostReservation> {
    const [row] = await this.sql<{ r: Record<string, unknown> }[]>`
      select fabric.reserve_cost(${this.workerId}, ${input.category}, ${input.provider}, ${input.estimatedCents},
        ${input.jobId ?? null}::uuid, ${input.note ?? null}) as r`;
    const r = row!.r;
    if (r.allowed) {
      const warnings = (r.warnings as Array<{ category: string; period: string; used_ratio: number }>).map((w) => ({
        category: w.category,
        period: w.period,
        usedRatio: Number(w.used_ratio),
      }));
      return { allowed: true, reservationId: r.reservation_id as string, warnings };
    }
    return { ...r, allowed: false, reason: r.reason as string };
  }

  async settleCost(reservationId: string, actualCents: number): Promise<void> {
    await this.sql`select fabric.settle_cost(${this.workerId}, ${reservationId}, ${actualCents})`;
  }

  async releaseCost(reservationId: string): Promise<void> {
    await this.sql`select fabric.release_cost(${this.workerId}, ${reservationId})`;
  }

  async status(): Promise<Record<string, unknown>> {
    const [row] = await this.sql<{ s: Record<string, unknown> }[]>`select fabric.status_overview() as s`;
    return row!.s;
  }
}
