<!-- PLAN-REVIEW-REPORT -->
# Przegląd planu: Naprawa 17 zgłoszeń „Inne" z produkcji

- **Plan**: `context/changes/prod-feedback-fixes/plan.md`
- **Tryb**: Głęboki (ugruntowanie: recon 4 agentów Explore + spot-check ścieżek/symboli)
- **Data**: 2026-08-08
- **Werdykt**: DO POPRAWY → **SOLIDNY po naniesieniu poprawek** (wszystkie 6 ustaleń rozwiązanych autonomicznie)
- **Ustalenia**: 1 krytyczne, 3 ostrzeżenia, 2 obserwacje

## Werdykty

| Wymiar | Werdykt |
|---|---|
| Zgodność ze stanem końcowym | OSTRZEŻENIE → ZALICZONY (F5) |
| Oszczędne wykonanie | ZALICZONY (obserwacja F6) |
| Dopasowanie architektoniczne | OSTRZEŻENIE → ZALICZONY (F2) |
| Martwe punkty | OSTRZEŻENIE → ZALICZONY (F4) |
| Kompletność planu | NIEZALICZONY → ZALICZONY (F1, F3) |

## Ugruntowanie
12/12 ścieżek ✓, symbole ✓ (`[id].ts` tylko PATCH; `EditItemDialog.requestClose` nie zamyka edytora gdy `isDirty`; `Layout.astro` `h-screen`+brak `initial-scale`; `PendingItemsView` `removeByIds`+`refetchAfterRemoval`; trój-rozjazd „Zrobione"/„Zrealizuj"/„Zakończone"), brief↔plan ✓.

## Ustalenia

### F1 — Rozjazd nazw faz: treść ↔ sekcja Postęp
- **Waga**: ❌ KRYTYCZNE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista
- **Wymiar**: Kompletność planu (kontrakt mechaniczny Postęp↔Faza)
- **Lokalizacja**: `## Postęp`
- **Szczegóły**: Nagłówki `### Faza N` w Postępie były skrócone i nie zgadzały się słowo w słowo z `## Faza N` w treści — `/10x-implement` mógłby nie sparsować bloku Postęp.
- **Poprawka**: Ujednolicić wszystkie 11 nagłówków Postępu do pełnych nazw z treści.
- **Decyzja**: NAPRAWIONE

### F2 — Otwarty wybór mechanizmu reaktywności powłoki (Fazy 5/6)
- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — realny kompromis architektoniczny
- **Wymiar**: Dopasowanie architektoniczne / Kompletność
- **Lokalizacja**: Faza 5 (pkt 2), Faza 6 (pkt 2)
- **Szczegóły**: Plan zostawiał „inline `<script>` albo mikro-wyspa" — plan nie ma zawierać otwartych pytań.
- **Poprawka**: Rozstrzygnięto na **inline `<script>` w `AppSidebar.astro`** (progresywne wzbogacenie, sidebar pozostaje statyczny; mniejszy promień rażenia niż wprowadzanie wyspy React).
- **Decyzja**: NAPRAWIONE

### F3 — Otwarte nadpisania per-typ terminologii `done` (Faza 4)
- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI
- **Wymiar**: Kompletność planu
- **Lokalizacja**: Faza 4 (pkt 1)
- **Szczegóły**: Plan zostawiał „ujednolicić lub zachować" nadpisania per-typ (`labels.ts:26-29`); rozjazd z filtrem zostałby dla typu `other` („Obsłużone" vs „Zakończone").
- **Poprawka**: Ujednolicić WSZYSTKIE warianty `done` (główny + per-typ) do „Zakończone"; zmiana modelu stanów pozostaje poza zakresem.
- **Decyzja**: NAPRAWIONE

### F4 — Brak izolacji danych dla E2E mutujących stan
- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Fazy 5, 6, 10 / Strategia testowania
- **Szczegóły**: E2E Fazy 5 usuwa klucz z `storageState`, Fazy 6 zużywa pending, Fazy 10 usuwa z kosza — bez izolacji psują kolejne scenariusze.
- **Poprawka**: Dodano wymóg izolacji/przywracania danych (przywrócić klucz, seedować pending, wpierw wrzucić wpis do kosza).
- **Decyzja**: NAPRAWIONE

### F5 — Brak jawnej bramy build; mylące kryterium 2.2
- **Waga**: ℹ️ OBSERWACJA
- **Wpływ**: 🏃 NISKI
- **Wymiar**: Zgodność ze stanem końcowym / Kompletność
- **Lokalizacja**: Kryteria sukcesu / Strategia testowania
- **Szczegóły**: Pożądany stan obiecuje „build zielony", ale żadna faza go nie weryfikowała; kryterium 2.2 sugerowało nowy test dla zmiany czysto stylowej.
- **Poprawka**: Dodano „Bramę końcową" (`npm run build` + lint + test na całości, seryjnie); doprecyzowano 2.2 („istniejące testy zielone, bez nowego testu").
- **Decyzja**: NAPRAWIONE

### F6 — Duplikacja mechanizmu zdarzeń (Fix 5/6)
- **Waga**: ℹ️ OBSERWACJA
- **Wpływ**: 🏃 NISKI
- **Wymiar**: Oszczędne wykonanie
- **Lokalizacja**: Fazy 5, 6
- **Szczegóły**: Oba fixy potrzebują mostu wyspa→powłoka; ryzyko dwóch kopii.
- **Poprawka**: Wprowadzono wspólny `src/components/shell/sidebar-events.ts` reużywany przez obie fazy.
- **Decyzja**: NAPRAWIONE

## Podsumowanie triażu
- Naprawiono: F1, F2, F3, F4, F5, F6 (6/6)
- Werdykt po poprawkach: **SOLIDNY** — plan gotowy do `/10x-implement phase 1`.
