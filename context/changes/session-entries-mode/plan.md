# Tryb „Pokaż wpisy" (S-13) — Plan implementacji

## Przegląd

Konsolidacja własności prezentacji i operacji na wpisach: wpisy sesji importu przestają żyć w prawym panelu master-detail (S-10), a stają się **trybem kontekstowym strony listy wpisów** (`/items?session=<id>`): baner sesji, wyszarzone zakładki i filtry z aktywnym „Wyczyść filtry", wszystkie 4 stany akceptacji, akcje pojedyncze zachowane. Dziennik sesji redukuje się do pełnoszerokich kart nawigacyjnych („Pokaż wpisy" / „Ponów"). Równolegle lista wpisów (5 widoków) i tryb sesji dostają paginację stronową (parytet z dorobkiem S-11). Miarą sukcesu jest **zniknięcie drugiej implementacji** (panelowa ścieżka mutacji, osobny hook listy, osobna karta wpisu) — nie samo przeniesienie widoku.

Realizuje S-13 z mapy drogowej; problem sformułowany autorytatywnie w `context/changes/session-entries-mode/frame.md` (pewność WYSOKA).

## Analiza stanu obecnego

- **Dwie implementacje listy wpisów**: trzy widoki główne (`PendingItemsView`/`AcceptedItemsView`/`TrashItemsView`) z kartą inline i semantyką „po akcji wpis znika z listy" (`removeByIds` + `applyOptimistic(filter)`) ORAZ panel `SessionItemsPanel` (S-10) z własną kartą, własnym hookiem `useSessionItems` i semantyką „wpis zostaje w miejscu ze świeżym wierszem" (`acceptItems`/`rejectItems`/`restoreFromTrashItems` z `useItemMutation.ts:110-134`).
- **`?session=` nie przetrwa żadnej interakcji**: `criteriaToQuery` (`src/lib/services/list-criteria.ts:101-110`) buduje adres od zera z pól kryteriów, a `useItemList` zapisuje go `pushState`/`replaceState` po każdym pobraniu (`useItemList.ts:128-133`); `popstate` re-parsuje adres tym samym parserem (`:183-189`). Nieznany parametr jest wymazywany.
- **`MainFilterNav.astro:18`** podświetla zakładkę po dokładnej ścieżce — na `/items?session=` fałszywie świeciłaby „Elementy do akceptacji" nad listą 4 stanów.
- **Paginacja istnieje tylko w dzienniku sesji (S-11)** i jest przyspawana do jego kryteriów: `SessionPagination`/`PageSizeSelect`/`page-size-pref`/`session-pagination` importują `session-list-criteria`. Po stronie danych listy wpisów brakuje wszystkiego: `ListCriteria` bez `page`/`size`, `listItems` bez `range`/`count` (`items.ts:57-100`), `GET /api/items` bez `total`, endpoint sesyjny `GET /api/import-sessions/[id]/items` też bez paginacji.
- **Porty gotowe do przejęcia z panelu**: `EditItemDialog` ma tryb `readOnly` (dziś używa go wyłącznie panel, `SessionItemsPanel.tsx:264-268`); stabilny sort `created_at ASC + id ASC` żyje w `getSessionItems` (`items.ts:139-150`); endpoint sesyjny i serwis S-10 zostają jako warstwa danych.
- **Aparat wyboru dziennika istnieje tylko pod panel**: listbox + roving tabindex + `selectedSessionId` (`SessionsList.tsx:60-97`, `SessionRow.tsx:56-95`, `ImportSessionsView.tsx:45-55`).
- **Martwe/legacy**: `ItemList.astro` (statyczny wariant listy, nieimportowany); nakładki `getPendingItems`/`getActiveItems`/… (`items.ts:103-128`) — strony `.astro` wołają `listItems` bezpośrednio.
- **„Dodaj item"** tworzy wpis bez sesji (`api/items/index.ts:9-13`, NULL-session) — w trybie sesji byłby bez sensu.

## Pożądany stan końcowy

- `/import-sessions`: jedna kolumna pełnoszerokich kart sesji (status, źródło, data, licznik wpisów); „Pokaż wpisy" prowadzi do `/items?session=<id>` (tylko gdy sesja ma żywe wpisy), „Ponów" dla `failed`. Panel, listbox i zaznaczanie sesji nie istnieją.
- `/items?session=<id>`: baner „Wpisy dla sesji importu — <źródło>, <data>" z akcją powrotu do dziennika; zakładki widoków i pasek filtrów wyszarzone, aktywne tylko „Wyczyść filtry" (odpina sesję → `/items`); wszystkie 4 stany akceptacji w porządku `created_at ASC`; akcje pojedyncze per stan (edycja/akceptuj/odrzuć/do kosza/przywróć/podgląd); wpis po akcji zostaje w miejscu ze świeżym wierszem; paginacja. `?session=` przeżywa zmianę strony, wstecz/dalej i odświeżenie.
- 5 widoków `/items*`: paginacja stronowa w pełnym parytecie z dziennikiem (przyciski, skok do strony, rozmiar strony z zapamiętywaniem), dotychczasowa semantyka „po akcji wpis znika" zachowana; przy opustoszałej stronie automatyczne cofnięcie na poprzednią.
- W kodzie: jedna karta wpisu (`ItemCard`), jeden hook listy (`useItemList`), jedna ścieżka mutacji (`useItemMutation`); `SessionItemsPanel`, `useSessionItems` i karta panelowa usunięte.

Weryfikacja: kryteria sukcesu per faza (niżej) + ręczny przepływ end-to-end w fazie 5.

### Kluczowe odkrycia:

