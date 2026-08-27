// Desktop Pet build: bundles the transparent renderer independently from Electron's main process.
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/renderer",
  base: "./",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
});
