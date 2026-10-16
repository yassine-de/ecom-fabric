# ECOM-FABRIC GERMANY – Phase 0: Strategie & Machbarkeit

Stand: 16.10.2026 · Status aller Inhalte: **Geplant** (nichts davon ist implementiert)

Legende für Aussagen in diesem Dokument:
- **[F]** Fakt, aus Primärquelle oder direkt geprüft
- **[Q3]** Aussage aus Drittquelle (Blog, Verzeichnis), vor Nutzung an Primärquelle verifizieren
- **[S]** Schätzung
- **[A]** Annahme
- **[?]** Fehlende Daten

---

## 0. Kurzfazit

1. **Das Vorhaben ist machbar, aber in der beschriebenen Breite zu groß für den Start.** Die Liste mit zehn Agenten ist ein Endbild. Den Gewinn entscheiden am Anfang drei Dinge: die Produktauswahl, genug unterschiedliche Creatives und eine ehrliche Gewinnrechnung. Alles andere ist Automatisierung von Arbeit, die es noch gar nicht gibt.
2. **Die meisten Bausteine gibt es schon fertig.** Shopify, Meta und TikTok bieten seit 2026 offizielle MCP-Server bzw. KI-Toolkits an. Wir müssen also keine eigenen „Agenten“ für jede API bauen. Wir bauen den **Kontroll- und Datenkern**: Freigaben, Budgets, Audit, Profit und Produkt-Pipeline. Die KI-Arbeit erledigen anfangs Claude Code und die offiziellen Konnektoren, und zwar unter dieser Kontrolle.
3. **Direktes China-Dropshipping an deutsche Endkunden ist 2026 strukturell schlechter als noch 2023.** Gründe sind der 3-€-Zoll pro Artikel seit 01.07.2026, die GPSR-Pflichtangaben, die Lieferzeiten und das Retourenrisiko. Empfohlenes Standardmodell: **kleine Testmengen aus einem EU- bzw. DE-Lager**, wo möglich mit EU-Dropshipping ergänzt.
4. **Die Profit-Intelligenz kommt nach vorne, nicht in Phase 7.** Ohne Break-even-CPA vor dem ersten Euro Werbebudget ist jeder Produkttest Blindflug. Der Kern davon ist deterministischer Code und braucht kein KI-Modell.
5. **Bestand:** Es gibt bereits den Shop *SpinGrip* (Trial-Plan, DE, EUR) mit einem aktiven Produkt. Bevor dort Geld fließt, sind einige Punkte offen (siehe Abschnitt 1).

---

## 1. Bestandsaufnahme (am 16.10.2026 geprüft)

| Ressource | Befund | Status |
|---|---|---|
| Projektordner `D:\CLAUDE\ECOM-FABRIC` | leer, kein Git-Repo | [F] |
| Node.js / Git | v22.14.0 / 2.49 vorhanden | [F] |
| Shopify-Shop „SpinGrip“ (`rw6jbs-9s.myshopify.com`) | Plan: Trial, Land DE, Währung EUR | [F] |
| Produkt „SpinGrip – Magnetischer Handy-Ring mit Fidget-Spinner“ | Status ACTIVE, 6 Varianten (1er/2er/3er × Silber/Gunmetal), 19,90 / 29,90 / 39,90 €, Bestand 100 je Variante | [F] |
| Shopify-Konnektor (MCP) in Claude | verbunden, Lese-/Schreibzugriff auf den Shop | [F] |
| Medien-KI-Konnektor (Bild/Video/TikTok-Veröffentlichung) | verbunden, 0 Credits, Free-Plan | [F] |
| Supabase, GitHub, Meta Business, TikTok for Business | nicht geprüft / kein Zugriff | [?] |

**Shopify-Hinweis im Wortlaut:** „Plan: trial — you'll need to upgrade before you can start selling and unlock full features“

**Auffälligkeiten beim SpinGrip-Produkt (vor dem ersten Verkauf klären):**
- **„MagSafe“ als Tag:** MagSafe ist eine Marke von Apple. Erlaubt ist allenfalls „MagSafe-kompatibel“, und das nur, wenn es technisch zutrifft. Die Marke darf nicht im Produktnamen und nicht als Suchbegriff-Köder auftauchen. [A, markenrechtlich prüfen]
- **Produktbild:** Der Dateiname deutet auf ein Lieferantenbild hin. Ob du das Nutzungsrecht hast, ist offen. [?]
- **Bestand 600:** Ist das echter Lagerbestand oder ein Platzhalter? Bei Dropshipping führt ein erfundener Bestand zu Überverkäufen und falschen Lieferzeitangaben. [?]
- **GPSR-Pflichtangaben** (Hersteller, verantwortliche Person in der EU, Produktkennung, Warnhinweise) sind in der Beschreibung nicht sichtbar. Bei Magneten gehören unter anderem Warnhinweise zu Herzschrittmachern und Karten dazu. [?]
- **Wirtschaftlichkeit:** Ein Einzelpreis von 19,90 € ist für bezahlte Werbung sehr eng (siehe Rechenbeispiel in Abschnitt 5.3).

---

## 2. Plattform- und API-Stand (Oktober 2026)

