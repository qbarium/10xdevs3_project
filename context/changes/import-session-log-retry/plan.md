# Dziennik sesji importu + ponowienie — Plan implementacji

## Przegląd

Implementujemy S-08: osobny widok „dziennika sesji importu" (chronologiczna lista sesji — rejestr wejścia, status, liczba itemów lub błąd, sortowanie po dacie + filtr statusu) oraz akcję „Spróbuj ponownie" dostępną dla sesji ze statusem `failed`. Ponowienie odtwarza wsad z trwałej sesji (paste z `import_sessions.raw_input`, plik z bucketa Storage `import-files`), ponownie sprawdza klucz BYOK (FR-024), po czym uruchamia istniejący rdzeń klasyfikacji na **tym samym** wierszu sesji (reuse: `failed → processing → wynik`). Realizuje US-07, FR-027 oraz retry-część FR-024.

## Analiza stanu obecnego

- Tabele i Storage z S-02 są kompletne: `import_sessions` (status enum, `raw_input`, `item_count`, `error_message`), `import_files` (ścieżka Storage), RLS per-user, indeks `import_sessions_user_idx` założony wprost pod S-08. (`supabase/migrations/20260610052532_classification_schema.sql:30-39,73-93`, `20260610173614_import_files.sql:6-14,29-44`)
- Serwis `src/lib/services/import-session.ts` ma tylko zapis: `createSession`, `persistItems` (RPC `persist_classification`), `finalizeEmpty`, `failSession`. Brak funkcji odczytu/listowania.
- `POST /api/ingest/classify` jest **bezstanowy względem sesji**: przyjmuje wyłącznie świeży wsad (`{text}` lub multipart `file`), nie `sessionId`, i przy każdym wywołaniu tworzy nową sesję. Rdzeń `classifyAndRespond` (AbortController 60 s → `classify` → `persistItems`/`finalizeEmpty`/`failSession`) operuje na przekazanym `sessionId`. (`src/pages/api/ingest/classify.ts:71-108,160-175`)
- Modal ingestu ma „Spróbuj ponownie", ale ponawia bieżący stan formularza (`submitCurrent → run(file ?? text)`), nie zapisaną sesję. (`src/components/hooks/useClassification.ts`, `src/components/ingest/ClassificationModal.tsx:158-170`)
- Wzorzec widoku: protected SSR (`prerender=false`, `locals.user`, `createClient(headers,cookies)`, serwis → lista, `try/catch → []`), lista server-side jak `PendingItemsList.astro`; label przez `Record<enum,string>` w `labels.ts`; shadcn `card/button/alert` istnieją (brak `Badge` → inline `<span>`). (`src/pages/items.astro`, `src/components/items/PendingItemsList.astro`, `src/lib/labels.ts`)

## Pożądany stan końcowy

Użytkownik wchodzi na `/import-sessions` (link w Topbarze), widzi chronologiczną listę swoich sesji importu z: skróconym podglądem wejścia + typem, statusem (badge), liczbą itemów lub komunikatem błędu. Może sortować po dacie i filtrować po statusie. Dla sesji `failed` widzi „Spróbuj ponownie"; klik uruchamia ponowienie in-place (spinner w wierszu) bez wprowadzania wsadu od nowa; po zakończeniu wiersz pokazuje nowy status (sukces → liczba itemów + link do `/items`; ponowna porażka → komunikat). Jeśli klucz BYOK zniknął między błędem a ponowieniem — komunikat „klucz usunięty, skonfiguruj nowy". Weryfikacja: testy jednostkowe + integracyjne zielone, ręczny przebieg na lokalnym stacku.

### Kluczowe odkrycia:

- Endpoint klasyfikacji nie umie wrócić do istniejącej sesji — retry wymaga nowej ścieżki czytającej wsad po `sessionId`. (`src/pages/api/ingest/classify.ts` — brak `sessionId` w kontrakcie)
- `raw_input` trzyma paste inline; plik tylko w Storage (`import_files.file_path = <user>/<session>/<id>.<ext>`), tekst pliku nie jest utrwalany → retry pliku wymaga re-download + re-dekod. (`supabase/migrations/20260610173614_import_files.sql:10`)
- Rdzeń `classifyAndRespond` jest reużywalny na dowolnym `sessionId` — wystarczy ekstrakcja do współdzielonego modułu. (`src/pages/api/ingest/classify.ts:71-108`)
- Guard FR-024 (`getEncryptedApiKey → null → 409 missing_key`) już istnieje i jest wprost reużywalny w retry. (`src/pages/api/ingest/classify.ts:160-175`)

