import type { RenderStyle } from "@raumwerk/core";

export interface RenderRequest {
  prompt: string;
  style: RenderStyle;
  /** Öffentlich abrufbare URL des 3D-Screenshots (Struktur-Referenz) */
  referenceImageUrl: string;
  aspectRatio: "16:9" | "4:3" | "1:1";
}

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export interface RenderJob {
  id: string;
  status: JobStatus;
  imageUrl?: string;
  error?: string;
}

/** Austauschbarer Bild-Anbieter (Higgsfield, Mock, später z. B. eigener ControlNet-Server). */
export interface RenderProvider {
  readonly name: string;
  submit(req: RenderRequest): Promise<RenderJob>;
  status(id: string): Promise<RenderJob>;
}
