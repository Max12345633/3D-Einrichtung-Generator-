import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CATALOG_BY_ID, addCustomEntry, addFurniture, applyStyle, colorFromName, emptyPlan, extractDimensions, findCollisions, footprint,
  guessKind, parsePlan, parseProductHtml, polygonArea, productToCatalogEntry, removeCustomEntry, shoppingList, updateCustomEntry,
} from "../src";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("extractDimensions", () => {
  it.each([
    ["Breite: 228 cm Tiefe: 95 cm Höhe: 83 cm Sitzhöhe: 45 cm", { width: 2.28, depth: 0.95, height: 0.83 }],
    ["Maße (B/H/T): 220/85/95 cm", { width: 2.2, height: 0.85, depth: 0.95 }],
    ["BxTxH: 160 x 200 x 40 cm", { width: 1.6, depth: 2, height: 0.4 }],
    ["Abmessungen (B x T x H) in mm: 1800 x 900 x 750", { width: 1.8, depth: 0.9, height: 0.75 }],
    ["W 90 x D 40 x H 180 cm", { width: 0.9, depth: 0.4, height: 1.8 }],
    ["B: 120 / T: 60 / H: 75 cm", { width: 1.2, depth: 0.6, height: 0.75 }],
    ["Gesamtmaß 210 x 90 x 82 cm", { width: 2.1, depth: 0.9, height: 0.82 }],
    ["Breite 2280 mm, Höhe 0,83 m", { width: 2.28, height: 0.83 }],
    ["Breite ca. 75,5 cm", { width: 0.755 }],
  ])("%s", (text, expected) => {
    expect(extractDimensions(text)).toMatchObject(expected);
  });

  it("ignoriert Sitzhöhe/-tiefe als Höhe/Tiefe", () => {
    expect(extractDimensions("Sitzhöhe: 45 cm, Sitztiefe 55 cm")).toEqual({});
  });

  it("Liegefläche ergibt Bettmaße mit Rahmenzuschlag", () => {
    expect(extractDimensions("Liegefläche: 180 x 200 cm")).toMatchObject({ width: 1.9, depth: 2.1 });
  });

  it("verwirft unsinnige Werte", () => {
    expect(extractDimensions("Breite: 9999 m")).toEqual({});
  });
});

describe("guessKind & Farbe", () => {
  it.each([
    ["Couchtisch Lund", "table", "wohnen"],
    ["Schreibtisch Alex", "desk", "arbeiten"],
    ["Ecksofa mit Schlaffunktion", "sofa", "wohnen"],
    ["Boxspringbett Lena", "bed", "schlafen"],
    ["Bettwäsche Satin", "sideboard", "wohnen"],
    ["Esstisch Eiche massiv", "table", "essen"],
    ["Kleiderschrank PAX", "wardrobe", "schlafen"],
    ["Hochflor-Teppich", "rug", "deko"],
    ["Stehleuchte Arc", "lamp", "deko"],
    ["TV-Lowboard Nordic", "tv", "wohnen"],
  ])("%s → %s", (name, shape, category) => {
    expect(guessKind(name)).toMatchObject({ shape, category });
  });

  it("Farbnamen", () => {
    expect(colorFromName("Kelinge anthrazit")).toBe("#3d3f42");
    expect(colorFromName("Webstoff beige")).toBe("#d8ccb8");
    expect(colorFromName("Tonerud grau")).toBe("#8a8c8e");
    expect(colorFromName("xyz")).toBeUndefined();
  });
});

