# Widok elementów sesji (master-detail w dzienniku importu) — Plan implementacji

## Przegląd

Rozbudowujemy stronę dziennika sesji importu (`/import-sessions`, zbudowaną w S-08) o widok **master-detail**: po lewej istniejąca lista sesji, po prawej — po kliknięciu sesji — **wszystkie jej elementy we wszystkich stanach akceptacji** (`pending`/`accepted`/`rejected`/`deleted`), z badżami statusu i stanu oraz możliwością edycji, przeniesienia do kosza i przywrócenia, przez reużycie istniejących mechanizmów (S-05 `EditItemDialog`, S-06 move-to-trash/restore). Wycinek realizuje S-10 z roadmapy (`session-items-detail`).

## Analiza stanu obecnego

- **Strona `/import-sessions`** (`src/pages/import-sessions.astro`): SSR (`prerender=false`), pobiera sesje serwerowo przez `getImportSessions`, przekazuje odchudzone `SessionRowData[]` do pojedynczej wyspy `<SessionsList client:load rows={rows} />`. Layout jednokolumnowy (`max-w-2xl`), filtry sort/status jako formularz GET. **Brak** wyboru sesji i **brak** prawego panelu.
- **Wyspa**: `SessionsList` → `SessionRow` (z hookiem `useSessionRetry`). `SessionRowData` to lekki wiersz (6 pól, bez `raw_input`, bez elementów).
- **Items API/serwis (S-09)**: `GET /api/items` (`src/pages/api/items/index.ts`) + `listItems` (`src/lib/services/items.ts:57-100`) filtrują przez `view` (jedna kombinacja stanów). **Nie ma trybu „wszystkie stany jednej sesji po `import_session_id`".**
- **Reużywalne mechanizmy**: `EditItemDialog` (`src/components/items/EditItemDialog.tsx`) — pełny `Item`, sam fetchuje przez `useItemMutation.editItem`, callbacki `onSaved`/`onNotFound`/`onOpenChange`; **optimistic concurrency wdrożone** (CAS na `updated_at`). `moveToTrash`/`restoreFromTrash` (`useItemMutation` → `POST /api/items/bulk`). Read-only dla `rejected`/`deleted` egzekwuje serwer (edycja → 404, trash → no-op).
- **Model danych**: `items.import_session_id` (nullable FK `on delete set null`), enumy `acceptance_status`/`operational_status`, indeks `items_session_idx` na `import_session_id`, RLS `items_select_own` (`auth.uid() = user_id`). **Zapytanie „wszystkie elementy sesji X bieżącego usera" realizowalne bez migracji.**
- **Komendy/bramki**: `npm run lint`, `npm test` (vitest unit), `npm run test:integration`, `npm run build`. CI = lint + build.

Pełne ugruntowanie: `context/changes/session-items-detail/research.md`.

## Pożądany stan końcowy

Użytkownik na `/import-sessions` widzi dwie kolumny. Po lewej dotychczasowa lista sesji. Po kliknięciu sesji po prawej **dociągają się** jej elementy (jedno żądanie do nowego endpointu, ≤100 elementów), pokazane z badżami statusu (`pending`/`accepted`/`rejected`/`deleted`) i stanu operacyjnego. Per element dostępne są akcje zależne od stanu: `pending`/`accepted` → edycja; `accepted` → też przeniesienie do kosza; `rejected`/`deleted` → podgląd tylko-do-odczytu + przywrócenie. Każda akcja aktualizuje **wyłącznie ten jeden element w miejscu** (bez przeładowania listy, bez reorderu, bez migotania). Weryfikacja: ręczne przejście pełnego cyklu na `npm run dev` + zielone `npm run lint` / `npm test` / `npm run build`.

### Kluczowe odkrycia

- `GET /api/items` filtruje przez `view` — panel sesji to **scope** (`import_session_id`) bez `view`; potrzebny nowy, węższy endpoint o tym samym kształcie odpowiedzi (`Item[]`) — `research.md` §2.
- `EditItemDialog` zwraca świeży `Item` przez `onSaved` (`PATCH /api/items/[id]` → `{ok:true,item}`) — edycja aktualizuje element w miejscu „za darmo".
- `restoreFromTrash`/`bulk` zwracają dziś tylko `{updatedIds,count}` — **nie** świeży wiersz; po przywróceniu element re-otwiera edycję, więc bez świeżego `updated_at` pierwsza edycja trafia na zakleszczony 409 (`research.md` Architecture Insights).
- Sort po `created_at` (niezmienny dla elementu) gwarantuje, że zmiana stanu nigdy nie przesuwa wiersza.
- Strona `/import-sessions` to historyczne źródło bloker dup-React SSR (`lessons.md`); fix w `astro.config.mjs` (dedupe + ssr.noExternal) jest na miejscu, ale dołożenie hooków na wyspie wymaga weryfikacji realnym dev SSR.

