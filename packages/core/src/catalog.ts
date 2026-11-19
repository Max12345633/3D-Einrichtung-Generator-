/**
 * Möbelkatalog. "shape" steuert den prozeduralen 3D-Aufbau im Frontend.
 * Später: echte GLB-Modelle (modelUrl) + Affiliate-Daten (Händler, Preis, Link).
 */
export type FurnitureShape =
  | "sofa" | "armchair" | "bed" | "table" | "chair" | "desk" | "wardrobe" | "shelf"
  | "sideboard" | "tv" | "rug" | "plant" | "lamp" | "kitchen" | "fridge" | "bathtub"
  | "shower" | "toilet" | "sink" | "nightstand";

export type MaterialRole = "fabric" | "wood" | "lacquer" | "metal" | "ceramic" | "plant" | "textile";

export type FurnitureCategory = "wohnen" | "schlafen" | "essen" | "arbeiten" | "kueche" | "bad" | "deko";

/** Herkunft eines aus einem Online-Shop importierten Möbelstücks. */
export interface ProductSource {
  url: string;
  shop: string;
  imageUrl?: string;
  /** Kleines Vorschaubild als Data-URL (wird mit dem Projekt gespeichert, funktioniert offline) */
  imageData?: string;
  price?: number;
  currency?: string;
  /** Welche Maße aus der Shopseite stammen (Rest: Schätzung/Nutzereingabe) */
  measured?: { width: boolean; depth: boolean; height: boolean };
}

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
  /** Material-Rolle der Hauptfläche – steuert Oberfläche (Textur, Glanz) und Stil-Paletten */
  material: MaterialRole;
  /** Beschreibung für Render-Prompts */
  promptHint: string;
  /** Nur bei importierten Möbeln */
  source?: ProductSource;
}

export const CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  wohnen: "Wohnen", schlafen: "Schlafen", essen: "Essen", arbeiten: "Arbeiten",
  kueche: "Küche", bad: "Bad", deko: "Deko",
};

