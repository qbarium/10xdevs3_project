# Filtry dodatkowe list — sortowanie, wyszukiwanie, podfiltr stanu — Plan implementacji

## Przegląd

S-09 dokłada **trzecią warstwę FR-008** (filtry dodatkowe) do gotowej infrastruktury 5 widoków list (zbudowanej w S-02…S-06). Zakres:

1. **Sortowanie** — jedno pole naraz (tytuł / data utworzenia / data modyfikacji), każde z kierunkiem rosnąco/malejąco.
2. **Wyszukiwanie** po tytule i opisie.
3. **Podfiltr stanu operacyjnego** — tylko w widoku **Aktywne** (`nowe` / `w realizacji`).
4. **Migracja filtra typu** z modelu klient + cookie na **serwer + parametry w adresie strony (URL)**.

Wszystkie cztery działają **po stronie serwera**: nowy `GET /api/items` przyjmuje kryteria z URL, buduje jedno zapytanie Supabase i zwraca przefiltrowaną listę; wyspa React odpytuje endpoint i synchronizuje URL, a strony `.astro` czytają te same parametry przy renderze serwerowym (brak przeskoku po hydracji). Filtr typu i sortowanie/wyszukiwanie obejmują **wszystkie widoki list, w tym „Elementy do akceptacji"** (pending dziś nie ma żadnego filtra).

Zmiana jest **czysto aplikacyjna — bez migracji**. Wszystkie kolumny istnieją (`type`, `title`, `description`, `acceptance_status`, `operational_status`, `created_at`, `updated_at`), a indeks `items_user_acceptance_operational_idx (user_id, acceptance_status, operational_status)` pokrywa filtr główny + podfiltr operacyjny.

> Zakres rozdzielony 2026-06-20: filtr po sesji importu i widok elementów sesji **NIE** są częścią S-09 — przeszły do nowego wycinka **S-10 `session-items-detail`** (master-detail w dzienniku sesji). Zob. `change.md` i `roadmap.md`.

## Analiza stanu obecnego

Filtr główny (5 widoków) i filtr typu (na części widoków) są gotowe:

- 5 stron Astro SSR: `/items` (pending), `/items/active`, `/items/done`, `/items/cancelled`, `/items/trash` — każda ładuje dane serwerowo własną funkcją serwisu i przekazuje `initialItems` do wyspy.
- `src/lib/services/items.ts` — `getPendingItems` / `getActiveItems` / `getDoneItems` / `getCancelledItems` / `getTrashItems`; wspólny `ITEM_COLUMNS`; sort stały (pending: `created_at DESC, id ASC`; reszta: `updated_at DESC, created_at DESC, id ASC`). Query builder supabase-js, bez RPC.
- **Filtr typu** — kliencki: `src/components/items/type-filter.ts` (`applyTypeFilter`, `TYPE_FILTER_VALUES`, `parseTypeFilter`, cookie `TYPE_FILTER_COOKIE = "tl_typefilter"`) + `TypeFilter.tsx`. Obecny **w `AcceptedItemsView` i `TrashItemsView`**; SSR czyta cookie (`parseTypeFilter(Astro.cookies.get(...))`) i podaje `initialTypeFilter`. **Nieobecny w `PendingItemsView`.**
- Mutacje: `src/components/hooks/useItemMutation.ts`; selekcja: `src/components/items/selection.ts`; „przypięte" id (`pinnedIds`) w `AcceptedItemsView` jako wyłom dla edycji zmieniającej typ przy aktywnym filtrze.
- Brak wspólnego helpera fetch — wyspy dostają dane wyłącznie przez props (`initialItems`); jedyne wywołania sieci to mutacje POST/PATCH.

Czego brakuje dla S-09:

- **Brak `GET /api/items`** — żaden endpoint nie czyta query string (`url.searchParams`). Wszystkie czytają tylko body.
- **Brak sortowania sterowanego przez użytkownika** (sort jest stały w serwisie).
- **Brak wyszukiwania** (żadne `.ilike`).
- **Brak podfiltra stanu operacyjnego** w Aktywne.
- **Filtr typu nie jest w URL** (jest w cookie) i **nie obejmuje pending**.

## Pożądany stan końcowy

Na każdym widoku list użytkownik:

- wybiera **sortowanie** (jedno pole: tytuł / data utworzenia / data modyfikacji + kierunek) — lista przeładowuje się z serwera w nowej kolejności;
- wpisuje frazę i **wyszukuje** po tytule i opisie (z krótkim opóźnieniem, by nie odpytywać po każdej literze);
- przełącza **filtr typu** (Wszystkie / Zadania / Notatki / Pomysły / Decyzje / Inne) — także w „Elementy do akceptacji";
- w widoku **Aktywne** dodatkowo zawęża po **stanie operacyjnym** (nowe / w realizacji);
- ma wszystkie te kryteria **odzwierciedlone w adresie strony** — odświeżenie, „wstecz/dalej" i wysłany odnośnik zachowują filtry;
- po zmianie dowolnego filtra ma **wyczyszczone zaznaczenie**, a pusty wynik pokazuje czytelny komunikat z akcją „wyczyść filtry".

Weryfikacja: render serwerowy strony z parametrami w URL od razu pokazuje przefiltrowaną/posortowaną listę (bez przeskoku po hydracji); zmiana kryterium w wyspie aktualizuje URL i listę; cookie `tl_typefilter` i kliencki `applyTypeFilter` znikają z kodu.