### 2.1 Shopify
- **GraphQL Admin API** ist die Standard-Schnittstelle, REST gilt als Legacy. Versionen erscheinen quartalsweise. Produkte lassen sich als `DRAFT` anlegen und erst nach Freigabe auf `ACTIVE` setzen. Das passt genau zu Stufe B. [F, allgemein bekannt; aktuelle Versionsnummer beim Start prüfen]
- **Shopify AI Toolkit / Dev MCP:** im April 2026 als Open Source veröffentlicht. Es enthält Doku-Suche, Query-Validierung und Store-Operationen und unterstützt unter anderem Claude Code. [Q3]
- **Storefront MCP:** Jeder Shop hat einen `/api/mcp`-Endpunkt für käuferseitige KI. Für uns ist das vorerst nicht relevant. [Q3]
- **Bewertung:** Für Shopify brauchen wir keinen eigenen „Agenten“ mit eigener API-Schicht. Wir brauchen einen schlanken Adapter mit Freigabe-Gate und Dry-Run.

### 2.2 Meta (Facebook/Instagram)
- **Marketing API:** Die alten Advantage-Shopping-Kampagnen (ASC) lassen sich seit v24/v25 nicht mehr anlegen. Advantage+ entsteht jetzt über die Einstellungen (Budget-, Zielgruppen- und Placement-Automatisierung). Laut Plan wurden alte ASC-Kampagnen mit v26 (ca. September 2026) pausiert. [F: Meta-Developer-Blog; Datum v26 prüfen]
- **Offizieller Meta Ads MCP:** offene Beta seit 29.04.2026, gehostet unter `mcp.facebook.com/ads`, dazu eine lokale CLI. OAuth mit drei Scope-Stufen: read-only, read/write und read/write/financial. [Q3]
- **Risiko:** Laut Drittquelle hat der MCP **keinen Entwurfsmodus und keine Bestätigungsmaske**. Daraus folgt: Agenten bekommen nur den **read-only-Scope**. Schreibende Aktionen laufen ausschließlich über unseren eigenen Executor mit Freigabe, und Kampagnen werden immer im Status `PAUSED` angelegt.
- **Tracking:** Pixel und Conversions API laufen über die offizielle „Facebook & Instagram“-App in Shopify. Selbst bauen lohnt sich nicht.
- **Attribution:** Meta meldet modellierte Conversions. Wahr ist nur, was im Shop als Bestellung ankommt und nicht retourniert wird. Das Profit-Modul rechnet deshalb mit Shopify-Daten und behandelt Plattformdaten als Indikator.

### 2.3 TikTok Ads
- **TikTok API for Business (Marketing API)** ist die offizielle Schnittstelle für Kampagnen und Reporting.
- **Offizieller TikTok Ads MCP:** auf der TikTok World am 13.05.2026 angekündigt. Laut Verzeichnissen ist er seit Sommer/Herbst 2026 live, mit rund 400 Tools und OAuth gegen das TikTok-for-Business-Konto, das nach 30 Tagen neu autorisiert werden muss. [Q3, **unbestätigt aus TikTok-Primärquelle**]
- **Bewertung:** Gleiche Regel wie bei Meta: Analyse lesend über den MCP, schreibende Aktionen nur über unser Freigabe-Gate.

### 2.4 TikTok Organic
- **Content Posting API:** Apps ohne Audit können posten, **alle Posts sind dann aber nur privat sichtbar**. Für öffentliche Direct Posts ist ein Audit nötig (laut Drittquellen 2–4 Wochen, häufige Ablehnungen). [F: TikTok-Doku, Stand 08/2026; Dauer: Q3]
- **Upload als Entwurf:** Das Video landet in der TikTok-Inbox des Creators und wird **dort manuell veröffentlicht**. Dafür ist kein Audit nötig, und es entspricht genau Stufe B (Mensch drückt „Posten“).
- **Empfehlung:** Kein Audit-Projekt am Anfang. Workflow: Video in der Fabrik erzeugen → QA → Freigabe → Entwurf in die TikTok-Inbox → du postest in der App. Für die Analyse prüfen wir die Display API bzw. die Business-Konto-Statistiken.
- **TikTok Shop** ist in Deutschland verfügbar. Das ist ein möglicher späterer Kanal, für den Start aber nicht nötig.

### 2.5 KI-Bild- und Videogenerierung
- **Bild:** Mehrere Anbieter liegen bei grob 0,02–0,20 € pro Bild. Produktfotos sollten trotzdem auf **echten Fotos des echten Produkts** basieren (KI für Freisteller, Szenen und Varianten), sonst drohen Irreführung und Retouren. [S]
- **Video (API-Preise lt. Vergleichsseiten, schwankend):** Veo 3.1 liegt bei ca. 0,03–0,75 $/s je nach Tier und Audio, Kling 3.0 bei ca. 0,08–0,11 $/s, Seedance 2.0 ist sehr günstig. **Die Sora-2-API soll laut Drittquelle am 24.09.2026 abgeschaltet worden sein**, darauf bauen wir nicht. [Q3]
- **Realistische Kosten:** Ein brauchbares 15–30-s-Ad mit Fehlversuchen kostet **ca. 2–15 € Generierungskosten** [S]. Der Engpass ist nicht der Preis, sondern Qualität und Glaubwürdigkeit. Reine KI-Videos wirken bei physischen Produkten oft künstlich. **Echte Handyaufnahmen des Produkts plus KI-Schnitt, -Untertitel und -Hooks** schlagen erfahrungsgemäß reine Generierung. [A]
- **Austauschbarkeit:** Ein Provider-Interface mit Aggregator (z. B. fal.ai oder Replicate) oder der bereits verbundene Medien-Konnektor. Ein Anbieterwechsel darf keinen Code-Umbau erfordern.

