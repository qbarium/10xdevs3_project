import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

// Faza 9 (prod-feedback-fixes, tickety 62217cc8 + ac90c2a4): modal edycji wpisu (`EditItemDialog.tsx`).
// DWA powiązane objawy z produkcji, wspólny kod:
//   - 62217cc8 (blokada tła): interfejs poza oknem edycji nie był zablokowany → przypadkowe kliknięcia/
//     zamknięcia (Radix modal domyślnie zamyka na tap w overlay; przy brudnym formularzu wyzwalał to jeszcze
//     pytanie o odrzucenie zmian).
//   - ac90c2a4 (pętla): na tablecie tap paluchem poza otwartym oknem → dialog „odrzuć/wróć"; „Wróć do edycji"
//     działał w NIESKOŃCZONEJ PĘTLI.
//
// RECON (zweryfikowany w kodzie): render ma DWA sąsiednie `<Dialog>` Radix — edytor (`open={open}`) i
// potwierdzenie odrzucenia (`open={confirmDiscard}`). `requestClose()` przy `isDirty` robił
// `setConfirmDiscard(true)`, ale NIE zamykał edytora (`open` zostawał `true`) → OBA modale otwarte naraz.
// Edytorowy `DialogContent` nie miał `onInteractOutside`/`onPointerDownOutside`, więc domyślny Radix
// outside-tap wołał `onOpenChange(false)` → `requestClose()`. Mechanizm pętli na dotyku: potwierdzenie
// renderuje się w OSOBNYM portalu Radix, geometrycznie „poza" wciąż otwartym edytorem — tap „Wróć do edycji"
// (pointer-down) edytor wykrywał jako outside-interaction → re-fire zamknięcia → `setConfirmDiscard(true)`
// znów → potwierdzenie wracało; dwa modale walczyły też o focus-scope/pointer-events.
//
// FIX (`EditItemDialog.tsx`, tylko gałąź edycji — Podgląd/read-only NIETKNIĘTY):
//   (a) na edytorowym `DialogContent`: `onInteractOutside={(e) => e.preventDefault()}` — prawdziwy blokujący
//       backdrop, tap poza oknem nie zamyka i nie wyzwala potwierdzenia;
//   (b) `open={open && !confirmDiscard}` na edytorze — edytor i potwierdzenie NIGDY nie są otwarte naraz:
//       gdy potwierdzenie wchodzi, edytor się zamyka (prop, nie `onOpenChange` → bez rekurencji), więc tap
//       w „Wróć do edycji" nie jest już „poza" otwartym edytorem → pętla rozerwana u źródła.
//
// UCZCIWOŚĆ METODY — co JEST deterministycznym red→green w headless Chromium (emulacja dotyku), a co NIE:
//   1. WSPÓŁISTNIENIE DWÓCH MODALI to bezpośrednia, deterministyczna przyczyna pętli i jest w 100% red→green:
//      po świadomym zamknięciu brudnego formularza (przycisk „Anuluj" → `requestClose`) PRZED fixem edytor
//      („Edytuj element") i potwierdzenie („Niezapisane zmiany") są widoczne JEDNOCZEŚNIE; PO fixie widoczne
//      jest WYŁĄCZNIE potwierdzenie, edytor jest ukryty. Asercja `editDialog` → hidden gdy potwierdzenie
//      otwarte jest tu głównym dowodem naprawy.
//   2. BLOKADA TŁA jest red→green: przy brudnym formularzu tap w overlay PRZED fixem wyzwalał potwierdzenie
//      (przypadkowe zamknięcie), PO fixie nie robi nic (edytor zostaje, potwierdzenia brak).
//   3. „Wróć do edycji" wraca do edytora RAZ i potwierdzenie znika (bez nawrotu) — sekwencję powtarzamy 3×
//      dla dowodu determinizmu (brak zapętlenia). „Odrzuć" zamyka całość.
//   4. CZEGO NIE UDAJEMY: dosłownej NIESKOŃCZONEJ PĘTLI z produkcji (potwierdzenie „mruga"/wraca w kółko po
//      tapie „Wróć do edycji") NIE da się wiarygodnie odtworzyć w headless — zależy od mikro-timingu
//      pointer-events/focus-scope Radix na fizycznym dotyku, którego emulacja Playwright nie odwzorowuje
//      1:1. Dlatego asercje opieramy na DETERMINISTYCZNEJ przyczynie (dwa współistniejące modale + brak
//      blokady outside), która headless odtwarza w pełni, a nie na samym wizualnym „mruganiu".
test.describe("Faza 9: okno edycji — blokada tła i koniec pętli (tickety 62217cc8 + ac90c2a4)", () => {
  // Emulacja tabletu z dotykiem (kanon zlecenia): to jedyny warunek, w którym objaw ma sens.
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 820, height: 1180 } });

  const created: string[] = [];

  test.afterEach(async ({ request, baseURL }) => {
    // Izolacja danych (decyzja plan-review): własne wpisy do kosza po każdym teście.
    if (!created.length || !baseURL) return;
    await request
      .post("/api/items/bulk", { data: { ids: created.splice(0), action: "trash" }, headers: { Origin: baseURL } })
      .catch(() => undefined);
  });

  /** Zasiewa jeden wpis ręczny (S-07 — od razu accepted/new, z akcją „Edytuj" na `/items/active`). */
  async function seedItem(request: APIRequestContext, baseURL: string, label: string): Promise<string> {
    const title = `E2E-P9-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await request.post("/api/items", {
      data: { title, description: "Opis startowy do edycji.", type: "task" },
      headers: { Origin: baseURL },
    });
    expect(res.ok(), "seed POST /api/items powinien się powieść").toBeTruthy();
    const body = (await res.json()) as { item?: { id?: string } };
    const id = body.item?.id;
    // Guard (zamiast asercji `!`/`as`) — daje realne sprawdzenie i zawęża typ do `string` dla `push`.
    if (!id) throw new Error("POST /api/items nie zwrócił id utworzonego wpisu.");
    created.push(id);
    return title;
  }

  /**
   * Otwiera edytor karty o danym tytule na `/items/active`. Odporne na wyścig hydratacji wyspy React:
   * ponawia tap „Edytuj" TYLKO gdy dialog jeszcze nie jest widoczny (bez ryzyka podwójnego otwarcia /
   * tapnięcia w tło już otwartego okna).
   */
  async function openEditorFor(page: Page, title: string): Promise<Locator> {
    await page.goto("/items/active?size=100");
    const card = page.locator("article[data-item-id]", { hasText: title });
    await expect(card.getByRole("heading", { level: 3, name: title })).toBeVisible({ timeout: 15_000 });

    const editDialog = page.getByRole("dialog", { name: "Edytuj element" });
    await expect(async () => {
      if (!(await editDialog.isVisible())) {
        await card.getByRole("button", { name: "Edytuj" }).tap();
      }
      await expect(editDialog).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    return editDialog;
  }

  /** Wprowadza zmianę w tytule → `isDirty` (bramka pytania o odrzucenie). */
  async function makeDirty(editDialog: Locator): Promise<void> {
    const titleInput = editDialog.getByLabel("Tytuł");
    await titleInput.fill(`Zmienione ${Date.now()}`);
  }

  test("blokada tła (62217cc8): tap poza brudnym edytorem nie zamyka i nie wyzwala potwierdzenia", async ({
    page,
    request,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("Brak baseURL w konfiguracji Playwright.");
    const title = await seedItem(request, baseURL, "backdrop");
    const editDialog = await openEditorFor(page, title);
    await makeDirty(editDialog);

    const overlay = page.locator('[data-slot="dialog-overlay"]');
    await expect(overlay).toBeVisible();
    const confirmDialog = page.getByRole("dialog", { name: "Niezapisane zmiany" });
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("viewportSize powinien być ustawiony przez test.use.");

    // Kilka tapów w róg overlaya (poza wyśrodkowanym oknem). PRZED fixem: pierwszy taki tap przy brudnym
    // formularzu wyzwalał „Niezapisane zmiany" (przypadkowe zamknięcie). PO fixie: nic — edytor zostaje.
    for (const point of [
      { x: 8, y: 8 },
      { x: viewport.width - 8, y: 8 },
      { x: 8, y: viewport.height - 8 },
    ]) {
      await page.touchscreen.tap(point.x, point.y);
      // Silna asercja: edytor NIE zniknął (auto-retry złapałby przypadkowe zamknięcie), potwierdzenia brak.
      await expect(editDialog).toBeVisible();
      await expect(confirmDialog).toHaveCount(0);
    }
  });

  test("koniec petli (ac90c2a4): edytor i potwierdzenie nie wspolistnieja; Wroc do edycji bez petli; Odrzuc zamyka", async ({
    page,
    request,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("Brak baseURL w konfiguracji Playwright.");
    const title = await seedItem(request, baseURL, "loop");
    const editDialog = await openEditorFor(page, title);
    await makeDirty(editDialog);

    const confirmDialog = page.getByRole("dialog", { name: "Niezapisane zmiany" });

    // 3× sekwencja: świadome zamknięcie brudnego formularza → potwierdzenie WCHODZI i edytor WYCHODZI
    // (mutual exclusion = przyczyna pętli; PRZED fixem oba były widoczne → `editDialog` hidden FAILuje) →
    // „Wróć do edycji" przywraca edytor RAZ, potwierdzenie znika i NIE wraca. Powtórzenie dowodzi
    // determinizmu (brak zapętlenia). Formularz pozostaje brudny między iteracjami.
    for (let i = 0; i < 3; i++) {
      await editDialog.getByRole("button", { name: "Anuluj" }).tap();
      await expect(confirmDialog, `iteracja ${i}: potwierdzenie powinno być widoczne`).toBeVisible();
      await expect(editDialog, `iteracja ${i}: edytor NIE może współistnieć z potwierdzeniem`).toBeHidden();

      await confirmDialog.getByRole("button", { name: "Wróć do edycji" }).tap();
      await expect(editDialog, `iteracja ${i}: „Wróć do edycji" wraca do edytora`).toBeVisible();
      await expect(confirmDialog, `iteracja ${i}: potwierdzenie znika i nie wraca (bez pętli)`).toBeHidden();
    }

    // „Odrzuć zmiany" zamyka całość (edytor zniknął, potwierdzenie zniknęło).
    await editDialog.getByRole("button", { name: "Anuluj" }).tap();
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Odrzuć zmiany" }).tap();
    await expect(confirmDialog).toBeHidden();
    await expect(editDialog).toBeHidden();
  });
});