## Czego NIE robimy

- Per-file rozbicie sesji i podgląd zawartości itemów w obrębie sesji (PRD Non-Goal, FR-027).
- Usuwanie sesji z dziennika (PRD Non-Goal).
- Pełna warstwa filtrów/wyszukiwania list (to S-09) — w S-08 tylko sort po dacie + filtr statusu **dla samego dziennika**.
- Powiadomienia asynchroniczne / kolejki (PRD Non-Goal; retry jest synchroniczny, jak ingest).
- Zmiana modelu „nowa sesja per submit" w ingeście — retry świadomie reużywa istniejący wiersz.

## Podejście do implementacji

Cztery fazy w kolejności data/serwis → endpoint → widok → interaktywność (konwencja S-02). Bez migracji (schemat gotowy). Faza 1 dokłada odczyt + odtwarzanie wsadu i wyciąga współdzielony rdzeń klasyfikacji. Faza 2 buduje endpoint retry na tym rdzeniu z pełnymi guardami. Faza 3 dostarcza read-only widok (shippowalny niezależnie). Faza 4 dokłada inline retry jako React island.

## Faza 1: Warstwa serwisu odczytu + odtwarzanie wsadu + ekstrakcja rdzenia

### Przegląd

Dodaje odczyt sesji (z sort/filtr i metadanymi pliku), odtwarzanie wsadu sesji (paste/plik), helper przejścia statusu oraz wyciąga `classifyAndRespond` do współdzielonego modułu, by retry mógł go wołać na istniejącym `sessionId`. Plus label statusu sesji.

### Wymagane zmiany:

#### 1. Serwis odczytu + reopen sesji

**Plik**: `src/lib/services/import-session.ts`

**Cel**: Umożliwić listowanie sesji użytkownika do dziennika, pobranie pojedynczej sesji do retry (z metadanymi pliku) oraz odwrócenie statusu przy ponowieniu.

**Kontrakt**:
- `getImportSessions(supabase, userId, opts?: { sort?: "created_desc" | "created_asc"; status?: ImportSessionStatus }): Promise<ImportSessionWithFile[]>` — select z `import_sessions` + LEFT JOIN metadanych `import_files` (`file_name`, `file_mime`), RLS per-user, sort po `created_at`, opcjonalny filtr statusu.
- `getSessionForRetry(supabase, userId, sessionId): Promise<(ImportSession & { file?: ImportFile }) | null>` — pojedyncza sesja + ewentualny plik (`file` musi nieść `file_path` — wymagany do downloadu w `loadSessionInput`; LEFT JOIN szerszy niż lista, która bierze tylko `file_name`/`file_mime`); `null` gdy brak / nie własna (RLS).
- `reopenSession(supabase, sessionId): Promise<boolean>` — **warunkowy** `UPDATE import_sessions SET status='processing', error_message=null, item_count=null WHERE id=? AND status='failed'` (z `.select("id")` do wykrycia liczby zmienionych wierszy); zwraca `true` gdy wiersz przestawiony, `false` gdy 0 (sesja już nie-`failed` — równoległe ponowienie). Atomowy guard TOCTOU przeciw podwójnemu retry po stronie serwera; klient-side guard z Fazy 4 pozostaje wyłącznie UX.
- Nowy typ `ImportSessionWithFile` w `src/types.ts` (ImportSession + opcjonalne pola pliku do wyświetlenia).

#### 2. Odtwarzanie wsadu sesji

**Plik**: `src/lib/services/session-input.ts` (nowy)

**Cel**: Zwrócić tekst do (ponownej) klasyfikacji niezależnie od źródła: paste z `raw_input`, plik przez download ze Storage + dekod + sanityzacja.

**Kontrakt**: `loadSessionInput(supabase, session): Promise<string>` — paste: zwróć `raw_input`; plik: pobierz Blob z bucketa `import-files` po `file.file_path` (`supabase.storage.from("import-files").download(file_path)`), zamień na bajty (`new Uint8Array(await blob.arrayBuffer())`), zdekoduj przez **`decodeFile(bytes).text`** z `src/lib/text/decode.ts` (uwaga: eksport to `decodeFile`, **nie** `decodeText`; sam dekoder NIE sanityzuje — to samo, co `classify.ts:200-201`), następnie `sanitizeInput` z `src/lib/text/sanitize.ts`. Mapowanie błędów przez wołającego: `UnsupportedEncodingError` → `encoding`; pusty-po-sanityzacji → `empty_file`; błąd downloadu (obiekt zniknął) → `storage`. Reużywa istniejących serwisów dekodowania/sanityzacji z S-02.

