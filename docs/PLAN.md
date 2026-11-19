# Raumwerk: Produkt- und Umsetzungsplan

> Arbeitstitel „Raumwerk“. Vor dem Launch müssen Name, Marke (DPMA/EUIPO) und Domain geprüft werden.
> Stand: November 2026 · Version 0.1 (MVP-Grundgerüst steht im Repo)

---

## 1. Vision in einem Satz

**Jede:r soll in unter 5 Minuten aus einem Grundriss eine begehbare, eingerichtete 3D-Wohnung machen können und davon fotorealistische Bilder bekommen, ohne CAD-Kenntnisse.**

Das Kernproblem ist die fehlende Vorstellungskraft. Menschen sehen einen Grundriss (Exposé, Mietangebot, Bauplan) und können sich nicht vorstellen:
- wie groß sich die Räume wirklich anfühlen,
- ob das eigene Sofa, Bett oder der Esstisch hineinpasst,
- wie die Wohnung eingerichtet aussehen könnte.

## 2. Zielgruppen (priorisiert)

| # | Segment | Auslöser („Job to be done“) | Zahlungsbereitschaft |
|---|---------|------------------------------|----------------------|
| 1 | **Wohnungssuchende und Umziehende** (25–40 J.) | „Passt meine Einrichtung in die neue Wohnung?“ | gering bis mittel, einmalig |
| 2 | **Bauherr:innen und Käufer:innen** | „Wie wird unser Haus aussehen? Welcher Grundriss ist besser?“ | mittel bis hoch |
| 3 | **Makler:innen und Vermieter:innen** | „Leere Wohnung schneller vermarkten“ (virtuelles Home-Staging) | hoch, B2B-Abo |
| 4 | **Interior-Creator auf Social Media** | Vorher/Nachher-Content, Raumideen | Reichweite statt Geld |
| 5 | Einrichtungshändler | Leads, Produkte im Raum | Affiliate oder Werbung |

**Beachhead:** Segment 1 und 4 zuerst. Sie sind über Social Media erreichbar, haben einen emotionalen Anlass, und ihr Vorher/Nachher-Content wirbt viral für das Produkt. Segment 3 bringt danach den Umsatz.

## 3. Was uns „one of a kind“ macht

Bestehende Tools wie Planner 5D, Roomle, IKEA Kreativ oder HomeByMe sind entweder CAD-lastig, an einen Händler gebunden oder liefern KI-Bilder ohne echte Maße. Unsere Positionierung:

1. **Grundriss → 3D in Minuten.** Wir starten beim Foto oder PDF des Grundrisses, nicht bei einer leeren Fläche. Zuerst geführtes Nachzeichnen mit Maßstabs-Kalibrierung (fertig), danach **KI-Wanderkennung** (Phase 2).
2. **Maßhaltig *und* fotorealistisch.** Die meisten KI-Einrichter halluzinieren Räume. Wir nutzen die **exakte 3D-Szene als Struktur-Vorlage** für die Bild-KI (Higgsfield). Wände, Fenster und Möbelpositionen bleiben stimmig.
3. **Magnetische Einrichtung.** Möbel docken automatisch an Wände an, Kollisionen werden rot markiert, und Flächen werden live berechnet. Laien machen dadurch keine „unmöglichen“ Pläne.
4. **Rundgang statt nur Vogelperspektive.** Man kann in Augenhöhe durch die Wohnung laufen, der stärkste „Aha“-Moment.
5. **Teilen als Kernfunktion.** Jeder Plan wird ein Link oder Clip für Instagram, TikTok und WhatsApp („So wird unsere neue Wohnung“). So entsteht organisches Wachstum.

## 4. User Journey (Ziel: „Aha“ in < 3 Minuten)

