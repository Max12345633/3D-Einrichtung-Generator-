import { describe, expect, it } from "vitest";
import { addOpening, addWall, detectRooms, emptyPlan, moveJunction, removeById, setWallLength, snapFurnitureToWall, wallLength, type Plan } from "../src";

const box = (): Plan => {
  let p = emptyPlan();
  const pts: [number, number][] = [[0, 0], [4, 0], [4, 3], [0, 3]];
  for (let i = 0; i < 4; i++) {
    const a = pts[i]!, b = pts[(i + 1) % 4]!;
    p = addWall(p, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }, 0.2, 2.5).plan;
  }
  return p;
};

describe("ops", () => {
  it("T-Stoß teilt die Wand und erzeugt zwei Räume", () => {
    const p = addWall(box(), { x: 2, y: 0 }, { x: 2, y: 3 }, 0.1, 2.5).plan;
    expect(p.walls).toHaveLength(7);
    expect(detectRooms(p.walls).map((r) => Math.round(r.area)).sort()).toEqual([6, 6]);
  });

  it("verschiebt Knoten samt angrenzender Wände", () => {
    const p = moveJunction(box(), { x: 4, y: 0 }, { x: 5, y: 0 });
    expect(detectRooms(p.walls)[0]!.area).toBeCloseTo(13.5);
  });

  it("setzt Wandlängen", () => {
    const p = box();
    const w = p.walls[0]!;
    const q = setWallLength(p, w.id, 5);
    expect(wallLength(q.walls.find((x) => x.id === w.id)!)).toBeCloseTo(5);
  });

  it("Fenster nur auf Wänden; Wand löschen entfernt Öffnungen", () => {
    const p = box();
    expect(addOpening(p, "window", { x: 2, y: 1.5 }).opening).toBeNull();
    const { plan, opening } = addOpening(p, "window", { x: 2, y: 0.1 });
    expect(opening?.offset).toBeCloseTo(2);
    expect(removeById(plan, opening!.wallId).openings).toHaveLength(0);
  });

  it("dockt Möbel an Wände an", () => {
    const p = box();
    const snapped = snapFurnitureToWall({ id: "s", catalogId: "sofa-3", position: { x: 2, y: 2.4 }, rotation: 0.3 }, p.walls);
    expect(snapped.position.y).toBeCloseTo(3 - 0.1 - 0.475 - 0.005);
    expect(Math.abs(Math.cos(snapped.rotation))).toBeCloseTo(1); // Rücken zur Wand (π)
    expect(Math.sin(snapped.rotation)).toBeCloseTo(0);
    const free = { id: "f", catalogId: "sofa-3", position: { x: 2, y: 1.5 }, rotation: 0.3 };
    expect(snapFurnitureToWall(free, p.walls)).toEqual(free);
  });
});
