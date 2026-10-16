import { z } from "zod";

/**
 * Herkunft eines Wertes. Fehlende Werte werden explizit als `null` erfasst,
 * damit niemand stillschweigend mit 0 rechnet.
 */
export const provenanceKinds = ["fact", "estimate", "assumption"] as const;
export type Provenance = (typeof provenanceKinds)[number];

export const provenanceLabels: Record<Provenance | "missing", string> = {
  fact: "Fakt",
  estimate: "Schätzung",
  assumption: "Annahme",
  missing: "fehlt",
};

export const dataPointSchema = z.object({
  value: z.number().finite(),
  kind: z.enum(provenanceKinds),
  source: z.string().optional(),
  note: z.string().optional(),
});

export type DataPoint = z.infer<typeof dataPointSchema>;

/** `null` = Wert fehlt (wird im Ergebnis markiert und als 0 gerechnet). */
export const maybeDataPointSchema = dataPointSchema.nullable();
export type MaybeDataPoint = DataPoint | null;

export function fact(value: number, source?: string): DataPoint {
  return { value, kind: "fact", ...(source ? { source } : {}) };
}

export function estimate(value: number, note?: string): DataPoint {
  return { value, kind: "estimate", ...(note ? { note } : {}) };
}

export function assumption(value: number, note?: string): DataPoint {
  return { value, kind: "assumption", ...(note ? { note } : {}) };
}
