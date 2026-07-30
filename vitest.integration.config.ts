import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

// Testy integracyjne uderzają w lokalny stack Supabase (http://127.0.0.1:54321).
// Wymagają zmiennych z `.env.test.local` (gitignored) — skopiuj z `.env.test.example`
// i uzupełnij wartościami z `npx supabase status`. Lokalnie to osobny config; w CI odpalane
// na wstawianym Supabase (`npx supabase start`) jako część wymaganego checku (od Fazy 5 planu testów).
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    exclude: [...configDefaults.exclude],
    env: loadEnv("test", process.cwd(), ""),
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