### 2.6 E-Commerce-Automatisierung (fertige Lösungen)
Shopify Flow (kostenlos), offizielle Meta- und TikTok-Sales-Channel-Apps, Rechtstexte-Dienste mit Abmahnschutz (Händlerbund, IT-Recht Kanzlei u. a.), Consent-Apps über die Shopify Customer Privacy API, Review-Apps (nur echte Bewertungen), Lieferanten-Sync-Apps, Buchhaltung (z. B. Lexware, sevDesk) und Profit-Tracker-Apps. → siehe Build-vs.-Buy in Abschnitt 8.

---

## 3. Rechtlicher Rahmen – relevante Änderungen 2024–2026

> Strukturierte Vorprüfung, keine Rechtsberatung. Vor dem Live-Gang prüft ein Rechtstexte-Dienst bzw. eine Fachanwältin oder ein Fachanwalt.

| Thema | Seit | Konsequenz für uns |
|---|---|---|
| **GPSR** (EU 2023/988) | 13.12.2024 | Im Angebot stehen Hersteller, **verantwortliche Person in der EU** (bei Nicht-EU-Herstellern), Produktkennung und Warnhinweise. Ohne vollständige Angaben gibt es **technisch kein Publish**. Im Zweifel fällt die Rolle auf uns als Händler zurück. [F/Q3] |
| **3-€-Zoll auf Kleinsendungen ≤ 150 €** | 01.07.2026 (befristet bis ca. 07/2028) | Er fällt **pro Artikelposition** (HS-Code) an. Dazu kommt eine geplante Handling-Gebühr (~2 €, Verhandlungen laufen, Ziel ca. 11/2026). Direkt-Dropshipping aus China wird dadurch spürbar teurer. [F: EU-Kommission; Details Q3] |
| **Widerrufsbutton** (§ 356a BGB) | 19.06.2026 | Elektronische Widerrufsfunktion, zweistufig und dauerhaft erreichbar, mit angepasster Widerrufsbelehrung und Datenschutzerklärung. **Bei Shopify prüfen, welche App bzw. welches Theme das sauber abbildet.** [Q3, IHK-Quellen] |
| **EU AI Act Art. 50** | 02.08.2026 | Kennzeichnungspflicht für Deepfakes bzw. realistische KI-Darstellungen, auch in **Werbung**. Für maschinenlesbare Markierung gilt bei Bestandssystemen eine Übergangsfrist bis 02.12.2026. → Creative-QA bekommt ein Pflichtfeld „KI-Anteil / Kennzeichnung“. [Q3, Kommissions-Leitlinien prüfen] |
| **Verpackungsgesetz / LUCID** | laufend | Registrierung bei LUCID **und** Systembeteiligung **vor** dem ersten Versand an Verbraucher in DE, auch für Versandkartons. [F] |
| **ElektroG / BattG** | laufend | Nur relevant bei Produkten mit Elektronik oder Akku. Solche Produkte sind am Anfang wegen WEEE-Registrierung und Rücknahmepflichten **meiden**. [A] |
| **BFSG** (Barrierefreiheit) | 28.06.2025 | Gilt für Onlineshops. Kleinstunternehmen (< 10 MA **und** ≤ 2 Mio. € Umsatz) sind bei Dienstleistungen ausgenommen. Barrierearme Gestaltung trotzdem als Designstandard. [F/A] |
| **PAngV** | laufend | Bei Streichpreisen gilt der niedrigste Preis der letzten 30 Tage, Grundpreis wo nötig. **Keine Fake-Rabatte**, das System erzwingt die Preis-Historie. [F] |
| **DSGVO / TTDSG** | laufend | Consent vor Pixel und Tracking, AV-Verträge, Datenminimierung. Kundendaten gehen **nur pseudonymisiert** an LLMs. [F] |

---

## 4. Kritische Bewertung des Vorhabens

**Was am Plan stark ist:** der Fokus auf Nettogewinn statt ROAS, das dreistufige Freigabemodell, das Verbot von Fake-Bewertungen und Dark Patterns und die Trennung von Fakt, Schätzung und Annahme. Das ist besser als bei 95 % der Dropshipping-Projekte.

**Wo ich widerspreche:**

1. **„Weitgehend autonom“ ist am Anfang das falsche Ziel.** Autonomie lohnt sich erst für Abläufe, die du schon mehrmals manuell erfolgreich durchgeführt hast. Phase 1–3 sollten **teilautomatisiert mit dir als Entscheider** laufen. Gebaut wird erst, was wir dabei als wiederkehrend erkannt haben.
2. **Eigene LLM-Agenten für Shopify, Meta und TikTok sind 2026 größtenteils redundant.** Die offiziellen MCP-Server existieren. Unser Mehrwert liegt in Freigaben, Budgetschutz, Profitrechnung, Produkt-Pipeline und Audit, nicht in API-Wrappern.
3. **Ein „Factory Manager“ als LLM-Orchestrator ist anfangs Overengineering.** Eine Postgres-Job-Queue mit festen Pipelines (Produkt → Prüfung → Entwurf → Freigabe) reicht. Die LLM-Planung („Ziele entgegennehmen und zerlegen“) übernimmt vorerst Claude Code im Dialog mit dir.
4. **Zehn Agenten parallel entwickeln bedeutet Monate ohne Umsatz.** Ziel ist der **erste bezahlte Produkttest innerhalb von 3–4 Wochen**, nicht die fertige Fabrik.
5. **Billige Impuls-Gadgets um 20 € sind im Paid-Social 2026 schwer profitabel.** Gründe sind hohe CPMs, Temu- und Amazon-Preisvergleich und Retourenkosten (siehe 5.3). Mit Bundles, Nischenmarke und AOV ≥ 30–35 € steigen die Chancen deutlich.

