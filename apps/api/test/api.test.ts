import { describe, expect, it } from "vitest";
import { samplePlan } from "@raumwerk/core";
import { createApp } from "../src/app";
import { loadEnv } from "../src/env";
import { MockProvider } from "../src/providers/mock";
import { HiggsfieldProvider, parseHiggsfieldStatus } from "../src/providers/higgsfield";
import { RateLimiter } from "../src/rateLimit";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const env = loadEnv({});

const post = (app: ReturnType<typeof createApp>, body: unknown) =>
  app.request("/api/render", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("API", () => {
  it("rendert mit dem Mock-Provider bis zum fertigen Bild", async () => {
    const app = createApp({ env, provider: new MockProvider(0) });
    const res = await post(app, { plan: samplePlan(), style: "modern", imageDataUrl: PNG });
    expect(res.status).toBe(202);
    const { job, prompt } = (await res.json()) as { job: { id: string }; prompt: string };
    expect(prompt).toContain("modern");
    const status = (await (await app.request(`/api/render/${job.id}`)).json()) as { job: { status: string; imageUrl: string } };
    expect(status.job.status).toBe("completed");
    const img = await app.request(status.job.imageUrl);
    expect(img.headers.get("content-type")).toBe("image/png");
  });

  it("lehnt ungültige Pläne und Bilder ab", async () => {
    const app = createApp({ env, provider: new MockProvider(0) });
    expect((await post(app, { plan: { foo: 1 }, style: "modern", imageDataUrl: PNG })).status).toBe(400);
    expect((await post(app, { plan: samplePlan(), style: "modern", imageDataUrl: "data:image/gif;base64,AAAA" })).status).toBe(400);
    expect((await post(app, { plan: samplePlan(), style: "barock", imageDataUrl: PNG })).status).toBe(400);
  });

  it("begrenzt Anfragen", async () => {
    const app = createApp({ env, provider: new MockProvider(0), limiter: new RateLimiter(1, 60_000) });
    expect((await post(app, { plan: samplePlan(), style: "modern", imageDataUrl: PNG })).status).toBe(202);
    expect((await post(app, { plan: samplePlan(), style: "modern", imageDataUrl: PNG })).status).toBe(429);
  });
});

describe("Higgsfield-Adapter", () => {
  it("sendet Auth-Header und Referenzbild, liest Job-ID", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ id: "js_1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const p = new HiggsfieldProvider({ baseUrl: "https://hf.test", apiKey: "k", apiSecret: "s", submitPath: "/submit", statusPath: "/s/{id}", fetchImpl });
    const job = await p.submit({ prompt: "x", style: "modern", referenceImageUrl: "https://me/img.png", aspectRatio: "16:9" });
    expect(job.id).toBe("js_1");
    expect(captured!.url).toBe("https://hf.test/submit");
    const headers = captured!.init.headers as Record<string, string>;
    expect(headers["hf-api-key"]).toBe("k");
    expect(JSON.parse(String(captured!.init.body)).params.image_reference.image_url).toBe("https://me/img.png");
  });

  it("wertet verschiedene Statusformen aus", () => {
    expect(parseHiggsfieldStatus("a", { jobs: [{ status: "completed", results: { raw: { url: "https://cdn.x/a.png" } } }] }))
      .toEqual({ id: "a", status: "completed", imageUrl: "https://cdn.x/a.png" });
    expect(parseHiggsfieldStatus("a", { status: "in_progress" }).status).toBe("processing");
    expect(parseHiggsfieldStatus("a", { jobs: [{ status: "nsfw" }] }).status).toBe("failed");
    expect(parseHiggsfieldStatus("a", { status: "completed" }).status).toBe("failed");
  });
});
