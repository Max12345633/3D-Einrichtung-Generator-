import { describe, expect, it } from "vitest";
import {
  buildRenderPrompt, detectRooms, emptyPlan, findCollisions, footprint, intersectsWall, parsePlan,
  polygonArea, samplePlan, snapPoint, splitWall, wallBoxes, wallsFromPolyline, type Opening, type Wall,
} from "../src";

const wall = (ax: number, ay: number, bx: number, by: number): Wall =>
  ({ id: "w", a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness: 0.2, height: 2.5 });

describe("wallBoxes", () => {
  it("liefert einen Quader ohne Öffnungen", () => {
    const boxes = wallBoxes(wall(0, 0, 4, 0), []);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.size).toEqual([4, 2.5, 0.2]);
    expect(boxes[0]!.center).toEqual([2, 1.25, 0]);
  });

  it("schneidet Fenster mit Brüstung und Sturz aus", () => {
    const win: Opening = { id: "o", wallId: "w", kind: "window", offset: 2, width: 1, height: 1, sill: 1 };
    const boxes = wallBoxes(wall(0, 0, 4, 0), [win]);
    // links, Brüstung, Sturz, rechts
    expect(boxes).toHaveLength(4);
    const volume = boxes.reduce((s, b) => s + b.size[0] * b.size[1], 0);
    expect(volume).toBeCloseTo(4 * 2.5 - 1 * 1);
  });

  it("Tür hat keine Brüstung", () => {
    const door: Opening = { id: "o", wallId: "w", kind: "door", offset: 1, width: 0.9, height: 2.05, sill: 0 };
    expect(wallBoxes(wall(0, 0, 4, 0), [door])).toHaveLength(3);
  });

  it("klemmt Öffnungen, die über das Wandende hinausragen", () => {
    const door: Opening = { id: "o", wallId: "w", kind: "door", offset: 0, width: 1, height: 2, sill: 0 };
    const boxes = wallBoxes(wall(0, 0, 3, 0), [door]);
    for (const b of boxes) expect(b.size[0]).toBeGreaterThan(0);
  });
});

describe("detectRooms", () => {
  it("erkennt ein Rechteck", () => {
    const rooms = detectRooms(wallsFromPolyline([[0, 0], [4, 0], [4, 3], [0, 3]], true, 0.2));
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.area).toBeCloseTo(12);
  });

  it("erkennt zwei Räume mit gemeinsamer Wand", () => {
    const walls = [
      ...wallsFromPolyline([[0, 0], [4, 0], [8, 0], [8, 3], [4, 3], [0, 3]], true, 0.2),
      ...wallsFromPolyline([[4, 0], [4, 3]], false, 0.1),
    ];
    const rooms = detectRooms(walls);
    expect(rooms.map((r) => r.area).sort()).toEqual([12, 12]);
  });

  it("ignoriert offene Linienzüge", () => {
    expect(detectRooms(wallsFromPolyline([[0, 0], [4, 0], [4, 3]], false, 0.2))).toHaveLength(0);
  });

  it("findet die Räume der Beispielwohnung", () => {
    const rooms = detectRooms(samplePlan().walls);
    expect(rooms).toHaveLength(4);
    const total = rooms.reduce((s, r) => s + r.area, 0);
    expect(total).toBeCloseTo(62);
  });
});

describe("splitWall", () => {
  it("teilt und verteilt Öffnungen", () => {
    const w = wall(0, 0, 4, 0);
    const ops: Opening[] = [
      { id: "l", wallId: "w", kind: "door", offset: 1, width: 0.8, height: 2, sill: 0 },
      { id: "r", wallId: "w", kind: "window", offset: 3, width: 0.8, height: 1, sill: 1 },
    ];
    const res = splitWall(w, { x: 2, y: 0.05 }, ops)!;
    expect(res.walls[0].b).toEqual({ x: 2, y: 0 });
    const r = res.openings.find((o) => o.id === "r")!;
    expect(r.wallId).toBe(res.walls[1].id);
    expect(r.offset).toBeCloseTo(1);
  });
});

