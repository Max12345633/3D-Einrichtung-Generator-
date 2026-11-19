# Higgsfield-Anbindung (optional, derzeit nicht genutzt)

> **Stand:** Fotorealistische Bilder rendert die App inzwischen **selbst im Browser** (Path-Tracing + KI-Entrauschen, siehe `apps/web/src/viewer/photo.ts`).
> Dieser Adapter bleibt als Option für später, z. B. für KI-„Restyling“ eines selbst gerenderten Bildes.

Die Bildgenerierung läuft **ausschließlich über den Server** (`apps/api`). Der API-Key landet nie im Browser.

## Ablauf

```
Browser                         apps/api                              Higgsfield
  │ POST /api/render              │                                       │
  │ {plan, style, imageDataUrl} ─►│ parsePlan() · buildRenderPrompt()     │
  │                               │ Bild → /api/uploads/{id} (öffentlich) │
  │                               │ HiggsfieldProvider.submit() ─────────►│
  │◄──────── 202 {job, prompt} ───│◄──────────────── Job-ID ──────────────│
  │ GET /api/render/{id} (Polling)│ HiggsfieldProvider.status() ─────────►│
  │◄──── {status, imageUrl} ──────│◄─────── Status / Ergebnis-URL ────────│
```

Code: `apps/api/src/providers/higgsfield.ts` · Prompt: `packages/core/src/prompt.ts`

## Konfiguration (`.env`)

| Variable | Bedeutung |
|----------|-----------|
| `RENDER_PROVIDER` | `mock` (lokal, ohne Key) oder `higgsfield` |
| `HIGGSFIELD_API_KEY` / `HIGGSFIELD_API_SECRET` | Zugangsdaten aus dem Higgsfield-Dashboard |
| `HIGGSFIELD_BASE_URL` | Basis-URL der API |
| `HIGGSFIELD_SUBMIT_PATH` | Endpunkt zum Starten eines Jobs |
| `HIGGSFIELD_STATUS_PATH` | Status-Endpunkt, `{id}` wird ersetzt |
| `PUBLIC_BASE_URL` | Öffentliche URL der API, damit Higgsfield das Referenzbild laden kann (lokal z. B. per `cloudflared tunnel`) |

## ⚠️ Vor dem Livegang prüfen (Checkliste)

Die Higgsfield-Doku war beim Erstellen dieses Codes aus der Entwicklungsumgebung nicht erreichbar. Endpunkte, Header und Feldnamen sind deshalb **als Annahme umgesetzt und konfigurierbar**. Mit dem eigenen API-Zugang prüfen:

- [ ] Basis-URL und Pfade für Bildgenerierung **mit Referenzbild** (Image-to-Image bzw. Bild-Referenz), dann `HIGGSFIELD_SUBMIT_PATH` setzen
- [ ] Auth-Header-Namen (im Code: `hf-api-key`, `hf-secret`; bei Abweichung `headers()` anpassen)
- [ ] Body-Felder: Prompt, Bildgröße oder Seitenverhältnis, Referenzbild (URL oder Upload?), Stärke des Referenzbilds, Modell oder Stil-ID
- [ ] Antwortformat: Feldname der Job-ID; Statuswerte; Pfad zur Ergebnis-URL (`parseHiggsfieldStatus` ist tolerant, Test in `apps/api/test/api.test.ts` mit echter Beispielantwort ergänzen)
- [ ] **Webhooks** verfügbar? Dann Polling durch `POST /api/webhooks/higgsfield` ersetzen (Signatur prüfen!)
- [ ] Preis pro Bild und Rate-Limits, dann Credit-Preise in `PLAN.md` §8 kalibrieren
- [ ] Nutzungsrechte an generierten Bildern (kommerziell, Social Media), Moderationsregeln, Datenverarbeitung (AVV, Serverstandort)
- [ ] Welches Modell hält die **Raumgeometrie** am besten ein? 20 Testszenen × Stile vergleichen, beste Einstellungen als Default

## Qualitätstipps für strukturtreue Renders

- Referenzbild in **Augenhöhe** (Rundgang) liefert deutlich realistischere Ergebnisse als die Vogelperspektive. Im UI darauf hinweisen.
- „Wände niedrig“ vor dem Render ausschalten (sonst rendert die KI halbe Wände).
- Prompt nennt nur Möbel, die wirklich platziert sind (`buildRenderPrompt`), damit nichts erfunden wird.
- Falls ein Higgsfield-Modell die Geometrie zu frei interpretiert: einen zusätzlichen Anbieter mit ControlNet (Depth/Canny) als zweiten `RenderProvider` anbinden. Die Tiefenkarte lässt sich direkt aus three.js rendern.
