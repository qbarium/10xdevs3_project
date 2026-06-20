<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Cykl życia kosza (S-06)

- **Plan**: context/changes/trash-lifecycle/plan.md
- **Zakres**: Wszystkie 3 fazy
- **Data**: 2026-06-19
- **Werdykt**: ZAAKCEPTOWANY
- **Ustalenia**: 0 krytycznych, 2 ostrzeżenia, 2 obserwacje

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | WARNING (plan.md nie zsynchronizowany ze scope-downem) |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | PASS (2 obserwacje: udokumentowane / ogólnoprojektowe) |
| Architektura | PASS |
| Spójność wzorców | WARNING (nieaktualne komentarze) |
| Kryteria sukcesu | PASS (lint 0, build 0, testy 287; ręczne z dowodami 21/21 backend + 8/8 UI) |

Metoda: dwóch niezależnych pod-agentów (wykrywanie odchyleń + bezpieczeństwo/jakość/wzorce). Oba potwierdziły wierność planowi i zero ustaleń krytycznych. Twardy DELETE (`emptyTrash`) poprawnie autoryzowany (auth-gate + RLS `items_delete_own`, bez service_role).

## Ustalenia

### F1 — Nieaktualne komentarze opisujące usunięty pod-filtr

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: src/lib/services/items.ts:42, src/pages/items/trash.astro:3, src/lib/labels.ts:43
- **Szczegóły**: Scope-down 2026-06-19 (be3b01d) usunął pod-filtr pochodzenia, ale zostawił 3 komentarze wciąż go opisujące. Kod poprawny — wyłącznie dryf komentarzy. Wychwycone przez niezależnego agenta (ślepa plama autora).
- **Poprawka**: Zaktualizowano 3 komentarze, usuwając wzmianki o pod-filtrze (badge jako jedyny nośnik pochodzenia).
- **Decyzja**: FIXED (Napraw oba)

### F2 — plan.md nie zsynchronizowany ze scope-downem

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: context/changes/trash-lifecycle/plan.md (Faza 2 §3–§4, Progress 2.4)
- **Szczegóły**: Decyzję o rezygnacji z pod-filtra odzwierciedlono w change.md (Notes) i PRD (FR-012), ale nie w plan.md, który wciąż opisuje pod-filtr i trash-view.ts. Czytający sam plan.md zostanie wprowadzony w błąd (powtarzalny wzorzec z lekcji po S-05).
- **Poprawka**: Dopisano callout „🔁 Scope-down 2026-06-19" na górze Fazy 2 + adnotację przy kroku 2.4 (bez przepisywania bloków faz — historia).
- **Decyzja**: FIXED (Napraw oba)

### F3 — Mutujące endpointy polegają na SameSite jako jedynej obronie anty-CSRF

- **Ważność**: 🔭 OBSERWACJA
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby przemyśleć
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: src/pages/api/items/trash/empty.ts, bulk.ts, operational.ts (ogólnoprojektowe)
- **Szczegóły**: Jedyny twardy DELETE (`emptyTrash`) i pozostałe mutujące POST-y opierają anty-CSRF wyłącznie na SameSite=Lax. Autoryzacja per-user OK (auth-gate + RLS). NIE regresja S-06 — dotyczy też istniejących endpointów.
- **Poprawka**: Odłożone do follow-ups/review-fixes.md jako osobna, ogólnoprojektowa zmiana (origin-check / token CSRF).
- **Decyzja**: FOLLOW-UP (review-fixes.md)

### F4 — restoreFromTrash: dwa UPDATE-y poza transakcją

- **Ważność**: 🔭 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: src/lib/services/items-mutation.ts:161-182
- **Szczegóły**: Dwa osobne UPDATE-y (deleted→accepted, rejected→pending) nie są wspólnie transakcyjne. Świadomie udokumentowane (komentarz + plan), bez ryzyka korupcji (guard źródłowy = atomowy przeskok per-wiersz; stan spójny per-item po reloadzie). Pełna atomowość wymaga RPC + migracji — poza zakresem S-06 (był bez migracji).
- **Poprawka**: Brak — zaakceptowane jako udokumentowane ograniczenie solo-MVP. Kontekst odnotowany w follow-ups/review-fixes.md.
- **Decyzja**: ACCEPTED (bez zmian)
