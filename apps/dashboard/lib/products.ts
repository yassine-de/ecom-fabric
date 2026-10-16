import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeProduct, resolveProductFile, type ProductAnalysis } from "@ecom-fabric/core";

// `next dev`/`next build` laufen im Ordner apps/dashboard.
const PRODUCTS_DIR = join(process.cwd(), "..", "..", "data", "products");

export type ProductLoadResult =
  | { file: string; ok: true; analysis: ProductAnalysis }
  | { file: string; ok: false; error: string };

/** Lokale Produktdateien (M0). Ab M1 kommen die Daten aus Supabase. */
export function loadProductAnalyses(): ProductLoadResult[] {
  return readdirSync(PRODUCTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      try {
        const raw: unknown = JSON.parse(readFileSync(join(PRODUCTS_DIR, file), "utf8"));
        return { file, ok: true as const, analysis: analyzeProduct(resolveProductFile(raw)) };
      } catch (err) {
        return { file, ok: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    });
}
