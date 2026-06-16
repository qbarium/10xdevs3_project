# Ręczne dodawanie itemu (S-07) — Plan implementacji

## Przegląd

Dodajemy ścieżkę ręcznego tworzenia jednego itemu z pominięciem klasyfikacji AI. User klika „Dodaj item" w nagłówku widoku **Aktywne**, otwiera modal (typ / `title` / `description`), zatwierdza — nowy `POST /api/items` wstawia item od razu jako `acceptance_status='accepted'`, `operational_status='new'`, `import_session_id=NULL`. Item pojawia się w liście Aktywne, zostaje przypięty (omija filtr typu) i sfokusowany. Akcja **nie wymaga klucza API** (wyjątek od FR-024) i jest dostępna offline od strony klasyfikacji.

## Analiza stanu obecnego

- **Schemat gotowy, bez migracji.** `items.import_session_id` jest `nullable` (`on delete set null`), `acceptance_status` ma default `'pending'` (musimy podać `'accepted'` jawnie), `operational_status` nullable. Polityka RLS `items_insert_own` (`with check auth.uid() = user_id`) już pozwala zalogowanemu wstawić własny wiersz. `supabase/migrations/20260610052532_classification_schema.sql:49-111`.
- **Brak endpointu tworzącego.** Istnieją `src/pages/api/items/bulk.ts` (POST accept/reject), `operational.ts` (POST stan), `[id].ts` (PATCH edycja). Testy endpointów są co-located (`bulk.test.ts`, `[id].test.ts`). Brak `index.ts`.
- **Warstwa serwisu/walidacji gotowa do rozszerzenia.** `src/lib/services/items-mutation.ts` ma `deriveOperationalStatus(type) → 'new'` (S-04) oraz wzorzec mutacji z jawnym `updated_at`. `src/lib/validation/items.ts` ma `editItemSchema` i enum `OPERATIONAL_STATUSES`; `ITEM_TYPES` mieszka w `@/lib/ai/schema` (`validation/items.ts` tylko je importuje, bez re-eksportu — nowe pliki importują z `@/lib/ai/schema`).
- **UI z istniejących klocków.** `src/components/items/EditItemDialog.tsx` to gotowy wzorzec (Input/Textarea/Select + `isTitleValid` + toast + obsługa błędów). Hook `src/components/hooks/useItemMutation.ts`. Słownik `src/lib/labels.ts` (`itemTypeLabel`). Komplet shadcn (Dialog/Select/Input/Textarea/sonner) obecny → zero nowych zależności.
- **Bramka klucza BYOK** siedzi wyłącznie na `src/pages/api/ingest/classify.ts` (409 `missing_key`); `src/middleware.ts` sprawdza tylko auth. Ręczne dodawanie jest bezkluczowe „z natury" — trzeba tylko nie odziedziczyć bramki.
- **Widok Aktywne** to `AcceptedItemsView` (`src/components/items/AcceptedItemsView.tsx`) renderowany przez `src/pages/items/active.astro`. Ten sam komponent obsługuje też Zakończone/Anulowane — ma stan `items`, `typeFilter` (cookie), `pinnedIds` (trzyma item widoczny mimo niezgodnego filtra typu).

## Pożądany stan końcowy

Zalogowany user na `/items/active` klika „Dodaj item", w modalu wybiera typ (domyślnie ostatnio użyty), wpisuje `title` (+ opcjonalnie `description`), zatwierdza. Item natychmiast pojawia się na liście Aktywne — widoczny niezależnie od aktualnego filtra typu, przewinięty do widoku i sfokusowany — z toastem potwierdzenia. Działa bez skonfigurowanego klucza API. Weryfikacja: pełna ścieżka UI + `curl POST /api/items` tworzący wiersz `accepted`/`new`/`import_session_id=NULL`; testy jednostkowe i integracyjne zielone; lint + build zielone.

### Kluczowe odkrycia:

