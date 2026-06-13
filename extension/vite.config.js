import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, "sidepanel.html"),
      },
    },
    // Don't hash filenames — Chrome extensions need predictable paths
    chunkFileNames: "assets/[name].js",
    assetFileNames: "assets/[name].[ext]",
  },
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify(
      process.env.VITE_API_URL || "http://localhost:8000"
    ),
  },
  test: {
    environment: "node",
    globals: true,
  },
});
