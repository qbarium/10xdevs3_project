<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Naprawa 17 zgłoszeń „Inne" z produkcji — brama S-18 (cała gałąź)

- **Plan**: context/changes/prod-feedback-fixes/plan.md
- **Zakres**: Cała gałąź `feature/prod-feedback-fixes` — 12 faz (Faza 9 wycofana) + 5 poprawek po fazach
- **Data**: 2026-08-09
- **Werdykt**: WYMAGA UWAGI (ustalenia rozstrzygnięte w triage — F1/F2/F5/F6 naprawione, F3 odnotowane, F4 zaakceptowane)
- **Ustalenia**: 0 krytycznych, 3 ostrzeżenia, 3 obserwacje
- **Uwaga o pliku**: osobny plik od narastającego `impl-review.md` (per faza) — celowo **nie nadpisuję** istniejącego dziennika operatora. Ten raport pokrywa całą gałąź jako formalną bramę S-18.

## Werdykty

| Wymiar | Werdykt |
|---|---|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | WARNING |
| Bezpieczeństwo i jakość | PASS |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | WARNING |

► **Ogólnie: WYMAGA UWAGI**

## Kontekst weryfikacji

Brama uruchomiona seryjnie po zatrzymaniu dev servera przez operatora (port 4321 wolny):

- **Testy jednostkowe**: 562/562 zielone (55 plików) — bez regresji po 5 poprawkach.
- **Build (SSR Cloudflare)**: ✅ zielony (`astro build` Complete, ~1m 19s; type-gen czysty).
- **Lint (`npm run lint`, type-checked)**: ❌ początkowo 11 błędów w `e2e/prod-fixes-checkbox-dark.spec.ts` → **F6**; po naprawie ✅ `eslint .` czyste.
- **E2E (`npm run e2e`, mock classifier)**: uruchomione po wyłączeniu dev — wynik uzupełniany po zakończeniu (potwierdza m.in. F1 dla `circle-check` i zrefaktorowany `checkbox-dark`).
- **Dowody**: 2 pod-agenci (odchylenia plan↔kod; bezpieczeństwo/jakość/wzorce) + weryfikacja orkiestratora + realne uruchomienie bramy.

## Zgodność z planem — skrót

