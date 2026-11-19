import { CATALOG_BY_ID } from "./catalog";
import { boundsOf, pointInPolygon } from "./math";
import type { Room } from "./rooms";
import type { Plan, Vec2 } from "./types";
import { pointOnWall, wallDirection } from "./walls";

export type RoomKind = "bath" | "kitchen" | "living";

/** Raumtyp aus den Möbeln ableiten: Bad bekommt Fliesen, Küche später eigene Regeln. */
export function classifyRoom(room: Room, plan: Plan): RoomKind {
  let bath = 0;
  let kitchen = 0;
  for (const f of plan.furniture) {
    if (!pointInPolygon(f.position, room.polygon)) continue;
    const c = CATALOG_BY_ID[f.catalogId]?.category;
    if (c === "bad") bath++;
    if (c === "kueche") kitchen++;
  }
  if (bath > 0 && bath >= kitchen) return "bath";
  if (kitchen > 0 && room.area < 12) return "kitchen";
  return "living";
}

/**
 * Richtung (2D, normiert), aus der Tageslicht am meisten Fenster trifft:
 * Summe der nach außen zeigenden Normalen aller Fenster, gewichtet mit der Fensterbreite.
 * Die Sonne für Foto-Renders wird aus dieser Richtung gesetzt, damit Licht in die Räume fällt.
 */
export function dominantWindowDirection(plan: Plan): Vec2 {
  const b = boundsOf(plan.walls.flatMap((w) => [w.a, w.b]));
  if (!b) return { x: 0.4, y: -1 };
  const center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  let sx = 0;
  let sy = 0;
  for (const o of plan.openings) {
    if (o.kind !== "window") continue;
    const w = plan.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const d = wallDirection(w);
    let n = { x: -d.y, y: d.x };
    const p = pointOnWall(w, o.offset);
    if ((p.x - center.x) * n.x + (p.y - center.y) * n.y < 0) n = { x: -n.x, y: -n.y };
    sx += n.x * o.width;
    sy += n.y * o.width;
  }
  const len = Math.hypot(sx, sy);
  return len < 1e-6 ? { x: 0.4, y: -1 } : { x: sx / len, y: sy / len };
}
