import { Hono } from "hono";
import { z } from "zod";
import { parseProductHtml } from "@raumwerk/core";
import { RateLimiter } from "./rateLimit";
import { FetchBlockedError, UpstreamError, safeFetch, type LookupFn } from "./safeFetch";

export interface ImportDeps {
  fetchImpl?: typeof fetch;
  lookup?: LookupFn;
  allowPrivate?: boolean;
  limiter?: RateLimiter;
}

const IMAGE_TYPES = /^image\/(png|jpe?g|webp|gif|avif)\b/i;

/** HTML mit dem richtigen Zeichensatz dekodieren (Header oder <meta charset>, sonst UTF-8). */
export function decodeHtml(body: Uint8Array, contentType: string): string {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType)?.[1];
  const head = new TextDecoder("latin1").decode(body.subarray(0, 2048));
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  const charset = (fromHeader ?? fromMeta ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

const clientKey = (header: string | undefined) => header?.split(",")[0]?.trim() ?? "local";

export function importRoutes(deps: ImportDeps = {}) {
  const limiter = deps.limiter ?? new RateLimiter(120, 60 * 60 * 1000);
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof FetchBlockedError) return c.json({ error: err.message, code: "invalid" }, 400);
    if (err instanceof UpstreamError) {
      const blocked = [401, 403, 429, 503].includes(err.status);
      return c.json({
        error: blocked
          ? "Der Shop lässt keinen automatischen Abruf zu. Nutze den Lesezeichen-Knopf auf der Produktseite oder trage die Maße selbst ein."
          : `Die Seite konnte nicht geladen werden (${err.message}).`,
        code: blocked ? "blocked" : "unreachable",
      }, 502);
    }
    if (err instanceof z.ZodError) return c.json({ error: "Bitte einen gültigen Link einfügen.", code: "invalid" }, 400);
    console.error(err);
    return c.json({ error: "Interner Fehler", code: "internal" }, 500);
  });

  app.use("*", async (c, next) => {
    const r = limiter.check(clientKey(c.req.header("x-forwarded-for")));
    if (!r.ok) {
      c.header("retry-after", String(r.retryAfterSec));
      return c.json({ error: "Zu viele Importe – bitte kurz warten.", code: "rate" }, 429);
    }
    await next();
  });

  app.post("/product", async (c) => {
    const { url } = z.object({ url: z.string().trim().url().max(2000) }).parse(await c.req.json());
    const res = await safeFetch(url, { ...deps, maxBytes: 4 * 1024 * 1024, accept: "text/html,application/xhtml+xml" });
    if (!/html|xml/i.test(res.contentType)) {
      return c.json({ error: "Der Link führt nicht zu einer Webseite.", code: "invalid" }, 400);
    }
    const product = parseProductHtml(decodeHtml(res.body, res.contentType), res.url);
    const warnings: string[] = [];
    const d = product.dimensions;
    if (!d.width || !d.depth || !d.height) warnings.push("Nicht alle Maße gefunden – bitte prüfen und ergänzen.");
    if (product.name === "Importiertes Möbel") warnings.push("Kein Produktname gefunden.");
    return c.json({ product, warnings });
  });

  /** Produktbild über den eigenen Server laden: gleiche Herkunft → Farbe per Canvas auslesbar. */
  app.get("/image", async (c) => {
    const url = z.string().url().max(2000).parse(c.req.query("url"));
    const res = await safeFetch(url, { ...deps, maxBytes: 6 * 1024 * 1024, accept: "image/*" });
    const type = res.contentType.split(";")[0]!.trim();
    if (!IMAGE_TYPES.test(type)) return c.json({ error: "Kein Bild", code: "invalid" }, 400);
    return c.body(res.body, 200, {
      "content-type": type,
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    });
  });

  return app;
}
