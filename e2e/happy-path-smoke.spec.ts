import { expect, test } from "@playwright/test";

// R-E2 (test-plan.md): pełna ścieżka sukcesu z PRD (smoke), na poziomie przeglądarki.
// login (storageState) -> wklej -> klasyfikacja (atrapa mock) -> akceptacja -> Wpisy -> Zrobione -> Zakończone.
// Antywzorzec unikany: happy-path, który nigdy nie dociera do końcowej asercji w /items/done.
test.describe("R-E2: pełna ścieżka do widoku Zakończone", () => {
  const created: string[] = [];

  test.afterEach(async ({ request, baseURL }) => {
    if (!created.length || !baseURL) return;
    await request
      .post("/api/items/bulk", { data: { ids: created.splice(0), action: "trash" }, headers: { Origin: baseURL } })
      .catch(() => undefined);
  });

  test("wpis przechodzi wklej -> akceptacja -> Zrobione i ląduje w Zakończone", async ({ page }) => {
    const title = `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Generacja: wpisz unikalny wsad (realne klawisze — kontrolowana wyspa React) i wyślij.
    await page.goto("/ingest");
    const textarea = page.getByRole("textbox", { name: "Tekst do klasyfikacji" });
    const submit = page.getByRole("button", { name: "Wyślij" });
    await expect(async () => {
      await textarea.click();
      await textarea.press("ControlOrMeta+a");
      await textarea.press("Delete");
      await textarea.pressSequentially(title);
      await expect(submit).toBeEnabled({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    await submit.click();
    await page.waitForURL("**/items", { timeout: 15_000 });

    // Akceptacja (ponawiaj klik aż wpis zniknie z „Do akceptacji" — wyspa React).
    const pendingCard = page.locator("article[data-item-id]", { hasText: title });
    const acceptBtn = pendingCard.getByRole("button", { name: "Zatwierdź" });
    await expect(async () => {
      await acceptBtn.click();
      await expect(pendingCard).toBeHidden({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });

    // „Wpisy" — wpis jest widoczny; zapisz id do sprzątania.
    await page.goto("/items/active");
    const activeCard = page.locator("article[data-item-id]", { hasText: title });
    await expect(activeCard.getByRole("heading", { level: 3, name: title })).toBeVisible();
    const id = await activeCard.getAttribute("data-item-id");
    if (id) created.push(id);

    // Zaznacz wpis i oznacz „Zrobione" przez menu „Zmień stan" (akcja zbiorcza; jeden wpis → bez dialogu).
    // Ponawiaj (zaznacz + otwórz menu + klik), aż wpis zniknie z „Wpisy" (przeszedł do „Zakończone").
    await expect(async () => {
      await activeCard.getByRole("checkbox", { name: `Zaznacz: ${title}` }).check();
      await page.getByRole("button", { name: "Zmień stan" }).click();
      await page.getByRole("menuitem", { name: "Zrobione" }).click();
      await expect(activeCard).toBeHidden({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });

    // KOŃCOWA asercja (R-E2): wpis ląduje w „Zakończone" (/items/done) — pełna ścieżka domknięta.
    await page.goto("/items/done");
    await expect(page.getByRole("heading", { level: 3, name: title })).toBeVisible();
  });
});
