import { clamp, distance, normalize, projectOnSegment, sub } from "./math";
import type { Opening, Vec2, Wall } from "./types";
import { createId } from "./ids";

export const DEFAULT_WALL_HEIGHT = 2.5;
export const DEFAULT_WALL_THICKNESS = 0.12;
export const EXTERIOR_WALL_THICKNESS = 0.3;

export const wallLength = (w: Wall): number => distance(w.a, w.b);
export const wallAngle = (w: Wall): number => Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
export const wallDirection = (w: Wall): Vec2 => normalize(sub(w.b, w.a));

export function pointOnWall(w: Wall, offset: number): Vec2 {
  const d = wallDirection(w);
  return { x: w.a.x + d.x * offset, y: w.a.y + d.y * offset };
}

/** Ein quaderförmiges Wandstück für den 3D-Aufbau. */
export interface WallBox {
  /** Mittelpunkt in 3D (x, y=Höhe, z) */
  center: [number, number, number];
  /** Größe: Länge entlang der Wand, Höhe, Stärke */
  size: [number, number, number];
  /** Rotation um die Hochachse (three.js: rotation.y) */
  rotationY: number;
}

/** Öffnungen in den gültigen Bereich der Wand zwingen. */
export function clampOpening(o: Opening, wall: Wall): Opening {
  const len = wallLength(wall);
  const width = clamp(o.width, 0.3, Math.max(0.3, len - 0.02));
  const half = width / 2;
  const height = clamp(o.height, 0.3, wall.height);
  const sill = clamp(o.sill, 0, Math.max(0, wall.height - height));
  return { ...o, width, height, sill, offset: clamp(o.offset, half, Math.max(half, len - half)) };
}

/**
 * Zerlegt eine Wand anhand ihrer Öffnungen in Quader:
 * volle Stücke zwischen Öffnungen, plus Brüstung unter und Sturz über jeder Öffnung.
 * Rein (ohne three.js), damit es testbar und serverseitig nutzbar bleibt.
 */
export function wallBoxes(wall: Wall, openings: Opening[], capEnds = false): WallBox[] {
  const len = wallLength(wall);
  if (len < 1e-6) return [];
  const angle = wallAngle(wall);
  const dir = wallDirection(wall);
  const ops = openings
    .filter((o) => o.wallId === wall.id)
    .map((o) => clampOpening(o, wall))
    .sort((p, q) => p.offset - q.offset);

  const boxes: WallBox[] = [];
  const push = (from: number, to: number, bottom: number, top: number) => {
    const l = to - from;
    const h = top - bottom;
    if (l < 1e-4 || h < 1e-4) return;
    const mid = (from + to) / 2;
    boxes.push({
      center: [wall.a.x + dir.x * mid, bottom + h / 2, wall.a.y + dir.y * mid],
      size: [l, h, wall.thickness],
      // three.js dreht gegen den Uhrzeigersinn um +y; 2D-y entspricht 3D-z → Vorzeichen umkehren
      rotationY: -angle,
    });
  };

  // capEnds: volle Wandstücke an den Enden um halbe Stärke verlängern → geschlossene Ecken im 3D
  const cap = capEnds ? wall.thickness / 2 : 0;
  let cursor = 0;
  for (const o of ops) {
    const start = Math.max(cursor, o.offset - o.width / 2);
    const end = o.offset + o.width / 2;
    push(cursor === 0 ? -cap : cursor, start, 0, wall.height);
    push(start, end, 0, o.sill); // Brüstung
    push(start, end, o.sill + o.height, wall.height); // Sturz
    cursor = Math.max(cursor, end);
  }
  push(cursor === 0 ? -cap : cursor, len + cap, 0, wall.height);
  return boxes;
}

export interface WallHit {
  wall: Wall;
  offset: number;
  point: Vec2;
  dist: number;
}

/** Nächstgelegene Wand zu einem Punkt (innerhalb maxDist). */
export function nearestWall(p: Vec2, walls: Wall[], maxDist = Infinity): WallHit | null {
  let best: WallHit | null = null;
  for (const wall of walls) {
    const { t, point, dist } = projectOnSegment(p, wall.a, wall.b);
    if (dist <= maxDist && (!best || dist < best.dist)) best = { wall, offset: t * wallLength(wall), point, dist };
  }
  return best;
}

/**
 * Teilt eine Wand an einem Punkt. Öffnungen werden der passenden Hälfte zugeordnet.
 * Wird benötigt, damit T-Stöße echte Knoten im Wandgraph bilden (Raumerkennung).
 */
export function splitWall(
  wall: Wall,
  at: Vec2,
  openings: Opening[],
): { walls: [Wall, Wall]; openings: Opening[] } | null {
  const { t, point } = projectOnSegment(at, wall.a, wall.b);
  const len = wallLength(wall);
  const cut = t * len;
  if (cut < 0.05 || len - cut < 0.05) return null;
  const w1: Wall = { ...wall, id: createId("wall"), b: point };
  const w2: Wall = { ...wall, id: createId("wall"), a: point };
  const moved = openings.map((o) => {
    if (o.wallId !== wall.id) return o;
    return o.offset <= cut ? { ...o, wallId: w1.id } : { ...o, wallId: w2.id, offset: o.offset - cut };
  });
  return { walls: [w1, w2], openings: moved };
}
