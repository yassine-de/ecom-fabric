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

## M1 – Factory Core (16.10.2026)

Entscheidung: eigene Postgres-Queue statt pg-boss – siehe [ADR 0001](adr/0001-factory-core-in-postgres.md).

| Baustein | Status |
|---|---|
| Migration `fabric`-Schema (Agenten, Jobs, Freigaben, Budgets, Kostenbuch, Audit-Log, Kill-Switch, Worker) | Integration getestet (dev-DB) |
| Eingeschränkte DB-Rolle `fabric_worker` (nur Funktionen, keine Tabellenrechte; Passwort lokal erzeugt, nur SCRAM-Hash übertragen) | Integration getestet |
| Job-Queue: atomare Übernahme, Leases + Fencing, Retry mit Backoff, Dead-Letter, Idempotenz | Integration getestet (4 parallele Worker, 40 Jobs, jeder genau einmal) |
| Freigaben: nur Operatoren, Stufe C mit Begründung, Payload-Hash, einmalig einlösbar, Ablauf | Integration getestet (inkl. Fälschungsversuch durch Worker) |
| Budget-Guard: fail closed, parallele Reservierungen, 80-%-Warnung, Abrechnung | Integration getestet |
| Kill-Switch, append-only Audit-Log | Integration getestet |
| Worker-Prozess (`npm run dev:worker`), CLI (`npm run fabric -- status`) | Integration getestet (SpinGrip-Analyse über echte Queue) |
| Dashboard-Login + Freigabe-Oberfläche | Geplant (M1b) |
| Integrationstests in GitHub-CI | Geplant (braucht separates Test-Projekt + Secrets) |

Startbudgets (Annahme, änderbar nur durch Operatoren): LLM 3 €/Tag · 50 €/Monat, Medien 5 €/Tag · 50 €/Monat, Recherche 25 €/Monat, gesamt 100 €/Monat.

## M1b – Dashboard-Login und Freigaben (16.10.2026)

| Baustein | Status |
|---|---|
| Migration: MFA-Pflicht (aal2) für alle Operator-Rechte inkl. Lesen; `whoami`, `dashboard_overview` | Integration getestet (23 Tests) |
| Supabase-Auth im Dashboard (Proxy, Session-Cookies, Data-Access-Layer) | Integration getestet (echte Session, Seiten serverseitig gerendert) |
| Login, Registrierung (Passwort ≥ 12 Zeichen), TOTP-Einrichtung und -Abfrage | Integration getestet + vom Nutzer im Browser bestätigt (22.10.2026) |
| Freigaben-Seite (Stufe B/C, Payload, Begründungspflicht C), Übersicht mit Kill-Switch und Budgets, Audit-Log | Integration getestet + erste echte Freigabe durch den Nutzer (22.10.2026) |
| Operator-Freischaltung `npm run db:add-operator -- --email …` | Integration getestet (Nutzer freigeschaltet) |
| Schema `fabric` in Data API freigegeben; anonymer Zugriff wird abgewiesen | Integration getestet |
| End-to-End-Test `apps/dashboard/test/auth-flow.itest.ts` (7 Tests) | Integration getestet |
| Erste echte Freigabe: Worker stellt ein → Nutzer gibt mit MFA frei → Worker führt aus → Audit-Log vollständig | Integration getestet (22.10.2026) |
| Runner löst Freigaben vor der Ausführung selbst ein (Kill-Switch, Ablauf, Payload-Hash, einmalig) | Integration getestet (31 Tests) |
| Smartphone im Heimnetz (allowedDevOrigins = eigene LAN-IP) | Implementiert – Test am Handy offen |
