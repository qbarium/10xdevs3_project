---
date: 2026-06-28T22:09:12+0200
researcher: Claude (Opus 4.8)
git_commit: d6efe851dc76dab6cbcac2c320728847596d3193
branch: main
repository: qbarium/10xdevs3_project
topic: "S-11 session-log-filter-ux — reaktywne filtry dziennika sesji importu (parytet UX z S-09) + paginacja + deep-link ?session="
tags: [research, codebase, import-sessions, filters, pagination, deep-link, dup-react-ssr, s-09-reuse]
status: complete
last_updated: 2026-06-28
last_updated_by: Claude (Opus 4.8)
---

# Research: S-11 session-log-filter-ux

**Date**: 2026-06-28T22:09:12+0200
**Researcher**: Claude (Opus 4.8)
**Git Commit**: d6efe851dc76dab6cbcac2c320728847596d3193
**Branch**: main
**Repository**: qbarium/10xdevs3_project

## Research Question

Ugruntować w aktualnym kodzie wycinek S-11 (`session-log-filter-ux`): uczynić filtry/sort dziennika sesji importu (`/import-sessions`) **reaktywnymi** (parytet UX z S-09 — bez przycisku „Zastosuj", kryteria w adresie strony, spójne dropdowny pod motyw, rozróżnienie „pusto bo filtr" vs „brak sesji"), dodać **paginację** listy sesji (`getImportSessions` ciągnie dziś wszystko bez `LIMIT`) oraz **deep-link `?session=`** do panelu master-detail z S-10. Dodatkowo: zbadać ryzyko dup-React SSR przy dokładaniu hooka filtrów na wyspę `SessionsList`. Pełne ugruntowanie + mapa reużycia infrastruktury S-09.

## Summary

Stan obecny `/import-sessions` to **nie-reaktywny** model z S-08: `<form method="get">` + przycisk „Zastosuj" + dwa **natywne `<select>`** (sort/status), a sort/filtr liczy SSR strony — dokładnie ten model, który S-09 zastąpił na listach głównych. S-11 ma przenieść tu wzorzec S-09 (reaktywny, URL-synced).

Trzy kluczowe ustalenia dla planu:

1. **Mapa reużycia jest asymetryczna.** Tylko jeden artefakt S-09 wchodzi 1:1 (`src/components/ui/select.tsx` — motywowany Select, cel podmiany natywnych `<select>`, **bez nowej zależności npm**). Mechanizm `useItemList` i wzorzec endpointu `GET /api/items` są **generalizowalne** (ale zakodowane pod `/api/items` + typ `Item` + pola `ListCriteria`). Reszta to **analogi sesyjne** budowane przez skopiowanie *wzorca* (tolerancyjny parser-jedyny-walidator + idiom `hasActiveFilters`), nie kodu. `SearchBox` **odpada** — sesje nie mają wyszukiwania tekstowego.

2. **Endpoint dedykowany `GET /api/import-sessions` to ścieżka niskiego ryzyka** (rozstrzyga otwarte pytanie roadmapy `roadmap.md:219`). Serwis `getImportSessions(supabase, userId, { sort, status })` **już istnieje i już zwraca właściwy DTO** — endpoint byłby cienką nakładką strukturalnie identyczną z `GET /api/items`. **Serwis nie wymaga zmian** dla samej reaktywności. Jedyna nowa robota, której wzorzec items nie daje za darmo: **mapowanie DTO `SessionRowData`** (skrócenie preview, format daty, `live_item_count`) liczone dziś server-side w `.astro` musi się przenieść do endpointu albo do wyspy, gdy fetch idzie po stronie klienta.

3. **Paginacja + deep-link muszą być projektowane razem i dotykają schematu.** Tabela `import_sessions` ma indeks **tylko `(user_id)`** — brak `(user_id, created_at)`; sort po `created_at` nie ma wsparcia indeksu ani tie-breaka (`created_at` nie jest unikalny). Kursor `(created_at DESC, id DESC)` to odporny wzorzec dla append-only logu, ale wymaga **migracji indeksu** — to jedyna potencjalna zmiana DB w S-11. Deep-link do sesji **spoza** załadowanej strony wymaga świadomego rozwiązania (kursor „załaduj stronę zawierającą tę sesję").

**KOREKTA (2026-06-28, na podstawie obserwacji użytkownika):** ryzyko dup-React SSR jest **realne i NIEROZWIĄZANE** — błąd nadal występuje w `npm run dev` mimo deklaracji „naprawione" z S-08/S-10 (kryterium `reopt_fired=0` okazało się niewystarczające). Jest to jednak błąd **wyłącznie trybu deweloperskiego**: build produkcyjny (Rollup) go nie ma, a strona `/import-sessions` działa na produkcji (S-10 wdrożony i zarchiwizowany 2026-06-28). Naprawa **wynesiona poza S-11 do osobnego punktu S-12** (`follow-ups/dup-react-ssr-dev-only.md`). Wpływ na S-11: weryfikacja ręczna tej strony prowadzona na `npm run preview` (build produkcyjny, bez błędu), nie na `npm run dev`; dołożenie hooka filtrów może nasilić objaw w dev — oczekiwane, nie regresja S-11.

## Detailed Findings

### 1. Obecna powierzchnia `/import-sessions` (nie-reaktywna)

**Strona SSR** — `src/pages/import-sessions.astro`:
- Czyta `sort`/`status` z `Astro.url.searchParams` (`:18-25`); `status` walidowany whitelistą `STATUS_VALUES` (`:21`) z fallbackiem `undefined`; `sort` domyślnie `"created_desc"`.
- Query SSR: `getImportSessions(supabase, user.id, { sort, status })` (`:33`).
- **Mapuje wynik na slim DTO `SessionRowData[]` server-side** (`:39-57`) — `rowPreview` (skrócenie `raw_input`), `dateLabel` (format daty), `live_item_count`. *To jest ten kawałek, którego wzorzec items nie pokrywa.*
- Renderuje wyspę: `<ImportSessionsView client:load rows={rows} />` (`:102`).
- `selectClass` (`:60-61`) — wspólny styl natywnych selectów (white/purple, zależy od globalnego `html { color-scheme: dark }`).

**Formularz filtra (nie-reaktywny)** — `import-sessions.astro:73-100`:
- `<form method="get">` (`:73`), `<select name="sort">` (created_desc/created_asc, `:76-79`), `<select name="status">` (pusty „Wszystkie" + 4 statusy przez `importSessionStatusLabel`, `:83-92`), przycisk **„Zastosuj"** (`:94-99`). Zmiana wymaga submitu — **zero reaktywności**.

**Łańcuch wyspy React** (`src/components/import-sessions/`):
- `ImportSessionsView.tsx` — master-detail; `useState<string|null>` dla `selectedSessionId` (`:20`); renderuje `SessionsList` (`:31-37`) + `SessionItemsPanel` z `sessionId={selectedSessionId}` (`:41`).
- `SessionsList.tsx` — props `rows`/`onSelect`/`selectedId` (`:15-23`); **empty-state** `if (rows.length === 0)` → „Brak sesji importu. Zaimportuj wsad…" (`:24-32`) — **NIE rozróżnia „pusto bo filtr" vs „brak sesji"** (brak propu o aktywnych filtrach); nawigacja klawiaturą ARIA listbox + roving tabindex (`:37-73`).
- `SessionRow.tsx` — `useSessionRetry()` (`:57`); grid: typ pliku / data / liczba itemów / badge statusu; failed → przycisk „Spróbuj ponownie" (`:117-146`).
- `SessionItemsPanel.tsx` (S-10) — `useSessionItems(sessionId)` (`:22`) → `GET /api/import-sessions/[id]/items`.

**Selekcja sesji — efemeryczna, brak deep-linku:** `selectedSessionId` to **lokalny stan React** (`ImportSessionsView.tsx:20`), gubiony przy reloadzie. **`?session=` nie istnieje dziś.**

**Endpointy** (`src/pages/api/import-sessions/`): istnieje `[id]/items.ts` (S-10, walidacja UUID `z.uuid()`, `getSessionItems`, `{ ok, items }`, wszystkie stany akceptacji, sort `created_at ASC` stały) i `retry.ts` (S-08). **Brak list-endpointu `GET /api/import-sessions`.**

### 2. Mapa reużycia infrastruktury S-09

| Artefakt S-09 | Werdykt | Dowód (file:line) | Powód |
|---|---|---|---|
| `src/components/ui/select.tsx` (motywowany shadcn/radix Select) | **Reuse 1:1** | radix-ui + lucide, zero coupling (`:1-7,146-157`); `SortControl` już go używa | Dokładny cel podmiany natywnego `<select>`. **Bez nowej zależności npm.** |
| `src/components/hooks/useItemList.ts` (debounce, AbortController latest-wins, push/replaceState, popstate, applyOptimistic) | **Generalizuj/parametryzuj** | hardcoded `/api/items` (`:38`), typ `Item` (`:19,79-91`), pola `ListCriteria` w `isSearchOnlyChange` (`:68-77`) | Mechanizm idealny, ale endpoint/typ/diff-pola sprzężone z items. Sesje nie mają `q` → wariant może odrzucić gałąź debounce. |
| `src/lib/services/list-criteria.ts` (`ListCriteria`, `parseListCriteria`, `criteriaToQuery`, `hasActiveFilters`) | **Buduj analog sesyjny** (skopiuj design) | pola `view/type/sort/dir/q/opstatus` (`:36-43`); `SortField=created/updated/title` (`:27`) — całość items-specific | Sesje potrzebują tylko `{ sort: 'created_desc'|'created_asc', status?: ImportSessionStatus }`. **Idiom `hasActiveFilters` via `criteriaToQuery` (`:123-125`) i wzorzec tolerancyjny-parser-jedyny-walidator (`:7-10`) to wzorce do skopiowania** — wprost dają rozróżnienie „pusto bo filtr". |
| `src/components/items/SortControl.tsx` | **Generalizuj/forkuj** | importuje `SortField`/`SortDir` (`:3`), 3 pola sortu items (`:12-16`) | Wzorzec (Select pola + Button kierunku) idealny; sesje mają jedną oś sortu (data asc/desc) → prostszy 2-opcyjny Select, adaptacja nie drop-in. |
| `src/components/items/OperationalSubFilter.tsx` (pill row „Wszystkie + N") | **Wzorzec dla statusu** | prezentacyjny single-select pill row, keyed off label fn (`:21-49`) | Najbliższy strukturalnie match — pasek statusu sesji może skopiować 1:1, podmieniając `importSessionStatusLabel` (`labels.ts:82-84`) + 4 wartości `ImportSessionStatus`. |
| `src/components/items/ListFilterBar.tsx` | **Buduj analog sesyjny** | hardwired do `ListCriteria` + dzieci TypeFilter/SortControl/SearchBox/OperationalSubFilter (`:1-8,32-61`) | Layout + banner-błędu-z-retry (`:65-81`) reużywalny; pasek sesji potrzebuje tylko sort + status. |
| `GET /api/items` (`src/pages/api/items/index.ts`) | **Generalizuj wzorzec → `GET /api/import-sessions`** | auth guard (`:31-32`), ręczna walidacja skalarnego `view` (`:35-37`), tolerancyjny `parseListCriteria` (`:43-44`), `{ ok, items }` (`:46`), `json()` + generyczne błędy (`:47-50`) | Czysty szablon. Endpoint sesji: auth-guard → walidacja `sort`/`status` (whitelist już w `import-sessions.astro:18-25`) → **istniejący `getImportSessions`** → `{ ok, sessions }`. **Serwis bez zmian.** |
| `src/components/items/SearchBox.tsx` | **Pomiń** | wyszukiwanie tekstowe (`:16-44`) | Sesje nie mają wyszukiwania (`import-session.ts:66-69` = tylko sort+status). |
| `src/components/items/TypeFilter.tsx` | **Nie dotyczy** | filtr typu itemów | Brak odpowiednika w domenie sesji. |

### 3. Warstwa danych + paginacja

**Serwis** `getImportSessions` — `src/lib/services/import-session.ts:82-110`:
- supabase-js builder (nie RPC): `.from("import_sessions").select(...).eq("user_id", userId)`, opcjonalny `.eq("status", opts.status)` (`:94`), `.order("created_at", { ascending })` (`:95`).
- **Brak `LIMIT`/`range`/kursora** — docstring `:80` to potwierdza („MVP single-user o małym wolumenie — bez paginacji").
- Sort **tylko po `created_at`, bez tie-breaka**.
- Kolumny: `id, user_id, status, raw_input, item_count, error_message, created_at, updated_at` + LEFT JOIN `import_files(file_name, file_mime)` + agregat `items(count)` (live count) (`:90-92`).
- Opcje `GetImportSessionsOptions` (`:66-69`): tylko `sort` + `status`.
- Zwraca `ImportSessionWithFile[]`.

**Schemat** `import_sessions` — migracja `supabase/migrations/20260610052532_classification_schema.sql:30-39` (S-02; żadna późniejsza migracja nie zmienia jej kolumn/indeksów):
- Kolumny: `id uuid PK`, `user_id uuid NOT NULL → auth.users on delete cascade`, `status import_session_status NOT NULL default 'processing'`, `raw_input text`, `item_count integer`, `error_message text`, `created_at timestamptz NOT NULL default now()`, `updated_at timestamptz NOT NULL default now()`.
- **Enum `import_session_status`** (`:23-24`), dokładne wartości: `'processing'`, `'completed_with_items'`, `'completed_no_items'`, `'failed'`.
- **Indeks: tylko `import_sessions_user_idx` na `(user_id)`** (`:62-69`) — **brak `(user_id, created_at)`**; sort po `created_at` wymaga kroku sortowania po skanie po userze.
- RLS włączone, 4 granularne polityki per-operacja dla `authenticated` (`(select auth.uid()) = user_id`).

**Typy** — `src/types.ts`: `ImportSessionStatus` (`:82`), `ImportSession` (`:85-94`), `ImportSessionWithFile extends ImportSession` z `file_name`/`file_mime`/`live_item_count` (`:115-124`) — DTO zwracany przez serwis.

**Feasibility paginacji:**
- Klucz porządku: `created_at` (timestamptz, `default now()`), **bez wspierającego indeksu kompozytowego**.
- **Tie-break gotcha:** `created_at` nie jest unikalny (burst/retry → ten sam timestamp) → kursor „load older" wymaga **złożonego kursora `(created_at, id)`**; obecny single-key order (`:95`) musi dostać tie-break przed keyset paginacją (inaczej pominięte/zdublowane wiersze na granicy strony).
- **Append-only, rośnie bez ograniczeń** (`roadmap.md:221`) — motywacja paginacji.
- **Kursor `(created_at DESC, id DESC)` vs offset/`.range()`:** kursor to odporny wybór dla append-only newest-first (stabilny przy insertach na głowie, brak kosztu deep-offset). Offset prostszy do wpięcia, ale dryfuje przy insertach na głowie i degraduje na głębokich stronach. Naturalny dodatek: indeks `(user_id, created_at, id)` (**migracja — jedyna potencjalna zmiana DB w S-11**).
- **Deep-link ↔ paginacja sprzężone** (`roadmap.md:221`): deep-link do sesji spoza bieżącej strony wymaga świadomego rozwiązania (kursor „załaduj stronę zawierającą tę sesję").

### 4. Ryzyko dup-React SSR przy dokładaniu hooka filtrów

**Obecna obrona** — `astro.config.mjs` (4 warstwy):
- `vite.resolve.dedupe: ["react", "react-dom"]` (`:16-18`).
- `vite.ssr.noExternal: ["react", "react-dom"]` (`:38`).
- `vite.optimizeDeps.include: ["astro/env/runtime"]` (`:25-27`) — pre-bundling na kliencie.
- `vite.ssr.optimizeDeps.include: ["astro/env/runtime"]` (`:41-43`) — pre-bundling na SSR.
- Komentarz `:19-24`: realny fix to pre-bundling `astro/env/runtime` OD RAZU — Vite odkrywał go *późno w sesji* i odpalał re-optymalizację, rozjeżdżając `?v=` Reacta (core vs `react-dom/server`).

**Hooki na wyspie dziś:** 4 (`useState` w `ImportSessionsView:20` + 3× `useState` w `useSessionRetry:76-78`, wołany w `SessionRow:57`). S-11 doda hook filtrów (do `SessionsList`/`ImportSessionsView`) → 5+.

**Fix S-10** — `context/archive/2026-06-24-session-items-detail/follow-ups/review-fixes.md:7-49`:
- Crash odtworzony **na żywo na zimnym starcie** („Invalid hook call / more than one copy of React") — dwie generacje `?v=` w jednym renderze SSR.
- Stary `dedupe + ssr.noExternal` był **niepełny** — nie zapobiegał re-optymalizacji mid-session.
- **Kryterium weryfikacji: `reopt_fired=0` na zimnym starcie** (baseline2=1 przed fixem; fix1/2/3=0) — NIE „pojedynczy udany render".
- **Znana częściowa wada** (`lessons.md:68-73`): `react-dom/server` wciąż własny `?v=` chunk w `deps_ssr` — **nieszkodliwe bez re-optymalizacji**; jeśli pojawi się nowa późno-odkrywana zależność i re-optym wróci → dodać ją do `optimizeDeps.include`.

**Wniosek dla S-11:** dokładenie hooka filtrów jest bezpieczne **jeśli** (a) logika filtrów nie importuje nowej późno-odkrywanej zależności, (b) weryfikacja na zimnym starcie (odstaw `.vite`/`.astro`, **BEZ `--force`**) potwierdza brak logu „optimized dependencies changed. reloading" (`reopt_fired=0`). Zielony build ani pojedynczy render NIE są dowodem.

## Code References

- `src/pages/import-sessions.astro:18-25` — odczyt sort/status z `searchParams` (SSR, whitelist)
- `src/pages/import-sessions.astro:39-57` — mapowanie DTO `SessionRowData` server-side (preview/data/live_item_count) — *do przeniesienia przy fetchu klienckim*
- `src/pages/import-sessions.astro:73-100` — nie-reaktywny `<form method="get">` + „Zastosuj" + natywne `<select>`
- `src/pages/import-sessions.astro:102` — `<ImportSessionsView client:load rows={rows} />`
- `src/components/import-sessions/ImportSessionsView.tsx:20` — `selectedSessionId` lokalny stan (brak `?session=`)
- `src/components/import-sessions/SessionsList.tsx:24-32` — empty-state bez rozróżnienia filtr/brak
- `src/components/import-sessions/SessionRow.tsx:57` — `useSessionRetry()`
- `src/components/import-sessions/SessionItemsPanel.tsx:22` — `useSessionItems(sessionId)` (S-10)
- `src/pages/api/import-sessions/[id]/items.ts` — jedyny istniejący endpoint sesji (S-10); brak list-endpointu
- `src/lib/services/import-session.ts:80-110` — `getImportSessions`, bez paginacji, sort created_at bez tie-break
- `src/lib/services/import-session.ts:66-69` — `GetImportSessionsOptions` (sort + status)
- `supabase/migrations/20260610052532_classification_schema.sql:23-24` — enum `import_session_status` (4 wartości)
- `supabase/migrations/20260610052532_classification_schema.sql:30-39,62-69` — tabela + indeks tylko `(user_id)`
- `src/types.ts:82-124` — `ImportSessionStatus` / `ImportSession` / `ImportSessionWithFile`
- `src/components/ui/select.tsx:1-7,146-157` — motywowany Select (reuse 1:1)
- `src/components/hooks/useItemList.ts:36-91` — mechanizm reaktywny (generalizowalny)
- `src/lib/services/list-criteria.ts:7-10,36-43,123-125` — wzorzec kryteriów + `hasActiveFilters`
- `src/components/items/OperationalSubFilter.tsx:21-49` — wzorzec pill-row dla statusu
- `src/pages/api/items/index.ts:31-50` — szablon endpointu `GET`
- `astro.config.mjs:16-44` — 4-warstwowa obrona dup-React SSR
- `context/archive/2026-06-24-session-items-detail/follow-ups/review-fixes.md:7-49` — fix + kryterium `reopt_fired=0`

## Architecture Insights

- **Wzorzec „tolerancyjny-parser-jedyny-walidator" (S-09)** — `parseListCriteria` jest jedynym walidatorem kryteriów (SSR + klient + endpoint), tolerancyjny (fallback do domyślnych, nie rzuca). To samo źródło prawdy daje parytet render SSR ↔ pierwszy stan wyspy (brak przeskoku po hydracji) ORAZ rozróżnienie „pusto bo filtr" przez `hasActiveFilters`. S-11 powinien zbudować analog sesyjny tej samej konstrukcji, nie wymyślać własnej.
- **Asymetria DTO (S-11 trudniejsze niż S-09 w jednym punkcie):** strona buduje `SessionRowData` server-side (preview, data, live_item_count). Gdy fetch idzie po stronie klienta, to mapowanie musi się przenieść do endpointu (preferowane — utrzymuje SSR-first parity) albo do wyspy. Items tego nie miały — tam endpoint zwracał surowe `Item[]`.
- **Re-fetch na zmianę kryteriów, optimistic na mutację (S-09):** zmiana filtra = re-fetch (autorytatywna lista, czyści zaznaczenie); mutacje (tu: retry) nie wymuszają re-fetchu. Ten sam podział pasuje do sesji.
- **Kryterium „naprawione" dla dup-React = `reopt_fired=0` na zimnym starcie**, nie zielony build/pojedynczy render. To twarda lekcja, którą plan musi zakodować w kryteriach weryfikacji ręcznej fazy dotykającej wyspy.

## Historical Context (from prior changes)

- `context/archive/2026-06-20-list-filters-search/plan.md` — S-09: pełny wzorzec reaktywnych filtrów (serwis criteria-driven → endpoint `GET /api/items` → hook `useItemList` + URL → migracja filtra typu → kontrolki). Bezpośredni szablon dla S-11.
- `context/archive/2026-06-13-import-session-log-retry/plan.md:30,293` — S-08: pełna warstwa filtrów świadomie odłożona do S-09; dziennik dostał tylko wariant „sort po dacie + filtr status" jako `<form method="get">` (to S-11 zastępuje).
- `context/archive/2026-06-24-session-items-detail/research.md:40,43,127` + `plan-brief.md:39` — S-10: rekomendacja `?session=<uuid>` reużywająca mechanizmu query-param; deep-link + paginacja **świadomie odłożone z S-10 do S-11** (`roadmap.md:221`). S-10 ustalił precedens: sort po niezmiennym `created_at` z jawnym tie-break `id` + keyowanie wierszy React po `id` (anti-reorder/flicker) — wprost reużywalne dla listy sesji.
- `context/foundation/lessons.md:54-73` — dwie lekcje dup-React SSR (dev-only): odtwórz prawdziwy tryb awarii; „naprawione" = brak re-optymalizacji mid-session na zimnym starcie.

## Related Research

- `context/archive/2026-06-24-session-items-detail/research.md` — badanie powierzchni dziennika sesji pod S-10 (master-detail).
- `context/archive/2026-06-20-list-filters-search/` — S-09, źródłowy wzorzec reaktywnych filtrów.

## Open Questions

Decyzje pozostawione `/10x-plan` (research dostarcza dowodów, nie rozstrzyga):

1. **Endpoint `GET /api/import-sessions` vs lżejszy fetch strony** — research **rekomenduje endpoint** (serwis gotowy, strukturalna symetria z `GET /api/items`, SSR-first parity). Decyzja użytkownika/planu.
2. **Strategia paginacji** — kursor `(created_at DESC, id DESC)` (odporny, append-only) vs offset/`.range()` (prostszy, dryfuje). Wiąże się z #3.
3. **Migracja indeksu `(user_id, created_at, id)`** — jedyna potencjalna zmiana DB. Czy wchodzi w S-11, czy ordering bez indeksu jest OK na obecnej skali (tie-break i tak wymagany pod keyset).
4. **Gdzie żyje mapowanie DTO `SessionRowData`** po przejściu na fetch kliencki — endpoint (preferowane) vs wyspa.
5. **Deep-link do sesji spoza załadowanej strony** — jak rozwiązać (kursor „załaduj stronę zawierającą sesję" vs prostsze „przewiń do, jeśli na stronie").
6. **UI filtra statusu** — pill-row (wzorzec `OperationalSubFilter`) vs motywowany `Select`. Spójność wizualna z resztą aplikacji jest wymogiem S-11.
7. **Czy debounce w ogóle potrzebny** — sesje nie mają wyszukiwania tekstowego, więc wariant hooka może odrzucić gałąź debounce (wszystkie kontrolki działają natychmiast).