MATCH we wszystkich fazach z kodem: 1, 2, 4, 5, 6, 7, 8, 10. Faza 3 MATCH co do intencji (ikona zmieniona post-fazowo na `circle-check`). Fazy 11 (triage) i 12 (przycisk „Dodaj wpis") bez kodu / odnotowane. Faza 9 wycofana (revert `9171630`) — jej odrzucone przez operatora elementy (blokada tła) **nie wróciły** w zamienniku `0fabd8f`. Bariery „Czego NIE robimy" zachowane.

## Bezpieczeństwo — ścieżka DELETE (Faza 10) zweryfikowana

Nowy twardy `DELETE /api/items/:id` + `deleteFromTrash` osłonięty wielowarstwowo: 401 na `locals.user`; CSRF fail-closed w middleware (403 przed autoryzacją); walidacja UUID `z.uuid()` (zod v4); strażnik statusu `.in("acceptance_status", ["rejected","deleted"])`; izolacja per-user przez RLS `items_delete_own`; jednolite 404 bez wycieku przyczyny; `prerender = false`; eksport wielką literą. Brak iniekcji, sekretów, liberalnego CORS.

## Ustalenia

### F1 — Test ikony Fazy 3 graniczny + komentarz nieaktualny po zmianie na `circle-check`

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Kryteria sukcesu
- **Lokalizacja**: e2e/prod-fixes-phase3-inbox-icon.spec.ts:102 (komentarz kalibracyjny :19–24)
- **Szczegóły**: Po poprawce `9f39d66` ikona „Do akceptacji" to `circle-check`, ale próg asercji `diffFraction >= 0.32` jest skalibrowany dla `clipboard-check` (zmierzone 0.383). Komentarz testu (:20) podaje dla `circle-check` ~0.32–0.33 — faktycznie wdrożona ikona ląduje dokładnie na progu (margines ~0.00–0.01) → test graniczny/podatny na flaky. Komentarz kalibracyjny wciąż opisuje `clipboard-check` jako „wybór" — nieaktualny. E2E nie zostało ponownie uruchomione po zmianie ikony (weryfikacja tylko lint + screenshot).
- **Poprawka**: Zmierzyć ponownie separację `circle-check`↔`tray`, ustawić próg z realnym zapasem (np. ~0.28 — między confusable 0.259 a zmierzonym ~0.32) i zaktualizować komentarz kalibracyjny na `circle-check`; potem uruchomić `npm run e2e` (po wyłączeniu dev) dla potwierdzenia GREEN.
  - Siła: zachowuje pixel-diff, który jest właściwy dla tego ticketu — pierwotny bug to różne ścieżki `d` wyglądające identycznie, czego strukturalny diff `d` by NIE wykrył.
  - Kompromis: `circle-check` ma z natury mniejszą separację niż `clipboard-check`, więc margines pozostanie węższy.
  - Pewność: HIGH — wartości wprost w komentarzu testu; potwierdzone odczytem pliku.
  - Martwy punkt: rzeczywisty wynik E2E dla `circle-check` niepotwierdzony (dev zajmuje :4321) — do uruchomienia.
- **Decyzja**: NAPRAWIONE — próg 0.32 → 0.29 + komentarz kalibracyjny zaktualizowany na `circle-check`. E2E do potwierdzenia po wyłączeniu dev.

### F2 — 5 poprawek po fazach nieodnotowanych w wersjonowanym rekordzie zmiany

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: context/changes/prod-feedback-fixes/plan.md §Postęp; reviews/impl-review.md:22-23; change.md
- **Szczegóły**: 5 poprawek z 2026-08-09 (`9f39d66`, `0fabd8f`, `4ba3505`, `2d31556`, `ea20f29`) nie jest odzwierciedlone w śledzonym rekordzie zmiany. `plan §Postęp` urywa się na F12; brak wpisu dla `0fabd8f` (zamiennik pętli po wycofaniu F9), mimo że sam plan mówi „Ewentualne wznowienie = nowy wpis/faza" (:402). `impl-review.md` (per faza) kończy na F12, a jego sekcja Fazy 3 (:22-23) wciąż opisuje `clipboard-check` — nieaktualna. Pełny opis 5 poprawek jest w gitignorowanym dzienniku operatora `docs/local/prod-feedback-fixes.md` — więc nie są „ciche" dla operatora, ale są dla śledzonego rekordu (i boardu S-18). `change.md.updated` odświeżone tym przeglądem na 2026-08-09.
- **Poprawka**: Dopisać do `plan §Postęp` sekcję „Poprawki po fazach" (5 poprawek z commit sha), w tym sformalizować `0fabd8f` jako zamiennik pętli F9; skorygować/uzupełnić `impl-review.md` (sekcja F3 → `circle-check`; dopięcie 5 poprawek lub odesłanie do tego raportu).
  - Siła: przywraca wierność wersjonowanego rekordu → board S-18 i przyszłe przeglądy opierają się na prawdzie, nie na gitignorowanym dzienniku.
  - Kompromis: plan staje się nieco ruchomym celem (aneks post-fazowy).
  - Pewność: HIGH — konwencja aneksów już stosowana w tym repo (Faza 12 „[Nowe]").
  - Martwy punkt: brak.
- **Decyzja**: NAPRAWIONE — dopisana sekcja „Poprawki po fazach" (P1–P5) do `plan.md §Postęp`; notatka aktualizująca (`↻ 9f39d66`) w `impl-review.md` Faza 3. `change.md.updated` = 2026-08-09.

### F6 — Najnowszy test (`checkbox-dark`) nie przechodził `npm run lint` (11 błędów) — CI by padło

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — realna blokada CI; mechaniczna, ale wymaga poprawki przed scaleniem
- **Wymiar**: Kryteria sukcesu
- **Lokalizacja**: e2e/prod-fixes-checkbox-dark.spec.ts (commit `ea20f29`)
- **Szczegóły**: Wykryte dopiero przy uruchomieniu bramy (recenzenci read-only lintu nie odpalali). `npm run lint` = 11 błędów wyłącznie w tym pliku: 6× `no-non-null-assertion` (`ub!`, `cbg!`, `cck!`), 2× `no-console` (log diagnostyczny bez wyłączenia reguły), `prefer-regexp-exec`, `no-unnecessary-condition`, `no-confusing-void-expression`. Sąsiednie specy (`phase2`, `phase3`) rozwiązują te same sytuacje idiomatycznie (guardy null, komentarze wyłączające log). Build i logika testu OK — czysta higiena lintu. Ta sama reguła odpala CI → gałąź nie przeszłaby CI. Prawdopodobnie commit `ea20f29` ominął hook pre-commit (husky) albo lint-staged nie objął type-checked reguł.
- **Poprawka**: Doprowadzić plik do standardu sąsiadów: `.exec()` zamiast `.match()`, klamry w `page.evaluate`, guardy `if (!x) throw` zamiast `!`, 2× `// eslint-disable-next-line no-console`, warunek truthiness zamiast `!== undefined`.
  - Siła: przywraca zielone `npm run lint` (potwierdzone) i zgodność z CI; wzór 1:1 z `phase2`/`phase3`.
  - Kompromis: brak — nie zmienia zachowania testu.
  - Pewność: HIGH — po naprawie `eslint .` czyste.
  - Martwy punkt: dlaczego `ea20f29` przeszedł pre-commit — do sprawdzenia (możliwy `--no-verify`).
- **Decyzja**: NAPRAWIONE — plik doprowadzony do standardu sąsiadów; `npm run lint` zielone.

### F3 — Dwustanowy „Zaznacz wszystkie" to zmiana zachowania pod „stylowym" ticketem Fazy 2

- **Ważność**: 🔹 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: AcceptedItemsView.tsx:340, PendingItemsView.tsx:230, TrashItemsView.tsx:266
- **Szczegóły**: `2d31556` zmienia „Zaznacz wszystkie" z trójstanowego (z `indeterminate`) na dwustanowy (`checked={allSelected}`) — spójnie we wszystkich 3 widokach z masterem; `grep indeterminate` = 0. To zmiana ZACHOWANIA, która trafiła pod ticket ef87e4f8 (Faza 2), opisany w planie jako „czysto stylowy" (widoczność w dark). Nie łamie żadnej bariery „Czego NIE robimy"; celowa decyzja UX operatora. Uwaga wyłącznie o higienie zakresu.
- **Poprawka**: Odnotować przy backfillu z F2 jako świadomą zmianę UX (dwustanowy master), osobno od stylowej Fazy 2. Bez zmian w kodzie.
- **Decyzja**: NAPRAWIONE — odnotowane w `plan.md §Postęp` jako P4 (świadoma zmiana UX, osobno od stylowej Fazy 2).

### F4 — Test „przycisk czyszczenia filtra" weryfikuje bug pośrednio

- **Ważność**: 🔹 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Kryteria sukcesu
- **Lokalizacja**: e2e/prod-fixes-search-clear-duplicate.spec.ts:23-42
- **Szczegóły**: Test weryfikuje zgłoszony bug (podwójny ×) tylko pośrednio: (1) własny przycisk `toHaveCount(1)` liczy tylko nasz przycisk, nie natywny `::-webkit-search-cancel-button`; (2) obecność reguły CSS w arkuszu potwierdza, że mechanizm jest wczytany, nie że natywny × zniknął z renderu. Komentarz testu uczciwie tłumaczy ograniczenie (pseudo-element niemiarodajny w `getComputedStyle`). Złapie usunięcie reguły CSS, nie złapie reguły obecnej-lecz-nieskutecznej.
- **Poprawka**: Akceptowalne jak jest. Opcjonalne wzmocnienie: wizualny snapshot pola z frazą (jedyny × w kadrze). Bez zmian wymaganych.
- **Decyzja**: POMINIĘTE (zaakceptowane) — test zostaje jak jest; uczciwe ograniczenie udokumentowane w komentarzu testu.

### F5 — Martwy wariant ikony `inbox` w `Icon.astro`

- **Ważność**: 🔹 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: src/components/shell/Icon.astro:10,59-65
- **Szczegóły**: Wariant ikony `inbox` pozostał zdefiniowany, ale nieużywany po Fazie 3 (dziś „Do akceptacji" = `circle-check`, „Skrzynka wejściowa" = `tray`). Martwy kod, nieszkodliwy; już odnotowany w `impl-review.md:25`.
- **Poprawka**: Opcjonalnie usunąć wariant `inbox` z `Icon.astro` (unia + blok) przy najbliższym dotknięciu pliku. Bez pilności.
- **Decyzja**: NAPRAWIONE — usunięty wariant `inbox` z `Icon.astro` (unia + blok); grep potwierdził brak innych użyć.
