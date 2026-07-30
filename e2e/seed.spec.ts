import { expect, test } from "@playwright/test";

// Test-wzorzec (seed) + smoke fundamentu E2E (M3L4). Dwie role naraz:
// 1) pokazuje generatorowi wzór dobrego testu — selektory po roli (getByRole), czekanie na STAN
//    (toBeVisible), nazwa spięta z celem, zero waitForTimeout;
// 2) dowodzi, że fundament działa end-to-end: storageState wpuszcza (auth), a konto ma klucz BYOK
//    (renderuje się formularz, nie onboarding). Tryb mock potwierdzą dopiero testy generacji.
test("zalogowany użytkownik widzi Skrzynkę wejściową z formularzem klasyfikacji", async ({ page }) => {
  await page.goto("/ingest");

  // storageState → jesteśmy w środku, bez formularza logowania.
  await expect(page.getByRole("heading", { name: "Skrzynka wejściowa" })).toBeVisible();

  // Klucz BYOK skonfigurowany → pole tekstowe (nie ekran onboardingu). Fail-fast, gdyby klucz zniknął.
  await expect(page.getByRole("textbox", { name: "Tekst do klasyfikacji" })).toBeVisible();
});
