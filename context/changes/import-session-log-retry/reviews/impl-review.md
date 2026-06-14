<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Dziennik sesji importu + ponowienie (S-08)

- **Plan**: `context/changes/import-session-log-retry/plan.md`
- **Zakres**: Fazy 1–4 (pełny plan) — RE-REVIEW po refaktorze front (`081227a`) + fix dev (`c5f5788`)
- **Data**: 2026-06-14
- **Werdykt**: ZAAKCEPTOWANY
- **Ustalenia**: 0 krytycznych, 0 ostrzeżeń, 4 obserwacje

> **Re-review.** Superseduje pierwszy przegląd z 2026-06-14 (ZAAKCEPTOWANO, ustalenia F1 `res.ok` / F2 `itemNoun` / F3 komentarz domknięte w `77de3e5`). Pierwszy przegląd obejmował architekturę sprzed `081227a` (`SessionsList.astro` + `RetrySessionButton.tsx`); ten pokrywa obecną wyspę React (`SessionsList.tsx` + `SessionRow.tsx`) oraz fix dev w `astro.config.mjs`. Poprzednia treść w historii git.

## Metoda

Dwóch niezależnych pod-agentów (general-purpose): (1) wykrywanie odchyleń plan↔kod, (2) bezpieczeństwo/jakość/wzorce. Zakres git: branch `feature/import-session-log-retry` vs `main`. Kryteria automatyczne wykonane (HEAD po F4): lint ✓ (exit 0), test 156/156 ✓ (26 plików), build ✓ (Complete!).

Inwarianty potwierdzone niezależnie: brak wycieku klucza BYOK / wsadu do logów i odpowiedzi (FR-026); atomowy `reopenSession` (warunkowy `UPDATE … WHERE status='failed'` — guard TOCTOU odporny na podwójny retry); `missing_key` przed `runClassification` (brak klasyfikacji przy usuniętym kluczu); `classifyResultToResponse` jedyne miejsce mapowania HTTP (brak duplikacji w retry vs classify); RLS izolacja per-user (404 dla cudzej sesji); `clearTimeout` w `finally`; `res.ok` przed gałęzieniem statusu w hooku (422 → error). Żadna granica „Czego NIE robimy" nienaruszona.

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | PASS |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | PASS |

## Ustalenia

### F1 — Drift architektury front vs plan (udokumentowany, celowy)

- **Ważność**: 🔍 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąska
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: src/components/import-sessions/SessionsList.tsx, SessionRow.tsx
- **Szczegóły**: Plan (Fazy 3/4) zakładał `SessionsList.astro` + `RetrySessionButton.tsx`; stan faktyczny to wyspa React `SessionsList.tsx` + `SessionRow.tsx` z hookiem (refaktor `081227a`, in-place update). Intencja planu w pełni zrealizowana — świadoma zmiana dla wymogu „brak migotania + in-place".
- **Poprawka**: Dopisać aneks architektury w `plan.md` (Fazy 3/4), by przyszłe przeglądy nie flagowały tego ponownie.
- **Decyzja**: FIXED — aneks „## Aneks implementacyjny (impl-review 2026-06-14)" dodany do `plan.md`.

### F2 — failSession bez `WHERE status` w ścieżce błędu loadSessionInput

- **Ważność**: 🔍 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąska
- **Wymiar**: Bezpieczeństwo i jakość (niezawodność)
- **Lokalizacja**: src/pages/api/import-sessions/retry.ts:101-112
- **Szczegóły**: Gdy `loadSessionInput` pada (encoding/storage/empty_file), `failSession` używa bezwarunkowego `.eq("id")`. Wąskie okno wyścigu z równoległym retry; model „ostatni wygrywa", brak utraty danych / podwójnej klasyfikacji (atomowy `reopenSession` chroni właściwy zapis).
- **Poprawka**: Brak poprawki. Naiwny `.eq("status","processing")` jest BŁĘDNY — w tej ścieżce sesja jest jeszcze `failed`, a `failSession` jest współdzielony z ingestem (gdzie sesja jest `processing`); dowolny warunek statusu rozjeżdża oba konteksty. Poprawny fix wymagałby osobnego wariantu — koszt > zysk.
- **Decyzja**: ZAAKCEPTOWANE jako known-limitation (okno nieszkodliwe; brak utraty danych).

### F3 — ssr.noExternal działa też w buildzie prod

- **Ważność**: 🔍 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąska
- **Wymiar**: Dyscyplina zakresu / Architektura
- **Lokalizacja**: astro.config.mjs:29
- **Szczegóły**: Przyczyna blokera była dev-only (optimizeDeps), ale `ssr.noExternal` działa też w Rollupie — bundluje React do workera SSR zamiast traktować jako external. Na Cloudflare Workers neutralne/korzystne (workerd nie ma `node_modules` w runtime), bez ryzyka regresji.
- **Poprawka**: Opcjonalnie zawęzić noExternal do dev (`command === "serve"`). Mikrooptymalizacja.
- **Decyzja**: POMINIĘTE — zostawione globalnie (neutralne/korzystne na Workers; zawężanie dokłada warunkowy config bez zysku).

### F4 — Lokalny helper `json()` zduplikowany w trzech plikach

- **Ważność**: 🔍 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąska
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: classify.ts:35, retry.ts:24, classify-core.ts:91
- **Szczegóły**: Identyczny helper `json()` w trzech plikach — drobna duplikacja niespójna z filozofią współdzielonych helperów.
- **Poprawka**: Wynieść do `src/lib/http.ts` (export); trzy pliki importują.
- **Decyzja**: FIXED — `src/lib/http.ts` utworzony; classify.ts / retry.ts / classify-core.ts importują współdzielony `json`. Bramki zielone po zmianie (lint ✓, 156/156 ✓, build ✓).

## Podsumowanie triażu

- **Naprawiono**: F1 (aneks w planie), F4 (`json` → `src/lib/http.ts`) — bramki zielone po zmianie.
- **Zaakceptowano**: F2 (known-limitation — okno nieszkodliwe, naiwny fix błędny).
- **Pominięto**: F3 (noExternal globalnie — neutralne/korzystne na Workers).
- **Werdykt**: ZAAKCEPTOWANY (bez zmian — wszystkie ustalenia LOW/obserwacje).
