import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  // core wird als TS-Quelle konsumiert und muss deshalb mitgebündelt werden
  noExternal: ["@raumwerk/core"],
});
