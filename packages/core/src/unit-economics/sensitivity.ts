import type { MaybeDataPoint } from "../provenance";
import { calculateUnitEconomics } from "./calculate";
import type { OfferInput } from "./schema";

export interface Scenario {
  id: string;
  label: string;
  apply: (offer: OfferInput) => OfferInput;
}

export interface ScenarioResult {
  id: string;
  label: string;
  maxCpa: number;
  deltaMaxCpa: number;
  breakEvenRoasGross: number;
}

const map = (dp: MaybeDataPoint, fn: (n: number) => number): MaybeDataPoint =>
  dp === null ? null : { ...dp, value: fn(dp.value) };

/** Standard-Stresstests für Schätzungen: Wie empfindlich reagiert der max. CPA? */
export const defaultScenarios: Scenario[] = [
  {
    id: "cogs+25",
    label: "Einkauf inkl. Import +25 %",
    apply: (o) => ({
      ...o,
      unitCost: map(o.unitCost, (n) => n * 1.25),
      inboundCostPerUnit: map(o.inboundCostPerUnit, (n) => n * 1.25),
    }),
  },
  {
    id: "shipping+1",
    label: "Versandkosten +1 €",
    apply: (o) => ({ ...o, outboundShipping: map(o.outboundShipping, (n) => n + 1) }),
  },
  {
    id: "returns*2",
    label: "Retourenquote verdoppelt",
    apply: (o) => ({ ...o, returnRate: map(o.returnRate, (n) => Math.min(1, n * 2)) }),
  },
  {
    id: "discount10",
    label: "10 % Rabatt auf den Preis",
    apply: (o) => ({
      ...o,
      discountGross: {
        value: (o.discountGross?.value ?? 0) + o.grossPrice.value * 0.1,
        kind: "assumption",
      },
    }),
  },
];

export function runSensitivity(
  offer: OfferInput,
  scenarios: Scenario[] = defaultScenarios,
): ScenarioResult[] {
  const base = calculateUnitEconomics(offer);
  return scenarios.map((s) => {
    const ue = calculateUnitEconomics(s.apply(offer));
    return {
      id: s.id,
      label: s.label,
      maxCpa: ue.maxCpa,
      deltaMaxCpa: ue.maxCpa - base.maxCpa,
      breakEvenRoasGross: ue.breakEvenRoasGross,
    };
  });
}