## Czego NIE robimy

- **Brak paginacji listy sesji** — odłożona do S-11 (wraz z ewentualnym deep-linkiem sesji w URL; obie decyzje są sprzężone).
- **Brak zapisu wybranej sesji w adresie strony** (`?session=`) — projektowane razem z paginacją w S-11.
- **Brak akcji akceptuj/odrzuć i zaznaczania zbiorczego w panelu** — to widok-przegląd, nie druga główna lista; pełne zarządzanie zostaje na listach głównych.
- **Brak zmian schematu/migracji** — model danych wystarcza.
- **Brak per-item permanent delete** (poza MVP).

## Podejście do implementacji

Trzy fazy od dołu w górę: warstwa danych → dialog read-only → panel. Faza 3 konsumuje obie wcześniejsze i koncentruje jedyne realne ryzyko (SSR/wyspa) we własnej bramce. Maksymalne reużycie: jedyny nowy „nowy kod" to tryb read-only dialogu, endpoint elementów sesji i addytywne pole w odpowiedzi restore; reszta to złożenie istniejących klocków.

## Krytyczne szczegóły implementacji

- **Współbieżność `updated_at` (sekwencjonowanie stanu):** aktualizacja pojedynczego elementu musi nieść server-świeży `updated_at`. Edycja zwraca go w `onSaved`. Kosz go nie potrzebuje (element staje się read-only). **Przywrócenie wymaga go** — bo re-otwiera edycję; dlatego restore musi zwrócić świeży wiersz (Faza 1), inaczej edycja po restore daje zakleszczony 409 (dialog 409 nie odświeża rodzica).
- **Stabilność listy (UX):** panel sortuje po `created_at` (niezmienny) i kluczuje wiersze po `item.id` — żadna akcja (edycja/kosz/restore zmienia `acceptance_status`/`updated_at`, nie `created_at`) nie przesuwa wiersza; React aktualizuje go w miejscu, bez błysku. Przycisk w locie wyszarzony (`inFlightIds`), podmiana po odpowiedzi.
- **Dup-React SSR (timing/cykl życia):** `/import-sessions` historycznie wywalało SSR „Invalid hook call". Hoisting granicy wyspy do wspólnego rodzica i dołożenie hooka panelu zwiększa ekspozycję. Weryfikacja MUSI odtworzyć tryb awarii (re-optymalizacja Vite w trakcie sesji dev), nie tylko zimny render ani zielony `npm run build` (przy `output:"server"` build nie SSR-uje stron).

## Faza 1: Warstwa danych — endpoint elementów sesji + addytywne restore

### Przegląd

Daje danym podstawę: endpoint i serwis zwracający wszystkie elementy jednej sesji oraz drobne, addytywne rozszerzenie odpowiedzi restore o zwrócony wiersz.

### Wymagane zmiany:

#### 1. Serwis elementów sesji

**Plik**: `src/lib/services/items.ts`

**Cel**: dodać funkcję zwracającą wszystkie elementy jednej sesji bieżącego usera, niezależnie od stanu akceptacji — odpowiednik `listItems`, ale po `import_session_id` zamiast `view`.

**Kontrakt**: `getSessionItems(supabase: SupabaseClient, userId: string, sessionId: string): Promise<Item[]>` — `from("items").select(ITEM_COLUMNS).eq("user_id", userId).eq("import_session_id", sessionId)`, sort `order("created_at", { ascending: true })` + tie-break `order("id", { ascending: true })`. Bez filtra `acceptance_status`. Reużywa istniejące `ITEM_COLUMNS`.

#### 2. Endpoint GET elementów sesji

**Plik**: `src/pages/api/import-sessions/[id]/items.ts` (nowy)

**Cel**: wystawić `getSessionItems` jako endpoint, wzorowany na `GET /api/items`.

**Kontrakt**: `GET /api/import-sessions/[id]/items`, `prerender=false`. Guard sesji (`context.locals.user`) → 401. Walidacja `params.id` jako UUID — ręczna (pojedyncze pole skalarne wg reguły zod-vs-ręczna z `lessons.md`) → 400 przy złym kształcie. Sukces `{ ok:true, items: Item[] }`; błąd `{ ok:false, code, error }` (kody jak w `items/index.ts`). Nieistniejąca lub cudza sesja → pusta lista (RLS odfiltrowuje; brak osobnego sprawdzania istnienia — jedno zapytanie).

