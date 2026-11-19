import type { Plan, RenderStyle } from "@raumwerk/core";

export interface RenderJob {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  imageUrl?: string;
  error?: string;
}

async function asJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Fehler ${res.status}`);
  return data;
}

export async function submitRender(input: { plan: Plan; style: RenderStyle; userPrompt?: string; imageDataUrl: string; aspectRatio: "16:9" | "4:3" | "1:1" }) {
  // Hintergrundbild nicht mitschicken – spart Upload, wird serverseitig nicht gebraucht
  const plan = { ...input.plan, background: undefined };
  const res = await fetch("/api/render", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, plan }) });
  return asJson<{ job: RenderJob; prompt: string }>(res);
}

export async function getRender(id: string) {
  return asJson<{ job: RenderJob }>(await fetch(`/api/render/${encodeURIComponent(id)}`));
}

/** Pollt bis fertig; bricht nach ~3 Minuten ab. */
export async function waitForRender(id: string, onUpdate: (job: RenderJob) => void, signal?: AbortSignal): Promise<RenderJob> {
  const started = Date.now();
  let delay = 1200;
  while (Date.now() - started < 180_000) {
    if (signal?.aborted) throw new Error("Abgebrochen");
    const { job } = await getRender(id);
    onUpdate(job);
    if (job.status === "completed" || job.status === "failed") return job;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(4000, delay * 1.3);
  }
  throw new Error("Zeitüberschreitung beim Rendern");
}
