import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Tool Family Configurator. Two pages: the Build-Library workflow (index) and the
// Lever-Model explorer (lever). base "./" → works at any path; esnext for modern output.
export default defineConfig({
  base: "./",
  build: {
    target: "esnext",
    rollupOptions: { input: { main: r("index.html"), lever: r("lever.html"), deflection: r("deflection.html") } },
  },
});
