# ADR 0001 – Factory Core vollständig in Postgres (eigene Queue statt pg-boss)

Status: angenommen · Datum: 16.10.2026 · Ersetzt: Empfehlung „pg-boss / graphile-worker“ aus Phase 0, Abschnitt 6

## Kontext
Phase 0 empfahl eine fertige Queue-Bibliothek plus eigene Metadaten-Tabelle. Beim Entwurf von M1 zeigte sich:
Freigaben, Budgets, Idempotenz, Kill-Switch und Audit müssen **in derselben Transaktion** wie die Jobübernahme
geprüft werden. Mit pg-boss gäbe es zwei Zustandsmodelle (pg-boss-Schema + unsere Tabellen), die synchron
gehalten werden müssten – genau dort entstehen Doppelausführungen und Sicherheitslücken.

## Entscheidung
- Eine Tabelle `fabric.jobs`; atomare Übernahme per `FOR UPDATE SKIP LOCKED` in `fabric.claim_jobs()`.
- Leases mit Heartbeat; abgelaufene Leases werden zurückgestellt, das Ergebnis des alten Workers verworfen (Fencing über `locked_by`).
- Alle Schreibzugriffe nur über `SECURITY DEFINER`-Funktionen. Die Rolle `fabric_worker` hat **keine** Tabellenrechte.
- Freigabe-Entscheidungen nur durch `authenticated` + Eintrag in `fabric.operators`; ein Trigger erzwingt das zusätzlich für jede Verbindung (auch Admin).
- Freigaben sind an einen SHA-256-Hash des Payloads gebunden und genau einmal einlösbar (`consume_approval`).
- Budgets: fail closed (ohne Budget keine Ausgabe), Reservierungen serialisiert per Advisory Lock.
- `audit_log` append-only per Trigger.

## Begründung der Abweichung
Das Sperrmuster ist klein und gut verstanden; das Risiko „Eigenbau“ wird durch Integrationstests gegen die echte
Datenbank abgedeckt (4 parallele Worker, 40 Jobs → jeder genau einmal; Lease-Ablauf mit Fencing).

## Konsequenzen
- (+) Ein Zustandsmodell, alle Sicherheitsregeln in der Datenbank technisch erzwungen.
- (+) Keine zusätzliche Abhängigkeit/Schema.
- (−) Features wie Cron-Scheduling oder Job-Abhängigkeiten müssen bei Bedarf selbst ergänzt werden.
- (−) Supabase-Pooler im Session-Modus erlaubt 15 Verbindungen → Worker nutzen max. 2 Verbindungen je Prozess.
