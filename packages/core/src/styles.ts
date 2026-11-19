import { CATALOG_BY_ID, type MaterialRole } from "./catalog";
import type { FloorMaterial, Plan } from "./types";

/**
 * Einrichtungsstile: eine stimmige Palette aus Boden, Wand und Möbelfarben je Material-Rolle.
 * Wird im Foto-Dialog auf das Projekt angewendet (rückgängig machbar) und taugt später
 * als Prompt-Grundlage für externe Bild-KIs.
 */
export interface InteriorStyle {
  label: string;
  floor: FloorMaterial;
  wall: string;
  /** Mehrere Stofffarben → Abwechslung zwischen Sofa, Sessel, Bett … */
  fabric: string[];
  wood: string;
  lacquer: string;
  metal: string;
  textile: string[];
  /** englische Beschreibung für Bild-KIs (optional genutzt) */
  prompt: string;
}

export const INTERIOR_STYLES = {
  skandinavisch: {
    label: "Skandinavisch", floor: "oak-light", wall: "#f4f2ed",
    fabric: ["#d9d4cb", "#b9c2b4", "#e8e2d6"], wood: "#c9a97f", lacquer: "#f5f3ef", metal: "#2c2c2c", textile: ["#e6e0d4", "#cfc6b6"],
    prompt: "Scandinavian interior, light oak wood, white walls, soft wool textiles, airy and calm",
  },
  modern: {
    label: "Modern", floor: "concrete", wall: "#ecebe8",
    fabric: ["#5d6166", "#a7a29a", "#3e4a52"], wood: "#6b4b35", lacquer: "#e9e7e3", metal: "#1d1d1d", textile: ["#8e8a84", "#c9c4bb"],
    prompt: "contemporary modern interior, clean lines, neutral palette, matte finishes, designer lighting",
  },
  japandi: {
    label: "Japandi", floor: "oak-light", wall: "#e9e3d8",
    fabric: ["#c8bba6", "#8f8a7a", "#ded5c4"], wood: "#a27e57", lacquer: "#cfc4b3", metal: "#3a3530", textile: ["#d6ccbb", "#b5a993"],
    prompt: "Japandi interior, warm minimalism, natural materials, linen, low furniture, muted earth tones",
  },
  industrial: {
    label: "Industrial", floor: "concrete", wall: "#d6d2cb",
    fabric: ["#6e4a35", "#3b3f42", "#8a6a4f"], wood: "#5a3d2a", lacquer: "#2a2a2a", metal: "#151515", textile: ["#5f5650", "#8b7d6f"],
    prompt: "industrial loft interior, exposed concrete, black steel, leather, warm Edison lighting",
  },
  landhaus: {
    label: "Landhaus", floor: "oak-dark", wall: "#f1ebe0",
    fabric: ["#e4dccb", "#9fae9a", "#c9b39a"], wood: "#8b643f", lacquer: "#ece6da", metal: "#4a4038", textile: ["#c7b49a", "#a58d74"],
    prompt: "modern country house interior, rustic wood, cosy fabrics, warm cream tones",
  },
  luxus: {
    label: "Luxus", floor: "walnut", wall: "#e8e2da",
    fabric: ["#2f4a46", "#7a5a43", "#d8cfc2"], wood: "#4a3123", lacquer: "#1e1e1e", metal: "#b08d57", textile: ["#cdbfae", "#6b5b4d"],
    prompt: "luxury interior, marble, brass accents, velvet upholstery, elegant statement lighting",
  },
  boho: {
    label: "Boho", floor: "oak-dark", wall: "#efe4d6",
    fabric: ["#c46f4b", "#d9b98c", "#7f8f6a"], wood: "#9a6a42", lacquer: "#e8dcc8", metal: "#6b5236", textile: ["#c98d6a", "#a8875f"],
    prompt: "bohemian interior, rattan, plants, layered patterned rugs, warm terracotta tones",
  },
} satisfies Record<string, InteriorStyle>;

export const FLOOR_MATERIALS: { id: FloorMaterial; label: string; swatch: string }[] = [
  { id: "oak-light", label: "Eiche hell", swatch: "#caa67a" },
  { id: "oak-dark", label: "Eiche dunkel", swatch: "#8f6847" },
  { id: "walnut", label: "Nussbaum", swatch: "#5f4130" },
  { id: "concrete", label: "Beton", swatch: "#a9a7a2" },
  { id: "tiles-light", label: "Fliese hell", swatch: "#e9e6e0" },
  { id: "tiles-dark", label: "Fliese dunkel", swatch: "#4b4a48" },
];

export type StyleId = keyof typeof INTERIOR_STYLES;
export const STYLE_IDS = Object.keys(INTERIOR_STYLES) as StyleId[];

/** Feuchträume behalten Fliesen, egal welcher Stil. */
const roleColor = (style: InteriorStyle, role: MaterialRole, index: number): string | undefined => {
  switch (role) {
    case "fabric": return style.fabric[index % style.fabric.length];
    case "textile": return style.textile[index % style.textile.length];
    case "wood": return style.wood;
    case "lacquer": return style.lacquer;
    case "metal": return style.metal;
    default: return undefined; // Keramik, Pflanzen behalten ihre Farbe
  }
};

export function applyStyle(plan: Plan, id: StyleId): Plan {
  const style: InteriorStyle = INTERIOR_STYLES[id];
  const counters: Partial<Record<MaterialRole, number>> = {};
  const furniture = plan.furniture.map((f) => {
    const entry = CATALOG_BY_ID[f.catalogId];
    if (!entry) return f;
    const i = counters[entry.material] ?? 0;
    counters[entry.material] = i + 1;
    const color = roleColor(style, entry.material, i);
    if (!color) {
      const { color: _drop, ...rest } = f;
      return rest;
    }
    return { ...f, color };
  });
  return { ...plan, floorMaterial: style.floor, wallColor: style.wall, furniture, updatedAt: new Date().toISOString() };
}
