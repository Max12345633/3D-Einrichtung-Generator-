import { CATALOG_BY_ID } from "./catalog";
import type { Plan } from "./types";
import { INTERIOR_STYLES, type StyleId } from "./styles";

/** Für optionale externe Bild-KIs (z. B. Higgsfield) – die Stile kommen aus styles.ts. */
export const RENDER_STYLES = INTERIOR_STYLES;
export type RenderStyle = StyleId;

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
