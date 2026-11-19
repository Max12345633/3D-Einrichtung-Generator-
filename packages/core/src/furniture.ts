import { CATALOG_BY_ID } from "./catalog";
import { add, dot, projectOnSegment, rotate, sub } from "./math";
import type { FurnitureItem, Vec2, Wall } from "./types";

/** Die vier Ecken der Grundfläche eines Möbelstücks (gedreht). */
export function footprint(item: FurnitureItem): Vec2[] {
  const entry = CATALOG_BY_ID[item.catalogId];
  if (!entry) return [];
  const hw = entry.width / 2;
  const hd = entry.depth / 2;
  return [
    { x: -hw, y: -hd }, { x: hw, y: -hd }, { x: hw, y: hd }, { x: -hw, y: hd },
  ].map((c) => add(item.position, rotate(c, item.rotation)));
}

/** Separating-Axis-Test für zwei konvexe Polygone. */
export function polygonsOverlap(p: Vec2[], q: Vec2[]): boolean {
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const e = sub(poly[(i + 1) % poly.length]!, poly[i]!);
      const axis = { x: -e.y, y: e.x };
      const proj = (pts: Vec2[]) => {
        let min = Infinity, max = -Infinity;
        for (const pt of pts) { const d = dot(pt, axis); min = Math.min(min, d); max = Math.max(max, d); }
        return { min, max };
      };
      const a = proj(p);
      const b = proj(q);
      if (a.max <= b.min + 1e-6 || b.max <= a.min + 1e-6) return false;
    }
  }
  return true;
}

/** Teppiche dürfen überlappen; sonst Kollision = Überlappung der Grundflächen. */
export function findCollisions(items: FurnitureItem[]): Set<string> {
  const hits = new Set<string>();
  const solid = items.filter((i) => CATALOG_BY_ID[i.catalogId]?.shape !== "rug");
  const fps = solid.map(footprint);
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      if (polygonsOverlap(fps[i]!, fps[j]!)) { hits.add(solid[i]!.id); hits.add(solid[j]!.id); }
    }
  }
  return hits;
}

/** Steht das Möbelstück in einer Wand? (Ecke oder Mittelpunkt näher als halbe Wandstärke) */
export function intersectsWall(item: FurnitureItem, walls: Wall[]): boolean {
  const fp = footprint(item);
  if (fp.length === 0) return false;
  // Kanten der Grundfläche gegen Wandachse testen, über Abstand der Wandachse zu den Kanten
  for (const w of walls) {
    const half = w.thickness / 2 - 0.005;
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i]!;
      const b = fp[(i + 1) % fp.length]!;
      if (segmentDistance(a, b, w.a, w.b) < half) return true;
    }
  }
  return false;
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const cross = (o: Vec2, p: Vec2, q: Vec2) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export function segmentDistance(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    projectOnSegment(a, c, d).dist, projectOnSegment(b, c, d).dist,
    projectOnSegment(c, a, b).dist, projectOnSegment(d, a, b).dist,
  );
}
