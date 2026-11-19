# Raumwerk: Grundriss → 3D-Wohnung → einrichten → Foto

Web-App, mit der man aus einem Grundriss in Minuten eine begehbare 3D-Wohnung macht, sie per Drag & Drop einrichtet und **fotorealistische Bilder direkt im Browser** berechnet – mit eigenem Path-Tracer und KI-Entrauschen, ohne externen Dienst.

📄 **Ausführlicher Produkt- und Umsetzungsplan:** [`docs/PLAN.md`](docs/PLAN.md)

![2D-Editor und 3D-Ansicht nebeneinander](docs/screenshots/editor-split.png)

## Funktionen (Stand MVP-Grundgerüst)

- **Grundriss hochladen und automatisch umwandeln:** Wände, Türen und Fenster werden aus dem Bild erkannt (Exposé, Scan, Screenshot; dunkel gefüllte, waagerecht/senkrechte Wände). Maßstab wird aus der Wandstärke geschätzt und lässt sich mit zwei Klicks exakt festlegen – alles skaliert mit
- **Wände zeichnen** mit Einrasten an Knoten, Wänden, 15°-Winkeln und 5-cm-Raster; T-Stöße; Knoten ziehen; Längen bemaßt
- **Türen und Fenster** per Klick auf die Wand, verschiebbar, Maße editierbar
- **Automatische Raumerkennung** mit m²-Angabe
- **Möbelkatalog** (24 Teile): per Klick oder **Drag & Drop** (2D und 3D) platzieren, magnetisches Andocken an Wände, Kollisionswarnung
- **Einfach drehen:** Drehgriff am Möbel, Schnellleiste (±90°, ±15°, an Wand stellen, duplizieren, löschen), R/Q/E drehen schon vor dem Absetzen, Shift+Klick setzt mehrere
- **3D-Ansicht** mit echten Wandöffnungen und Schatten, Möbel auch in 3D verschiebbar, „Wände niedrig“
- **Rundgang** in Augenhöhe (WASD + Maus)
- **Fotorealistische Bilder, selbst gerendert:** GPU-Path-Tracing (indirektes Licht, weiche Schatten, Reflexionen), Portal-Lichter in Fenstern, Sonne aus Fensterrichtung, 3 Lichtstimmungen, bis 1920 × 1080, KI-Entrauschen (Open Image Denoise via WebGPU) mit Filter-Fallback
- **Möbel aus Online-Shops einfügen:** Link zur Produktseite einfügen → Name, **Maße**, Farbe, Bild und Preis werden übernommen (schema.org-Daten und typische Shop-Formate wie „B/H/T: 220/85/95 cm“ oder „Liegefläche 180 × 200“). Für Shops, die automatische Abrufe blocken: **Seitentext kopieren & einfügen** (Strg+A, Strg+C, Strg+V) oder **Lesezeichen-Knopf**. Produktbilder werden als Vorschau im Projekt gespeichert; eigene Bilder per Strg+V, Datei oder Drag & Drop, Farbe wird automatisch erkannt. Dazu eine **Einkaufsliste** mit Summe und Shop-Links
- **7 Einrichtungsstile** (Skandinavisch, Japandi, Industrial …) als ein Klick auf Boden, Wände und Möbelfarben
- **Echte Materialien:** prozedurale Holzdielen, Fliesen (Bad automatisch), Beton, Stoff mit Glanz, Lack, Metall, Keramik; Sockelleisten
- Undo/Redo, automatisches Speichern im Browser, Projekt-Export/-Import (JSON), Tastenkürzel

## Schnellstart

Voraussetzung: Node.js ≥ 22

```bash
npm install
```

```bash
npm run dev
```

Dann http://localhost:5173 öffnen. `npm run dev` startet App **und** den kleinen Server (Port 8787), der für den Möbel-Import Produktseiten abruft. Ein API-Key wird nicht benötigt.

### Möbel aus Online-Shops

Links im Katalog: **„Aus Online-Shop einfügen“** → Link einfügen → Werte prüfen (Badges zeigen „aus Shop“ vs. „bitte prüfen“) → platzieren.
- Viele große Shops blocken Server-Abrufe. Dann den **Lesezeichen-Knopf** aus dem Dialog in die Lesezeichenleiste ziehen, auf der Produktseite anklicken (kopiert die Produktdaten) und im Raumwerk-Dialog mit Strg+V einfügen. Funktioniert auch ohne Server, z. B. in einer statisch gehosteten Version.
- Der Server ruft nur auf Nutzeraktion einzelne Seiten ab, mit SSRF-Schutz (keine internen Adressen, Größen-/Zeitlimit). Produktbilder werden nur verlinkt, nicht gespeichert.

### Foto-Render

3D-Ansicht öffnen → Blickwinkel wählen (am schönsten im **Rundgang** auf Augenhöhe) → „Foto-Render“ → Stil, Licht, Qualität → „Bild berechnen“.
Richtwerte auf einem aktuellen Laptop/Desktop mit Grafikkarte: Entwurf wenige Sekunden, HD ca. 10–40 s, Maximal ca. 1–2 min.
Voraussetzung: WebGL2 (alle aktuellen Browser); für das KI-Entrauschen zusätzlich WebGPU (Chrome/Edge, Safari 18+).

### Optional: externe Bild-KI (später)

`apps/api` enthält einen vorbereiteten, **optionalen** Adapter für Higgsfield (siehe [`docs/HIGGSFIELD.md`](docs/HIGGSFIELD.md)). Er wird aktuell nicht genutzt.

## Tests und Build

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run build
```

## Projektstruktur

```
packages/core   Datenmodell, Geometrie, Raumerkennung, Snapping, Kollision, Prompts (getestet)
apps/web        React + three.js (react-three-fiber) Frontend, Path-Tracer, Materialien
apps/api        optional: Hono-API mit Higgsfield-Adapter (derzeit nicht genutzt)
docs/           Plan, Architektur, Higgsfield
```

Mehr in [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md). Hinweise für die Weiterentwicklung mit Claude Code stehen in [`CLAUDE.md`](CLAUDE.md).