```
Landingpage ──► Start (ohne Login!)
   ├─ Grundriss hochladen ─► Maßstab kalibrieren (2 Klicks + Länge) ─► Wände nachzeichnen / KI-Erkennung
   ├─ Selbst zeichnen ─────► Wände klicken, Räume und m² erscheinen automatisch
   └─ Beispielwohnung ─────► sofort 3D + eingerichtet
            │
            ▼
   Einrichten (Katalog, Drag & Drop, magnetische Wände, 2D/3D geteilt)
            │
            ▼
   Rundgang  ──►  Foto-Render (Stil wählen) ──► Teilen / Download
            │                                          │
            └──── Konto anlegen erst beim Speichern in der Cloud oder bei Render Nr. 3 (Paywall) ◄──┘
```

UX-Prinzipien:
- **Kein Login vor dem Aha-Moment.** Lokal speichern ist sofort möglich (schon umgesetzt), Cloud kommt erst mit Konto.
- **Ein Werkzeug, ein Satz Hilfe.** Ein Kontext-Hinweis unten im Editor erklärt immer genau den nächsten Schritt (schon umgesetzt).
- **Alles rückgängig machbar** (Strg+Z, 100 Schritte, schon umgesetzt).
- **Mobile zuerst für Anschauen und Teilen, Desktop für Bearbeiten.** Social-Traffic kommt mobil, deshalb muss der geteilte Link mobil perfekt sein.

## 5. Funktionsumfang nach Phasen

### Phase 0: Fundament ✅ (dieses Repo)
- Monorepo: `packages/core` (Geometrie, Datenmodell, getestet), `apps/web` (React + three.js), `apps/api` (Hono)
- 2D-Editor: Wände mit Einrasten (Knoten, Wände, 15°, 5-cm-Raster), T-Stöße, Türen und Fenster, Knoten ziehen, Bemaßung
- Automatische Raumerkennung mit m²-Angabe
- Grundriss-Bild hinterlegen und Maßstab kalibrieren
- Möbelkatalog (24 Teile, 7 Kategorien), magnetische Wände, Kollisionserkennung, Drehen und Duplizieren
- 3D-Ansicht: echte Wandöffnungen, Schatten, Möbel per Drag & Drop, „Wände niedrig“, Rundgang (WASD)
- Foto-Render-Ablauf: Screenshot → API → Bild-Anbieter (Mock oder Higgsfield) → Polling → Download
- Undo/Redo, Speichern lokal und als JSON, Tastenkürzel, Startbildschirm

### Phase 1: MVP für den öffentlichen Launch (ca. 6–8 Wochen)
- **Konten und Cloud-Speicher:** Supabase (Auth + Postgres + Storage, EU-Region). Projekte, Render-Historie.
- **Teilen-Links:** `/p/{slug}` als öffentliche, schreibgeschützte 3D-Ansicht mit OG-Bild (Render oder Screenshot).
- **Higgsfield live:** echte Keys, Webhook statt Polling, Credit-System, Moderation.
- **Bezahlung:** Stripe (Checkout + Customer Portal), Credits und Abo.
- **Mobile Viewer:** Touch-Orbit, Pinch-Zoom im 2D, Bottom-Sheet-UI.
- **Echte Möbelmodelle:** GLB-Modelle (selbst modelliert oder lizenziert, z. B. CC0 von Poly Haven/Kenney oder gekaufte Pakete), mit Draco komprimiert, Lazy Loading. Das prozedurale Modell bleibt als Fallback.
- **Raumnamen und -typen** (Wohnen, Schlafen, Bad …) für bessere Prompts und Statistiken.
- **Export:** PNG des 2D-Plans (bemaßt), PDF-Grundriss.
- **Analytics** (Plausible oder PostHog EU) und Fehler-Tracking (Sentry).
- **Rechtliches:** Impressum, Datenschutzerklärung, AGB, Cookie-Banner nur falls nötig, AVV mit Higgsfield und Supabase.

