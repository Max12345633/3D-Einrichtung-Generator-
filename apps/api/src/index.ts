import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadEnv } from "./env";
import { HiggsfieldProvider } from "./providers/higgsfield";
import { MockProvider } from "./providers/mock";
import type { RenderProvider } from "./providers/types";

const env = loadEnv();

function createProvider(): RenderProvider {
  if (env.RENDER_PROVIDER === "mock") return new MockProvider();
  if (!env.HIGGSFIELD_API_KEY) throw new Error("RENDER_PROVIDER=higgsfield braucht HIGGSFIELD_API_KEY");
  if (!env.PUBLIC_BASE_URL) throw new Error("RENDER_PROVIDER=higgsfield braucht PUBLIC_BASE_URL (Higgsfield lädt das Referenzbild per URL)");
  return new HiggsfieldProvider({
    baseUrl: env.HIGGSFIELD_BASE_URL,
    apiKey: env.HIGGSFIELD_API_KEY,
    apiSecret: env.HIGGSFIELD_API_SECRET,
    submitPath: env.HIGGSFIELD_SUBMIT_PATH,
    statusPath: env.HIGGSFIELD_STATUS_PATH,
  });
}

const provider = createProvider();
serve({ fetch: createApp({ env, provider }).fetch, port: env.PORT }, (info) => {
  console.log(`API läuft auf http://localhost:${info.port} (Bilddienst: ${provider.name})`);
});