- Warianty mutacji zwracające świeże wiersze już istnieją i są addytywne (`useItemMutation.ts:110-134`) — tryb sesji ich użyje bez zmian w API.
- `mapSessionItemsResponse` (`useSessionItems.ts:30-36`) i `mapListResponse` (`useItemList.ts:42-45`) akceptują pola dodatkowe — rozszerzenie odpowiedzi endpointów o `total`/`page`/`pageSize` jest bezpieczne dla działających konsumentów.
- Wzorzec adopcji preferencji rozmiaru strony i pierwszeństwa adresu: `useSessionList.ts:164-174` — do powtórzenia 1:1 dla listy wpisów.
- Lekcja S-11 (impl-review F1): wspólne kryterium musi być doprowadzone do WSZYSTKICH warstw (SSR + endpoint + hook) w tej samej fazie — częściowe wpięcie `size` dało rozjazd hydratacji.
- Lekcja S-12 (lessons.md): zmiany grafu importów wysp weryfikować zimnym startem dev bez `--force` z pokryciem dialogu (`zod`) i trasy API; nowy pakiet osiągalny z grafu wyspy → dopisać do `ssr.optimizeDeps.include` (w tej zmianie nie planujemy nowych pakietów npm).
- Decyzja S-03/S-05 (optimistic concurrency): po akcji zmieniającej wiersz w miejscu wpis musi dostać ŚWIEŻY `updated_at`, inaczej edycja po akcji kończy się fałszywym 409 — stąd warianty `*Items` zamiast lokalnych podmian statusu przy akceptuj/odrzuć/przywróć.

## Czego NIE robimy

- Żadnych zmian schematu bazy ani migracji (paginacja offsetowa na istniejących indeksach; skala MVP — patrz Uwagi o wydajności).
- Zaznaczania zbiorczego i „zaznacz wszystkie" w trybie sesji (decyzja: tylko akcje pojedyncze, parytet z panelem S-10).
- „Dodaj item" w trybie sesji (ukryty — tworzy wpis bez sesji).
- Deep-linku do sesji z poziomu dziennika w jego adresie (`/import-sessions?session=` nie istnieje — wybór sesji przestaje być stanem dziennika).
- Zmiany semantyki widoków głównych: po akcji wpis nadal znika z listy (kolejka robocza); ujednolicenie dotyczy implementacji, nie zachowania.
- Wyszukiwania/filtrów/sortowania w trybie sesji (kontrolki wyszarzone; porządek stały `created_at ASC`).
- Aktualizacji adnotacji PRD (FR-027/FR-008/FR-015 wskazują master-detail S-10) — osobna, późniejsza edycja dokumentu, wzorem aktualizacji FR-009 po S-04.
- Usuwania endpointu `GET /api/import-sessions/[id]/items` — zostaje jako warstwa danych trybu sesji.
- Kursorowej paginacji / `count: "estimated"` — poza skalą MVP (świadomy kompromis jak w S-11).

## Podejście do implementacji

Od danych do prezentacji, bez okresu z utraconą funkcją: najpierw kontrakty danych (addytywnie, z pełną kompatybilnością wstecz — faza 1), potem paginacja UI listy wpisów na uogólnionym dorobku S-11 (faza 2), potem czysty refaktor karty wpisu bez zmiany zachowania (faza 3), potem tryb sesji jako nowa powierzchnia zbudowana wyłącznie ze wspólnych klocków (faza 4), na końcu demontaż master-detail i redukcja dziennika do kart — dopiero gdy zastępstwo działa (faza 5). Fazy 1→2 i 3 są niezależne; 4 wymaga 1+2+3; 5 wymaga 4.

Kluczowa zasada konsolidacji: **jedna implementacja, dwie polityki powierzchni**. Wspólna karta i wspólny hook obsługują obie semantyki — „kolejka" (widoki główne: po akcji wpis znika) i „rejestr" (tryb sesji: wpis zostaje ze świeżym wierszem) — sterowane jawnie przez powierzchnię, nie przez równoległy kod.

## Krytyczne szczegóły implementacji

- **Kolejność i kompatybilność przejściowa (faza 1)**: `listItems` i endpointy dostają paginację jako OPCJONALNĄ — brak parametru okna = dzisiejsze zachowanie (pełna lista). Panel S-10 (żyje do fazy 5) i strony SSR (do fazy 2) muszą działać bez zmian na rozszerzonych kontraktach. Odpowiedzi endpointów rozszerzamy addytywnie.
- **Wszystkie warstwy naraz (faza 2)**: `page`/`size` wchodzą do `ListCriteria`, SSR 5 stron, endpointu i hooka w JEDNEJ fazie (lekcja S-11 F1) — częściowe wpięcie tworzy rozjazd hydratacji na ścieżce `?size=`/`?page=`.
- **`hasActiveFilters` nie może liczyć `page`/`size`** (są preferencją widoku, nie filtrem — wzorzec `session-list-criteria.ts:109-116`); w przeciwnym razie sama zmiana strony pokaże „Wyczyść filtry". W trybie sesji natomiast `session` LICZY SIĘ jako aktywny filtr (pusty wynik ma oferować wyjście).
- **Serializacja trybu sesji**: w trybie sesji `criteriaToQuery` emituje wyłącznie `session` + `page`/`size` różne od domyślnych; NIE emituje `type`/`sort`/`dir`/`q`/`opstatus` (tryb ma własne, stałe domyślne: `created ASC`, bez filtrów). Inaczej wyjście/wejście z trybu zaśmieca adres i psuje round-trip parsera.
- **Sekwencja przy opustoszałej stronie**: auto-cofnięcie (`page-1`) wykonuje hook PO naniesieniu optimistic (obserwując pustą listę przy `settledCriteria.page > 1`), jako zwykłe `setCriteria` → re-fetch; nie wolno cofać strony przed naniesieniem mutacji, bo re-fetch mógłby wyścigować się z akcją serwera.
- **Świeży wiersz zamiast lokalnej podmiany statusu** przy akceptuj/odrzuć/przywróć w trybie sesji (patrz Kluczowe odkrycia — fałszywy 409). Wyjątek: „Do kosza" może pozostać lokalną zmianą statusu (wpis staje się read-only, edycja po niej nie następuje) — jak w panelu (`SessionItemsPanel.tsx:49-66`).
- **Weryfikacja dev SSR (fazy 3–5)**: każda zmiana grafu importów wysp (nowe/przenoszone/usuwane moduły) → zimny start `npm run dev` bez `--force`, sesja pokrywająca render wysp + dialog edycji + trasę API, kryterium zero „optimized dependencies changed. reloading" (lekcje S-08/S-10/S-12).

