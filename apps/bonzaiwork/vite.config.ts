import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

// The single place that knows where upstream UI code lives (see tsconfig.json
// "paths" for the type-level twin). `@/` must stay upstream's src: their
// components import each other through it. Our own code uses `~/`.
export const UPSTREAM_APP_SRC = resolve(appRoot, "../app/src");

export default defineConfig({
  // Packaged Electron loads index.html from file://, so assets must be relative.
  base: process.env.BONZAIWORK_ELECTRON_BUILD === "1" ? "./" : "/",
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": UPSTREAM_APP_SRC,
      "~": resolve(appRoot, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  define: {
    // Upstream modules read these build constants.
    "import.meta.env.VITE_OPENWORK_APP_VERSION": JSON.stringify(process.env.npm_package_version ?? "0.0.0"),
    "import.meta.env.VITE_OPENWORK_BUILD_SHA": JSON.stringify(""),
  },
  server: {
    port: Number.parseInt(process.env.PORT ?? "", 10) || 5183,
    strictPort: true,
  },
  build: {
    target: "esnext",
    outDir: "dist",
  },
});
