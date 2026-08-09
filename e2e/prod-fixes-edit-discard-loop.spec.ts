import { expect, test, type Page } from "@playwright/test";

// Ticket ac90c2a4 (prod-feedback-fixes): dialog „Niezapisane zmiany" (Wróć do edycji / Odrzuć zmiany)
// wpadał w NIESKOŃCZONĄ PĘTLĘ przy tapnięciu poza oknem edycji.
//
// RECON (EditItemDialog.tsx): przy niezapisanych zmianach główne okno edycji zostaje `open`, a OBOK
// otwiera się DRUGI modalny Radix Dialog (potwierdzenie) — dwa nałożone modale-rodzeństwo. Tap w przycisk
// potwierdzenia jest „poza" treścią głównego okna → główny modal re-wyzwalał zamknięcie i potwierdzenie
// wracało. Diagnoza (logi zdarzeń): po „Wróć do edycji" przychodzi „echo" pointer-outside na oknie edycji,
// już PO ustawieniu confirmDiscard=false — dlatego naprawa opiera się o krótkotrwałą blokadę (ref), nie
// o sam stan confirmDiscard.
//
// Wymagania użytkownika (2026-08-09), bez zmian wizualnych:
//  1. klik/tap poza edycją BEZ zmian → okno się zamyka (jak „Anuluj");
//  2. klik/tap poza edycją ZE zmianami → pytanie „Odrzucić?", a OKNO EDYCJI CAŁY CZAS WIDOCZNE (nie znika);
//  3. klik/tap poza pytaniem lub „Wróć do edycji" → wraca do edycji, zmiany nietknięte, BEZ pętli;
//  4. „Odrzuć zmiany" → zamyka całe okno edycji.
//
// Edycja nie była dotąd pokryta E2E — testujemy dotyk (tablet, tam zgłoszony bug) ORAZ mysz (desktop).

const editDialog = "[data-slot=dialog-content]:has-text('Edytuj element')";
const confirmDialog = "[data-slot=dialog-content]:has-text('Niezapisane zmiany')";

// Dodaje własny wpis (izolacja: sprzątany w afterEach) i otwiera dla niego okno edycji. Zwraca tytuł.
// Retry na klik: topbar „Dodaj wpis" i lista to osobne wyspy (client:load), pierwszy klik bywa przed
// hydratacją (wzorzec z prod-fixes-phase4-terminology.spec.ts).
async function seedAndOpenEdit(page: Page, created: string[]): Promise<string> {
  await page.goto("/items/active");
  const title = `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await expect(async () => {
    await page.getByRole("button", { name: "Dodaj wpis" }).click();
    await expect(page.getByLabel("Tytuł")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await page.getByLabel("Tytuł").fill(title);
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  const card = page.locator("article[data-item-id]", { hasText: title });
  await expect(card).toBeVisible();
  const id = await card.getAttribute("data-item-id");
  if (id) created.push(id);
  await expect(async () => {
    await card.getByRole("button", { name: "Edytuj" }).click();
    await expect(page.locator(editDialog)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  return title;
}

// Ten sam kontrakt zachowania na dwóch urządzeniach wejścia. `pointerOutside` klika/tapie poza oknem
// (w narożnik, w overlay); `activate` uruchamia przycisk w oknie potwierdzenia.
function runSuite(
  label: string,
  device: Parameters<typeof test.use>[0],
  pointerOutside: (page: Page) => Promise<void>,
  activate: (locator: ReturnType<Page["getByRole"]>) => Promise<void>,
) {
  test.describe(`Edycja: odrzucenie zmian bez pętli — ${label} (ticket ac90c2a4)`, () => {
    test.use(device);

    const created: string[] = [];
    test.afterEach(async ({ request, baseURL }) => {
      if (!created.length || !baseURL) return;
      await request
        .post("/api/items/bulk", { data: { ids: created.splice(0), action: "trash" }, headers: { Origin: baseURL } })
        .catch(() => undefined);
    });

    test("ze zmianami: potwierdzenie + okno widoczne; Wróć nie pętli; Odrzuć zamyka", async ({ page }) => {
      await seedAndOpenEdit(page, created);

      const changed = `E2E zmiana ${Math.random().toString(36).slice(2, 8)}`;
      await page.getByLabel("Tytuł").fill(changed);

      // (2) klik/tap poza → pytanie, a okno edycji NADAL widoczne.
      await pointerOutside(page);
      await expect(page.locator(confirmDialog)).toBeVisible();
      await expect(page.locator(editDialog)).toBeVisible();

      // (3) „Wróć do edycji" — potwierdzenie znika i NIE wraca (brak pętli), zmiana zachowana.
      await activate(page.locator(confirmDialog).getByRole("button", { name: "Wróć do edycji" }));
      await expect(page.locator(confirmDialog)).toBeHidden();
      await expect(page.locator(editDialog)).toBeVisible();
      await expect(page.getByLabel("Tytuł")).toHaveValue(changed);

      // (3b) klik/tap poza samym pytaniem też wraca do edycji (nie pętli).
      await pointerOutside(page);
      await expect(page.locator(confirmDialog)).toBeVisible();
      await pointerOutside(page);
      await expect(page.locator(confirmDialog)).toBeHidden();
      await expect(page.locator(editDialog)).toBeVisible();

      // (4) ponowny klik/tap poza → pytanie → „Odrzuć zmiany" zamyka całe okno edycji.
      await pointerOutside(page);
      await expect(page.locator(confirmDialog)).toBeVisible();
      await activate(page.locator(confirmDialog).getByRole("button", { name: "Odrzuć zmiany" }));
      await expect(page.locator(editDialog)).toBeHidden();
      await expect(page.locator(confirmDialog)).toBeHidden();
    });

    test("bez zmian: klik/tap poza zamyka od razu (jak Anuluj), bez pytania", async ({ page }) => {
      await seedAndOpenEdit(page, created);

      await pointerOutside(page);
      await expect(page.locator(editDialog)).toBeHidden();
      await expect(page.locator(confirmDialog)).toHaveCount(0);
    });
  });
}

runSuite(
  "tablet",
  { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true },
  (page) => page.touchscreen.tap(12, 12),
  (locator) => locator.tap(),
);

runSuite(
  "desktop",
  { viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false },
  (page) => page.mouse.click(12, 12),
  (locator) => locator.click(),
);