## Faza 1: Kontrakty danych paginacji (serwis + endpointy)

### Przegląd

Warstwa danych zdolna do stronicowania, w pełni kompatybilna wstecz: `listItems` i `getSessionItems` zwracają `{ items, total }` i przyjmują opcjonalne okno; oba endpointy list przyjmują `page`/`size` i zwracają `total`. Zero zmian w UI.

### Wymagane zmiany:

#### 1. Pula rozmiarów strony i pomocnicze parsery

**Plik**: `src/lib/services/list-criteria.ts`

**Cel**: Jedno źródło puli rozmiarów strony listy wpisów i tolerancyjnych parserów okna, współdzielone przez endpointy (faza 1) oraz parser kryteriów i UI (faza 2).

**Kontrakt**: `export const ITEM_PAGE_SIZES = [10, 15, 25, 50, 100] as const` i `export const ITEM_PAGE_SIZE = 10` (lustro `SESSION_PAGE_SIZES`); `export function parseItemPage(value: string | null): number` (całkowite ≥ 1, śmieć → 1) i `export function parseItemSize(value: string | null): number | null` (wartość z puli albo `null` = brak paginacji — kompat przejściowy fazy 1; od fazy 2 wywołujący rozstrzygają `null` na `ITEM_PAGE_SIZE`). `ListCriteria` w tej fazie BEZ zmian.

#### 2. Serwis odczytu wpisów z oknem i licznikiem

**Plik**: `src/lib/services/items.ts`

**Cel**: `listItems` i `getSessionItems` stronicują i zwracają łączną liczbę pasujących wierszy, zachowując dzisiejsze zachowanie przy braku okna.

**Kontrakt**: `listItems(supabase, userId, criteria, window?: { page: number; size: number }): Promise<{ items: Item[]; total: number }>` — `select(..., { count: "exact" })`; przy `window` dokłada `.range(from, to)` (wzorzec `getImportSessions`, `import-session.ts:100-125`); łańcuch sortowania z tie-break bez zmian. Analogicznie `getSessionItems(supabase, userId, sessionId, window?)` → `{ items, total }` (sort `created_at ASC + id ASC` bez zmian). Nieużywane nakładki `getPendingItems`/`getActiveItems`/`getDoneItems`/`getCancelledItems`/`getTrashItems` — potwierdzić grepem brak importów i USUNĄĆ w tej fazie (razem z ich przypadkami testowymi); jeśli któraś jest używana, dostosować wywołanie.

#### 3. Endpoint kolekcji wpisów

**Plik**: `src/pages/api/items/index.ts`

**Cel**: `GET /api/items` przyjmuje opcjonalne okno i zwraca licznik — bez łamania obecnego klienta (`useItemList` do fazy 2 nie wysyła okna).

**Kontrakt**: odczyt `page`/`size` przez `parseItemPage`/`parseItemSize`; `size === null` → wywołanie bez okna (pełna lista, jak dziś). Odpowiedź: `{ ok: true, items, total }` zawsze; przy oknie dodatkowo `page`, `pageSize` (echo, wzorzec `GET /api/import-sessions`).

#### 4. Endpoint wpisów sesji

**Plik**: `src/pages/api/import-sessions/[id]/items.ts`

**Cel**: paginacja wpisów jednej sesji dla trybu sesji (faza 4), z pełną kompatybilnością dla panelu S-10 (bez parametrów = pełna lista).

**Kontrakt**: jak wyżej — `page`/`size` opcjonalne (te same parsery i pula), odpowiedź `{ ok: true, items, total }` (+ `page`/`pageSize` przy oknie). Walidacja UUID ścieżki bez zmian.

#### 5. Testy czystej logiki i endpointów

**Plik**: `src/lib/services/list-criteria.test.ts`, `src/lib/services/items.test.ts`, `src/pages/api/items/index.test.ts`, testy endpointu sesyjnego (dopisać do istniejących zestawów)

**Cel**: parsery okna (clamp, pula, śmieć), kształt `{ items, total }`, zakres `range` z okna, addytywność odpowiedzi (stare pola nienaruszone), ścieżka bez okna identyczna z dotychczasową.

**Kontrakt**: rozszerzenie istniejących plików testowych; wzorce mocków jak w obecnych testach serwisu/endpointów.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą: `npm run test`
- Build produkcyjny przechodzi: `npm run build`

#### Weryfikacja ręczna:

- `/items*` i `/import-sessions` (w tym panel S-10) działają bez żadnej widocznej zmiany (kompatybilność wstecz ścieżki bez okna)

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznych zatrzymaj się na ręczne potwierdzenie, zanim przejdziesz do fazy 2.

---

## Faza 2: Paginacja na 5 widokach listy wpisów (uogólnienie dorobku S-11)

### Przegląd

Uogólnienie komponentów paginacji z dziennika do postaci wielokrotnego użytku i wpięcie stronicowania w listę wpisów przez WSZYSTKIE warstwy naraz (parser → SSR → endpoint → hook → kontrolki). Dziennik sesji zachowuje się identycznie jak dziś (zmienia tylko źródło importów).

