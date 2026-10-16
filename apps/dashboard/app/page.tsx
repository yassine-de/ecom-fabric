import Link from "next/link";
import { Suspense } from "react";
import { Badge, Card, formatCents, formatDate, Loading, PageTitle } from "@/components/ui";
import { requireOperator } from "@/lib/auth";
import { KillSwitchForm } from "./operator-forms";

type Stage = "Geplant" | "Implementiert" | "Lokal getestet" | "Integration getestet" | "Produktiv";

const modules: Array<{ name: string; stage: Stage; note: string }> = [
  { name: "Unit-Economics-Rechner", stage: "Integration getestet", note: "läuft als Job über die Queue" },
  { name: "Factory Core (Queue, Freigaben, Budgets, Audit)", stage: "Integration getestet", note: "M1" },
  { name: "Dashboard-Login mit MFA + Freigaben", stage: "Implementiert", note: "M1b" },
  { name: "Product Research + Opportunity Cards", stage: "Geplant", note: "M2" },
  { name: "Compliance-Checkliste", stage: "Geplant", note: "M2" },
  { name: "Shopify-Entwürfe mit Freigabe", stage: "Geplant", note: "M3" },
  { name: "Creative Factory", stage: "Geplant", note: "M4" },
  { name: "Meta-Reporting + Kampagnen-Entwürfe", stage: "Geplant", note: "M5" },
];

const stageTone: Record<Stage, "neutral" | "warn" | "ok"> = {
  Geplant: "neutral",
  Implementiert: "warn",
  "Lokal getestet": "warn",
  "Integration getestet": "ok",
  Produktiv: "ok",
};

const jobStatusLabels: Record<string, string> = {
  awaiting_approval: "wartet auf Freigabe",
  queued: "wartend",
  running: "läuft",
  succeeded: "erfolgreich",
  failed: "fehlgeschlagen",
  dead: "aufgegeben",
  cancelled: "abgebrochen",
};

const periodLabels: Record<string, string> = { day: "Tag", month: "Monat" };

interface Overview {
  kill_switch: boolean;
  jobs: Record<string, number>;
  pending_approvals: number;
  active_workers: Array<{ id: string; host: string; last_heartbeat_at: string }>;
  budgets: Array<{ category: string; period: string; limit_cents: number; spent_cents: number }>;
  agents: Array<{ id: string; enabled: boolean }>;
}

export default function Home() {
  return (
    <div className="space-y-6">
      <PageTitle title="Übersicht" subtitle="Live-Zustand der Fabrik (dev-Datenbank)." />
      <Suspense fallback={<Loading />}>
        <LiveOverview />
      </Suspense>
      <Card title="Module">
        <ul className="-my-3 divide-y divide-line">
          {modules.map((m) => (
            <li key={m.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
              <span className="font-medium">{m.name}</span>
              <span className="text-muted text-sm">{m.note}</span>
              <span className="ml-auto">
                <Badge tone={stageTone[m.stage]}>{m.stage}</Badge>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

async function LiveOverview() {
  const { fabric } = await requireOperator();
  const { data, error } = await fabric.rpc("dashboard_overview");
  if (error) return <p className="text-bad text-sm">Übersicht nicht verfügbar: {error.message}</p>;
  const o = data as Overview;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-muted text-sm">Kill-Switch</p>
          <p className={`mt-1 text-xl font-semibold ${o.kill_switch ? "text-bad" : "text-ok"}`}>
            {o.kill_switch ? "AKTIV – Agenten gestoppt" : "aus"}
          </p>
        </Card>
        <Card>
          <p className="text-muted text-sm">Offene Freigaben</p>
          <p className="mt-1 text-xl font-semibold">
            <Link href="/freigaben" className="underline-offset-2 hover:underline">
              {o.pending_approvals}
            </Link>
          </p>
        </Card>
        <Card>
          <p className="text-muted text-sm">Aktive Worker</p>
          <p className="mt-1 text-xl font-semibold">{o.active_workers.length}</p>
          {o.active_workers.map((w) => (
            <p key={w.id} className="text-muted truncate text-xs">
              {w.id} · {formatDate(w.last_heartbeat_at)}
            </p>
          ))}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Budgets (API-Kosten)">
          <ul className="space-y-3">
            {o.budgets.map((b) => {
              const ratio = b.limit_cents > 0 ? Math.min(1, b.spent_cents / b.limit_cents) : 1;
              const tone = ratio >= 1 ? "bg-bad" : ratio >= 0.8 ? "bg-warn" : "bg-ok";
              return (
                <li key={`${b.category}-${b.period}`} className="space-y-1">
                  <div className="flex text-sm">
                    <span>
                      {b.category} / {periodLabels[b.period] ?? b.period}
                    </span>
                    <span className="ml-auto tabular-nums">
                      {formatCents(b.spent_cents)} von {formatCents(b.limit_cents)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded bg-line">
                    <div className={`h-1.5 rounded ${tone}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Jobs">
          {Object.keys(o.jobs).length === 0 ? (
            <p className="text-muted text-sm">Noch keine Jobs.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              {Object.entries(o.jobs).map(([status, n]) => (
                <div key={status} className="contents">
                  <dt className="text-muted">{jobStatusLabels[status] ?? status}</dt>
                  <dd className="text-right tabular-nums">{n}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-muted mt-4 text-xs">
            Aktive Agenten: {o.agents.filter((a) => a.enabled).map((a) => a.id).join(", ")}
          </p>
        </Card>
      </div>

      <Card title="Kill-Switch">
        <p className="text-muted mb-3 text-sm">
          Stoppt sofort Jobübernahme, Ausgaben und das Einlösen von Freigaben. Laufende Jobs werden abgebrochen.
        </p>
        <KillSwitchForm active={o.kill_switch} />
      </Card>
    </div>
  );
}