### Phase 2: Der „Wow“-Vorsprung (ca. 2–3 Monate)
- **KI-Grundrisserkennung:** Bild oder PDF rein, Wände, Türen und Fenster als Vektoren raus.
  - Weg A (schnell): Vision-LLM (z. B. Claude) mit strukturiertem JSON-Output plus unsere Geometrie-Nachbearbeitung (Begradigen, Knoten zusammenführen, Maßstab aus Bemaßungstext per OCR).
  - Weg B (präzise): eigenes Segmentierungsmodell (z. B. trainiert auf CubiCasa5k oder ähnlichen Datensätzen, Lizenz prüfen) als GPU-Microservice.
  - Der Nutzer korrigiert anschließend im Editor. Das ist der Grund, warum der Editor so gut sein muss.
- **Auto-Einrichten:** „Richte mein Wohnzimmer skandinavisch ein“ → Möbelvorschläge nach Regeln (Abstände, Laufwege, Tür-Schwenkbereiche) plus LLM-Planung → Ergebnis direkt editierbar.
- **Stil-Varianten in Serie:** ein Klick → 4 Stile nebeneinander (Social-Content-Maschine).
- **Video-Clips:** automatische Kamerafahrt durch die Wohnung als MP4 (WebCodecs) und optional Higgsfield-Video für animierte Renders. Perfekt für Reels und TikTok.
- **Eigene Möbel:** Maße eingeben („mein Sofa: 231 × 96 cm“), optional Foto → KI-Modell.

### Phase 3: Skalierung und B2B (ab Monat 6)
- **Makler-Paket:** Branding, mehrere Objekte, Exposé-Bilder, virtuelles Home-Staging, Einbettung als iframe auf Immobilienportalen.
- **Händler-Integration:** Katalog mit echten Produkten, Preisen und Affiliate-Links („Diesen Look kaufen“).
- **Kollaboration:** Paare oder WGs planen gemeinsam (Echtzeit über Yjs/CRDT).
- **AR-Ansicht:** Wohnung oder Möbel auf dem Handy in echt platzieren (WebXR / USDZ-Export).
- **Mehrere Etagen, Dachschrägen, Treppen.**

## 6. Technische Architektur

```
┌──────────────── Browser (apps/web) ────────────────┐
│ React 18 · Zustand (Undo/Redo, Persistenz)         │
│ 2D-Editor (SVG, eigene Interaktionslogik)          │
│ 3D-Viewer (three.js via @react-three/fiber, drei)  │
│            │ nutzt                                  │
│ packages/core  ◄── reine TS-Logik, keine UI        │
│  Datenmodell (zod) · Geometrie · Raumerkennung     │
│  Snapping · Kollision · Plan-Operationen · Prompts │
└──────────────┬─────────────────────────────────────┘
               │ /api (JSON)
┌──────────────▼──────────── apps/api (Hono, Node) ──┐
│ /api/render  → validiert Plan → Prompt → Provider  │
│ /api/uploads → Referenzbild (Phase 1: R2/S3)       │
│ Rate-Limit (Phase 1: Redis/Upstash)                │
│ RenderProvider-Interface:                          │
│   MockProvider · HiggsfieldProvider · (weitere)    │
└──────────────┬─────────────────────────────────────┘
               │ HTTPS (API-Key nur serverseitig!)
         Higgsfield API
```

**Warum so?**
- **`core` ohne UI-Abhängigkeiten:** dieselbe Logik läuft im Browser, auf dem Server (Validierung, Prompt-Bau) und später in einem KI-Agenten („platziere ein Bett“). Alles Wichtige ist dort mit Unit-Tests abgesichert.
- **Austauschbarer Bild-Anbieter:** kein Lock-in. Higgsfield ist Standard, Fallback-Anbieter oder ein eigener ControlNet-Server (Struktur-treues img2img) lassen sich über dasselbe Interface anbinden.
- **SVG für 2D:** gestochen scharf in jeder Zoomstufe, barrierearm, leicht zu exportieren. Bei sehr großen Plänen kann später auf Canvas umgestellt werden.
- **Einheiten:** Meter überall; 2D-(x, y) entspricht 3D-(x, z).

