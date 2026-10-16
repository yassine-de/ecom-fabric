import { Suspense } from "react";
import { Badge, Card, formatCents, formatDate, Loading, PageTitle } from "@/components/ui";
import { requireOperator } from "@/lib/auth";
import { ApprovalDecisionForm } from "../operator-forms";

interface Approval {
  id: string;
  action_type: string;
  level: "B" | "C";
  summary: string;
  payload: unknown;
  payload_hash: string;
  cost_estimate_cents: number;
  requested_by: string;
  status: "pending" | "approved" | "rejected" | "expired" | "executed";
  decided_at: string | null;
  decision_note: string | null;
  expires_at: string;
  executed_at: string | null;
  created_at: string;
}

const statusTone = { pending: "warn", approved: "ok", executed: "ok", rejected: "bad", expired: "neutral" } as const;
const statusLabel = {
  pending: "offen",
  approved: "freigegeben",
  executed: "ausgeführt",
  rejected: "abgelehnt",
  expired: "abgelaufen",
} as const;

export default function ApprovalsPage() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Freigaben"
        subtitle="Stufe B: vorbereitet, wartet auf dich · Stufe C: Ausgaben, Bestellungen, Verträge – nur mit Begründung."
      />
      <Suspense fallback={<Loading />}>
        <ApprovalLists />
      </Suspense>
    </div>
  );
}

async function ApprovalLists() {
  const { fabric } = await requireOperator();
  const [pending, recent] = await Promise.all([
    fabric
      .from("approvals")
      .select("*")
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true }),
    fabric.from("approvals").select("*").neq("status", "pending").order("created_at", { ascending: false }).limit(20),
  ]);
  if (pending.error || recent.error) {
    return <p className="text-bad text-sm">Freigaben nicht lesbar: {(pending.error ?? recent.error)!.message}</p>;
  }
  const open = pending.data as Approval[];
  const done = recent.data as Approval[];

  return (
    <div className="space-y-6">
      {open.length === 0 ? (
        <Card>
          <p className="text-muted text-sm">Keine offenen Freigaben.</p>
        </Card>
      ) : (
        open.map((a) => (
          <Card
            key={a.id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={a.level === "C" ? "bad" : "warn"}>Stufe {a.level}</Badge>
                {a.summary}
              </span>
            }
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted">Aktion</dt>
                <dd className="break-all font-mono text-xs leading-5">{a.action_type}</dd>
                <dt className="text-muted">Angefordert von</dt>
                <dd className="break-all">{a.requested_by}</dd>
                <dt className="text-muted">Geschätzte Kosten</dt>
                <dd>{formatCents(a.cost_estimate_cents)}</dd>
                <dt className="text-muted">Erstellt</dt>
                <dd>{formatDate(a.created_at)}</dd>
                <dt className="text-muted">Läuft ab</dt>
                <dd>{formatDate(a.expires_at)}</dd>
                <dt className="text-muted">Payload-Hash</dt>
                <dd className="font-mono text-xs leading-5">{a.payload_hash.slice(0, 16)}…</dd>
              </dl>
              <ApprovalDecisionForm approvalId={a.id} level={a.level} />
            </div>
            <details className="mt-4 text-sm">
              <summary className="text-muted cursor-pointer">Genaue Daten der Aktion (Payload)</summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded bg-background p-3 font-mono text-xs">
                {JSON.stringify(a.payload, null, 2)}
              </pre>
              <p className="text-muted mt-1 text-xs">
                Ausgeführt wird exakt dieser Inhalt – jede Änderung macht die Freigabe ungültig.
              </p>
            </details>
          </Card>
        ))
      )}

      <Card title="Zuletzt entschieden">
        {done.length === 0 ? (
          <p className="text-muted text-sm">Noch keine Entscheidungen.</p>
        ) : (
          <ul className="-my-3 divide-y divide-line">
            {done.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
                <Badge tone={statusTone[a.status]}>{statusLabel[a.status]}</Badge>
                <span>Stufe {a.level}</span>
                <span className="font-medium">{a.summary}</span>
                {a.decision_note ? <span className="text-muted">„{a.decision_note}“</span> : null}
                <span className="text-muted ml-auto text-xs">{formatDate(a.decided_at ?? a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
