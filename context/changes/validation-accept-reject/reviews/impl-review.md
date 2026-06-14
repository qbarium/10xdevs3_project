<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Walidacja — akceptacja, odrzucenie i edycja pendingów (S-03)

- **Plan**: context/changes/validation-accept-reject/plan.md
- **Scope**: Wszystkie 4 fazy (pełny plan)
- **Date**: 2026-06-14
- **Verdict**: APPROVED
- **Findings**: 0 critical · 1 warning · 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS (1 observation) |
| Safety & Quality | WARNING (1 finding) |
| Architecture | PASS |
| Pattern Consistency | PASS (2 observations) |
| Success Criteria | PASS |

## Weryfikacja kryteriów sukcesu

- ✅ `npm run lint` — czysty
- ✅ `npm run build` — Complete! (typecheck + 3 entrypointy)
- ✅ `npm test` — 168/168 zielone (28 plików), również po naniesieniu poprawek
- ✅ `npm audit` (sonner) — czysty; 12 high-sev dotyczy wyłącznie narzędziówki dev (esbuild/vite/astro/wrangler/vitest), nie wprowadzone tą zmianą
- ✅ `npm run test:integration` — 34/34 zielone (8 plików, lokalny Supabase) — uruchomione po triażu
- ✅ Weryfikacja ręczna — wszystkie pozycje `[x]`; commit b44c144 potwierdza ręczne odhaczenie przez użytkownika

## Findings

### F1 — Wyścig podwójnego kliknięcia akcji inline (przedwczesne odgaszenie)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Dimension**: Safety & Quality (Niezawodność)
- **Location**: src/components/items/PendingItemsView.tsx:73-98, 207-223
- **Detail**: Przyciski inline bramkowane wyłącznie globalnym `disabled={pending}`. `pending` z hooka staje się `true` dopiero po re-renderze, więc dwa szybkie kliknięcia mogą wystartować dwie równoległe `execute()`; zakończenie pierwszej (`setInFlightIds(new Set())`) odgasza elementy wciąż w locie z drugiej → miganie. Skutek serwerowy bezpieczny (guard `pending` idempotentny, `count: 0`) — defekt UX, nie korupcja danych.
- **Fix**: Synchroniczny zamek re-entry przez `useRef` (`inFlightRef`) na wejściu `execute()`; blokuje drugie wejście natychmiast, niezależnie od czasu flushu stanu. Zgodne z intencją „jedna akcja naraz" już wyrażoną przez `disabled={pending}`.
- **Decision**: FIXED (Fix now)

### F2 — Dopracowania UX poza literą „Changes Required"

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Dimension**: Scope Discipline
- **Location**: commity f967486, fa1bd3e
- **Detail**: Po fazach doszły: akcje inline per-item, zajawki (`line-clamp-2`), bramka „niezapisane zmiany" w modalu, sort recency (`updated_at DESC` zamiast planowanego `order('created_at')`). Obaj agenci niezależnie ocenili je jako mieszczące się w intencji planu — żadna bariera „Czego NIE robimy" nie naruszona. Nieszkodliwe, nie scope creep; plan nie odzwierciedlał tych dodatków.
- **Fix**: Addendum implementacyjny dopisany do plan.md (sekcja „Addendum implementacyjny (2026-06-14)") dokumentujący dodatki Fazy 3/4.
- **Decision**: FIXED (Fix now)

### F3 — Nieaktualne komentarze (sprzed rewizji + do usuniętego pliku)

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Dimension**: Pattern Consistency
- **Location**: src/components/items/selection.test.ts:66-78; src/components/items/ItemList.astro:3
- **Detail**: (a) Komentarze/nazwy w `selection.test.ts` opisywały `removeByIds` jako „optimistic + rollback / snapshot" — model sprzed zatwierdzonej rewizji PESSIMISTIC (2026-06-14). (b) `ItemList.astro:3` odwoływał się do `PendingItemsList.astro`, usuniętego w Fazie 3 (commit 0558328).
- **Fix**: Przeformułowano opis testu na model PESSIMISTIC (testowana właściwość = niemutowanie wejścia przez czystą funkcję) i usunięto martwe odwołanie w `ItemList.astro:3`.
- **Decision**: FIXED (Fix now)

### F4 — Drobne odejścia od konwencji (cn() + kształt błędu API)

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Dimension**: Pattern Consistency
- **Location**: src/components/items/PendingItemsView.tsx:186,194; src/pages/api/items/bulk.ts; src/pages/api/items/[id].ts; (MainFilterNav.astro:25 — bez zmian)
- **Detail**: (a) Hard rule wymaga `cn()` dla klas warunkowych/scalanych. `PendingItemsView.tsx` budował klasy template literalem (realne naruszenie w TSX). `MainFilterNav.astro` używa `class:list` — natywnej dyrektywy Astro (odpowiednik clsx, precedens `Banner.astro`), więc NIE jest ręczną konkatenacją i jest zgodny duchem reguły. (b) Endpointy zwracały `{ ok:false, code }`, gdy sąsiednie `classify.ts`/`byok-key.ts` zwracają `{ ok:false, error: "komunikat PL" }`; `classify.ts:165` już pokazywał superset `{ code, error }`.
- **Fix**: (a) `PendingItemsView.tsx:186,194` → `cn()` (import `@/lib/utils`); `MainFilterNav.astro` pozostawiony jako idiomatyczny `class:list` (konwersja rozjechałaby go z `Banner.astro`). (b) Dołożono komunikat `error` PL obok `code` w `bulk.ts` i `[id].ts` (superset wstecznie zgodny — hooki czytają tylko `res.status`/`data.ok`). Testy endpointów czytają `.code`, więc addytywne `error` ich nie łamie.
- **Decision**: FIXED + ACCEPTED-AS-RULE (Ujednolicony kształt odpowiedzi błędu endpointów API: `{ ok:false, code, error }` — zapisana w context/foundation/lessons.md)

## Triage summary

- **Fixed**: F1 (re-entry lock), F2 (plan addendum), F3 (komentarze), F4 (cn() + superset błędu) — 4
- **Rule**: F4 (zapisana lekcja + poprawka) — 1
- **Skipped**: — 0
- **Accepted**: — 0

Wszystkie poprawki naniesione do drzewa roboczego. Po przeglądzie zielone: `npm run lint`, `npm test` (168/168), `npm run build`, `npm run test:integration` (34/34).
