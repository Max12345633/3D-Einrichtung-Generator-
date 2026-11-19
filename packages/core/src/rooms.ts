import { distance, polygonArea } from "./math";
import type { Vec2, Wall } from "./types";

export interface Room {
  /** stabile ID aus den beteiligten Knoten */
  id: string;
  polygon: Vec2[];
  area: number;
  centroid: Vec2;
}

/**
 * Erkennt geschlossene Räume aus dem Wandgraph (Flächen eines planaren Graphen).
 * Voraussetzung: Wände treffen sich an Endpunkten (T-Stöße werden beim Zeichnen geteilt).
 * Verfahren: für jede gerichtete Kante wird am Zielknoten die "schärfste Rechtskurve" genommen;
 * so umläuft man jede Fläche genau einmal. Die Außenfläche (negativer Umlauf) wird verworfen.
 */
export function detectRooms(walls: Wall[], tolerance = 0.02): Room[] {
  const nodes: Vec2[] = [];
  const nodeIndex = (p: Vec2): number => {
    const i = nodes.findIndex((n) => distance(n, p) <= tolerance);
    if (i >= 0) return i;
    nodes.push(p);
    return nodes.length - 1;
  };
  const adj = new Map<number, Set<number>>();
  for (const w of walls) {
    const i = nodeIndex(w.a);
    const j = nodeIndex(w.b);
    if (i === j) continue;
    if (!adj.has(i)) adj.set(i, new Set());
    if (!adj.has(j)) adj.set(j, new Set());
    adj.get(i)!.add(j);
    adj.get(j)!.add(i);
  }

  const angleOf = (from: number, to: number) => Math.atan2(nodes[to]!.y - nodes[from]!.y, nodes[to]!.x - nodes[from]!.x);
  const visited = new Set<string>();
  const rooms: Room[] = [];

  for (const [start, neighbors] of adj) {
    for (const firstNext of neighbors) {
      if (visited.has(`${start}>${firstNext}`)) continue;
      const cycle: number[] = [];
      let prev = start;
      let cur = firstNext;
      visited.add(`${prev}>${cur}`);
      cycle.push(start);
      let guard = 0;
      let closed = false;
      while (guard++ < 10_000) {
        if (cur === start) { closed = true; break; }
        cycle.push(cur);
        const back = angleOf(cur, prev);
        let bestNode = -1;
        let bestTurn = Infinity;
        for (const n of adj.get(cur) ?? []) {
          if (n === prev && (adj.get(cur)?.size ?? 0) > 1) continue;
          // Winkel im Uhrzeigersinn von der Rückrichtung aus → kleinster = engste Kurve
          let turn = back - angleOf(cur, n);
          while (turn <= 0) turn += Math.PI * 2;
          while (turn > Math.PI * 2) turn -= Math.PI * 2;
          if (turn < bestTurn) { bestTurn = turn; bestNode = n; }
        }
        if (bestNode < 0) break;
        const key = `${cur}>${bestNode}`;
        if (visited.has(key)) break;
        visited.add(key);
        prev = cur;
        cur = bestNode;
      }
      if (!closed || cycle.length < 3) continue;
      const polygon = cycle.map((i) => nodes[i]!);
      // Vorzeichenbehaftete Fläche: Innenflächen haben bei diesem Umlaufsinn positives Vorzeichen
      let signed = 0;
      for (let k = 0; k < polygon.length; k++) {
        const p = polygon[k]!;
        const q = polygon[(k + 1) % polygon.length]!;
        signed += p.x * q.y - q.x * p.y;
      }
      if (signed <= 1e-6) continue;
      const area = polygonArea(polygon);
      if (area < 0.5) continue;
      const centroid = polygon.reduce((acc, p) => ({ x: acc.x + p.x / polygon.length, y: acc.y + p.y / polygon.length }), { x: 0, y: 0 });
      rooms.push({ id: `room_${[...cycle].sort((x, y) => x - y).join("-")}`, polygon, area, centroid });
    }
  }
  return rooms;
}
