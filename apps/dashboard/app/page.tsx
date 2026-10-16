type Stage = "Geplant" | "Implementiert" | "Lokal getestet" | "Integration getestet" | "Produktiv";

const modules: Array<{ name: string; stage: Stage; note: string }> = [
  { name: "Unit-Economics-Rechner", stage: "Lokal getestet", note: "Break-even-CPA/-ROAS, Retouren, Gates, Stresstest" },
  { name: "Factory Core (Queue, Freigaben, Budgets, Audit)", stage: "Geplant", note: "M1" },
  { name: "Product Research + Opportunity Cards", stage: "Geplant", note: "M2" },
  { name: "Compliance-Checkliste", stage: "Geplant", note: "M2" },
  { name: "Shopify-Entwürfe mit Freigabe", stage: "Geplant", note: "M3" },
  { name: "Creative Factory", stage: "Geplant", note: "M4" },
  { name: "Meta-Reporting + Kampagnen-Entwürfe", stage: "Geplant", note: "M5" },
];

const stageStyle: Record<Stage, string> = {
  Geplant: "bg-line text-muted",
  Implementiert: "bg-warn-bg text-warn",
  "Lokal getestet": "bg-warn-bg text-warn",
  "Integration getestet": "bg-ok-bg text-ok",
  Produktiv: "bg-ok-bg text-ok",
};

export default function Home() {
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Übersicht</h1>
        <p className="text-muted mt-1 text-sm">
          Meilenstein M0 – Fundament. Noch keine Verbindung zu Shopify, Werbekonten oder Datenbank.
        </p>
      </section>

      <section className="rounded-lg border border-line bg-surface">
        <h2 className="border-b border-line px-4 py-3 font-medium">Module</h2>
        <ul className="divide-y divide-line">
          {modules.map((m) => (
            <li key={m.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <span className="font-medium">{m.name}</span>
              <span className="text-muted text-sm">{m.note}</span>
              <span className={`ml-auto rounded px-2 py-0.5 text-xs font-medium ${stageStyle[m.stage]}`}>
                {m.stage}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
