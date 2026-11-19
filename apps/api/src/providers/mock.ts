import { createId } from "@raumwerk/core";
import type { RenderJob, RenderProvider, RenderRequest } from "./types";

/** Lokaler Ersatz ohne API-Key: gibt nach kurzer Zeit das Referenzbild zurück. */
export class MockProvider implements RenderProvider {
  readonly name = "mock";
  private jobs = new Map<string, { req: RenderRequest; createdAt: number }>();
  constructor(private readonly delayMs = 2500) {}

  async submit(req: RenderRequest): Promise<RenderJob> {
    const id = createId("mock");
    this.jobs.set(id, { req, createdAt: Date.now() });
    return { id, status: "queued" };
  }

  async status(id: string): Promise<RenderJob> {
    const job = this.jobs.get(id);
    if (!job) return { id, status: "failed", error: "Job nicht gefunden" };
    const age = Date.now() - job.createdAt;
    if (age < this.delayMs) return { id, status: age < this.delayMs / 3 ? "queued" : "processing" };
    return { id, status: "completed", imageUrl: job.req.referenceImageUrl };
  }
}