### Kluczowe odkrycia:

- `src/lib/services/items.ts:9` — `ITEM_COLUMNS`; `listByAcceptance` (`:16`) i `listAcceptedByOperational` (`:68`) to dwa rdzenie do złożenia w jeden criteria-driven `listItems`.
- `src/lib/validation/items.ts` — wzorzec zod + `ITEM_TYPES` (z `@/lib/ai/schema`) i `OPERATIONAL_STATUSES`; tu dołożymy `listQuerySchema`.
- `src/lib/http.ts:5` — `json(body, status)` (wspólny helper odpowiedzi).
- `src/pages/api/items/index.ts:26` — wzorzec endpointu: `context.locals.user` guard → `createClient(headers, cookies)` → mutacja → `json(...)`; kształt błędu `{ ok:false, code, error }`.
- `src/components/items/type-filter.ts` — `applyTypeFilter` (do usunięcia), `TYPE_FILTER_VALUES`/`parseTypeFilter` (do reużycia jako walidacja parametru `type`), cookie `TYPE_FILTER_COOKIE` (do usunięcia).
- `src/pages/items/active.astro:31` — `parseTypeFilter(Astro.cookies.get(TYPE_FILTER_COOKIE)?.value)` → zamieniamy na odczyt z `Astro.url.searchParams`.
- `src/components/items/AcceptedItemsView.tsx:94` — `applyTypeFilter(items, typeFilter, pinnedIds)` + `pinnedIds` (`:81`) + `handleFilterChange` zapisujący cookie (`:194`). To centrum migracji.
- `src/components/items/PendingItemsView.tsx` — brak filtra typu; tu dochodzi pasek filtrów.
- `src/components/items/TrashItemsView.tsx:71` — `applyTypeFilter(..., NO_PINNED)`; analogiczna migracja.
- `src/components/items/EditItemDialog.tsx`, `OperationalStatusBadge.tsx`, `selection.ts`, `operational-view.ts` — bez zmian funkcjonalnych (konsumują listę, nie filtrują serwerowo).

## Czego NIE robimy