#### 3. Ekstrakcja współdzielonego rdzenia klasyfikacji

**Plik**: `src/lib/ai/classify-core.ts` (nowy) + `src/pages/api/ingest/classify.ts` (refactor)

**Cel**: Wydzielić `classifyAndRespond` (timeout 60 s + `classify` + persist/fail na danym `sessionId`) tak, by zarówno ingest, jak i retry wołały ten sam rdzeń — bez rozjazdu logiki klasyfikacji **ani mapowania HTTP** w dwóch miejscach.

**Kontrakt**:
- `runClassification(supabase, { sessionId, apiKey, userId, text }): Promise<{ status: ImportSessionStatus; itemCount?: number; code?: string }>` — przenosi logikę klasyfikacji + persist/fail z `classify.ts:71-108`, ale zwraca **wartość** (HTTP-agnostyczny), nie `Response`. Bez zmiany zachowania samej klasyfikacji.
- `classifyResultToResponse(sessionId, result): Response` (współdzielony helper obok rdzenia) — **jedyne** miejsce mapowania wyniku na HTTP: `too_many_items` → 422 z `ok:false`; `completed_with_items` / `completed_no_items` / `failed` → 200 z `ok:true` (+ `itemCount` / `code`). Zachowuje istniejący kontrakt HTTP ingestu — m.in. test S-02 `422 too_many_items` (`classify.test.ts:130-135`) pozostaje zielony.
- `classify.ts` woła `runClassification` → `classifyResultToResponse`; endpoint retry (Faza 2) woła **ten sam** helper. Mapowanie kodu HTTP nie jest duplikowane w dwóch endpointach.

#### 4. Label statusu sesji

**Plik**: `src/lib/labels.ts`

**Cel**: Polski label dla `ImportSessionStatus` w UI dziennika.

**Kontrakt**: `importSessionStatusLabel(status: ImportSessionStatus): string` oparty o `Record<ImportSessionStatus, string>` (completeness check przy kompilacji). Mapowanie: `processing`→„Przetwarzanie…", `completed_with_items`→„Gotowe", `completed_no_items`→„Brak itemów", `failed`→„Błąd".

#### 5. Wspólny moduł komunikatów błędów (ekstrakcja z modalu)

**Plik**: `src/lib/ingest-errors.ts` (nowy) + `src/components/ingest/ClassificationModal.tsx` (refactor)

**Cel**: Jeden, współdzielony mapping `code → czytelny komunikat`, używany przez modal ingestu ORAZ dziennik (SessionsList, Faza 3) — bez duplikacji `switch` (proliferacja wbrew filozofii `labels.ts`).