---

## 5. Geschäftsmodell für Deutschland

### 5.1 Bewertung der fünf Modelle (1 = schlecht, 5 = gut) [S]

| Kriterium | 1 EU-Dropshipping | 2 Int./China-Dropshipping | 3 Testmenge aus DE | 4 Eigener Bestand | 5 Private Label |
|---|---|---|---|---|---|
| Kapitalbedarf (gering = gut) | 5 | 5 | 4 | 2 | 1 |
| Lieferzeit | 4 (2–5 Tage) | 1 (7–20 Tage) | 5 (1–2 Tage) | 5 | 5 |
| Kundenerlebnis / Retouren | 3 | 1 | 5 | 5 | 5 |
| Compliance-Kontrolle (GPSR) | 3 | 1 | 4 | 5 | 4 |
| Marge | 2 | 3 (seit 3-€-Zoll schlechter) | 3 | 4 | 5 |
| Skalierbarkeit | 3 | 3 | 3 | 5 | 5 |
| Produktauswahl | 2 (begrenzt) | 5 | 4 | 4 | 3 |
| **Eignung zum Testen** | **gut** | **schlecht** | **sehr gut** | nein | nein |
| **Eignung zum Skalieren** | mittel | schlecht | – | **sehr gut** | **sehr gut (später)** |

### 5.2 Empfehlung: „Test klein aus DE, skaliere mit Bestand“
1. **Validieren:** 30–100 Stück Testmenge (Muster vorher selbst prüfen) und Versand aus DE, anfangs aus eigener Hand, ab ca. 10 Bestellungen pro Tag über einen 3PL. Alternativ EU-Dropshipping, wenn ein verlässlicher EU-Lieferant existiert.
2. **Skalieren:** Gewinnerprodukte → größerer Bestand → 3PL in DE.
3. **Marke:** Nach 2–3 Gewinnern in einer Nische → Private Label / Differenzierung.
4. **China-Direktversand an Endkunden: nein.** Ausnahme: Muster und Testmengen an uns selbst.

Das kostet pro Test ca. 150–800 € Ware [S], liefert dafür echte Lieferzeiten, echte Produktfotos und -videos, eigene Qualitätsprüfung und GPSR-Kontrolle. **Das eigene Produkt in der Hand ist zugleich die beste Creative-Quelle.**

### 5.3 Rechenbeispiel SpinGrip (1 Stück, 19,90 €) – nur Struktur, Kosten [S]

| Position | € |
|---|---|
| Bruttopreis | 19,90 |
| − USt 19 % | −3,18 |
| **Nettoerlös** | **16,72** |
| − Wareneinsatz inkl. Fracht/Zoll anteilig | −3,00 [S] |
| − Versand DE | −4,50 [S] |
| − Verpackung | −0,40 [S] |
| − Zahlungsgebühren (~2 % + fix) | −0,65 [S] |
| − Retouren-/Reklamationsrückstellung (5 %) | −0,85 [S] |
| **Deckungsbeitrag vor Werbung** | **≈ 7,30** |
| **Max. wirtschaftlicher CPA (Break-even)** | **≈ 7,30 €** |
| **Break-even-ROAS (brutto)** | **≈ 2,7** |

Ein CPA unter 7 € im kalten Traffic ist für ein 20-€-Produkt in DE **ambitioniert** [A]. Das 2er- bzw. 3er-Set (29,90 / 39,90 €) verbessert die Rechnung stark, weil Versand und Werbung nur einmal anfallen. → Im Test sollten Bundles die Standardauswahl sein, kein verstecktes Upsell.

---

## 6. Empfohlene Gesamtarchitektur

**Prinzip: modularer Monolith, eine Datenbank, ein Worker-Typ.** Keine Microservices, kein Redis und kein Kubernetes.

