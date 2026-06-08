import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Vitest rozwiązuje alias `@/*` osobno od tsconfig (Vitest nie czyta tsconfig paths).
// Testy jednostkowe (CI). Testy integracyjne (wymagają lokalnego Supabase) mają
// osobny config: `vitest.integration.config.ts` — tu są wykluczone.
export default defineConfig({
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
