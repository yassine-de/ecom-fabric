# Datenbank-Migrationen

Versionierte SQL-Migrationen für Supabase (PostgreSQL), Dateinamen nach Supabase-CLI-Konvention:
`YYYYMMDDHHMMSS_beschreibung.sql`.

- Migrationen werden nie nachträglich geändert, nur durch neue ergänzt.
- Erst gegen das **dev**-Projekt anwenden, dann gegen **prod** (prod ist Stufe C).
- Erste Migrationen (Jobs, Freigaben, Budgets, Kostenbuch, Audit-Log) folgen in M1.