- **Filtr po sesji importu** oraz **widok elementów sesji (master-detail)** — to S-10 (`session-items-detail`).
- **Zakres dat „od–do"** — data wyłącznie jako klucz sortowania (decyzja użytkownika).
- **Sortowanie złożone** (np. „po dacie, potem po tytule") jako wybór użytkownika — zawsze jedno pole + `id` jako tie-break stabilizujący.
- **Podfiltr stanu operacyjnego poza widokiem Aktywne** — Zakończone/Anulowane mają po jednym stanie, pending i Kosz go nie filtrują.
- **Filtr po poprzednim statusie w Koszu** (`rejected`/`deleted`) — rozróżnienie niesie etykieta wg FR-012 (już wdrożone w `TrashItemsView`).
- **Paginacja / wirtualizacja / `range`** — `target_scale: small`; cała (przefiltrowana) lista ładowana naraz, jak dziś.
- **Zmiana schematu / migracja / nowy indeks** — istniejące kolumny i indeks wystarczają.
- **Wspólny wrapper HTTP dla całego projektu** — nowy hook ma własny fetch; refactor mutacji poza zakresem.

## Podejście do implementacji

Pięć faz, każda samodzielnie weryfikowalna i odpowiadająca jednemu sub-issue na boardzie. Kolejność „od danych do UI": najpierw serwer (serwis → endpoint), potem warstwa klient (hook + URL), na końcu integracja widoków rozbita na dwie fazy (najpierw migracja istniejącego filtra typu na nowy potok — domykająca ścieżkę URL→serwer→render end-to-end; potem nowe kontrolki i finalizacja UX).

1. **Warstwa danych** — `listItems(criteria)` + typ `ListCriteria` + pure (de)serializacja kryteriów ↔ URL + walidacja kryteriów (jeden tolerancyjny parser, bez osobnego zod — patrz Faza 1 §2). Stare funkcje serwisu zostają jako cienkie nakładki (widoki działają do Fazy 4).
2. **Endpoint `GET /api/items`** — parametry z URL → walidacja → `listItems` → `{ ok, items }`.
3. **Hook `useItemList` + synchronizacja adresu** — pobieranie wg kryteriów, ładowanie/błąd, opóźnienie wyszukiwania, zapis kryteriów do URL.
4. **Migracja filtra typu na serwer + URL + SSR** — wszystkie widoki (w tym pending) czytają kryteria z URL i fetchują przez hook; usunięcie cookie + klienckiego `applyTypeFilter` + `pinnedIds`.
5. **Nowe kontrolki + finalizacja UX** — sortowanie, wyszukiwanie, podfiltr stanu operacyjnego (Aktywne); czyszczenie zaznaczenia przy zmianie filtra; komunikat pustego wyniku.

## Krytyczne szczegóły implementacji

- **Re-fetch na zmianę kryteriów, optimistic na mutację.** Zmiana filtra/sortu/szukania = ponowne pobranie z serwera (autorytatywna lista) → naturalnie czyści listę i zaznaczenie. Mutacje (accept/reject/edit/trash/operational) **nie** wymuszają re-fetchu — pozostają przy dotychczasowym optimistic update lokalnego stanu. Dzięki temu zachowanie „edytowany element zostaje widoczny do przełączenia/odświeżenia" (decyzja #6 z S-05) jest utrzymane **bez** mechanizmu `pinnedIds` — bo to zmiana filtra (re-fetch), a nie edycja, usuwa element z widoku. `pinnedIds` i `applyTypeFilter` znikają. Optimistic update nanoszą wyspy przez `applyOptimistic` z hooka (lista jest w gestii hooka — nie ma już lokalnego `setItems` w wyspie).
- **Hydration-stability przez wspólny parser.** Ta sama pure funkcja `parseListCriteria(searchParams)` czyta kryteria po stronie serwera (`Astro.url.searchParams`) i klienta (`window.location.search`) → render SSR i pierwszy stan wyspy są identyczne, brak przeskoku. `view` nie jest parametrem URL — wynika ze ścieżki strony (każda `.astro` go ustala) i wchodzi do kryteriów na sztywno.
- **Opóźnienie tylko dla wyszukiwania.** Pole `q` debounce ~300 ms przed zmianą kryteriów; pozostałe kontrolki (sort, kierunek, typ, stan operacyjny) działają natychmiast.
- **Wyszukiwanie = `ilike` OR po dwóch kolumnach.** `title ILIKE %q% OR description ILIKE %q%`; znaki specjalne `%` i `_` w `q` escapowane przed złożeniem wzorca (inaczej user wpisujący `%` dostaje błędne dopasowania). Dodatkowo delimitery składni `.or()` PostgREST (`,` `(` `)` `.`) są neutralizowane, by user input nie psuł filtra ani nie wstrzykiwał warunków. Pusta/whitespace fraza = brak filtra.
- **Podfiltr operacyjny tylko gdy ma sens.** Parametr `opstatus` honorowany wyłącznie dla `view=active`; dla pozostałych widoków ignorowany (widok i tak zawęża stan). Walidacja akceptuje go jako opcjonalny, serwis stosuje warunkowo.

## Faza 1: Warstwa danych — serwis filtrujący + kryteria

### Przegląd

Jedna funkcja `listItems(supabase, userId, criteria)` zastępująca pięć osobnych zapytań; pure typ i (de)serializacja kryteriów ↔ URL; walidacja zod parametrów. Stare funkcje zostają jako nakładki, więc strony `.astro` działają bez zmian aż do Fazy 4.

### Wymagane zmiany:

#### 1. Typ kryteriów + pure (de)serializacja

**Plik**: `src/lib/services/list-criteria.ts` (nowy) + `list-criteria.test.ts` (nowy)

**Cel**: Jedno źródło prawdy o kryteriach listy i ich mapowaniu na/z parametrów URL — używane przez SSR, endpoint i hook (spójność serwer↔klient).

**Kontrakt**:
- Typ `ListCriteria = { view: MainView; type: TypeFilterValue; sort: "created" | "updated" | "title"; dir: "asc" | "desc"; q: string; opstatus?: OperationalStatus }`, gdzie `MainView = "pending" | "active" | "done" | "cancelled" | "trash"`.
- `parseListCriteria(view: MainView, params: URLSearchParams): ListCriteria` — czyta `type`/`sort`/`dir`/`q`/`opstatus`, waliduje (reużycie `parseTypeFilter`), wstawia **domyślne wg widoku** (pending → `sort:"created", dir:"desc"`; pozostałe → `sort:"updated", dir:"desc"`; `type:"all"`, `q:""`). Wartości niepoprawne → fallback do domyślnej (parser nie rzuca). `q` przycięte do 200 znaków (clamp). To **jedyny** walidator kryteriów — używają go SSR, klient ORAZ endpoint (brak osobnego schematu zod — patrz §2).
- `criteriaToQuery(criteria: ListCriteria): string` — serializuje **tylko pola różne od domyślnych dla danego widoku** (czysty, krótki URL), zwraca query string bez `view`.
- Czyste funkcje, testowane w node.

#### 2. Walidacja parametrów — jeden walidator (bez osobnego schematu zod)

**Decyzja (2026-06-20, sortowanie przeglądu planu)**: NIE dodajemy osobnego `listQuerySchema` (zod). `parseListCriteria` z §1 jest **jedynym** walidatorem kryteriów — tolerancyjny (fallback do domyślnych, nie rzuca), współdzielony przez SSR, klienta i endpoint. To eliminuje rozjazd „tolerancyjny parser vs rygorystyczny zod" (dwa źródła prawdy: pominięcie pól domyślnych przez `criteriaToQuery` vs wymagane enumy w zod → „Wyczyść filtry"/domyślny URL dawałby 400).

**Uzasadnienie**: to GET (odczyt) izolowany przez RLS — twarde 400 na „złym" filtrze daje znikomą wartość, a fallback do domyślnej jest lepszym UX. Twardy limit (`q` ≤ 200) realizuje `parseListCriteria` (clamp w §1). Endpoint waliduje jedynie `view` manualnie (pojedyncze pole skalarne — selektor predykatu; dozwolone regułą).

**Odchylenie od twardej reguły** „multi-field API input → zod" (`CLAUDE.md`/`lessons.md`) — świadomie zaakceptowane przez użytkownika przy bramce przeglądu (lekcja dopuszcza odchylenie po akceptacji człowieka), bo walidacja NIE jest ad-hoc, lecz wydzieloną, testowaną, współdzieloną funkcją. `src/lib/validation/items.ts` nie zyskuje nowego schematu.

#### 3. Funkcja serwisu `listItems`

