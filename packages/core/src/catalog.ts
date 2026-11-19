/**
 * Möbelkatalog. "shape" steuert den prozeduralen 3D-Aufbau im Frontend.
 * Später: echte GLB-Modelle (modelUrl) + Affiliate-Daten (Händler, Preis, Link).
 */
export type FurnitureShape =
  | "sofa" | "armchair" | "bed" | "table" | "chair" | "desk" | "wardrobe" | "shelf"
  | "sideboard" | "tv" | "rug" | "plant" | "lamp" | "kitchen" | "fridge" | "bathtub"
  | "shower" | "toilet" | "sink" | "nightstand";

export type FurnitureCategory = "wohnen" | "schlafen" | "essen" | "arbeiten" | "kueche" | "bad" | "deko";

export interface CatalogEntry {
  id: string;
  name: string;
  category: FurnitureCategory;
  shape: FurnitureShape;
  /** Breite (x), Tiefe (y im Grundriss), Höhe in Metern */
  width: number;
  depth: number;
  height: number;
  color: string;
  /** Beschreibung für Render-Prompts */
  promptHint: string;
}

export const CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  wohnen: "Wohnen", schlafen: "Schlafen", essen: "Essen", arbeiten: "Arbeiten",
  kueche: "Küche", bad: "Bad", deko: "Deko",
};

export const CATALOG: CatalogEntry[] = [
  { id: "sofa-3", name: "Sofa 3-Sitzer", category: "wohnen", shape: "sofa", width: 2.2, depth: 0.95, height: 0.85, color: "#8a9a8c", promptHint: "three-seater fabric sofa" },
  { id: "sofa-2", name: "Sofa 2-Sitzer", category: "wohnen", shape: "sofa", width: 1.7, depth: 0.9, height: 0.85, color: "#c2b6a3", promptHint: "two-seater sofa" },
  { id: "armchair", name: "Sessel", category: "wohnen", shape: "armchair", width: 0.85, depth: 0.85, height: 0.9, color: "#b5764f", promptHint: "lounge armchair" },
  { id: "coffee-table", name: "Couchtisch", category: "wohnen", shape: "table", width: 1.1, depth: 0.6, height: 0.42, color: "#a07850", promptHint: "wooden coffee table" },
  { id: "tv-board", name: "TV & Lowboard", category: "wohnen", shape: "tv", width: 1.8, depth: 0.42, height: 1.15, color: "#3a3a3a", promptHint: "low TV sideboard with flat screen TV" },
  { id: "shelf", name: "Regal", category: "wohnen", shape: "shelf", width: 1.0, depth: 0.38, height: 1.9, color: "#d8cbb3", promptHint: "open bookshelf with books" },
  { id: "sideboard", name: "Sideboard", category: "wohnen", shape: "sideboard", width: 1.6, depth: 0.45, height: 0.8, color: "#6d4c35", promptHint: "walnut sideboard" },
  { id: "rug-l", name: "Teppich groß", category: "deko", shape: "rug", width: 2.4, depth: 1.7, height: 0.01, color: "#d9d2c5", promptHint: "large textured area rug" },
  { id: "plant", name: "Zimmerpflanze", category: "deko", shape: "plant", width: 0.5, depth: 0.5, height: 1.4, color: "#4f7a4a", promptHint: "large potted plant" },
  { id: "floor-lamp", name: "Stehlampe", category: "deko", shape: "lamp", width: 0.4, depth: 0.4, height: 1.6, color: "#e8e1d4", promptHint: "floor lamp" },
  { id: "bed-double", name: "Doppelbett 160", category: "schlafen", shape: "bed", width: 1.7, depth: 2.1, height: 0.95, color: "#e9e4dc", promptHint: "double bed with linen bedding" },
  { id: "bed-single", name: "Einzelbett 90", category: "schlafen", shape: "bed", width: 1.0, depth: 2.05, height: 0.9, color: "#e9e4dc", promptHint: "single bed" },
  { id: "nightstand", name: "Nachttisch", category: "schlafen", shape: "nightstand", width: 0.45, depth: 0.4, height: 0.5, color: "#a07850", promptHint: "bedside table" },
  { id: "wardrobe", name: "Kleiderschrank", category: "schlafen", shape: "wardrobe", width: 2.0, depth: 0.6, height: 2.2, color: "#f0ede6", promptHint: "built-in wardrobe" },
  { id: "dining-table", name: "Esstisch 6 Pers.", category: "essen", shape: "table", width: 1.8, depth: 0.9, height: 0.75, color: "#b08a5f", promptHint: "solid oak dining table" },
  { id: "dining-chair", name: "Stuhl", category: "essen", shape: "chair", width: 0.48, depth: 0.52, height: 0.85, color: "#2f2f2f", promptHint: "dining chair" },
  { id: "desk", name: "Schreibtisch", category: "arbeiten", shape: "desk", width: 1.4, depth: 0.7, height: 0.75, color: "#e7e1d6", promptHint: "minimal desk" },
  { id: "office-chair", name: "Bürostuhl", category: "arbeiten", shape: "chair", width: 0.6, depth: 0.6, height: 1.1, color: "#3b3b3b", promptHint: "ergonomic office chair" },
  { id: "kitchen-row", name: "Küchenzeile 2,8 m", category: "kueche", shape: "kitchen", width: 2.8, depth: 0.62, height: 0.92, color: "#f4f2ee", promptHint: "modern kitchen counter with handleless cabinets" },
  { id: "fridge", name: "Kühlschrank", category: "kueche", shape: "fridge", width: 0.6, depth: 0.65, height: 1.85, color: "#dcdcdc", promptHint: "tall refrigerator" },
  { id: "bathtub", name: "Badewanne", category: "bad", shape: "bathtub", width: 1.7, depth: 0.75, height: 0.6, color: "#ffffff", promptHint: "white bathtub" },
  { id: "shower", name: "Dusche", category: "bad", shape: "shower", width: 0.9, depth: 0.9, height: 2.0, color: "#cfe3ea", promptHint: "walk-in glass shower" },
  { id: "toilet", name: "WC", category: "bad", shape: "toilet", width: 0.38, depth: 0.6, height: 0.8, color: "#ffffff", promptHint: "wall-hung toilet" },
  { id: "sink", name: "Waschtisch", category: "bad", shape: "sink", width: 0.8, depth: 0.48, height: 0.85, color: "#ffffff", promptHint: "vanity with washbasin" },
];

export const CATALOG_BY_ID: Record<string, CatalogEntry> = Object.fromEntries(CATALOG.map((e) => [e.id, e]));
