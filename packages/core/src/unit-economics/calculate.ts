import type { MaybeDataPoint, Provenance } from "../provenance";
import { offerCostFields, type OfferCostField, type OfferInput } from "./schema";

export interface DataQuality {
  /** true, wenn kein Feld fehlt. Schätzungen/Annahmen sind erlaubt, werden aber ausgewiesen. */
  complete: boolean;
  missing: OfferCostField[];
  byKind: Record<Provenance, Array<OfferCostField | "grossPrice">>;
}

export interface CostBreakdown {
  product: number;
  outboundShipping: number;
  packaging: number;
  fulfillmentHandling: number;
  paymentFee: number;
  otherVariableCosts: number;
  total: number;
}

export interface UnitEconomics {
  offerId: string;
  name: string;
  units: number;
  /** Was der Kunde zahlt: Preis − Rabatt + berechneter Versand (brutto). */
  grossOrderValue: number;
  vat: number;
  /** Nettoerlös einer behaltenen Bestellung. */
  netRevenue: number;
  /** Kosten einer behaltenen Bestellung (netto). */
  costs: CostBreakdown;
  /** Deckungsbeitrag, wenn die Bestellung behalten wird. */
  contributionIfKept: number;
  /** Verlust einer vollständig retournierten Bestellung (positiver Betrag). */
  lossIfReturned: number;
  returnRate: number;
  /** Erwarteter, retourenbereinigter Deckungsbeitrag je Bestellung vor Werbung. */
  contributionBeforeAds: number;
  /** contributionBeforeAds / erwarteter Nettoerlös. */
  contributionMarginRate: number;
  /** Höchster CPA, bei dem die Bestellung gerade kein Geld verliert. */
  maxCpa: number;
  /** Bruttobestellwert / maxCpa. `Infinity`, wenn maxCpa ≤ 0. */
  breakEvenRoasGross: number;
  /** Nettoerlös / maxCpa. `Infinity`, wenn maxCpa ≤ 0. */
  breakEvenRoasNet: number;
  dataQuality: DataQuality;
}

const v = (dp: MaybeDataPoint): number => (dp === null ? 0 : dp.value);

function assessDataQuality(offer: OfferInput): DataQuality {
  const byKind: DataQuality["byKind"] = { fact: [], estimate: [], assumption: [] };
  const missing: OfferCostField[] = [];
  byKind[offer.grossPrice.kind].push("grossPrice");
  for (const field of offerCostFields) {
    const dp = offer[field];
    if (dp === null) missing.push(field);
    else byKind[dp.kind].push(field);
  }
  return { complete: missing.length === 0, missing, byKind };
}

const roas = (value: number, cpa: number) => (cpa > 0 ? value / cpa : Infinity);

export function calculateUnitEconomics(offer: OfferInput): UnitEconomics {
  const vatRate = v(offer.vatRate);
  const grossOrderValue =
    offer.grossPrice.value - v(offer.discountGross) + v(offer.shippingChargedGross);
  const netRevenue = grossOrderValue / (1 + vatRate);
  const vat = grossOrderValue - netRevenue;

  const product = offer.units * (v(offer.unitCost) + v(offer.inboundCostPerUnit));
  const paymentFee = grossOrderValue * v(offer.paymentFeePercent) + v(offer.paymentFeeFixed);
  const costs: CostBreakdown = {
    product,
    outboundShipping: v(offer.outboundShipping),
    packaging: v(offer.packaging),
    fulfillmentHandling: v(offer.fulfillmentHandling),
    paymentFee,
    otherVariableCosts: v(offer.otherVariableCosts),
    total: 0,
  };
  costs.total =
    costs.product +
    costs.outboundShipping +
    costs.packaging +
    costs.fulfillmentHandling +
    costs.paymentFee +
    costs.otherVariableCosts;

  const contributionIfKept = netRevenue - costs.total;

  // Bei Widerruf: voller Erlös wird erstattet, Ware geht teilweise verloren,
  // Hinversand/Verpackung/Handling/Gebühren sind versunken, dazu Retourenkosten.
  const lossIfReturned =
    costs.outboundShipping +
    costs.packaging +
    costs.fulfillmentHandling +
    costs.paymentFee +
    costs.otherVariableCosts +
    product * (1 - v(offer.returnResaleRate)) +
    v(offer.returnShippingCost) +
    v(offer.returnHandlingCost);

  const returnRate = v(offer.returnRate);
  const contributionBeforeAds =
    (1 - returnRate) * contributionIfKept - returnRate * lossIfReturned;
  const expectedNetRevenue = (1 - returnRate) * netRevenue;
  const maxCpa = contributionBeforeAds;

  return {
    offerId: offer.id,
    name: offer.name,
    units: offer.units,
    grossOrderValue,
    vat,
    netRevenue,
    costs,
    contributionIfKept,
    lossIfReturned,
    returnRate,
    contributionBeforeAds,
    contributionMarginRate: expectedNetRevenue > 0 ? contributionBeforeAds / expectedNetRevenue : 0,
    maxCpa,
    breakEvenRoasGross: roas(grossOrderValue, maxCpa),
    breakEvenRoasNet: roas(netRevenue, maxCpa),
    dataQuality: assessDataQuality(offer),
  };
}

export interface AfterAds {
  cpa: number;
  contributionAfterAds: number;
  /** ROAS auf Bruttobestellwert bei diesem CPA. */
  roasGross: number;
  profitable: boolean;
}

/** Deckungsbeitrag nach Werbung für einen gegebenen (tatsächlichen oder geplanten) CPA. */
export function contributionAfterAds(ue: UnitEconomics, cpa: number): AfterAds {
  if (!(cpa >= 0)) throw new Error("CPA muss ≥ 0 sein");
  const contribution = ue.contributionBeforeAds - cpa;
  return {
    cpa,
    contributionAfterAds: contribution,
    roasGross: roas(ue.grossOrderValue, cpa),
    profitable: contribution > 0,
  };
}

/** CPA, bei dem pro Bestellung noch `targetProfit` € Deckungsbeitrag nach Werbung bleibt. */
export function targetCpa(ue: UnitEconomics, targetProfit: number): number {
  return ue.contributionBeforeAds - targetProfit;
}