**Plik**: `src/lib/services/items.ts`

**Cel**: Złożyć w jedno zapytanie: predykat widoku (stan akceptacji/operacyjny), filtr typu, podfiltr operacyjny (tylko `active`), wyszukiwanie, sortowanie.

**Kontrakt**: `listItems(supabase, userId, criteria: ListCriteria): Promise<Item[]>`.
- Bazowo `.from("items").select(ITEM_COLUMNS).eq("user_id", userId)`.
- Predykat widoku: `pending` → `eq("acceptance_status","pending")`; `active` → `eq("accepted") + in("operational_status", ["new","in_progress"])`; `done` → `eq("accepted") + eq("operational_status","done")`; `cancelled` → `eq("accepted") + eq("operational_status","cancelled")`; `trash` → `in("acceptance_status", ["rejected","deleted"])`.
- `type !== "all"` → `eq("type", type)`.
- `view === "active" && opstatus` → `eq("operational_status", opstatus)`.
- `q` (po trim, niepuste) → `.or("title.ilike.%q%,description.ilike.%q%")`; przed złożeniem wzorca z `q` neutralizowane są **zarówno** wildcardy LIKE (`%`/`_`) **jak i** delimitery składni filtra PostgREST (`,` `(` `)` `.`) — inaczej fraza typu `foo,bar` lub `f(x)` rozbije parsowanie `.or()` (błąd albo błędne dopasowania / wstrzyknięcie warunku w obrębie danych usera).
- Sort: mapowanie `created→created_at`, `updated→updated_at`, `title→title`; `.order(<col>, { ascending: dir==="asc" })`, następnie **stały łańcuch tie-break** odwzorowujący dotychczasową kolejność: gdy `<col>` ≠ `created_at` → `.order("created_at", { ascending: false })`, a na końcu **zawsze** `.order("id", { ascending: true })`. Uzasadnienie (F6): `id` to losowy UUID (`gen_random_uuid`), więc sam stabilizuje, ale układa losowo; `created_at DESC` porządkuje **chronologicznie** grupę o wspólnym kluczu głównym (np. paczka bulk-akcji ma wspólny `updated_at`, jeden statement), a `id` jest finalnym stabilizatorem, gdy i `created_at` remisuje (itemy z jednego importu). Bez `created_at` domyślny sort nie-pending zmieniłby kolejność paczek względem dziś.
- `.overrideTypes<Item[], { merge: false }>()`; błąd → `throw new Error("Odczyt itemów nie powiódł się.", { cause })`.

#### 4. Stare funkcje jako nakładki

**Plik**: `src/lib/services/items.ts`

**Cel**: Utrzymać działanie stron `.astro` do Fazy 4 bez przepisywania ich teraz.

**Kontrakt**: `getPendingItems`/`getActiveItems`/`getDoneItems`/`getCancelledItems`/`getTrashItems` delegują do `listItems` z domyślnymi kryteriami danego widoku (zachowany dotychczasowy sort domyślny). `listByAcceptance`/`listAcceptedByOperational` usunięte lub zwinięte do `listItems`.

#### 5. Testy serwisu i kryteriów

**Plik**: `src/lib/services/list-criteria.test.ts`, `src/lib/services/items.test.ts` (jeśli istnieje — rozszerzyć; inaczej nowy)

**Cel**: Pokryć (de)serializację i złożenie zapytania.

**Kontrakt**: `parseListCriteria` — domyślne per widok, fallback dla śmieci, poprawny odczyt każdego pola; `criteriaToQuery` — pomija domyślne, round-trip `parse(query(c)) === c`. `listItems` — weryfikacja składania predykatów (mock klienta supabase / asercje na budowanym zapytaniu, wzorzec istniejących testów serwisu).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna:

- Strony list (`/items`, `/items/active`, …) nadal renderują poprawne listy (nakładki działają) — brak regresji względem stanu sprzed fazy.

**Uwaga implementacyjna**: Po przejściu automatycznych weryfikacji zatrzymaj się na ręczne potwierdzenie człowieka przed Fazą 2.

---

## Faza 2: Endpoint `GET /api/items`

### Przegląd

Pierwszy endpoint czytający query string: parsuje i waliduje parametry, egzekwuje logowanie i RLS, woła `listItems`, zwraca JSON w kanonicznym kształcie.

### Wymagane zmiany:

#### 1. Handler `GET`

**Plik**: `src/pages/api/items/index.ts`

**Cel**: Dołożyć eksport `GET` obok istniejącego `POST` (tworzenie ręczne S-07), bez kolizji.

**Kontrakt**:
- `export const prerender = false` (już jest dla `POST`).
- Guard: `context.locals.user` → brak ⇒ `401 { ok:false, code:"unauthorized", error:"Wymagane logowanie." }`.
- `createClient(context.request.headers, context.cookies)` → brak ⇒ `500 { ok:false, code:"internal", error:"Błąd serwera." }`.
- `view` z `new URL(context.request.url).searchParams` (manualny guard pojedynczego pola): brak / spoza 5 widoków ⇒ `400 { ok:false, code:"bad_request", error:"Nieprawidłowe żądanie." }`.
- `criteria = parseListCriteria(view, searchParams)` (jeden tolerancyjny walidator z Fazy 1 §1 — pozostałe pola: niepoprawne → fallback do domyślnej; `q` clampowane do 200; brak osobnego zod, patrz Faza 1 §2).
- `listItems(supabase, user.id, criteria)` → `200 { ok:true, items }`; wyjątek ⇒ `500 { ok:false, code:"internal", error:"Błąd serwera." }`.
- Odpowiedzi przez `json()` z `src/lib/http.ts`.