- Polityka INSERT istnieje — `supabase/migrations/20260610052532_classification_schema.sql:100-102`.
- `deriveOperationalStatus()` zwraca `'new'` dla każdego typu — `src/lib/services/items-mutation.ts:48-50`.
- Wzorzec endpointu mutacji (auth 401 → zod 400 → `createClient(headers,cookies)` → serwis → `{ok:true,...}` / `{ok:false,code,error}`) — `src/pages/api/items/bulk.ts:1-46`, `[id].ts:1-62`.
- Wzorzec pól formularza + walidacja `isTitleValid` + `buildEditPayload` + toast — `src/components/items/EditItemDialog.tsx`, `src/components/items/edit-form.ts`.
- Mechanizm `pinnedIds` (item widoczny mimo filtra typu) — `src/components/items/AcceptedItemsView.tsx`, `src/components/items/type-filter.ts` (`applyTypeFilter` przyjmuje `pinnedIds`).

## Czego NIE robimy

- Edycji ani usuwania z tego formularza (edycja → `EditItemDialog`/S-05; kosz → S-06).
- Multi-add / „Zapisz i dodaj kolejny" (świadoma decyzja — jeden item, dialog się zamyka).
- Akcji „Dodaj item" w innych miejscach niż nagłówek Aktywne (nie w Topbarze, Pending, Kosz, Zakończone, Anulowane).
- Tworzenia itemu w innym stanie niż `accepted`/`new` (np. wprost do `pending`).
- Powiązania z sesją importu — `import_session_id` zawsze `NULL`; item ręczny nie pojawia się w dzienniku sesji (FR-027).
- Sortowania/wyszukiwania (S-09), optimistic concurrency, limitów długości `description` (mirror edycji — brak max).

## Podejście do implementacji

Backend-first wg konwencji S-03/S-05: najpierw testowalny niezależnie kontrakt (schema zod + serwis + endpoint), potem UI. Serwer jest jedynym właścicielem niezmienników (`accepted`/`new`/`NULL session`) — klient ich nie przysyła. UI reużywa wzorca `EditItemDialog` i istniejącej machinerii `pinnedIds`/`typeFilter` w `AcceptedItemsView` zamiast budować nową.

## Krytyczne szczegóły implementacji

- **Niezmienniki ustala serwer, nie klient (fail-closed).** `createItemSchema` definiuje wyłącznie `title`/`description`/`type`. `acceptance_status`, `operational_status`, `import_session_id`, `user_id` NIE są częścią payloadu — serwer ustawia `accepted` / `deriveOperationalStatus()` / `NULL` / `auth.uid()`. Rozszerza to lekcję „nie ufaj wejściu" z konfiguracji na payload API.
- **Sekwencjonowanie stanu po utworzeniu (inaczej item zniknie).** Nowy item ma typ wybrany w formularzu; jeśli aktualny `typeFilter` go wyklucza, sam „focus" nie wystarczy — item nie przejdzie `applyTypeFilter` i nie wyrenderuje się. Kolejność obowiązkowa: w jednym update stanu (a) wstaw item do `items` i (b) dodaj jego `id` do `pinnedIds`; dopiero potem (c) w efekcie na zmianę `focusId` zrób `scrollIntoView` + `focus()`. Bez kroku (b) krok (c) nie ma czego sfokusować.
- **Brak bramki klucza — świadomie.** Nie dodawać do endpointu ani UI żadnego sprawdzenia stanu BYOK; akcji nie umieszczać na ścieżce dziedziczącej bramkę klucza. To wyjątek FR-024 i zarazem dźwignia testowalności list bez wywołań AI.

## Faza 1: Backend tworzenia itemu

### Przegląd

Kontrakt walidacji + serwis + endpoint `POST /api/items`, testowalny przez `curl`/testy niezależnie od UI.

### Wymagane zmiany:

#### 1. Schemat walidacji

**Plik**: `src/lib/validation/items.ts`

**Cel**: Dodać schemat wejścia tworzenia itemu ręcznego — wyłącznie pola, które user podaje.

**Kontrakt**: `createItemSchema = z.object({ title, description, type })` gdzie `title: z.string().trim().min(1)`, `description` jak w `editItemSchema` (nullable, pusty string → `null`), `type: z.enum(ITEM_TYPES)`. Wyeksportować typ wejścia (`CreateItemInput`). Schemat celowo NIE zawiera `operationalStatus`/`acceptanceStatus`/`importSessionId` — zod odrzuca/ignoruje nadmiarowe pola zgodnie z istniejącym wzorcem.

#### 2. Serwis tworzenia

**Plik**: `src/lib/services/items-mutation.ts`

