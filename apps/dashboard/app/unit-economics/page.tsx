import { formatEur, formatPct, formatRoas, gateStatusLabels, type GateStatus } from "@ecom-fabric/core";
import { loadProductAnalyses } from "@/lib/products";

const gateStyle: Record<GateStatus, string> = {
  pass: "bg-ok-bg text-ok",
  fail: "bg-bad-bg text-bad",
  incomplete: "bg-warn-bg text-warn",
};

function GateBadge({ status }: { status: GateStatus }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap ${gateStyle[status]}`}>
      {gateStatusLabels[status]}
    </span>
  );
}

export default function UnitEconomicsPage() {
  const products = loadProductAnalyses();

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Unit Economics</h1>
        <p className="text-muted mt-1 text-sm">
          Max. CPA = retourenbereinigter Deckungsbeitrag vor Werbung. Quelle: <code>data/products/*.json</code>
        </p>
      </section>

      {products.map((p) =>
        !p.ok ? (
          <section key={p.file} className="rounded-lg border border-bad bg-bad-bg p-4 text-sm text-bad">
            <strong>{p.file}:</strong> {p.error}
          </section>
        ) : (
          <section key={p.file} className="rounded-lg border border-line bg-surface">
            <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <h2 className="font-medium">{p.analysis.product.name}</h2>
              <span className="ml-auto">
                <GateBadge status={p.analysis.gates.status} />
              </span>
            </header>
            <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
              {p.analysis.results.map(({ ue }) => {
                const gate = p.analysis.gates.offers.find((g) => g.offerId === ue.offerId)!;
                const q = ue.dataQuality;
                return (
                  <article key={ue.offerId} className="space-y-3 bg-surface p-4">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{ue.name}</h3>
                      <span className="ml-auto">
                        <GateBadge status={gate.status} />
                      </span>
                    </div>
                    <dl className="grid grid-cols-2 gap-y-1 text-sm">
                      <dt className="text-muted">Bestellwert brutto</dt>
                      <dd className="text-right tabular-nums">{formatEur(ue.grossOrderValue)}</dd>
                      <dt className="text-muted">Nettoerlös</dt>
                      <dd className="text-right tabular-nums">{formatEur(ue.netRevenue)}</dd>
                      <dt className="text-muted">DB-Quote</dt>
                      <dd className="text-right tabular-nums">{formatPct(ue.contributionMarginRate)}</dd>
                      <dt className="font-medium">Max. CPA</dt>
                      <dd className="text-right font-semibold tabular-nums">{formatEur(ue.maxCpa)}</dd>
                      <dt className="text-muted">Break-even-ROAS</dt>
                      <dd className="text-right tabular-nums">{formatRoas(ue.breakEvenRoasGross)}</dd>
                    </dl>
                    <ul className="space-y-0.5 text-xs">
                      {gate.checks.map((c) => (
                        <li key={c.id} className={c.passed ? "text-ok" : "text-bad"}>
                          {c.passed ? "✓" : "✗"} {c.label} · Ist {c.detail}
                        </li>
                      ))}
                    </ul>
                    <p className="text-muted text-xs">
                      {q.byKind.fact.length} Fakten · {q.byKind.estimate.length} Schätzungen ·{" "}
                      {q.byKind.assumption.length} Annahmen · {q.missing.length} fehlend
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        ),
      )}
    </div>
  );
}
