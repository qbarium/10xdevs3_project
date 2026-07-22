<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Konsolidacja filtra stanu Wpisów

- **Plan**: context/changes/flatten-entries-state-filter/plan.md
- **Zakres**: Fazy 1–3 z 3
- **Data**: 2026-07-21
- **Werdykt**: ZAAKCEPTOWANY
- **Ustalenia**: 0 krytycznych, 0 ostrzeżeń, 2 obserwacje

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | WARNING |
| Bezpieczeństwo i jakość | PASS |
| Architektura | PASS |
| Spójność wzorców | WARNING |
| Kryteria sukcesu | PASS |

## Kryteria sukcesu (weryfikacja na żywo)

- `npm run test` → 561 przechodzi (53 pliki); `state-filter.test.ts` 25/25.
- `npm run lint` → czysty na 6 zmienionych plikach.
- `npm run build` → Complete! (ostrzeżenie `@astrojs/sitemap` o braku `site` jest wcześniej istniejące, niezwiązane ze zmianą).
- Ręczne (Progress) odhaczone z dowodami strukturalnymi w diffie: 6 `SelectItem` w kolejności cyklu życia, wiring 3 wysp, callback klienckiego podfiltra przez `resetToFirstPage` + czyszczenie zaznaczenia, parytet z pigułkami weryfikowany w Fazie 2 (koegzystencja).

## Ustalenia

### F1 — Przestarzały komentarz „EntriesViewSelect" po rename

- **Ważność**: 🔭 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: src/pages/items.astro:87
- **Szczegóły**: Komentarz nadal odwołuje się do „EntriesViewSelect", który w tej zmianie (Faza 2) został przemianowany na `StateFilterSelect`. To jedyna pozostała referencja starej nazwy w `src/` (potwierdzone `grep`). Czysty komentarz, zero wpływu na runtime, ale wprowadza w błąd przy czytaniu kodu.
- **Poprawka**: Zamień „EntriesViewSelect" na „StateFilterSelect" w komentarzu `items.astro:87`.
- **Decyzja**: FIXED

### F2 — Helper `stateSelectLabel` poza jawnym kontraktem Fazy 1

- **Ważność**: 🔭 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: src/components/items/state-filter.ts
- **Szczegóły**: Kontrakt Fazy 1 jawnie wymieniał `resolveStateSelection` i `stateSelectValue`; implementacja dodała trzecią funkcję `stateSelectLabel` (+ jej testy). Wspiera wymóg triggera z Fazy 2 (jawny render etykiety, SSR bez mignięcia — wzorzec `SessionFilterBar`). Umieszczenie logiki etykiety w czystym module jest zgodne z duchem planu („logika żyje tu, żeby była testowana w node"). Nieszkodliwe; odnotowane wyłącznie dla przejrzystości zakresu.
- **Poprawka**: Zaakceptować jako uzasadniony dodatek; opcjonalnie odnotować aneksem w planie (kontrakt Fazy 1 → 3 funkcje).
- **Decyzja**: FIXED (aneks dopisany do `plan.md`, sekcja kontraktu Fazy 1)
