import type { Vec2 } from "./types";

export const EPS = 1e-9;

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (p: Vec2, q: Vec2): Vec2 => ({ x: p.x + q.x, y: p.y + q.y });
export const sub = (p: Vec2, q: Vec2): Vec2 => ({ x: p.x - q.x, y: p.y - q.y });
export const scale = (p: Vec2, s: number): Vec2 => ({ x: p.x * s, y: p.y * s });
export const dot = (p: Vec2, q: Vec2): number => p.x * q.x + p.y * q.y;
export const length = (p: Vec2): number => Math.hypot(p.x, p.y);
export const distance = (p: Vec2, q: Vec2): number => Math.hypot(p.x - q.x, p.y - q.y);
export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

export function normalize(p: Vec2): Vec2 {
  const l = length(p);
  return l < EPS ? { x: 0, y: 0 } : { x: p.x / l, y: p.y / l };
}

export function rotate(p: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Projektion von p auf die Strecke ab. t ∈ [0,1], point = nächster Punkt, dist = Abstand. */
export function projectOnSegment(p: Vec2, a: Vec2, b: Vec2): { t: number; point: Vec2; dist: number } {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  const t = len2 < EPS ? 0 : clamp(dot(sub(p, a), ab) / len2, 0, 1);
  const point = add(a, scale(ab, t));
  return { t, point, dist: distance(p, point) };
}

/** Flächeninhalt eines Polygons (Shoelace), immer positiv. */
export function polygonArea(points: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    sum += p.x * q.y - q.x * p.y;
  }
  return Math.abs(sum) / 2;
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundsOf(points: Vec2[]): Bounds | null {
  if (points.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}
