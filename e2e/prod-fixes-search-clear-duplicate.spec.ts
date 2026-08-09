import { expect, test } from "@playwright/test";

// Ticket (przegląd operatora 2026-08-09): pole filtra (SearchBox, type="search") po wpisaniu frazy
// pokazywało DWA przyciski × — natywny ::-webkit-search-cancel-button przeglądarki ORAZ nasz własny
// „Wyczyść wyszukiwanie". Naprawa (global.css) ukrywa natywny; zostaje jeden.
//
// Natywny × to pseudo-element (poza DOM, a getComputedStyle jest dla niego w Chromium niemiarodajny),
// więc weryfikujemy dwutorowo: (1) własny przycisk jest DOKŁADNIE jeden i czyści pole; (2) reguła
// ukrywająca natywny przycisk jest obecna w załadowanym CSS (jej usunięcie = powrót drugiego ×).
test.describe("Filtr: pojedynczy przycisk czyszczenia (bez dublowania ×)", () => {
  test("po wpisaniu frazy jest jeden własny przycisk czyszczenia i czyści pole; natywny × ukryty w CSS", async ({
    page,
  }) => {
    await page.goto("/items/active");
    await page.waitForLoadState("networkidle");
    const search = page.getByRole("searchbox", { name: "Szukaj w tytule i opisie" });
    await expect(search).toBeVisible();
    await search.click();
    await page.waitForTimeout(800); // hydratacja wyspy szukajki (client:load) przed pisaniem z klawiatury

    // Pisanie znak po znaku wyzwala React onChange (kontrolowany input); retry na wypadek późnej hydratacji
    // (kumulacja „k" nieszkodliwa). Po pojawieniu się przycisku sprawdzamy, że jest DOKŁADNIE jeden.
    const clear = page.getByRole("button", { name: "Wyczyść wyszukiwanie" });
    await expect(async () => {
      await search.pressSequentially("k");
      await expect(clear).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await expect(clear).toHaveCount(1);
    await clear.click();
    await expect(search).toHaveValue("");

    // Reguła ukrywająca natywny ::-webkit-search-cancel-button jest w załadowanym CSS (global.css).
    const ruleLoaded = await page.evaluate(() =>
      [...document.styleSheets].some((sheet) => {
        try {
          return [...sheet.cssRules].some((rule) => rule.cssText.includes("search-cancel-button"));
        } catch {
          return false; // cross-origin arkusz (np. fontsource) — pomiń
        }
      }),
    );
    expect(ruleLoaded).toBe(true);
  });
});