#### 3. Restore zwraca zaktualizowane wiersze (addytywnie)

**Pliki**: `src/lib/services/items-mutation.ts`, `src/pages/api/items/bulk.ts`

**Cel**: po przywróceniu zwrócić świeże wiersze, by panel mógł podmienić element z poprawnym `updated_at`.

**Kontrakt**: `restoreFromTrash` zwraca `Item[]` (zaktualizowane wiersze — dwa guarded UPDATE `deleted→accepted` i `rejected→pending` z `.select(ITEM_COLUMNS)`). Odpowiedź `bulk` dla `action:"restore"` **dodaje** pole `items: Item[]`; istniejące pola (`updatedIds`, `count`, `action`, `ok`) bez zmian → konsumenci accept/reject/trash w głównych widokach nietknięci (pole ignorowane). Zmiana wyłącznie addytywna.

#### 4. Czyste helpery klienta + testy

**Pliki**: `src/components/hooks/` (helper przy hooku panelu) + plik testu `*.test.ts`

**Cel**: wydzielić testowalne funkcje budowy URL i mapowania odpowiedzi (wzorzec `buildListUrl`/`mapListResponse` z `useItemList`).

**Kontrakt**: `buildSessionItemsUrl(sessionId: string): string` → `/api/import-sessions/<id>/items`; `mapSessionItemsResponse(ok, data): { ok:true; items:Item[] } | { ok:false }` (waliduje `data.ok` + `Array.isArray(data.items)`). Testy jednostkowe (vitest) pokrywają oba helpery.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Testy jednostkowe nowych helperów przechodzą: `npm test`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna:

- `GET /api/import-sessions/<id>/items` zwraca wszystkie elementy sesji we wszystkich stanach, sort `created_at asc`; nieistniejąca/cudza sesja → pusta lista
- `POST /api/items/bulk {action:"restore"}` zwraca w odpowiedzi `items` ze świeżym `updated_at`; akcje accept/reject/trash w głównych widokach działają bez zmian

**Uwaga implementacyjna**: Po zielonych weryfikacjach automatycznych zatrzymaj się na ręczne potwierdzenie przed Fazą 2.

---

## Faza 2: Dialog podglądu (tryb read-only)

### Przegląd

Daje możliwość otwarcia elementu w trybie tylko-do-odczytu — dla `rejected`/`deleted`, których nie wolno edytować, ale które chcemy móc podejrzeć w pełnej treści.

### Wymagane zmiany:

#### 1. Tryb read-only w dialogu edycji

**Plik**: `src/components/items/EditItemDialog.tsx`

**Cel**: dołożyć tryb podglądu bez edycji, reużywając istniejący układ pól, zamiast budować osobny komponent od zera.

**Kontrakt**: nowy prop `readOnly?: boolean` (domyślnie `false`). Gdy `true`: pola `title`/`description`/`type` oraz badże statusu/stanu renderowane jako tylko-do-odczytu, brak przycisku „Zapisz", brak wywołania `useItemMutation.editItem`, brak wysyłki `expectedUpdatedAt`, tytuł dialogu „Podgląd elementu". Gdy `readOnly` nieobecny/`false` — zachowanie identyczne jak dziś (kontrakt nienaruszony dla `PendingItemsView`/`AcceptedItemsView`).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna:

- Dialog w trybie read-only pokazuje treść elementu bez pól edycji i bez „Zapisz"
- Istniejące przepływy edycji (Pending/Accepted) działają bez zmian — brak regresji

**Uwaga implementacyjna**: Po zielonych weryfikacjach automatycznych zatrzymaj się na ręczne potwierdzenie przed Fazą 3.

---

## Faza 3: Panel master-detail + wpięcie akcji

### Przegląd

Składa całość: dwukolumnowy layout, wspólna wyspa trzymająca wybór sesji, panel dociągający elementy i wpinający akcje przez reużycie.

### Wymagane zmiany:

#### 1. Hoisting wyspy + layout dwukolumnowy

**Pliki**: `src/pages/import-sessions.astro`, nowy `src/components/import-sessions/ImportSessionsView.tsx`

**Cel**: przenieść granicę wyspy z `SessionsList` do wspólnego rodzica trzymającego wybór sesji, by lewa lista i prawy panel dzieliły stan; strona renderuje dwie kolumny.

**Kontrakt**: nowa wyspa `ImportSessionsView` (`client:load`, prop `rows: SessionRowData[]`) trzyma `selectedSessionId: string | null`; renderuje `<SessionsList>` (lewa, z `onSelect`/podświetleniem wybranego) + `<SessionItemsPanel sessionId={selectedSessionId}>` (prawa). Strona `.astro` przekazuje `rows` do tej wyspy zamiast bezpośrednio do `SessionsList`. Layout dwukolumnowy (lewa lista, prawy panel).