export const CATALOG: CatalogEntry[] = [
  { id: "sofa-3", material: "fabric", name: "Sofa 3-Sitzer", category: "wohnen", shape: "sofa", width: 2.2, depth: 0.95, height: 0.85, color: "#8a9a8c", promptHint: "three-seater fabric sofa" },
  { id: "sofa-2", material: "fabric", name: "Sofa 2-Sitzer", category: "wohnen", shape: "sofa", width: 1.7, depth: 0.9, height: 0.85, color: "#c2b6a3", promptHint: "two-seater sofa" },
  { id: "armchair", material: "fabric", name: "Sessel", category: "wohnen", shape: "armchair", width: 0.85, depth: 0.85, height: 0.9, color: "#b5764f", promptHint: "lounge armchair" },
  { id: "coffee-table", material: "wood", name: "Couchtisch", category: "wohnen", shape: "table", width: 1.1, depth: 0.6, height: 0.42, color: "#a07850", promptHint: "wooden coffee table" },
  { id: "tv-board", material: "lacquer", name: "TV & Lowboard", category: "wohnen", shape: "tv", width: 1.8, depth: 0.42, height: 1.15, color: "#3a3a3a", promptHint: "low TV sideboard with flat screen TV" },
  { id: "shelf", material: "wood", name: "Regal", category: "wohnen", shape: "shelf", width: 1.0, depth: 0.38, height: 1.9, color: "#d8cbb3", promptHint: "open bookshelf with books" },
  { id: "sideboard", material: "wood", name: "Sideboard", category: "wohnen", shape: "sideboard", width: 1.6, depth: 0.45, height: 0.8, color: "#6d4c35", promptHint: "walnut sideboard" },
  { id: "rug-l", material: "textile", name: "Teppich groß", category: "deko", shape: "rug", width: 2.4, depth: 1.7, height: 0.01, color: "#d9d2c5", promptHint: "large textured area rug" },
  { id: "plant", material: "plant", name: "Zimmerpflanze", category: "deko", shape: "plant", width: 0.5, depth: 0.5, height: 1.4, color: "#4f7a4a", promptHint: "large potted plant" },
  { id: "floor-lamp", material: "textile", name: "Stehlampe", category: "deko", shape: "lamp", width: 0.4, depth: 0.4, height: 1.6, color: "#e8e1d4", promptHint: "floor lamp" },
  { id: "bed-double", material: "fabric", name: "Doppelbett 160", category: "schlafen", shape: "bed", width: 1.7, depth: 2.1, height: 0.95, color: "#e9e4dc", promptHint: "double bed with linen bedding" },
  { id: "bed-single", material: "fabric", name: "Einzelbett 90", category: "schlafen", shape: "bed", width: 1.0, depth: 2.05, height: 0.9, color: "#e9e4dc", promptHint: "single bed" },
  { id: "nightstand", material: "wood", name: "Nachttisch", category: "schlafen", shape: "nightstand", width: 0.45, depth: 0.4, height: 0.5, color: "#a07850", promptHint: "bedside table" },
  { id: "wardrobe", material: "lacquer", name: "Kleiderschrank", category: "schlafen", shape: "wardrobe", width: 2.0, depth: 0.6, height: 2.2, color: "#f0ede6", promptHint: "built-in wardrobe" },
  { id: "dining-table", material: "wood", name: "Esstisch 6 Pers.", category: "essen", shape: "table", width: 1.8, depth: 0.9, height: 0.75, color: "#b08a5f", promptHint: "solid oak dining table" },
  { id: "dining-chair", material: "lacquer", name: "Stuhl", category: "essen", shape: "chair", width: 0.48, depth: 0.52, height: 0.85, color: "#2f2f2f", promptHint: "dining chair" },
  { id: "desk", material: "lacquer", name: "Schreibtisch", category: "arbeiten", shape: "desk", width: 1.4, depth: 0.7, height: 0.75, color: "#e7e1d6", promptHint: "minimal desk" },
  { id: "office-chair", material: "fabric", name: "Bürostuhl", category: "arbeiten", shape: "chair", width: 0.6, depth: 0.6, height: 1.1, color: "#3b3b3b", promptHint: "ergonomic office chair" },
  { id: "kitchen-row", material: "lacquer", name: "Küchenzeile 2,8 m", category: "kueche", shape: "kitchen", width: 2.8, depth: 0.62, height: 0.92, color: "#f4f2ee", promptHint: "modern kitchen counter with handleless cabinets" },
  { id: "fridge", material: "metal", name: "Kühlschrank", category: "kueche", shape: "fridge", width: 0.6, depth: 0.65, height: 1.85, color: "#dcdcdc", promptHint: "tall refrigerator" },
  { id: "bathtub", material: "ceramic", name: "Badewanne", category: "bad", shape: "bathtub", width: 1.7, depth: 0.75, height: 0.6, color: "#ffffff", promptHint: "white bathtub" },
  { id: "shower", material: "ceramic", name: "Dusche", category: "bad", shape: "shower", width: 0.9, depth: 0.9, height: 2.0, color: "#cfe3ea", promptHint: "walk-in glass shower" },
  { id: "toilet", material: "ceramic", name: "WC", category: "bad", shape: "toilet", width: 0.38, depth: 0.6, height: 0.8, color: "#ffffff", promptHint: "wall-hung toilet" },
  { id: "sink", material: "ceramic", name: "Waschtisch", category: "bad", shape: "sink", width: 0.8, depth: 0.48, height: 0.85, color: "#ffffff", promptHint: "vanity with washbasin" },
];

/**
 * Nachschlagetabelle für alle Möbel: eingebaute + die des aktuellen Projekts (importierte).
 * Projektspezifische Einträge werden über registerCatalogEntries() eingetragen – der Store ruft das
 * bei jeder Planänderung auf. So funktionieren alle Funktionen (Kollision, 3D, Stile …) ohne Sonderfälle.
 */
export const CATALOG_BY_ID: Record<string, CatalogEntry> = Object.fromEntries(CATALOG.map((e) => [e.id, e]));

export function registerCatalogEntries(entries: readonly CatalogEntry[] | undefined): void {
  for (const e of entries ?? []) CATALOG_BY_ID[e.id] = e;
}

export const isCustomEntry = (e: CatalogEntry | undefined): boolean => !!e?.source;