**Hosting (Empfehlung):** Frontend auf Vercel oder Cloudflare Pages, API auf Fly.io oder Railway (EU) bzw. als Cloudflare Worker (Hono läuft dort ohne Änderung), Daten bei Supabase (EU), Bilder auf Cloudflare R2.

Details: [`ARCHITEKTUR.md`](./ARCHITEKTUR.md) · Higgsfield: [`HIGGSFIELD.md`](./HIGGSFIELD.md)

## 7. Higgsfield-Integration (Kurzfassung)

1. Nutzer wählt in 3D den Blickwinkel → „Foto-Render“.
2. Browser macht einen Screenshot (1600 px, JPEG) und schickt ihn mit Plan und Stil an `/api/render`.
3. Der Server baut den Prompt aus Stil, tatsächlich platzierten Möbeln und Wünschen (`buildRenderPrompt` in `core`) und legt das Bild unter einer öffentlichen URL ab.
4. `HiggsfieldProvider.submit()` → Job-ID → Status per Polling (Phase 1: Webhook).
5. Ergebnis → Anzeige, Download, später Galerie und Teilen-Link.

Kostenkontrolle: Credits pro Nutzer, Rate-Limit pro IP/Konto, Caching identischer Anfragen, Moderation vor dem Senden.
**Offen:** Die genauen Endpunkte und Feldnamen der Higgsfield-API sind konfigurierbar umgesetzt und müssen mit dem eigenen API-Zugang gegen die aktuelle Doku geprüft werden. Checkliste in `HIGGSFIELD.md`.

## 8. Geschäftsmodell

| Plan | Preis (Hypothese) | Inhalt |
|------|------------------|--------|
| **Free** | 0 € | unbegrenzt planen, 3D und Rundgang, 3 Foto-Renders/Monat (Wasserzeichen), 1 Cloud-Projekt |
| **Plus** | 7,99 €/Monat oder 49 €/Jahr | 60 Renders/Monat in HD ohne Wasserzeichen, unbegrenzt Projekte, Video-Clips, Stil-Serien |
| **Credits** | 4,99 € für 20 Renders | für Einmal-Umzügler (oft die beste Conversion) |
| **Pro/Makler** | ab 49 €/Monat | Branding, Exposé-Export, Home-Staging, Einbettung, Team |

Weitere Erlösquellen: Affiliate (Möbel), Leads für Handwerker oder Küchenstudios (Phase 3).
**Unit Economics prüfen:** Kosten pro Render (Higgsfield-Preis × Versuche) müssen deutlich unter 0,25 € liegen, damit „Plus“ profitabel ist. Sonst die Render-Kontingente anpassen.

## 9. Go-to-Market über Social Media

**Content-Formate (wiederholbar, mit dem Produkt erzeugt):**
1. **„Grundriss → Traumwohnung in 60 Sekunden“:** Screenrecording, Upload, 3D, Rundgang, Render. Das wichtigste Format.
2. **„Rate den Grundriss“ und „Würdest du hier wohnen?“:** Exposé-Grundrisse von Followern einrichten (mit Einverständnis).
3. **Stil-Battle:** dieselbe Wohnung in Japandi vs. Industrial, Kommentare stimmen ab.
4. **„Passt das Sofa?“:** typische Fehlkäufe, gemessen und visualisiert.
5. **Vorher/Nachher-Slider** aus echten Nutzerprojekten (Opt-in-Galerie).

**Kanäle:** TikTok und Instagram Reels (Reichweite), Pinterest (Evergreen-Traffic, Interior-affin!), YouTube Shorts, später SEO-Landingpages („Grundriss in 3D umwandeln“, „Wohnung einrichten online“).
**Wachstumsschleife im Produkt:** Jeder Render und Clip trägt ein dezentes Wasserzeichen mit Link (Free-Plan), und jeder Teilen-Link ist eine Landingpage.
**Kooperationen:** Interior-Creator mit Creator-Code (Plus gratis + Rev-Share), Umzugsunternehmen, Immobilienportale.
**Launch-Sequenz:** Warteliste mit 3 viralen Demo-Videos → Beta mit 200 Nutzer:innen → Product Hunt / Hacker News (DE: t3n, OMR-Community) → bezahlte Tests mit 500–1000 € Budget auf dem besten organischen Clip.

