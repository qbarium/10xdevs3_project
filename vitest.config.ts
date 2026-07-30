import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Vitest rozwiązuje alias `@/*` osobno od tsconfig (Vitest nie czyta tsconfig paths).
// Testy jednostkowe (CI). Testy integracyjne (wymagają lokalnego Supabase) mają
// osobny config: `vitest.integration.config.ts` — tu są wykluczone.
export default defineConfig({
  test: {
    environment: "node",
    // e2e/** to testy Playwright (własny runner, `npm run e2e`) — Vitest ich nie zbiera.
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts", "e2e/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
