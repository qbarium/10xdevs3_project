---
change_id: testing-e2e-user-flows
title: Warstwa E2E — pełna ścieżka user-facing (Playwright)
status: archived
created: 2026-07-30
updated: 2026-07-30
archived_at: 2026-07-30T18:33:54Z
---

## Notes

Faza wdrożeniowa planu testów (`/10x-test-plan --refresh`, 2026-07-30) dodająca warstwę E2E (Playwright), którą plan wcześniej trzymał poza zakresem (§4 „e2e: brak", §7 negative space). Wprowadza test runner Playwright + `playwright.config.ts` z wpiętą sesją `storageState`.

Dwa ryzyka na poziomie przeglądarki (obie przecinają wiele granic systemu):

- **R-E1 — utrata itemów po odświeżeniu strony.** Wklej tekst → klasyfikacja (AI mockowane na granicy HTTP) → pending → akceptacja → item w „Aktywne" przetrwa reload. Wpływ wysoki (znika praca użytkownika), prawdopodobieństwo średnie. Dowód: US-01/US-02, kryterium sukcesu PRD, hot-spot `src/components/items` (42 zmiany/30 dni), lekcja M3L4.
- **R-E2 — smoke pełnej ścieżki sukcesu z PRD.** Login → klucz → paste → klasyfikacja → akceptacja → Aktywne → „zrealizowane". Dowód: kryterium sukcesu numer jeden z PRD, hot-spoty user-facing.

**Granice:** realne — logowanie (Supabase), routing/middleware, baza (rozstrzyga „przetrwa reload"), render SSR. Mockowany TYLKO klasyfikator AI na warstwie sieci (wolny, niedeterministyczny, BYOK = testowałby cudzy model).

**Poza zakresem E2E (pokryte taniej gdzie indziej):** izolacja per-user (serwis + RLS, testy integracyjne), kontrakt klasyfikatora (jednostkowe), dwuwymiarowy cykl stanu (jednostkowe + integracyjne), regresja pikseli (narzędzia deterministyczne).

**Uwaga do planowania:** R-E2 częściowo zawiera R-E1 — rozdzielić asercje (E1 = przetrwanie po reload; E2 = przejście całej ścieżki).

**Środowisko gotowe:** `@playwright/cli` zainstalowany globalnie, skill `/10x-e2e` pobrany, sesja `storageState` zapisana i zweryfikowana (`playwright/.auth/user.json`), dev na `localhost:4321`.
