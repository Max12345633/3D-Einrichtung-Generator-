import { z } from "zod";
import { createId } from "./ids";
import { DEFAULT_WALL_HEIGHT, DEFAULT_WALL_THICKNESS, EXTERIOR_WALL_THICKNESS } from "./walls";
import type { Opening, Plan, Wall } from "./types";

const vec2 = z.object({ x: z.number().finite(), y: z.number().finite() });

export const planSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  name: z.string().max(120),
  walls: z.array(z.object({
    id: z.string(), a: vec2, b: vec2,
    thickness: z.number().positive().max(1), height: z.number().positive().max(10),
  })).max(2000),
  openings: z.array(z.object({
    id: z.string(), wallId: z.string(), kind: z.enum(["door", "window"]),
    offset: z.number(), width: z.number().positive(), height: z.number().positive(), sill: z.number().min(0),
  })).max(2000),
  furniture: z.array(z.object({
    id: z.string(), catalogId: z.string(), position: vec2, rotation: z.number().finite(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  })).max(2000),
  floorColor: z.string(),
  wallColor: z.string(),
  background: z.object({
    dataUrl: z.string(), widthPx: z.number().positive(), heightPx: z.number().positive(), metersPerPixel: z.number().positive(), origin: vec2, opacity: z.number().min(0).max(1),
  }).optional(),
  updatedAt: z.string(),
});

/** Validiert unbekannte Daten (Import, LocalStorage, API) zu einem Plan. */
export function parsePlan(data: unknown): Plan {
  return planSchema.parse(data) as Plan;
}

export function emptyPlan(name = "Meine Wohnung"): Plan {
  return {
    version: 1, id: createId("plan"), name, walls: [], openings: [], furniture: [],
    floorColor: "#cdb293", wallColor: "#f3f1ec", updatedAt: new Date().toISOString(),
  };
}

/** Polyline → Wände (geschlossen, wenn closed=true). */
export function wallsFromPolyline(points: [number, number][], closed: boolean, thickness: number, height = DEFAULT_WALL_HEIGHT): Wall[] {
  const walls: Wall[] = [];
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    walls.push({ id: createId("wall"), a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, thickness, height });
  }
  return walls;
}

/**
 * Beispielwohnung (2 Zimmer, Küche, Bad, ~62 m²), damit neue Nutzer sofort etwas Schönes sehen.
 * Wände treffen sich ausschließlich an Endpunkten, damit die Raumerkennung greift.
 */
export function samplePlan(): Plan {
  const T = DEFAULT_WALL_THICKNESS;
  const E = EXTERIOR_WALL_THICKNESS;
  const H = DEFAULT_WALL_HEIGHT;
  const mk = (ax: number, ay: number, bx: number, by: number, t: number): Wall =>
    ({ id: createId("wall"), a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness: t, height: H });

  // Außenhülle 10 x 6.2 m; Innenwände bei x=6 (vertikal) und y=3.6 (horizontal, rechts), y=2.4 (links unten: Bad/Flur)
  const top1 = mk(0, 0, 6, 0, E), top2 = mk(6, 0, 10, 0, E);
  const right1 = mk(10, 0, 10, 3.6, E), right2 = mk(10, 3.6, 10, 6.2, E);
  const bottom1 = mk(10, 6.2, 6, 6.2, E), bottom2 = mk(6, 6.2, 3.2, 6.2, E), bottom3 = mk(3.2, 6.2, 0, 6.2, E);
  const left1 = mk(0, 6.2, 0, 0, E);
  const mid1 = mk(6, 0, 6, 3.6, T);
  const rightSplit = mk(6, 3.6, 10, 3.6, T);
  const bathTop = mk(3.2, 4.0, 6, 4.0, T);
  const bathLeft = mk(3.2, 4.0, 3.2, 6.2, T);
  // bathTop endet bei x=6 → die Mittelwand ist dort geteilt (mid2a/mid2b), damit ein echter Knoten entsteht
  const mid2a = mk(6, 3.6, 6, 4.0, T), mid2b = mk(6, 4.0, 6, 6.2, T);
  const walls = [top1, top2, right1, right2, bottom1, bottom2, bottom3, left1, mid1, mid2a, mid2b, rightSplit, bathTop, bathLeft];

  const door = (wall: Wall, offset: number, width = 0.9): Opening =>
    ({ id: createId("op"), wallId: wall.id, kind: "door", offset, width, height: 2.05, sill: 0 });
  const win = (wall: Wall, offset: number, width = 1.4, sill = 0.85, height = 1.4): Opening =>
    ({ id: createId("op"), wallId: wall.id, kind: "window", offset, width, height, sill });

  const openings: Opening[] = [
    win(top1, 1.8, 1.6), win(top1, 4.4, 1.6), win(top2, 2.0, 1.4),
    win(right2, 1.3, 1.2), win(left1, 2.6, 1.2), win(bottom1, 2.0, 1.4),
    door(mid1, 2.6), door(rightSplit, 0.9), door(bathTop, 1.0, 0.8), door(bottom3, 1.4, 1.0),
  ];

  const f = (catalogId: string, x: number, y: number, rotation = 0) =>
    ({ id: createId("item"), catalogId, position: { x, y }, rotation });
  const furniture = [
    f("rug-l", 3.0, 1.8), f("sofa-3", 3.0, 2.8, Math.PI), f("coffee-table", 3.0, 1.85), f("tv-board", 3.0, 0.4),
    f("armchair", 1.2, 2.1, Math.PI / 2), f("plant", 5.4, 0.6), f("floor-lamp", 4.6, 3.3),
    f("kitchen-row", 1.7, 5.72, Math.PI), f("dining-table", 1.6, 4.3), f("dining-chair", 1.1, 3.57), f("dining-chair", 2.1, 3.57),
    f("dining-chair", 1.1, 5.02, Math.PI), f("dining-chair", 2.1, 5.02, Math.PI),
    f("bed-double", 8.0, 1.25), f("nightstand", 6.85, 0.4), f("nightstand", 9.15, 0.4), f("wardrobe", 8.0, 3.2, Math.PI),
    f("desk", 8.6, 5.68, Math.PI), f("office-chair", 8.6, 5.0), f("shelf", 6.35, 5.0, Math.PI / 2),
    f("bathtub", 4.6, 5.66), f("toilet", 3.55, 4.5), f("sink", 5.5, 4.4),
  ];

  return { ...emptyPlan("Beispielwohnung · 2 Zimmer"), walls, openings, furniture };
}