#### 2. Wybór sesji w wierszu

**Pliki**: `src/components/import-sessions/SessionsList.tsx`, `SessionRow.tsx`

**Cel**: umożliwić wybór sesji na liście bez ruszania logiki retry.

**Kontrakt**: `SessionsList`/`SessionRow` przyjmują `onSelect(id: string)` i `selectedId`; wiersz wywołuje `onSelect(row.id)` i pokazuje stan wybrany. `useSessionRetry` i istniejące zachowanie wiersza bez zmian.

#### 3. Hook elementów sesji

**Plik**: `src/components/hooks/useSessionItems.ts` (nowy)

**Cel**: dociągać elementy wybranej sesji i utrzymywać je w stanie z możliwością aktualizacji pojedynczego elementu w miejscu.

**Kontrakt**: `useSessionItems(sessionId: string | null)` → `{ items: Item[]; loading; error; replaceItem(updated: Item): void; setItemStatus(id, acceptance_status): void }`. Fetch po zmianie `sessionId` (abort poprzedniego, „ostatnie żądanie wygrywa" — wzorzec `useItemList`), przez `buildSessionItemsUrl`/`mapSessionItemsResponse` z Fazy 1. `replaceItem` podmienia jeden wpis (po `id`); `setItemStatus` zmienia stan jednego wpisu lokalnie (dla kosza). Sort wejścia po `created_at asc`.

#### 4. Panel elementów sesji + wpięcie akcji

**Plik**: `src/components/import-sessions/SessionItemsPanel.tsx` (nowy)

**Cel**: wyrenderować elementy sesji z badżami i akcjami zależnymi od stanu, reużywając dialog edycji, dialog read-only oraz mutacje kosza/przywracania.

**Kontrakt**: prop `sessionId`. Renderuje listę elementów (klucz `item.id`, sort `created_at asc`) z badżami statusu (`acceptanceStatusLabel`) i stanu operacyjnego (etykiety per-typ z `labels.ts`). Akcje per stan:
- `pending`/`accepted` → „Edytuj" otwiera `EditItemDialog` (edycja); po `onSaved(updated)` → `replaceItem(updated)`;
- `accepted` → „Do kosza" → `useItemMutation.moveToTrash([id])`; po sukcesie `setItemStatus(id, "deleted")`;
- `rejected`/`deleted` → „Podgląd" otwiera `EditItemDialog readOnly` + „Przywróć" → `useItemMutation.restoreFromTrash([id])`; po sukcesie `replaceItem(zwrócony świeży wiersz)`.

Przycisk w locie wyszarzony do odpowiedzi (`inFlightIds`). Stan pusty: „Ta sesja nie ma elementów". Brak akcji edycji/kosza dla `rejected`/`deleted` (read-only wynika z nierenderowania akcji; serwer i tak strzeże).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna:

- Kliknięcie sesji po lewej dociąga jej elementy po prawej (wszystkie stany, badże statusu i stanu)
- Edycja pending/accepted: zapis aktualizuje element w miejscu, bez reorderu i migotania
- Przeniesienie accepted do kosza: element zmienia się na `deleted` w miejscu (read-only), nie znika
- Przywrócenie: element wraca do `accepted`/`pending` w miejscu i jest od razu edytowalny (edycja po restore bez fałszywego 409)
- Podgląd read-only dla `rejected`/`deleted`; brak akcji edycji/kosza dla nich
- Weryfikacja dev SSR: `/import-sessions` z sesjami renderuje się w `npm run dev` bez „Invalid hook call / multiple copies of React", potwierdzone w trybie re-optymalizacji w trakcie sesji (nie tylko zimny render / zielony build)
- Wybór sesji stabilny — element nie ucieka spod kursora przy akcjach

**Uwaga implementacyjna**: Po zielonych weryfikacjach automatycznych zatrzymaj się na końcowe ręczne potwierdzenie pełnego cyklu.

---

## Strategia testowania

### Testy jednostkowe:

- `buildSessionItemsUrl` — poprawny URL z `sessionId`
- `mapSessionItemsResponse` — sukces tylko gdy `ok && Array.isArray(items)`; w przeciwnym razie `{ok:false}`
- (jeśli wydzielone) logika decyzji o dostępnych akcjach per stan

### Testy integracyjne:

- Opcjonalnie, w istniejącym harnessie `npm run test:integration`: `GET /api/import-sessions/[id]/items` zwraca elementy własnej sesji we wszystkich stanach i izoluje cudze (RLS). Nie blokujące dla wycinka — pokrycie endpointu zapewnia też weryfikacja ręczna.

### Kroki testowania ręcznego:

1. Wejdź na `/import-sessions` (`npm run dev`, `http://localhost:4321`); kliknij sesję z elementami → panel po prawej pokazuje wszystkie jej elementy z badżami.
2. Edytuj `pending` i `accepted` → zmiany widoczne w miejscu, wiersz się nie przesuwa.
3. Przenieś `accepted` do kosza → przechodzi na `deleted` (read-only), zostaje w panelu.
4. Przywróć element z kosza → wraca do `accepted`/`pending`; od razu otwórz edycję → zapis działa (brak 409).
5. Otwórz podgląd `rejected`/`deleted` → tylko odczyt, brak „Zapisz".
6. Wymuś re-optymalizację Vite w trakcie sesji dev (np. pierwsze wejście na trasę po starcie) → brak crashu SSR.

## Uwagi dotyczące wydajności

Panel dociąga elementy jednej sesji (≤100 wg FR-020); lookup po `items_session_idx`. Aktualizacja pojedynczego elementu w miejscu unika przeładowania listy. Sort jednej sesji w pamięci jest akceptowalny.

## Uwagi dotyczące migracji

Brak — żadnych zmian schematu ani danych. Endpoint i akcje działają na istniejącym modelu + RLS.

## Referencje

- Powiązane badania: `context/changes/session-items-detail/research.md`
- Wzorzec endpointu/serwisu: `src/pages/api/items/index.ts`, `src/lib/services/items.ts:57-100`
- Wzorzec hooka listy: `src/components/hooks/useItemList.ts`
- Reużywane mechanizmy: `src/components/items/EditItemDialog.tsx`, `src/components/hooks/useItemMutation.ts`, `src/lib/services/items-mutation.ts:139-182`, `src/pages/api/items/bulk.ts`
- Powierzchnia S-08: `src/pages/import-sessions.astro`, `src/components/import-sessions/*`
- Lekcja dup-React SSR: `context/foundation/lessons.md`

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po zakończeniu kroku. Nie zmieniaj nazw tytułów kroków.

### Faza 1: Warstwa danych — endpoint elementów sesji + addytywne restore

#### Automatyczne

- [x] 1.1 Lint przechodzi: `npm run lint` — f785671
- [ ] 1.2 Testy jednostkowe nowych helperów przechodzą: `npm test`
- [x] 1.3 Build przechodzi: `npm run build` — f785671

#### Ręczne

- [ ] 1.4 `GET /api/import-sessions/<id>/items` zwraca wszystkie elementy sesji we wszystkich stanach, sort `created_at asc`; nieistniejąca/cudza sesja → pusta lista
- [ ] 1.5 `POST /api/items/bulk {action:"restore"}` zwraca `items` ze świeżym `updated_at`; accept/reject/trash niezmienione

### Faza 2: Dialog podglądu (tryb read-only)

#### Automatyczne

- [x] 2.1 Lint przechodzi: `npm run lint`
- [x] 2.2 Build przechodzi: `npm run build`

#### Ręczne

- [ ] 2.3 Dialog w trybie read-only pokazuje treść elementu bez pól edycji i bez „Zapisz"
- [ ] 2.4 Istniejące przepływy edycji (Pending/Accepted) działają bez zmian — brak regresji

### Faza 3: Panel master-detail + wpięcie akcji

#### Automatyczne

- [ ] 3.1 Lint przechodzi: `npm run lint`
- [ ] 3.2 Build przechodzi: `npm run build`

#### Ręczne

- [ ] 3.3 Kliknięcie sesji po lewej dociąga jej elementy po prawej (wszystkie stany, badże statusu i stanu)
- [ ] 3.4 Edycja pending/accepted: zapis aktualizuje element w miejscu, bez reorderu i migotania
- [ ] 3.5 Przeniesienie accepted do kosza: element zmienia się na `deleted` w miejscu (read-only), nie znika
- [ ] 3.6 Przywrócenie: element wraca do `accepted`/`pending` w miejscu i jest od razu edytowalny (edycja po restore bez fałszywego 409)
- [ ] 3.7 Podgląd read-only dla `rejected`/`deleted`; brak akcji edycji/kosza dla nich
- [ ] 3.8 Weryfikacja dev SSR: `/import-sessions` z sesjami renderuje się bez „Invalid hook call", potwierdzone w trybie re-optymalizacji w trakcie sesji
- [ ] 3.9 Wybór sesji stabilny — element nie ucieka spod kursora przy akcjach
