import { defineConfig, devices } from "@playwright/test";

// Konfiguracja E2E (M3L4 / zmiana testing-e2e-user-flows).
// - Sesja wstrzykiwana z zapisanego storageState (patrz playwright/.auth/user.json, gitignored).
// - webServer uruchamia dev Z trybem mock klasyfikatora (CLASSIFIER_MODEL=mock), żeby E2E nie wołało
//   prawdziwego dostawcy AI. Szew: src/lib/ai/classifier.ts (kind:"mock"). Prod używa gpt-4o-mini,
//   więc atrapa jest tam martwa.
// - reuseExistingServer:false → zawsze świeży dev w trybie mock; port 4321 musi być wolny (ubij
//   ewentualny wiszący `astro dev` przed uruchomieniem). Normalny dev bez mock zostaje nietknięty.
// - Sekwencyjnie (workers:1): testy dzielą jedno konto; izolację daje unikalny wsad per test.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4321",
    storageState: "playwright/.auth/user.json",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:4321/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { CLASSIFIER_MODEL: "mock" },
  },
});
