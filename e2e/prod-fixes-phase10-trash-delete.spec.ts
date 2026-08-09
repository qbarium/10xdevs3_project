import { expect, test, type APIRequestContext } from "@playwright/test";

// Faza 10 (prod-feedback-fixes, ticket 02790656): w koszu można było TYLKO „Wyczyść kosz" (globalny hard
// DELETE całego kosza). Brakowało trwałego usunięcia POJEDYNCZEGO wpisu.
//
// FIX (pełny łańcuch endpoint→serwis→hook→karta→widok):
//   - DELETE /api/items/:id → serwis `deleteFromTrash` (twardy DELETE ograniczony do statusów kosza
//     rejected/deleted; poza koszem → 404; RLS izoluje usera);
//   - `ItemCard` dostaje akcję „Usuń trwale" (tylko dla rejected/deleted), a `TrashItemsView` podpina ją do
//     dialogu potwierdzenia + optymistycznego usunięcia z listy (jak restore).
//
// RED przed fixem: akcji „Usuń trwale" na karcie kosza NIE było — klik w nieistniejący przycisk timeout-uje,
// więc asercja pada. PO fixie przycisk istnieje, dialog potwierdza, wpis znika → GREEN.
//
// Izolacja danych (plan §Strategia testowania): usuwanie jest NIEODWRACALNE, więc seedujemy WŁASNE wpisy
// (unikalny runId) i asertujemy WYŁĄCZNIE na nich — nigdy na cudzej/łącznej zawartości kosza. „Wyczyść kosz"
// jest globalny, ale weryfikujemy tylko zniknięcie NASZYCH pozostałych wpisów (odporne na resztki z innych
// przebiegów). Seed w pełni przez API (jak phase 9): POST /api/items (item ręczny = accepted) → bulk „trash"
// (accepted → deleted) — stabilniejsze niż ścieżka /ingest.
test.describe("Faza 10: trwałe usunięcie pojedynczego wpisu z kosza (ticket 02790656)", () => {
  const created: string[] = [];

  test.afterEach(async ({ request, baseURL }) => {
    // Sprzątanie best-effort: cokolwiek zostało (np. po nieudanym teście) usuń trwale z kosza. Wpisy już
    // skasowane zwrócą 404 — to nie wyjątek (request.delete nie rzuca na status HTTP), po prostu ignorujemy.
    if (!baseURL) return;
    for (const id of created.splice(0)) {
      await request.delete(`/api/items/${id}`, { headers: { Origin: baseURL } }).catch(() => undefined);
    }
  });

  /** Tworzy wpis ręczny (POST /api/items → accepted) i zwraca {id, title}. */
  async function seedItem(
    request: APIRequestContext,
    baseURL: string,
    label: string,
  ): Promise<{ id: string; title: string }> {
    const title = `E2E-P10-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await request.post("/api/items", {
      data: { title, description: "Wpis do trwałego usunięcia.", type: "task" },
      headers: { Origin: baseURL },
    });
    expect(res.ok(), "seed POST /api/items powinien się powieść").toBeTruthy();
    const body = (await res.json()) as { item?: { id?: string } };
    const id = body.item?.id;
    if (!id) throw new Error("POST /api/items nie zwrócił id utworzonego wpisu.");
    created.push(id);
    return { id, title };
  }

  test("usuwa pojedynczy wpis z kosza (reszta zostaje), a „Wyczyść kosz” nadal czyści resztę", async ({
    page,
    request,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("Brak baseURL w konfiguracji Playwright.");

    // --- Seed: 3 wpisy → wszystkie do kosza (accepted → deleted) jednym bulk-em (najświeższy updated_at =
    // trafiają na górę listy kosza sortowanej po updated_at DESC, więc są widoczne od razu).
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const seeds = [];
    for (const n of [1, 2, 3]) seeds.push(await seedItem(request, baseURL, `${runId}-${n}`));
    const ids = seeds.map((s) => s.id);
    const titles = seeds.map((s) => s.title);
    const card = (title: string) => page.locator("article[data-item-id]", { hasText: title });

    const trashRes = await request.post("/api/items/bulk", {
      data: { ids, action: "trash" },
      headers: { Origin: baseURL },
    });
    expect(trashRes.ok(), "bulk trash seed powinien się powieść").toBeTruthy();

    // --- Wejście na kosz; wszystkie 3 własne wpisy widoczne (size=100 → jedna strona, odporne na resztki).
    await page.goto("/items/trash?size=100");
    for (const title of titles) {
      await expect(card(title)).toBeVisible({ timeout: 15_000 });
    }

    // --- Usuń POJEDYNCZY wpis (pierwszy): akcja „Usuń trwale" na karcie → dialog potwierdzenia → „Usuń trwale".
    // Odporne na wyścig hydratacji: klik w kartę tylko gdy dialog jeszcze nie jest widoczny (bez podwójnego
    // otwarcia). To TU jest RED przed fixem — przycisku na karcie nie ma, klik timeout-uje, `toPass` pada.
    const deleteDialog = page.getByRole("dialog", { name: "Usunąć wpis trwale?" });
    await expect(async () => {
      if (!(await deleteDialog.isVisible())) {
        await card(titles[0]).getByRole("button", { name: "Usuń trwale" }).click();
      }
      await expect(deleteDialog).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    // Dialog niesie tytuł usuwanego wpisu (potwierdzenie chroni przed przypadkiem).
    await expect(deleteDialog).toContainText(titles[0]);
    await deleteDialog.getByRole("button", { name: "Usuń trwale" }).click();

    // Ten wpis znika, POZOSTAŁE zostają — BEZ reloadu (optymistyczne usunięcie z listy).
    await expect(card(titles[0])).toBeHidden({ timeout: 5_000 });
    await expect(card(titles[1])).toBeVisible();
    await expect(card(titles[2])).toBeVisible();

    // Twarde potwierdzenie: usunięty rekord zniknął z bazy — ponowny DELETE po id → 404 „nie ma w koszu".
    const gone = await request.delete(`/api/items/${ids[0]}`, { headers: { Origin: baseURL } });
    expect(gone.status(), "usunięty wpis nie istnieje już w koszu → 404").toBe(404);

    // --- „Wyczyść kosz" NADAL działa: usuwa resztę. Akcja z topbara → dialog → potwierdź (destrukcyjny).
    const emptyDialog = page.getByRole("dialog", { name: /Wyczyścić kosz/ });
    await expect(async () => {
      if (!(await emptyDialog.isVisible())) {
        await page.getByRole("button", { name: "Wyczyść kosz" }).click();
      }
      await expect(emptyDialog).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await emptyDialog.getByRole("button", { name: "Wyczyść kosz" }).click();

    // Pozostałe własne wpisy znikają — „Wyczyść kosz" nietknięty przez dodanie single-delete.
    await expect(card(titles[1])).toBeHidden({ timeout: 5_000 });
    await expect(card(titles[2])).toBeHidden();
  });
});