**Cel**: Funkcja wstawiająca pojedynczy item ręczny z niezmiennikami ustalonymi po stronie serwera; zwraca utworzony wiersz.

**Kontrakt**: `createManualItem(supabase, userId, input: CreateItemInput): Promise<Item>`. INSERT do `items`: `user_id: userId`, `import_session_id: null`, `type`, `title`, `description`, `acceptance_status: 'accepted'`, `operational_status: deriveOperationalStatus(input.type)`, `updated_at: new Date().toISOString()` (reszta z defaultów). `.select(ITEM_COLUMNS).single()` (reużyj jawnej stałej `ITEM_COLUMNS` z `items-mutation.ts:14` — NIE `'*'`, dla stabilnego kształtu `Item` jak `editItem`/`items.ts`) → `Item`; błąd → `throw new Error(..., { cause })`. Reużywa istniejącego `deriveOperationalStatus`.

#### 3. Endpoint

**Plik**: `src/pages/api/items/index.ts` (nowy)

**Cel**: `POST /api/items` — utworzenie itemu ręcznego dla zalogowanego usera.

**Kontrakt**: `export const prerender = false;` + `export const POST: APIRoute`. Sekwencja jak w `bulk.ts`: `if (!context.locals.user)` → 401 `{ok:false,code:'unauthorized',error:'Wymagane logowanie.'}`; `createItemSchema.safeParse(await request.json())` w try/catch → 400 `{ok:false,code:'bad_request',error:'Nieprawidłowe żądanie.'}`; `createClient(headers, cookies)`; `createManualItem(...)` → `201 {ok:true, item}`; wyjątek → `reportError` + 500 `{ok:false,code:'internal',error:'Błąd serwera.'}`. **Brak jakiegokolwiek sprawdzenia klucza BYOK.**

#### 4. Testy

**Plik**: `src/pages/api/items/index.test.ts` (nowy) + uzupełnienie testów schematu/serwisu wg co-located wzorca

**Cel**: Pokryć kontrakt walidacji, niezmienniki serwisu i ścieżki endpointu.

**Kontrakt**: jednostkowe — `createItemSchema` przyjmuje poprawne, odrzuca pusty `title` i zły `type`, `description=''` → `null`; serwis buduje INSERT z `accepted`/`new`/`null session`. Integracyjne (`vitest.integration.config.ts`) — POST pod RLS tworzy wiersz z poprawnymi statusami; zły payload → 400 bez wstawienia; brak auth → 401.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Testy jednostkowe przechodzą: `npm test`
- Testy integracyjne przechodzą: `npm run test:integration`
- Doraźne (odpalam sam — dev server na `http://localhost:4321` + lokalny Supabase): `curl -X POST /api/items` z poprawnym body → `201` + `acceptance_status:"accepted"` / `operational_status:"new"` / `import_session_id:null`; zły payload (brak `title` / zły `type`) → `400 bad_request`; bez cookie → `401`; sesja usera bez klucza BYOK → `201`. Wiersz i statusy potwierdzone **zapytaniem do bazy** (nie UI Studio).

#### Weryfikacja ręczna:

- (brak — całość Fazy 1 weryfikowalna automatycznie/doraźnie)

**Uwaga implementacyjna**: Po przejściu weryfikacji automatycznej i doraźnej przejdź do Fazy 2.

---

## Faza 2: Frontend — modal + akcja w Aktywne + UX po zapisie

### Przegląd

Modal dodawania (reuse wzorca `EditItemDialog`), metoda hooka `createItem`, przycisk w nagłówku Aktywne, optimistic insert + pin + focus, domyślny typ = ostatnio użyty.

### Wymagane zmiany:

#### 1. Helper payloadu

**Plik**: `src/components/items/create-form.ts` (nowy; reużywa `isTitleValid` z `edit-form.ts`)

**Cel**: Czysta funkcja budująca payload tworzenia z pól formularza + odczyt/zapis „ostatnio użytego typu".

**Kontrakt**: `buildCreatePayload(title, description, type): CreateItemInput` (trim `title`, `description` pusty → `null`). `readLastItemType(): ItemType` — czyta `localStorage['tl_lastitemtype']`, waliduje względem `ITEM_TYPES` (import z `@/lib/ai/schema`, jak `EditItemDialog.tsx:20`), fallback `'task'`. `writeLastItemType(type)`.

