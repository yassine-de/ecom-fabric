import { provenanceLabels, type MaybeDataPoint } from "../provenance";
import { calculateUnitEconomics, type UnitEconomics } from "./calculate";
import { defaultGateThresholds, evaluateProductGates, type GateStatus, type GateThresholds } from "./gates";
import { offerCostFieldLabels, offerCostFields, type OfferInput, type ResolvedProduct } from "./schema";
import { runSensitivity } from "./sensitivity";

const eurFmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const numFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const pctFmt = new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 });

export const formatEur = (n: number) => eurFmt.format(n);
export const formatRoas = (n: number) => (Number.isFinite(n) ? numFmt.format(n) : "∞ (nicht erreichbar)");
export const formatPct = (n: number) => pctFmt.format(n);

export const gateStatusLabels: Record<GateStatus, string> = {
  pass: "BESTANDEN",
  fail: "NICHT BESTANDEN",
  incomplete: "UNVOLLSTÄNDIG (fehlende Daten)",
};

const isRateField = (f: string) => /Rate|Percent/.test(f);

function formatInput(field: string, dp: MaybeDataPoint): string {
  if (dp === null) return "— | fehlt";
  const value = isRateField(field) ? formatPct(dp.value) : formatEur(dp.value);
  const note = dp.source ?? dp.note ?? "";
  return `${value} | ${provenanceLabels[dp.kind]}${note ? ` – ${note}` : ""}`;
}

export interface ProductAnalysis {
  product: ResolvedProduct["product"];
  results: Array<{ offer: OfferInput; ue: UnitEconomics }>;
  gates: ReturnType<typeof evaluateProductGates>;
}

export function analyzeProduct(
  resolved: ResolvedProduct,
  thresholds: GateThresholds = defaultGateThresholds,
): ProductAnalysis {
  const results = resolved.offers.map((offer) => ({ offer, ue: calculateUnitEconomics(offer) }));
  const gates = evaluateProductGates(
    results.map((r) => r.ue),
    thresholds,
  );
  return { product: resolved.product, results, gates };
}

/** Markdown-Bericht auf Deutsch, inkl. Datenherkunft und Stresstest. */
export function renderProductReport(analysis: ProductAnalysis, generatedAt = new Date()): string {
  const { product, results, gates } = analysis;
  const lines: string[] = [];
  lines.push(`# Unit Economics – ${product.name}`);
  lines.push("");
  lines.push(`Erstellt: ${generatedAt.toISOString().slice(0, 10)} · Produkt-ID: \`${product.id}\``);
  lines.push("");
  lines.push(`**Gate-Ergebnis Produkt: ${gateStatusLabels[gates.status]}** (bestes Angebot: \`${gates.bestOfferId}\`)`);
  lines.push("");
  if (product.notes?.length) {
    for (const n of product.notes) lines.push(`> ${n}`);
    lines.push("");
  }

  lines.push("## Übersicht je Angebot");
  lines.push("");
  lines.push(
    "| Angebot | Bestellwert brutto | Nettoerlös | Kosten (behalten) | DB behalten | Verlust je Retoure | **DB vor Werbung (retourenbereinigt) = max. CPA** | DB-Quote | Break-even-ROAS brutto | Gate |",
  );
  lines.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const { ue } of results) {
    const gate = gates.offers.find((g) => g.offerId === ue.offerId)!;
    lines.push(
      `| ${ue.name} | ${formatEur(ue.grossOrderValue)} | ${formatEur(ue.netRevenue)} | ${formatEur(ue.costs.total)} | ${formatEur(ue.contributionIfKept)} | ${formatEur(ue.lossIfReturned)} | **${formatEur(ue.maxCpa)}** | ${formatPct(ue.contributionMarginRate)} | ${formatRoas(ue.breakEvenRoasGross)} | ${gateStatusLabels[gate.status]} |`,
    );
  }
  lines.push("");

  for (const { offer, ue } of results) {
    const gate = gates.offers.find((g) => g.offerId === ue.offerId)!;
    lines.push(`## ${ue.name}`);
    lines.push("");
    lines.push("**Kosten je behaltener Bestellung (netto)**");
    lines.push("");
    lines.push("| Posten | Betrag |");
    lines.push("|---|---|");
    lines.push(`| Ware inkl. Import (${ue.units} Stk.) | ${formatEur(ue.costs.product)} |`);
    lines.push(`| Versand | ${formatEur(ue.costs.outboundShipping)} |`);
    lines.push(`| Verpackung | ${formatEur(ue.costs.packaging)} |`);
    lines.push(`| Fulfillment/Handling | ${formatEur(ue.costs.fulfillmentHandling)} |`);
    lines.push(`| Zahlungsgebühr | ${formatEur(ue.costs.paymentFee)} |`);
    lines.push(`| Sonstiges | ${formatEur(ue.costs.otherVariableCosts)} |`);
    lines.push(`| **Summe** | **${formatEur(ue.costs.total)}** |`);
    lines.push("");
    lines.push("**Gates**");
    lines.push("");
    for (const c of gate.checks) lines.push(`- ${c.passed ? "✅" : "❌"} ${c.label} – Ist: ${c.detail}`);
    lines.push("");
    lines.push("**Stresstest (max. CPA)**");
    lines.push("");
    lines.push("| Szenario | max. CPA | Δ | Break-even-ROAS |");
    lines.push("|---|---|---|---|");
    for (const s of runSensitivity(offer)) {
      lines.push(
        `| ${s.label} | ${formatEur(s.maxCpa)} | ${formatEur(s.deltaMaxCpa)} | ${formatRoas(s.breakEvenRoasGross)} |`,
      );
    }
    lines.push("");
    lines.push("**Eingabedaten und Herkunft**");
    lines.push("");
    lines.push("| Feld | Wert | Herkunft |");
    lines.push("|---|---|---|");
    lines.push(`| ${offerCostFieldLabels.grossPrice} | ${formatInput("grossPrice", offer.grossPrice)} |`);
    for (const f of offerCostFields) lines.push(`| ${offerCostFieldLabels[f]} | ${formatInput(f, offer[f])} |`);
    lines.push("");
    const q = ue.dataQuality;
    lines.push(
      `Datenqualität: ${q.byKind.fact.length} Fakten, ${q.byKind.estimate.length} Schätzungen, ${q.byKind.assumption.length} Annahmen, ${q.missing.length} fehlend${q.missing.length ? ` (${q.missing.map((m) => offerCostFieldLabels[m]).join(", ")})` : ""}.`,
    );
    lines.push("");
  }

  lines.push("---");
  lines.push(
    "Methodik: Preise brutto, Kosten netto (Regelbesteuerung). Retouren = vollständiger Widerruf: Erlös erstattet, Versand/Verpackung/Gebühren versunken, Ware anteilig wiederverkaufbar. Max. CPA = retourenbereinigter Deckungsbeitrag vor Werbung (Break-even). Fixkosten (Software, Abos) sind nicht enthalten.",
  );
  return lines.join("\n");
}