describe("snapPoint", () => {
  const walls = [wall(0, 0, 4, 0)];
  it("fängt Endpunkte", () => {
    expect(snapPoint({ x: 3.95, y: 0.08 }, walls, { grid: 0.1, tolerance: 0.2, angleStepDeg: 15 })).toMatchObject({ kind: "endpoint", point: { x: 4, y: 0 } });
  });
  it("fängt Winkel relativ zum Anker", () => {
    const r = snapPoint({ x: 1.03, y: 3.0 }, [], { grid: 0.1, tolerance: 0.2, angleStepDeg: 90, anchor: { x: 1, y: 0 } });
    expect(r.kind).toBe("angle");
    expect(r.point.x).toBeCloseTo(1);
    expect(r.point.y).toBeCloseTo(3);
  });
  it("fällt auf das Raster zurück", () => {
    expect(snapPoint({ x: 2.04, y: 2.96 }, walls, { grid: 0.1, tolerance: 0.2, angleStepDeg: 0 }).point.x).toBeCloseTo(2);
  });
});

describe("Möbel", () => {
  it("dreht die Grundfläche", () => {
    const fp = footprint({ id: "a", catalogId: "sofa-3", position: { x: 0, y: 0 }, rotation: Math.PI / 2 });
    expect(polygonArea(fp)).toBeCloseTo(2.2 * 0.95);
    expect(Math.max(...fp.map((p) => p.y))).toBeCloseTo(1.1);
  });
  it("erkennt Kollisionen, Teppiche ausgenommen", () => {
    const hits = findCollisions([
      { id: "a", catalogId: "sofa-3", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "b", catalogId: "armchair", position: { x: 1, y: 0 }, rotation: 0 },
      { id: "c", catalogId: "rug-l", position: { x: 0, y: 0 }, rotation: 0 },
      { id: "d", catalogId: "plant", position: { x: 5, y: 5 }, rotation: 0 },
    ]);
    expect([...hits].sort()).toEqual(["a", "b"]);
  });
  it("erkennt Möbel in Wänden", () => {
    const w = [wall(0, 0, 4, 0)];
    expect(intersectsWall({ id: "a", catalogId: "armchair", position: { x: 2, y: 0.2 }, rotation: 0 }, w)).toBe(true);
    expect(intersectsWall({ id: "a", catalogId: "armchair", position: { x: 2, y: 0.6 }, rotation: 0 }, w)).toBe(false);
  });
  it("Beispielwohnung: keine Möbel in Wänden, keine Kollisionen", () => {
    const plan = samplePlan();
    expect(plan.furniture.filter((f) => intersectsWall(f, plan.walls)).map((f) => f.catalogId)).toEqual([]);
    expect(findCollisions(plan.furniture).size).toBe(0);
  });
});

describe("Plan & Prompt", () => {
  it("validiert Round-Trip", () => {
    const p = samplePlan();
    expect(parsePlan(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(() => parsePlan({ ...emptyPlan(), version: 2 })).toThrow();
  });
  it("baut einen Prompt mit Stil und Möbeln", () => {
    const prompt = buildRenderPrompt({ plan: samplePlan(), style: "japandi", userPrompt: "Abendlicht" });
    expect(prompt).toContain("Japandi");
    expect(prompt).toContain("4x dining chair");
    expect(prompt).toContain("Abendlicht");
  });
});

describe("wallBoxes capEnds", () => {
  it("verlängert nur die Endstücke um die halbe Stärke", () => {
    const door: Opening = { id: "o", wallId: "w", kind: "door", offset: 2, width: 1, height: 2, sill: 0 };
    const boxes = wallBoxes(wall(0, 0, 4, 0), [door], true);
    expect(boxes[0]!.size[0]).toBeCloseTo(1.5 + 0.1);
    expect(boxes[boxes.length - 1]!.size[0]).toBeCloseTo(1.5 + 0.1);
  });
});
