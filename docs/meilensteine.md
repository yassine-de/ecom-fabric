# Meilensteine

## M0 – Fundament (16.10.2026)

| Baustein | Status |
|---|---|
| Monorepo (npm workspaces, TypeScript strict, Vitest) | Lokal getestet |
| Unit-Economics-Rechner (`packages/core`): Nettoerlös, retourenbereinigter DB, max. CPA, Break-even-ROAS, Gates, Stresstest, Datenherkunft | Lokal getestet (19 Tests) |
| CLI-Bericht `npm run ue` + SpinGrip-Auswertung | Lokal getestet |
| Dashboard-Skelett (Next.js 16, Übersicht + Unit Economics, mobil geprüft) | Lokal getestet |
| Worker-Skelett mit eindeutiger Worker-ID | Lokal getestet (2 Tests) |
| GitHub-Repo `yassine-de/ecom-fabric` + Actions-CI | Integration getestet (Push erfolgreich) |
| Supabase-Konfiguration (`.env.local`, Schlüssel-Schutz, `npm run check:supabase`) | Lokal getestet – Publishable Key wird vom Nutzer eingetragen |
| Supabase-Migrationen | Geplant (M1, benötigt Secret Key + DB-Verbindung) |

**SpinGrip-Ergebnis (Kosten größtenteils geschätzt):** max. CPA 6,61 € (1 Stk.) / 10,98 € (2er) / 15,35 € (3er), Break-even-ROAS 3,01 / 2,72 / 2,60 → Gate nicht bestanden. Bericht: `reports/unit-economics/spingrip.md`.
