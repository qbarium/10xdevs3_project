import { expect, test } from "@playwright/test";

// F1 (przegląd Fazy 9, S-15): powłoka stron chronionych NIE może brać sztywnych 100vh. Baner konfiguracji
// (Layout.astro) to rodzeństwo w flow NAD powłoką — przy `h-screen` dolny rząd listy (Na stronę + paginacja)
// schodził pod ekran, a `overflow-hidden` oddawał go tylko scrollowi CAŁEGO dokumentu. Baner jest dziś
// nieosiągalny u zalogowanego użytkownika (jedyny realny to brak Supabase → redirect na signin), więc
// wymuszamy go szwem dev: ciasteczko `e2e_config_banner=1` czytane w Layout.astro tylko w `import.meta.env.DEV`.
// Test padłby na starym `h-screen` (dokument wyższy o wysokość banera) i przechodzi po naprawie (flex-1).
test.describe("F1: powłoka z banerem nie chowa dolnego rzędu listy", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: "e2e_config_banner", value: "1", url: baseURL ?? "http://localhost:4321" }]);
  });

  test("Wpisy: baner widoczny, a kontrolki stron zostają w oknie", async ({ page }) => {
    await page.goto("/items/active");

    // Szew zadziałał: wymuszony pasek konfiguracji jest w DOM i widoczny.
    await expect(page.getByText("Wymuszony pasek konfiguracji")).toBeVisible();

    // Sedno F1: dolny rząd (kontrolka „Na stronę") mieści się w oknie — nie jest zepchnięty pod ekran.
    const pageSize = page.getByRole("combobox", { name: "Liczba elementów na stronę" });
    await expect(pageSize).toBeVisible();
    const box = await pageSize.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      const viewportHeight = page.viewportSize()?.height ?? 0;
      expect(box.y + box.height).toBeLessThanOrEqual(viewportHeight + 1);
    }

    // Treść body (baner + powłoka) mieści się w oknie — przewija się tylko wewnętrzna lista. Na starym
    // układzie (powłoka na sztywne 100vh) baner spychał treść i body byłoby wyższe o wysokość banera.
    // Mierzymy `body.scrollHeight`, a NIE `documentElement`: w trybie dev Astro wstrzykuje <astro-dev-toolbar>,
    // który zawyża `documentElement.scrollHeight` (~1240 px), a nie istnieje w buildzie produkcyjnym.
    const bodyScrollHeight = await page.evaluate(() => document.body.scrollHeight);
    const allowance = (page.viewportSize()?.height ?? 0) + 2;
    expect(bodyScrollHeight).toBeLessThanOrEqual(allowance);
  });
});
