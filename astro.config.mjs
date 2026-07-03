// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  // Anti-CSRF (S-14): jawny pin domyślnej ochrony Astro (`checkOrigin` jest domyślnie `true` od
  // Astro 5). Wbudowany middleware odrzuca 403 cross-site żądania mutujące z formularzowym
  // Content-Type (urlencoded/multipart/text-plain) lub bez Content-Type. Pin chroni przed cichym
  // wyłączeniem przy aktualizacji frameworka/refaktorze. Warstwę aplikacyjną (pokrycie
  // `application/json` + `Sec-Fetch-Site`) dokłada `src/middleware.ts` przez `src/lib/security/csrf.ts`.
  security: { checkOrigin: true },
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    // Jedna fizyczna kopia Reacta we wszystkich importach (klient + SSR).
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    // S-10 follow-up (dup-React SSR): pre-bundluj `astro/env/runtime` OD RAZU, by NIE był odkrywany
    // późno w sesji. Późne odkrycie tej zależności wyzwalało re-optymalizację deps Vite (`optimized
    // dependencies changed. reloading`), która rozjeżdżała generacje `?v=` Reacta (core vs
    // react-dom/server) w trakcie renderu SSR → „Invalid hook call / more than one copy of React".
    // Brak re-optymalizacji = brak rozjazdu generacji. Klient + SSR, bo to optymalizator SSR
    // (`deps_ssr`) firował ten reload. UWAGA (S-12): późnych depów jest cała populacja, nie jeden —
    // pełny pin całej rodziny React + deps aplikacji siedzi w `ssr.optimizeDeps.include` niżej.
    // Ten top-level include celowo zostaje minimalny; parytet (czy `deps_astro` też wymaga listy)
    // rozstrzyga empirycznie Faza 2 S-12.
    optimizeDeps: {
      include: ["astro/env/runtime"],
    },
    ssr: {
      // `noExternal` bundluje react/react-dom DO grafu SSR zamiast serwować je z wersjonowanych
      // chunków optymalizatora dev (`deps_ssr/*?v=<hash>`). Dysk (S-12 research.md) dowodzi, że
      // zadziałało to WYŁĄCZNIE w środowisku `deps_astro` (tam React w ogóle nie wchodzi w graf),
      // ale NIE chroni ścieżki crashu: środowisko `deps_ssr`, które faktycznie renderuje wyspy React,
      // wciąż ma `react` i `react-dom/server` jako pełne chunki `?v=`. Realną dźwignią eliminującą
      // wyścig generacji jest pin rodziny React + całej populacji późno-odkrywanych depów w
      // `ssr.optimizeDeps.include` niżej (S-12), nie ten `noExternal`. Dyrektywę trzymamy dla
      // `deps_astro`; jej konieczność na adapterze workerd jest niepotwierdzona — rozstrzyga Faza 2
      // S-12. Patrz context/changes/dup-react-ssr-dev-fix/ (research.md + plan.md).
      noExternal: ["react", "react-dom"],
      // S-12 (dup-React SSR): pre-bundluj OD RAZU całą populację późno-odkrywanych zależności grafu
      // wyspy, nie tylko `astro/env/runtime` (to był residual S-10). Dowolna z nich odkryta w trakcie
      // sesji wyzwalała re-optymalizację (`optimized dependencies changed. reloading`), która bumpuje
      // browserHash środowiska `deps_ssr` i rozjeżdża generacje `?v=` `react` (core) vs
      // `react-dom/server` w jednym renderze SSR → „Invalid hook call / more than one copy of React".
      // Cold-scan łapie całą listę od razu → zero mid-session reopt → zero rozjazdu generacji.
      // Wyłącznie dev — `optimizeDeps` nie istnieje w buildzie Rollupa. Reguła utrzymania: nowy dep
      // osiągalny z grafu wyspy → dopisz go tutaj.
      optimizeDeps: {
        include: [
          "astro/env/runtime",
          "react",
          "react-dom",
          "react-dom/server",
          "react/jsx-runtime",
          "react/jsx-dev-runtime",
          "@supabase/ssr",
          "zod",
          "sonner",
          "lucide-react",
          "radix-ui",
          "@radix-ui/react-slot",
          "class-variance-authority",
          "clsx",
          "tailwind-merge",
        ],
      },
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
