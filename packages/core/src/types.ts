import type { CatalogEntry } from "./catalog";

/**
 * Domänenmodell. Alle Längen in METERN, Winkel in RADIANT.
 * 2D-Koordinaten (x, y) des Grundrisses entsprechen im 3D-Raum (x, z); y ist dort die Höhe.
 */
export interface Vec2 {
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  a: Vec2;
  b: Vec2;
  /** Wandstärke in m (Innenwand ~0.12, Außenwand ~0.3) */
  thickness: number;
  /** Wandhöhe in m */
  height: number;
}

export type OpeningKind = "door" | "window";

export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  /** Abstand der Öffnungsmitte vom Wandpunkt a, entlang der Wand */
  offset: number;
  width: number;
  height: number;
  /** Brüstungshöhe (Unterkante über Boden); Türen = 0 */
  sill: number;
}

export interface FurnitureItem {
  id: string;
  catalogId: string;
  /** Mittelpunkt der Grundfläche */
  position: Vec2;
  rotation: number;
  /** optionale Farbüberschreibung (#rrggbb) */
  color?: string;
}

export interface BackgroundImage {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  /** Meter pro Bildpixel (aus Kalibrierung) */
  metersPerPixel: number;
  /** Position der linken oberen Bildecke in Metern */
  origin: Vec2;
  opacity: number;
  /** true, sobald der Nutzer den Maßstab über zwei Punkte festgelegt hat */
  calibrated?: boolean;
}

export type FloorMaterial = "oak-light" | "oak-dark" | "walnut" | "concrete" | "tiles-light" | "tiles-dark";

export interface Plan {
  version: 1;
  id: string;
  name: string;
  walls: Wall[];
  openings: Opening[];
  furniture: FurnitureItem[];
  /** Legacy-Farbton; maßgeblich ist floorMaterial */
  floorColor: string;
  floorMaterial?: FloorMaterial;
  wallColor: string;
  background?: BackgroundImage;
  /** Aus Online-Shops importierte Möbel dieses Projekts */
  customCatalog?: CatalogEntry[];
  updatedAt: string;
}
