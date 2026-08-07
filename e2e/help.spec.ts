import { expect, test } from "@playwright/test";

// Strona „Pomoc" (S-17): statyczna referencja w powłoce, chroniona middleware. Weryfikuje:
// render + pozycję w sidebarze + komplet sekcji z kotwicami (deep-link) oraz redirect gościa.
// storageState (playwright.config) wpuszcza zalogowanego; osobny blok czyści sesję dla ochrony.

const SECTION_TITLES = [
  "Zanim zaczniesz",
  "Skrzynka → klasyfikacja → akceptacja",
  "Cykl życia wpisu",
  "Widok „Wpisy” i filtry stanów",
  "Kosz: Odrzucone i Usunięte",
  "Sesje importu i ponawianie",
  "Klucz API (BYOK)",
  "Typy wpisów",
];

test.describe("Pomoc (/help) — zalogowany", () => {
  test("renderuje nagłówek, aktywną pozycję w sidebarze i wszystkie sekcje", async ({ page }) => {
    await page.goto("/help");
    await expect(page).toHaveURL(/\/help$/);
    await expect(page.getByRole("heading", { level: 1, name: "Pomoc" })).toBeVisible();

    const navLink = page.getByRole("link", { name: "Pomoc" });
    await expect(navLink).toHaveAttribute("aria-current", "page");

    for (const title of SECTION_TITLES) {
      await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    }

    await page.screenshot({ path: test.info().outputPath("help-full.png"), fullPage: true });
  });

  test("spis treści linkuje kotwicami, a deep-link #klucz przewija do sekcji klucza", async ({ page }) => {
    await page.goto("/help");
    const toc = page.getByRole("navigation", { name: "Spis treści" });
    await expect(toc.getByRole("link", { name: "Klucz API (BYOK)" })).toHaveAttribute("href", "#klucz");
    await expect(toc.getByRole("link", { name: "Kosz: Odrzucone i Usunięte" })).toHaveAttribute("href", "#kosz");

    await page.goto("/help#klucz");
    const klucz = page.locator("section#klucz");
    await expect(klucz).toBeVisible();
    await expect(klucz).toBeInViewport();
  });
});

test.describe("Pomoc (/help) — ochrona", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("gość jest przekierowany na logowanie", async ({ page }) => {
    await page.goto("/help");
    await expect(page).toHaveURL(/\/auth\/signin/);
  });
});
