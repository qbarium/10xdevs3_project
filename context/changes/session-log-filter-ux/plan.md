# Reaktywne filtry dziennika sesji importu (S-11) — Plan implementacji

## Przegląd

S-11 przenosi dziennik sesji importu (`/import-sessions`) z modelu „formularz + przycisk Zastosuj + przeładowanie strony" na model reaktywny, spójny z listami głównymi z S-09: zmiana filtra statusu lub sortowania natychmiast zawęża listę bez przeładowania, kryteria są w adresie strony (odświeżenie i „wstecz/dalej" je zachowują), natywne `<select>` zastępuje motywowany komponent `Select`, a pusty wynik rozróżnia „brak sesji dla wybranych filtrów" od „brak sesji w ogóle". Dochodzi paginacja stronowa listy (dziś dziennik ciągnie wszystkie wiersze bez ograniczenia), a wraz z nią serwerowy endpoint listy i indeks bazy pod sortowanie po dacie.

## Analiza stanu obecnego

Dziennik działa dziś w modelu serwerowym z przeładowaniem:

- Lista sesji powstaje przez renderowanie po stronie serwera — `import-sessions.astro` woła `getImportSessions()` w trakcie renderu i przekazuje gotowe wiersze do wyspy React jako props (`src/pages/import-sessions.astro:33,102`). Przeglądarka nie pobiera listy żadnym zapytaniem.
- Filtr statusu i sortowanie po dacie działają przez `<form method="get">` z przyciskiem „Zastosuj" (`import-sessions.astro:73-100`) i natywne `<select>` (`:60-61,76-92`). Każda zmiana = pełne przeładowanie strony.
- Mapowanie wiersza (skrót `raw_input`, etykieta daty, `live_item_count`) liczone jest po stronie serwera w stronie (`import-sessions.astro:39-57`).
- `getImportSessions` (`src/lib/services/import-session.ts:82-110`) — zapytanie supabase-js, filtr statusu (`.eq("status", …)`), sort po `created_at` (rosnąco/malejąco), **bez `LIMIT`/paginacji** i **bez stabilizatora kolejności** (tie-break) przy równych `created_at`.
- Tabela `import_sessions` ma indeks tylko `(user_id)` (`supabase/migrations/20260610052532_classification_schema.sql:62-69`) — sortowanie po dacie nie jest wsparte indeksem. Status to enum `import_session_status` o czterech wartościach: `processing`, `completed_with_items`, `completed_no_items`, `failed` (`:23-24`).
- Brak endpointu zwracającego listę sesji — istnieje tylko `GET /api/import-sessions/[id]/items` (elementy pojedynczej sesji, S-10).
- Dziennik to wyspa React (`ImportSessionsView` → `SessionsList` → `SessionRow` → `useSessionRetry`), montowana `client:load` (`import-sessions.astro:102`).

Wzorzec do naśladowania istnieje w całości z S-09 (`context/archive/2026-06-20-list-filters-search/plan.md`): serwis sterowany kryteriami → endpoint `GET /api/items` → hook synchronizujący kryteria z adresem → motywowany `Select`. Szczegóły reużycia w `context/changes/session-log-filter-ux/research.md`.

## Pożądany stan końcowy

Na stronie `/import-sessions` użytkownik:

- przełącza **filtr statusu** (Wszystkie / cztery stany) i **sortowanie** (Najnowsze / Najstarsze) — lista zawęża się i przeładowuje z serwera natychmiast, bez przycisku „Zastosuj" i bez przeładowania strony;
- ma wszystkie kryteria (status, sortowanie, numer strony) **w adresie strony** — odświeżenie, „wstecz/dalej" i wysłany odnośnik je zachowują;
- przegląda listę **stronami** (następna / poprzednia + wskaźnik strony), bo dziennik nie jest już ładowany w całości;
- przy pustym wyniku z aktywnym filtrem widzi komunikat „Brak sesji dla wybranych filtrów" z akcją „Wyczyść filtry", a przy faktycznie pustym dzienniku — dotychczasowy komunikat „Brak sesji importu…";
- widzi spójne, motywowane kontrolki (`Select`), nie natywne `<select>`.

