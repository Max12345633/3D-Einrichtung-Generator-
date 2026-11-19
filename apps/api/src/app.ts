import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { RENDER_STYLES, buildRenderPrompt, parsePlan, type RenderStyle } from "@raumwerk/core";
import type { Env } from "./env";
import type { RenderProvider } from "./providers/types";
import { RateLimiter } from "./rateLimit";
import { UploadError, UploadStore } from "./uploads";
import { ProviderError } from "./providers/higgsfield";
import { importRoutes, type ImportDeps } from "./importRoutes";

const renderBody = z.object({
  plan: z.unknown(),
  style: z.enum(Object.keys(RENDER_STYLES) as [RenderStyle, ...RenderStyle[]]),
  userPrompt: z.string().max(400).optional(),
  imageDataUrl: z.string().startsWith("data:image/"),
  aspectRatio: z.enum(["16:9", "4:3", "1:1"]).default("16:9"),
});

export interface AppDeps {
  env: Env;
  /** Optional: externe Bild-KI. Ohne Provider sind die /api/render-Routen deaktiviert. */
  provider?: RenderProvider;
  uploads?: UploadStore;
  importDeps?: ImportDeps;
  limiter?: RateLimiter;
}

export function createApp({ env, provider, uploads = new UploadStore(), limiter, importDeps }: AppDeps) {
  const rl = limiter ?? new RateLimiter(env.RATE_LIMIT_PER_HOUR, 60 * 60 * 1000);
  const app = new Hono();

  app.use("/api/*", cors({ origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()) }));
  app.onError((err, c) => {
    if (err instanceof UploadError) return c.json({ error: err.message }, 400);
    if (err instanceof z.ZodError) return c.json({ error: "Ungültige Daten", issues: err.issues.slice(0, 5) }, 400);
    if (err instanceof ProviderError) {
      console.error("[provider]", err.message, JSON.stringify(err.details));
      return c.json({ error: "Der Bilddienst ist gerade nicht erreichbar. Bitte später erneut versuchen." }, 502);
    }
    console.error(err);
    return c.json({ error: "Interner Fehler" }, 500);
  });

  app.get("/api/health", (c) => c.json({ ok: true, provider: provider?.name ?? null }));

  // Möbel aus Online-Shops importieren
  app.route("/api/import", importRoutes({ allowPrivate: env.IMPORT_ALLOW_PRIVATE, ...importDeps }));

  if (!provider) return app;

  app.get("/api/uploads/:id", (c) => {
    const img = uploads.get(c.req.param("id"));
    if (!img) return c.json({ error: "Nicht gefunden" }, 404);
    return c.body(img.bytes, 200, { "content-type": img.mime, "cache-control": "private, max-age=3600" });
  });

  app.post("/api/render", bodyLimit({ maxSize: 12 * 1024 * 1024 }), async (c) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const limit = rl.check(ip);
    if (!limit.ok) {
      c.header("retry-after", String(limit.retryAfterSec));
      return c.json({ error: "Limit erreicht – bitte etwas später erneut versuchen." }, 429);
    }
    const body = renderBody.parse(await c.req.json());
    const plan = parsePlan(body.plan);
    const imageId = uploads.putDataUrl(body.imageDataUrl);
    const path = `/api/uploads/${imageId}`;
    const referenceImageUrl = env.PUBLIC_BASE_URL ? new URL(path, env.PUBLIC_BASE_URL).toString() : path;
    const prompt = buildRenderPrompt({ plan, style: body.style, userPrompt: body.userPrompt });
    const job = await provider.submit({ prompt, style: body.style, referenceImageUrl, aspectRatio: body.aspectRatio });
    return c.json({ job, prompt }, 202);
  });

  app.get("/api/render/:id", async (c) => {
    const job = await provider.status(c.req.param("id"));
    return c.json({ job });
  });

  return app;
}
