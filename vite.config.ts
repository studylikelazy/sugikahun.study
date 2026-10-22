import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const isGitHubPages = process.env.GITHUB_PAGES === "true";

export default defineConfig({
  base: isGitHubPages ? "/sugikahun.study/" : "/",
  plugins: [react()],
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: false,
    host: true,
    allowedHosts: [".e2b.app", "localhost", "127.0.0.1"],
  },
});