### Wymagane zmiany:

#### 1. Współdzielone komponenty i logika paginacji

**Plik**: nowy katalog `src/components/lists/` — `Pagination.tsx`, `PageSizeSelect.tsx`, `pagination.ts`, `page-size-pref.ts`; usunięcie `src/components/import-sessions/SessionPagination.tsx`, `PageSizeSelect.tsx`, `session-pagination.ts`, `page-size-pref.ts` (+ przeniesienie ich testów)

**Cel**: jeden zestaw kontrolek i czystej logiki stronicowania dla dziennika i listy wpisów — bez kopii.

**Kontrakt**: `Pagination` (props: `page`, `pageCount`, `onPage`, `ariaLabel`) i `PageSizeSelect` (props: `value`, `onChange`, `sizes: readonly number[]`, `ariaLabel`) — dzisiejsze zachowania 1:1 (pole skoku niekontrolowane z `key={page}`, commit na Enter/blur, spinner natychmiast). `pagination.ts`: `pageNav`, `clampPage` bez zmian; `resetToFirstPage<T extends { page: number }>(criteria: T): T` (uogólnienie typu). `page-size-pref.ts`: funkcje przyjmują klucz i pulę — `readPageSizePref(key, sizes)`, `writePageSizePref(key, sizes, n)`; klucze: dziennik `"tasker.sessionLog.pageSize"` (bez zmiany wartości klucza!), lista wpisów `"tasker.itemsList.pageSize"`. `ImportSessionsView` i `useSessionList` przechodzą na nowe importy.

#### 2. Kryteria listy wpisów z oknem strony

**Plik**: `src/lib/services/list-criteria.ts` (+ `list-criteria.test.ts`)

**Cel**: `page`/`size` stają się częścią kryteriów listy wpisów — adres strony niesie okno, round-trip parsera je zachowuje.

**Kontrakt**: `ListCriteria` + `page: number` (domyślnie 1) + `size: number` (domyślnie `ITEM_PAGE_SIZE`, walidacja do puli); `parseListCriteria` czyta oba (tolerancyjnie); `criteriaToQuery` emituje `page` tylko gdy > 1 i `size` tylko gdy ≠ domyślny; `hasActiveFilters` liczone z pominięciem `page`/`size` (porównanie po znormalizowaniu okna do domyślnych). `parseItemSize` przestaje zwracać `null` w ścieżce kryteriów (rozstrzyganie na `ITEM_PAGE_SIZE`); endpointy z fazy 1 przechodzą na kryteria (patrz punkt 4).

#### 3. Hook listy z paginacją

**Plik**: `src/components/hooks/useItemList.ts` (+ `useItemList.test.ts`)

**Cel**: hook zna okno strony: buduje adresy żądań z oknem, utrzymuje `total`/`page`/`pageCount`, adoptuje preferencję rozmiaru i cofa stronę, gdy optimistic ją opróżni.

