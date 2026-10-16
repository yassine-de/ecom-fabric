/**
 * Unit-Economics-Bericht für eine oder mehrere Produktdateien.
 *
 *   npm run ue -- data/products/spingrip.json
 *   npm run ue -- data/products/spingrip.json --out reports/unit-economics
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  analyzeProduct,
  formatEur,
  formatRoas,
  gateStatusLabels,
  renderProductReport,
  resolveProductFile,
} from "@ecom-fabric/core";

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outDir = outIndex >= 0 ? args[outIndex + 1] : undefined;
const files = args.filter((_, i) => outIndex < 0 || (i !== outIndex && i !== outIndex + 1));

if (files.length === 0) {
  console.error("Aufruf: npm run ue -- <produktdatei.json> [...] [--out <ordner>]");
  process.exit(1);
}

let failed = false;
for (const file of files) {
  try {
    const analysis = analyzeProduct(resolveProductFile(JSON.parse(readFileSync(file, "utf8"))));
    console.log(`\n${analysis.product.name} → ${gateStatusLabels[analysis.gates.status]}`);
    for (const { ue } of analysis.results) {
      const missing = ue.dataQuality.missing.length ? ` · ${ue.dataQuality.missing.length} Werte fehlen` : "";
      console.log(
        `  ${ue.name.padEnd(12)} max. CPA ${formatEur(ue.maxCpa).padStart(9)} · Break-even-ROAS ${formatRoas(ue.breakEvenRoasGross)}${missing}`,
      );
    }
    if (outDir) {
      mkdirSync(outDir, { recursive: true });
      const target = join(outDir, basename(file).replace(/\.json$/, ".md"));
      writeFileSync(target, renderProductReport(analysis) + "\n", "utf8");
      console.log(`  Bericht: ${target}`);
    }
  } catch (err) {
    failed = true;
    console.error(`\nFehler in ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
process.exit(failed ? 1 : 0);
