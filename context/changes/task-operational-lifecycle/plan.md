# Stan operacyjny itemu (S-04) — Plan implementacji

## Przegląd

Rozszerzamy zaakceptowane itemy o **stan operacyjny** (`nowe`/`w realizacji`/`zrealizowane`/`anulowane`, wzajemnie przechodni), zmienialny **per item** (klikalny badge stanu → kontekstowe menu z kuracją przejść) i **zbiorczo** (4 przyciski stanów w pasku akcji). `zrealizowane` przenosi item z Aktywne do **Zakończone**, `anulowane` do **Anulowane**. Domyka ścieżkę gwiazdy przewodniej (Strumień A) i wprowadza dwa brakujące widoki filtra głównego (FR-008: 5 z 5 widoków głównych).

**Świadomy wyłom z FR-009:** stan operacyjny obejmuje **wszystkie typy** itemów (nie tylko `task`), z etykietami stanu **per typ** (`operationalStatusLabel(status, type)` + tabela nadpisań zaprojektowana pod przyszłe definiowanie). Testowe nadpisania `done`: `note`→„Obsłużona", `idea`→„Obsłużony", `decision`→„Podjęta", `other`→„Obsłużone".

## Analiza stanu obecnego

**Co istnieje (S-02 / S-03):**

- **Schemat** (`supabase/migrations/20260610052532_classification_schema.sql:19,57`): enum `operational_status ('new','in_progress','done','cancelled')`; kolumna `items.operational_status` **nullable, bez defaultu** (komentarz: „tylko dla type='task'; null dla pozostałych"). `acceptance_status` enum NOT NULL default `pending`. Indeksy: `items_user_acceptance_idx (user_id, acceptance_status)` (`:65`), `items_session_idx (import_session_id)` (`:67`). RLS per-operacja `(select auth.uid()) = user_id` (`:96-111`). **Brak triggera** na `items` (żadna migracja go nie zakłada); `updated_at` ustawiany jawnie w aplikacji.
- **RPC** `persist_classification` (`supabase/migrations/20260610075357_persist_classification.sql`): przy INSERT itemu wstawia `operational_status = 'new'` dla `task`, `null` dla pozostałych typów.
- **Typy** (`src/types.ts:75-76,118-129`): `OperationalStatus`, `Item.operational_status: OperationalStatus | null`.
- **Etykiety** (`src/lib/labels.ts:15-20,40-42`): `OPERATIONAL_STATUS_LABELS` (`new:"Nowe", in_progress:"W toku", done:"Zrobione", cancelled:"Anulowane"`), `operationalStatusLabel(status)` — **sygnatura jednoargumentowa**.
- **Derywacja** (`src/lib/services/items-mutation.ts:27-29`): `deriveOperationalStatus(type) = type==='task' ? 'new' : null`.
- **Mutacje** (`src/lib/services/items-mutation.ts:37-51,58-75`): `setAcceptanceStatus(supabase, ids, status)` — atomowy bulk UPDATE z guardem `.eq('acceptance_status','pending')` + `.select('id')`, zwraca `{updatedIds}`; `editPendingItem(...)` — guard `pending`, `.maybeSingle()`, rzut `ItemNotEditableError`.
- **Odczyt** (`src/lib/services/items.ts:16-48`): wspólny `listByAcceptance(supabase, userId, status)`; `getAcceptedItems` zwraca **wszystkie** `accepted`; sort `accepted/rejected` = `updated_at DESC, created_at DESC, id ASC`.
- **Walidacja** (`src/lib/validation/items.ts:15-18,26-38`): `bulkActionSchema {ids: uuid[].min(1).max(100), action: enum['accept','reject']}`, `editItemSchema`. `ITEM_TYPES` z `src/lib/ai/schema.ts:10`.
- **Endpointy** (`src/pages/api/items/bulk.ts`, `[id].ts`): `POST`/`PATCH`, `prerender=false`, guard auth → 401, helper `json(body,status)`, `createClient(request.headers, cookies)` (`src/lib/supabase.ts:5-24`, RLS per-request), kształt błędu `{ok:false, code, error}`.
- **Widoki**: `/items/active.astro`, `/items/trash.astro` (read-only `<ItemList>`); `/items.astro` (React island `PendingItemsView`). `MainFilterNav.astro` — **3 linki**, aktywny po `Astro.url.pathname === href` (exact match). `ItemList.astro` — badge typu + badge `acceptanceStatusLabel`; brak badge'a operacyjnego.
- **Island** (`src/components/items/PendingItemsView.tsx`): model zaznaczania (`Set<string>`, select-all tri-state, `selection.ts`), ścieżka `execute()` **pessimistic + dim**, Dialog potwierdzenia select-all (`requiresConfirmation`), stan pusty, toasty (`elementNoun` dla odmiany PL). Hook `useItemMutation.ts` (`bulkAccept/bulkReject/editItem`, zwracają realną liczbę zmienionych z `.count`).
- **UI** (`src/components/ui/`): `checkbox`, `select`, `dialog`, `sonner`, `button`, `input`, `textarea`, `label`, `card`, `alert`. **Brak** `dropdown-menu`. `radix-ui` (unified) w zależnościach.
- **Middleware** (`src/middleware.ts:3`): `PROTECTED_ROUTES` zawiera `/items`; dopasowanie `.startsWith()` → nowe podścieżki chronione automatycznie.

**Czego brakuje:** serwis + endpoint + walidacja mutacji stanu operacyjnego; serwisy odczytu 3 podzbiorów (otwarte/done/cancelled); widoki Zakończone/Anulowane + 5-link nawigacja; interaktywny island dla accepted; funkcja etykiet per-typ; migracja (backfill + RPC + indeks 3-kolumnowy).

## Pożądany stan końcowy

Zalogowany użytkownik na **Aktywne** widzi zaakceptowane itemy wszystkich typów ze stanem operacyjnym `nowe`/`w realizacji`. Klika badge stanu na dowolnym itemie → menu z sensownymi przejściami z bieżącego stanu; wybór przenosi item zgodnie z modelem (np. `zrealizowane` → znika z Aktywne, pojawia się w **Zakończone** z etykietą per-typ). Zaznacza podzbiór i jednym z 4 przycisków paska ustawia stan zbiorczo (nie-`accepted` pominięte bez błędu). W **Zakończone** „Otwórz ponownie" i w **Anulowane** „Przywróć" wracają item do Aktywne (`nowe`). Notatka oznaczona jako obsłużona pokazuje wszędzie badge „Obsłużona".

**Weryfikacja:** `npm run lint` + `npm run build` zielone; `npm test` + `npm run test:integration` zielone; pełny przepływ S-02→S-03→S-04 (paste → klasyfikacja → akceptacja → zmiana stanu → Zakończone) bez błędów; reakcja UI na zmianę stanu < 200 ms (pessimistic dim).

### Kluczowe odkrycia:

- Schemat enum + kolumna istnieją od S-02 — **żadnej zmiany typu/enuma**; migracja dotyczy danych (backfill), RPC i indeksu (`classification_schema.sql:19,57`).
- Mutacja to klon `setAcceptanceStatus` z innym polem i guardem `accepted` zamiast `pending` (`items-mutation.ts:37-51`).
- `getAcceptedItems` (`items.ts:40-42`) dziś zwraca wszystkie accepted — Aktywne musi zawęzić do `operational_status IN ('new','in_progress')`; done/cancelled to nowe podzbiory.
- Island `PendingItemsView.tsx` to gotowy wzorzec (zaznaczanie + pessimistic dim + confirm + toast) do uogólnienia na `AcceptedItemsView` ze zmianą jednostki akcji (stan operacyjny zamiast accept/reject).
- Indeks `(user_id, acceptance_status)` **nie pokrywa** filtra po `operational_status` (zapytania done/cancelled) — Q4 dokłada `(user_id, acceptance_status, operational_status)`.
- Middleware i komponenty UI (poza nowym `dropdown-menu`) — gotowe; `dropdown-menu` na obecnym `radix-ui` → bez nowej zależności npm.

## Czego NIE robimy

- **Edycja zaakceptowanych itemów** (`title`/`description`/`typ`, FR-011) i **filtr typu** (Wszystkie/Zadania/…) — S-05.
- **Filtry dodatkowe** (sort/wyszukiwanie/sesja) — S-09.
- **Kosz: przenieś/przywróć/wyczyść** (FR-013/016) — S-06; Kosz pozostaje read-only z S-03.
- **UI definiowania etykiet per-typ** — poza zakresem; teraz tylko testowe nadpisania `done` + architektura `operationalStatusLabel(status, type)` gotowa pod rozszerzenie.
- **Per-typ nadpisania etykiet AKCJI menu** (verbów „Zrealizuj"/itd.) — teraz generyczne; nadpisywalne później tą samą tabelą.
- **Constraint `NOT NULL` na `operational_status`** — kolumna zostaje nullable; backfill + aplikacja zawsze ustawia `'new'`, więc nowych NULL nie będzie (twardy constraint = opcjonalne utwardzenie później).
- **Trigger `set updated_at`** — Q4 wybrał tylko indeks; `updated_at` dalej jawnie w serwisie.
- **Optimistic concurrency** na mutacji stanu — ryzyko znikome (solo-MVP), odłożone (lekcja `lessons.md`).
- **Edycja `roadmap.md` / PRD / boardu** w ramach faz — wyłom z FR-009 jest do osobnego domknięcia za zgodą użytkownika (patrz Otwarte ryzyka).

## Podejście do implementacji

Backend-first, jak w S-03: najpierw fundament danych (migracja + derywacja + etykiety per-typ), potem warstwa mutacji testowalna niezależnie od UI, potem read-only widoki (obserwowalny cel), na końcu interaktywny island. Każda faza kończy się obserwowalnym efektem; kolejność dobrana tak, by interaktywność z Fazy 4 dało się od razu zweryfikować na widokach z Fazy 3.

## Krytyczne szczegóły implementacji

- **Sekwencjonowanie migracji (Faza 1):** backfill `NULL → 'new'` musi iść **w jednej migracji** ze zmianą RPC `persist_classification` (→ `'new'` dla każdego typu) i ze zmianą `deriveOperationalStatus` w kodzie. Rozjazd któregokolwiek = nowe nie-`task` itemy wpadają z `NULL` i wypadają poza filtr Aktywne/Zakończone (znikają z list). Indeks dokładany w tej samej migracji.
- **Pełna przechodniość w modelu vs kuracja w menu:** `operationalActionSchema` i `setOperationalStatus` przyjmują **dowolny z 4 stanów docelowych** (inwariant FR-009 „wzajemnie przechodnie" na warstwie danych). Menu per-item **kuruje** widoczne przejścia wg stanu źródłowego — graf jest silnie spójny przez hub `nowe`, więc każdy stan pozostaje osiągalny (czasem w 2 krokach). Tabela przejść to osobny moduł UX, nie walidacja.
- **Guard mutacji:** `setOperationalStatus` strzeże **tylko** `.eq('acceptance_status','accepted')` (bez warunku `type` — wszystkie typy mają teraz stan). Itemy nie-`accepted` (np. pending) w `ids` nie pasują do `WHERE` → pominięte bez błędu (FR-007); licznik w toaście z realnej liczby zmienionych wierszy (`.select('id')`), nie z liczby zaznaczonych.
- **Usuwanie itemu z widoku po zmianie stanu (Faza 4):** po udanej mutacji island usuwa z listy itemy, których **nowy** stan nie spełnia predykatu bieżącego widoku (Aktywne: `new|in_progress`; Zakończone: `done`; Anulowane: `cancelled`) — analogicznie do remove-on-accept z S-03. Wzorzec pessimistic + dim (nie optimistic): item wygaszany w trakcie żądania, usuwany po sukcesie.

## Faza 1: Dane + etykiety per-typ

### Przegląd

Fundament danych dla jednolitego modelu stanu operacyjnego na wszystkich typach: migracja (backfill + RPC + indeks), derywacja na wszystkie typy, funkcja etykiet per-typ z testowymi nadpisaniami. Bez UI, bez mutacji stanu.

### Wymagane zmiany:

#### 1. Migracja: backfill + RPC + indeks

**Plik**: `supabase/migrations/<YYYYMMDDHHmmss>_operational_status_all_types.sql` (nowy)

**Cel**: Doprowadzić istniejące i przyszłe itemy każdego typu do posiadania stanu operacyjnego oraz zaindeksować zapytania filtra głównego.

**Kontrakt**:
- `update public.items set operational_status = 'new' where operational_status is null;` (backfill istniejących nie-`task`).
- `create index items_user_acceptance_operational_idx on public.items (user_id, acceptance_status, operational_status);`
- `drop index if exists items_user_acceptance_idx;` — stary 2-kolumnowy indeks `(user_id, acceptance_status)` jest dokładnym lewym prefiksem nowego, więc staje się redundantny (B-tree obsłuży nim każde zapytanie filtra po tej parze, np. `listByAcceptance`). Usunięcie eliminuje narzut na zapisie + duplikację; brak ryzyka funkcjonalnego.
- Zmiana funkcji RPC `persist_classification`: w miejscu wstawiania itemu `operational_status` ustawiane na `'new'` **niezależnie od typu** (dziś `'new'` tylko dla `task`). Zachować resztę kontraktu RPC (transakcyjność sesji + itemów) bez zmian.

#### 2. Derywacja stanu na wszystkie typy

**Plik**: `src/lib/services/items-mutation.ts` (edycja)

**Cel**: Ujednolicić derywację — każdy zaakceptowany/edytowany item dostaje stan operacyjny, nie tylko `task`.

**Kontrakt**: `deriveOperationalStatus(type)` zwraca `'new'` dla każdego `ItemType` (było `type==='task' ? 'new' : null`). Użycie w `editPendingItem` bez zmian sygnatury. **Zaktualizuj istniejące asercje** `items-mutation.test.ts:43-46`, które dziś oczekują `null` dla `note`/`idea`/`decision`/`other` — po zmianie mają oczekiwać `'new'` (inaczej `npm test` Fazy 1 będzie czerwone).

#### 3. Etykiety stanu per typ

**Plik**: `src/lib/labels.ts` (edycja)

**Cel**: Etykieta stanu operacyjnego zależna od typu itemu; punkt rozszerzenia pod przyszłe definiowanie.

**Kontrakt**: Nowa tabela `OPERATIONAL_STATUS_LABELS_BY_TYPE: Partial<Record<ItemType, Partial<Record<OperationalStatus, string>>>>` z testowymi nadpisaniami: `note:{done:"Obsłużona"}`, `idea:{done:"Obsłużony"}`, `decision:{done:"Podjęta"}`, `other:{done:"Obsłużone"}`. Zmiana `operationalStatusLabel(status, type?)` — gdy podano `type`, zwraca `BY_TYPE[type]?.[status] ?? OPERATIONAL_STATUS_LABELS[status]`; bez `type` zachowuje dotychczasowe zachowanie (kompatybilność wsteczna callerów).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build/typecheck przechodzi: `npm run build`
- Testy jednostkowe przechodzą: `npm test` (`deriveOperationalStatus` → `'new'` dla każdego typu; `operationalStatusLabel` zwraca nadpisanie per-typ dla `done` i fallback dla pozostałych stanów/typów)
- Testy integracyjne przechodzą: `npm run test:integration` (migracja stosuje się czysto; po migracji brak wierszy z `operational_status IS NULL`; RPC `persist_classification` wstawia `'new'` dla itemu typu `note`)

#### Weryfikacja ręczna:

- Supabase Studio: istniejące zaakceptowane itemy nie-`task` mają `operational_status='new'` po migracji.
- Badge etykiety per-typ poprawne w izolacji (np. helper/test pokazuje `note + done → "Obsłużona"`).

**Uwaga implementacyjna**: Po zielonych weryfikacjach automatycznych zatrzymaj się na ręczne potwierdzenie człowieka przed Fazą 2.

---

## Faza 2: Backend mutacji stanu operacyjnego

### Przegląd

Warstwa zmiany `operational_status` (walidacja zod → serwis → endpoint) plus serwisy odczytu trzech podzbiorów accepted. Bez UI.

### Wymagane zmiany:

#### 1. Schemat walidacji

**Plik**: `src/lib/validation/items.ts` (edycja)

**Cel**: Kształt payloadu zbiorczej zmiany stanu (hard rule: wejście wielopolowe → zod).

**Kontrakt**: `operationalActionSchema = z.object({ ids: z.array(z.uuid()).min(1).max(100), status: z.enum(['new','in_progress','done','cancelled']) })` + eksport typu `OperationalActionInput`. Enum spójny z `OperationalStatus` z `src/types.ts`. Schema przyjmuje **wszystkie 4 stany** (przechodniość na warstwie danych).

#### 2. Serwis mutacji stanu

**Plik**: `src/lib/services/items-mutation.ts` (edycja)

**Cel**: Atomowy bulk UPDATE `operational_status`, RLS-scoped, guarded `accepted`.

**Kontrakt**: `setOperationalStatus(supabase, ids: string[], status: OperationalStatus): Promise<{ updatedIds: string[] }>` — `update({ operational_status: status, updated_at: new Date().toISOString() }).in('id', ids).eq('acceptance_status','accepted').select('id')`. Zwraca realnie zmienione `id` (nie-`accepted` pominięte). Rzut `new Error(msg, { cause })` jak `setAcceptanceStatus`.

#### 3. Serwisy odczytu podzbiorów

**Plik**: `src/lib/services/items.ts` (edycja)

**Cel**: Listy dla trzech widoków filtra głównego.

**Kontrakt**: `getActiveItems(supabase, userId)` — `accepted` AND `operational_status IN ('new','in_progress')`; `getDoneItems(...)` — `accepted` AND `operational_status='done'`; `getCancelledItems(...)` — `accepted` AND `operational_status='cancelled'`. Sort jak istniejący accepted (`updated_at DESC, created_at DESC, id ASC`). `getAcceptedItems` może zostać (nieużywany przez nowe strony) lub zostać zastąpiony przez `getActiveItems` w `active.astro` (Faza 3).

#### 4. Endpoint zmiany stanu

**Plik**: `src/pages/api/items/operational.ts` (nowy)

**Cel**: Zbiorcza zmiana stanu operacyjnego jednym żądaniem.

**Kontrakt**: `POST`, `prerender=false`. Guard auth → 401. `operationalActionSchema.safeParse(await request.json())` → 400 (try-catch jak `bulk.ts`). `createClient(request.headers, cookies)` → 500 gdy null. Wywołanie `setOperationalStatus`. Odpowiedź `{ ok:true, status, updatedIds, count }`; błąd `{ ok:false, code:'internal', error }` (500) przez `reportError`. Helper `json` i kształt jak `bulk.ts`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build/typecheck przechodzi: `npm run build`
- Testy jednostkowe przechodzą: `npm test` (`operationalActionSchema` odrzuca pusty/`>100 ids`, nieznany `status`; `setOperationalStatus` buduje UPDATE z guardem `accepted`)
- Testy integracyjne przechodzą: `npm run test:integration` (RLS izoluje usera; UPDATE z guardem `accepted` zmienia tylko accepted i zwraca ich id; `getActiveItems`/`getDoneItems`/`getCancelledItems` zwracają właściwe rozłączne podzbiory)

#### Weryfikacja ręczna:

- `curl -X POST /api/items/operational` z `{ids:[…], status:"done"}` → accepted itemy zmieniają `operational_status` (Studio).
- Zły payload (puste `ids`, nieznany `status`, `>100 id`) → 400 bez dotknięcia bazy.
- `id` itemu `pending` w payloadzie → pominięty (count < liczba ids).

**Uwaga implementacyjna**: Zatrzymaj się na ręczne potwierdzenie przed Fazą 3.

---

## Faza 3: Widoki + nawigacja (read-only)

### Przegląd

Strony Zakończone/Anulowane, zawężenie zapytania Aktywne, 5-pozycyjna nawigacja filtra głównego, badge operacyjny per-typ na liście (jeszcze nieklikalny). Obserwowalny cel dla Fazy 4.

### Wymagane zmiany:

#### 1. Badge operacyjny per-typ w liście read-only

**Plik**: `src/components/items/ItemList.astro` (edycja)

**Cel**: Pokazać stan operacyjny z etykietą per-typ w widokach accepted.

**Kontrakt**: Opcjonalny prop `operationalBadge?: boolean` (domyślnie `false`). Gdy `true` i `item.operational_status` niepuste — renderuje badge `operationalStatusLabel(item.operational_status, item.type)` obok badge'a typu (zamiast/obok badge'a akceptacji). Kosz (`trash.astro`) renderuje bez `operationalBadge` (bez zmian).

#### 2. Nawigacja filtra głównego → 5 pozycji

**Plik**: `src/components/items/MainFilterNav.astro` (edycja)

**Cel**: Pełny filtr główny FR-008 (5 z 5 widoków).

**Kontrakt**: Dodanie linków „Zakończone" → `/items/done` i „Anulowane" → `/items/cancelled` (kolejność: Elementy do akceptacji, Aktywne, Zakończone, Anulowane, Kosz). Wyróżnianie aktywnego bez zmian (exact `pathname`).

#### 3. Zawężenie Aktywne + nowe strony

**Plik**: `src/pages/items/active.astro` (edycja), `src/pages/items/done.astro`, `src/pages/items/cancelled.astro` (nowe)

**Cel**: Trzy rozłączne widoki accepted.

**Kontrakt**: `active.astro` zmienia odczyt z `getAcceptedItems` na `getActiveItems` — usuń przy tym `getAcceptedItems` z `items.ts` (po podmianie nie ma żadnego callera; martwy eksport, lint go nie zgłosi). `done.astro`/`cancelled.astro` jak `active.astro` (`prerender=false`, `createClient`, fallback `[]`), z `getDoneItems`/`getCancelledItems`, renderują `MainFilterNav` + `<ItemList operationalBadge emptyLabel=… />` (np. „Brak zakończonych elementów.", „Brak anulowanych elementów."). Middleware bez zmian (`/items` prefiks).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna:

- Nawigacja pokazuje 5 pozycji; aktywna wyróżniona na każdej z 5 tras.
- Item ze stanem `done` (zmieniony curlem z Fazy 2) widoczny w Zakończone; `cancelled` w Anulowane; `new`/`in_progress` w Aktywne — rozłącznie.
- Badge operacyjny per-typ poprawny na liście (np. notatka `done` → „Obsłużona").
- Niezalogowany na `/items/done`, `/items/cancelled` → redirect do logowania.

**Uwaga implementacyjna**: Zatrzymaj się na ręczne potwierdzenie przed Fazą 4.

---

## Faza 4: Interaktywny island (badge-menu + bulk)

### Przegląd

React island dla widoków accepted: klikalny badge stanu → kontekstowe menu z kuracją przejść, model zaznaczania, pasek 4 przycisków bulk, pessimistic dim + toast + confirm select-all. Wpięty na 3 trasach.

### Wymagane zmiany:

#### 1. Komponent dropdown-menu

**Plik**: `src/components/ui/dropdown-menu.tsx` (nowy, przez `npx shadcn@latest add dropdown-menu`)

**Cel**: Menu kontekstowe kotwiczone na badge'u stanu.

**Kontrakt**: shadcn `dropdown-menu` na istniejącym `radix-ui` — **bez nowej zależności npm** (`@radix-ui/react-dropdown-menu` jest już tranzytywnie pod unified `radix-ui`; potwierdzić `npm audit` czysty / brak instalacji nowego pakietu przy bramce). **Przepisz wygenerowany import** z `import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"` na konwencję repo — unified `import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"` (jak `select.tsx`/`dialog.tsx`/`checkbox.tsx`).

#### 2. Tabela kuracji przejść

**Plik**: `src/lib/items/operational-transitions.ts` (nowy)

**Cel**: Źródło prawdy dla UX — które przejścia wystawić z danego stanu (oddzielone od walidacji, która dopuszcza wszystkie 4).

**Kontrakt**: Mapa `OPERATIONAL_TRANSITIONS: Record<OperationalStatus, { target: OperationalStatus; label: string }[]>`:
- `new` → `[{in_progress,"Rozpocznij"},{done,"Zrealizuj"},{cancelled,"Anuluj"}]`
- `in_progress` → `[{done,"Zrealizuj"},{new,"Cofnij do „nowe""},{cancelled,"Anuluj"}]`
- `done` → `[{new,"Otwórz ponownie"}]`
- `cancelled` → `[{new,"Przywróć"}]`

Verby generyczne (per-typ nadpisania verbów poza zakresem — patrz „Czego NIE robimy").

#### 3. Klikalny badge stanu

**Plik**: `src/components/items/OperationalStatusBadge.tsx` (nowy)

**Cel**: Badge pokazujący bieżący stan (etykieta per-typ) i otwierający menu przejść.

**Kontrakt**: Props `item: Item`, `disabled?: boolean`, `onChange(target: OperationalStatus): void`. Etykieta z `operationalStatusLabel(item.operational_status, item.type)`. Trigger `dropdown-menu` z pozycjami z `OPERATIONAL_TRANSITIONS[item.operational_status]`; klik pozycji → `onChange(target)`. Gdy `disabled` (żądanie w locie) — nieaktywny.

#### 4. Hook: zmiana stanu operacyjnego

**Plik**: `src/components/hooks/useItemMutation.ts` (edycja)

**Cel**: Wywołanie endpointu zmiany stanu, wzorzec jak `bulkAccept`.

**Kontrakt**: `setOperationalStatus(ids: string[], status: OperationalStatus): Promise<number | null>` → `POST /api/items/operational` z `{ids, status}`; zwraca `.count` (realna liczba) lub `null` przy błędzie. Współdzieli stan `pending`/`error`.

#### 5. Island widoków accepted

**Plik**: `src/components/items/AcceptedItemsView.tsx` (nowy)

**Cel**: Interaktywna lista accepted z badge-menu + bulk, parametryzowana widokiem.

**Kontrakt**: Props `initialItems: Item[]`, `view: 'active' | 'done' | 'cancelled'`. Reużywa model zaznaczania (`selection.ts`), pessimistic `execute()` + dim, Dialog potwierdzenia select-all, toasty z `PendingItemsView`. **Per-item**: `OperationalStatusBadge` → `execute(target, [id])`. **Bulk**: pasek z 4 przyciskami stanów (`Nowe`/`W toku`/`Zrobione`/`Anulowane`) aktywnymi przy ≥1 zaznaczonym → `execute(target, selectedIds)`; select-all → Dialog z liczbą. **Po sukcesie**: usuń z listy itemy, których nowy stan nie spełnia predykatu `view` (Aktywne: `new|in_progress`; Zakończone: `done`; Anulowane: `cancelled`); licznik toasta z realnej liczby zmienionych. Stan pusty per widok.

#### 6. Podłączenie islandu

**Plik**: `src/pages/items/active.astro`, `done.astro`, `cancelled.astro` (edycja)

**Cel**: Zastąpienie read-only `<ItemList>` interaktywnym islandem.

**Kontrakt**: Render `<AcceptedItemsView client:load initialItems={items} view="active|done|cancelled" />` zamiast `<ItemList>`. Dane nadal serwerowo (props bez dodatkowego fetcha). `MainFilterNav` zostaje.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- `npm audit` dla `dropdown-menu` czysty / potwierdzony brak nowej zależności npm
- Testy jednostkowe przechodzą: `npm test` (kuracja przejść per stan z `OPERATIONAL_TRANSITIONS`; island usuwa item po zmianie poza predykat widoku; bulk wywołuje `setOperationalStatus` z docelowym stanem)

#### Weryfikacja ręczna:

- Aktywne: klik badge zadania → menu (Rozpocznij/Zrealizuj/Anuluj); „Zrealizuj" → item znika z Aktywne (< 200 ms, pessimistic) + toast, widoczny w Zakończone.
- Aktywne: klik badge notatki → menu; „Zrealizuj" → znika z Aktywne, w Zakończone z badge „Obsłużona".
- Bulk: zaznacz podzbiór + „Zrobione" → znikają, w Zakończone, bez potwierdzenia; „zaznacz wszystkie" + „Anulowane" → Dialog z liczbą → po potwierdzeniu w Anulowane.
- Zakończone: „Otwórz ponownie" → item wraca do Aktywne (`nowe`). Anulowane: „Przywróć" → Aktywne (`nowe`).
- Symulowany błąd serwera → item wraca z wygaszenia (bez migania) + toast błędu.
- Pełny przepływ S-02→S-03→S-04: paste → klasyfikacja → akceptacja → zmiana stanu → Zakończone z etykietą per-typ.

**Uwaga implementacyjna**: Po zielonej Fazie 4 zatrzymaj się — całość gotowa do `/10x-impl-review`.

---

## Strategia testowania

### Testy jednostkowe:

- `deriveOperationalStatus` → `'new'` dla każdego z 5 typów.
- `operationalStatusLabel(status, type)`: nadpisania `done` per-typ + fallback generyczny dla pozostałych stanów/typów.
- `operationalActionSchema`: odrzucenie pustego/`>100 ids`, nieznanego `status`.
- `OPERATIONAL_TRANSITIONS`: zestaw przejść per stan zgodny z maszyną; graf silnie spójny (każdy stan osiąga każdy).
- Island: usunięcie itemu po zmianie poza predykat widoku; bulk wywołuje mutację z docelowym stanem; model zaznaczania (select-all/toggle).

### Testy integracyjne (lokalny Supabase):

- Migracja stosuje się; brak `operational_status IS NULL` po backfillu; RPC wstawia `'new'` dla `note`.
- RLS: user A nie zmienia stanu itemu usera B.
- `setOperationalStatus` z guardem `accepted` zmienia tylko accepted, zwraca ich id; pending/rejected pominięte.
- `getActiveItems`/`getDoneItems`/`getCancelledItems` zwracają rozłączne podzbiory.

### Kroki testowania ręcznego:

1. Paste → klasyfikacja (S-02) → akceptacja (S-03) → itemy w Aktywne.
2. Badge zadania → „Zrealizuj" → znika z Aktywne, w Zakończone.
3. Badge notatki → „Zrealizuj" → w Zakończone jako „Obsłużona".
4. Bulk „zaznacz wszystkie" + „Anulowane" → potwierdzenie z liczbą → w Anulowane.
5. Zakończone „Otwórz ponownie" / Anulowane „Przywróć" → wracają do Aktywne (`nowe`).
6. Offline podczas akcji → rollback z wygaszenia + toast błędu.

## Uwagi dotyczące wydajności

- Reakcja < 200 ms przez pessimistic dim (sieć w tle), jak S-03.
- Bulk = jeden statement DB (atomowy), max 100 id.
- Indeks `(user_id, acceptance_status, operational_status)` pokrywa zapytania trzech widoków accepted.

## Uwagi dotyczące migracji

- Jedna migracja Fazy 1: backfill `NULL→'new'` + zmiana RPC `persist_classification` + indeks 3-kolumnowy (i `drop` redundantnego 2-kolumnowego `items_user_acceptance_idx`). Backfill jednorazowy; idempotentny (`where operational_status is null`).
- Kolumna zostaje nullable (bez `NOT NULL`); aplikacja + RPC zawsze ustawiają `'new'`, więc nowych NULL nie powstaje.

## Referencje

- Roadmapa: `context/foundation/roadmap.md` → S-04 (zaktualizowana 2026-06-15 do modelu „wszystkie typy")
- PRD: `context/foundation/prd.md` (US-04, FR-009, FR-008)
- Lekcje: `context/foundation/lessons.md` (zod wielopolowy; ujednolicony kształt błędu `{ok:false,code,error}`; pessimistic; optimistic concurrency odłożone)
- Poprzednik S-03: `context/archive/2026-06-13-validation-accept-reject/plan.md`
- Schemat S-02: `supabase/migrations/20260610052532_classification_schema.sql`, RPC `20260610075357_persist_classification.sql`
- Wzorce: `src/lib/services/items-mutation.ts:37-51`, `src/lib/services/items.ts:16-48`, `src/pages/api/items/bulk.ts`, `src/components/items/PendingItemsView.tsx`, `src/components/hooks/useItemMutation.ts`

## Otwarte ryzyka i założenia

- **Wyłom z FR-009 (task-only) — dokumentacja domknięta 2026-06-15.** `roadmap.md` S-04 (wiersz + sekcja + nota gwiazdy), FR-009 + bullet US-04 w PRD oraz karta #8 na boardzie GitHub są już zaktualizowane do modelu „wszystkie typy" (etykiety per-typ). Karta #8 zsynchronizowana na GitHubie; zmiany w `roadmap.md`/`prd.md` zacommitowane lokalnie (`docs(roadmap,prd)`), bez push. Plan nie jest już rozbieżny z tymi dokumentami.
- **`other` „Obsłużone" i „Otwórz ponownie/Przywróć” → `nowe`** to decyzje przyjęte w planie; łatwo odwracalne (jedna pozycja w tabeli etykiet/przejść), jeśli użytkownik zechce inaczej.
- **Bulk na mieszanym zaznaczeniu** ustawia ten sam stan docelowy wszystkim accepted w zaznaczeniu niezależnie od typu (np. „Anulowane" anuluje też notatkę) — spójne z modelem jednolitym; pominięcie nie dotyczy typu, tylko statusu akceptacji.

## Progress

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po zakończeniu kroku. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Dane + etykiety per-typ

#### Automatyczne

- [x] 1.1 Lint przechodzi (`npm run lint`) — 96e1234
- [x] 1.2 Build/typecheck przechodzi (`npm run build`) — 96e1234
- [x] 1.3 Testy jednostkowe (derywacja `'new'` wszystkie typy; `operationalStatusLabel` per-typ) przechodzą (`npm test`) — 96e1234
- [ ] 1.4 Testy integracyjne (migracja + brak NULL po backfillu + RPC `'new'` dla `note`) przechodzą (`npm run test:integration`)

#### Ręczne

- [ ] 1.5 Studio: istniejące accepted nie-`task` mają `operational_status='new'` po migracji
- [ ] 1.6 Etykieta per-typ poprawna (note + done → „Obsłużona")

### Faza 2: Backend mutacji stanu operacyjnego

#### Automatyczne

- [x] 2.1 Lint przechodzi (`npm run lint`) — 34a71b4
- [x] 2.2 Build/typecheck przechodzi (`npm run build`) — 34a71b4
- [x] 2.3 Testy jednostkowe (`operationalActionSchema`; guard `accepted` w `setOperationalStatus`) przechodzą (`npm test`) — 34a71b4
- [ ] 2.4 Testy integracyjne (RLS; guard `accepted`; rozłączne podzbiory odczytu) przechodzą (`npm run test:integration`)

#### Ręczne

- [ ] 2.5 `curl` POST `/api/items/operational` `{status:"done"}` zmienia accepted (Studio)
- [ ] 2.6 Zły payload (puste ids / zły status / >100 id) → 400 bez dotknięcia bazy
- [ ] 2.7 `id` pending w payloadzie → pominięty (count < liczba ids)

### Faza 3: Widoki + nawigacja (read-only)

#### Automatyczne

- [x] 3.1 Lint przechodzi (`npm run lint`)
- [x] 3.2 Build przechodzi (`npm run build`)

#### Ręczne

- [ ] 3.3 Nawigacja 5 pozycji, aktywna wyróżniona na każdej trasie
- [ ] 3.4 done→Zakończone, cancelled→Anulowane, new/in_progress→Aktywne (rozłącznie)
- [ ] 3.5 Badge operacyjny per-typ na liście (note done → „Obsłużona")
- [ ] 3.6 Niezalogowany na `/items/done`, `/items/cancelled` → redirect

### Faza 4: Interaktywny island (badge-menu + bulk)

#### Automatyczne

- [ ] 4.1 Lint przechodzi (`npm run lint`)
- [ ] 4.2 Build przechodzi (`npm run build`)
- [ ] 4.3 `npm audit` dla `dropdown-menu` czysty / brak nowej zależności npm
- [ ] 4.4 Testy jednostkowe (kuracja przejść; usuwanie poza predykat widoku; bulk z docelowym stanem) przechodzą (`npm test`)

#### Ręczne

- [ ] 4.5 Aktywne: badge zadania → menu → „Zrealizuj" → znika z Aktywne (< 200 ms) + toast + w Zakończone
- [ ] 4.6 Aktywne: badge notatki → „Zrealizuj" → w Zakończone jako „Obsłużona"
- [ ] 4.7 Bulk: podzbiór + „Zrobione" → znikają, w Zakończone; select-all + „Anulowane" → Dialog z liczbą → w Anulowane
- [ ] 4.8 Zakończone „Otwórz ponownie" / Anulowane „Przywróć" → wracają do Aktywne (`nowe`)
- [ ] 4.9 Symulowany błąd → item wraca z wygaszenia (bez migania) + toast błędu
- [ ] 4.10 Pełny przepływ S-02→S-03→S-04 (paste→klasyfikacja→akceptacja→zmiana stanu→Zakończone)