**Kontrakt**: sygnatura `useItemList(view, initialItems, initialCriteria, initialTotal)`; zwraca dodatkowo `total`, `page`, `pageCount` (wzorzec `useSessionList.ts:181-195`). `mapListResponse` przyjmuje `total` (brak pola → `items.length`, tolerancyjnie). Reguły kryteriów: zmiana filtra/sortu/frazy → `resetToFirstPage`; zmiana samej strony zachowuje resztę; `isSearchOnlyChange` ignoruje `page` (zmiana `q` + reset strony nadal jest „tylko wyszukiwaniem" — debounce + `replaceState`). Adopcja preferencji rozmiaru na „gołym" adresie (URL bez `size` → odczyt preferencji, re-fetch bez zapisu adresu; URL ma pierwszeństwo — wzorzec `useSessionList.ts:166-174`). `applyOptimistic`: hook koryguje `total` o różnicę długości listy (usunięcia), a gdy lista opustoszeje przy `settledCriteria.page > 1` → automatyczne `setCriteria` na stronę `page - 1`.

#### 4. SSR 5 stron + endpoint + widoki (wszystkie warstwy naraz)

**Plik**: `src/pages/items.astro`, `src/pages/items/{active,done,cancelled,trash}.astro`; `src/pages/api/items/index.ts`; `src/components/items/{PendingItemsView,AcceptedItemsView,TrashItemsView}.tsx`

**Cel**: pełny parytet paginacji z dziennikiem na wszystkich widokach listy wpisów, bez rozjazdu hydratacji.

**Kontrakt**: strony `.astro` przekazują okno z kryteriów do `listItems` (`window: { page: criteria.page, size: criteria.size }`) i podają wyspie `initialTotal`; endpoint `GET /api/items` czyta okno z `parseListCriteria` (spójnie z SSR — koniec ścieżki `size === null`); widoki renderują pod listą `PageSizeSelect` (zapis preferencji przy zmianie + `resetToFirstPage`) i `Pagination` (zmiana strony zachowuje filtry — wzorzec `ImportSessionsView.tsx:113-130`). Semantyka akcji widoków bez zmian (wpis znika; strona może być chwilowo krótsza — kompensuje auto-cofnięcie i licznik z hooka).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą: `npm run test`
- Build produkcyjny przechodzi: `npm run build`

#### Weryfikacja ręczna:

- Wejście z `?page=2&size=25` renderuje po stronie serwera dokładnie to, co pierwszy stan wyspy (bez przeskoku po nawodnieniu) na wszystkich 5 widokach
- Zmiana filtra/sortu/frazy wraca na stronę 1; zmiana strony zachowuje filtry; wstecz/dalej przeglądarki przełącza strony; preferencja rozmiaru adoptowana na gołym adresie, URL z `size` ma pierwszeństwo
- Opróżnienie strony akcjami (np. akceptacja wszystkich pendingów strony > 1) cofa na poprzednią stronę
- Dziennik sesji działa jak dotychczas (przyciski, skok, rozmiar strony, zapamiętywanie)
- Zimny start `npm run dev` bez `--force`: sesja z renderem wysp + dialogiem + trasą API, zero „optimized dependencies changed. reloading" (przeniesione moduły zmieniają graf wyspy)

**Uwaga implementacyjna**: Po zakończeniu tej fazy zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Faza 3: Wspólna karta wpisu (refaktor bez zmiany zachowania)

### Przegląd

Ekstrakcja jednej karty wpisu z trzech widoków głównych — fundament pod tryb sesji. Po tej fazie użytkownik nie widzi ŻADNEJ różnicy.

### Wymagane zmiany:

#### 1. Komponent karty i czysta logika widoczności akcji

**Plik**: nowe `src/components/items/ItemCard.tsx` + `src/components/items/item-card.ts` (+ `item-card.test.ts`)

**Cel**: jedna karta świadoma 4 stanów akceptacji, konfigurowana przez powierzchnię (badge'e, zaznaczanie, zestaw akcji), zamiast trzech kopii inline JSX i czwartej w panelu.

**Kontrakt**: `ItemCard` props: `item: Item`; `badges: { acceptance?: boolean; operational?: boolean; origin?: boolean }`; `selectable?: boolean` + `selected` + `onToggleSelect`; `inFlight?: boolean` (wygaszenie `opacity-50` + blokada); handlery opcjonalne — `onEdit`, `onAccept`, `onReject`, `onTrash`, `onRestore`, `onPreview`. Akcja renderuje się TYLKO gdy podano handler ORAZ stan wpisu na nią pozwala — reguły „stan → dozwolone akcje" jako czysta funkcja w `item-card.ts` (testowana w node): `pending` → edytuj/akceptuj/odrzuć; `accepted` → edytuj/do kosza; `rejected`/`deleted` → podgląd/przywróć. Wygląd: obecna karta widoków (badge typu + tytuł + opis line-clamp), badge'e stanu jak w panelu (`SessionItemsPanel.tsx:161-172`), etykiety z `@/lib/labels`.

#### 2. Przełączenie trzech widoków na kartę

**Plik**: `src/components/items/PendingItemsView.tsx` (karta inline `:250-306`), `src/components/items/AcceptedItemsView.tsx` (`:349-400`), `src/components/items/TrashItemsView.tsx` (`:249-289`)

**Cel**: widoki przestają posiadać własne karty; zachowanie (akcje, zaznaczanie, potwierdzenia, semantyka znikania, focus świeżego wpisu) identyczne jak przed refaktorem.

**Kontrakt**: Pending → `ItemCard` z `selectable` + `onEdit`/`onAccept`/`onReject`, badge tylko typu; Accepted → `selectable` + `onEdit`/`onTrash`, badge operacyjny; Trash → `selectable` + `onRestore`, badge pochodzenia (`acceptanceOriginLabel`). Handlery, dialogi i paski zbiorcze widoków bez zmian.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą: `npm run test` (w tym nowe `item-card.test.ts`)
- Build produkcyjny przechodzi: `npm run build`

#### Weryfikacja ręczna:

- Przegląd wizualny 3 widoków + panelu S-10 (jeszcze żyje): karty wyglądają i zachowują się jak przed zmianą (akcje, zaznaczanie, wygaszanie w locie, dialogi)
- Zimny start dev bez `--force`: zero re-optymalizacji (nowe moduły w grafie wyspy)

**Uwaga implementacyjna**: Po zakończeniu tej fazy zatrzymaj się na ręczne potwierdzenie przed fazą 4.

---

## Faza 4: Tryb sesji na `/items?session=<id>`

### Przegląd

Nowa powierzchnia z wyłącznie wspólnych klocków: kryteria z `session`, baner z metadanymi sesji, wyszarzone zakładki/filtry z aktywnym „Wyczyść filtry", lista 4 stanów na `ItemCard` w polityce „rejestr zostaje", paginacja, obsługa złego odnośnika. Panel S-10 nadal działa (znika w fazie 5).

### Wymagane zmiany:

#### 1. `session` w kryteriach listy

**Plik**: `src/lib/services/list-criteria.ts` (+ testy)

**Cel**: tożsamość trybu sesji żyje w kryteriach i przeżywa cały cykl adresu (parse → serialize → pushState → popstate → refresh).

**Kontrakt**: `ListCriteria` + `session?: string`. `parseListCriteria`: niepusty `session` (przycięty, limit długości 64 znaki) wchodzi do kryteriów, a pola filtrów przyjmują STAŁE domyślne trybu: `type: "all"`, `sort: "created"`, `dir: "asc"`, `q: ""`, `opstatus: undefined` (parametry filtrów w adresie są w trybie ignorowane). `criteriaToQuery` w trybie sesji emituje wyłącznie `session` + `page`/`size` różne od domyślnych. `hasActiveFilters` zwraca `true`, gdy `session` ustawione. Format UUID NIE jest walidowany w parserze (tolerancyjność); walidują SSR i endpoint.

#### 2. Rozgałęzienie adresu żądania w hooku

**Plik**: `src/components/hooks/useItemList.ts` (+ testy)

**Cel**: jeden hook obsługuje obie powierzchnie — o endpointcie decydują kryteria.

**Kontrakt**: `buildListUrl(criteria)`: gdy `criteria.session` → `/api/import-sessions/<session>/items?page=…&size=…` (bez `view` — sesja to zakres, nie widok); w przeciwnym razie jak dziś. Reszta mechaniki hooka (token, abort, historia, popstate, optimistic, auto-cofnięcie strony) bez zmian — działa dla obu gałęzi.

#### 3. Metadane sesji dla banera (SSR)

**Plik**: `src/lib/services/import-session.ts` (+ testy)

**Cel**: baner potrzebuje źródła/daty/statusu sesji, a strona musi odróżnić „sesja niedostępna" od „sesja pusta" — rozstrzyga serwer.

**Kontrakt**: `getSessionMeta(supabase, userId, sessionId): Promise<SessionRowData | null>` — pojedynczy wiersz tym samym kształtem `select` co `getImportSessions` (z `import_files` i `items(count)`), mapowany współdzielonym `toSessionRow`; nieistniejąca/cudza sesja → `null` (RLS). Zły format UUID rozstrzyga strona przed wywołaniem (ten sam `z.uuid()` co endpoint).

#### 4. Strona `/items` w trybie sesji

**Plik**: `src/pages/items.astro`; nowy `src/components/items/SessionBanner.astro`; `src/components/items/MainFilterNav.astro`

**Cel**: strona rozpoznaje tryb, renderuje baner i wyszarzoną nawigację oraz montuje widok trybu z danymi początkowymi.

**Kontrakt**: `items.astro` — gdy `criteria.session`: walidacja UUID (`z.uuid()`); poprawny → `getSessionMeta` + `getSessionItems` z oknem (pierwsza strona); niepoprawny/`null` → wariant „sesja niedostępna" (baner z komunikatem + akcje wyjścia, bez listy). Render: `SessionBanner` („Wpisy dla sesji importu — <źródło>, <data>" + status + „Wróć do dziennika" → `/import-sessions`), `MainFilterNav` z nowym prop `disabled` (zakładki jako nieaktywne elementy z `aria-disabled`, bez `href`, przygaszone), wyspa `SessionEntriesView` zamiast `PendingItemsView`. Bez trybu — strona jak dziś.

#### 5. Widok trybu sesji

**Plik**: nowy `src/components/items/SessionEntriesView.tsx`; `src/components/items/ListFilterBar.tsx` (prop `disabled`)

**Cel**: rejestr wpisów jednej sesji: wszystkie stany, akcje pojedyncze, wpis po akcji zostaje w miejscu.

**Kontrakt**: wyspa na `useItemList` (kryteria z `session`, `initialTotal`), `ItemCard` z badge'ami `acceptance` + `operational`, bez `selectable`, z kompletem handlerów: `onEdit` (pending/accepted → `EditItemDialog`), `onAccept`/`onReject` (pending → `acceptItems`/`rejectItems`, świeży wiersz przez `applyOptimistic` z podmianą po `id`), `onTrash` (accepted → `moveToTrash` + lokalna zmiana statusu na `deleted`), `onRestore` (`restoreFromTrashItems`, świeży wiersz), `onPreview` (rejected/deleted → `EditItemDialog readOnly`). Blokada podwójnej akcji per wpis (`inFlight`, wzorzec panelu). `ListFilterBar` z prop `disabled: boolean` — kontrolki wyszarzone i nieaktywne, AKTYWNY pozostaje wyłącznie przycisk „Wyczyść filtry" wykonujący pełną nawigację na `/items` (wyjście z trybu wymaga ponownego renderu serwerowego — zakładki wracają do życia). Pod listą `Pagination` + `PageSizeSelect` (klucz preferencji wspólny z listą wpisów: `"tasker.itemsList.pageSize"`). Bez „Dodaj item". Toasty jak w panelu.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą: `npm run test` (round-trip kryteriów z `session`, rozgałęzienie `buildListUrl`, `getSessionMeta`)
- Build produkcyjny przechodzi: `npm run build`

#### Weryfikacja ręczna:

- Wejście na `/items?session=<id>` (ręcznie wklejony adres): baner z metadanymi, zakładki i filtry wyszarzone, lista wszystkich stanów w porządku utworzenia, paginacja działa, `?session=` przeżywa zmianę strony / wstecz-dalej / odświeżenie
- Akcje: akceptuj/odrzuć na pending zostawia wpis ze zmienionym oznaczeniem i świeżym wierszem (edycja zaraz po akcji NIE daje 409); do kosza → wpis read-only w miejscu; przywróć działa dwukierunkowo; podgląd read-only dla odrzuconych/usuniętych
- „Wyczyść filtry" wychodzi na `/items` (zakładki i filtry aktywne); „Wróć do dziennika" prowadzi do `/import-sessions`
- Zły odnośnik (`?session=` śmieciowy, nieistniejący, cudzy): komunikat „sesja niedostępna" + akcje wyjścia, bez listy i bez błędu w konsoli
- Zimny start dev bez `--force`: zero re-optymalizacji; pokrycie: tryb sesji + dialog edycji + akcja API

**Uwaga implementacyjna**: Po zakończeniu tej fazy zatrzymaj się na ręczne potwierdzenie przed fazą 5.

---

## Faza 5: Dziennik jako karty + demontaż master-detail

### Przegląd

Dziennik staje się jedną kolumną pełnoszerokich kart z akcjami nawigacyjnymi; panel, hook panelu i aparat wyboru znikają. Sprzątanie martwego kodu.

### Wymagane zmiany:

#### 1. Karta sesji

**Plik**: `src/components/import-sessions/SessionRow.tsx` → przekształcenie w `SessionCard.tsx` (eksport typu `SessionRowData` zostaje — aktualizacja importów: `useSessionList`, `import-session.ts`, `ImportSessionsView`)

**Cel**: wiersz-listbox zamienia się w kartę nawigacyjną — klikalne są wyłącznie akcje, nie cała karta.

**Kontrakt**: karta pokazuje: badge statusu, źródło (plik → nazwa pliku, tekst → skrót `preview`; pole już jest w DTO), datę, licznik wpisów („X z Y wpisów" przy rozjeździe żywych — logika z dzisiejszego wiersza). Akcje: „Pokaż wpisy" jako odnośnik `<a href="/items?session=<id>">` renderowany TYLKO gdy (rozstrzygnięty po ewentualnym ponowieniu) status `completed_with_items` i żywych wpisów > 0; „Ponów" dla `failed` (istniejący `useSessionRetry` — po udanym ponowieniu karta w miejscu pokazuje nowy status i „Pokaż wpisy"). `processing`/`completed_no_items`/wyczyszczone do zera → bez akcji. Usunięte: `role="option"`, `aria-selected`, `tabIndex`, `data-row-index`, `onSelect`, `onKeyDown`, klik na całym wierszu.

#### 2. Lista i widok dziennika bez aparatu wyboru

**Plik**: `src/components/import-sessions/SessionsList.tsx`, `src/components/import-sessions/ImportSessionsView.tsx`

**Cel**: dziennik jako prosta, pełnoszeroka lista kart; koniec dwukolumnowego grida i stanu wyboru.

**Kontrakt**: `SessionsList` — zwykła `<ul>` kart (bez `role="listbox"`, nawigacji strzałkami i roving tabindex); oba puste stany (z filtrem / bez) bez zmian. `ImportSessionsView` — usunięcie `selectedSessionId`, `SessionItemsPanel`, grida `md:grid-cols-…` i nagłówków kolumn; zostaje: pasek filtrów, lista kart, kontrolki stron i rozmiaru, wskaźnik ładowania, baner błędu z ponowieniem, `Toaster`.

#### 3. Usunięcie drugiej implementacji i martwego kodu

**Plik**: usunięcia — `src/components/import-sessions/SessionItemsPanel.tsx`, `src/components/hooks/useSessionItems.ts`, `src/components/hooks/useSessionItems.test.ts`, `src/components/items/ItemList.astro`

**Cel**: domknięcie miary sukcesu ramki — druga implementacja listy wpisów przestaje istnieć.

**Kontrakt**: przed usunięciem grep potwierdza brak pozostałych importów; `acceptItems`/`rejectItems`/`restoreFromTrashItems` w `useItemMutation` ZOSTAJĄ (konsumuje je tryb sesji — zaktualizować komentarze „S-10/panel" na „tryb sesji"); endpoint `[id]/items` zostaje. Komentarze plików dziennika odwołujące się do master-detail/S-10 — zaktualizować przy okazji edycji tych plików.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą: `npm run test` (zestaw `useSessionItems.test.ts` usunięty razem z hookiem)
- Build produkcyjny przechodzi: `npm run build`

#### Weryfikacja ręczna:

- Dziennik: karty pełnej szerokości ze statusem/źródłem/datą/licznikiem; „Pokaż wpisy" tylko tam, gdzie są żywe wpisy; „Ponów" na `failed` działa i po sukcesie karta pokazuje „Pokaż wpisy"; filtry/sort/paginacja dziennika bez regresji
- Pełny przepływ end-to-end: dziennik → „Pokaż wpisy" → tryb sesji (akcje, paginacja) → „Wyczyść filtry" → `/items` → zakładki działają; wstecz przeglądarki przechodzi poprawnie przez cały łańcuch
- Zimny start dev bez `--force` (usunięcia zmieniają graf wysp): zero re-optymalizacji; dodatkowo `npm run preview` — render produkcyjny dziennika i trybu sesji bez błędów

**Uwaga implementacyjna**: Po zakończeniu tej fazy i weryfikacji ręcznej zmiana jest funkcjonalnie kompletna.

---

## Strategia testowania

### Testy jednostkowe (node, vitest — konwencja: czysta logika w `.ts`, render weryfikowany ręcznie):

- `list-criteria`: round-trip parse↔serialize dla okna (`page`/`size`) i trybu sesji (`session` + stałe domyślne trybu); `hasActiveFilters` bez okna / z sesją; clampy i tolerancja śmieci
- `items` (serwis): kształt `{ items, total }`, zakres okna, ścieżka bez okna; `getSessionMeta` (wiersz/`null`)
- `useItemList` (czyste funkcje): `buildListUrl` (gałąź widoku vs sesji), `mapListResponse` z `total` i bez, `isSearchOnlyChange` z resetem strony
- `item-card`: mapowanie „stan → dozwolone akcje" dla 4 stanów
- `pagination`/`page-size-pref` (uogólnione): istniejące przypadki + parametryzacja klucza/puli
- Endpointy: okno w `GET /api/items` i `GET /api/import-sessions/[id]/items` (z oknem / bez), addytywność odpowiedzi

### Testy integracyjne:

- Brak nowych (projekt nie ma jeszcze umowy testowej z Modułu 3; `npm run test:integration` pozostaje bez zmian)

### Kroki testowania ręcznego:

1. Faza 2: parytet SSR↔wyspa na `?page=&size=` (wszystkie 5 widoków), adopcja preferencji, auto-cofnięcie strony
2. Faza 4: pełny cykl trybu sesji (wejście, akcje ze świeżym wierszem — edycja po akcji bez 409, wyjścia, zły odnośnik, trwałość `?session=`)
3. Faza 5: przepływ end-to-end dziennik → tryb → lista; regresja dziennika
4. Po każdej fazie dotykającej wysp: zimny start `npm run dev` bez `--force`, pokrycie dialog + API, zero „optimized dependencies changed. reloading" (lekcja S-12); fazy 4–5 dodatkowo `npm run preview`

## Uwagi dotyczące wydajności

- `count: "exact"` + paginacja offsetowa — świadomy kompromis MVP jak w S-11 (`import-session.ts:110-112`): koszt rośnie ze skalą, przy setkach wpisów pomijalny; kursor/`estimated` poza zakresem.
- Sesja ma twardy sufit ~100 wpisów (FR-020), więc tryb sesji stronicuje mały zbiór — paginacja jest tu spójnością UX, nie ratunkiem wydajności.
- Bez nowych indeksów: zapytania listy wpisów filtrują po `user_id` + stan, sort z tie-break jak dotychczas — bez zmiany planów zapytań względem stanu obecnego.

## Uwagi dotyczące migracji

- Brak migracji bazy danych.
- Kontrakty API rozszerzane wyłącznie addytywnie; jedyny konsument usuwanych zachowań (panel S-10) znika w tej samej zmianie (faza 5).
- Klucz preferencji dziennika (`tasker.sessionLog.pageSize`) zachowuje nazwę — zapamiętane wartości użytkownika przeżywają zmianę.

## Referencje

- Brief ramowy: `context/changes/session-entries-mode/frame.md` (wymagania obowiązkowe 1–6 → pokryte fazami: 1↦F4, 2↦F4, 3↦F3+F4, 4↦F4, 5↦F4, 6↦F1+F2)
- Mapa drogowa: `context/foundation/roadmap.md` §S-13 (decyzje 2026-07-01)
- Wzorce paginacji: `context/archive/2026-06-28-session-log-filter-ux/` (plan-brief, impl-review F1/F3)
- Decyzje master-detail i semantyka panelu: `context/archive/2026-06-24-session-items-detail/` (plan-brief, aneks 2026-06-27)
- Lekcje: `context/foundation/lessons.md` (dup-React SSR ×3, kryterium przez wszystkie warstwy, optimistic concurrency)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Kontrakty danych paginacji (serwis + endpointy)

#### Automated

- [x] 1.1 Lint przechodzi (`npm run lint`) — cdf1ba1
- [x] 1.2 Testy jednostkowe przechodzą (`npm run test`) — cdf1ba1
- [x] 1.3 Build produkcyjny przechodzi (`npm run build`) — cdf1ba1

#### Manual

- [x] 1.4 `/items*` i `/import-sessions` (z panelem S-10) działają bez widocznej zmiany — cdf1ba1

### Phase 2: Paginacja na 5 widokach listy wpisów

#### Automated

- [x] 2.1 Lint przechodzi (`npm run lint`)
- [x] 2.2 Testy jednostkowe przechodzą (`npm run test`)
- [x] 2.3 Build produkcyjny przechodzi (`npm run build`)

#### Manual

- [x] 2.4 Parytet SSR↔wyspa na `?page=&size=` bez przeskoku po nawodnieniu (5 widoków)
- [x] 2.5 Reset strony przy zmianie filtrów, trwałość przy zmianie strony, wstecz/dalej, adopcja preferencji rozmiaru
- [x] 2.6 Auto-cofnięcie przy opustoszałej stronie
- [x] 2.7 Dziennik sesji bez regresji (przyciski, skok, rozmiar, zapamiętywanie)
- [x] 2.8 Zimny start dev bez `--force`: zero re-optymalizacji (pokrycie: wyspy + dialog + API)

### Phase 3: Wspólna karta wpisu

#### Automated

- [ ] 3.1 Lint przechodzi (`npm run lint`)
- [ ] 3.2 Testy jednostkowe przechodzą (`npm run test`, w tym `item-card.test.ts`)
- [ ] 3.3 Build produkcyjny przechodzi (`npm run build`)

#### Manual

- [ ] 3.4 Przegląd wizualny 3 widoków + panelu S-10: zachowanie i wygląd identyczne jak przed refaktorem
- [ ] 3.5 Zimny start dev bez `--force`: zero re-optymalizacji

### Phase 4: Tryb sesji na /items?session=

#### Automated

- [ ] 4.1 Lint przechodzi (`npm run lint`)
- [ ] 4.2 Testy jednostkowe przechodzą (`npm run test`)
- [ ] 4.3 Build produkcyjny przechodzi (`npm run build`)

#### Manual

- [ ] 4.4 Baner + wyszarzone zakładki/filtry; `?session=` przeżywa stronicowanie / wstecz-dalej / odświeżenie
- [ ] 4.5 Akcje trybu: świeży wiersz po akceptuj/odrzuć/przywróć (edycja po akcji bez 409), kosz w miejscu, podgląd read-only
- [ ] 4.6 „Wyczyść filtry" → `/items` (kontrolki aktywne); „Wróć do dziennika" → `/import-sessions`
- [ ] 4.7 Zły odnośnik: komunikat „sesja niedostępna" + wyjścia, bez błędów
- [ ] 4.8 Zimny start dev bez `--force`: zero re-optymalizacji (tryb + dialog + API)

### Phase 5: Dziennik jako karty + demontaż master-detail

#### Automated

- [ ] 5.1 Lint przechodzi (`npm run lint`)
- [ ] 5.2 Testy jednostkowe przechodzą (`npm run test`; zestaw `useSessionItems` usunięty)
- [ ] 5.3 Build produkcyjny przechodzi (`npm run build`)

#### Manual

- [ ] 5.4 Karty dziennika: akcje wg stanu sesji; „Ponów" → po sukcesie karta pokazuje „Pokaż wpisy"; filtry/paginacja dziennika bez regresji
- [ ] 5.5 Przepływ end-to-end: dziennik → „Pokaż wpisy" → tryb sesji → „Wyczyść filtry" → `/items`; wstecz przeglądarki przez cały łańcuch
- [ ] 5.6 Zimny start dev bez `--force` + `npm run preview`: zero re-optymalizacji, render produkcyjny bez błędów
