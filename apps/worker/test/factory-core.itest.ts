import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertWorkerRole, type Sql } from "../src/db";
import { defaultHandlers, PermanentJobError } from "../src/handlers";
import { FabricQueue } from "../src/queue";
import { runWorker } from "../src/runner";
import {
  adminSql,
  asUser,
  cleanup,
  closeAll,
  createTestOperator,
  registeredQueue,
  runId,
  testCategory,
  testType,
  testWorkerId,
  sharedWorkerSql,
  withWorkerClients,
} from "./helpers";

let admin: Sql;
let operatorId: string;
let worker: Sql;

beforeAll(async () => {
  admin = adminSql();
  operatorId = await createTestOperator(admin);
  worker = sharedWorkerSql();
});

afterAll(async () => {
  try {
    await asUser(admin, operatorId, (tx) => tx`select fabric.set_kill_switch(false, 'Testende')`);
    await cleanup(admin, operatorId);
  } finally {
    await closeAll();
  }
});

const expectDenied = async (p: Promise<unknown>, pattern: RegExp = /permission denied|Operatoren|insufficient/i) =>
  expect(p).rejects.toThrow(pattern);

describe("Worker-Rolle ist eingeschränkt", () => {
  it("läuft als fabric_worker", async () => {
    await expect(assertWorkerRole(worker)).resolves.toBeUndefined();
    await expect(assertWorkerRole(admin)).rejects.toThrow(/verweigert Start/);
  });

  it("hat keinen direkten Tabellenzugriff", async () => {
    await expectDenied(worker`select * from fabric.jobs limit 1`);
    await expectDenied(worker`update fabric.approvals set status = 'approved'`);
    await expectDenied(worker`insert into fabric.audit_log (actor_type, actor_id, action) values ('human', 'x', 'fake')`);
    await expectDenied(worker`delete from fabric.budgets`);
  });

  it("kann keine Freigaben erteilen, auch nicht mit gefälschter Identität", async () => {
    const queue = await registeredQueue("rights");
    const approvalId = await queue.requestApproval({
      actionType: "test.publish",
      level: "B",
      summary: "Test",
      payload: { x: 1 },
    });
    await expectDenied(worker`select fabric.decide_approval(${approvalId}, true, 'selbst')`);
    await expectDenied(worker.unsafe("set role authenticated"), /permission denied/i);
    await expectDenied(
      worker.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: operatorId, role: "authenticated" })}, true)`;
        await tx`select fabric.decide_approval(${approvalId}, true, 'gefälscht')`;
      }),
    );
    await expectDenied(worker`select fabric.set_kill_switch(true, 'x')`);
    await expectDenied(worker`select fabric.set_budget('llm', 'day', 999999, 0.8)`);
    await expectDenied(worker`select fabric.set_agent_enabled('shopify', true)`);
  });
});

describe("Menschliche Freigaben", () => {
  it("nur Operatoren dürfen entscheiden, angemeldete Nicht-Operatoren nicht", async () => {
    const queue = await registeredQueue("human");
    const approvalId = await queue.requestApproval({ actionType: "test.x", level: "B", summary: "x", payload: {} });
    await expectDenied(
      asUser(admin, "00000000-0000-4000-8000-000000000000", (tx) => tx`select fabric.decide_approval(${approvalId}, true, null)`),
      /Operatoren/,
    );
  });

  it("selbst Admins können ohne Operator-Identität nicht freigeben (Trigger)", async () => {
    const queue = await registeredQueue("admin");
    const approvalId = await queue.requestApproval({ actionType: "test.x", level: "B", summary: "x", payload: {} });
    await expectDenied(
      admin`update fabric.approvals set status = 'approved', decided_by = ${operatorId} where id = ${approvalId}`,
      /Operator/,
    );
  });

  it("Operatoren brauchen MFA (aal2) für Entscheidungen und zum Lesen", async () => {
    const queue = await registeredQueue("mfa");
    const approvalId = await queue.requestApproval({ actionType: "test.x", level: "B", summary: "x", payload: {} });
    await expectDenied(
      asUser(admin, operatorId, (tx) => tx`select fabric.decide_approval(${approvalId}, true, 'ohne MFA')`, "aal1"),
      /MFA/,
    );
    const visibleAal1 = await asUser(admin, operatorId, (tx) => tx`select count(*)::int as n from fabric.approvals where id = ${approvalId}`, "aal1");
    const visibleAal2 = await asUser(admin, operatorId, (tx) => tx`select count(*)::int as n from fabric.approvals where id = ${approvalId}`);
    expect(visibleAal1[0]?.n).toBe(0);
    expect(visibleAal2[0]?.n).toBe(1);
    const [who] = await asUser(admin, operatorId, (tx) => tx`select fabric.whoami() as w`, "aal1");
    expect(who?.w).toMatchObject({ user_id: operatorId, aal: "aal1", registered_operator: true });
    await expectDenied(asUser(admin, operatorId, (tx) => tx`select fabric.dashboard_overview()`, "aal1"), /MFA/);
    const [overview] = await asUser(admin, operatorId, (tx) => tx`select fabric.dashboard_overview() as o`);
    expect(overview?.o).toHaveProperty("kill_switch", false);
  });

  it("Stufe C braucht eine ausdrückliche Begründung", async () => {
    const queue = await registeredQueue("levelc");
    const approvalId = await queue.requestApproval({ actionType: "test.buy", level: "C", summary: "x", payload: {} });
    await expect(
      asUser(admin, operatorId, (tx) => tx`select fabric.decide_approval(${approvalId}, true, '')`),
    ).rejects.toThrow(/Begründung/);
    await asUser(admin, operatorId, (tx) => tx`select fabric.decide_approval(${approvalId}, true, 'Testkauf genehmigt')`);
  });
});

describe("Job-Queue", () => {
  it("vergibt bei 4 parallelen Workern jeden Job genau einmal", async () => {
    const type = testType("parallel");
    const producer = await registeredQueue("producer");
    const N = 40;
    const ids = new Set<string>();
    for (let i = 0; i < N; i++) ids.add((await producer.enqueue({ agentId: "system", type, payload: { i } })).id);

    const claims = await withWorkerClients(4, async (clients) => {
      const workers = await Promise.all(clients.map((c, n) => registeredQueue(`par${n}`, c)));
      return Promise.all(
        workers.map(async (q) => {
          const got: string[] = [];
          for (;;) {
            const jobs = await q.claim({ limit: 3, types: [type] });
            if (jobs.length === 0) break;
            got.push(...jobs.map((j) => j.id));
          }
          return got;
        }),
      );
    });
    const all = claims.flat();
    expect(all).toHaveLength(N);
    expect(new Set(all)).toEqual(ids);
    expect(claims.filter((c) => c.length > 0).length).toBeGreaterThan(1); // tatsächlich verteilt
  });

  it("ist idempotent beim Einstellen", async () => {
    const queue = await registeredQueue("idem");
    const key = `test-${runId}-idem`;
    const a = await queue.enqueue({ agentId: "system", type: testType("idem"), idempotencyKey: key, payload: { v: 1 } });
    const b = await queue.enqueue({ agentId: "system", type: testType("idem"), idempotencyKey: key, payload: { v: 2 } });
    expect(b.id).toBe(a.id);
    expect(b.payload).toEqual({ v: 1 });
  });

  it("verweigert Jobs für deaktivierte Agenten", async () => {
    const queue = await registeredQueue("disabled");
    await expect(queue.enqueue({ agentId: "shopify", type: testType("x") })).rejects.toThrow(/deaktiviert/);
  });

  it("übernimmt Jobs abgelaufener Leases und verwirft das Ergebnis des alten Workers (Fencing)", async () => {
    const type = testType("lease");
    const a = await registeredQueue("leaseA");
    const b = await registeredQueue("leaseB");
    const job = await a.enqueue({ agentId: "system", type });
    const [claimedA] = await a.claim({ types: [type], leaseSeconds: 5 });
    expect(claimedA?.id).toBe(job.id);
    expect(await b.claim({ types: [type] })).toHaveLength(0);

    await new Promise((r) => setTimeout(r, 6000));
    const [claimedB] = await b.claim({ types: [type] });
    expect(claimedB?.id).toBe(job.id);
    expect(claimedB?.attempts).toBe(2);
    await expect(a.complete(job.id, { from: "A" })).rejects.toThrow(/nicht \(mehr\)/);
    const done = await b.complete(job.id, { from: "B" });
    expect(done.status).toBe("succeeded");
    expect(done.result).toEqual({ from: "B" });
  });

  it("wiederholt mit Backoff und markiert erschöpfte Jobs als dead", async () => {
    const type = testType("retry");
    const queue = await registeredQueue("retry");
    const job = await queue.enqueue({ agentId: "system", type, maxAttempts: 2 });

    await queue.claim({ types: [type] });
    const retried = await queue.fail(job.id, "Fehler 1");
    expect(retried.status).toBe("queued");
    expect(retried.runAt.getTime() - Date.now()).toBeGreaterThan(20_000); // Standard-Backoff 30 s
    expect(await queue.claim({ types: [type] })).toHaveLength(0);

    await admin`update fabric.jobs set run_at = now() where id = ${job.id}`;
    await queue.claim({ types: [type] });
    const dead = await queue.fail(job.id, "Fehler 2");
    expect(dead.status).toBe("dead");
    expect(dead.errors.map((e) => e.error)).toEqual(["Fehler 1", "Fehler 2"]);
  });

  it("bricht nicht wiederholbare Fehler sofort ab", async () => {
    const type = testType("permanent");
    const queue = await registeredQueue("permanent");
    const job = await queue.enqueue({ agentId: "system", type, maxAttempts: 5 });
    await queue.claim({ types: [type] });
    expect((await queue.fail(job.id, "ungültig", { retryable: false })).status).toBe("failed");
  });
});

describe("Freigabe-Gate für Jobs und externe Aktionen", () => {
  it("Job wartet auf Freigabe, ist danach ausführbar und die Freigabe nur einmal einlösbar", async () => {
    const type = testType("gated");
    const queue = await registeredQueue("gate");
    const payload = { productId: "spingrip", price: 29.9 };
    const job = await queue.enqueue({
      agentId: "system",
      type,
      payload,
      approval: { level: "B", summary: "Produkt veröffentlichen" },
    });
    expect(job.status).toBe("awaiting_approval");
    expect(await queue.claim({ types: [type] })).toHaveLength(0);

    await asUser(admin, operatorId, (tx) => tx`select fabric.decide_approval(${job.approvalId}, true, 'ok')`);
    const [claimed] = await queue.claim({ types: [type] });
    expect(claimed?.id).toBe(job.id);

    expect(await queue.consumeApproval(job.approvalId!, { ...payload, price: 19.9 })).toEqual({
      ok: false,
      reason: "payload_mismatch",
    });
    expect(await queue.consumeApproval(job.approvalId!, payload)).toMatchObject({ ok: true, level: "B" });
    expect(await queue.consumeApproval(job.approvalId!, payload)).toEqual({ ok: false, reason: "already_executed" });
  });

  it("abgelehnte Freigabe bricht den Job ab", async () => {
    const queue = await registeredQueue("reject");
    const job = await queue.enqueue({
      agentId: "system",
      type: testType("rejected"),
      approval: { level: "B", summary: "x" },
    });
    await asUser(admin, operatorId, (tx) => tx`select fabric.decide_approval(${job.approvalId}, false, 'nein')`);
    expect(await queue.consumeApproval(job.approvalId!, {})).toEqual({ ok: false, reason: "not_approved:rejected" });
    const [row] = await admin<{ status: string }[]>`select status from fabric.jobs where id = ${job.id}`;
    expect(row?.status).toBe("cancelled");
  });

  it("abgelaufene Freigaben verfallen samt Job", async () => {
    const type = testType("expiring");
    const queue = await registeredQueue("expire");
    const job = await queue.enqueue({ agentId: "system", type, approval: { level: "B", summary: "x" } });
    await admin`update fabric.approvals set expires_at = now() - interval '1 second' where id = ${job.approvalId}`;
    await queue.claim({ types: [type] }); // löst reap() aus
    const [row] = await admin<{ status: string; a: string }[]>`
      select j.status, a.status as a from fabric.jobs j join fabric.approvals a on a.id = j.approval_id where j.id = ${job.id}`;
    expect(row).toEqual({ status: "cancelled", a: "expired" });
  });
});

describe("Budget-Kontrolle", () => {
  it("verweigert Ausgaben ohne Budget (fail closed)", async () => {
    const queue = await registeredQueue("nobudget");
    expect(await queue.reserveCost({ category: `${testCategory}x`, provider: "test", estimatedCents: 1 })).toMatchObject({
      allowed: false,
      reason: "no_budget",
    });
  });

  it("hält das Limit auch bei parallelen Reservierungen ein und warnt ab 80 %", async () => {
    await asUser(admin, operatorId, (tx) => tx`select fabric.set_budget(${testCategory}, 'day', 100, 0.8)`);
    const results = await withWorkerClients(5, async (clients) => {
      const queues = await Promise.all(clients.map((c, n) => registeredQueue(`budget${n}`, c)));
      return Promise.all(
        queues.flatMap((q) => [1, 2].map(() => q.reserveCost({ category: testCategory, provider: "test", estimatedCents: 30 }))),
      );
    });
    const queue = await registeredQueue("budget-main");
    const allowed = results.filter((r) => r.allowed);
    expect(allowed).toHaveLength(3); // 3 × 30 = 90 ≤ 100, die vierte wäre 120
    expect(results.filter((r) => !r.allowed).every((r) => !r.allowed && r.reason === "budget_exceeded")).toBe(true);
    expect(allowed.some((r) => r.allowed && r.warnings.length > 0)).toBe(true);

    // Freigegebene Reservierung macht Budget wieder frei; tatsächliche Kosten zählen nach Abrechnung.
    const first = allowed[0]!;
    if (!first.allowed) throw new Error("unreachable");
    await queue.releaseCost(first.reservationId);
    const again = await queue.reserveCost({ category: testCategory, provider: "test", estimatedCents: 10 });
    expect(again.allowed).toBe(true);
    if (again.allowed) await queue.settleCost(again.reservationId, 12);
  });
});

describe("Kill-Switch", () => {
  it("stoppt Job-Übernahme, Ausgaben und das Einlösen von Freigaben", async () => {
    const type = testType("kill");
    const queue = await registeredQueue("kill");
    await queue.enqueue({ agentId: "system", type });
    await asUser(admin, operatorId, (tx) => tx`select fabric.set_kill_switch(true, 'Integrationstest')`);
    try {
      expect(await queue.claim({ types: [type] })).toHaveLength(0);
      expect(await queue.reserveCost({ category: testCategory, provider: "test", estimatedCents: 1 })).toMatchObject({
        allowed: false,
        reason: "kill_switch",
      });
      expect((await queue.heartbeat([])).killSwitch).toBe(true);
    } finally {
      await asUser(admin, operatorId, (tx) => tx`select fabric.set_kill_switch(false, 'Integrationstest Ende')`);
    }
    expect(await queue.claim({ types: [type] })).toHaveLength(1);
  });
});

describe("Audit-Log", () => {
  it("ist append-only – auch für Admins", async () => {
    await expect(admin`update fabric.audit_log set action = 'manipuliert' where id = (select max(id) from fabric.audit_log)`).rejects.toThrow(
      /unveränderlich/,
    );
    await expect(admin`delete from fabric.audit_log where id = (select max(id) from fabric.audit_log)`).rejects.toThrow(
      /unveränderlich/,
    );
  });

  it("protokolliert Freigabe-Entscheidungen mit menschlichem Akteur", async () => {
    const rows = await admin<{ actor_type: string; actor_id: string }[]>`
      select actor_type, actor_id from fabric.audit_log where action = 'approval.approved' and actor_id = ${operatorId}`;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.actor_type === "human")).toBe(true);
  });
});

describe("Worker-Runner (Ende-zu-Ende)", () => {
  it("verarbeitet Jobs, wiederholt Fehler und rechnet die SpinGrip-Analyse", async () => {
    const echo = testType("echo");
    const flaky = testType("flaky");
    const broken = testType("broken");
    const queue = await registeredQueue("runner");
    let flakyCalls = 0;
    const handlers = {
      ...defaultHandlers,
      [echo]: defaultHandlers["system.echo"]!,
      [flaky]: async () => {
        flakyCalls++;
        throw new Error("vorübergehend");
      },
      [broken]: async () => {
        throw new PermanentJobError("kaputt");
      },
    };
    const productFile = JSON.parse(readFileSync("data/products/spingrip.json", "utf8"));
    const ue = await queue.enqueue({ agentId: "unit-economics", type: "unit-economics.analyze", payload: productFile });
    await queue.enqueue({ agentId: "system", type: echo, payload: { hallo: "welt" } });
    await queue.enqueue({ agentId: "system", type: flaky, maxAttempts: 3 });
    await queue.enqueue({ agentId: "system", type: broken });

    const stats = await runWorker(
      { queue, handlers, types: [echo, flaky, broken, "unit-economics.analyze"], concurrency: 2, once: true },
      new AbortController().signal,
    );
    expect(stats).toMatchObject({ claimed: 4, succeeded: 2, failed: 2, fenced: 0 });
    expect(flakyCalls).toBe(1); // zweiter Versuch erst nach Backoff

    const [row] = await admin<{ status: string; result: { gateStatus: string; offers: Array<{ maxCpa: number }> } }[]>`
      select status, result from fabric.jobs where id = ${ue.id}`;
    expect(row?.status).toBe("succeeded");
    expect(row?.result.gateStatus).toBe("fail");
    expect(row?.result.offers.map((o) => o.maxCpa)).toEqual([6.61, 10.98, 15.35]);
  });

  it("gibt Jobs beim Stoppen eines Workers wieder frei", async () => {
    const type = testType("stop");
    const queue = await registeredQueue("stopper");
    const job = await queue.enqueue({ agentId: "system", type });
    await queue.claim({ types: [type] });
    expect(await queue.stop()).toBe(1);
    const other = await registeredQueue("stopper2");
    const [again] = await other.claim({ types: [type] });
    expect(again?.id).toBe(job.id);
    expect(testWorkerId("stopper2")).toContain(runId);
  });
});

// Kompiliert sicherstellen, dass FabricQueue direkt konstruierbar bleibt (wird von CLI genutzt).
void FabricQueue;