```
                ┌──────────────────────────────────────────────┐
  Du (Laptop/   │  Next.js Dashboard (TypeScript, Tailwind)    │
  PC/Handy) ───►│  - Supabase Auth (+ MFA) – einzige Freigabe- │
                │    quelle                                    │
                │  - Server Actions / API (nie Service-Key im  │
                │    Browser)                                  │
                └───────────────┬──────────────────────────────┘
                                │
                ┌───────────────▼──────────────────────────────┐
                │  Supabase PostgreSQL (zentral, RLS)          │
                │  products · opportunities · suppliers ·      │
                │  compliance_checks · creatives · campaigns · │
                │  approvals · budgets · cost_ledger · jobs ·  │
                │  audit_log (append-only) · metrics_daily     │
                │  + Supabase Storage (Medien)                 │
                └───────────────┬──────────────────────────────┘
                                │ Job-Queue (pg-boss / graphile-
                                │ worker: SKIP LOCKED, Retries)
                ┌───────────────▼──────────────────────────────┐
                │  Worker (Node/TS), startbar auf Laptop UND   │
                │  PC, eindeutige worker_id, Lease + Heartbeat │
                │  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
                │  │ Pipelines│ │ LLM-     │ │ Action-      │  │
                │  │ (Research│ │ Router   │ │ Executor     │  │
                │  │ Scoring, │ │ (Modell- │ │ (einziger    │  │
                │  │ Profit)  │ │ wahl,    │ │ Weg für      │  │
                │  │          │ │ Kosten)  │ │ externe      │  │
                │  │          │ │          │ │ Schreibzug.) │  │
                │  └──────────┘ └──────────┘ └──────┬───────┘  │
                └────────────────────────────────────┼─────────┘
                   Adapter (austauschbar, mit Dry-Run)│
       Shopify GraphQL · Meta Marketing API · TikTok Business API ·
       TikTok Content Posting (Draft) · Bild/Video-Provider · LLMs
```

**Kernentscheidungen:**
- **Job-Queue:** Wir nutzen eine bewährte Postgres-Queue-Bibliothek wie **pg-boss** oder graphile-worker, die atomare Übernahme per `FOR UPDATE SKIP LOCKED`, Retries, Backoff und Cron mitbringt. Darüber liegt unsere eigene Tabelle `jobs`-Metadaten für Kosten, Freigabe und Idempotency-Key. Kein Eigenbau der Sperrlogik.
- **Idempotenz bei externen APIs:** Jede externe Aktion bekommt einen `idempotency_key`. Vor dem Ausführen schreibt der Executor einen Datensatz „intent“ und danach „result“. Bei einem Absturz dazwischen läuft ein **Reconcile**: Wir schauen beim Ziel nach (z. B. Shopify-Produkt mit Metafeld `fabric.idempotency_key`, Meta-Kampagne mit Namens- bzw. Tag-Konvention), bevor erneut ausgeführt wird.
- **Multi-Device:** Beide Rechner verbinden sich mit derselben Supabase-DB. Worker registrieren sich mit `worker_id = hostname + uuid` und Heartbeat. Abgestorbene Leases laufen ab. Die Fabrik muss nicht 24/7 laufen.
- **Ausführungsorte:** (a) lokal: Generierung und Recherche, wenn du am Rechner bist; (b) zeitgesteuert: tägliche Metrik-Importe; das kann anfangs der lokale Worker übernehmen, später ein Supabase-Cron bzw. eine Edge Function; (c) dauerhaft erreichbar: erst für Webhooks (Shopify-Bestellungen) nötig, und diese lassen sich anfangs per Polling ersetzen. **Hosting erst, wenn ein konkreter Bedarf da ist.** Für Handy-Zugriff aufs Dashboard reicht vorerst ein privates Netz (z. B. Tailscale, kostenlos). Hinweis: Der kostenlose Vercel-Plan ist nicht für kommerzielle Nutzung gedacht.
- **Test vs. Produktion:** zwei Supabase-Projekte (dev/prod), ein Shopify-Entwicklungsshop und der Live-Shop, Werbekonten anfangs nur lesend. Die Umgebung ist in jedem Datensatz und in jedem Executor-Aufruf hart codiert.

---

## 7. Priorisierung der Agenten (überarbeitete Reihenfolge)

| Prio | Modul | KI nötig? | Warum jetzt / später |
|---|---|---|---|
| **1** | **Factory Core** (Queue, Freigaben, Budgets, Audit, Kostenbuch) | nein | Sicherheitsfundament, alles andere hängt davon ab |
| **1** | **Profit-Rechner** (Unit Economics, Break-even-CPA/-ROAS) | nein | Muss **vor** dem ersten Test existieren; reine Mathematik |
| **2** | **Product Research + Scoring + Opportunity Cards** | teilweise (Strukturierung, Zusammenfassung) | Engpass Nr. 1 für den Gewinn |
| **2** | **Compliance-Checkliste** (GPSR, LUCID, CE, Marke) | wenig (regelbasiert + LLM-Hinweise) | Gate vor jedem Publish |
| **3** | **Shopify Factory** (Entwürfe, Texte, SEO, Publish nach Freigabe) | ja (Texte) | Erst wenn Produkte die Gates passieren |
| **3** | **Creative Factory** (Hooks, Skripte, Schnitt, Untertitel, QA) | ja | Treibt CPA; mit Fokus auf Varianten statt Perfektion |
| **4** | **Ads-Reporting Meta/TikTok** (lesend über MCP/API) | wenig | Profit pro Creative/Kampagne |
| **4** | **Kampagnen-Entwürfe** (PAUSED + Freigabe) | teilweise | Erst nach stabilem Reporting |
| **5** | **TikTok Organic** (Kalender, Draft-Upload) | ja | Läuft parallel manuell ab Woche 3; automatisiert später |
| **6** | **Customer Intelligence** | teilweise | Braucht Bestellungen; ohne Daten wertlos |
| **7** | **LLM-Factory-Manager** (Zielzerlegung) | ja | Erst wenn Pipelines stabil sind |

**Model-Routing (Grundsatz):** Was Code kann, macht Code (Profit, Scoring-Formel, Validierung, Formatierung). Für Extraktion und Klassifizierung reicht ein günstiges Modell (z. B. Haiku-Klasse). Marktanalyse, Creative-Konzepte und strategische Bewertung bekommen ein starkes Modell (Sonnet/Opus-Klasse). Jeder LLM-Aufruf geht über den Router, der Kosten bucht und Limits prüft.

