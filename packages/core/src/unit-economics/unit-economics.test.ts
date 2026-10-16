import { describe, expect, it } from "vitest";
import { assumption, estimate, fact } from "../provenance";
import { calculateUnitEconomics, contributionAfterAds, targetCpa } from "./calculate";
import { evaluateOfferGates, evaluateProductGates } from "./gates";
import { analyzeProduct, renderProductReport } from "./report";
import { resolveProductFile, type OfferInput } from "./schema";
import { runSensitivity } from "./sensitivity";

/**
 * Handgerechnetes Referenzbeispiel:
 * 23,80 € brutto → 20,00 € netto. Kosten behalten: Ware 4 + Versand 4 + Verpackung 0,5
 * + Handling 0,5 + Gebühr (2 % × 23,80 + 0,30 = 0,776) = 9,776 → DB behalten 10,224.
 * Verlust je Retoure: 4 + 0,5 + 0,5 + 0,776 + 4 × 0,5 + 2 + 1 = 10,776.
 * Erwarteter DB: 0,9 × 10,224 − 0,1 × 10,776 = 8,124.
 */
function referenceOffer(overrides: Partial<OfferInput> = {}): OfferInput {
  return {
    id: "ref",
    name: "Referenz",
    units: 1,
    grossPrice: fact(23.8),
    vatRate: fact(0.19),
    discountGross: fact(0),
    shippingChargedGross: fact(0),
    unitCost: fact(3),
    inboundCostPerUnit: estimate(1),
    outboundShipping: fact(4),
    packaging: fact(0.5),
    fulfillmentHandling: fact(0.5),
    paymentFeePercent: fact(0.02),
    paymentFeeFixed: fact(0.3),
    returnRate: assumption(0.1),
    returnShippingCost: assumption(2),
    returnHandlingCost: assumption(1),
    returnResaleRate: assumption(0.5),
    otherVariableCosts: fact(0),
    ...overrides,
  };
}

describe("calculateUnitEconomics", () => {
  it("berechnet das Referenzbeispiel korrekt", () => {
    const ue = calculateUnitEconomics(referenceOffer());
    expect(ue.grossOrderValue).toBeCloseTo(23.8, 10);
    expect(ue.netRevenue).toBeCloseTo(20, 10);
    expect(ue.vat).toBeCloseTo(3.8, 10);
    expect(ue.costs.paymentFee).toBeCloseTo(0.776, 10);
    expect(ue.costs.total).toBeCloseTo(9.776, 10);
    expect(ue.contributionIfKept).toBeCloseTo(10.224, 10);
    expect(ue.lossIfReturned).toBeCloseTo(10.776, 10);
    expect(ue.contributionBeforeAds).toBeCloseTo(8.124, 10);
    expect(ue.maxCpa).toBeCloseTo(8.124, 10);
    expect(ue.contributionMarginRate).toBeCloseTo(8.124 / 18, 10);
    expect(ue.breakEvenRoasGross).toBeCloseTo(23.8 / 8.124, 10);
    expect(ue.breakEvenRoasNet).toBeCloseTo(20 / 8.124, 10);
  });

  it("ohne Retouren entspricht der max. CPA dem DB einer behaltenen Bestellung", () => {
    const ue = calculateUnitEconomics(referenceOffer({ returnRate: fact(0) }));
    expect(ue.contributionBeforeAds).toBeCloseTo(ue.contributionIfKept, 10);
  });

  it("berücksichtigt Rabatt und berechneten Versand im Bestellwert und in der Gebühr", () => {
    const ue = calculateUnitEconomics(
      referenceOffer({ discountGross: fact(3.8), shippingChargedGross: fact(4.76) }),
    );
    expect(ue.grossOrderValue).toBeCloseTo(24.76, 10);
    expect(ue.netRevenue).toBeCloseTo(24.76 / 1.19, 10);
    expect(ue.costs.paymentFee).toBeCloseTo(24.76 * 0.02 + 0.3, 10);
  });

  it("multipliziert Warenkosten mit der Stückzahl, Versand nur einmal", () => {
    const single = calculateUnitEconomics(referenceOffer());
    const triple = calculateUnitEconomics(referenceOffer({ units: 3, grossPrice: fact(47.6) }));
    expect(triple.costs.product).toBeCloseTo(12, 10);
    expect(triple.costs.outboundShipping).toBe(single.costs.outboundShipping);
    expect(triple.maxCpa).toBeGreaterThan(single.maxCpa);
  });

  it("liefert unendlichen Break-even-ROAS bei negativem Deckungsbeitrag", () => {
    const ue = calculateUnitEconomics(referenceOffer({ unitCost: fact(30) }));
    expect(ue.maxCpa).toBeLessThan(0);
    expect(ue.breakEvenRoasGross).toBe(Infinity);
  });

  it("markiert fehlende Werte und rechnet sie als 0", () => {
    const ue = calculateUnitEconomics(referenceOffer({ packaging: null, returnHandlingCost: null }));
    expect(ue.dataQuality.complete).toBe(false);
    expect(ue.dataQuality.missing).toEqual(["packaging", "returnHandlingCost"]);
    expect(ue.costs.packaging).toBe(0);
  });

  it("ordnet Felder nach Herkunft", () => {
    const q = calculateUnitEconomics(referenceOffer()).dataQuality;
    expect(q.byKind.estimate).toEqual(["inboundCostPerUnit"]);
    expect(q.byKind.assumption).toContain("returnRate");
    expect(q.byKind.fact).toContain("grossPrice");
  });
});

