import type { JobStatus, RenderJob, RenderProvider, RenderRequest } from "./types";

/**
 * Higgsfield-Adapter.
 *
 * WICHTIG: Endpunkte, Header und Feldnamen sind über ENV konfigurierbar und müssen vor dem
 * Livegang gegen die aktuelle offizielle Doku geprüft werden (siehe docs/HIGGSFIELD.md).
 * Die Antwort-Auswertung ist absichtlich tolerant (sucht id/status/url in gängigen Formen),
 * damit kleine API-Änderungen nicht sofort alles brechen.
 */
export interface HiggsfieldConfig {
  baseUrl: string;
  apiKey: string;
  apiSecret?: string;
  submitPath: string;
  /** enthält {id} */
  statusPath: string;
  fetchImpl?: typeof fetch;
}

const ASPECT_TO_SIZE: Record<RenderRequest["aspectRatio"], string> = {
  "16:9": "2048x1152",
  "4:3": "2048x1536",
  "1:1": "1536x1536",
};

export class HiggsfieldProvider implements RenderProvider {
  readonly name = "higgsfield";
  private readonly fetch: typeof fetch;
  constructor(private readonly cfg: HiggsfieldConfig) {
    this.fetch = cfg.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
    h["hf-api-key"] = this.cfg.apiKey;
    if (this.cfg.apiSecret) h["hf-secret"] = this.cfg.apiSecret;
    return h;
  }

  async submit(req: RenderRequest): Promise<RenderJob> {
    const body = {
      params: {
        prompt: req.prompt,
        width_and_height: ASPECT_TO_SIZE[req.aspectRatio],
        quality: "1080p",
        batch_size: 1,
        enhance_prompt: false,
        // Struktur-Referenz: das 3D-Bild der eingerichteten Wohnung
        image_reference: { type: "image_url", image_url: req.referenceImageUrl },
      },
    };
    const res = await this.fetch(this.cfg.baseUrl + this.cfg.submitPath, {
      method: "POST", headers: this.headers(), body: JSON.stringify(body),
    });
    const json = await safeJson(res);
    if (!res.ok) throw new ProviderError(`Higgsfield submit ${res.status}`, json);
    const id = pickString(json, ["id", "job_set_id", "jobSetId", "request_id", "job_id"]);
    if (!id) throw new ProviderError("Higgsfield: keine Job-ID in der Antwort", json);
    return { id, status: "queued" };
  }

  async status(id: string): Promise<RenderJob> {
    const url = this.cfg.baseUrl + this.cfg.statusPath.replace("{id}", encodeURIComponent(id));
    const res = await this.fetch(url, { headers: this.headers() });
    const json = await safeJson(res);
    if (!res.ok) throw new ProviderError(`Higgsfield status ${res.status}`, json);
    return parseHiggsfieldStatus(id, json);
  }
}

export class ProviderError extends Error {
  constructor(message: string, readonly details?: unknown) {
    super(message);
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try { return await res.json(); } catch { return null; }
}

function pickString(obj: unknown, keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    const val = (obj as Record<string, unknown>)[k];
    if (typeof val === "string" && val) return val;
  }
  return undefined;
}

const STATUS_MAP: Record<string, JobStatus> = {
  queued: "queued", pending: "queued", created: "queued",
  in_progress: "processing", processing: "processing", running: "processing",
  completed: "completed", succeeded: "completed", success: "completed", done: "completed",
  failed: "failed", error: "failed", nsfw: "failed", canceled: "failed", cancelled: "failed",
};

/** Liest Status + Bild-URL aus Antworten der Form {jobs:[{status, results:{raw:{url}}}]} oder flacher Varianten. */
export function parseHiggsfieldStatus(id: string, json: unknown): RenderJob {
  const root = (json ?? {}) as Record<string, unknown>;
  const job = (Array.isArray(root.jobs) ? root.jobs[0] : root) as Record<string, unknown> | undefined;
  const rawStatus = String(job?.status ?? root.status ?? "processing").toLowerCase();
  const status = STATUS_MAP[rawStatus] ?? "processing";
  const imageUrl = findImageUrl(job) ?? findImageUrl(root);
  if (status === "completed" && !imageUrl) return { id, status: "failed", error: "Kein Bild in der Antwort" };
  if (status === "failed") return { id, status, error: rawStatus === "nsfw" ? "Inhalt abgelehnt" : "Generierung fehlgeschlagen" };
  return { id, status, imageUrl };
}

function findImageUrl(node: unknown, depth = 0): string | undefined {
  if (!node || depth > 5) return undefined;
  if (typeof node === "string") return /^https?:\/\/.+/i.test(node) && /(png|jpe?g|webp)|image|cdn/i.test(node) ? node : undefined;
  if (Array.isArray(node)) {
    for (const n of node) { const u = findImageUrl(n, depth + 1); if (u) return u; }
    return undefined;
  }
  if (typeof node === "object") {
    const rec = node as Record<string, unknown>;
    // bevorzugt "raw"/"url"/"image_url", dann alles andere
    for (const k of ["raw", "url", "image_url", "results", "result", "output", "images"]) {
      if (k in rec) { const u = findImageUrl(rec[k], depth + 1); if (u) return u; }
    }
    for (const val of Object.values(rec)) { const u = findImageUrl(val, depth + 1); if (u) return u; }
  }
  return undefined;
}
