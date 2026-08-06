<!-- PLAN-REVIEW-REPORT -->
# Przegląd planu: Kosz jako osobne miejsce w panelu bocznym

- **Plan**: context/changes/trash-sidebar-relocation/plan.md
- **Tryb**: Głęboki
- **Data**: 2026-08-06
- **Werdykt**: SOLIDNY
- **Ustalenia**: 0 krytycznych, 0 ostrzeżeń, 2 obserwacje (obie naprawione w planie)

## Werdykty

| Wymiar | Werdykt |
|--------|---------|
| Zgodność ze stanem końcowym | ZALICZONY |
| Oszczędne wykonanie | ZALICZONY |
| Dopasowanie architektoniczne | ZALICZONY |
| Martwe punkty | ZALICZONY |
| Kompletność planu | ZALICZONY |

## Ugruntowanie

11/11 ścieżek ✓ (`docs/reference/contract-surfaces.md` — opt-in, nieobecny, pominięty), 7/7 symboli ✓ (`STATE_FILTER_OPTIONS`, `NAV_MATCHERS`, `IconName`, `getKeyStatus`, `pendingCount`, `MainView`, `StateFilterSelect`), brief↔plan ✓. Progress↔Faza: 8/7/2 punkty (1.1–1.8, 2.1–2.7, 3.1–3.2) — kontrakt mechaniczny spełniony. Promień rażenia zweryfikowany: `STATE_FILTER_OPTIONS` renderuje wyłącznie `StateFilterSelect.tsx:40` (osadzony tylko w `AcceptedItemsView.tsx:317` i `TrashItemsView.tsx:215`); jedyny konsument `active === "entries"` to `AppSidebar.astro:85-86`; `MainView`/`MAIN_VIEWS` (`list-criteria.ts:21,24`) zachowują `"trash"` niezależnie od osi.

## Mocne strony planu

- Sekwencjonowanie faz poprawne i uzasadnione: najpierw nowy punkt wejścia (sidebar), potem usunięcie starego (oś) — Kosz nigdy nie znika z nawigacji.
- Najgroźniejszy kierunek błędu Fazy 2 (usunąć z modelu, ale zostawić oś w widoku Kosza → 5 zakładek bez podświetlenia) jawnie nazwany jako nierozdzielna zmiana.
- Kolejność matcherów zweryfikowana w kodzie: exact `/items/trash` wstawiony między `pending` (`:23`) a `entries` (`:24`).
- Obsługa błędu w `Promise.all` przemyślana: catch per odczyt, każdy degraduje do wartości neutralnej.

## Ustalenia

### F1 — Linia 81 w ui-design-system.md zostawała częściowo nieaktualna

- **Waga**: 💤 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Wymiar**: Kompletność planu
- **Lokalizacja**: Faza 3, punkt 1 — edycja linii 81
- **Szczegóły**: Faza 3 usuwała tylko „Kosz" z linii „Zakładki zakresu … / Kosz — z licznikami", zostawiając listę niezgodną z realną 5-zakładkową osią cyklu życia (bez liczników). Dług sprzed S-16, ale Faza 3 sama dotyka tej linii i obiecuje zgodność z nową IA.
- **Poprawka**: Instrukcja Fazy 3 (`plan.md:210`) aktualizuje teraz całą listę do 5 zakładek cyklu życia (Wszystko aktywne / Nowe / W toku / Zakończone / Anulowane) i usuwa „— z licznikami".
- **Decyzja**: NAPRAWIONE (Napraw w planie)

### F2 — Komentarz „6 pozycji" w StateFilterSelect.tsx zostawał nieaktualny

- **Waga**: 💤 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Wymiar**: Kompletność planu
- **Lokalizacja**: Faza 2 — pominięty plik
- **Szczegóły**: Faza 2 aktualizowała komentarze „6 pozycji" tylko w `state-filter.ts` (`:2-8`, `:32-37`); komentarz `StateFilterSelect.tsx:2` opisujący ten sam model („każda z 6 pozycji `STATE_FILTER_OPTIONS`") pozostawał pominięty. Zero wpływu na działanie — czystość komentarza.
- **Poprawka**: Kontrakt Fazy 2 (`plan.md:149`) wymienia teraz też `StateFilterSelect.tsx:2` (6 → 5 pozycji).
- **Decyzja**: NAPRAWIONE (Napraw w planie)