---

## 8. Build vs. Buy

| Bereich | Entscheidung | Begründung |
|---|---|---|
| Shop-System, Checkout, Zahlungen | **Buy:** Shopify + Shopify Payments | Kernkompetenz von Shopify |
| Theme | **Buy:** offizielles Shopify-Theme (kostenlos), ggf. Premium-Theme (~300–400 € einmalig) + eigene Sections | Kein Theme-Eigenbau |
| Rechtstexte + Abmahnschutz | **Buy:** Rechtstexte-Dienst (~10–30 €/Monat) [S] | Haftung, Aktualität (Widerrufsbutton, GPSR) |
| Cookie-Consent | **Buy:** Consent-App mit Shopify Customer Privacy API | Rechtssicherheit |
| Pixel / Conversions API | **Buy:** offizielle Meta- und TikTok-Apps | Wartung durch Plattform |
| Bewertungen | **Buy:** Review-App, **nur echte Käuferbewertungen** | Kein Import fremder Reviews |
| E-Mail-Flows | **Buy:** Shopify Email bzw. Klaviyo Free | Warenkorbabbruch etc. |
| Buchhaltung | **Buy:** Lexware / sevDesk + Steuerberater | Nicht unser Produkt |
| Ads-Zugriff für KI | **Buy/nutzen:** offizielle Meta- und TikTok-MCPs (read-only) | Kein Wrapper-Eigenbau |
| Medien-Generierung | **Buy:** Provider über Adapter | Austauschbar |
| Job-Queue-Mechanik | **Buy (OSS):** pg-boss / graphile-worker | Atomarität ist schwer, gelöst |
| **Freigabesystem, Budget-Guard, Audit** | **Build** | Kern unserer Sicherheit, passt in kein Tool |
| **Profit Intelligence** | **Build** (Kern) | Profit-Apps rechnen ROAS-lastig und ohne unsere Kostenmodelle; eigene Logik ist überschaubar |
| **Produkt-Pipeline + Scoring** | **Build** | Das ist das eigentliche Know-how |
| **Creative-Pipeline (Orchestrierung, QA)** | **Build (dünn)** | Generierung extern, Prozess und Prüfungen intern |
| Dashboard | **Build** (Next.js) | Vereint alles; schlicht halten |

---

## 9. Kostenabschätzung [S]

### 9.1 Laufende Fixkosten (Start, pro Monat, netto)
| Posten | € / Monat |
|---|---|
| Shopify Basic (jährlich bzw. monatlich) | 25–33 |
| Rechtstexte + Abmahnschutz | 10–30 |
| Apps (Consent, Reviews, ggf. Widerrufsbutton) | 0–40 |
| Supabase (Free reicht anfangs; Pro bei Bedarf) | 0 → ~25 |
| LLM-API für Worker (mit Tageslimit) | 20–100 |
| Bild- und Videogenerierung (mit Limit) | 20–100 |
| Domain, LUCID-Systembeteiligung (umgelegt) | 5–15 |
| Hosting | 0 (lokal), später 0–25 |
| **Summe Software/Betrieb** | **≈ 80–350** |

Claude Code (dein Abo) läuft separat und ist hier nicht enthalten.

### 9.2 Variable Testkosten pro Produkt
| Posten | € |
|---|---|
| Muster + Testmenge | 150–800 |
| Werbebudget Test (7–10 Tage) | 300–700 |
| Creatives (Generierung + ggf. Creator) | 20–200 |
| **Pro Produkttest** | **≈ 500–1.700** |

**Empfohlenes Startkapital:** 3.000–5.000 € für **4–6 Produkttests über ca. 90 Tage** inklusive Puffer. Realistische Erwartung: Die Mehrzahl der Tests verliert Geld, Ziel ist **ein** Produkt mit positivem Deckungsbeitrag nach Werbung. [A]

---

## 10. MVP-Plan (Vorschlag, ca. 6 Wochen)

| Meilenstein | Inhalt | Ergebnis / Abnahme |
|---|---|---|
| **M0 – Fundament** (Woche 1) | Git-Repo und GitHub, Monorepo-Skelett (Next.js + Worker + gemeinsames `core`-Paket), Supabase dev, Migrationssystem, Secrets-Handling | `npm test` grün, leeres Dashboard lokal, Migrationen versioniert |
| **M1 – Factory Core + Profit-Rechner** (Woche 1–2) | Tabellen für jobs, approvals, budgets, cost_ledger und audit_log; Queue; Worker-Registrierung; Kill-Switch; **Unit-Economics-Rechner** mit Tests; SpinGrip als erster Fall | Doppelte Jobausführung im Test mit 2 Workern ausgeschlossen; Agent kann sich nicht selbst freigeben (Test); Break-even-Report SpinGrip |
| **M2 – Research MVP** (Woche 2–3) | Produkteingabe (manuell + halbautomatisch), Scoring mit Fakt/Schätzung/Annahme, Opportunity Cards, Compliance-Checkliste | 10 Opportunity Cards, Top 3 mit Empfehlung |
| **M3 – Shopify MVP** (Woche 3–4) | Adapter: Produkt als DRAFT, Texte, SEO, GPSR-Block, Publish nur nach Freigabe | Entwurf im Dev-Shop angelegt und per Freigabe veröffentlicht (Integration getestet) |
| **M4 – Creative MVP** (Woche 4–5) | Hooks und Skripte, Shotlisten für echte Aufnahmen, KI-Bild, Schnitt-/Untertitel-Pipeline, QA inkl. KI-Kennzeichnung | 5 unterschiedliche Creatives pro Testprodukt |
| **M5 – Erster bezahlter Test + Reporting** (Woche 5–6) | Meta-Reporting read-only, Kampagne als PAUSED-Entwurf, Aktivierung nur durch dich; täglicher Profit-Report | Erster echter Test mit Kill- und Scale-Regeln |