#### 2. Hook mutacji

**Plik**: `src/components/hooks/useItemMutation.ts`

**Cel**: Dodać `createItem` analogicznie do istniejących metod.

**Kontrakt**: `createItem(input: CreateItemInput): Promise<CreateItemResult>` gdzie `CreateItemResult = {ok:true; item:Item} | {ok:false; reason:'failed'}`. `fetch('/api/items', {method:'POST', body: JSON.stringify(input)})`; `res.ok && data.ok && data.item` → `{ok:true,item}`; inaczej ustaw `error` i `{ok:false,reason:'failed'}`. Zarządza `pending`.

#### 3. Modal dodawania

**Plik**: `src/components/items/AddItemDialog.tsx` (nowy)

**Cel**: Modal z polami typ/`title`/`description`, bez selektora stanu operacyjnego (serwer ustala `new`).

**Kontrakt**: Props `{ open, onOpenChange, onCreated(item: Item) }`. Stan `title`/`description`/`type` (init `type = readLastItemType()`). Pola: `Input` (title, gate `isTitleValid`), `Textarea` (description), `Select` (typ przez `itemTypeLabel` + `ITEM_TYPES`). Zapis: `buildCreatePayload` → `createItem`; na `ok` — `writeLastItemType(type)`, `toast.success("Dodano element.")`, `onCreated(item)`, zamknij; na `fail` — `toast.error(...)`. Bramka „niezapisane zmiany" przy zamknięciu, gdy pola niepuste (mirror `EditItemDialog`). Brak „dodaj kolejny" — zamyka się po zapisie.

#### 4. Integracja z widokiem Aktywne

**Plik**: `src/components/items/AcceptedItemsView.tsx`

**Cel**: Przycisk „Dodaj item" w TRWAŁYM nagłówku widoku (tylko Aktywne; widoczny TAKŻE przy pustej liście) + obsługa utworzenia: insert + pin + focus.

**Kontrakt**: Nowy prop `canAdd: boolean`. Gdy `canAdd` — render `Button` „Dodaj item" w **trwałym rzędzie nagłówka renderowanym PRZED gałęzią `items.length === 0 ? …`** (`AcceptedItemsView.tsx:177-188`) + `<AddItemDialog>` — tak by przycisk był widoczny niezależnie od pustki listy/filtra (dziś pusty widok renderuje wyłącznie div statusu, linie 181-198; pusty wynik filtra — linie 192-198). To OSOBNY rząd niż pasek bulk, który zostaje pod warunkiem `visibleItems.length > 0` (zależy od selekcji widocznych itemów). Stan `addOpen`, `focusId: string | null`. `onCreated(item)`: w jednym update — dołóż `item` na początek `items` i dodaj `item.id` do `pinnedIds`; ustaw `focusId = item.id`; zamknij dialog. `useEffect` na `focusId`: znajdź element po referencji/`data-item-id`, `scrollIntoView({block:'nearest'})` + `focus()`, wyczyść `focusId`. Element itemu musi mieć stabilny uchwyt (ref po id lub `data-item-id` + `tabIndex={-1}`).

#### 5. Przekazanie propsu ze strony

**Plik**: `src/pages/items/active.astro` (+ `done.astro`, `cancelled.astro`)

**Cel**: Włączyć akcję dodawania tylko na Aktywne.

**Kontrakt**: `active.astro` przekazuje `canAdd={true}` do `AcceptedItemsView`; `done.astro` i `cancelled.astro` przekazują `canAdd={false}` (lub pomijają — domyślnie `false`).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Testy jednostkowe przechodzą: `npm test` — pokrywają: `isTitleValid` / stan „Zapisz" `disabled`; `readLastItemType` (poprawny odczyt + fallback `'task'` przy złej wartości w `localStorage`); `buildCreatePayload` (trim/null); **czysty reducer insert+pin** (nowy item trafia do `items` i do `pinnedIds`, niezależnie od aktualnego filtra typu).

#### Weryfikacja ręczna:

> Nieautomatyzowalne bez warstwy E2E/przeglądarki — poza zakresem tego wycinka (klikanie w DOM, faktyczny `focus()`/scroll, render).

