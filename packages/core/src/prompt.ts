import { CATALOG_BY_ID } from "./catalog";
import type { Plan } from "./types";

export const RENDER_STYLES = {
  skandinavisch: { label: "Skandinavisch", prompt: "Scandinavian interior, light oak wood, white walls, soft wool textiles, airy and calm" },
  modern: { label: "Modern", prompt: "contemporary modern interior, clean lines, neutral palette, matte finishes, designer lighting" },
  japandi: { label: "Japandi", prompt: "Japandi interior, warm minimalism, natural materials, linen, low furniture, muted earth tones" },
  industrial: { label: "Industrial", prompt: "industrial loft interior, exposed concrete, black steel, leather, warm Edison lighting" },
  landhaus: { label: "Landhaus", prompt: "modern country house interior, rustic wood, cosy fabrics, warm cream tones" },
  luxus: { label: "Luxus", prompt: "luxury interior, marble, brass accents, velvet upholstery, elegant statement lighting" },
  boho: { label: "Boho", prompt: "bohemian interior, rattan, plants, layered patterned rugs, warm terracotta tones" },
} as const;

export type RenderStyle = keyof typeof RENDER_STYLES;

export interface PromptInput {
  plan: Plan;
  style: RenderStyle;
  /** Freitext des Nutzers, z. B. "Abendstimmung, grüne Wand" */
  userPrompt?: string;
}

/**
 * Baut den Prompt für die Bildgenerierung. Das 3D-Bild dient als Struktur-Referenz;
 * der Prompt beschreibt Stil + die tatsächlich platzierten Möbel, damit das Modell nichts erfindet.
 */
export function buildRenderPrompt({ plan, style, userPrompt }: PromptInput): string {
  const counts = new Map<string, number>();
  for (const item of plan.furniture) {
    const hint = CATALOG_BY_ID[item.catalogId]?.promptHint;
    if (hint) counts.set(hint, (counts.get(hint) ?? 0) + 1);
  }
  const furniture = [...counts.entries()].map(([h, n]) => (n > 1 ? `${n}x ${h}` : h)).join(", ");
  const parts = [
    "Photorealistic interior design photograph of the room shown in the reference image",
    "keep the exact room geometry, walls, windows, doors, camera angle and furniture placement",
    RENDER_STYLES[style].prompt,
    furniture && `furniture: ${furniture}`,
    userPrompt?.trim().slice(0, 400),
    "natural daylight, global illumination, high detail, architectural photography, 35mm lens",
  ];
  return parts.filter(Boolean).join(". ");
}
