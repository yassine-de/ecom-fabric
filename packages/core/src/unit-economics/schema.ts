import { z } from "zod";
import { dataPointSchema, maybeDataPointSchema } from "../provenance";

/**
 * Konventionen (gelten für alle Beträge in EUR):
 * - Verkaufspreise sind BRUTTO (inkl. USt), wie sie der Kunde sieht.
 * - Kosten sind NETTO, da wir regelbesteuert sind und Vorsteuer abziehen.
 * - Zahlungsgebühren sind umsatzsteuerfrei und fallen auf den gezahlten Bruttobetrag an;
 *   bei Widerruf werden sie nicht erstattet.
 * - `returnRate` = Anteil der Bestellungen, die vollständig widerrufen/retourniert werden.
 *   Bei Widerruf erstatten wir Warenpreis und Standard-Hinversand.
 */
export const offerCostFields = [
  "vatRate",
  "discountGross",
  "shippingChargedGross",
  "unitCost",
  "inboundCostPerUnit",
  "outboundShipping",
  "packaging",
  "fulfillmentHandling",
  "paymentFeePercent",
  "paymentFeeFixed",
  "returnRate",
  "returnShippingCost",
  "returnHandlingCost",
  "returnResaleRate",
  "otherVariableCosts",
] as const;

export type OfferCostField = (typeof offerCostFields)[number];

export const offerCostFieldLabels: Record<OfferCostField | "grossPrice", string> = {
  grossPrice: "Verkaufspreis brutto",
  vatRate: "USt-Satz",
  discountGross: "Rabatt brutto",
  shippingChargedGross: "Versand an Kunden berechnet (brutto)",
  unitCost: "Einkaufspreis je Stück",
  inboundCostPerUnit: "Fracht/Zoll/Import je Stück",
  outboundShipping: "Versandkosten je Bestellung",
  packaging: "Verpackung je Bestellung",
  fulfillmentHandling: "Fulfillment/Handling je Bestellung",
  paymentFeePercent: "Zahlungsgebühr %",
  paymentFeeFixed: "Zahlungsgebühr fix",
  returnRate: "Retourenquote",
  returnShippingCost: "Rücksendekosten (von uns getragen)",
  returnHandlingCost: "Retourenbearbeitung",
  returnResaleRate: "Wiederverkaufsquote Retourenware",
  otherVariableCosts: "Sonstige variable Kosten je Bestellung",
};

const rate = (dp: typeof maybeDataPointSchema) =>
  dp.refine((v) => v === null || (v.value >= 0 && v.value <= 1), {
    message: "Quote muss zwischen 0 und 1 liegen",
  });

const nonNegative = maybeDataPointSchema.refine((v) => v === null || v.value >= 0, {
  message: "Wert darf nicht negativ sein",
});

export const offerCostsSchema = z.object({
  vatRate: rate(maybeDataPointSchema),
  discountGross: nonNegative,
  shippingChargedGross: nonNegative,
  unitCost: nonNegative,
  inboundCostPerUnit: nonNegative,
  outboundShipping: nonNegative,
  packaging: nonNegative,
  fulfillmentHandling: nonNegative,
  paymentFeePercent: rate(maybeDataPointSchema),
  paymentFeeFixed: nonNegative,
  returnRate: rate(maybeDataPointSchema),
  returnShippingCost: nonNegative,
  returnHandlingCost: nonNegative,
  returnResaleRate: rate(maybeDataPointSchema),
  otherVariableCosts: nonNegative,
});

/** Ein Angebot = eine kaufbare Einheit (z. B. 1er-, 2er- oder 3er-Set). */
export const offerSchema = offerCostsSchema.extend({
  id: z.string().min(1),
  name: z.string().min(1),
  units: z.number().int().positive(),
  grossPrice: dataPointSchema.refine((v) => v.value > 0, {
    message: "Verkaufspreis muss größer 0 sein",
  }),
});

export type OfferInput = z.infer<typeof offerSchema>;

/**
 * Produktdatei: gemeinsame Kosten in `defaults`, Abweichungen je Angebot.
 * Jedes Kostenfeld muss nach dem Zusammenführen vorhanden sein (Wert oder `null`).
 */
export const productFileSchema = z.object({
  product: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    currency: z.literal("EUR"),
    notes: z.array(z.string()).optional(),
  }),
  defaults: offerCostsSchema.partial(),
  offers: z
    .array(
      offerCostsSchema.partial().extend({
        id: z.string().min(1),
        name: z.string().min(1),
        units: z.number().int().positive(),
        grossPrice: dataPointSchema,
      }),
    )
    .min(1),
});

export type ProductFile = z.infer<typeof productFileSchema>;

export interface ResolvedProduct {
  product: ProductFile["product"];
  offers: OfferInput[];
}

/** Führt `defaults` und Angebotswerte zusammen und validiert jedes Angebot vollständig. */
export function resolveProductFile(raw: unknown): ResolvedProduct {
  const file = productFileSchema.parse(raw);
  const offers = file.offers.map((offer) => {
    const merged = { ...file.defaults, ...offer };
    const result = offerSchema.safeParse(merged);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      throw new Error(`Angebot "${offer.id}" ist unvollständig oder ungültig: ${issues}`);
    }
    return result.data;
  });
  return { product: file.product, offers };
}
