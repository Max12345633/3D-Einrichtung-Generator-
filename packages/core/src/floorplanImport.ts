import type { DetectionResult } from "./floorplanDetect";
import { createId } from "./ids";
import { distance } from "./math";
import { addOpening, addWall, updateOpening } from "./ops";
import type { BackgroundImage, Plan, Vec2 } from "./types";
import { DEFAULT_WALL_HEIGHT, wallLength } from "./walls";

/** Bildpixel → Meter im Plan (über Ursprung und Maßstab des Hintergrundbilds). */
export const pixelToWorld = (p: { x: number; y: number }, bg: Pick<BackgroundImage, "origin" | "metersPerPixel">): Vec2 => ({
  x: bg.origin.x + p.x * bg.metersPerPixel,
  y: bg.origin.y + p.y * bg.metersPerPixel,
});

/**
 * Übernimmt erkannte Wände/Öffnungen in den Plan. Bestehende Wände und Öffnungen werden ersetzt
 * (Möbel bleiben). Wandenden, die sehr nah beieinander liegen, werden zu einem Knoten verschmolzen.
 */
export function applyDetectedWalls(plan: Plan, result: DetectionResult, bg: Pick<BackgroundImage, "origin" | "metersPerPixel">): Plan {
  const mpp = bg.metersPerPixel;
  let next: Plan = { ...plan, walls: [], openings: [] };
  const nodes: Vec2[] = [];
  const snapNode = (p: Vec2, tol: number): Vec2 => {
    const hit = nodes.find((n) => distance(n, p) <= tol);
    if (hit) return hit;
    nodes.push(p);
    return p;
  };
  // Dicke Wände zuerst: Außenwände bestimmen die Knoten
  const walls = [...result.walls].sort((p, q) => q.thickness - p.thickness);
  for (const w of walls) {
    const thickness = Math.min(0.5, Math.max(0.08, Math.round(w.thickness * mpp * 100) / 100));
    const tol = Math.max(0.03, thickness * 0.6);
    const a = snapNode(pixelToWorld(w.a, bg), tol);
    const b = snapNode(pixelToWorld(w.b, bg), tol);
    next = addWall(next, a, b, thickness, DEFAULT_WALL_HEIGHT, Math.max(0.03, thickness * 0.5)).plan;
  }
  for (const o of result.openings) {
    const at = pixelToWorld(o.center, bg);
    const res = addOpening(next, o.kind, at, 0.5);
    if (!res.opening) continue;
    const wall = res.plan.walls.find((w) => w.id === res.opening!.wallId)!;
    const width = Math.min(o.width * mpp, wallLength(wall) - 0.05);
    const kind = o.kind;
    // Breite Lücken in Außenwänden sind meist Fenstertüren/Panoramafenster
    const patch = kind === "window"
      ? { width: Math.max(0.5, width), height: width > 1.8 ? 2.1 : 1.35, sill: width > 1.8 ? 0.05 : 0.85 }
      : { width: Math.min(1.4, Math.max(0.6, width)) };
    next = updateOpening(res.plan, res.opening.id, patch);
  }
  return { ...next, updatedAt: new Date().toISOString(), id: plan.id || createId("plan") };
}

/**
 * Skaliert die Geometrie um `factor` um den Punkt `about` – z. B. wenn der Maßstab erst nach der
 * Wanderkennung kalibriert wird. Wände (inkl. Stärke) und Öffnungen werden mitskaliert,
 * Möbel nur verschoben (ihre Größe ist ja echt).
 */
export function scalePlanGeometry(plan: Plan, factor: number, about: Vec2 = { x: 0, y: 0 }): Plan {
  if (!(factor > 0) || factor === 1) return plan;
  const sp = (p: Vec2): Vec2 => ({ x: about.x + (p.x - about.x) * factor, y: about.y + (p.y - about.y) * factor });
  return {
    ...plan,
    walls: plan.walls.map((w) => ({ ...w, a: sp(w.a), b: sp(w.b), thickness: Math.min(0.6, Math.max(0.05, w.thickness * factor)) })),
    openings: plan.openings.map((o) => ({ ...o, offset: o.offset * factor, width: o.width * factor })),
    furniture: plan.furniture.map((f) => ({ ...f, position: sp(f.position) })),
    background: plan.background ? { ...plan.background, origin: sp(plan.background.origin), metersPerPixel: plan.background.metersPerPixel * factor } : undefined,
    updatedAt: new Date().toISOString(),
  };
}
