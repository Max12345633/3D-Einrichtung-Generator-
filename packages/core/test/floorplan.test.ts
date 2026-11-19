import { describe, expect, it } from "vitest";
import { applyDetectedWalls, detectRooms, detectWalls, emptyPlan, scalePlanGeometry, wallLength, type Plan } from "../src";

/** Einfache Raster-„Leinwand“ für synthetische Grundrisse (RGBA, weiß). */
function canvas(w: number, h: number) {
  const px = new Uint8ClampedArray(w * h * 4).fill(255);
  const rect = (x0: number, y0: number, x1: number, y1: number, v = 20) => {
    for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
      const i = (y * w + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = v;
    }
  };
  return { px, rect };
}

/**
 * 2-Zimmer-Plan, Maßstab 1 px = 1 cm: Außen 600 × 400 cm, Außenwand 30 px, Innenwand 12 px,
 * Tür (90 cm) in der Innenwand, zwei Fenster (120 cm) oben. Dazu Störungen wie in echten Plänen.
 */
function samplePlanImage(opts: { hatch?: boolean; gray?: number } = {}) {
  const W = 700, H = 500, ox = 50, oy = 50;
  const c = canvas(W, H);
  const v = opts.gray ?? 20;
  const wall = (x0: number, y0: number, x1: number, y1: number) => {
    if (!opts.hatch) return c.rect(x0, y0, x1, y1, v);
    // Schraffur: diagonale Linien statt Füllung + Umriss
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if ((x + y) % 4 < 2 || y === y0 || y === y1 - 1 || x === x0 || x === x1 - 1) c.rect(x, y, x + 1, y + 1, v);
  };
  // Außenwände (oben mit 2 Fensterlücken à 120 px)
  wall(ox, oy, ox + 100, oy + 30); wall(ox + 220, oy, ox + 380, oy + 30); wall(ox + 500, oy, ox + 600, oy + 30);
  wall(ox, oy + 370, ox + 600, oy + 400);
  wall(ox, oy, ox + 30, oy + 400);
  wall(ox + 570, oy, ox + 600, oy + 400);
  // Innenwand senkrecht bei x = 330 mit Tür (90 px) unten
  wall(ox + 324, oy + 30, ox + 336, oy + 250); wall(ox + 324, oy + 340, ox + 336, oy + 370);
  // Fensterdarstellung: dünne Doppellinie in der Lücke
  c.rect(ox + 100, oy + 10, ox + 220, oy + 12); c.rect(ox + 100, oy + 18, ox + 220, oy + 20);
  c.rect(ox + 380, oy + 10, ox + 500, oy + 12); c.rect(ox + 380, oy + 18, ox + 500, oy + 20);
  // Störungen: Maßkette, „Text“, Möbelumriss, Türbogen
  c.rect(ox, oy + 440, ox + 600, oy + 441); c.rect(ox, oy + 432, ox + 1, oy + 448); c.rect(ox + 599, oy + 432, ox + 600, oy + 448);
  for (let i = 0; i < 8; i++) c.rect(ox + 120 + i * 9, oy + 190, ox + 126 + i * 9, oy + 191 + (i % 3) * 3);
  c.rect(ox + 400, oy + 150, ox + 520, oy + 152); c.rect(ox + 400, oy + 230, ox + 520, oy + 232); c.rect(ox + 400, oy + 150, ox + 402, oy + 232); c.rect(ox + 518, oy + 150, ox + 520, oy + 232);
  for (let a = 0; a < 90; a++) { const r = 90, x = Math.round(ox + 336 + r * Math.cos((a * Math.PI) / 180)), y = Math.round(oy + 340 - r * Math.sin((a * Math.PI) / 180)); c.rect(x, y, x + 1, y + 1); }
  return { ...c, W, H };
}

const bg = { origin: { x: 0, y: 0 }, metersPerPixel: 0.01 };

describe("Wanderkennung", () => {
  it("findet Wände, Tür und Fenster; Störungen werden ignoriert", () => {
    const img = samplePlanImage();
    const r = detectWalls(img.px, img.W, img.H);
    expect(r.walls.length).toBeGreaterThanOrEqual(5);
    expect(r.walls.length).toBeLessThanOrEqual(7);
    expect(r.openings.filter((o) => o.kind === "window")).toHaveLength(2);
    expect(r.openings.filter((o) => o.kind === "door")).toHaveLength(1);
    const door = r.openings.find((o) => o.kind === "door")!;
    expect(door.width).toBeGreaterThan(80);
    expect(door.width).toBeLessThan(100);
  });

  it("ergibt im Plan zwei geschlossene Räume mit richtigen Flächen", () => {
    const img = samplePlanImage();
    const plan = applyDetectedWalls(emptyPlan(), detectWalls(img.px, img.W, img.H), bg);
    const rooms = detectRooms(plan.walls).map((x) => x.area).sort((a, b) => a - b);
    expect(rooms).toHaveLength(2);
    // Mittellinien: links (330-15)×(400-30)… grob 11,6 m² und 8,9 m²
    expect(rooms[0]).toBeGreaterThan(7.5);
    expect(rooms[1]).toBeLessThan(13.5);
    const ext = plan.walls.map((w) => w.thickness).sort();
    expect(ext[ext.length - 1]).toBeCloseTo(0.3, 1);
    expect(ext[0]).toBeCloseTo(0.12, 1);
    expect(plan.openings.filter((o) => o.kind === "window").every((o) => Math.abs(o.width - 1.2) < 0.08)).toBe(true);
  });

  it("funktioniert mit schraffierten und grauen Wänden", () => {
    for (const variant of [{ hatch: true }, { gray: 110 }]) {
      const img = samplePlanImage(variant);
      const plan = applyDetectedWalls(emptyPlan(), detectWalls(img.px, img.W, img.H), bg);
      expect(detectRooms(plan.walls), JSON.stringify(variant)).toHaveLength(2);
    }
  });

  it("leeres Bild ergibt keine Wände", () => {
    const c = canvas(200, 200);
    expect(detectWalls(c.px, 200, 200).walls).toHaveLength(0);
  });
});

describe("Maßstab nachträglich", () => {
  it("skaliert Wände, Öffnungen, Hintergrund – Möbel behalten ihre Größe", () => {
    const img = samplePlanImage();
    const plan: Plan = { ...applyDetectedWalls(emptyPlan(), detectWalls(img.px, img.W, img.H), bg), background: { dataUrl: "x", widthPx: 700, heightPx: 500, opacity: 0.5, ...bg } };
    const scaled = scalePlanGeometry(plan, 2);
    const area = (p: Plan) => detectRooms(p.walls).reduce((s, r) => s + r.area, 0);
    expect(area(scaled) / area(plan)).toBeCloseTo(4, 1);
    expect(scaled.background!.metersPerPixel).toBeCloseTo(0.02);
    expect(wallLength(scaled.walls[0]!)).toBeCloseTo(wallLength(plan.walls[0]!) * 2);
  });
});
