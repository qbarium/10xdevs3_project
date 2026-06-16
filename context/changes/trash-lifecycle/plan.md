# Cykl życia kosza (S-06) — Plan implementacji

## Przegląd

Włączamy wymiar „kosza" do cyklu życia itemu: przeniesienie zaakceptowanego itemu do kosza, przywrócenie go i trwałe opróżnienie kosza — akcje per-item i zbiorcze, zgodnie z FR-013 i FR-016. Model dwóch niezależnych wymiarów (akceptacja × stan operacyjny) sprawia, że zachowanie stanu operacyjnego przy przenoszeniu/przywracaniu jest automatyczne — nie dotykamy `operational_status`.

Restore staje się **dwukierunkowy**: `deleted → accepted` ORAZ `rejected → pending` (semantyka „cofnij ostatnią tranzycję"). To świadoma **zmiana kontraktu PRD** (decyzja użytkownika 2026-06-16), bo dotychczasowy guardrail „lifecycle akceptacji jednokierunkowy" zakazywał powrotu `rejected`. Plan zaczyna od wniesienia tej zmiany do `prd.md`.

## Analiza stanu obecnego

- **Schemat w pełni gotowy — bez migracji.** `items.acceptance_status` to enum `pending|accepted|rejected|deleted` (`supabase/migrations/20260610052532_classification_schema.sql:16`); wartość `deleted` istnieje, lecz nigdzie nie jest jeszcze ustawiana. RLS ma komplet polityk per-operacja, w tym `items_delete_own` (FOR DELETE, `(select auth.uid()) = user_id`) — twardy DELETE jest dozwolony bez nowej migracji.
- **Backend mutacji** (`src/lib/services/items-mutation.ts`): `setAcceptanceStatus(ids, "accepted"|"rejected")` z guardem **na stałe `pending`** (`:67`), `setOperationalStatus(ids, status)` z guardem `accepted` (`:91`), `editItem(...)` z compare-and-swap na `updated_at` (`:117-145`). Wzorzec: jeden atomowy `UPDATE ... .in("id", ids).eq("acceptance_status", guard).select("id")`, zwraca `updatedIds`.
- **Backend odczytu** (`src/lib/services/items.ts`): `listByAcceptance(...)` (`:16`) — trzon dla pending/accepted/rejected; `getRejectedItems` (`:41`) zwraca tylko `rejected`. Sortowanie widoków nie-pending: `updated_at DESC, created_at DESC, id ASC`.
- **Walidacja** (`src/lib/validation/items.ts`): `bulkActionSchema` z `action: z.enum(["accept","reject"])` (`:16-19`), `ids: array(uuid).min(1).max(100)`.
- **Endpoint bulk** (`src/pages/api/items/bulk.ts`): POST, auth-gated, zod przed efektem, mapuje `action`→status, kształt błędu `{ok:false, code, error}`.
- **Front Kosza** (`src/pages/items/trash.astro`): SSR, `getRejectedItems` + `ItemList.astro` (read-only, bez akcji, bez checkboxów). Brak wyspy React, brak pod-filtra, brak `deleted`.
- **Wyspa accepted** (`src/components/items/AcceptedItemsView.tsx`): pełny wzorzec do reużycia — selekcja (`selection.ts`), 4 przyciski bulk (`BULK_TARGETS`, `:34`, `:217-230`), per-item karta z jednym przyciskiem „Edytuj" (`:255-264`), pessimistic dim (`inFlightIds`), `Dialog` confirm gdy `requiresConfirmation` (select-all), `toast` (Sonner), `reconcileAfterChange` (`operational-view.ts`), filtr typu przez wspólny cookie SSR (`handleFilterChange`, `:153-164`).
- **Hook mutacji** (`src/components/hooks/useItemMutation.ts`): `bulk(ids, action)` → `POST /api/items/bulk`; eksponuje `bulkAccept`/`bulkReject`/`setOperationalStatus`/`editItem`; zwraca liczbę faktycznie zmienionych lub `null`.

## Pożądany stan końcowy

Użytkownik może: (1) z widoków Aktywne/Zakończone/Anulowane przenieść zaakceptowany item do kosza (per-item i zbiorczo); item znika z widoku, ląduje w Koszu jako `deleted`, zachowując stan operacyjny. (2) W widoku Kosz przełączać pod-filtr **Wszystkie / Odrzucone / Usunięte**, przywracać itemy (per-item i zbiorczo) — `deleted` wraca do Aktywnych/Zakończonych/Anulowanych dokładnie do swojego stanu operacyjnego, `rejected` wraca do „Elementy do akceptacji". (3) Opróżnić cały kosz jedną globalną akcją z obowiązkowym potwierdzeniem podającym łączną liczbę usuwanych itemów (rejected + deleted, ponad filtrami).

Weryfikacja: pełna pętla `Aktywne → Do kosza → Kosz → Przywróć → Aktywne` oraz `Elementy do akceptacji → Odrzuć → Kosz → Przywróć → Elementy do akceptacji`; „Wyczyść kosz" trwale kasuje wiersze (znikają z DB). PRD nie zawiera już zapisu o jednokierunkowości w wymiarze akceptacji.

### Kluczowe odkrycia:

- **Brak migracji.** Enum `deleted` i polityka DELETE już istnieją (`20260610052532_classification_schema.sql:16,109-111`).
- **Restore jest deterministyczny z samego `acceptance_status`** — `deleted` zawsze pochodzi z `accepted` (jedyny guard move-to-trash), `rejected` zawsze z `pending` (guard reject z S-03). Mapowanie undo nie wymaga kolumny „previous_status".
- **Zachowanie stanu operacyjnego jest automatyczne** — żadna operacja kosza nie dotyka `operational_status`.
- **Wzorzec wyspy** do skopiowania: `AcceptedItemsView.tsx` (selekcja + bulk + per-item + confirm + toast + filtr typu przez cookie).

## Czego NIE robimy

- **Per-item permanent delete** — poza MVP (PRD Non-Goals); jedyne trwałe usunięcie to globalne „Wyczyść kosz".
- **Auto-cleanup / TTL** kosza — poza MVP.
- **Undo jako ephemeryczny toast** po move-to-trash — poza MVP; odzysk wyłącznie przez Kosz + „Przywróć".
- **Optimistic concurrency (compare-and-swap)** dla move/restore/empty — przejścia są guardowane bieżącym statusem, nie znacznikiem `updated_at`; CAS zostaje wyłącznie w `editItem` (S-05).
- **Sortowanie/wyszukiwanie/filtr sesji w Koszu** — to S-09.
- **Nowa migracja / zmiana RLS** — niepotrzebne (schemat gotowy).
- **Testy e2e / przeglądarkowe (Playwright) i nowe testy integracyjne (RLS z realnym Supabase)** — poza zakresem (lekcja przed nami). S-06 pokrywamy testami jednostkowymi vitest + ręczną weryfikacją UI.

## Podejście do implementacji

Trzy fazy: (1) **Kontrakt + Backend** — amendment PRD, serwisy odczytu/mutacji kosza, walidacja, endpointy; (2) **Frontend Kosz** — wyspa `TrashItemsView` z pod-filtrem, restore i „Wyczyść kosz"; (3) **Frontend wejście do kosza** — „Przenieś do kosza" w `AcceptedItemsView`. Kolejność celowa: Faza 2 dostarcza widoczny, testowalny cel (Kosz działa od razu na istniejących `rejected`), Faza 3 domyka pętlę active→kosz→restore.

Backend reużywa atomowy wzorzec `UPDATE ... .in().eq().select("id")`. API: rozszerzenie `bulkActionSchema`/`bulk.ts` o `trash`/`restore` (operacje na liście id) + osobny endpoint na hard DELETE (inny kontrakt: brak id, kasowanie globalne). Front reużywa `AcceptedItemsView` jako szablon wyspy.

## Krytyczne szczegóły implementacji

- **Restore = DWA guarded UPDATE-y, nie jeden `setAcceptanceStatus`.** Mieszana selekcja (rejected + deleted) wymaga dwóch statementów, każdy guardowany bieżącym statusem: `... .eq("acceptance_status","deleted")` → `accepted` oraz `... .eq("acceptance_status","rejected")` → `pending`. Każdy atomowy; `updatedIds` to suma obu. Guard gwarantuje, że item przeskoczy tylko z właściwego stanu źródłowego — bezpieczne przy częściowym trafieniu i zgodne z FR-007 („reszta pominięta bez błędu"). Oba UPDATE-y **nie są wspólnie transakcyjne**: gdy pierwszy się zatwierdzi, a drugi rzuci, endpoint zwróci 500 z częściowo przywróconym koszem — UI dostaje `null` (toast błędu, lista nieodświeżona), ale po reloadzie stan jest spójny per-item (każdy w prawidłowym statusie), bez korupcji. Świadomie akceptowalne dla solo-MVP (jak deferowana optimistic concurrency w `lessons.md`); pełna transakcyjność (RPC / funkcja SQL) poza zakresem.
- **„Wyczyść kosz" to PIERWSZY twardy DELETE w aplikacji.** Reszta cyklu życia to soft-delete przez `acceptance_status`. RLS `items_delete_own` już to dopuszcza — żadnej migracji. Kasujemy `WHERE acceptance_status IN ('rejected','deleted')` (RLS dokłada `user_id`).
- **`updated_at` ustawiamy na `now()` przy move i restore** — widoki nie-pending sortują po `updated_at DESC`, więc świeżo przeniesiony/przywrócony item ląduje na górze docelowej listy (spójnie z accept/reject z S-03).
- **Liczba w potwierdzeniu „Wyczyść kosz" = łączny stan kosza usera (rejected + deleted), ponad filtrami typu i rejected/deleted.** Wyspa trzyma w stanie wszystkie itemy kosza (`initialItems`), więc `items.length` to prawda; dialog musi to jasno zakomunikować, by uniknąć pułapki „widziałem 2, skasowało 10".

## Faza 1: Kontrakt + Backend

### Przegląd

Wniesienie zmiany kontraktu do PRD (restore dwukierunkowy) oraz dodanie warstwy danych kosza: odczyt obu statusów, trzy mutacje, walidacja, endpointy.

### Wymagane zmiany:

#### 1. Amendment PRD — restore dwukierunkowy

**Plik**: `context/foundation/prd.md`

**Cel**: Usunąć zapis o jednokierunkowości wymiaru akceptacji i dopuścić przywracanie `rejected → pending`. Decyzja właścicielska użytkownika z 2026-06-16; PRD jest źródłem prawdy, więc kontrakt musi to odzwierciedlać przed implementacją.

**Kontrakt**: Zmień cztery miejsca, zachowując styl i numerację:
- Guardrail „Item lifecycle jest jednokierunkowy…" (`:51`) → przeredaguj: restore cofa ostatnią tranzycję w wymiarze akceptacji (`deleted→accepted`, `rejected→pending`); jedyne nieodwracalne usunięcie to „wyczyść kosz".
- US-03 AC (`:89`) „nie można go już zaakceptować (lifecycle nie wraca do `pending`)" → zastąp zapisem, że odrzucony item można przywrócić z Kosza do „Elementy do akceptacji".
- FR-013 (`:259`) → dopisz, że przywracanie obejmuje także `rejected` (→ `pending`), z notką „🔁 Decyzja projektowa 2026-06-16".
- FR-012 (`:255`) → **przeredaguj klauzulę trwałości** (nie samo „dopisz"): zastąp zapis „Status `rejected` zachowany na zawsze (audit trail) — usuwany dopiero akcją „wyczyść kosz" (FR-016)" zapisem, że item `rejected` opuszcza stan odrzucenia **albo** przez przywrócenie z Kosza (→ `pending`, ponowne wejście do bramy walidacji), **albo** trwale przez „wyczyść kosz" (FR-016). Inaczej dopisana notka o restore zaprzeczy zachowanej klauzuli „zachowany na zawsze". Notka „🔁 Decyzja projektowa 2026-06-16".

#### 2. Odczyt kosza — `getTrashItems`

**Plik**: `src/lib/services/items.ts`

**Cel**: Zwrócić itemy usera w koszu (oba statusy) dla nowej wyspy, z sortowaniem jak pozostałe widoki nie-pending.

**Kontrakt**: `getTrashItems(supabase, userId): Promise<Item[]>` — `SELECT ITEM_COLUMNS WHERE user_id=? AND acceptance_status IN ('rejected','deleted')` z `order('updated_at',desc).order('created_at',desc).order('id',asc)`. Reużyj `ITEM_COLUMNS`. `getRejectedItems` ma jedynego konsumenta (`trash.astro:21`) — po jego zamianie w Fazie 2 staje się martwym kodem, więc **usuń `getRejectedItems`** z `items.ts` wraz z tą zamianą.

#### 3. Mutacje kosza — move / restore / empty

**Plik**: `src/lib/services/items-mutation.ts`

**Cel**: Trzy operacje kosza w stylu istniejących mutacji (atomowy UPDATE/DELETE, guard statusem, zwrot `updatedIds`/liczby).

**Kontrakt**:
- `moveToTrash(supabase, ids): Promise<{ updatedIds: string[] }>` — `UPDATE acceptance_status='deleted', updated_at=now() ... .in("id",ids).eq("acceptance_status","accepted").select("id")`.
- `restoreFromTrash(supabase, ids): Promise<{ updatedIds: string[] }>` — dwa guarded UPDATE-y (deleted→accepted, rejected→pending), każdy `updated_at=now()`; zwróć sumę `updatedIds`.
- `emptyTrash(supabase): Promise<{ deletedCount: number }>` — `DELETE FROM items ... .in("acceptance_status",["rejected","deleted"]).select("id")` (RLS dokłada user_id); `deletedCount = data.length`.

Nie zmieniaj sygnatury `setAcceptanceStatus` (guard `pending` zostaje pod accept/reject) — to dedykowane funkcje, by nie ruszać istniejących wywołań.

#### 4. Walidacja — rozszerzenie enuma akcji bulk

**Plik**: `src/lib/validation/items.ts`

**Cel**: Dopuścić `trash` i `restore` w payloadzie akcji zbiorczej.

**Kontrakt**: `bulkActionSchema.action` → `z.enum(["accept","reject","trash","restore"])`. `ids` bez zmian (1..100). Endpoint „empty" nie ma wejścia wielopolowego → bez zod (zgodnie z hard rule; brak body).

#### 5. Endpoint bulk — obsługa `trash`/`restore`

**Plik**: `src/pages/api/items/bulk.ts`

**Cel**: Skierować nowe akcje do `moveToTrash`/`restoreFromTrash`, zachowując kontrakt odpowiedzi.

**Kontrakt**: Po walidacji rozgałęź `action`: `accept`/`reject` → `setAcceptanceStatus` (jak dziś); `trash` → `moveToTrash`; `restore` → `restoreFromTrash`. Odpowiedź sukcesu `{ ok:true, action, updatedIds, count }`; błędy `{ok:false, code, error}` jak dziś.

#### 6. Endpoint empty — twardy DELETE kosza

**Plik**: `src/pages/api/items/trash/empty.ts` (nowy)

**Cel**: Globalne, trwałe opróżnienie kosza usera.

**Kontrakt**: `export const prerender = false; export const POST` — auth-gated (`locals.user`), klient z cookies (RLS), wywołuje `emptyTrash(supabase)`, zwraca `{ ok:true, deletedCount }`; błędy w ujednoliconym kształcie. Bez body.

#### 7. Testy jednostkowe (vitest)

**Plik**: `src/lib/validation/items.test.ts`, `src/pages/api/items/bulk.test.ts`, `src/pages/api/items/trash/empty.test.ts` (nowy)

**Cel**: Pokryć logikę backendu na poziomie jednostkowym (mock `createClient` + serwisy), wzorem istniejących `bulk.test.ts`/`items.test.ts`.

**Kontrakt**:
- `items.test.ts`: `bulkActionSchema` przyjmuje `trash` i `restore`; payload śmieciowy / `>100 id` dalej 400.
- `bulk.test.ts`: `action:"trash"` woła `moveToTrash`, `action:"restore"` woła `restoreFromTrash`; odpowiedź `{ok, action, updatedIds, count}`; zły payload → 400 bez wywołania serwisu (mock nowych serwisów).
- `empty.test.ts` (nowy): 401 bez auth (serwis nie wołany), 200 `{ok, deletedCount}`, 500 generyczne przy rzucie serwisu.

UWAGA: unity mockują Supabase — NIE dowodzą RLS. Izolacja per-user przy twardym DELETE („B nie kasuje kosza A") pozostaje weryfikacją RĘCZNĄ (warstwa integracyjna poza zakresem — patrz „Czego NIE robimy").

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint (type-checked) przechodzi: `npm run lint`
- Build produkcyjny przechodzi: `npm run build`
- Testy jednostkowe przechodzą: `npm run test` (nowe trash/restore/empty + brak regresji)

#### Weryfikacja ręczna:

- `POST /api/items/bulk {action:"trash"}` na zaakceptowanym itemie → w DB `acceptance_status='deleted'`, `operational_status` niezmieniony.
- `POST /api/items/bulk {action:"restore"}` na itemie `deleted` → `accepted`; na `rejected` → `pending`.
- `POST /api/items/trash/empty` → wiersze `rejected`+`deleted` usera zniknęły z tabeli; odpowiedź podaje `deletedCount`.
- **RLS (twardy DELETE):** zalogowany jako drugi user — „Wyczyść kosz" NIE rusza kosza pierwszego usera (sprawdzenie ręczne — unit tego nie dowodzi).
- `prd.md` nie zawiera już zapisu o jednokierunkowości wymiaru akceptacji; FR-012/013 wspominają restore `rejected→pending`.

---

## Faza 2: Frontend Kosz

### Przegląd

Zamiana read-only widoku Kosza na interaktywną wyspę: pod-filtr rejected/deleted, restore (per-item + bulk), „Wyczyść kosz" z obowiązkowym potwierdzeniem.

### Wymagane zmiany:

#### 1. Etykiety pochodzenia w koszu

**Plik**: `src/lib/labels.ts`

**Cel**: Czytelne etykiety statusu kosza na karcie i w pod-filtrze.

**Kontrakt**: Dodaj (jeśli brak) `acceptanceOriginLabel(status)`: `rejected → "Odrzucone"`, `deleted → "Usunięte"`. Reużyj istniejący wzorzec `itemTypeLabel`/`operationalStatusLabel`.

#### 2. Hook mutacji — operacje kosza

**Plik**: `src/components/hooks/useItemMutation.ts`

**Cel**: Eksponować move/restore/empty dla wyspy.

**Kontrakt**: Rozszerz `bulk(ids, action)` o `"trash"|"restore"` (ten sam `BULK_ENDPOINT`); dodaj `moveToTrash(ids)`, `restoreFromTrash(ids)` zwracające liczbę zmienionych lub `null`. Dodaj `emptyTrash(): Promise<number | null>` → `POST /api/items/trash/empty`, zwraca `deletedCount`. Rozszerz interfejs `UseItemMutation`.

#### 3. Reconcyliacja kosza

**Plik**: `src/components/items/trash-view.ts` (nowy; wzór: `operational-view.ts`)

**Cel**: Logika usuwania przywróconych itemów z listy kosza i pomocnicze filtrowanie pod-statusu.

**Kontrakt**: `applyTrashSubFilter(items, sub: "all"|"rejected"|"deleted")` zawężający po `acceptance_status` — **jedyny nowy helper w tym pliku**. Do usuwania przywróconych z listy **reużyj `removeByIds` z `selection.ts`** (`:34`, już istnieje, używany przez `AcceptedItemsView`) — nie duplikuj go w `trash-view.ts`.

#### 4. Wyspa `TrashItemsView`

**Plik**: `src/components/items/TrashItemsView.tsx` (nowy)

**Cel**: Interaktywny Kosz wzorowany na `AcceptedItemsView` — selekcja, restore, pod-filtr, „Wyczyść kosz".

**Kontrakt**: Props `{ initialItems: Item[]; initialTypeFilter: TypeFilterValue }`. Stan: `items`, `selected`, pod-filtr (`"all"|"rejected"|"deleted"`, React state), `typeFilter`, `inFlightIds`, `confirmEmpty: boolean`. Render:
- Rząd pod-filtra **Wszystkie / Odrzucone / Usunięte** (single-select, wzór wizualny `TypeFilter`).
- Reużyty `TypeFilter` (filtr typu) + wspólny cookie SSR (jak `AcceptedItemsView.handleFilterChange`).
- `visibleItems = applyTrashSubFilter(applyTypeFilter(items, typeFilter), sub)`.
- Pasek bulk: „Zaznacz wszystkie" + licznik + przycisk **„Przywróć zaznaczone"**.
- Per-item karta: checkbox + badge typu + badge pochodzenia (`acceptanceOriginLabel`) + przycisk **„Przywróć"**.
- Globalny przycisk **„Wyczyść kosz"** (variant `destructive`) — zawsze otwiera `Dialog` potwierdzenia z łączną liczbą `items.length` (cały kosz, ponad filtrami).
- Restore: pessimistic dim + po sukcesie `removeByIds` + toast; potwierdzenie tylko gdy `requiresConfirmation(selected, visibleItems.length)` (jak istniejący wzorzec). „Wyczyść kosz": po potwierdzeniu `emptyTrash()` → `setItems([])` + toast.

#### 5. Strona Kosza — montaż wyspy

**Plik**: `src/pages/items/trash.astro`

**Cel**: Załadować oba statusy i zamontować wyspę zamiast read-only listy.

**Kontrakt**: `getRejectedItems` → `getTrashItems` (i **usuń `getRejectedItems`** z `items.ts` — po tej zamianie brak innych konsumentów); odczyt cookie filtra typu SERWEROWO (mirror `active.astro`) → `initialTypeFilter`; renderuj `<TrashItemsView client:load initialItems={items} initialTypeFilter={...} />` zamiast `ItemList`. Zachowaj `Layout`/`Topbar`/`MainFilterNav`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint (type-checked) przechodzi: `npm run lint`
- Build produkcyjny przechodzi: `npm run build`
- Testy jednostkowe bez regresji: `npm run test`

#### Weryfikacja ręczna (checklista „kliknij → powinieneś zobaczyć"):

1. Wejdź w Kosz → widzisz dotychczasowe odrzucone itemy (lista nie jest już read-only).
2. Pod-filtr „Odrzucone" → tylko odrzucone; „Usunięte" → pusto (jeszcze brak `deleted`); „Wszystkie" → komplet.
3. Ustaw filtr typu (np. Zadania) razem z pod-filtrem → lista zawęża się po obu naraz.
4. Zaznacz jeden odrzucony, „Przywróć" → znika z Kosza; w „Elementy do akceptacji" → jest tam.
5. Zaznacz wszystkie widoczne, „Przywróć" → pojawia się dialog potwierdzenia (select-all); potwierdź → lista pustoszeje.
6. „Wyczyść kosz" → dialog z łączną liczbą wszystkich itemów kosza; potwierdź → lista pusta.
7. Reakcja UI po każdym kliknięciu < 200 ms (NFR).

---

## Faza 3: Frontend — wejście do kosza

### Przegląd

Dodanie akcji „Przenieś do kosza" w widokach zaakceptowanych (Aktywne/Zakończone/Anulowane), per-item i zbiorczo, domykające pełną pętlę.

### Wymagane zmiany:

#### 1. Akcja „Przenieś do kosza" w `AcceptedItemsView`

**Plik**: `src/components/items/AcceptedItemsView.tsx`

**Cel**: Umożliwić przeniesienie zaakceptowanego itemu do kosza z paska zbiorczego i z karty, spójnie z modelem FR-007.

**Kontrakt**:
- Pasek bulk: dodaj przycisk **„Do kosza"** (obok 4 przycisków stanu; rozważ `variant="outline"` z subtelnym wyróżnieniem) wywołujący ścieżkę move-to-trash.
- Per-item karta: dodaj przycisk **„Do kosza"** obok „Edytuj" (`:255-264`).
- Uogólnij `confirmRequest` do unii rozróżniającej `{ kind:"operational"; target } | { kind:"trash" }`, a `execute`/`requestBulk` rozgałęź: `trash` → `useItemMutation.moveToTrash`, status operacyjny → istniejące `setOperationalStatus`.
- Reconcyliacja: po move-to-trash item opuszcza widok bezwarunkowo — `setItems(prev => prev.filter(id ∉ ids))` (nie `reconcileAfterChange`, bo to wyjście z `accepted`, nie zmiana stanu operacyjnego).
- Potwierdzenie: wg istniejącego wzorca (`requiresConfirmation` — tylko gdy zaznaczono wszystkie widoczne). Treść dialogu: „Przenieść N elementów do kosza?".

#### 2. Hook — `moveToTrash` (jeśli nie dodany w Fazie 2)

**Plik**: `src/components/hooks/useItemMutation.ts`

**Cel**: Zapewnić `moveToTrash` dla wyspy accepted.

**Kontrakt**: Już dodane w Fazie 2 (`bulk(ids,"trash")`); tu tylko konsumpcja. Jeśli kolejność implementacji odwrócona — dodać analogicznie.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint (type-checked) przechodzi: `npm run lint`
- Build produkcyjny przechodzi: `npm run build`
- Testy jednostkowe bez regresji: `npm run test`

#### Weryfikacja ręczna (checklista „kliknij → powinieneś zobaczyć"):

1. W Aktywne kliknij „Do kosza" na karcie itemu → znika z Aktywne; w Koszu, pod-filtr „Usunięte" → jest tam.
2. Zaznacz kilka w Aktywne, zbiorcze „Do kosza" → znikają; potwierdzenie pojawia się tylko przy zaznaczeniu wszystkich.
3. To samo działa w Zakończone i Anulowane.
4. Pełna pętla: oznacz zadanie „Zrobione" (→ Zakończone) → „Do kosza" → Kosz → „Przywróć" → wraca do **Zakończone** (nie do Aktywne) — stan operacyjny zachowany.
5. 4 przyciski stanu operacyjnego i „Edytuj" dalej działają (brak regresji).

---

## Strategia testowania

Projekt MA vitest i zestaw testów (unit kolokowane `*.test.ts` przez `npm run test`; integracyjne przez `npm run test:integration`). Dla S-06, zgodnie z bieżącym zakresem kursu (przed lekcją o e2e), pokrywamy **wyłącznie testami jednostkowymi vitest**; warstwy e2e/przeglądarkowej i nowych testów integracyjnych NIE dotykamy (patrz „Czego NIE robimy"). UI weryfikujemy ręcznie (checklisty w kryteriach Faz 2–3).

### Testy jednostkowe (vitest, Faza 1):

- `src/lib/validation/items.test.ts` — `bulkActionSchema` przyjmuje `trash`/`restore`; śmieci / `>100` dalej 400.
- `src/pages/api/items/bulk.test.ts` — `trash`→`moveToTrash`, `restore`→`restoreFromTrash`; kształt odpowiedzi; 400 bez dotknięcia serwisu.
- `src/pages/api/items/trash/empty.test.ts` (nowy) — 401 / 200 `{ok, deletedCount}` / 500 dla endpointu empty.
- `selection.ts` ma testy z S-03 (reużywane, bez zmian).

### Granica testów jednostkowych (świadoma):

Unity mockują Supabase, więc NIE dowodzą RLS — izolacja per-user przy twardym DELETE („B nie kasuje kosza A") jest sprawdzana RĘCZNIE w Fazie 1. Pełne pokrycie integracyjne tej ścieżki → gdy projekt wejdzie w lekcję o testach integracyjnych/e2e.

### Kroki testowania ręcznego:

- Faza 1: ręczny check RLS twardego DELETE (drugi user) + szybka inspekcja stanów w Supabase Studio.
- Fazy 2–3: checklisty „kliknij → zobacz" w kryteriach sukcesu tych faz (Kosz, restore, „Wyczyść kosz", pełna pętla z zachowaniem stanu operacyjnego).
- Przypadek brzegowy: „Wyczyść kosz" przy aktywnym filtrze typu + pod-filtrze — kasuje CAŁY kosz, a liczba w dialogu to łączny stan.

## Uwagi dotyczące migracji

Brak migracji ani zmian RLS — schemat (`deleted`, polityka `items_delete_own`) jest gotowy od S-02/S-04. „Wyczyść kosz" to jedyny twardy DELETE; istniejąca polityka DELETE go autoryzuje per-user. Uwaga: komentarz w zastosowanej migracji (`20260610052532_classification_schema.sql:15` — „twardego DELETE wiersza nie używamy w MVP") jest **odtąd historyczny i NIE edytujemy zastosowanej migracji** (historia niezmienna); aktualną prawdę o twardym DELETE niosą `## Analiza stanu obecnego` tego planu oraz polityka `items_delete_own`.

## Referencje

- Roadmapa: `context/foundation/roadmap.md` (S-06, gwiazda przewodnia łańcuch)
- PRD: `context/foundation/prd.md` — US-05, FR-012, FR-013, FR-016, NFR Retencja
- Lekcje: `context/foundation/lessons.md` — kształt błędu `{ok,code,error}`; optimistic concurrency tylko dla edycji; formatuj celowanymi ścieżkami
- Wzorce kodu: `items-mutation.ts:58-96` (atomowy bulk UPDATE), `AcceptedItemsView.tsx` (wzorzec wyspy), `bulk.ts` (endpoint), `items.ts:16-43` (odczyt)

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po zakończeniu kroku. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Kontrakt + Backend

#### Automatyczne

- [x] 1.1 Lint (type-checked) przechodzi: `npm run lint` — 2b43f4d
- [x] 1.2 Build produkcyjny przechodzi: `npm run build` — 2b43f4d
- [x] 1.3 Testy jednostkowe przechodzą: `npm run test` (validation trash/restore + bulk handler + empty handler) — 2b43f4d

#### Ręczne

- [ ] 1.4 `trash` ustawia `acceptance_status='deleted'`, `operational_status` niezmieniony
- [ ] 1.5 `restore`: `deleted→accepted` oraz `rejected→pending`
- [ ] 1.6 `empty` trwale kasuje wiersze rejected+deleted; zwraca `deletedCount`
- [ ] 1.7 RLS: drugi user nie kasuje cudzego kosza (ręcznie — unit tego nie dowodzi)
- [ ] 1.8 PRD: usunięty zapis o jednokierunkowości; FR-012/013 wspominają `rejected→pending`

### Faza 2: Frontend Kosz

#### Automatyczne

- [x] 2.1 Lint (type-checked) przechodzi: `npm run lint` — 3cc2457
- [x] 2.2 Build produkcyjny przechodzi: `npm run build` — 3cc2457
- [x] 2.3 Testy jednostkowe bez regresji: `npm run test` — 3cc2457

#### Ręczne

- [ ] 2.4 Pod-filtr Wszystkie/Odrzucone/Usunięte + filtr typu działają łącznie
- [ ] 2.5 „Przywróć" (per-item i bulk) `rejected` → item ląduje w „Elementy do akceptacji"
- [ ] 2.6 „Wyczyść kosz": dialog z łączną liczbą, po potwierdzeniu lista pusta i wiersze zniknęły z DB
- [ ] 2.7 Potwierdzenie restore tylko przy select-all; reakcja UI < 200 ms

### Faza 3: Frontend — wejście do kosza

#### Automatyczne

- [x] 3.1 Lint (type-checked) przechodzi: `npm run lint`
- [x] 3.2 Build produkcyjny przechodzi: `npm run build`
- [x] 3.3 Testy jednostkowe bez regresji: `npm run test`

#### Ręczne

- [ ] 3.4 „Do kosza" per-item i bulk w Aktywne/Zakończone/Anulowane; potwierdzenie tylko przy select-all
- [ ] 3.5 Pełna pętla accepted→deleted→restore→accepted z zachowaniem `operational_status`
- [ ] 3.6 Brak regresji w 4 przyciskach stanu operacyjnego i w edycji
