import { expect, test } from "@playwright/test";

// Faza 4 (prod-feedback-fixes, ticket 164608bf): terminologia stanu „done” była rozjechana na TRZY słowa:
// akcja „Zrealizuj” (operational-transitions.ts), badge/menu „Zrobione” (+ warianty per-typ „Obsłużona”/
// „Obsłużony”/„Podjęta”/„Obsłużone” w labels.ts) i filtr „Zakończone” (state-filter.ts, już poprawny).
// Kanon: przymiotnik/badge/filtr/menu → „Zakończone”; czasownik akcji → „Zakończ”.
//
// RECON (przed napisaniem testu, patrz grep + lektura komponentów): jedyna KLIKALNA ścieżka do stanu
// „done” na żywej stronie to zbiorcze menu „Zmień stan” w `AcceptedItemsView` — jego pozycje renderują
// RZECZOWNIK (`operationalStatusLabel(target)`), więc pokazują „Zakończone”, NIE czasownik „Zakończ”.
// Interaktywny wariant `OperationalStatusBadge` (menu z czasownikami z `OPERATIONAL_TRANSITIONS`, w tym
// „Zakończ”) istnieje w kodzie, ale ŻADEN konsument (jedyny: `ItemCard.tsx:213`) nie przekazuje mu
// `onChange` — na liście badge jest zawsze tylko-do-odczytu (edycję przejęła formatka `EditItemDialog`,
// tam też rzeczownik przez `<Select>`, nie czasownik). Czasownik „Zakończ” dziś nie jest więc osiągalny
// klikiem w żadnej stronie — zgodnie z dopuszczoną w planie ścieżką zapasową („oprzyj asercję o trwale
// widoczne elementy: zakładki filtra + badge”) test sprawdza kanon RZECZOWNIKOWY („Zakończone”) wszędzie,
// gdzie faktycznie się renderuje (zakładka filtra, menu „Zmień stan”, dialog potwierdzenia, badge po
// zmianie), a nieosiągalność czasownika „Zakończ” w UI jest udokumentowana tutaj, nie zgadywana testem.
//
// Izolacja danych: wpis tworzymy i sprzątamy sami (nie mutujemy losowego istniejącego wpisu konta
// testowego zmianą jego stanu na „done” — plan §Strategia testowania, zasada izolacji z faz 5/6/10
// zastosowana też tu, bo ten test też mutuje stan przez bulk).
test.describe("Faza 4: ujednolicona terminologia stanu „Zakończone” (ticket 164608bf)", () => {
  const created: string[] = [];

  test.afterEach(async ({ request, baseURL }) => {
    if (!created.length || !baseURL) return;
    await request
      .post("/api/items/bulk", { data: { ids: created.splice(0), action: "trash" }, headers: { Origin: baseURL } })
      .catch(() => undefined);
  });

  test("zakładka filtra, menu „Zmień stan” i badge po zmianie stanu pokazują „Zakończone”; „Zrobione” nigdzie nie występuje", async ({
    page,
  }) => {
    await page.goto("/items/active");

    // 1. Zakładka/filtr stanu — trwale widoczny element osi `StateFilterSelect` (nav „Zakres wpisów”),
    // niezależny od tego, czy lista ma jakiekolwiek wpisy. Już dziś poprawny (state-filter.ts:50) — ta
    // asercja NIE jest częścią reprodukcji RED, tylko potwierdzeniem, że fix go nie psuje.
    const stateNav = page.getByRole("navigation", { name: "Zakres wpisów" });
    await expect(stateNav).toBeVisible();
    await expect(stateNav.getByRole("link", { name: "Zakończone", exact: true })).toBeVisible();
    await expect(stateNav.getByRole("link", { name: "Zrobione" })).toHaveCount(0);

    // Własny wpis (izolacja — patrz nagłówek pliku): dodanie ręczne S-07 (bez klucza BYOK, od razu stan
    // „Nowe” w widoku „active”, help.astro §„Widok Wpisy”). Retry na klik: topbar „Dodaj wpis” i lista to
    // dwie osobne wyspy React (client:load) — pierwszy klik bywa przed hydratacją (wzorzec z innych
    // speców tej rundy, np. prod-fixes-phase2-dark-checkbox.spec.ts).
    const title = `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await expect(async () => {
      await page.getByRole("button", { name: "Dodaj wpis" }).click();
      await expect(page.getByLabel("Tytuł")).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await page.getByLabel("Tytuł").fill(title);
    await page.getByRole("button", { name: "Dodaj", exact: true }).click();
    const activeCard = page.locator("article[data-item-id]", { hasText: title });
    await expect(activeCard).toBeVisible();
    const id = await activeCard.getAttribute("data-item-id");
    if (id) created.push(id);

    // Liczba WSZYSTKICH widocznych wpisów decyduje, czy zaznaczenie tylko mojego wpisu to gest
    // „zaznacz wszystkie” (selection.ts: requiresConfirmation = selected === total) — decyduje to, czy
    // menu „Zmień stan” wywoła dialog potwierdzenia, czy przejdzie od razu. Liczymy DETERMINISTYCZNIE
    // zamiast zgadywać/wyścigiem sprawdzać obecność dialogu.
    const totalActiveCount = await page.locator("article[data-item-id]").count();

    // 2. Akcja zmiany stanu: zaznacz mój wpis i otwórz zbiorcze menu „Zmień stan” — jedyna KLIKALNA
    // ścieżka do „done” na żywo (patrz RECON w nagłówku). Sprawdzamy pozycje menu PRZED kliknięciem.
    await expect(async () => {
      await activeCard.getByRole("checkbox", { name: `Zaznacz: ${title}` }).check();
      await page.getByRole("button", { name: "Zmień stan" }).click();
      await expect(page.getByRole("menu")).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });

    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "Zakończone", exact: true })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Zrobione" })).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "Zakończone", exact: true }).click();

    if (totalActiveCount > 1) {
      // Zaznaczenie < wszystkich widocznych → bez potwierdzenia (jak w happy-path-smoke.spec.ts);
      // wpis znika z „Wpisy” od razu (reconcile — nowy stan wypada poza predykat widoku „active”).
      await expect(activeCard).toBeHidden({ timeout: 5_000 });
    } else {
      // Mój wpis to JEDYNY widoczny (konto testowe bez innych aktywnych) → zaznaczenie = 100% widocznych,
      // wymagane potwierdzenie (selection.ts:requiresConfirmation). Dialog i jego przycisk też renderują
      // `operationalStatusLabel(target)` (AcceptedItemsView.tsx:466,486) — kolejny reachable punkt kanonu.
      const confirmDialog = page.getByRole("dialog");
      await expect(confirmDialog).toBeVisible();
      await expect(confirmDialog).toContainText("Zakończone");
      await expect(confirmDialog).not.toContainText("Zrobione");
      await confirmDialog.getByRole("button", { name: "Zakończone", exact: true }).click();
      await expect(activeCard).toBeHidden({ timeout: 5_000 });
    }

    // 3. Badge po zmianie: wpis ląduje w „Zakończone” (/items/done) z badge pokazującym kanon — również
    // nie jednym z dawnych wariantów per-typ („Obsłużona”/„Obsłużony”/„Podjęta”/„Obsłużone”, labels.ts,
    // ujednoliconych tym samym fixem).
    await page.goto("/items/done");
    const doneCard = page.locator("article[data-item-id]", { hasText: title });
    await expect(doneCard).toBeVisible();
    await expect(doneCard).toContainText("Zakończone");
    for (const legacy of ["Zrobione", "Obsłużona", "Obsłużony", "Podjęta", "Obsłużone"]) {
      await expect(doneCard).not.toContainText(legacy);
    }
  });

  test("Pomoc (cykl życia wpisu) opisuje przejście jako „Zakończ”/„Zakończone”, bez „Zrealizuj”/„Zrobione”", async ({
    page,
  }) => {
    await page.goto("/help");
    const cykl = page.locator("section#cykl-zycia");
    await expect(cykl).toBeVisible();
    await expect(cykl).toContainText("Zakończone");
    await expect(cykl).toContainText("Zakończ");
    await expect(cykl).not.toContainText("Zrobione");
    await expect(cykl).not.toContainText("Zrealizuj");

    const stany = page.locator("section#stany");
    await expect(stany).toContainText("Zakończone");
    await expect(stany).not.toContainText("Zrobione");
  });
});
