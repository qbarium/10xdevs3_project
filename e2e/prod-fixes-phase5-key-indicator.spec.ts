import { expect, test } from "@playwright/test";

// Faza 5 (prod-feedback-fixes, ticket 80c4f735): wskaźnik „klucz aktywny"/„brak klucza" w stopce konta
// (`AppSidebar.astro`) jest liczony SERWEROWO raz na render (`keyConfigured`, `AppLayout.astro`) —
// statyczny Astro bez wyspy, bez żadnego połączenia z wyspą `/profile` (`ApiKeyManager`). Karta
// ApiKeyManager sama w sobie działa poprawnie (dodanie/usunięcie klucza odświeża SIEBIE); problem jest
// wyłącznie w powłoce, która przed poprawką nie dostawała żadnego sygnału o zmianie i zostawała
// nieaktualna aż do pełnego przeładowania strony.
//
// Fix: `useApiKey` (hook pod ApiKeyManager) rozgłasza `CustomEvent` `byok-key-changed`
// (`src/components/shell/sidebar-events.ts`, wzorzec mostu wyspa→powłoka z `item-topbar-events.ts`) po
// udanym `save`/`remove`; `AppSidebar.astro` nasłuchuje go inline `<script>`em (progresywne
// wzbogacenie — sidebar zostaje statyczny) i aktualizuje kropkę (`[data-key-dot]`, klasy
// `bg-note-line`/`bg-idea-line`) oraz tekst (`[data-key-label]`, „klucz aktywny"/„brak klucza") bez
// reloadu.
//
// Izolacja danych (plan §Strategia testowania, decyzja plan-review F4): `storageState`
// (`playwright/.auth/user.json`) zakłada konto testowe ZE skonfigurowanym kluczem BYOK — fundament
// całego zestawu E2E (patrz `seed.spec.ts`). Ten test jako JEDYNY w zestawie usuwa klucz, więc MUSI go
// przywrócić, inaczej psuje `storageState` dla kolejnych testów/uruchomień. Dwie niezależne warstwy
// przywracania: (1) `finally` w samym teście — dodaje klucz z powrotem przez UI i weryfikuje reaktywność
// w kierunku „dodanie" (wymagane też jako asercja #3 scenariusza), uruchamia się nawet gdy asercja
// wcześniej w `try` padnie; (2) `test.afterEach` — bezwarunkowe wywołanie sieciowe wprost do endpointu
// (wzorzec `prod-fixes-phase4-terminology.spec.ts`), odporne nawet na całkowitą awarię interakcji w UI.
test.describe("Faza 5: reaktywny wskaźnik statusu klucza w powłoce (ticket 80c4f735)", () => {
  const RESTORE_KEY = "sk-test-playwright-phase5";

  test.afterEach(async ({ request, baseURL }) => {
    if (!baseURL) return;
    // Siatka bezpieczeństwa NIEZALEŻNA od stanu UI (patrz nagłówek pliku, warstwa 2): upsert jest
    // idempotentny, więc wywołanie tu jest nieszkodliwe nawet gdy `finally` w teście już przywrócił klucz.
    await request
      .post("/api/profile/byok-key", { data: { apiKey: RESTORE_KEY }, headers: { Origin: baseURL } })
      .catch(() => undefined);
  });

  test("usunięcie i dodanie klucza w /profile aktualizuje wskaźnik w sidebarze bez przeładowania", async ({ page }) => {
    await page.goto("/profile");

    const dot = page.locator("[data-key-dot]");
    const label = page.locator("[data-key-label]");

    // Sanity wstępny: konto testowe zaczyna ZE skonfigurowanym kluczem (storageState, patrz nagłówek).
    await expect(label).toHaveText("klucz aktywny");
    await expect(dot).toHaveClass(/bg-note-line/);

    try {
      // 1. Usuń klucz — dwustopniowe potwierdzenie w ApiKeyManager (Usuń klucz → Tak, usuń). Retry na
      // pierwszy klik: `ApiKeyManager` to wyspa React (`client:load`) — SSR maluje HTML natychmiast, ale
      // hydratacja (podpięcie onClick) kończy się chwilę później; pierwszy klik bywa przed hydratacją
      // (ten sam wzorzec co w innych specach tej rundy, np. `prod-fixes-phase4-terminology.spec.ts`).
      await expect(async () => {
        await page.getByRole("button", { name: "Usuń klucz" }).click();
        await expect(page.getByRole("button", { name: "Tak, usuń" })).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 15_000 });
      await page.getByRole("button", { name: "Tak, usuń" }).click();

      // Dowód, że usunięcie się powiodło na poziomie karty (ApiKeyManager wraca do formularza zapisu) —
      // ta część już dziś działa poprawnie, nie jest przedmiotem tej naprawy.
      await expect(page.getByLabel(/Klucz API/)).toBeVisible();

      // 2. Wskaźnik w sidebarze — BEZ przeładowania strony. To jest RED aż do fixu (Faza 5).
      await expect(label).toHaveText("brak klucza");
      await expect(dot).toHaveClass(/bg-idea-line/);
      await expect(dot).not.toHaveClass(/bg-note-line/);
    } finally {
      // 3. Dodaj klucz z powrotem — OBOWIĄZKOWE (izolacja, patrz nagłówek pliku). `finally`: przywróć
      // nawet gdy asercja w `try` padnie w środku (RED run).
      const input = page.getByLabel(/Klucz API/);
      if (await input.isVisible().catch(() => false)) {
        await input.fill(RESTORE_KEY);
        await page.getByRole("button", { name: "Zapisz" }).click();
        // Dowód zapisu na poziomie karty (wraca widok „skonfigurowany klucz").
        await expect(page.getByText("Skonfigurowany klucz")).toBeVisible();
      }
    }

    // 4. Wskaźnik znowu aktywny — BEZ przeładowania. Osiągalne tylko gdy powyższe `try` przeszło bez
    // wyjątku (GREEN) — w RED run oryginalny wyjątek z (2) propaguje się dalej po `finally` i test kończy
    // się na kroku 2, co jest poprawną reprodukcją.
    await expect(label).toHaveText("klucz aktywny");
    await expect(dot).toHaveClass(/bg-note-line/);
    await expect(dot).not.toHaveClass(/bg-idea-line/);
  });
});
