<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Tryb „Pokaż wpisy" (S-13)

- **Plan**: context/changes/session-entries-mode/plan.md
- **Zakres**: Wszystkie fazy (1–5 z 5)
- **Data**: 2026-07-02
- **Werdykt**: WYMAGA UWAGI
- **Ustalenia**: 0 krytycznych, 3 ostrzeżenia, 2 obserwacje

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | WARNING |
| Dyscyplina zakresu | WARNING |
| Bezpieczeństwo i jakość | WARNING |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | PASS |

Bramki automatyczne (zweryfikowane w przeglądzie): `npm run lint` PASS, `npm run test` 505/505 PASS, `npm run build` PASS.
Miara sukcesu ramki (zniknięcie drugiej implementacji listy wpisów) — **osiągnięta**: `SessionItemsPanel.tsx`, `useSessionItems.ts` (+test), `ItemList.astro` usunięte bez resztkowych importów; jedna karta (`ItemCard`), jeden hook (`useItemList`), jedna ścieżka mutacji (`useItemMutation`).

## Ustalenia

### F1 — Plan (źródło prawdy) opisuje 3 rozwiązania, które kod świadomie zastąpił

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: context/changes/session-entries-mode/plan.md
- **Szczegóły**: Trzy świadome, udokumentowane w commitach pivoty, których plan nie odzwierciedlał: (1) zakładki „wyszarzone" → `MainFilterNav` usunięty, zakładki zastąpione menu Topbar + dropdown `EntriesViewSelect`, w trybie sesji nawigacja nieobecna (657d1a0, f372a6b, 2a1a510); (2) preferencja rozmiaru strony localStorage → cookie czytane też przy SSR (77b8a4b); (3) „auto-cofnięcie o 1" → `refetchAfterRemoval` „zawsze dociągaj", zweryfikowane jako poprawne bez wyścigów (4e6dbc8).
- **Poprawka**: Dopisać aneks do plan.md odzwierciedlający 3 decyzje (wzorzec aneksu jak FR-009 po S-04).
- **Decyzja**: FIXED — aneks „Aneks wdrożeniowy — decyzje z testów manualnych (2026-07-02)" dopisany do plan.md przed sekcją `## Progress`.

### F2 — Strona poza zakresem: fałszywe „sesja pusta" + nieskuteczny retry 500

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: src/lib/services/list-criteria.ts:188 (parseItemPage) + src/pages/items.astro:44-65
- **Szczegóły**: `parseItemPage` klampuje tylko w dół; `page` bez górnego limitu → `?page=1000000` daje `.range()` z ogromnym offsetem → PGRST103. W trybie sesji: `getSessionMeta` OK, `getSessionItems` rzuca → catch ustawia items=[]/total=0, ale sessionMeta zostaje → widok fałszywie mówi „ta sesja nie ma elementów", a paginacja znika (pageCount≤1) → brak powrotu na stronę 1 w widoku. W widokach głównych: 500, a retry() ponawia te same kryteria → ten sam 500. Kontrolka paginacji (pole skoku) jest bezpieczna dzięki `clampPage`; problem dotyczy wyłącznie ręcznie wpisanego adresu / popstate. Wzorzec preegzystujący z S-11. **Potwierdzone empirycznie przez użytkownika** (adres z `?page=N` poza zakresem → paginacja znika).
- **Poprawka A ⭐ Zalecana**: Po odczycie, gdy `page > 1 && total === 0` (i sesja dostępna), SSR redirect na stronę 1.
  - Siła: Usuwa maskowanie i pętlę 500; URL i widok znów spójne; wąska zmiana w jednym pliku.
  - Kompromis: Pokrywa ścieżkę SSR/adresu; klient (popstate przez endpoint) pozostaje jako rzadszy wariant rezydualny.
  - Pewność: ŚREDNIA — dotyka ścieżki, która i tak liczy total.
  - Martwy punkt: Dokładne zachowanie PostgREST przy offsecie za końcem (rzut vs pusta lista + count).
- **Poprawka B**: Zaakceptować jako znane ograniczenie MVP (parytet z S-11), tylko udokumentować.
- **Decyzja**: FIXED via Fix A (wariant bez redirectu) — w src/pages/items.astro, gdy `page > 1 && total === 0` (i sesja dostępna), kryteria cofane na stronę 1 (`criteria = { ...criteria, page: 1 }`) i dane strony 1 dociągane w miejscu; licznik stron wraca, znika fałszywe „pusto". Pierwotny `return Astro.redirect(...)` wycofany — top-level `return` w `.astro` wywraca regułę `@typescript-eslint/no-misused-promises` (`npm run lint` crash); redirecty w tym repo robi wyłącznie `middleware.ts`. Zweryfikowane: lint+build zielone.

### F3 — Rozszerzenie zakresu nawigacji ponad plan

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: src/components/items/EntriesViewSelect.tsx, src/components/Topbar.astro:16-21, src/components/import-sessions/session-log-return.ts
- **Szczegóły**: Ponad zaplanowane „zmodyfikować MainFilterNav" dołożono redesign nawigacji widoków (dropdown), 2 pozycje menu górnego oraz mechanizm powrotu do dziennika z zapamiętaniem filtra (`session-log-return.ts`, sessionStorage). Wszystkie nieszkodliwe, powiązane z celem, otestowane; żadna bariera „Czego NIE robimy" nienaruszona (session-log-return trzyma query dziennika, nie wybór sesji).
- **Poprawka**: Objąć aneksem z F1 (część nowego modelu nawigacji). Bez zmiany kodu.
- **Decyzja**: FIXED — dopisane do aneksu (wzmianka o session-log-return, pula +5, „Pokaż wpisy" zawsze widoczne).

### F4 — `ITEM_PAGE_SIZES` dodaje wartość 5 względem planu

- **Ważność**: 🔍 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: src/lib/services/list-criteria.ts:182
- **Szczegóły**: `ITEM_PAGE_SIZES = [5, 10, 15, 25, 50, 100]`; plan mówił `[10, 15, 25, 50, 100]`. Nieszkodliwe (ITEM_PAGE_SIZE=10 nadal w puli, commit 2a1a510 rozszerza obie pule o 5).
- **Poprawka**: Potwierdzić, że `5` jest celowe; jeśli tak — bez akcji.
- **Decyzja**: SKIPPED — świadome rozszerzenie, udokumentowane w aneksie.

### F5 — „Pokaż wpisy" zawsze widoczne (aria-disabled) zamiast warunkowego renderu

- **Ważność**: 🔍 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: src/components/import-sessions/SessionCard.tsx:75-121
- **Szczegóły**: Plan (Faza 5): „Pokaż wpisy" render TYLKO gdy completed_with_items i żywych > 0. Kod: zawsze widoczne, aktywny odnośnik tylko przy tym warunku, inaczej aria-disabled (commit 65f1967, powód: równa wysokość kart). Intencja (nawigacja tylko przy żywych wpisach) zachowana.
- **Poprawka**: Bez akcji (świadoma decyzja UX) lub odnotować w aneksie.
- **Decyzja**: SKIPPED — świadoma decyzja UX, udokumentowana w aneksie.
