<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Stan operacyjny itemu (S-04)

- **Plan**: context/changes/task-operational-lifecycle/plan.md
- **Zakres**: Pełny plan — Fazy 1–4 z 4
- **Data**: 2026-06-15
- **Werdykt**: ZAAKCEPTOWANY
- **Ustalenia**: 0 krytycznych, 0 ostrzeżeń, 2 obserwacje

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | PASS (16/16 MATCH) |
| Dyscyplina zakresu | WARNING (1 obserwacja) |
| Bezpieczeństwo i jakość | PASS |
| Architektura | PASS |
| Spójność wzorców | WARNING (1 obserwacja) |
| Kryteria sukcesu | PASS |

## Weryfikacja automatyczna

| Bramka | Wynik |
|---|---|
| `npm run lint` | PASS (tylko ostrzeżenia parsera `projectService`, nieszkodliwe) |
| `npm run build` | PASS (typecheck + SSR; ponownie zielony po poprawce F2) |
| `npm test` | PASS — 232/232 (35 plików) |
| `npm run test:integration` | PASS — 37/37 (9 plików; migracja, backfill, RPC, RLS, guard `accepted`, rozłączne podzbiory) |

Weryfikacja ręczna: wszystkie pozycje `## Progress` `[x]`, potwierdzone przez użytkownika (commit c48eaa4).

## Najważniejsze potwierdzenia

- Wszystkie 16 kontraktów planu = MATCH, zero DRIFT/MISSING.
- Regresja kształtu błędu API z S-03 (F4 `{ok:false,code,error}`) **nie powtórzyła się** — każda ścieżka błędu `operational.ts` (401/400/400/500/500) ma pełny `{ok:false, code, error}`, sukces `{ok:true, status, updatedIds, count}`.
- Migracja bezpieczna danowo: nowy indeks `(user_id, acceptance_status, operational_status)` to dokładny lewy prefiks usuwanego `items_user_acceptance_idx` (B-tree pokrywa stare zapytania); backfill `NULL→'new'` idempotentny; RPC `persist_classification` pozostaje `security invoker` z `search_path`.
- Endpoint RLS-scoped (createClient per-request, cookies usera), zod waliduje przed dotknięciem bazy; island robi rollback z wygaszenia bez migania.

## Ustalenia

### F1 — Dwa artefakty poza listą produktów planu

- **Ważność**: 🔭 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: src/components/items/operational-view.ts (+ operational-view.test.ts); src/types.ts:72-78
- **Szczegóły**: `operational-view.ts` (`matchesView` + `reconcileAfterChange`) to predykat widoku wyekstrahowany z islandu, niewymieniony wprost w „Wymaganych zmianach", ale wymagany przez test ze §Strategia testowania planu („island usuwa item po zmianie poza predykat widoku") — analogicznie do istniejącego `selection.ts`. `types.ts` zmienił wyłącznie komentarz nad `OperationalStatus`; sama definicja typu nietknięta (deklaracja planu „żadnej zmiany typu/enuma" spełniona). Oba EXTRA uzasadnione i nieszkodliwe.
- **Poprawka**: Brak zmiany kodu; opcjonalnie aneks w §Referencje plan.md wskazujący `operational-view.ts`.
- **Decyzja**: SKIPPED — oba dodatki zdrowe i uzasadnione; brak realnego długu (decyzja użytkownika).

### F2 — Typ `BulkResponse` reużyty dla odpowiedzi endpointu operacyjnego

- **Ważność**: 🔭 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: src/components/hooks/useItemMutation.ts:13-17
- **Szczegóły**: Hook konsumuje odpowiedź `/api/items/operational` jako `BulkResponse {ok?, updatedIds?, count?}`, ale endpoint zwraca też pole `status` (operational.ts:41), nieobecne w typie. Hook czyta tylko `count`/`updatedIds`, więc działa poprawnie — kosmetyczna niekompletność typu, nie błąd.
- **Poprawka**: Dodano opcjonalne `status?: OperationalStatus` do `BulkResponse`.
- **Decyzja**: FIXED — pole `status?: OperationalStatus` dodane do interfejsu (useItemMutation.ts:17); `npm run build` ponownie zielony.
