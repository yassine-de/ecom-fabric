# ECOM-FABRIC GERMANY – Arbeitsregeln

- Sprache mit dem Nutzer: Deutsch. Strategie & Architektur: `docs/00-phase-0-strategie.md`, Fortschritt: `docs/meilensteine.md`.
- Monorepo (npm workspaces): `packages/core` (reine Geschäftslogik, keine I/O), `apps/dashboard` (Next.js 16 – vor Next-Code die Doku in `node_modules/next/dist/docs/` lesen), `apps/worker` (Node/TS).
- Prüfen vor jedem Commit: `npm test`, `npm run typecheck`, `npm run lint -w @ecom-fabric/dashboard`.
- Werte immer mit Herkunft erfassen (Fakt/Schätzung/Annahme, fehlend = `null`). Nie Zahlen erfinden.
- Freigabestufen A/B/C (siehe Strategie Abschnitt 11): keine externen Schreibaktionen, Ausgaben oder Veröffentlichungen ohne Freigabe des Nutzers.
- Secrets nur in `.env.local` (gitignored), nie im Repo oder Chat.
- Status immer unterscheiden: Geplant · Implementiert · Lokal getestet · Integration getestet · Produktiv.
- Datenbank: Schema `fabric`, Änderungen nur per neuer Migration in `supabase/migrations` (`npm run db:migrate`). Worker nutzen ausschließlich `FABRIC_WORKER_DB_URL` (Rolle `fabric_worker`); die Admin-URL nur für Migrationen, Einrichtung und Test-Setup.
- Nach DB-Änderungen `npm run test:integration` (dev-DB) ausführen. Supabase-Pooler: max. 15 Session-Verbindungen.
- Abweichungen von der Phase-0-Strategie als ADR in `docs/adr` festhalten.