#### 2. Testy endpointu

**Plik**: `src/pages/api/items/index.test.ts` (rozszerzyć)

**Cel**: Pokryć ścieżki GET.

**Kontrakt**: 200 z poprawnymi parametrami (zwraca itemy); 400 dla brakującego/niepoprawnego `view`; niepoprawny `sort`/`type` **tolerowany** (200, fallback do domyślnej); 401 bez usera; pusta lista dla filtra bez trafień (200, `items: []`).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna:

- W przeglądarce (zalogowany) `GET /api/items?view=active&type=task&sort=title&dir=asc` zwraca JSON z przefiltrowanymi/posortowanymi itemami; `view=active&q=<fraza>` zawęża po tytule/opisie; brak/niepoprawny `view` → 400; niepoprawny `sort` → tolerowany (domyślny sort).

**Uwaga implementacyjna**: Po przejściu automatycznych weryfikacji zatrzymaj się na ręczne potwierdzenie człowieka przed Fazą 3.

---

## Faza 3: Hook `useItemList` + synchronizacja adresu

### Przegląd

Klientowa warstwa łącząca kryteria z endpointem i adresem strony: pobieranie wg kryteriów, stan ładowania/błędu, opóźnienie wyszukiwania, zapis kryteriów do URL.

### Wymagane zmiany:

#### 1. Hook listy

**Plik**: `src/components/hooks/useItemList.ts` (nowy)

**Cel**: Hermetyzować pobieranie listy wg `ListCriteria` i utrzymywać URL w zgodzie z kryteriami.

