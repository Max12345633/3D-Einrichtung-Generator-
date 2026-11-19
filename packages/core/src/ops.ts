import { CATALOG_BY_ID } from "./catalog";
import { createId } from "./ids";
import { distance, projectOnSegment, sub } from "./math";
import type { FurnitureItem, Opening, Plan, Vec2, Wall } from "./types";
import { clampOpening, nearestWall, splitWall, wallAngle, wallLength } from "./walls";

/**
 * Reine Plan-Operationen (immutable). Das Frontend ruft nur diese auf –
 * so bleibt die Logik testbar und später auch serverseitig (z. B. KI-Agent) nutzbar.
 */

const touch = (p: Plan): Plan => ({ ...p, updatedAt: new Date().toISOString() });

/** Teilt jede Wand, auf deren Innerem der Punkt liegt (T-Stoß). */
function splitAt(plan: Plan, point: Vec2, tolerance: number): Plan {
  let walls = plan.walls;
  let openings = plan.openings;
  for (const w of plan.walls) {
    if (distance(w.a, point) < tolerance || distance(w.b, point) < tolerance) continue;
    const pr = projectOnSegment(point, w.a, w.b);
    if (pr.dist > tolerance) continue;
    const res = splitWall(w, point, openings);
    if (!res) continue;
    walls = walls.flatMap((x) => (x.id === w.id ? res.walls : [x]));
    openings = res.openings;
  }
  return { ...plan, walls, openings };
}

export function addWall(plan: Plan, a: Vec2, b: Vec2, thickness: number, height: number, tolerance = 0.03): { plan: Plan; wall: Wall | null } {
  if (distance(a, b) < 0.05) return { plan, wall: null };
  let next = splitAt(plan, a, tolerance);
  next = splitAt(next, b, tolerance);
  const wall: Wall = { id: createId("wall"), a: { ...a }, b: { ...b }, thickness, height };
  return { plan: touch({ ...next, walls: [...next.walls, wall] }), wall };
}

/** Verschiebt einen Wandknoten inkl. aller dort anschließenden Wände. */
export function moveJunction(plan: Plan, from: Vec2, to: Vec2, tolerance = 0.01): Plan {
  const mv = (p: Vec2) => (distance(p, from) <= tolerance ? { ...to } : p);
  return touch({ ...plan, walls: plan.walls.map((w) => ({ ...w, a: mv(w.a), b: mv(w.b) })) });
}

export function updateWall(plan: Plan, id: string, patch: Partial<Omit<Wall, "id">>): Plan {
  return touch({ ...plan, walls: plan.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
}

/** Setzt die Länge einer Wand, indem Punkt b (samt Anschlüssen) entlang der Wand verschoben wird. */
export function setWallLength(plan: Plan, id: string, length: number): Plan {
  const w = plan.walls.find((x) => x.id === id);
  if (!w || length < 0.1) return plan;
  const ang = wallAngle(w);
  return moveJunction(plan, w.b, { x: w.a.x + Math.cos(ang) * length, y: w.a.y + Math.sin(ang) * length });
}

export function removeWall(plan: Plan, id: string): Plan {
  return touch({ ...plan, walls: plan.walls.filter((w) => w.id !== id), openings: plan.openings.filter((o) => o.wallId !== id) });
}

export const OPENING_DEFAULTS: Record<Opening["kind"], Pick<Opening, "width" | "height" | "sill">> = {
  door: { width: 0.9, height: 2.05, sill: 0 },
  window: { width: 1.2, height: 1.3, sill: 0.9 },
};

export function addOpening(plan: Plan, kind: Opening["kind"], at: Vec2, maxDist = 0.6): { plan: Plan; opening: Opening | null } {
  const hit = nearestWall(at, plan.walls, maxDist);
  if (!hit) return { plan, opening: null };
  const opening = clampOpening({ id: createId("op"), wallId: hit.wall.id, kind, offset: hit.offset, ...OPENING_DEFAULTS[kind] }, hit.wall);
  if (wallLength(hit.wall) < opening.width + 0.05) return { plan, opening: null };
  return { plan: touch({ ...plan, openings: [...plan.openings, opening] }), opening };
}

export function updateOpening(plan: Plan, id: string, patch: Partial<Omit<Opening, "id">>): Plan {
  return touch({
    ...plan,
    openings: plan.openings.map((o) => {
      if (o.id !== id) return o;
      const next = { ...o, ...patch };
      const wall = plan.walls.find((w) => w.id === next.wallId);
      return wall ? clampOpening(next, wall) : next;
    }),
  });
}

export function addFurniture(plan: Plan, catalogId: string, position: Vec2, rotation = 0): { plan: Plan; item: FurnitureItem | null } {
  if (!CATALOG_BY_ID[catalogId]) return { plan, item: null };
  const item: FurnitureItem = { id: createId("item"), catalogId, position: { ...position }, rotation };
  return { plan: touch({ ...plan, furniture: [...plan.furniture, item] }), item };
}

export function updateFurniture(plan: Plan, id: string, patch: Partial<Omit<FurnitureItem, "id">>): Plan {
  return touch({ ...plan, furniture: plan.furniture.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
}

export function removeById(plan: Plan, id: string): Plan {
  if (plan.walls.some((w) => w.id === id)) return removeWall(plan, id);
  return touch({ ...plan, openings: plan.openings.filter((o) => o.id !== id), furniture: plan.furniture.filter((f) => f.id !== id) });
}

/**
 * "Magnetische Wände": steht ein Möbel nahe einer Wand, wird es mit der Rückseite
 * (lokal −y) bündig an die Wand gestellt und passend gedreht.
 */
export function snapFurnitureToWall(item: FurnitureItem, walls: Wall[], reach = 0.35): FurnitureItem {
  const entry = CATALOG_BY_ID[item.catalogId];
  if (!entry || entry.shape === "rug") return item;
  const hit = nearestWall(item.position, walls, entry.depth / 2 + reach + 0.3);
  if (!hit) return item;
  const w = hit.wall;
  const len = wallLength(w);
  // Nur entlang des Wandinneren, nicht hinter dem Wandende
  if (hit.offset < 0.05 || hit.offset > len - 0.05) return item;
  const away = sub(item.position, hit.point);
  const dir = { x: (w.b.x - w.a.x) / len, y: (w.b.y - w.a.y) / len };
  let n = { x: -dir.y, y: dir.x };
  if (away.x * n.x + away.y * n.y < 0) n = { x: -n.x, y: -n.y };
  const gap = hit.dist - w.thickness / 2 - entry.depth / 2;
  if (gap > reach) return item;
  const off = w.thickness / 2 + entry.depth / 2 + 0.005;
  return {
    ...item,
    rotation: Math.atan2(-n.x, n.y),
    position: { x: hit.point.x + n.x * off, y: hit.point.y + n.y * off },
  };
}
