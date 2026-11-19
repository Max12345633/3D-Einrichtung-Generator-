# CLAUDE.md – Raumwerk

3D-Einrichtungsplaner: Grundriss → 3D-Wohnung → einrichten → fotorealistisches Bild (eigener Path-Tracer im Browser, kein externer Dienst).
Produktplan: `docs/PLAN.md` · Architektur: `docs/ARCHITEKTUR.md` · Bild-KI: `docs/HIGGSFIELD.md`

## Befehle

```bash
npm install            # einmalig (npm workspaces)
npm run dev            # API (8787, Möbel-Import) + Web (5173, proxy /api)
npm test               # vitest: core + api
npm run typecheck      # alle Pakete
npm run build          # core-Typcheck, API-Bundle (tsup), Web (vite)
```

## Regeln für Änderungen

- Geometrie und Plan-Logik gehören nach `packages/core` (pure, immutable, **mit Test**). UI-Komponenten rufen nur Operationen auf.
- Einheiten: Meter/Radiant. 2D-y = 3D-z, `rotation3D.y = -rotation2D`. Möbel-Vorderseite = lokal +y.
- Zustandsänderungen über `commit()` (Undo). Drags: `beginGesture()` + `live()`.
- Wände müssen sich an Endpunkten treffen (sonst keine Raumerkennung) → immer `addWall` aus `core` nutzen.
- Secrets nur in `apps/api` (`.env`), nie im Frontend. Externe Eingaben mit zod validieren.
- UI-Texte auf Deutsch, Du-Form, kurz. Jede neue Interaktion braucht einen Hinweistext (`hintFor` im Editor).
- Nach UI-Änderungen: App starten und mit Playwright einen Screenshot prüfen (2D, geteilt, 3D).
- Neue Abhängigkeiten sparsam; three.js-Code nur in `apps/web/src/viewer` (lazy geladen).
- Foto-Render: `viewer/photo.ts` (Path-Tracer, Licht-Setup), `viewer/denoise.ts` (OIDN/WebGPU), `viewer/materials.ts` (prozedurale Texturen).
  Objekte, die nur in Echtzeit sichtbar sein sollen (Glas, Hilfsflächen, Echtzeit-Lichter), bekommen `userData={{ noPhoto: true }}`.
- Shop-Import: Parsing rein in `packages/core/src/productImport.ts` – **jedes neue Shop-Format als HTML-Fixture in
  `packages/core/test/fixtures/` + Test**. Server-Abruf nur über `safeFetch` (SSRF-Schutz) in `apps/api`.
  `IMPORT_ALLOW_PRIVATE=1` nur für lokale Tests mit Fixture-Server, niemals in Produktion.
- Importierte Möbel liegen in `plan.customCatalog`; `registerCatalogEntries` (Store-Listener) macht sie für `CATALOG_BY_ID` sichtbar.
- Foto-Render ohne GPU testen: `http://localhost:5173/?phototest=8` (nur Dev) rendert klein mit 8 Samples.

## Roadmap-Aufgaben (Phase 1, in dieser Reihenfolge)

0. Shop-Import: echte Shopseiten (IKEA, OTTO, home24, Westwing, XXXLutz, Amazon) testen und Fixtures ergänzen; DNS-Pinning in safeFetch;
   GLB-Upload für Herstellermodelle; Affiliate-Links (Awin/Partnerprogramme) für die Einkaufsliste
1. Foto-Render: Albedo/Normal-Hilfsbilder für OIDN (bessere Texturdetails), Kamera-Presets pro Raum, Batch „alle Räume“
2. Supabase: Auth (Magic Link + Google), Tabelle `projects` (jsonb plan), Storage für Renders, RLS
3. Teilen-Links `/p/:slug` (read-only Viewer, OG-Image) – Router einführen (react-router)
4. Stripe: Plus-Abo (HD/Max-Renders, Video, Cloud-Projekte)
5. Video-Kamerafahrt (WebCodecs) für Social Media; Renders in der Cloud speichern (Supabase Storage/R2)
6. Mobile: Touch-Pinch im 2D-Editor, Bottom-Sheet-Panels, Viewer-only-Modus
7. GLB-Möbel (`modelUrl` im Katalog, Fallback prozedural), Raumtypen/-namen
8. Landingpage, Impressum/Datenschutz/AGB, Plausible/PostHog, Sentry
