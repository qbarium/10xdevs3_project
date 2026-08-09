import { expect, test } from "@playwright/test";

// Faza 12 (prod-feedback-fixes, ticket 3b885540): przycisk „Dodaj wpis" znikał z topbara widoku „Wpisy",
// gdy wybrany był filtr stanu „Zakończone" (i „Anulowane") — zgłoszenie: przycisk ma być dostępny
// NIEZALEŻNIE od filtra aktywności.
//
// RECON: `src/pages/items/active.astro` montuje DWIE wyspy powiązane z dodawaniem — `TopbarItemAction
// action="add"` (sam przycisk, w topbarze powłoki, active.astro:46) ORAZ `AcceptedItemsView` z propem
// `canAdd` (true, active.astro:53), który steruje (`AcceptedItemsView.tsx`) mostkiem topbar→dialog
// (`onPrimaryAction`, linia ~303) i samym montowaniem `AddItemDialog` (`{canAdd && addOpen && (...)}`,
// linia ~505). `src/pages/items/done.astro` i `cancelled.astro` w ogóle NIE importowały/montowały
// `TopbarItemAction` i przekazywały `canAdd={false}` (świadoma decyzja S-07 „przycisk tylko na Aktywne",
// odwrócona tym ticketem) — stąd przycisk był całkowicie nieobecny w DOM na tych dwóch widokach, nie
// tylko wizualnie ukryty.
//
// FIX: `done.astro` i `cancelled.astro` dostają ten sam `<TopbarItemAction slot="actions" client:load
// action="add" />` co `active.astro` oraz `canAdd` (true) zamiast `canAdd={false}`.
//
// Efekt uboczny tej samej zmiany (naprawiony tu, nie osobnym ticketem): serwer nadaje KAŻDEMU nowo
// tworzonemu wpisowi stan operacyjny „Nowe" (AddItemDialog — brak selektora stanu). `handleCreated`
// (AcceptedItemsView.tsx) wstawiał utworzony item do lokalnej listy OPTIMISTIC bez sprawdzenia, czy
// pasuje do predykatu bieżącego widoku (`matchesView`, już użyte analogicznie w `handleSaved` dla edycji)
// — dotąd nieszkodliwe, bo `canAdd` był `true` WYŁĄCZNIE na „Aktywne" (gdzie „Nowe" zawsze pasuje).
// Włączenie przycisku na Zakończone/Anulowane uczyniłoby tę ścieżkę osiągalną i zaśmiecałoby te listy
// błędnie oznaczonym (badge „Nowe") świeżym wpisem aż do najbliższej zmiany kryteriów. Guard
// `matchesView(item.operational_status, view)` dodany w `handleCreated` to zamyka; drugi test niżej
// weryfikuje to empirycznie (RED, gdyby zabrakło samego guardu, przy fixie #1 już zastosowanym).
//
// RED przed fixem #1: na /items/done i /items/cancelled `getByRole("button", { name: "Dodaj wpis" })`
// nie rozwiązuje się w ogóle (wyspa topbara go nie montuje) — timeout, asercja pada.
test.describe("Faza 12: „Dodaj wpis” niezależnie od filtra stanu (ticket 3b885540)", () => {
  const created: string[] = [];

  test.afterEach(async ({ request, baseURL }) => {
    if (!created.length || !baseURL) return;
    await request
      .post("/api/items/bulk", { data: { ids: created.splice(0), action: "trash" }, headers: { Origin: baseURL } })
      .catch(() => undefined);
  });

  test("przycisk „Dodaj wpis” jest widoczny i klikalny na każdym filtrze stanu (Aktywne/Zakończone/Anulowane)", async ({
    page,
  }) => {
    const views: { label: string; path: string }[] = [
      { label: "Aktywne", path: "/items/active" },
      { label: "Zakończone", path: "/items/done" },
      { label: "Anulowane", path: "/items/cancelled" },
    ];

    for (const { label, path } of views) {
      await page.goto(path);
      const addButton = page.getByRole("button", { name: "Dodaj wpis" });
      await expect(addButton, `widok ${label}: przycisk „Dodaj wpis” powinien być widoczny`).toBeVisible({
        timeout: 10_000,
      });
      await expect(addButton, `widok ${label}: przycisk „Dodaj wpis” powinien być klikalny`).toBeEnabled();

      // „Klikalny" = realnie otwiera formularz, nie tylko wizualnie obecny — topbar i lista to dwie
      // osobne wyspy React (client:load); pierwszy klik bywa przed hydratacją. Retry osłania wyścig
      // (wzorzec z innych faz tej rundy, np. Faza 4: prod-fixes-phase4-terminology.spec.ts).
      await expect(async () => {
        await addButton.click();
        await expect(page.getByLabel("Tytuł")).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 15_000 });

      // Zamknij bez zapisu — pole tytułu puste, więc `requestClose` zamyka od razu (bez dialogu
      // „niezapisane zmiany", AddItemDialog.tsx: `isDirty` fałszywe).
      await page.getByRole("button", { name: "Anuluj" }).click();
      await expect(page.getByLabel("Tytuł")).toBeHidden();
    }
  });

  test("dodanie wpisu z widoku „Zakończone” się udaje, ale świeży wpis (stan „Nowe”) nie zaśmieca tej listy", async ({
    page,
  }) => {
    const title = `E2E-P12-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await page.goto("/items/done");
    await expect(async () => {
      await page.getByRole("button", { name: "Dodaj wpis" }).click();
      await expect(page.getByLabel("Tytuł")).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await page.getByLabel("Tytuł").fill(title);
    await page.getByRole("button", { name: "Dodaj", exact: true }).click();

    // Zapis się powiódł — dialog się zamyka (przy błędzie zostałby otwarty, patrz AddItemDialog.handleSave:
    // `onOpenChange(false)` woła się TYLKO w gałęzi `result.ok`).
    await expect(page.getByLabel("Tytuł")).toBeHidden({ timeout: 10_000 });

    // GŁÓWNA asercja tego testu: świeży wpis ma stan „Nowe", więc NIE pasuje do predykatu „Zakończone"
    // (`matchesView`) — guard w `handleCreated` nie wstawia go tu optimistic. Bez guardu (fix #1 sam,
    // bez #2) karta z badge „Nowe" pojawiłaby się na tej liście błędnie — to byłoby RED tego kroku.
    await expect(page.locator("article[data-item-id]", { hasText: title })).toHaveCount(0);

    // Kontrola: wpis realnie powstał — jak każdy świeży item, ląduje w „Aktywne" (S-07: serwer nadaje
    // stan „Nowe").
    await page.goto("/items/active");
    const activeCard = page.locator("article[data-item-id]", { hasText: title });
    await expect(activeCard).toBeVisible({ timeout: 10_000 });
    const id = await activeCard.getAttribute("data-item-id");
    if (id) created.push(id);
  });
});
