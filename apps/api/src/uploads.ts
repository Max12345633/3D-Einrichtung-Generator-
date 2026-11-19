import { createId } from "@raumwerk/core";

export interface StoredImage {
  mime: string;
  bytes: Uint8Array<ArrayBuffer>;
  expiresAt: number;
}

const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;

/**
 * Flüchtiger Bildspeicher (In-Memory, TTL). Für Produktion durch Objektspeicher
 * (z. B. Cloudflare R2 / S3 mit signierten URLs) ersetzen – Interface bleibt gleich.
 */
export class UploadStore {
  private images = new Map<string, StoredImage>();
  constructor(private readonly ttlMs = 60 * 60 * 1000, private readonly maxBytes = 8 * 1024 * 1024) {}

  putDataUrl(dataUrl: string): string {
    const m = DATA_URL.exec(dataUrl);
    if (!m) throw new UploadError("Nur PNG, JPEG oder WebP als Data-URL erlaubt");
    const bytes = new Uint8Array(Buffer.from(m[2]!, "base64"));
    if (bytes.byteLength > this.maxBytes) throw new UploadError("Bild ist zu groß (max. 8 MB)");
    this.sweep();
    const id = createId("img");
    this.images.set(id, { mime: m[1]!, bytes, expiresAt: Date.now() + this.ttlMs });
    return id;
  }

  get(id: string): StoredImage | undefined {
    const img = this.images.get(id);
    if (img && img.expiresAt < Date.now()) { this.images.delete(id); return undefined; }
    return img;
  }

  private sweep() {
    const now = Date.now();
    for (const [id, img] of this.images) if (img.expiresAt < now) this.images.delete(id);
  }
}

export class UploadError extends Error {}
