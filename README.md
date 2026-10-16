# ECOM-FABRIC GERMANY

Teilautonome E-Commerce-Fabrik für den deutschen Markt (Shopify, Meta Ads, TikTok).

- Strategie & Architektur: [docs/00-phase-0-strategie.md](docs/00-phase-0-strategie.md)
- Fortschritt: [docs/meilensteine.md](docs/meilensteine.md)

## Struktur

| Pfad | Inhalt |
|---|---|
| `packages/core` | Geschäftslogik ohne I/O (Unit Economics, später Scoring, Freigabe-Regeln) |
| `apps/dashboard` | Next.js-Dashboard (Steuerzentrale) |
| `apps/worker` | Worker-Prozess (ab M1: Job-Queue) |
| `data/products` | Produktdateien mit Kosten inkl. Herkunft (Fakt/Schätzung/Annahme) |
| `reports` | Generierte Berichte |
| `supabase/migrations` | Versionierte DB-Migrationen (ab M1) |

## Befehle

```bash
npm install
npm test                      # Unit-Tests (Vitest)
npm run typecheck             # TypeScript für alle Pakete
npm run ue -- data/products/spingrip.json --out reports/unit-economics
npm run dev:dashboard         # http://localhost:3000
npm run dev:worker
```

Konfiguration: `.env.example` nach `.env.local` kopieren und selbst befüllen (nie committen).
