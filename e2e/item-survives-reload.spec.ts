import { expect, test } from "@playwright/test";

// R-E1 (test-plan.md): item przetrwa odświeżenie strony.
// Chronione ryzyko: użytkownik akceptuje wpis, odświeża — i praca znika, bo nie zapisała się w bazie.
// Dowód: obecność wpisu po page.reload() na /items/active (SSR czyta z DB), NIE toast ani 200.
// Antywzorzec unikany: naiwna asercja na komunikacie/tytule strony zamiast obecności wpisu po reloadzie.
test.describe("R-E1: item przetrwa odświeżenie strony", () => {
  const created: string[] = [];

  test.afterEach(async ({ request, baseURL }) => {
    // Sprzątanie best-effort do kosza (izolację i tak daje unikalny tytuł; to higiena).
    // Jawny Origin — endpoint mutujący jest za bramką CSRF (middleware.ts).
    if (!created.length) return;
    await request
      .post("/api/items/bulk", { data: { ids: created.splice(0), action: "trash" }, headers: { Origin: baseURL! } })
      .catch(() => undefined);
  });

  test('zaakceptowany wpis jest nadal w „Wpisy" po page.reload()', async ({ page }) => {
    // Unikalny tytuł → izolacja (równoległe/ponowne przebiegi nie kolidują) + pewna kotwica asercji.
    const title = `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // PLAN: wklej unikalny wsad → klasyfikacja (atrapa mock) → wpis pending.
    await page.goto("/ingest");
    // Formularz to wyspa React z kontrolowanym polem. fill() ustawia tylko natywną wartość DOM —
    // Reactowy onChange tego nie łapie (licznik zostaje 0, „Wyślij" disabled). pressSequentially
    // wysyła realne klawisze → onChange odpala i stan rośnie. Retry osłania wyścig hydratacji:
    // powtarzaj (wyczyść + wpisz), aż przycisk się odblokuje — czekanie na STAN, nie na czas.
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

    // Modal auto-przekierowuje na „Do akceptacji" po klasyfikacji — czekamy na STAN (URL), nie na czas.
    await page.waitForURL("**/items", { timeout: 15_000 });

    // Zaakceptuj wpis pending (akcja per-item; tekst to „Zatwierdź", nie „Akceptuj"). /items to też
    // wyspa React — pierwszy klik może paść przed hydratacją (onClick niepodpięty). Ponawiaj klik,
    // aż wpis zniknie z „Do akceptacji" (accept potwierdzony po sukcesie) — czekanie na STAN.
    const pendingCard = page.locator("article[data-item-id]", { hasText: title });
    const acceptBtn = pendingCard.getByRole("button", { name: "Zatwierdź" });
    await expect(async () => {
      await acceptBtn.click();
      await expect(pendingCard).toBeHidden({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });

    // Przejdź do „Wpisy" (/items/active) — zaakceptowany wpis (accepted + new) jest tam widoczny.
    await page.goto("/items/active");
    await expect(page.getByRole("heading", { level: 3, name: title })).toBeVisible();

    const id = await page.locator("article[data-item-id]", { hasText: title }).getAttribute("data-item-id");
    if (id) created.push(id);

    // KLUCZOWE (R-E1): odśwież stronę. Wpis MUSI przetrwać — to dowód persystencji w bazie
    // (render serwerowy czyta z DB), a nie stanu po stronie klienta.
    await page.reload();
    await expect(page.getByRole("heading", { level: 3, name: title })).toBeVisible();
  });
});
