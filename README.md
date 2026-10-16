# ECOM-FABRIC GERMANY

Teilautonome E-Commerce-Fabrik für den deutschen Markt (Shopify, Meta Ads, TikTok).

- Strategie & Architektur: [docs/00-phase-0-strategie.md](docs/00-phase-0-strategie.md)
- Fortschritt: [docs/meilensteine.md](docs/meilensteine.md) · Entscheidungen: [docs/adr](docs/adr)

## Struktur

| Pfad | Inhalt |
|---|---|
| `packages/core` | Geschäftslogik ohne I/O (Unit Economics, Env-Validierung) |
| `apps/dashboard` | Next.js-Dashboard (Steuerzentrale) |
| `apps/worker` | Worker-Prozess: Job-Queue, Handler, Integrationstests |
| `supabase/migrations` | Versionierte DB-Migrationen (Schema `fabric`) |
| `data/products` | Produktdateien mit Kosten inkl. Herkunft |
| `scripts` | CLI-Werkzeuge (Unit Economics, DB, Factory) |

## Einrichtung

```bash
npm install
cp .env.example .env.local      # Supabase-URL, Keys, SUPABASE_DB_URL selbst eintragen
npm run check:supabase          # prüft Keys und DB-Verbindung (ohne Geheimnisse auszugeben)
npm run db:migrate              # Migrationen anwenden (Admin-Verbindung)
npm run db:setup-worker         # Login der eingeschränkten Worker-Rolle erzeugen/rotieren
```

## Befehle

```bash
npm test                        # Unit-Tests
npm run test:integration        # Integrationstests gegen die dev-Datenbank
npm run typecheck
npm run dev:dashboard           # http://localhost:3000
npm run dev:worker              # Worker dauerhaft (Laptop und PC parallel möglich)
npm run fabric -- status        # Kill-Switch, Jobs, Freigaben, Budgets
npm run fabric -- enqueue unit-economics unit-economics.analyze --payload-file data/products/spingrip.json
npm run ue -- data/products/spingrip.json --out reports/unit-economics
```
