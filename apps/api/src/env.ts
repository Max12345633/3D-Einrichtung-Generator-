import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  RENDER_PROVIDER: z.enum(["mock", "higgsfield"]).default("mock"),
  /** Öffentliche URL dieses Servers – Higgsfield muss das Referenzbild per URL abrufen können */
  PUBLIC_BASE_URL: z.string().url().optional(),
  HIGGSFIELD_API_KEY: z.string().optional(),
  HIGGSFIELD_API_SECRET: z.string().optional(),
  HIGGSFIELD_BASE_URL: z.string().url().default("https://platform.higgsfield.ai"),
  HIGGSFIELD_SUBMIT_PATH: z.string().default("/v1/text2image/soul"),
  HIGGSFIELD_STATUS_PATH: z.string().default("/v1/job-sets/{id}"),
  RATE_LIMIT_PER_HOUR: z.coerce.number().default(30),
});

export type Env = z.infer<typeof envSchema>;
export const loadEnv = (source: Record<string, string | undefined> = process.env): Env => envSchema.parse(source);
