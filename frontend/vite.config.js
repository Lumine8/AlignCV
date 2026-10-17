import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// AlignCV is a 100% client-side app: there is no backend. The build is fully
// static and uses relative asset paths so it works on Vercel, GitHub Pages or
// any static host (including subdirectory deployments and file:// previews).
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
  },
  optimizeDeps: {
    exclude: ["@xenova/transformers"],
  },
  worker: {
    format: "es",
  },
});