Danach folgen TikTok Ads, die TikTok-Organic-Automatisierung (Draft-Upload), Customer Intelligence und Optimierung, jeweils erst, wenn Daten den Bedarf zeigen.

---

## 11. Sicherheits- und Freigabeplan

**Technische Durchsetzung (nicht nur Konvention):**
1. **Action Requests:** Jede Stufe-B/C-Aktion wird als Datensatz mit `action_type`, `payload`, `payload_hash`, `risk_level`, `cost_estimate`, `requested_by` (Agent/Worker) und `expires_at` angelegt.
2. **Freigabe nur durch Menschen:** Freigaben setzt ausschließlich ein über Supabase Auth (mit MFA) angemeldeter Mensch über das Dashboard. Ein DB-Constraint und RLS stellen sicher: `approved_by` ist ein Mensch und ungleich dem Antragsteller. Die Worker-Rolle hat **kein Schreibrecht** auf Freigabefelder.
3. **Executor-Prüfung:** Der Executor führt nur aus, wenn eine gültige Freigabe vorliegt, der Payload-Hash unverändert ist, die Freigabe nicht abgelaufen ist, das Budget reicht und der Kill-Switch aus ist. Wenn sich der Payload nach der Freigabe ändert, ist eine neue Freigabe nötig.
4. **Sichere Standardzustände:** Shopify-Produkte werden als `DRAFT` angelegt, Meta- und TikTok-Kampagnen als `PAUSED`, TikTok-Videos als Inbox-Entwurf.
5. **Budget-Guard:** Tages- und Monatslimits je Kategorie (LLM, Medien, Ads-Vorschläge). Ab 80 % kommt eine Warnung, ab 100 % ein harter Stopp. Erhöhungen sind selbst eine Stufe-C-Aktion.
6. **Audit-Log:** append-only (Trigger verhindert UPDATE/DELETE). Jede Aktion, Freigabe, Ablehnung und Kostenbuchung wird protokolliert.
7. **Least Privilege:** Plattform-Tokens mit minimalem Scope. KI-Konnektoren für Ads nur read-only, schreibende Tokens nur im Executor. Keine Finanz-Scopes.
8. **Secrets:** `.env.local` (gitignored) bzw. Supabase Vault, niemals im Repo und niemals im Chat. Der Service-Role-Key bleibt serverseitig.
9. **Kundendaten:** Minimal speichern, an LLMs nur pseudonymisiert und aggregiert übergeben, Löschfristen als Job.
10. **Kill-Switch:** globales Flag im Dashboard, das sofort alle ausführenden Jobs stoppt.

**Zuordnung der Stufen (Auszug):** A = Recherche, Scoring, Berechnung, Entwürfe, Reports · B = Publish, Änderung Live-Seite, Kampagne aktivieren, Budget ändern, Video veröffentlichen, Lieferantenkontakt, Preisänderung · C = jede Ausgabe, Warenbestellung, Verträge, Abos, Erstattungen, Löschungen.

---

## 12. Strategie zur schnellen Validierung

**Pipeline mit harten Gates** (Zahlen sind Startwerte und werden nach den ersten Tests kalibriert):

1. **Desk-Research-Gate:** Nachfrage-Indikatoren (Ad Library: wie lange laufen Wettbewerber-Ads, Suchinteresse, Bewertungen) und Differenzierungsidee vorhanden.
2. **Unit-Economics-Gate:** Deckungsbeitrag vor Werbung ≥ 12 € **oder** ≥ 40 % vom Nettoerlös, Break-even-ROAS ≤ 2,5, AOV-Pfad ≥ 30 € (Bundles).
3. **Compliance-Gate:** GPSR-Angaben vollständig, keine Elektronik oder Akkus in der Startphase, keine Markenkonflikte, kein Medizin- oder Kosmetik-Wirkversprechen.
4. **Muster-Gate:** Muster selbst getestet, Qualität ok, eigene Foto- und Videoaufnahmen gemacht.
5. **Creative-Test:** 5 deutlich unterschiedliche Creatives, Meta mit kleinem Tagesbudget, 5–7 Tage. Parallel 3–5 organische TikToks als kostenloses Signal.
6. **Kill-Regeln:** Spend ≥ 1,5 × max. CPA ohne Kauf → Stopp. Nach ~150 € Spend CTR < 0,8 % und keine Add-to-Carts → Creative oder Produkt verwerfen.
7. **Scale-Regel:** Tatsächlicher CPA (Shopify-Bestellungen) ≤ 70 % vom max. CPA über ≥ 20 Bestellungen **und** Retourenquote im Rahmen → Freigabevorschlag für Budget +20–30 % pro Schritt (Stufe B) und Bestandsentscheidung (Stufe C).

