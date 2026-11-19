# CLAUDE.md – Raumwerk

3D-Einrichtungsplaner: Grundriss → 3D-Wohnung → einrichten → fotorealistisches Bild (Higgsfield).
Produktplan: `docs/PLAN.md` · Architektur: `docs/ARCHITEKTUR.md` · Bild-KI: `docs/HIGGSFIELD.md`

## Befehle

```bash
npm install            # einmalig (npm workspaces)
npm run dev            # API (8787) + Web (5173, proxy /api)
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

## Roadmap-Aufgaben (Phase 1, in dieser Reihenfolge)

1. Higgsfield-Checkliste in `docs/HIGGSFIELD.md` abarbeiten (echte Antwort als Test-Fixture)
2. Supabase: Auth (Magic Link + Google), Tabelle `projects` (jsonb plan), Storage für Renders, RLS
3. Teilen-Links `/p/:slug` (read-only Viewer, OG-Image) – Router einführen (react-router)
4. Stripe: Credits + Plus-Abo, Credit-Abzug serverseitig in `/api/render`
5. Webhook statt Polling für Renders; Uploads → Cloudflare R2; Rate-Limit → Upstash Redis
6. Mobile: Touch-Pinch im 2D-Editor, Bottom-Sheet-Panels, Viewer-only-Modus
7. GLB-Möbel (`modelUrl` im Katalog, Fallback prozedural), Raumtypen/-namen
8. Landingpage, Impressum/Datenschutz/AGB, Plausible/PostHog, Sentry