- Przycisk „Dodaj item" widoczny w nagłówku Aktywne; nieobecny w Zakończone/Anulowane.
- Otwarcie dialogu → selektor pokazuje domyślny typ (ostatnio użyty); faktyczny `focus()` + scroll na nowej karcie po zapisie.
- Zapis → toast „Dodano element."; dialog się zamyka (brak „dodaj kolejny").
- Pełen klik-through bez skonfigurowanego klucza API tworzy item.

**Uwaga implementacyjna**: Po przejściu weryfikacji automatycznej zatrzymaj się na krótkie potwierdzenie ręczne (klik-through w przeglądarce) przed domknięciem fazy.

---

## Strategia testowania

### Testy jednostkowe:

- `createItemSchema`: poprawne wejście, odrzucenie pustego `title` i złego `type`, `description=''` → `null`.
- `createManualItem`: INSERT z `accepted`/`new`/`null session`, `updated_at` jawnie.
- `buildCreatePayload` / `readLastItemType`: trim + null; niepoprawna wartość w `localStorage` → fallback `'task'`.

### Testy integracyjne:

- `POST /api/items` pod RLS: tworzy wiersz właściwego usera ze statusami `accepted`/`new`; zły payload → 400 bez wstawienia; brak auth → 401.

### Kroki testowania ręcznego:

1. Na `/items/active` kliknij „Dodaj item", wybierz typ, wpisz tytuł, zapisz → item w liście, sfokusowany, toast.
2. Ustaw filtr typu na inny niż dodawany → dodany item nadal widoczny (przypięty).
3. Usuń klucz API w profilu → dodawanie nadal działa.
4. Sprawdź brak przycisku w Zakończone/Anulowane.

## Uwagi dotyczące wydajności

Bez implikacji — pojedynczy INSERT + lokalny update stanu listy. Optimistic insert eliminuje round-trip odświeżenia.

## Uwagi dotyczące migracji

Brak migracji — schemat (`items`, RLS INSERT, nullable `import_session_id`) gotowy od S-02/S-04.

## Referencje

- Roadmapa: `context/foundation/roadmap.md` (S-07), PRD `context/foundation/prd.md` (FR-028, US-08, FR-024 wyjątek).
- Wzorzec endpointu: `src/pages/api/items/bulk.ts`, `src/pages/api/items/[id].ts`.
- Wzorzec UI: `src/components/items/EditItemDialog.tsx`, `src/components/items/edit-form.ts`.
- Hook: `src/components/hooks/useItemMutation.ts`. Etykiety: `src/lib/labels.ts`. Filtr/pin: `src/components/items/type-filter.ts`, `AcceptedItemsView.tsx`.
- Lekcje: `context/foundation/lessons.md` (walidacja zod wielopolowa; kształt błędu `{ok:false,code,error}`; nie ufaj wejściu).

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po zakończeniu kroku. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Backend tworzenia itemu

#### Automatyczne

- [x] 1.1 Lint przechodzi: `npm run lint` — aa5e32a
- [x] 1.2 Build przechodzi: `npm run build` — aa5e32a
- [x] 1.3 Testy jednostkowe przechodzą: `npm test` — aa5e32a
- [x] 1.4 Testy integracyjne przechodzą: `npm run test:integration` — aa5e32a
- [ ] 1.5 Doraźne (curl + zapytanie do bazy): POST poprawny → 201 + `accepted`/`new`/`null session`; zły payload → 400; bez auth → 401; sesja bez klucza → 201; wiersz potwierdzony w bazie

### Faza 2: Frontend — modal + akcja w Aktywne + UX po zapisie

#### Automatyczne

- [x] 2.1 Lint przechodzi: `npm run lint`
- [x] 2.2 Build przechodzi: `npm run build`
- [x] 2.3 Testy jednostkowe przechodzą: `npm test` (isTitleValid/disabled, readLastItemType+fallback, buildCreatePayload, reducer insert+pin)

#### Ręczne

- [ ] 2.4 Przycisk „Dodaj item" w Aktywne; nieobecny w Zakończone/Anulowane
- [ ] 2.5 Selektor pokazuje domyślny typ; `focus()` + scroll na nowej karcie po zapisie
- [ ] 2.6 Toast „Dodano element."; dialog zamyka się (brak „dodaj kolejny")
- [ ] 2.7 Klik-through bez skonfigurowanego klucza API tworzy item