Ein hoher Plattform-ROAS allein löst **nie** eine Skalierungsempfehlung aus.

---

## 13. Die fünf offenen Geschäftsentscheidungen (mit Standardempfehlung)

| # | Entscheidung | Empfohlener Standard |
|---|---|---|
| 1 | **Testbudget und Verlustgrenze** für die ersten 90 Tage | 3.000 € gesamt, davon max. 1.000 € Werbung pro Monat; Software ≤ 250 €/Monat. Stop-Loss: Nach 90 Tagen ohne Produkt mit positivem DB nach Werbung → Strategie-Review. |
| 2 | **Liefermodell für Tests** | Testmengen aus DE (Selbstversand, ab ~10 Bestellungen/Tag 3PL), EU-Dropshipping als Option, **kein** China-Direktversand an Kunden. |
| 3 | **Shop- und Markenstrategie** | Eine Nischenmarke mit kuratiertem Sortiment statt One-Product-Shops. SpinGrip bleibt erstes Testprodukt im bestehenden Shop. Ob der Shop umbenannt bzw. breiter aufgestellt wird, entscheiden wir nach dem ersten Gewinner. |
| 4 | **Kanal-Fokus 90 Tage** | Meta Ads als bezahlter Hauptkanal und TikTok Organic als günstiges Signal. TikTok Ads ab Monat 2. TikTok Shop und Marktplätze später. |
| 5 | **Rechtlicher und steuerlicher Rahmen** | Gewerbe angemeldet, **Regelbesteuerung** (Vorsteuerabzug auf Ware, Tools und Werbung), LUCID-Registrierung, Rechtstexte-Dienst mit Abmahnschutz. Steuerberater klärt Details. |

---

## 14. Nächster technischer Schritt (nach deiner Freigabe der Entscheidungen)

**M0 – Fundament**, das ich selbst ausführe: Git-Repo, Monorepo-Skelett, Tests, Migrationsstruktur und der **Unit-Economics-Rechner** inklusive SpinGrip-Auswertung (rein lokal, keine Kosten).

Von dir benötigt (ohne Zugangsdaten im Chat):
- **GitHub:** Name des Repos bzw. Login über `gh auth login` in deinem Terminal
- **Supabase:** Konto bzw. Projekt anlegen (Free-Plan, keine Kosten). Die Keys trägst du selbst in `.env.local` ein, ich zeige dir wo.
- **SpinGrip:** reale Einkaufs-, Versand- und Verpackungskosten sowie die Klärung, ob Bestand vorhanden ist

---

## Quellen (Auswahl, abgerufen 16.10.2026)
- TikTok Content Posting API (Direct Post, Audit): https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post · https://developers.tiktok.com/docs/en/content-sharing-guidelines · https://bundle.social/blog/tiktok-api-approval
- TikTok Ads MCP: https://digiday.com/marketing/tiktok-launches-mcp-server-to-let-ai-agents-run-campaigns/ · https://www.digitalapplied.com/blog/official-ads-mcp-servers-meta-google-tiktok-2026-playbook · https://mcpplaygroundonline.com/mcp-servers/tiktok
- Meta Marketing API / Advantage+: https://developers.facebook.com/blog/post/2026/02/13/asc-and-aac-deprecation-mapi-v25/ · https://developers.facebook.com/blog/post/2025/10/08/upcoming-asc-and-aac-mapi-deprecation-migration-options-to-advantage-plus/
- Meta Ads MCP: https://mcp.directory/blog/meta-ads-cli-mcp · https://pasqualepillitteri.it/en/news/1707/official-meta-ads-mcp-claude-29-tools-2026 · https://adsuploader.com/blog/meta-ads-mcp
- Shopify AI Toolkit / MCP: https://askphill.com/blogs/blog/shopify-just-released-an-ai-toolkit-for-claude-heres-what-it-actually-does · https://www.charle.co.uk/articles/shopify-mcp-explained/
- Shopify-Preise DE: https://qualimero.com/blog/shopify-preise
- KI-Video-Preise: https://invideo.io/blog/ai-video-model-pricing · https://coverr.co/blog/ai-video-generation-api-pricing-2026
- 3-€-Zoll: https://commission.europa.eu/news-and-media/news/ensuring-fairness-and-safety-eur3-customs-duty-low-value-parcels-2026-06-29_en · https://vatcalc.com/eu/eu-e3-levy-low-value-e-commerce-import-package-july-2026
- Widerrufsbutton: https://www.ihk.de/karlsruhe/fachthemen/recht/internetrecht/fallback1433495812828/widerrufsbutton-wird-verpflichtend-7020816 · https://www.ihk.de/bodensee-oberschwaben/recht/werbung-und-vertrieb/online-handel/widerrufsbutton-im-onlinehandel-6831090
- AI Act Art. 50: https://connectontech.bakermckenzie.com/new-eu-guidance-on-ai-transparency-what-should-companies-be-doing-from-2-august-2026 · https://www.ictrecht.nl/en/blog/heads-up-ai-act-transparency-obligations-now-in-effect
- GPSR im Onlinehandel: https://ohn.haendlerbund.de/recht/rechtsfragen/gpsr-how-to-umsetzung-shop · https://www.it-recht-kanzlei.de/achtung-abmahnung-fehlende-angaben-hersteller-nach-gpsr.html
