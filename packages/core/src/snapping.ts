import { distance, projectOnSegment } from "./math";
import type { Vec2, Wall } from "./types";

export interface SnapOptions {
  grid: number;
  /** Fangradius für Endpunkte/Wände in Metern */
  tolerance: number;
  /** Bezugspunkt (z. B. Start der aktuellen Wand) für Winkelfang */
  anchor?: Vec2;
  /** Winkelraster in Grad (0 = aus) */
  angleStepDeg: number;
}

export type SnapKind = "endpoint" | "wall" | "angle" | "grid" | "none";

export interface SnapResult {
  point: Vec2;
  kind: SnapKind;
  wallId?: string;
}

const snapToGrid = (p: Vec2, g: number): Vec2 => (g > 0 ? { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g } : p);

/** Priorität: Wand-Endpunkt > Punkt auf Wand > Winkel (relativ zum Anker) > Raster. */
export function snapPoint(p: Vec2, walls: Wall[], opts: SnapOptions): SnapResult {
  let best: { point: Vec2; d: number } | null = null;
  for (const w of walls) {
    for (const e of [w.a, w.b]) {
      const d = distance(p, e);
      if (d <= opts.tolerance && (!best || d < best.d)) best = { point: e, d };
    }
  }
  if (best) return { point: { ...best.point }, kind: "endpoint" };

  for (const w of walls) {
    const pr = projectOnSegment(p, w.a, w.b);
    if (pr.dist <= opts.tolerance * 0.6) return { point: pr.point, kind: "wall", wallId: w.id };
  }

  if (opts.anchor && opts.angleStepDeg > 0) {
    const dx = p.x - opts.anchor.x;
    const dy = p.y - opts.anchor.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) {
      const step = (opts.angleStepDeg * Math.PI) / 180;
      const ang = Math.round(Math.atan2(dy, dx) / step) * step;
      const snappedLen = opts.grid > 0 ? Math.max(opts.grid, Math.round(len / opts.grid) * opts.grid) : len;
      return {
        point: { x: opts.anchor.x + Math.cos(ang) * snappedLen, y: opts.anchor.y + Math.sin(ang) * snappedLen },
        kind: "angle",
      };
    }
  }
  return { point: snapToGrid(p, opts.grid), kind: opts.grid > 0 ? "grid" : "none" };
}
