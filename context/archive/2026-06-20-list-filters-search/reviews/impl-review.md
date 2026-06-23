<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Filtry dodatkowe list — sortowanie, wyszukiwanie, podfiltr stanu (S-09)

- **Plan**: context/changes/list-filters-search/plan.md
- **Zakres**: Pełny plan — Fazy 1–5 z 5
- **Data**: 2026-06-23
- **Werdykt**: ZAAKCEPTOWANY
- **Ustalenia**: 0 krytycznych, 1 ostrzeżenie, 1 obserwacja

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | WARNING |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | PASS |

## Kryteria sukcesu — weryfikacja automatyczna

- `npm run lint` — PASS (tylko nieszkodliwe ostrzeżenia parsera `astro-eslint-parser` o `projectService`).
- `npm test` — PASS (342 testy w 42 plikach).
- `npm run build` — PASS (ostrzeżenie `@astrojs/sitemap` o braku `site` jest preexisting, niezwiązane z S-09).

Kryteria ręczne (Faza 1–5) odhaczone w `## Progress` z przypisanymi SHA (645a0b4 → cee0038 → 32ecad5 → 8f1ccf8).

## Kontekst pozytywny (bez akcji)

- Naprawione ustalenia przeglądu planu **F1–F6 obecne i poprawne**: `applyOptimistic` (zero `setItems` w wyspach), `pushState`/`replaceState`/`popstate`, brak osobnego zod + manualny guard `view`, neutralizacja delimiterów PostgREST, `AbortController` z połykaniem `AbortError`, łańcuch tie-break `created_at DESC → id ASC`.
- Martwy kod (`applyTypeFilter`, `pinnedIds`, `TYPE_FILTER_COOKIE`, zapis cookie `tl_typefilter`) całkowicie usunięty — pozostały tylko wzmianki w komentarzach historycznych.
- Dwa EXTRA (`ListFilterBar.tsx` jako ekstrakcja DRY paska filtrów, `settledCriteria` w hooku jako anty-migotanie) ocenione jako uzasadnione, w duchu planu — nie scope creep.
- Walidacja `view`/`type`/`sort`/`dir`/`opstatus` allowlistowana, `q` clampowane do 200; klient RLS-scoped (anon + cookies, nie service-role). GET egzekwuje `context.locals.user` przed zapytaniem. Kształt błędu `{ ok:false, code, error }` przez `json()` — zgodny z twardą regułą projektu.

## Ustalenia

### F1 — Wyszukiwanie nie literalizuje `*` (PostgREST aliasuje `*`→`%` dla ilike)

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: src/lib/services/items.ts:34-41 (`buildSearchOrFilter`)
- **Szczegóły**: Escapowanie neutralizuje wildcardy LIKE (`%` `_`) i delimitery składni `.or()` (`, . ( )` przez owinięcie w cudzysłowy), ale NIE `*`. PostgREST twardo mapuje `*`→`%` dla `ilike` po zdjęciu cudzysłowów i bez escape'a. To NIE jest wstrzyknięcie SQL: wartość jest parametryzowana, a RLS + `eq("user_id", …)` izolują per-user; promień rażenia = wyłącznie semantyka dopasowania we własnych danych. Komentarz w pliku błędnie sugerował, że wszystkie wildcardy są pokryte.
- **Weryfikacja empiryczna (2026-06-23, lokalny stack PostgREST, 218 itemów)**: wzorzec `%Zadanie*A%` (wejście `Zadanie*A`) zwrócił 16 trafień — tyle samo co `%Zadanie A%` — czyli `*` dopasował spację (wildcard); `%Zadanie\*A%` (backslash) wciąż 16 (backslash nie literalizuje); `%*%` (wejście `*`) zwróciło wszystkie 218 (match-all). Operator regex `imatch` także odpadł — escape `\.` przeszedł mangling quotingu PostgREST (dopasowanie any-char zamiast literału). Pełna literalność wymagałaby RPC, który plan świadomie wyklucza (`supabase-js bez RPC`, `target_scale: small`).
- **Decyzja**: FIXED — poprawiono mylący komentarz w `items.ts`, by uczciwie dokumentował, że `*` jest wildcardem PostgREST (nie literałem), z odniesieniem do empirycznej weryfikacji i wskazaniem RPC jako jedynej drogi do pełnej literalności (poza zakresem). Zachowanie kodu bez zmian (świadomie zaakceptowane jako nieszkodliwy edge case).

### F2 — `loading` z hooka eksponowany, ale nigdzie nierenderowany

- **Ważność**: 🔭 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąska
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: src/components/items/ListFilterBar.tsx:25-26
- **Szczegóły**: Plan §5.4 przewidywał „wskaźnik ładowania podczas fetchu (stan `loading` z hooka) — krótki, nieblokujący". Hook eksponuje `loading` (useItemList.ts:204), ale żadna wyspa go nie renderuje; ListFilterBar (linie 25-26) dokumentuje świadomą rezygnację: „dane małe/lokalne, migający tekst szkodził; swap listy jest płynny".
- **Decyzja**: SKIPPED — zaakceptowano udokumentowaną decyzję UX. Bez zmian.
