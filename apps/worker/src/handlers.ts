import { analyzeProduct, resolveProductFile } from "@ecom-fabric/core";
import type { FabricQueue, Job, Json } from "./queue";

export interface JobContext {
  job: Job;
  queue: FabricQueue;
  /** Wird ausgelöst bei Kill-Switch oder Worker-Stopp; Handler sollen dann zügig abbrechen. */
  signal: AbortSignal;
  log: (message: string) => void;
}

export type JobHandler = (ctx: JobContext) => Promise<Json>;
export type HandlerRegistry = Record<string, JobHandler>;

/** Fehler, bei dem ein erneuter Versuch sinnlos ist (z. B. ungültige Eingabe). */
export class PermanentJobError extends Error {}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const defaultHandlers: HandlerRegistry = {
  "system.echo": async ({ job }) => ({ echo: job.payload }),

  // Reine Berechnung, keine Kosten, keine externen Aufrufe (Stufe A).
  "unit-economics.analyze": async ({ job }) => {
    let resolved;
    try {
      resolved = resolveProductFile(job.payload);
    } catch (err) {
      throw new PermanentJobError(err instanceof Error ? err.message : String(err));
    }
    const analysis = analyzeProduct(resolved);
    return {
      productId: analysis.product.id,
      gateStatus: analysis.gates.status,
      bestOfferId: analysis.gates.bestOfferId,
      offers: analysis.results.map(({ ue }) => ({
        offerId: ue.offerId,
        grossOrderValue: round2(ue.grossOrderValue),
        maxCpa: round2(ue.maxCpa),
        breakEvenRoasGross: Number.isFinite(ue.breakEvenRoasGross) ? round2(ue.breakEvenRoasGross) : null,
        dataComplete: ue.dataQuality.complete,
      })),
    };
  },
};