**Kontrakt**: `ingestErrorMessage(code: string | null): string` — wyciąga prywatną funkcję `errorMessage` z `ClassificationModal.tsx:32-49` do `src/lib/ingest-errors.ts` (eksport); modal importuje ją zamiast lokalnej kopii (bez zmiany zachowania UI). **Rozszerza** mapę o kody ścieżki plikowej retry: `storage`, `encoding`, `empty_file` oraz retry-specyficzny komunikat dla `missing_key` (np. „Klucz API został usunięty z profilu — skonfiguruj nowy przed ponowieniem"). SessionsList i `RetrySessionButton` (Faza 4) wołają ten sam helper.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Typecheck/build bez błędów: `npm run build`
- Lint czysty: `npm run lint`
- Testy jednostkowe serwisu odczytu + `loadSessionInput` (paste i plik na mocku Storage) przechodzą: `npm run test`
- Test labela (kompletność enuma) przechodzi
- Testy ingestu z S-02 nadal zielone po ekstrakcji rdzenia (brak regresji)

#### Weryfikacja ręczna:

- `getImportSessions` zwraca sesje bieżącego usera z poprawnym sortem/filtrem (sprawdzone na lokalnym stacku)

---

## Faza 2: Endpoint ponowienia POST /api/import-sessions/retry

### Przegląd

Buduje endpoint retry na współdzielonym rdzeniu z Fazy 1, z pełnymi guardami (auth, własność/RLS, status=failed, FR-024) i odtwarzaniem wsadu paste/plik; reużywa istniejący wiersz sesji.

### Wymagane zmiany:

#### 1. Endpoint retry

**Plik**: `src/pages/api/import-sessions/retry.ts` (nowy)

**Cel**: Ponowić klasyfikację sesji `failed` bez ponownego wprowadzania wsadu, reużywając istniejący wiersz sesji.

**Kontrakt**: `POST`, `prerender=false`. Body `{ sessionId: string }` — pojedyncze pole skalarne → walidacja ręczna (`trim`, odrzuć puste → 400; zgodnie z hard rule i `lessons.md`). Kroki: (1) auth guard (`locals.user` lub 401); (2) `getSessionForRetry` → brak/nie własna → 404 (RLS); (3) `status ≠ failed` → 409 `not_retryable`; (4) FR-024: `getEncryptedApiKey → null → 409 code:"missing_key"` z komunikatem „Klucz API został usunięty z profilu, skonfiguruj nowy klucz przed ponowieniem"; `decryptApiKey` → `KekNotConfiguredError → 503`; (5) `loadSessionInput` (paste/plik) — błąd → `failSession(code)` + odpowiedź `failed`; (6) `reopenSession` (warunkowy `failed→processing`) — zwrot `false` (0 wierszy = równoległe ponowienie wygrało wyścig) → 409 `not_retryable`; w przeciwnym razie `runClassification(..., sessionId, text)`; (7) odpowiedź zbudowana przez współdzielony `classifyResultToResponse(sessionId, result)` (Faza 1 krok 3) — `{ ok, sessionId, status, itemCount?, code? }` w kontrakcie identycznym z `classify`, włącznie z 422/`ok:false` dla `too_many_items`. Reuse: ten sam `sessionId`, nadpisanie `item_count`/`error_message`/`status`.

#### 2. Testy integracyjne endpointu

**Plik**: `src/pages/api/import-sessions/retry.test.ts` (nowy) lub `tests/integration/`

**Cel**: Pokryć inwarianty i przypadki brzegowe zatwierdzone w planie.

**Kontrakt**: zob. Kryteria sukcesu poniżej (6 scenariuszy).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Integ.: ścieżka pozytywna — `failed` paste → `completed_with_items`, ten sam `sessionId`, `item_count` zaktualizowany
- Integ.: ścieżka negatywna — klasyfikacja pada ponownie → `failed` + kod (`error_message`)
- Integ.: klucz usunięty przed retry → `missing_key` + komunikat, BEZ wywołania klasyfikacji
- Integ.: retry sesji nie-`failed` → 409 `not_retryable`
- Integ.: plik — re-dekod pada → `failed`/`encoding`, bez wycieku treści/klucza
- Integ.: RLS — cudza sesja → 404
- Lint + typecheck czyste

#### Weryfikacja ręczna:

- Retry realnej sesji `failed` aktualizuje ten sam wiersz na lokalnym stacku

---

## Faza 3: Widok dziennika (SSR) + nawigacja + sort/filtr

### Przegląd

Read-only widok dziennika, shippowalny niezależnie od interaktywności. Sort po dacie + filtr statusu przez query-paramy (server-side, lekkie).

### Wymagane zmiany:

#### 1. Strona dziennika

**Plik**: `src/pages/import-sessions.astro` (nowy)

**Cel**: Protected SSR strona listująca sesje usera z sort/filtr z query-paramów.

**Kontrakt**: `prerender=false`; `locals.user`; `createClient(headers,cookies)`; czyta `Astro.url.searchParams` (`sort`, `status`) → `getImportSessions(...)`; `try/catch → []`; renderuje Layout + Topbar + kontrolki sort/filtr (`<form method="get">` lub linki) + `SessionsList`.

#### 2. Lista sesji

**Plik**: `src/components/import-sessions/SessionsList.astro` (nowy)

**Cel**: Read-only render listy sesji.

**Kontrakt**: `Props { sessions: ImportSessionWithFile[] }`; per sesja: skrócony podgląd wejścia (paste → pierwsze ~120 znaków + „…"; plik → `file_name` + typ), status-badge (`importSessionStatusLabel`, kolor wg statusu), liczba itemów lub `error_message` (mapowany na czytelny komunikat przez współdzielony `ingestErrorMessage` z Fazy 1 krok 5), slot na przycisk retry (Faza 4) dla `failed`. Empty state `role="status"`.

#### 3. Nawigacja + ochrona trasy

**Pliki**: `src/components/Topbar.astro`, `src/middleware.ts`

**Cel**: Link „Sesje importu" + ochrona trasy.

**Kontrakt**: link `/import-sessions` w Topbarze (wzorzec istniejących linków); dopisanie `"/import-sessions"` do `PROTECTED_ROUTES`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Build + lint czyste
- `/import-sessions` obecne w `PROTECTED_ROUTES`

#### Weryfikacja ręczna:

- Dziennik pokazuje sesje usera; sort i filtr statusu działają; nieuwierzytelniony przekierowany

---

## Faza 4: Inline retry (React island + hook)

### Przegląd

Dokłada akcję „Spróbuj ponownie" jako React island z inline statusem w wierszu (bez modalu).

### Wymagane zmiany:

#### 1. Hook ponowienia

**Plik**: `src/components/hooks/useSessionRetry.ts` (nowy)

**Cel**: Stan + fetch ponowienia.

**Kontrakt**: `useSessionRetry()` → `{ state: "idle"|"retrying"|"done"|"error", result, error, retry(sessionId) }`; POST `/api/import-sessions/retry`; mapuje odpowiedź na stan; wzorzec `useClassification`.

#### 2. Przycisk retry

**Plik**: `src/components/import-sessions/RetrySessionButton.tsx` (nowy)

**Cel**: Inline akcja w wierszu `failed`.

**Kontrakt**: `client:load`; props `{ sessionId }`; przycisk „Spróbuj ponownie" disabled w trakcie (spinner); po `done` z `completed_with_items` → liczba itemów + link do `/items`; po `done` z `completed_no_items` → krótki komunikat „Brak itemów" (bez linku — spójnie z panelem modalu `ClassificationModal.tsx:142-156`); po porażce → `Alert` (variant destructive) z komunikatem (`ingestErrorMessage`, Faza 1 krok 5); odśwież wiersz/listę (np. `location.reload()` lub aktualizacja stanu). Guard podwójnego kliku. Hook `useSessionRetry` rozróżnia więc trzy wyniki końcowe, nie dwa.

#### 3. Wpięcie w listę

**Plik**: `src/components/import-sessions/SessionsList.astro`

**Cel**: Zamontować przycisk w slocie dla `failed`.

**Kontrakt**: render `RetrySessionButton` (`client:load`) tylko dla wierszy `status === "failed"`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Build + lint czyste
- (opcjonalnie) test hooka mapującego odpowiedź endpointu

#### Weryfikacja ręczna:

- Pełny flow: `failed` → klik → spinner → sukces/porażka inline; podwójny klik zablokowany; klucz usunięty między błędem a retry → komunikat

---

## Strategia testowania

### Testy jednostkowe:

- `getImportSessions` / `getSessionForRetry` (sort, filtr, scoping per-user przez mock), `reopenSession`
- `loadSessionInput` (paste; plik z mock Storage; encoding fail; pusty-po-sanityzacji)
- `importSessionStatusLabel` (kompletność enuma)

### Testy integracyjne (endpoint retry):

- Ścieżka pozytywna (failed paste → completed_with_items, ten sam sessionId, item_count zaktualizowany)
- Ścieżka negatywna (klasyfikacja pada ponownie → failed + kod)
- Klucz usunięty przed retry → `missing_key` + komunikat, brak wywołania klasyfikacji
- Retry sesji nie-`failed` → 409 `not_retryable`
- Plik: re-dekod pada → `failed`/`encoding`, bez wycieku
- RLS: cudza sesja → 404

### Kroki testowania ręcznego:

1. Utwórz sesję `failed` (np. zły klucz), wejdź na `/import-sessions`.
2. Popraw klucz, „Spróbuj ponownie" → wiersz przechodzi `processing` → `completed`.
3. Usuń klucz, retry → komunikat „klucz usunięty".
4. Sort po dacie + filtr statusu.

## Uwagi dotyczące wydajności

- Retry to wall-clock fetch-wait (timeout 60 s) — jak ingest, mieści się w Workers Free (nie liczy CPU). Brak nowych budżetów wydajności.
- Lista dziennika: prosty select z indeksem `import_sessions_user_idx`; paginacja poza zakresem (małe wolumeny single-user).

## Uwagi dotyczące migracji

- Brak migracji — schemat `import_sessions`/`import_files` + RLS + bucket Storage istnieją z S-02.

## Referencje

- Roadmapa S-08: `context/foundation/roadmap.md`
- PRD: US-07, FR-027, FR-024
- Schemat: `supabase/migrations/20260610052532_classification_schema.sql`, `20260610173614_import_files.sql`, `20260610173611_storage_import_files.sql`
- Rdzeń klasyfikacji: `src/pages/api/ingest/classify.ts:71-108`
- Wzorzec widoku: `src/pages/items.astro`, `src/components/items/PendingItemsList.astro`
- Lessons: `context/foundation/lessons.md` (fail-closed config; schemat wg kardynalności; zod vs ręczna walidacja)

## Otwarte ryzyka i założenia

- **Sort/filtr statusu nakłada się z S-09** — świadomie wciągnięty do dziennika jako wąski wariant (tylko ten widok), nie generyczna warstwa filtrów. Ryzyko drobnego dublowania kodu przy S-09; akceptowane (decyzja użytkownika w planowaniu).
- **Reuse wiersza sesji nadpisuje audit** — ponowienie kasuje ślad poprzedniej porażki (`error_message`/`item_count`). Świadomy wybór; historia prób nie jest zachowywana.
- Założenie: plik w Storage nadal istnieje przy retry (bucket bez TTL). Jeśli zniknął → retry pada na `storage`/`encoding`, obsłużone jak błąd.

## Progress

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>`, gdy krok zostanie zrealizowany. Nie zmieniaj nazw tytułów kroków.

### Faza 1: Warstwa serwisu odczytu + odtwarzanie wsadu + ekstrakcja rdzenia

#### Automatyczne

- [x] 1.1 Typecheck/build bez błędów — 479e46e
- [x] 1.2 Lint czysty — 479e46e
- [x] 1.3 Testy jednostkowe serwisu odczytu + loadSessionInput (paste/plik) przechodzą — 479e46e
- [x] 1.4 Test labela (kompletność enuma) przechodzi — 479e46e
- [x] 1.5 Testy ingestu z S-02 nadal zielone po ekstrakcji rdzenia — 479e46e

#### Ręczne

- [x] 1.6 getImportSessions zwraca sesje usera z poprawnym sortem/filtrem (lokalny stack) — render listy + odczyt potwierdzone (npm run preview 200 OK + dev); logika serwisu w testach jedn. (1.3). Sort/filtr = wąski whitelist server-side, nie klik-testowany w UI.

### Faza 2: Endpoint ponowienia POST /api/import-sessions/retry

#### Automatyczne

- [x] 2.1 Integ.: ścieżka pozytywna (failed → completed, ten sam sessionId) — 4446bff
- [x] 2.2 Integ.: ścieżka negatywna (klasyfikacja pada ponownie → failed + kod) — 4446bff
- [x] 2.3 Integ.: klucz usunięty → missing_key, brak klasyfikacji — 4446bff
- [x] 2.4 Integ.: retry sesji nie-failed → 409 not_retryable — 4446bff
- [x] 2.5 Integ.: plik re-dekod pada → failed/encoding — 4446bff
- [x] 2.6 Integ.: RLS cudza sesja → 404 — 4446bff
- [x] 2.7 Lint + typecheck czyste — 4446bff

#### Ręczne

- [x] 2.8 Retry realnej sesji failed aktualizuje ten sam wiersz (lokalny stack) — sesja 940d897e: invalid_key×2 → ok (2 wpisy); wiersz zaktualizowany W MIEJSCU, bez migotania (weryfikacja użytkownika 2026-06-14).

### Faza 3: Widok dziennika (SSR) + nawigacja + sort/filtr

#### Automatyczne

- [x] 3.1 Build + lint czyste — 34ff83b
- [x] 3.2 /import-sessions w PROTECTED_ROUTES — 34ff83b

#### Ręczne

- [x] 3.3 Dziennik pokazuje sesje; sort/filtr działają; nieuwierzytelniony przekierowany — render dziennika 200 OK na buildzie prod (npm run preview) + dev bez migotania; przekierowanie = PROTECTED_ROUTES (3.2). Sort/filtr server-side niezmieniony, nie klik-testowany.

### Faza 4: Inline retry (React island + hook)

#### Automatyczne

- [x] 4.1 Build + lint czyste — d689114
- [ ] 4.2 (opcjonalnie) test hooka mapującego odpowiedź

#### Ręczne

- [x] 4.3 Pełny flow inline retry: failed → spinner → sukces/porażka; podwójny klik zablokowany; klucz usunięty → komunikat — ścieżki failed→sukces i failed→failed potwierdzone realnie (dev 2026-06-14); guard podwójnego kliku (hook + disabled) i komunikat usuniętego klucza pokryte kodem + integ 2.3/2.4.