## 10. Kennzahlen

| Metrik | Ziel MVP |
|--------|----------|
| Zeit bis zur ersten 3D-Ansicht | < 3 Min (Median) |
| Anteil Besucher → Projekt mit ≥ 1 Raum | > 35 % |
| Anteil Projekte mit Render | > 25 % |
| Teilen-Rate pro Render | > 10 % |
| Free → Paid | 2–4 % |
| D30-Retention (Plus) | > 60 % |

## 11. Risiken und Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|--------|----------------|
| KI-Bilder weichen vom Raum ab (Fenster falsch, Möbel erfunden) | Struktur-Referenz plus präziser Prompt aus echten Möbeln; Anbieter austauschbar; optional ControlNet (Tiefe/Kanten) als eigener Dienst |
| Render-Kosten fressen Marge | Credits, Rate-Limits, Caching, kleinere Vorschau-Renders vor dem HD-Render |
| Grundrisserkennung ungenau | Editor bleibt Kern; Erkennung als „Vorschlag“; Nutzerkorrekturen (mit Einwilligung) als Trainingsdaten |
| Abhängigkeit von Higgsfield (API-Änderungen, Preise) | Provider-Interface, tolerante Antwortauswertung, zweiter Anbieter vorbereitet |
| Urheberrecht an Grundrissen (Exposés, Architektenpläne) | Nutzer versichert Rechte; Bilder bleiben privat; Galerie nur mit Opt-in |
| DSGVO | EU-Hosting, Datensparsamkeit, AVVs, keine Grundrisse in Logs, Löschfunktion |
| Performance auf schwachen Handys | prozedurale Low-Poly-Modelle, LOD, Schatten abschaltbar, `dpr`-Begrenzung |

## 12. Roadmap

| Woche | Meilenstein |
|-------|-------------|
| 0 ✅ | Fundament: Editor, 3D, Rundgang, Render-Pipeline (dieses Repo) |
| 1–2 | Higgsfield-Zugang verifizieren, Prompt-Tuning mit 50 Testbildern, Webhooks |
| 2–4 | Supabase (Auth, Projekte, Storage), Teilen-Links mit OG-Bildern, Stripe |
| 4–6 | Mobile Viewer und Touch-Bedienung, GLB-Möbel (~60 Modelle), Raumtypen |
| 6–8 | Landingpage, Rechtliches, Analytics, Beta mit Warteliste, erste Creator |
| 8–12 | KI-Grundrisserkennung (Weg A), Video-Kamerafahrt, Stil-Serien → Public Launch |
| 12+ | Auto-Einrichten, Makler-Paket, Händler-Katalog |

## 13. Team und Budget (Orientierung)

- **Solo mit Claude Code:** Phase 1 ist realistisch. Laufende Kosten am Anfang: Hosting 0–50 €/Monat, Supabase 25 €/Monat, Higgsfield nutzungsabhängig.
- **Sinnvolle Ergänzungen:** 3D-Artist (Freelance, Möbelmodelle), Content-Creator:in für Social Media.
- **Größter Kostentreiber:** Render-Kosten. Deshalb Credits von Anfang an.

## 14. Nächste konkrete Schritte

1. Lokal starten (`README.md`) und die Beispielwohnung ausprobieren.
2. Higgsfield-API-Zugang besorgen und die Checkliste in `docs/HIGGSFIELD.md` abarbeiten.
3. Namen und Domain festlegen und eine Warteliste-Landingpage aufsetzen.
4. Mit Claude Code Phase 1 Punkt für Punkt umsetzen. Die Aufgaben stehen in `CLAUDE.md` unter „Roadmap-Aufgaben“.