describe("parseProductHtml", () => {
  it("schema.org mit strukturierten Maßen", () => {
    const p = parseProductHtml(fixture("jsonld-sofa.html"), "https://www.shop.example/p/soederhamn");
    expect(p).toMatchObject({
      shop: "shop.example", name: "SÖDERHAMN 3er-Sofa, Tonerud grau", price: 899, currency: "EUR", shape: "sofa",
      imageUrl: "https://www.shop.example/images/soederhamn.jpg", dimensions: { width: 1.98, depth: 0.99, height: 0.83 }, color: "#8a8c8e",
    });
  });

  it("Maße aus dem Seitentext, Preis aus Meta-Tags, Skripte ignoriert", () => {
    const p = parseProductHtml(fixture("text-dims.html"), "https://www.moebel.example/kivik");
    expect(p).toMatchObject({ name: "KIVIK Sofa 3-sitzig, Kelinge anthrazit", price: 749, currency: "EUR", dimensions: { width: 2.28, depth: 0.95, height: 0.83 }, color: "#3d3f42" });
  });

  it("additionalProperty und deutscher Preis", () => {
    const p = parseProductHtml(fixture("otto-like.html"), "https://www.otto.example/p/oslo");
    expect(p).toMatchObject({ name: "Sideboard »Oslo«, Eiche Nachbildung", price: 1299.99, shape: "sideboard", dimensions: { width: 1.6, height: 0.8, depth: 0.4 }, imageUrl: "https://i.otto.example/oslo.jpg" });
  });

  it("Bett über Liegefläche, Titel bereinigt", () => {
    const p = parseProductHtml(fixture("bed.html"), "https://bett.example/lena");
    expect(p).toMatchObject({ name: "Boxspringbett Lena, Webstoff beige", shape: "bed", dimensions: { width: 1.9, depth: 2.1, height: 1.15 } });
  });

  it("englische Seite", () => {
    const p = parseProductHtml(fixture("english.html"), "https://shop.example.co.uk/oak");
    expect(p).toMatchObject({ shape: "shelf", price: 349, currency: "GBP", dimensions: { width: 0.9, depth: 0.4, height: 1.8 } });
  });

  it("kaputtes HTML wirft nicht", () => {
    const p = parseProductHtml("<script type='application/ld+json'>{kaputt</script><p>nix", "https://x.example/");
    expect(p.name).toBe("Importiertes Möbel");
    expect(p.dimensions).toEqual({});
  });
});

describe("Import in den Plan", () => {
  it("Katalogeintrag mit Fallback-Maßen und Messkennzeichnung", () => {
    const info = parseProductHtml(fixture("bed.html"), "https://bett.example/lena");
    const entry = productToCatalogEntry(info, { height: 1.2 });
    expect(entry).toMatchObject({ shape: "bed", width: 1.9, depth: 2.1, height: 1.2, source: { shop: "bett.example", measured: { width: true, depth: true, height: false } } });
  });

  it("funktioniert in Kollision, Stilen, Einkaufsliste und Validierung", () => {
    const info = parseProductHtml(fixture("jsonld-sofa.html"), "https://www.shop.example/p/soederhamn");
    const entry = productToCatalogEntry(info);
    let plan = addCustomEntry(emptyPlan(), entry);
    expect(CATALOG_BY_ID[entry.id]).toBeDefined();
    plan = addFurniture(plan, entry.id, { x: 0, y: 0 }).plan;
    plan = addFurniture(plan, entry.id, { x: 0.5, y: 0 }).plan;
    plan = addFurniture(plan, "plant", { x: 5, y: 5 }).plan;
    expect(polygonArea(footprint(plan.furniture[0]!))).toBeCloseTo(1.98 * 0.99);
    expect(findCollisions(plan.furniture).size).toBe(2);

    const styled = applyStyle(plan, "boho");
    expect(styled.furniture[0]!.color).toBeUndefined(); // Shopfarbe bleibt

    const list = shoppingList(plan);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]!.qty).toBe(2);
    expect(list.total).toBe(1798);

    expect(parsePlan(JSON.parse(JSON.stringify(plan))).customCatalog).toHaveLength(1);

    const resized = updateCustomEntry(plan, entry.id, { width: 2.4 });
    expect(polygonArea(footprint(resized.furniture[0]!))).toBeCloseTo(2.4 * 0.99);
    expect(resized.customCatalog![0]!.source!.measured!.width).toBe(false);

    const removed = removeCustomEntry(resized, entry.id);
    expect(removed.furniture).toHaveLength(1);
    expect(removed.customCatalog).toHaveLength(0);
  });
});