describe("Werbung", () => {
  it("berechnet DB nach Werbung und Ziel-CPA", () => {
    const ue = calculateUnitEconomics(referenceOffer());
    const after = contributionAfterAds(ue, 5);
    expect(after.contributionAfterAds).toBeCloseTo(3.124, 10);
    expect(after.roasGross).toBeCloseTo(23.8 / 5, 10);
    expect(after.profitable).toBe(true);
    expect(contributionAfterAds(ue, 9).profitable).toBe(false);
    expect(targetCpa(ue, 3)).toBeCloseTo(5.124, 10);
  });

  it("lehnt negativen CPA ab", () => {
    const ue = calculateUnitEconomics(referenceOffer());
    expect(() => contributionAfterAds(ue, -1)).toThrow();
  });
});

describe("Gates", () => {
  it("lässt ein knappes Einzelprodukt durchfallen", () => {
    const result = evaluateOfferGates(calculateUnitEconomics(referenceOffer()));
    expect(result.status).toBe("fail");
    expect(result.checks.find((c) => c.id === "orderValue")?.passed).toBe(false);
  });

  it("besteht mit einem starken Bundle", () => {
    const ue = calculateUnitEconomics(referenceOffer({ units: 3, grossPrice: fact(59.5) }));
    expect(evaluateOfferGates(ue).status).toBe("pass");
  });

  it("meldet 'incomplete', wenn es nur dank fehlender Kosten besteht", () => {
    const ue = calculateUnitEconomics(
      referenceOffer({ units: 3, grossPrice: fact(59.5), packaging: null }),
    );
    expect(evaluateOfferGates(ue).status).toBe("incomplete");
  });

  it("bleibt 'fail', wenn es trotz fehlender Kosten durchfällt", () => {
    const ue = calculateUnitEconomics(referenceOffer({ packaging: null }));
    expect(evaluateOfferGates(ue).status).toBe("fail");
  });

  it("ein Produkt besteht, wenn mindestens ein Angebot besteht", () => {
    const single = calculateUnitEconomics(referenceOffer());
    const bundle = calculateUnitEconomics(
      referenceOffer({ id: "b3", units: 3, grossPrice: fact(59.5) }),
    );
    const result = evaluateProductGates([single, bundle]);
    expect(result.status).toBe("pass");
    expect(result.bestOfferId).toBe("b3");
  });
});

describe("Stresstest", () => {
  it("Einkauf +25 % senkt den max. CPA um den retourenbereinigten Mehraufwand", () => {
    const [cogs] = runSensitivity(referenceOffer());
    // Ware 4 → 5: behalten −1 × 0,9; Retoure +1 × 0,5 × 0,1 → −0,95
    expect(cogs?.deltaMaxCpa).toBeCloseTo(-0.95, 10);
  });
});

describe("resolveProductFile", () => {
  const base = referenceOffer();
  const { id: _id, name: _name, units: _units, grossPrice, ...costs } = base;

  it("führt Defaults und Angebotswerte zusammen", () => {
    const resolved = resolveProductFile({
      product: { id: "p", name: "Produkt", currency: "EUR" },
      defaults: costs,
      offers: [
        { id: "1", name: "1 Stück", units: 1, grossPrice },
        { id: "2", name: "2 Stück", units: 2, grossPrice: fact(35.7), outboundShipping: fact(4.5) },
      ],
    });
    expect(resolved.offers).toHaveLength(2);
    expect(resolved.offers[1]?.outboundShipping?.value).toBe(4.5);
    expect(resolved.offers[0]?.outboundShipping?.value).toBe(4);
  });

  it("verlangt jedes Kostenfeld explizit (Wert oder null)", () => {
    const { packaging: _p, ...incomplete } = costs;
    expect(() =>
      resolveProductFile({
        product: { id: "p", name: "Produkt", currency: "EUR" },
        defaults: incomplete,
        offers: [{ id: "1", name: "1 Stück", units: 1, grossPrice }],
      }),
    ).toThrow(/packaging/);
  });

  it("lehnt ungültige Quoten ab", () => {
    expect(() =>
      resolveProductFile({
        product: { id: "p", name: "Produkt", currency: "EUR" },
        defaults: { ...costs, returnRate: fact(1.5) },
        offers: [{ id: "1", name: "1 Stück", units: 1, grossPrice }],
      }),
    ).toThrow(/returnRate/);
  });
});

describe("Bericht", () => {
  it("rendert Kernzahlen, Gate-Status und Herkunft", () => {
    const analysis = analyzeProduct({
      product: { id: "p", name: "Testprodukt", currency: "EUR" },
      offers: [referenceOffer()],
    });
    const md = renderProductReport(analysis, new Date("2026-10-16T00:00:00Z"));
    expect(md).toContain("# Unit Economics – Testprodukt");
    expect(md).toContain("NICHT BESTANDEN");
    expect(md).toContain("8,12");
    expect(md).toContain("Schätzung");
    expect(md).toContain("Stresstest");
  });
});
