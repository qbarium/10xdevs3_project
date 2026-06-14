// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    // Jedna fizyczna kopia Reacta we wszystkich importach (klient + SSR).
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    ssr: {
      // Bundluj Reacta DO grafu SSR zamiast serwować go z wersjonowanych chunków optymalizatora
      // dev (node_modules/.vite/deps_ssr/*?v=<hash>). To wyjmuje react/react-dom/react-dom-server
      // z mechanizmu generacji `?v=` Vite. Bez tego re-optymalizacja JAKIEJKOLWIEK innej zależności
      // odkrytej w trakcie sesji (np. astro/env/runtime, zod z klasyfikacji) reloadowała deps i
      // potrafiła zostawić `react` w nowej generacji, a `react-dom/server` w starej — w tym samym
      // renderze SSR → dwie instancje Reacta → „Invalid hook call / more than one copy of React".
      // Crash trafiał wyspę z hookiem (SessionsList → SessionRow → useSessionRetry). Problem
      // WYŁĄCZNIE dev — optimizeDeps nie istnieje w buildzie Rollupa. Patrz
      // context/changes/import-session-log-retry/follow-ups/review-fixes.md.
      noExternal: ["react", "react-dom"],
    },
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      BYOK_KEK: envField.string({ context: "server", access: "secret", optional: true }),
      // S-02: warstwa klasyfikacji. Config niesekretny (public, z domyślnymi); sól FR-025 sekretem.
      CLASSIFIER_MODEL: envField.string({ context: "server", access: "public", default: "gpt-4o-mini" }),
      OPENAI_BASE_URL: envField.string({ context: "server", access: "public", default: "https://api.openai.com/v1" }),
      OPENAI_TEMPERATURE: envField.number({ context: "server", access: "public", default: 0.5 }),
      OPENAI_MAX_TOKENS: envField.number({ context: "server", access: "public", default: 16000 }),
      OPENAI_STORE: envField.boolean({ context: "server", access: "public", default: false }),
      CLASSIFICATION_HASH_SALT: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
