/**
 * Ende-zu-Ende über die echte Supabase-Strecke (Auth + Data API + RLS + MFA) mit einem
 * generierten Test-Nutzer. Optional: Dashboard-Seiten mit dieser Session rendern, wenn
 * `npm run dev:dashboard` läuft.
 */
import { randomBytes } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminSql, cleanup, closeAll, env, registeredQueue, runId, testType } from "../../worker/test/helpers";
import type { Sql } from "../../worker/src/db";
import { totp } from "./totp";

const URL = env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const email = `fabric-e2e-${runId}@example.com`;
const password = randomBytes(24).toString("base64url");
const DASHBOARD = "http://localhost:3000";

let admin: Sql;
let userId: string;
let user: SupabaseClient;

const adminHeaders = () => {
  const key = env.SUPABASE_SECRET_KEY!;
  return { apikey: key, "Content-Type": "application/json", ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) };
};

const dashboardRunning = await fetch(`${DASHBOARD}/login`, { redirect: "manual" })
  .then((r) => r.status === 200)
  .catch(() => false);

beforeAll(async () => {
  admin = adminSql();
  const res = await fetch(`${URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`Test-Nutzer konnte nicht angelegt werden: HTTP ${res.status}`);
  userId = ((await res.json()) as { id: string }).id;
  user = createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
});

afterAll(async () => {
  try {
    await cleanup(admin, userId);
  } finally {
    await closeAll();
  }
});

const fabric = () => user.schema("fabric");

describe("Supabase-Strecke: Login → MFA → Operator → Freigabe", () => {
  it("Login mit Passwort ergibt nur aal1 und keine Operator-Rechte", async () => {
    const { data, error } = await user.auth.signInWithPassword({ email, password });
    expect(error).toBeNull();
    expect(data.session).not.toBeNull();
    const who = await fabric().rpc("whoami");
    expect(who.error).toBeNull();
    expect(who.data).toMatchObject({ user_id: userId, aal: "aal1", registered_operator: false });
    const overview = await fabric().rpc("dashboard_overview");
    expect(overview.error?.message).toMatch(/Operatoren/);
  });

  it("auch als Operator ohne MFA: keine Daten, keine Aktionen", async () => {
    await admin`insert into fabric.operators (user_id, display_name) values (${userId}, ${`E2E ${runId}`})`;
    const overview = await fabric().rpc("dashboard_overview");
    expect(overview.error?.message).toMatch(/MFA/);
    const approvals = await fabric().from("approvals").select("id").limit(5);
    expect(approvals.error).toBeNull();
    expect(approvals.data).toEqual([]); // RLS blendet ohne aal2 alles aus
    const kill = await fabric().rpc("set_kill_switch", { p_active: true, p_reason: "e2e" });
    expect(kill.error?.message).toMatch(/MFA/);
  });

  it("TOTP einrichten und bestätigen hebt die Session auf aal2", async () => {
    const enroll = await user.auth.mfa.enroll({ factorType: "totp", friendlyName: `e2e-${runId}` });
    expect(enroll.error).toBeNull();
    const verify = await user.auth.mfa.challengeAndVerify({ factorId: enroll.data!.id, code: totp(enroll.data!.totp.secret) });
    expect(verify.error).toBeNull();
    const aal = await user.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aal.data?.currentLevel).toBe("aal2");
    const who = await fabric().rpc("whoami");
    expect(who.data).toMatchObject({ aal: "aal2", registered_operator: true });
  });

  it("Operator mit MFA sieht die Übersicht und gibt einen Job frei, den der Worker dann ausführt", async () => {
    const overview = await fabric().rpc("dashboard_overview");
    expect(overview.error).toBeNull();
    expect(overview.data).toHaveProperty("kill_switch", false);

    const queue = await registeredQueue("e2e");
    const type = testType("e2e-gated");
    const payload = { demo: true, runId };
    const job = await queue.enqueue({ agentId: "system", type, payload, approval: { level: "B", summary: `E2E ${runId}` } });

    const list = await fabric().from("approvals").select("id, summary, level, status").eq("id", job.approvalId!);
    expect(list.data).toEqual([{ id: job.approvalId, summary: `E2E ${runId}`, level: "B", status: "pending" }]);

    const decide = await fabric().rpc("decide_approval", { p_approval_id: job.approvalId, p_approve: true, p_note: "E2E" });
    expect(decide.error).toBeNull();

    const [claimed] = await queue.claim({ types: [type] });
    expect(claimed?.id).toBe(job.id);
    expect(await queue.consumeApproval(job.approvalId!, payload)).toMatchObject({ ok: true });
    await queue.complete(job.id, { ok: true });

    const audit = await fabric()
      .from("audit_log")
      .select("actor_type, actor_id, action")
      .eq("entity_id", job.approvalId!)
      .order("id");
    expect(audit.data?.map((a) => a.action)).toEqual(["approval.requested", "approval.approved", "approval.consumed"]);
    expect(audit.data?.find((a) => a.action === "approval.approved")).toMatchObject({ actor_type: "human", actor_id: userId });
  });

  it("Stufe C ohne Begründung wird von der Datenbank abgelehnt", async () => {
    const queue = await registeredQueue("e2e-c");
    const approvalId = await queue.requestApproval({ actionType: "test.order", level: "C", summary: "C", payload: {} });
    const res = await fabric().rpc("decide_approval", { p_approval_id: approvalId, p_approve: true, p_note: "" });
    expect(res.error?.message).toMatch(/Begründung/);
  });

  it.skipIf(!dashboardRunning)("Dashboard rendert Übersicht, Freigaben und Audit-Log mit echter Session", async () => {
    const queue = await registeredQueue("e2e-ui");
    const summary = `UI-Check ${runId}`;
    await queue.requestApproval({ actionType: "test.ui", level: "B", summary, payload: { ui: true } });

    // Session-Cookies so erzeugen, wie das Dashboard sie selbst schreibt (@supabase/ssr).
    const { data } = await user.auth.getSession();
    const jar = new Map<string, string>();
    const ssr = createServerClient(URL, PUBLISHABLE, {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (cookies) => cookies.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
      },
    });
    await ssr.auth.setSession({ access_token: data.session!.access_token, refresh_token: data.session!.refresh_token });
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

    const page = async (path: string) => {
      const res = await fetch(`${DASHBOARD}${path}`, { headers: { cookie }, redirect: "manual" });
      return { status: res.status, html: await res.text() };
    };
    const freigaben = await page("/freigaben");
    expect(freigaben.status).toBe(200);
    expect(freigaben.html).toContain(summary);
    expect(freigaben.html).toContain("Freigeben");

    const home = await page("/");
    expect(home.status).toBe(200);
    expect(home.html).toContain("Kill-Switch");
    expect(home.html).toContain("Budgets");

    const audit = await page("/audit");
    expect(audit.status).toBe(200);
    expect(audit.html).toContain("approval.approved");

    const anon = await fetch(`${DASHBOARD}/freigaben`, { redirect: "manual" });
    expect(anon.status).toBe(307);
  });
});
