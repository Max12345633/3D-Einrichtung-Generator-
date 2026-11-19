import { describe, expect, it } from "vitest";
import { CATALOG, INTERIOR_STYLES, STYLE_IDS, applyStyle, classifyRoom, detectRooms, dominantWindowDirection, emptyPlan, parsePlan, samplePlan } from "../src";

describe("Stile", () => {
  it("jedes Katalogteil hat eine Material-Rolle", () => {
    for (const e of CATALOG) expect(e.material).toBeTruthy();
  });

  it("wendet Boden, Wand und Möbelfarben an und bleibt gültig", () => {
    for (const id of STYLE_IDS) {
      const p = applyStyle(samplePlan(), id);
      expect(p.floorMaterial).toBe(INTERIOR_STYLES[id].floor);
      expect(p.wallColor).toBe(INTERIOR_STYLES[id].wall);
      expect(() => parsePlan(JSON.parse(JSON.stringify(p)))).not.toThrow();
    }
  });

  it("variiert Stofffarben und lässt Keramik unverändert", () => {
    const p = applyStyle(samplePlan(), "boho");
    const fabrics = p.furniture.filter((f) => ["sofa-3", "armchair", "bed-double"].includes(f.catalogId)).map((f) => f.color);
    expect(new Set(fabrics).size).toBeGreaterThan(1);
    expect(p.furniture.find((f) => f.catalogId === "bathtub")!.color).toBeUndefined();
  });
});

describe("Analyse", () => {
  it("erkennt das Bad der Beispielwohnung", () => {
    const plan = samplePlan();
    const kinds = detectRooms(plan.walls).map((r) => classifyRoom(r, plan));
    expect(kinds.filter((k) => k === "bath")).toHaveLength(1);
  });

  it("Fensterrichtung zeigt nach außen zur fensterreichsten Seite", () => {
    // Beispielwohnung: die meisten Fenster liegen in der oberen Wand (y = 0) → Richtung −y
    const d = dominantWindowDirection(samplePlan());
    expect(d.y).toBeLessThan(-0.5);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
    expect(dominantWindowDirection(emptyPlan())).toBeTruthy();
  });
});
