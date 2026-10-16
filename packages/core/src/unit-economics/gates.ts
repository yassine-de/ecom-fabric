import type { UnitEconomics } from "./calculate";

/** Startwerte aus Phase 0 (docs/00-phase-0-strategie.md, Abschnitt 12). Nach ersten Tests kalibrieren. */
export interface GateThresholds {
  minContributionBeforeAds: number;
  minContributionMarginRate: number;
  maxBreakEvenRoasGross: number;
  minOrderValueGross: number;
}

export const defaultGateThresholds: GateThresholds = {
  minContributionBeforeAds: 12,
  minContributionMarginRate: 0.4,
  maxBreakEvenRoasGross: 2.5,
  minOrderValueGross: 30,
};

export type GateStatus = "pass" | "fail" | "incomplete";

export interface GateCheck {
  id: "contribution" | "breakEvenRoas" | "orderValue";
  label: string;
  passed: boolean;
  detail: string;
}

export interface OfferGateResult {
  offerId: string;
  status: GateStatus;
  checks: GateCheck[];
}

const eur = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const pct = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 }).format(n);
const dec = (n: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export function evaluateOfferGates(
  ue: UnitEconomics,
  t: GateThresholds = defaultGateThresholds,
): OfferGateResult {
  const contributionOk =
    ue.contributionBeforeAds >= t.minContributionBeforeAds ||
    ue.contributionMarginRate >= t.minContributionMarginRate;
  const checks: GateCheck[] = [
    {
      id: "contribution",
      label: `DB vor Werbung ≥ ${eur(t.minContributionBeforeAds)} oder ≥ ${pct(t.minContributionMarginRate)}`,
      passed: contributionOk,
      detail: `${eur(ue.contributionBeforeAds)} / ${pct(ue.contributionMarginRate)}`,
    },
    {
      id: "breakEvenRoas",
      label: `Break-even-ROAS (brutto) ≤ ${dec(t.maxBreakEvenRoasGross)}`,
      passed: ue.breakEvenRoasGross <= t.maxBreakEvenRoasGross,
      detail: Number.isFinite(ue.breakEvenRoasGross) ? dec(ue.breakEvenRoasGross) : "∞",
    },
    {
      id: "orderValue",
      label: `Bestellwert brutto ≥ ${eur(t.minOrderValueGross)}`,
      passed: ue.grossOrderValue >= t.minOrderValueGross,
      detail: eur(ue.grossOrderValue),
    },
  ];
  const allPassed = checks.every((c) => c.passed);
  // Fehlende Kosten zählen als 0 – ein Bestehen ist dann nicht belastbar, ein Scheitern schon.
  const status: GateStatus = !allPassed ? "fail" : ue.dataQuality.complete ? "pass" : "incomplete";
  return { offerId: ue.offerId, status, checks };
}

export interface ProductGateResult {
  status: GateStatus;
  offers: OfferGateResult[];
  /** Angebot mit dem höchsten DB vor Werbung. */
  bestOfferId: string;
}

/** Ein Produkt besteht, wenn mindestens ein Angebot (z. B. ein Bundle) alle Gates besteht. */
export function evaluateProductGates(
  ues: UnitEconomics[],
  t: GateThresholds = defaultGateThresholds,
): ProductGateResult {
  if (ues.length === 0) throw new Error("Keine Angebote übergeben");
  const offers = ues.map((ue) => evaluateOfferGates(ue, t));
  const best = ues.reduce((a, b) => (b.contributionBeforeAds > a.contributionBeforeAds ? b : a));
  const status: GateStatus = offers.some((o) => o.status === "pass")
    ? "pass"
    : offers.some((o) => o.status === "incomplete")
      ? "incomplete"
      : "fail";
  return { status, offers, bestOfferId: best.offerId };
}
