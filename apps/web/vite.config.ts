import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative Pfade: läuft auch in einem Unterordner / auf statischem Hosting
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    // Optional: externe Bild-KI über apps/api (nicht nötig – Fotos rendert die App selbst)
    proxy: { "/api": "http://localhost:8787" },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: { three: ["three", "@react-three/fiber", "@react-three/drei"], pathtracer: ["three-gpu-pathtracer", "three-mesh-bvh"] } } },
  },
});
