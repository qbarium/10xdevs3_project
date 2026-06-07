import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Vitest rozwiązuje alias `@/*` osobno od tsconfig (Vitest nie czyta tsconfig paths).
export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