**Kontrakt**: `useItemList(view, initialItems, initialCriteria)` zwraca `{ items, criteria, setCriteria, applyOptimistic, loading, error }`.
- `applyOptimistic(updater: (prev: Item[]) => Item[])` → wyspy nanoszą optimistic mutacje na listę będącą w gestii hooka (lista należy do hooka, nie do wyspy). Mutacje **NIE** wymuszają re-fetchu (patrz „Krytyczne szczegóły"); hook nie nadpisuje świeżego optimistic update, dopóki nie nastąpi re-fetch wywołany zmianą kryteriów.
- `setCriteria(next)` → aktualizuje stan, woła `GET /api/items?<criteriaToQuery(next)>` (z `view`), podmienia listę po sukcesie; błąd → `error` (+ zachowanie poprzedniej listy).
- Zmiana pola `q` debounce ~300 ms; pozostałe pola fetchują natychmiast.
- **Tylko najnowsze żądanie wygrywa (F5 — wyścig)**: każde `setCriteria` anuluje poprzedni fetch przez `AbortController` (ref na bieżący kontroler); `AbortError` jest połykany (nie ustawia `error`, nie podmienia listy). Bez tego dwa nakładające się żądania (np. szybka zmiana sort → typ) mogłyby wrócić poza kolejnością i starsza odpowiedź nadpisałaby nowszą („stale wins").
- Po udanym fetchu zapis URL: `history.pushState` dla zmian **dyskretnych** (typ/sort/dir/opstatus — każda tworzy wpis w historii, by „wstecz/dalej" je przełączał) oraz `history.replaceState` dla kolejnych liter wyszukiwania (`q` po debounce — sklejane w jeden wpis, bez śmiecenia historią na każdą literę). Listener `popstate` re-parsuje `location.search` (parser z Fazy 1) → `setCriteria`, dzięki czemu „wstecz/dalej" faktycznie odtwarza filtry (`replaceState` sam nie tworzy wpisów historii, więc bez `pushState` + `popstate` back/forward by nie działał).
- `initialItems` jako stan startowy (z SSR) — brak fetchu na pierwszy render (lista już zgodna z URL dzięki SSR).

#### 2. Testy logiki kryteriów hooka

**Plik**: `src/components/hooks/useItemList.test.ts` (nowy) — w zakresie testowalnym w node

**Cel**: Pokryć składanie URL i mapowanie odpowiedzi (część czysta; zachowanie DOM/fetch weryfikowane ręcznie w Fazie 4–5).

**Kontrakt**: `criteriaToQuery` użyte do budowy URL daje oczekiwany ciąg; mapowanie `{ ok:true, items }` → `items`, `{ ok:false }`/błąd sieci → `error` bez utraty poprzedniej listy. Najnowsze-wygrywa (F5): przy dwóch fetchach (mock, kontrolowana kolejność) starsza odpowiedź nie podmienia listy (`AbortError` połykany / odrzucony jako nie-najnowszy).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`

> Brak osobnej bramki ręcznej w tej fazie — hook nie jest jeszcze renderowany; pełna weryfikacja interakcji następuje w Fazie 4 (build i typy potwierdzają kontrakt hooka).

**Uwaga implementacyjna**: Po przejściu automatycznych weryfikacji zatrzymaj się na ręczne potwierdzenie człowieka przed Fazą 4.

---

## Faza 4: Migracja filtra typu na serwer + URL + SSR

### Przegląd

Przełączenie istniejącego filtra typu (klient + cookie) na nowy potok serwer+URL we **wszystkich** widokach — to domyka ścieżkę URL→serwer→render od końca do końca na działającej już funkcji. Filtr typu wchodzi też do `PendingItemsView`. Usunięcie cookie, klienckiego `applyTypeFilter` i `pinnedIds`.

### Wymagane zmiany:

#### 1. Strony `.astro` czytają URL zamiast cookie

**Pliki**: `src/pages/items.astro`, `src/pages/items/active.astro`, `done.astro`, `cancelled.astro`, `trash.astro`

**Cel**: Render serwerowy wg kryteriów z adresu strony.

**Kontrakt**: Każda strona: `const criteria = parseListCriteria("<view>", Astro.url.searchParams)`; `items = await listItems(supabase, user.id, criteria)`; przekazuje `initialItems={items}` i `initialCriteria={criteria}` do wyspy. Usunięty odczyt cookie (`parseTypeFilter(Astro.cookies...)`, import `TYPE_FILTER_COOKIE`). `view` na sztywno per strona.

#### 2. Wyspy używają hooka i podają filtr typu

**Pliki**: `src/components/items/AcceptedItemsView.tsx`, `PendingItemsView.tsx`, `TrashItemsView.tsx`

**Cel**: Zastąpić kliencki `applyTypeFilter` + cookie pobieraniem przez `useItemList`; dodać `TypeFilter` do pendingów.

**Kontrakt**:
- Wyspa przyjmuje `initialCriteria` i woła `useItemList(view, initialItems, initialCriteria)`; renderuje `items` zwrócone przez hook (bez klienckiego filtrowania).
- `TypeFilter` (istniejący, prezentacyjny) sterowany `criteria.type`; `onChange(next)` → `setCriteria({ ...criteria, type: next })`.
- `PendingItemsView` dostaje `TypeFilter` (dziś go nie ma).
- **Mutacje przez `applyOptimistic`**: `execute` (bulk + „Do kosza"), `handleSaved`, `handleRemoved` oraz `handleCreated` (S-07) nanoszą zmiany przez `applyOptimistic` z hooka zamiast lokalnego `setItems`. W `handleCreated` przełączenie filtra na typ nowego itemu (`nextFilterAfterCreate`) idzie przez `setCriteria` (re-fetch dostarcza autorytatywną listę z nowym itemem); focus (`pendingFocusRef`) działa po nadejściu listy z hooka. `defaultCreateType`/`nextFilterAfterCreate` konsumują `criteria.type` zamiast lokalnego `typeFilter`.
- Usunięte: `applyTypeFilter`, `pinnedIds` i logika przypinania (`handleSaved` już nie przypina — element zostaje w stanie hooka do następnego re-fetchu/zmiany filtra), zapis cookie w `handleFilterChange`.

#### 3. Usunięcie martwego kodu filtra klienckiego

**Plik**: `src/components/items/type-filter.ts`

**Cel**: Wyciąć to, co po migracji nieużywane; zostawić to, co potrzebne walidacji.

**Kontrakt**: Usunięte `applyTypeFilter`, `TYPE_FILTER_COOKIE` (+ ich testy). Zostają `TYPE_FILTER_VALUES`, `TypeFilterValue`, `parseTypeFilter` (reużywane przez `parseListCriteria` i `listQuerySchema`). Jeśli plik osierocony semantycznie — przenieść te eksporty do `list-criteria.ts`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi (brak nieużywanych importów/eksportów): `npm run lint`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna:

- Na każdym widoku (w tym „Elementy do akceptacji") filtr typu działa, a wybór jest widoczny w adresie strony (`?type=task`).
- Odświeżenie strony z `?type=note` pokazuje od razu przefiltrowaną listę (brak przeskoku po hydracji).
- „Wstecz/dalej" przeglądarki przełącza filtr; brak cookie `tl_typefilter` (sprawdź narzędzia przeglądarki).

**Uwaga implementacyjna**: Po przejściu automatycznych weryfikacji zatrzymaj się na ręczne potwierdzenie człowieka przed Fazą 5.

---

## Faza 5: Nowe kontrolki + finalizacja UX

### Przegląd

Dodanie sortowania, wyszukiwania i podfiltra stanu operacyjnego (Aktywne) na nowym potoku oraz domknięcie zachowań przekrojowych: czyszczenie zaznaczenia przy zmianie filtra i komunikat pustego wyniku.

### Wymagane zmiany:

#### 1. Kontrolka sortowania

**Plik**: `src/components/items/SortControl.tsx` (nowy)

**Cel**: Single-select pole sortowania + kierunek.

**Kontrakt**: Props `value: { sort, dir }`, `onChange({ sort, dir })`. Opcje pola: „Tytuł" / „Data utworzenia" / „Data modyfikacji"; przełącznik kierunku (rosnąco/malejąco). Kontrolowany, bez własnego stanu trwałego. Spójny wizualnie z `TypeFilter`/`MainFilterNav`.

#### 2. Pole wyszukiwania

**Plik**: `src/components/items/SearchBox.tsx` (nowy)

**Cel**: Wprowadzanie frazy z opóźnieniem.

**Kontrakt**: Props `value`, `onChange(q)`. Lokalny stan pola dla płynnego pisania; opóźnienie (debounce) realizuje hook (`setCriteria` z polem `q`). Przycisk/ikona czyszczenia frazy.

#### 3. Podfiltr stanu operacyjnego (tylko Aktywne)

**Plik**: `src/components/items/AcceptedItemsView.tsx` (gałąź `view==="active"`) — ewentualnie mały `OperationalSubFilter.tsx`

**Cel**: Zawężenie `nowe` / `w realizacji` w Aktywne.

**Kontrakt**: Renderowany **tylko** dla `view==="active"`; single-select (Wszystkie / Nowe / W realizacji) sterujący `criteria.opstatus` (`undefined` = wszystkie). Pozostałe widoki nie renderują kontrolki.

#### 4. Wpięcie kontrolek + zachowania przekrojowe

**Pliki**: `AcceptedItemsView.tsx`, `PendingItemsView.tsx`, `TrashItemsView.tsx`

**Cel**: Złożyć pasek filtrów i domknąć UX.

**Kontrakt**:
- Pasek filtrów: `TypeFilter` + `SortControl` + `SearchBox` (+ `OperationalSubFilter` w Aktywne), wszystkie sterujące `criteria` przez `setCriteria`.
- **Zmiana dowolnego kryterium czyści zaznaczenie** (`setSelected(new Set())`) — utrzymanie inwariantu „zaznaczenie ⊆ widoczne" i brak akcji na niewidocznych.
- **Pusty wynik**: gdy `items.length === 0` i jakieś kryterium aktywne (`type!=="all" || q!=="" || opstatus || sort/dir≠domyślne) → komunikat „Brak elementów dla wybranych filtrów" + akcja „Wyczyść filtry" (`setCriteria(domyślne dla widoku)`); gdy brak kryteriów → dotychczasowy komunikat pustego widoku.
- Wskaźnik ładowania podczas fetchu (stan `loading` z hooka) — krótki, nieblokujący.
- **Błąd fetchu**: gdy `error` z hooka — widoczny komunikat (toast/inline) „Nie udało się zaktualizować listy" z akcją ponowienia ostatniej zmiany kryteriów. Poprzednia lista zostaje (hook ją zachowuje), więc UI nie pustoszeje — ale użytkownik wie, że filtr się nie zastosował (inaczej nieudana zmiana wygląda jak brak efektu).

#### 5. Testy

**Pliki**: testy pól czystych (jeśli wydzielone), aktualizacja istniejących testów widoków

**Cel**: Pokryć logikę składania kryteriów i pusty stan; zaktualizować testy, które zakładały kliencki `applyTypeFilter`.

**Kontrakt**: Usunięte/zmienione asercje na `applyTypeFilter`; testy pustego stanu (z filtrem vs bez); ewentualne testy `SortControl`/`SearchBox` logiki kontrolowanej.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna:

- Sortowanie: zmiana pola i kierunku przeładowuje listę w nowej kolejności; wybór widoczny w URL (`?sort=title&dir=asc`).
- Wyszukiwanie: wpisanie frazy zawęża po tytule i opisie po krótkim opóźnieniu; URL zawiera `?q=`; znak `%` w zapytaniu nie psuje wyników.
- Aktywne: podfiltr „Nowe"/„W realizacji" zawęża; pozostałe widoki nie mają tej kontrolki.
- Zmiana dowolnego filtra czyści wcześniejsze zaznaczenie.
- Pusty wynik filtra pokazuje komunikat z „Wyczyść filtry"; po wyczyszczeniu wraca pełna lista.
- Pełny round-trip: ustaw filtry → skopiuj URL → otwórz w nowej karcie → ten sam, przefiltrowany widok.

**Uwaga implementacyjna**: Po przejściu automatycznych weryfikacji zatrzymaj się na ręczne potwierdzenie człowieka.

---

## Strategia testowania

### Testy jednostkowe:

- `list-criteria.ts` — `parseListCriteria` (domyślne per widok, fallback dla śmieci, każde pole), `criteriaToQuery` (pomijanie domyślnych, round-trip).
- `items.ts` — `listItems`: predykat każdego widoku, filtr typu, podfiltr operacyjny (tylko active), wyszukiwanie (escapowanie `%`/`_` **oraz** delimiterów PostgREST `,` `(` `)` `.` — test frazy z `,` i `(`), sort + łańcuch tie-break (`created_at` DESC potem `id` ASC — odwzorowanie dotychczasowej kolejności paczek bulk-akcji).
- Endpoint `index.ts` — GET: 200 / 400 (brak/niepoprawny `view`) / 401 / pusty wynik; niepoprawny `sort`/`type` tolerowany (fallback do domyślnej).
- `useItemList` — budowa URL + mapowanie odpowiedzi + najnowsze-wygrywa (część czysta / mock fetch).

### Testy integracyjne:

- (Opcjonalnie, `npm run test:integration`) realny `GET /api/items` z różnymi kombinacjami parametrów względem zaseedowanych danych.

### Kroki testowania ręcznego:

1. Zaloguj się, wejdź na `/items/active`, ustaw `Sortuj: Tytuł rosnąco` — kolejność i URL się zmieniają.
2. Wpisz frazę w wyszukiwarce — lista zawęża się po tytule/opisie; sprawdź frazę ze znakiem `%`.
3. W Aktywne włącz podfiltr „W realizacji" — zostają tylko itemy w realizacji; sprawdź, że Zakończone/Anulowane/pending nie mają tej kontrolki.
4. W „Elementy do akceptacji" użyj filtra typu, sortowania i wyszukiwania.
5. Zaznacz kilka itemów, zmień filtr — zaznaczenie znika.
6. Zawęź filtr do pustego wyniku — komunikat + „Wyczyść filtry".
7. Skopiuj URL z filtrami, otwórz w nowej karcie — ten sam widok; użyj „wstecz/dalej".

## Uwagi dotyczące wydajności

Filtrowanie/sortowanie/wyszukiwanie po stronie serwera na małym wolumenie (`target_scale: small`) jest tanie; istniejący indeks `(user_id, acceptance_status, operational_status)` pokrywa predykat widoku i podfiltr operacyjny. Wyszukiwanie `ilike` bez indeksu pełnotekstowego jest akceptowalne na tej skali (skan po małym zbiorze usera, izolowanym RLS). Każda zmiana kryterium to jeden round-trip; reakcja mieści się w NFR ≤ 200 ms dla typowych wolumenów, a opóźnienie wyszukiwania ogranicza liczbę zapytań. Brak paginacji (cała przefiltrowana lista) — świadome, zgodne ze skalą.

## Uwagi dotyczące migracji

Brak migracji bazy. Zmiana czysto aplikacyjna na istniejących kolumnach i indeksie. Usunięcie cookie `tl_typefilter` jest bezstanowe (stare cookie po prostu przestaje być czytane; wygaśnie samo).

## Referencje

- Roadmapa: `context/foundation/roadmap.md` (S-09; S-10 jako wydzielony zakres sesji)
- PRD: FR-008 (warstwa filtrów dodatkowych); FR-015 (sesja poza filtrami listy — kontekst rozdziału S-09/S-10)
- Lekcje: `context/foundation/lessons.md` (kształt błędu `{ok:false,code,error}`; reguła „zod dla wejścia wielopolowego" — tu świadome odchylenie z akceptacją użytkownika, patrz Faza 1 §2)
- Plan poprzednika: `context/archive/2026-06-15-unified-list-and-edit/plan.md` (S-05 — filtr typu kliencki, który tu migrujemy)
- Wzorzec endpointu: `src/pages/api/items/index.ts`, helper `src/lib/http.ts`
- Filtr typu (do migracji): `src/components/items/type-filter.ts`, `TypeFilter.tsx`

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po zakończeniu kroku. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Warstwa danych — serwis filtrujący + kryteria

#### Automatyczne

- [x] 1.1 Lint przechodzi: `npm run lint` — 645a0b4
- [x] 1.2 Testy jednostkowe przechodzą: `npm test` — 645a0b4
- [x] 1.3 Build przechodzi: `npm run build` — 645a0b4

#### Ręczne

- [x] 1.4 Strony list nadal renderują poprawne listy (nakładki działają — brak regresji) — 645a0b4

### Faza 2: Endpoint `GET /api/items`

#### Automatyczne

- [x] 2.1 Lint przechodzi: `npm run lint` — cee0038
- [x] 2.2 Testy jednostkowe przechodzą: `npm test` — cee0038
- [x] 2.3 Build przechodzi: `npm run build` — cee0038

#### Ręczne

- [x] 2.4 `GET /api/items?view=active&type=task&sort=title&dir=asc` zwraca przefiltrowany/posortowany JSON; brak/niepoprawny `view` → 400 (niepoprawny `sort`/`type` tolerowany) — cee0038

### Faza 3: Hook `useItemList` + synchronizacja adresu

#### Automatyczne

- [x] 3.1 Lint przechodzi: `npm run lint` — cee0038
- [x] 3.2 Testy jednostkowe przechodzą: `npm test` — cee0038
- [x] 3.3 Build przechodzi: `npm run build` — cee0038

### Faza 4: Migracja filtra typu na serwer + URL + SSR

#### Automatyczne

- [x] 4.1 Lint przechodzi (brak nieużywanych importów/eksportów): `npm run lint` — 32ecad5
- [x] 4.2 Testy jednostkowe przechodzą: `npm test` — 32ecad5
- [x] 4.3 Build przechodzi: `npm run build` — 32ecad5

#### Ręczne

- [x] 4.4 Filtr typu działa na każdym widoku (w tym „Elementy do akceptacji") i jest widoczny w adresie strony — 32ecad5
- [x] 4.5 Odświeżenie z `?type=…` pokazuje od razu przefiltrowaną listę (brak przeskoku po hydracji) — 32ecad5
- [x] 4.6 „Wstecz/dalej" przełącza filtr; brak cookie `tl_typefilter` — 32ecad5

### Faza 5: Nowe kontrolki + finalizacja UX

#### Automatyczne

- [x] 5.1 Lint przechodzi: `npm run lint` — 8f1ccf8
- [x] 5.2 Testy jednostkowe przechodzą: `npm test` — 8f1ccf8
- [x] 5.3 Build przechodzi: `npm run build` — 8f1ccf8

#### Ręczne

- [x] 5.4 Sortowanie (pole + kierunek) zmienia kolejność i URL — 8f1ccf8
- [x] 5.5 Wyszukiwanie zawęża po tytule/opisie (z opóźnieniem); znak `%` nie psuje wyników — 8f1ccf8
- [x] 5.6 Podfiltr stanu operacyjnego działa tylko w Aktywne — 8f1ccf8
- [x] 5.7 Zmiana dowolnego filtra czyści zaznaczenie — 8f1ccf8
- [x] 5.8 Pusty wynik pokazuje komunikat + „Wyczyść filtry"; round-trip URL między kartami zachowuje filtry — 8f1ccf8
