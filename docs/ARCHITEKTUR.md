# Architektur

## Verzeichnisstruktur

```
packages/core/         Reine TypeScript-Logik (keine UI, keine DOM-Abhängigkeit)
  src/types.ts         Datenmodell: Plan, Wall, Opening, FurnitureItem (Meter, Radiant)
  src/plan.ts          zod-Schema, parsePlan, emptyPlan, samplePlan (Beispielwohnung)
  src/ops.ts           Immutable Plan-Operationen (addWall mit T-Stoß-Teilung, moveJunction, …)
  src/walls.ts         Wandgeometrie, Öffnungen ausschneiden (wallBoxes), splitWall
  src/rooms.ts         Raumerkennung (Flächen des planaren Wandgraphen)
  src/snapping.ts      Einrasten: Knoten > Wand > Winkel > Raster
  src/furniture.ts     Grundflächen, Kollision (SAT), Wand-Überschneidung
  src/catalog.ts       Möbelkatalog
  src/prompt.ts        Render-Stile + Prompt-Bau
  test/                vitest

apps/web/              React-Frontend
  src/store/planStore.ts   Zustand: Plan, Undo/Redo (Gesten), Werkzeuge, Persistenz (localStorage)
  src/editor/Editor2D.tsx  SVG-Editor (Kamera, Werkzeuge, Drag, Vorschauen, Kalibrierung)
  src/viewer/Viewer3D.tsx  three.js-Szene, Orbit/Rundgang, 3D-Drag, Screenshot-Bridge
  src/viewer/FurnitureMesh.tsx  Prozedurale Möbel (später GLB)
  src/ui/                  TopBar, LeftPanel (Werkzeuge + Katalog), Inspector, StartScreen, RenderDialog
  src/lib/                 API-Client, Datei-Helfer, Formatierung, Tastenkürzel

apps/api/              Hono-Server (Node; läuft auch auf Cloudflare Workers/Bun)
  src/app.ts           Routen: /api/health, /api/render, /api/render/:id, /api/uploads/:id
  src/providers/       RenderProvider-Interface, MockProvider, HiggsfieldProvider
  src/uploads.ts       Flüchtiger Bildspeicher (→ R2/S3)
  src/rateLimit.ts     Sliding-Window-Limit (→ Redis)
```

## Konventionen

- **Einheiten:** Meter und Radiant. Im 2D ist y nach unten (SVG), in 3D gilt 2D-y = 3D-z und `rotation.y = -rotation2D`.
- **Möbel-Lokalsystem:** Breite = x, Tiefe = y/z, **Vorderseite = +y (2D) / +z (3D)**, Rückseite an der Wand.
- **Wände treffen sich an Endpunkten.** `addWall` teilt bestehende Wände bei T-Stößen, sonst funktioniert die Raumerkennung nicht.
- **Zustandsänderungen:** immer über `commit(recipe)` (mit Undo). Für Drag-Gesten einmal `beginGesture()` und dann `live(recipe)`.
- **Neue Logik zuerst in `core` mit Test**, die UI ruft nur Operationen auf.
- **Server ist die einzige Stelle mit Secrets.** Eingaben werden mit zod validiert (`parsePlan`).

## Datenfluss beim Bearbeiten

```
Pointer-Event (2D/3D) ─► Store-Action ─► core-Operation (pure) ─► neuer Plan
                                                            └─► History (past/future)
Plan ─► useMemo(detectRooms / findCollisions / wallBoxes) ─► SVG + three.js rendern
Plan ─► persist (localStorage, später Supabase)
```
