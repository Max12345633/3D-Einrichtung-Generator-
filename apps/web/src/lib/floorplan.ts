import { applyDetectedWalls, detectWalls, scalePlanGeometry, type Plan } from "@raumwerk/core";
import { loadImage } from "./files";

/** Typische Innenwand in Deutschland (11,5 cm Mauerwerk + Putz ≈ 12 cm) – für die Maßstabs-Schätzung. */
const TYPICAL_INNER_WALL_M = 0.12;

export interface DetectionSummary {
  plan: Plan;
  walls: number;
  doors: number;
  windows: number;
  estimatedScale: boolean;
}

/**
 * Erkennt Wände im hinterlegten Grundriss-Bild und baut daraus den Plan.
 * Ist der Maßstab noch nicht kalibriert, wird er aus der Innenwandstärke geschätzt.
 */
export async function detectFromBackground(plan: Plan): Promise<DetectionSummary> {
  const bg = plan.background;
  if (!bg) throw new Error("Kein Grundriss-Bild hinterlegt");
  const img = await loadImage(bg.dataUrl);
  const c = document.createElement("canvas");
  c.width = bg.widthPx;
  c.height = bg.heightPx;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  // Kurz der Oberfläche Zeit geben, den Lade-Hinweis zu zeichnen
  await new Promise((r) => setTimeout(r, 30));
  const result = detectWalls(data, c.width, c.height, { metersPerPixel: bg.calibrated ? bg.metersPerPixel : undefined });

  let base = plan;
  let estimatedScale = false;
  if (!bg.calibrated && result.wallThickness > 0) {
    const guess = TYPICAL_INNER_WALL_M / result.wallThickness;
    // nur plausible Schätzungen übernehmen (Wohnung zwischen ~4 m und ~60 m Bildbreite)
    if (guess * c.width > 4 && guess * c.width < 60) {
      base = scalePlanGeometry(plan, guess / bg.metersPerPixel, bg.origin);
      estimatedScale = true;
    }
  }
  const next = applyDetectedWalls(base, result, base.background!);
  return {
    plan: { ...next, background: { ...next.background!, opacity: Math.min(next.background!.opacity, 0.35) } },
    walls: next.walls.length,
    doors: next.openings.filter((o) => o.kind === "door").length,
    windows: next.openings.filter((o) => o.kind === "window").length,
    estimatedScale,
  };
}
