import { expect, test } from "@playwright/test";

// Faza 6 (prod-feedback-fixes, ticket 6fa2b64b): dwa zgłoszone objawy z jednego ticketu.
//
// (a) „częściowa akceptacja zostawia nieaktualne elementy na liście do zmiany strony" — RECON (plan
//     §Kluczowe odkrycia) pokazuje, że `PendingItemsView.execute()` JUŻ usuwa zaakceptowane z listy
//     (`applyOptimistic(removeByIds)`) i dociąga kolejkę (`refetchAfterRemoval`) bez reloadu. Ten test to
//     POTWIERDZA empirycznie (asercje kroku 1 niżej) — jeśli symptom faktycznie nie odtwarza się, jest
//     nieaktualny; realnym błędem tego ticketu jest (b).
// (b) licznik „Do akceptacji" w sidebarze (`AppSidebar.astro`, prop `pendingCount`) jest liczony
//     SERWEROWO raz na render (`AppLayout.astro`) — statyczny Astro bez wyspy, dokładnie jak wskaźnik
//     klucza BYOK przed Fazą 5. Bez mostu wyspa→powłoka zostaje nieaktualny po akceptacji/odrzuceniu w
//     `/items` (PendingItemsView) aż do pełnego przeładowania strony.
//
// Fix (ten sam wzorzec co Faza 5, `sidebar-events.ts`): `PendingItemsView.execute()` po sukcesie
// rozgłasza `CustomEvent` „pending-count-changed" (`dispatchPendingDelta(-count)` — accept I reject OBA
// usuwają z pending, więc oba dekrementują; `count` to liczba FAKTYCZNIE zmienionych z serwera).
// `AppSidebar.astro` nasłuchuje (ten sam inline `<script>` co Faza 5, `onPendingDelta`), aktualizuje
// `[data-pending-count]` i chowa `[data-pending-badge]` przy zejściu do ≤ 0 — bez reloadu. Te dwa
// atrybuty NIE istnieją przed tą fazą (badge był warunkowym, nieoznaczonym `<span>` liczonym wyłącznie
// SSR) — stąd RED przed fixem: sam selektor się nie rozwiązuje.
//
// Izolacja danych (plan §Strategia testowania, decyzja plan-review): NIE polegamy na przypadkowej
// liczbie już istniejących pozycji pending na koncie testowym — seedujemy WŁASNE (3, unikalny tytuł na
// uruchomienie) i liczymy WZGLĘDEM przechwyconej wartości startowej `n` (badge PO seedzie), zamiast
// zakładać zero na starcie konta. „Zejście do 0 → badge znika" jest w teście asercją WARUNKOWĄ na `n`
// (krok 2 niżej): na czystym koncie e2e (bez cudzych pending) `n === 3` i gałąź „znika" faktycznie się
// wykonuje; gdyby na koncie były resztki z innego przebiegu, test i tak poprawnie weryfikuje arytmetykę
// dekrementu bez fałszywego niepowodzenia. Sprzątanie: wszystkie 3 własne wpisy kończą test w stanie
// `accepted` — `afterEach` przenosi je do kosza, nic nie zostaje w pending.
test.describe("Faza 6: reaktywny licznik „Do akceptacji” (ticket 6fa2b64b)", () => {
  const created: string[] = [];

  test.afterEach(async ({ request, baseURL }) => {
    if (!created.length || !baseURL) return;
    await request
      .post("/api/items/bulk", { data: { ids: created.splice(0), action: "trash" }, headers: { Origin: baseURL } })
      .catch(() => undefined);
  });

  test("częściowa akceptacja usuwa wpisy z listy i zmniejsza badge bez reloadu; przy zejściu do 0 badge znika", async ({
    page,
  }) => {
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const titles = [1, 2, 3].map((n) => `E2E-P6-${runId}-${n}`);
    const card = (title: string) => page.locator("article[data-item-id]", { hasText: title });

    // --- Seed PRZED nawigacją na /items (by świeży SSR wyrenderował badge z uwzględnieniem nowych
    // pozycji): wklejenie 3 linii w /ingest. Mock klasyfikuje KAŻDĄ niepustą linię jako osobny item
    // `task` (classifier.ts, kind:"mock") → 3 pozycje pending o unikalnych tytułach.
    await page.goto("/ingest");
    const textarea = page.getByRole("textbox", { name: "Tekst do klasyfikacji" });
    const submit = page.getByRole("button", { name: "Wyślij" });
    await expect(async () => {
      await textarea.click();
      await textarea.press("ControlOrMeta+a");
      await textarea.press("Delete");
      await textarea.pressSequentially(titles.join("\n"));
      await expect(submit).toBeEnabled({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    await submit.click();
    // Auto-przejście modala „Sesja zawiera 3 wpisy" ląduje na /items pełną nawigacją
    // (`window.location.href`, ClassificationModal.tsx) — świeży SSR, `pendingCount` już liczy nowe pozycje.
    await page.waitForURL("**/items", { timeout: 15_000 });

    for (const title of titles) {
      await expect(card(title)).toBeVisible();
      const id = await card(title).getAttribute("data-item-id");
      if (id) created.push(id);
    }

    const badge = page.locator("[data-pending-badge]");
    const countEl = page.locator("[data-pending-count]");
    // RED aż do fixu Fazy 6: przed nią te atrybuty nie istnieją w ogóle (patrz nagłówek pliku).
    await expect(badge).toBeVisible({ timeout: 5_000 });
    const n = Number(await countEl.textContent());
    expect(Number.isFinite(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(3); // nasze 3 + ewentualne cudze — nie zakładamy zera na starcie

    // --- Krok 1: zaznacz i zaakceptuj CZĘŚĆ pozycji (2 z 3 własnych) — bulk „Zatwierdź zaznaczone".
    // Selekcja 2 z ≥3 widocznych NIGDY nie jest „zaznacz wszystkie" (selection.ts:requiresConfirmation),
    // więc bez dialogu potwierdzenia — prosta ścieżka jak w innych specach tej rundy.
    await expect(async () => {
      await card(titles[0])
        .getByRole("checkbox", { name: `Zaznacz: ${titles[0]}` })
        .check();
      await card(titles[1])
        .getByRole("checkbox", { name: `Zaznacz: ${titles[1]}` })
        .check();
      await page.getByRole("button", { name: "Zatwierdź zaznaczone" }).click();
      await expect(card(titles[0])).toBeHidden({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });

    // (a) Weryfikacja pierwszego objawu: zaakceptowane znikają z listy BEZ reloadu; trzeci (nietknięty)
    // wpis zostaje widoczny — potwierdza, że lista NIE jest przedmiotem tej naprawy (już działała).
    await expect(card(titles[0])).toBeHidden();
    await expect(card(titles[1])).toBeHidden();
    await expect(card(titles[2])).toBeVisible();

    // (b, GŁÓWNA asercja RED→GREEN tej fazy) badge = n − 2, BEZ przeładowania strony.
    await expect(countEl).toHaveText(String(n - 2), { timeout: 5_000 });
    await expect(badge).toBeVisible();

    // --- Krok 2: zaakceptuj ostatni własny wpis — akcja INLINE na karcie („Zatwierdź"), druga ścieżka
    // do tego samego `execute()` (nie bulk), by pokryć oba wywołania emisji zdarzenia.
    await expect(async () => {
      await card(titles[2]).getByRole("button", { name: "Zatwierdź" }).click();
      await expect(card(titles[2])).toBeHidden({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });

    // (b) badge = n − 3, BEZ przeładowania; gdy to zejście do 0, badge znika CAŁKOWICIE (nie zostaje
    // widoczne jako „0" — Fix 5/6 wymaga chowania przy pendingCount ≤ 0, plan §Krytyczne szczegóły).
    const remaining = n - 3;
    if (remaining <= 0) {
      await expect(badge).toBeHidden({ timeout: 5_000 });
    } else {
      await expect(countEl).toHaveText(String(remaining), { timeout: 5_000 });
      await expect(badge).toBeVisible();
    }
  });
});
