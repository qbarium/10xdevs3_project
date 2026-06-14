<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Dziennik sesji importu + ponowienie (S-08)

- **Plan**: `context/changes/import-session-log-retry/plan.md`
- **Scope**: 4 z 4 faz (pełny przegląd planu)
- **Date**: 2026-06-14
- **Verdict**: ZAAKCEPTOWANO
- **Findings**: 0 krytycznych, 1 ostrzeżenie, 3 obserwacje

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Metoda

Dwóch niezależnych pod-agentów (general-purpose): (1) wykrywanie odchyleń plan↔kod, (2) bezpieczeństwo/jakość/wzorce. Zakres git: 24 pliki, wszystkie zaplanowane (0 nieplanowanych, 0 brakujących). Kryteria automatyczne wykonane: test 156/156 ✓, lint ✓ (exit 0), build ✓ (Complete).

Inwarianty potwierdzone niezależnie: guard TOCTOU (`reopenSession` warunkowy `UPDATE … WHERE status='failed' RETURNING id`), brak duplikacji itemów (failed ⟹ brak itemów, `persist_classification` tylko na ścieżce sukcesu), re-check klucza i reopen przed klasyfikacją, `missing_key` bez wywołania classify/reopen, jedyne miejsce mapowania HTTP w `classifyResultToResponse`, FR-026 (brak wycieku klucza/wsadu do logów/odpowiedzi), RLS jako izolacja per-user, `clearTimeout` w `finally`. Plan adherence: 12/12 punktów MATCH co do zamiaru.

## Findings

### F1 — Hook traktuje 422/ok:false (too_many_items) jako „done", nie „error"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Dimension**: Safety & Quality (niezawodność)
- **Location**: src/components/hooks/useSessionRetry.ts:59
- **Detail**: Endpoint zwraca too_many_items jako `{ ok:false, status:"failed", code:"too_many_items" }` z HTTP 422. Hook rozgałęział wyłącznie po `data.status ∈ SESSION_STATES`, ignorując `ok`/kod HTTP — 422 trafiało do gałęzi `done` zamiast `error`. UX był przypadkowo poprawny (fallback w islandzie pokazuje właściwy komunikat), ale kontrakt done/error był nieszczelny.
- **Fix**: Dodano `res.ok` przed gałęzieniem po statusie — `if (res.ok && data.status && SESSION_STATES.has(data.status))`. 422 mapuje się teraz rozłącznie na `error`; fallback w islandzie nadal pokazuje komunikat z `code`.
- **Decision**: FIXED — Fix now (useSessionRetry.ts:59).

### F2 — Duplikacja helpera `itemNoun` w trzech komponentach

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Dimension**: Pattern Consistency
- **Location**: SessionsList.astro, RetrySessionButton.tsx, ClassificationModal.tsx
- **Detail**: Identyczna logika polskiej odmiany „item/itemy/itemów" w trzech miejscach — niespójne z filozofią `labels.ts` (jedno źródło prawdy prezentacji). Duplikat pre-istniejący (nie regresja S-08), ale S-08 go powielał.
- **Fix**: Wyekstrahowano `itemNoun` do `src/lib/labels.ts` (export); trzy komponenty importują go zamiast lokalnych kopii. `elementNoun` w `PendingItemsList.astro` pozostawiony (inny rzeczownik, plik spoza zakresu S-08).
- **Decision**: FIXED — Fix now (labels.ts + 3 importy).

### F3 — Nieaktualny komentarz nagłówkowy w classify.ts

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Dimension**: Plan Adherence (kosmetyka)
- **Location**: src/pages/api/ingest/classify.ts:5
- **Detail**: Komentarz odwoływał się do nieistniejącego już `classifyAndRespond` (wyniesionego do `classify-core`).
- **Fix**: Zaktualizowano komentarz — odsyła do `runClassification`/`classifyResultToResponse` w `@/lib/ai/classify-core` (reużywanego przez retry).
- **Decision**: FIXED — Fix now (classify.ts:5).

### F4 — RetrySessionButton uruchamiany jako client:load dla każdej sesji failed

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Dimension**: Pattern Consistency (wydajność)
- **Location**: src/components/import-sessions/SessionsList.astro
- **Detail**: Każda sesja `failed` uruchamia JS swojej wyspy natychmiast. `client:visible` odłożyłby to do wejścia w pole widzenia — drobna oszczędność tylko na długiej liście.
- **Fix**: Zmiana `client:load` → `client:visible` (opcjonalna).
- **Decision**: SKIPPED — zysk wydajnościowy warunkowy i pomijalny przy skali MVP (brak paginacji, single-user); rozważyć dopiero przy długich listach/paginacji.

## Triage summary

- Naprawiono: F1 (res.ok), F2 (itemNoun → labels.ts), F3 (komentarz) — zweryfikowane: test 156/156, lint, build zielone.
- Pominięto: F4 (client:load — świadomie, zysk pomijalny przy skali MVP).
- Werdykt po poprawkach: ZAAKCEPTOWANO (bez zmian — wszystkie ustalenia niskiego wpływu).
