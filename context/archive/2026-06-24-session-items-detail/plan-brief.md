# Widok elementów sesji (master-detail) — Krótki plan

> Pełny plan: `context/changes/session-items-detail/plan.md`
> Badania: `context/changes/session-items-detail/research.md`

## Co i dlaczego

Rozbudowa dziennika importu (`/import-sessions`) o widok master-detail: po lewej lista sesji (już istnieje), po prawej — po kliknięciu sesji — **wszystkie jej elementy we wszystkich stanach akceptacji**, z możliwością podglądu, edycji, przeniesienia do kosza i przywrócenia. To realizacja S-10: dać użytkownikowi pełny obraz „co wyszło z danego importu i co się z tym stało".

## Punkt wyjścia

`/import-sessions` (S-08) to jednokolumnowa, serwerowo renderowana lista sesji z jedną wyspą React (`SessionsList`). Nie ma wyboru sesji ani podglądu jej elementów. Istnieją gotowe i reużywalne: `EditItemDialog` (S-05), move-to-trash/restore (S-06), wzorzec endpointu/hooka listy (S-09). Model danych (FK `import_session_id`, indeks `items_session_idx`, RLS per-user) wystarcza bez migracji.

## Pożądany stan końcowy

Klikasz sesję po lewej → po prawej dociągają się jej elementy (jedno żądanie, ≤100) z badżami statusu i stanu. Per element: `pending`/`accepted` edytujesz, `accepted` przenosisz do kosza, `rejected`/`deleted` podglądasz (read-only) i przywracasz (po czym staje się edytowalny). Każda akcja zmienia tylko ten jeden element w miejscu — bez przeładowania listy, bez przeskoku, bez migotania.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Ładowanie panelu | Dociąganie elementów na kliknięcie sesji | Nie wolno preloadować elementów wszystkich sesji (skala) | Plan |
| Wybór sesji w URL | Nie zapisujemy (`?session=` poza zakresem) | Sprzężone z paginacją; deep-link bez paginacji byłby niespójny | Plan |
| Paginacja listy sesji | Poza S-10 → S-11 | Realny dług (lista append-only), ale osobny od master-detail; S-11 i tak rusza tę listę | Plan |
| Zakres elementów panelu | Wszystkie stany akceptacji (kosz read-only) | Brief S-10/FR-027: pełny obraz sesji | Badania |
| Zestaw akcji | Edycja + kosz + przywróć (bez accept/odrzuć/bulk) | To przegląd, nie druga główna lista | Plan |
| Read-only dla kosza | Mirror systemu: kosza się nie edytuje, tylko przywraca | Spójność z resztą systemu; serwer i tak strzeże | Badania |
| Po akcji | Aktualizacja pojedynczego elementu w miejscu | Brak migotania, sort `created_at` → brak reorderu | Plan |
| Świeży `updated_at` po restore | Restore zwraca wiersz (addytywne pole) | Inaczej edycja po restore daje zakleszczony 409 | Plan |

## Zakres

**W zakresie:** endpoint `GET /api/import-sessions/[id]/items` (wszystkie stany), tryb read-only `EditItemDialog`, addytywne `items` w odpowiedzi restore, panel master-detail z wpięciem edycji/kosza/przywracania, aktualizacja w miejscu.

**Poza zakresem:** paginacja listy sesji (S-11), `?session=` w URL (S-11), accept/odrzuć i zaznaczanie zbiorcze w panelu, zmiany schematu, per-item permanent delete.

## Architektura / Podejście

Strona `/import-sessions` → dwie kolumny w jednej wyspie (`ImportSessionsView`, hoisting granicy wyspy z `SessionsList` do wspólnego rodzica trzymającego `selectedSessionId`). Lewa: dotychczasowa lista (z wyborem). Prawa: `SessionItemsPanel` + hook `useSessionItems(sessionId)` (fetch na wybór, „ostatnie żądanie wygrywa"). Akcje reużywają `EditItemDialog`/`useItemMutation`; każda aktualizuje jeden element w stanie hooka. Sort po `created_at`, klucz po `id`.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Warstwa danych | Endpoint elementów sesji + serwis + addytywne restore + testy helperów | Niskie (odbicie wzorca `GET /api/items`) |
| 2. Dialog read-only | Tryb `readOnly` w `EditItemDialog` | Regresja edycji w trzech istniejących widokach |
| 3. Panel master-detail | Layout 2-kol. + wyspa/hook panelu + wpięcie akcji + update w miejscu | WYSOKIE — dup-React SSR na wyspie; weryfikacja realnym dev SSR |

**Wymagania wstępne:** S-05, S-06, S-08 (wszystkie `done`). **Szacowany nakład:** ~3 fazy, złożoność ŚREDNIA.

## Otwarte ryzyka i założenia

- **dup-React SSR** na `/import-sessions` (historyczny bloker) — fix w `astro.config.mjs` jest, ale dołożenie hooka panelu wymaga weryfikacji realnym dev SSR (re-optymalizacja w trakcie sesji), nie zielonym buildem.
- Założenie: zwrócenie świeżego wiersza przez restore wystarcza, by edycja po restore nie dawała 409 (wymaga `.select()` na UPDATE w `restoreFromTrash`).
- Dług świadomie odłożony: paginacja listy sesji → S-11 (wpisana jako wymóg w roadmapie).

## Kryteria sukcesu (podsumowanie)

- Wybór sesji pokazuje wszystkie jej elementy z badżami statusu i stanu; akcje edytuj/kosz/przywróć/podgląd działają zgodnie ze stanem.
- Każda akcja aktualizuje element w miejscu — bez reorderu, migotania, ucieczki spod kursora; edycja po przywróceniu działa bez 409.
- `/import-sessions` renderuje się w dev SSR bez „Invalid hook call"; zielone `npm run lint` / `npm test` / `npm run build`.
