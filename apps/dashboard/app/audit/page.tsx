import { Suspense } from "react";
import { Badge, Card, formatDate, Loading, PageTitle } from "@/components/ui";
import { requireOperator } from "@/lib/auth";

interface AuditEntry {
  id: number;
  at: string;
  actor_type: "human" | "worker" | "system";
  actor_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  data: Record<string, unknown>;
}

const actorTone = { human: "ok", worker: "neutral", system: "warn" } as const;
const actorLabel = { human: "Mensch", worker: "Worker", system: "System" } as const;

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Audit-Log" subtitle="Die letzten 100 Einträge. Unveränderlich – Einträge können nicht bearbeitet oder gelöscht werden." />
      <Suspense fallback={<Loading />}>
        <AuditList />
      </Suspense>
    </div>
  );
}

async function AuditList() {
  const { fabric } = await requireOperator();
  const { data, error } = await fabric.from("audit_log").select("*").order("id", { ascending: false }).limit(100);
  if (error) return <p className="text-bad text-sm">Audit-Log nicht lesbar: {error.message}</p>;
  const entries = data as AuditEntry[];

  return (
    <Card>
      <ul className="-my-3 divide-y divide-line">
        {entries.map((e) => {
          const details = Object.keys(e.data ?? {}).length ? JSON.stringify(e.data) : "";
          return (
            <li key={e.id} className="space-y-1 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Badge tone={actorTone[e.actor_type]}>{actorLabel[e.actor_type]}</Badge>
                <span className="font-mono text-xs">{e.action}</span>
                {e.entity_type ? (
                  <span className="text-muted break-all text-xs">
                    {e.entity_type} {e.entity_id}
                  </span>
                ) : null}
                <span className="text-muted ml-auto text-xs">{formatDate(e.at)}</span>
              </div>
              <p className="text-muted break-all text-xs">
                {e.actor_id}
                {details ? ` · ${details.length > 240 ? `${details.slice(0, 240)}…` : details}` : ""}
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