Weryfikacja: render serwerowy strony z kryteriami w adresie od razu pokazuje przefiltrowaną/posortowaną/ostronicowaną listę (bez przeskoku po nawodnieniu); zmiana kontrolki aktualizuje adres i listę bez przeładowania; przycisk „Zastosuj" i natywne `<select>` znikają z kodu. **Weryfikacja ręczna prowadzona na wersji produkcyjnej uruchomionej lokalnie (`npm run preview`)** — patrz „Krytyczne szczegóły implementacji".

### Kluczowe odkrycia:

- `src/lib/services/import-session.ts:82-110` — `getImportSessions`, do rozszerzenia o paginację i tie-break; przyjmuje już `{ sort, status }`.
- `src/pages/import-sessions.astro:39-57` — mapowanie wiersza liczone serwerowo; do wydzielenia jako funkcja współdzielona (strona + endpoint).
- `src/pages/api/items/index.ts:31-50` — wzorzec endpointu `GET` (gwarda logowania, walidacja, kształt `{ ok, … }` / `{ ok:false, code, error }`).
- `src/components/hooks/useItemList.ts:36-91` — wzorzec hooka reaktywnego (kryteria ↔ adres, „najnowsze żądanie wygrywa", pushState/popstate); do uproszczenia dla sesji (bez wyszukiwania = bez opóźnienia).
- `src/components/ui/select.tsx` — motywowany `Select`, cel podmiany natywnych `<select>`; bez nowej zależności.
- `supabase/migrations/20260610052532_classification_schema.sql:23-24,62-69` — enum statusu i jedyny obecny indeks `(user_id)`.

## Czego NIE robimy

- **Deep-link `?session=` do pojedynczej sesji** — świadomie poza zakresem (decyzja użytkownika): to przegląd listy, nie ma tu linków do pojedynczej sesji.
- **Naprawa błędu podwójnego React-a (tryb deweloperski)** — wynesiona do osobnego punktu **S-12** (follow-up `follow-ups/dup-react-ssr-dev-only.md`). Błąd dotyczy wyłącznie `npm run dev`; produkcja go nie ma, więc nie blokuje S-11.
- **Wyszukiwanie tekstowe** — dziennik filtruje tylko po statusie i sortuje po dacie; pole wyszukiwania (i jego opóźnienie) odpada.
- **Zmiany w panelu master-detail z S-10** (`SessionItemsPanel`, `useSessionItems`) — nietknięty.
- **Paginacja kursorowa** — wybrana paginacja stronowa (offset); dryf przy nowych wpisach akceptowalny dla pojedynczego użytkownika i niskiej częstości (patrz „Uwagi dotyczące wydajności").

## Podejście do implementacji

Trzy fazy w kolejności „od danych do interfejsu", każda samodzielnie weryfikowalna i odpowiadająca jednemu pod-zgłoszeniu na tablicy. Najpierw warstwa serwerowa (indeks → serwis → endpoint), na której stara strona działa bez zmian; potem reaktywna wyspa konsumująca endpoint; na końcu kontrolki paginacji i domknięcie zachowań przekrojowych. Filtry i sortowanie wchodzą jako rdzeń (Faza 2), paginacja jako domknięcie (Faza 3) — zgodnie z decyzją „filtry najpierw".

## Krytyczne szczegóły implementacji

- **Weryfikacja ręczna tej strony idzie przez `npm run preview`, nie `npm run dev`.** Na `/import-sessions` żyje błąd podwójnego React-a występujący wyłącznie w trybie deweloperskim (wyścig optymalizatora zależny od kolejności ładowania). Build produkcyjny (uruchamiany lokalnie przez `npm run preview`) tego błędu nie ma — i to on jest właściwym artefaktem do sprawdzania zachowania. Dołożenie hooka filtrów na tę wyspę może w trybie deweloperskim nasilić objaw; to oczekiwane i poza zakresem (S-12). Nie traktować awarii w `npm run dev` jako regresji S-11 — rozstrzyga `preview`.
- **Parser kryteriów musi być wspólny dla serwera i klienta.** Ta sama czysta funkcja czyta kryteria po stronie serwera (`Astro.url.searchParams`) i klienta (`window.location.search`), żeby pierwszy render serwerowy i pierwszy stan wyspy były identyczne (brak przeskoku po nawodnieniu) — jak w S-09.
- **Sortowanie wymaga stabilizatora kolejności.** `created_at` nie jest unikalny (np. seria ponowień w jednej chwili), więc sortowanie i stronicowanie muszą mieć tie-break po `id`, inaczej wiersze na granicy strony mogą się powtarzać lub gubić.

## Faza 1: Warstwa danych — indeks, serwis z paginacją, endpoint listy

### Przegląd

Serwerowa podstawa pod reaktywność: indeks pod sortowanie po dacie, `getImportSessions` rozszerzony o paginację i tie-break, wspólna funkcja mapująca wiersz, oraz nowy endpoint `GET /api/import-sessions` zwracający stronę listy jako JSON. Strona `.astro` działa bez zmian aż do Fazy 2 (nadal renderuje serwerowo).

### Wymagane zmiany:

#### 1. Migracja: indeks pod sortowanie i stronicowanie

**Plik**: `supabase/migrations/<YYYYMMDDHHmmss>_import_sessions_pagination_index.sql` (nowy, przez `supabase migration new`)

**Cel**: Wesprzeć sortowanie po dacie i stabilne stronicowanie indeksem złożonym (dziś jest tylko indeks po `user_id`).

**Kontrakt**: Indeks na `import_sessions (user_id, created_at, id)`. RLS i kolumny bez zmian. Nakładać przez `supabase migration up` (przyrostowo) — nigdy `db reset`. Na produkcji `db push` (przyrostowy).

#### 2. Serwis `getImportSessions` — paginacja, tie-break, liczba wszystkich

**Plik**: `src/lib/services/import-session.ts`

**Cel**: Zwracać jedną stronę listy zamiast wszystkich wierszy, zachowując filtr statusu i sortowanie, ze stabilną kolejnością i informacją o łącznej liczbie (potrzebnej kontrolkom stron).

**Kontrakt**: `GetImportSessionsOptions` zyskuje `page` i `pageSize` (lub `offset`/`limit`). Zapytanie: dotychczasowy filtr statusu + `.order("created_at", …)` uzupełniony o `.order("id", …)` (tie-break) + `.range(from, to)` oraz pobranie łącznej liczby (`count: "exact"`). Sygnatura zwraca `{ sessions: ImportSessionWithFile[]; total: number; page: number; pageSize: number }`. Domyślne kryteria (strona 1, sort `created_desc`, status: brak) odwzorowują dotychczasowe zachowanie strony.

#### 3. Wspólna funkcja mapująca wiersz

**Plik**: `src/lib/services/import-session.ts` (lub mały moduł mappera obok)

**Cel**: Jedno źródło mapowania `ImportSessionWithFile → SessionRowData` (skrót `raw_input`, etykieta daty, `live_item_count`), żeby strona i endpoint produkowały identyczne wiersze. Dziś to mapowanie żyje wyłącznie w `import-sessions.astro:39-57`.

**Kontrakt**: Czysta funkcja `toSessionRow(session: ImportSessionWithFile): SessionRowData`. Używana przez stronę (do Fazy 2) i przez endpoint.

#### 4. Kryteria listy sesji — parser i serializacja ↔ adres

**Plik**: `src/lib/services/session-list-criteria.ts` (nowy) + test

**Cel**: Jedno źródło prawdy o kryteriach dziennika i ich mapowaniu na/z parametrów adresu — używane przez serwerowy render, endpoint i hook (spójność serwer↔klient), wzorowane na `list-criteria.ts` z S-09.

**Kontrakt**: Typ `SessionListCriteria = { status: ImportSessionStatus | "all"; sort: "created_desc" | "created_asc"; page: number }`. `parseSessionListCriteria(params: URLSearchParams): SessionListCriteria` — tolerancyjny (wartości spoza zakresu → domyślne, nie rzuca; `page` < 1 → 1). `sessionCriteriaToQuery(criteria): string` — serializuje tylko pola różne od domyślnych. `hasActiveSessionFilters(criteria): boolean` — czy jakikolwiek filtr/sort odbiega od domyślnego (do rozróżnienia pustego wyniku). Czyste funkcje, testowane w node.

#### 5. Endpoint `GET /api/import-sessions`

**Plik**: `src/pages/api/import-sessions/index.ts` (nowy)

**Cel**: Zwracać stronę listy sesji jako JSON wg kryteriów z adresu — cienka nakładka HTTP na `getImportSessions`, strukturalnie jak `GET /api/items` z S-09.

**Kontrakt**: `export const prerender = false`. `GET`: gwarda logowania (`context.locals.user`, brak ⇒ 401 `{ ok:false, code:"unauthorized", error }`), `createClient` (brak ⇒ 500), odczyt `status`/`sort`/`page` przez `parseSessionListCriteria(new URL(request.url).searchParams)`, wywołanie `getImportSessions`, mapowanie przez `toSessionRow`, odpowiedź `{ ok:true, rows, total, page, pageSize }`. Błędy w ujednoliconym kształcie `{ ok:false, code, error }` przez helper `json()` z `src/lib/http.ts`. Walidacja: `status`/`sort` to skalarne whitelisty (cztery wartości enuma + brak; dwa kierunki), `page` to skalarny int z clampem — zgodnie z regułą „pojedyncze pole skalarne → walidacja ręczna" i precedensem S-09 (tolerancyjny parser jako jedyny walidator).

#### 6. Testy serwisu, kryteriów i endpointu

**Plik**: `src/lib/services/session-list-criteria.test.ts` (nowy), test serwisu i endpointu (rozszerzyć lub nowe)

**Cel**: Pokryć (de)serializację kryteriów, składanie zapytania z paginacją/tie-break, i ścieżki endpointu.

**Kontrakt**: `parseSessionListCriteria` — domyślne, fallback dla śmieci, clamp `page`, każde pole; `sessionCriteriaToQuery` — pomija domyślne, round-trip. Serwis — filtr statusu, sort z tie-break po `id`, `range` dla strony, `total`. Endpoint — 200 z poprawnymi parametrami, 401 bez usera, pusty wynik (200, `rows: []`), tolerancja niepoprawnego `sort`/`status` (fallback do domyślnej).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`
- Migracja nakłada się czysto lokalnie: `npx supabase migration up`

#### Weryfikacja ręczna:

- Strona `/import-sessions` nadal renderuje poprawną listę (serwis działa po rozszerzeniu — brak regresji względem stanu sprzed fazy), sprawdzone na `npm run preview`.
- `GET /api/import-sessions?status=failed&sort=created_asc&page=1` (zalogowany, na `npm run preview`) zwraca przefiltrowaną/posortowaną/ostronicowaną listę w JSON; brak usera → 401; niepoprawny `sort` → tolerowany (domyślny).

**Uwaga implementacyjna**: Po przejściu automatycznych weryfikacji zatrzymaj się na ręczne potwierdzenie człowieka przed Fazą 2.

---

## Faza 2: Reaktywne filtry i sortowanie na wyspie

### Przegląd

Przełączenie strony i wyspy na model reaktywny: hook pobiera stronę listy z endpointu i synchronizuje kryteria z adresem, natywne `<select>` ustępują motywowanemu `Select`, znika przycisk „Zastosuj", a pusty wynik rozróżnia dwa przypadki. Kontrolki paginacji dochodzą w Fazie 3 — tu pierwsza strona.

### Wymagane zmiany:

#### 1. Hook listy sesji

**Plik**: `src/components/hooks/useSessionList.ts` (nowy) + test

**Cel**: Hermetyzować pobieranie strony listy wg `SessionListCriteria` i utrzymywać adres w zgodzie z kryteriami; wzorzec `useItemList`, ale bez opóźnienia (brak wyszukiwania).

**Kontrakt**: `useSessionList(initialRows, initialCriteria, initialTotal)` zwraca `{ rows, criteria, setCriteria, loading, error, total, page, pageCount }`. `setCriteria(next)` → `GET /api/import-sessions?<sessionCriteriaToQuery(next)>` → podmiana listy po sukcesie; błąd → `error` (+ zachowanie poprzedniej listy). Każde `setCriteria` anuluje poprzednie żądanie (kontroler przerwania) — najnowsze wygrywa. Zmiana kryteriów: `history.pushState` + listener `popstate` re-parsujący adres (wstecz/dalej odtwarza filtry). `initialRows`/`initialCriteria` z serwera — brak pobierania na pierwszy render.

#### 2. Strona `import-sessions.astro` czyta kryteria z adresu i oddaje stan początkowy

**Plik**: `src/pages/import-sessions.astro`

**Cel**: Render serwerowy wg kryteriów z adresu i przekazanie stanu początkowego do wyspy; usunięcie formularza z przeładowaniem i natywnych `<select>`.

**Kontrakt**: `const criteria = parseSessionListCriteria(Astro.url.searchParams)`; `const { sessions, total } = await getImportSessions(...)`; `rows = sessions.map(toSessionRow)`; przekazanie `initialRows`, `initialCriteria`, `initialTotal` do `ImportSessionsView`. Usunięte: `<form method="get">`, przycisk „Zastosuj", natywne `<select>` i `selectClass`, serwerowe mapowanie wiersza (przeniesione do `toSessionRow` w Fazie 1).

#### 3. Wyspa: reaktywne kontrolki + rozróżnienie pustego wyniku

**Pliki**: `src/components/import-sessions/ImportSessionsView.tsx`, `SessionsList.tsx`, `src/components/import-sessions/SessionFilterBar.tsx` (nowy)

**Cel**: Sterować kryteriami przez hook; dać motywowane kontrolki sortu i statusu; rozróżnić „pusto bo filtr" od „brak sesji".

**Kontrakt**: `ImportSessionsView` woła `useSessionList(...)` i renderuje `rows` z hooka. `SessionFilterBar` zawiera dwa motywowane `Select` (sortowanie: Najnowsze/Najstarsze; status: Wszystkie + cztery stany przez `importSessionStatusLabel`), każdy `onChange` → `setCriteria`. `SessionsList` przyjmuje `hasActiveFilters`: gdy lista pusta i filtr aktywny → „Brak sesji dla wybranych filtrów" + akcja „Wyczyść filtry" (`setCriteria` do domyślnych); gdy pusta bez filtra → dotychczasowy komunikat. Zaznaczenie sesji (stan lokalny `selectedSessionId`) czyszczone przy zmianie kryteriów.

#### 4. Testy i porządki

**Plik**: testy hooka (część czysta: budowa adresu, mapowanie odpowiedzi, najnowsze-wygrywa), aktualizacja testów strony/wyspy

**Cel**: Pokryć logikę kryteriów hooka i usunąć asercje na starym formularzu/`<select>`.

**Kontrakt**: `sessionCriteriaToQuery` użyte do budowy adresu daje oczekiwany ciąg; `{ ok:true, rows }` → `rows`, błąd → `error` bez utraty poprzedniej listy.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi (brak nieużywanych importów po usunięciu formularza): `npm run lint`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna (na `npm run preview`):

- Zmiana sortowania lub statusu zawęża listę bez przeładowania strony; adres odzwierciedla wybór (`?status=failed&sort=created_asc`).
- Odświeżenie strony z `?status=…` pokazuje od razu przefiltrowaną listę (brak przeskoku po nawodnieniu); „wstecz/dalej" przełącza filtry.
- Pusty wynik z aktywnym filtrem pokazuje „Brak sesji dla wybranych filtrów" + „Wyczyść filtry"; po wyczyszczeniu wraca pełna lista.
- Brak przycisku „Zastosuj" i brak natywnych `<select>` (kontrolki to motywowany `Select`).

**Uwaga implementacyjna**: Po przejściu automatycznych weryfikacji zatrzymaj się na ręczne potwierdzenie człowieka przed Fazą 3.

---

## Faza 3: Paginacja w interfejsie + domknięcie UX

### Przegląd

Kontrolki stron na reaktywnym potoku z Fazy 2 oraz domknięcie zachowań przekrojowych: reset do pierwszej strony przy zmianie filtra/sortu, wskaźnik ładowania i komunikat błędu pobrania (wzorzec z S-09).

### Wymagane zmiany:

#### 1. Kontrolki paginacji

**Plik**: `src/components/import-sessions/SessionPagination.tsx` (nowy)

**Cel**: Nawigacja po stronach listy.

**Kontrakt**: Props `{ page, pageCount, onPage(next) }`. Przyciski poprzednia/następna (wyłączane na krańcach) + wskaźnik „strona X z Y". `onPage` → `setCriteria({ ...criteria, page })`. Kontrolowany, bez stanu trwałego.

#### 2. Zachowania przekrojowe

**Pliki**: `src/components/import-sessions/ImportSessionsView.tsx` (+ `useSessionList.ts` jeśli potrzeba)

**Cel**: Domknąć spójność listy i interakcji.

**Kontrakt**: Zmiana filtra lub sortowania **resetuje stronę do 1** (`setCriteria` z `page: 1`). Wskaźnik ładowania w trakcie pobierania (stan `loading`). Błąd pobrania (`error`) → widoczny komunikat „Nie udało się zaktualizować listy" z akcją ponowienia; poprzednia lista zostaje, więc widok nie pustoszeje. Zaznaczenie sesji czyszczone przy każdej zmianie kryteriów (utrzymane z Fazy 2).

#### 3. Testy

**Plik**: testy kontrolki paginacji (logika kontrolowana) i resetu strony

**Cel**: Pokryć stany krańcowe stron i reset do strony 1 przy zmianie filtra.

**Kontrakt**: Przyciski wyłączone na pierwszej/ostatniej stronie; zmiana filtra ustawia `page: 1`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna (na `npm run preview`):

- Następna/poprzednia zmienia stronę i odzwierciedla `?page=` w adresie; przyciski wyłączone na krańcach.
- Zmiana filtra lub sortowania wraca do strony 1.
- W trakcie pobierania widoczny wskaźnik ładowania; przy wymuszonym błędzie pobrania widoczny komunikat z ponowieniem, a poprzednia lista zostaje.
- Pełny obieg: ustaw filtr + stronę → skopiuj adres → otwórz w nowej karcie → ten sam, przefiltrowany i ostronicowany widok.

**Uwaga implementacyjna**: Po przejściu automatycznych weryfikacji zatrzymaj się na ręczne potwierdzenie człowieka.

---

## Strategia testowania

### Testy jednostkowe:

- `session-list-criteria.ts` — `parseSessionListCriteria` (domyślne, fallback, clamp `page`, każde pole), `sessionCriteriaToQuery` (pomijanie domyślnych, round-trip), `hasActiveSessionFilters`.
- `import-session.ts` — `getImportSessions`: filtr statusu, sort z tie-break po `id`, `range` strony, `total`.
- Endpoint `import-sessions/index.ts` — 200 / 401 / pusty wynik / tolerancja niepoprawnych parametrów.
- `useSessionList` — budowa adresu, mapowanie odpowiedzi, najnowsze-wygrywa (część czysta / makieta pobrania).
- `SessionPagination` — stany krańcowe, reset strony przy zmianie filtra.

### Testy integracyjne:

- (Opcjonalnie) realny `GET /api/import-sessions` z kombinacjami parametrów względem zaseedowanych sesji.

### Kroki testowania ręcznego (wszystkie na `npm run preview`):

1. Zaloguj się, wejdź na `/import-sessions`, zmień sortowanie na „Najstarsze" — kolejność i adres się zmieniają, bez przeładowania.
2. Wybierz status „Niepowodzenie" — lista zawęża się; adres zawiera `?status=failed`.
3. Zawęź do pustego wyniku — komunikat „Brak sesji dla wybranych filtrów" + „Wyczyść filtry".
4. Przejdź następna/poprzednia strona; zmień filtr — wraca do strony 1.
5. Skopiuj adres z filtrem i stroną, otwórz w nowej karcie — ten sam widok; użyj „wstecz/dalej".

## Uwagi dotyczące wydajności

Filtrowanie/sortowanie/stronicowanie po stronie serwera na małym wolumenie pojedynczego użytkownika jest tanie; nowy indeks `(user_id, created_at, id)` wspiera sort i stabilne stronicowanie. Paginacja stronowa (offset) może dryfować, gdy w trakcie przeglądania dojdzie nowa sesja (wiersze przesuwają się o jeden) — akceptowalne dla pojedynczego użytkownika i niskiej częstości importów; alternatywa kursorowa odrzucona jako nieproporcjonalnie złożona do tej skali. Każda zmiana kryterium to jeden obieg do serwera.

## Uwagi dotyczące migracji

Jedna migracja Supabase — indeks `(user_id, created_at, id)`, bez zmian danych. Nakładać przyrostowo (`supabase migration up` lokalnie, `db push` na produkcji) — nigdy `db reset` (reguła operacyjna: reset kasuje lokalną bazę). Usunięcie cookie/formularza ze strony jest bezstanowe.

## Referencje

- Badania: `context/changes/session-log-filter-ux/research.md`
- Follow-up (poza zakresem, → S-12): `context/changes/session-log-filter-ux/follow-ups/dup-react-ssr-dev-only.md`
- Wzorzec poprzednika (S-09): `context/archive/2026-06-20-list-filters-search/plan.md`
- Wzorzec endpointu: `src/pages/api/items/index.ts`, helper `src/lib/http.ts`
- Lekcje: `context/foundation/lessons.md` (kształt błędu `{ok:false,code,error}`; błąd podwójnego React-a tylko w dev — kryterium weryfikacji)

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po zakończeniu kroku. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Warstwa danych — indeks, serwis z paginacją, endpoint listy

#### Automatyczne

- [x] 1.1 Lint przechodzi: `npm run lint` — f7f1316
- [x] 1.2 Testy jednostkowe przechodzą: `npm test` — f7f1316
- [x] 1.3 Build przechodzi: `npm run build` — f7f1316
- [x] 1.4 Migracja nakłada się czysto lokalnie: `npx supabase migration up` — f7f1316

#### Ręczne

- [ ] 1.5 Strona `/import-sessions` renderuje poprawną listę bez regresji (na `npm run preview`)
- [ ] 1.6 `GET /api/import-sessions?status=failed&sort=created_asc&page=1` zwraca przefiltrowany/posortowany/ostronicowany JSON; 401 bez usera; niepoprawny `sort` tolerowany (na `npm run preview`)

### Faza 2: Reaktywne filtry i sortowanie na wyspie

#### Automatyczne

- [x] 2.1 Lint przechodzi: `npm run lint` — 6c769b3
- [x] 2.2 Testy jednostkowe przechodzą: `npm test` — 6c769b3
- [x] 2.3 Build przechodzi: `npm run build` — 6c769b3

#### Ręczne

- [ ] 2.4 Zmiana sortowania/statusu zawęża listę bez przeładowania; adres odzwierciedla wybór (na `npm run preview`)
- [ ] 2.5 Odświeżenie z `?status=…` pokazuje od razu przefiltrowaną listę (brak przeskoku); „wstecz/dalej" przełącza filtry
- [ ] 2.6 Pusty wynik z filtrem pokazuje „Brak sesji dla wybranych filtrów" + „Wyczyść filtry"; brak „Zastosuj" i natywnych `<select>`

### Faza 3: Paginacja w interfejsie + domknięcie UX

#### Automatyczne

- [x] 3.1 Lint przechodzi: `npm run lint` — fefe043
- [x] 3.2 Testy jednostkowe przechodzą: `npm test` — fefe043
- [x] 3.3 Build przechodzi: `npm run build` — fefe043

#### Ręczne

- [ ] 3.4 Następna/poprzednia zmienia stronę i `?page=`; przyciski wyłączone na krańcach (na `npm run preview`)
- [ ] 3.5 Zmiana filtra/sortowania wraca do strony 1
- [ ] 3.6 Wskaźnik ładowania w trakcie pobierania; komunikat błędu z ponowieniem przy wymuszonym błędzie, poprzednia lista zostaje
- [ ] 3.7 Pełny obieg adresu (filtr + strona) zachowany między kartami
