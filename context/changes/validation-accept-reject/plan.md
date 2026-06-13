# Walidacja — akceptacja, odrzucenie i edycja pendingów (S-03) — Plan implementacji

## Przegląd

Rozszerzamy read-only widok pendingów z S-02 o warstwę walidacji: ujednolicony model zaznaczania (per-item + „zaznacz wszystkie"), akcje zbiorcze **zatwierdź / odrzuć**, edycję itemu w stagingu (`title`/`description`/`typ`) oraz minimalne, read-only widoki **Aktywne** i **Kosz** z nawigacją filtra głównego. Zaakceptowane itemy lądują w Aktywne (`acceptance_status='accepted'`), odrzucone w Koszu (`rejected`). Bez nowej tabeli — schemat z S-02 jest kompletny.

## Analiza stanu obecnego

**Co już istnieje (S-02):**

- **Schemat** (`supabase/migrations/20260610052532_classification_schema.sql`): tabela `items` z `acceptance_status` (enum `pending|accepted|rejected|deleted`, default `pending`), `operational_status` (enum `new|in_progress|done|cancelled`, NULL poza `task`), `type` (enum `item_type`), `title` NOT NULL, `description` nullable, FK `user_id → auth.users ON DELETE CASCADE`, FK `import_session_id → import_sessions ON DELETE SET NULL`. RLS per-operacja (SELECT/INSERT/UPDATE/DELETE) na `(select auth.uid()) = user_id`. Indeks `items_user_acceptance_idx (user_id, acceptance_status)`.
- **Typy** (`src/types.ts:65-127`): `ItemType`, `AcceptanceStatus`, `OperationalStatus`, `Item`.
- **Etykiety PL** (`src/lib/labels.ts:22-27`): `ACCEPTANCE_STATUS_LABELS`, `OPERATIONAL_STATUS_LABELS`, `itemTypeLabel()`.
- **Odczyt** (`src/lib/services/items.ts:9-20`): `getPendingItems(supabase, userId)`.
- **Widok** (`src/pages/items.astro:1-40`): SSR, `prerender=false`, pobiera pendingi serwerowo, chroniony middleware. Renderuje `src/components/items/PendingItemsList.astro:1-44` (read-only; komentarz: „Bez akcji accept/reject/edit — to granica S-03").
- **Wzorce API** (`src/pages/api/ingest/classify.ts`, `src/pages/api/profile/byok-key.ts`): `prerender=false`, guard `if(!user) return json(..., 401)`, `createClient(headers, cookies)` per-request (RLS), helper `json(body, status)`, generyczne błędy. `zod` już używany w S-02 (Structured Outputs).
- **Hooki** (`src/components/hooks/useClassification.ts`, `useApiKey.ts`): hermetyzują fetch + stan + kod błędu; `useApiKey.save()` zwraca `Promise<boolean>`.
- **UI** (`src/components/ui/`): obecne `button`, `dialog`, `input`, `textarea`, `label`, `card`, `alert`. `radix-ui` (unified) + `@radix-ui/react-slot` w zależnościach.

**Czego brakuje:**

- Mutacji `acceptance_status` (serwis + endpointy + walidacja payloadu).
- Modelu zaznaczania i akcji zbiorczych w UI (lista jest dziś Astro SSR, nie React island).
- Komponentów `checkbox`, `select` oraz biblioteki toastów (`sonner`).
- Widoków Aktywne/Kosz i nawigacji filtra głównego.

## Pożądany stan końcowy

Zalogowany użytkownik na `/items` („Elementy do akceptacji") widzi swoje pendingi z checkboxami. Może: zaznaczyć dowolny podzbiór (lub „zaznacz wszystkie"), kliknąć **Zatwierdź zaznaczone** (zaznaczone znikają z listy z toastem i pojawiają się w `/items/active`) lub **Odrzuć zaznaczone** (znikają, trafiają do `/items/trash`). Może edytować pojedynczy item w modalu (`title`/`description`/`typ`) — zmiany zapisują się od razu, item zostaje `pending`. „Zaznacz wszystkie" + akcja zbiorcza wymaga lekkiego potwierdzenia z liczbą. Nawigacja filtra głównego przełącza między trzema widokami; Aktywne i Kosz są read-only.

**Weryfikacja:** `npm test` + `npm run test:integration` zielone; manualny przepływ paste→klasyfikacja (S-02)→walidacja→akceptacja→item w Aktywne działa bez błędów; reakcja UI na akcję < 200 ms (optimistic).

### Kluczowe odkrycia:

- Schemat kompletny — accept/reject/edit to czyste UPDATE; **zero migracji** (`supabase/migrations/20260610052532_classification_schema.sql`).
- Bulk atomowo jednym statementem: `update().in('id', ids).eq('acceptance_status','pending')` — RLS dokłada `user_id`, guard statusu realizuje pomijanie nieuprawnionych bez błędu (FR-007).
- `zod` już zależnością (S-02) — walidacja wielopolowa bez nowej instalacji.
- Indeks `items_user_acceptance_idx (user_id, acceptance_status)` obsługuje zapytania pending/accepted/rejected — bez nowego indeksu.
- `PendingItemsList.astro` jest read-only z wyraźną granicą S-03 — w Fazie 3 zastępujemy go React islandem.

## Czego NIE robimy

- **Przenieś-do-kosza / przywróć / wyczyść kosz** (`accepted→deleted→accepted`, FR-013/FR-016) — to S-06. Kosz w S-03 pokazuje wyłącznie `rejected`, read-only.
- **Edycja zaakceptowanych itemów** na liście (FR-011) — S-05. W S-03 edytowalne są tylko pendingi.
- **Zmiana stanu operacyjnego** (`nowe`/`w realizacji`/`zrealizowane`/`anulowane`, FR-009) i widoki Zakończone/Anulowane — S-04.
- **Filtr typu** (Wszystkie/Zadania/Notatki/…) i filtry dodatkowe (sort/wyszukiwanie/sesja) — S-05/S-09.
- **Bogatsze mapowanie stanów operacyjnych przy zmianie typu** (OQ5 dla zaakceptowanych) — S-05. W S-03 pendingi mają zawsze `operational_status='new'` (task) / `NULL`, więc derywacja z typu jest bezstratna.
- **Próg liczbowy bulk-confirm** (5/10) — świadomie nie; potwierdzamy tylko select-all.

## Podejście do implementacji

Warstwy backendu (zod → serwis → endpointy → serwisy odczytu) najpierw, by mutacje były testowalne niezależnie od UI. Następnie cienkie read-only widoki Aktywne/Kosz + nawigacja (dają obserwowalny cel). Potem React island z modelem zaznaczania i akcjami (optimistic + toast). Na końcu modal edycji. Każda faza kończy się obserwowalnym efektem; kolejność dobrana tak, by akcje z Fazy 3 dało się od razu zweryfikować w widokach z Fazy 2.

## Krytyczne szczegóły implementacji

- **Sekwencjonowanie stanu (optimistic + rollback):** klient usuwa zaznaczone itemy z listy natychmiast po kliknięciu i zachowuje ich snapshot; dopiero po odpowiedzi serwera commit (toast) lub rollback (przywrócenie itemów + komunikat błędu). Kolejność: snapshot → optimistic remove → fetch → on-error restore. Pominięcie snapshotu uniemożliwia rollback.
- **Guard statusu w `WHERE`:** każdy UPDATE (bulk i edit) zawiera `eq('acceptance_status','pending')`. To nie kosmetyka — chroni przed mutacją itemu już zaakceptowanego w innej karcie (stale UI) i realizuje semantykę FR-007 „pozostałe pomijane bez błędu" (item poza zbiorem `pending` po prostu nie pasuje do `WHERE`, `.select()` go nie zwróci).
- **Ochrona przed nadużyciem rozmiaru:** `bulkActionSchema` ogranicza `ids` do max 100 (safety net spójny z FR-020); odrzucenie nadmiarowego payloadu przed dotknięciem bazy.

## Faza 1: Backend mutacji (zod + serwis + endpointy)

### Przegląd

Warstwa mutacji `acceptance_status` i edycji pendingu, z walidacją zod, plus serwisy odczytu dla Aktywne/Kosz. Bez UI, bez migracji.

### Wymagane zmiany:

#### 1. Schematy walidacji

**Plik**: `src/lib/validation/items.ts` (nowy)

**Cel**: Jeden punkt prawdy dla kształtu i typów wielopolowych payloadów akcji zbiorczej i edycji (hard rule: wejście wielopolowe → zod przed efektem ubocznym).

**Kontrakt**: `bulkActionSchema` = `{ ids: string().uuid() [] .min(1).max(100), action: enum(['accept','reject']) }`; `editItemSchema` = `{ title: string().trim().min(1), description: string().nullable() (pusty → null), type: enum(['task','note','idea','decision','other']) }`. Eksport wywnioskowanych typów (`BulkActionInput`, `EditItemInput`). Enumy spójne z `src/types.ts`.

#### 2. Serwis mutacji

**Plik**: `src/lib/services/items-mutation.ts` (nowy)

**Cel**: Hermetyzacja UPDATE-ów na `items`, RLS-scoped i status-guarded; jedyne miejsce derywacji `operational_status` z typu.

**Kontrakt**:
- `setAcceptanceStatus(supabase, ids: string[], status: 'accepted' | 'rejected'): Promise<{ updatedIds: string[] }>` — `update({ acceptance_status: status, updated_at: new Date().toISOString() }).in('id', ids).eq('acceptance_status','pending').select('id')`; zwraca id faktycznie zmienione (reszta pominięta — FR-007).
- `editPendingItem(supabase, id: string, input: EditItemInput): Promise<Item>` — derywacja `operational_status = input.type === 'task' ? 'new' : null`; `update({ title, description, type, operational_status, updated_at }).eq('id', id).eq('acceptance_status','pending').select().single()`; rzuca, gdy brak wiersza (nie-pending / nie-własny). Wzorzec jak `src/lib/services/items.ts` + `profile-key.ts` (przyjmuje `supabase`, rzuca `new Error(msg, { cause })`, bez wycieku szczegółów).

#### 3. Serwisy odczytu Aktywne/Kosz

**Plik**: `src/lib/services/items.ts` (rozszerzenie)

**Cel**: Dostarczyć listy zaakceptowanych i odrzuconych itemów dla widoków z Fazy 2.

**Kontrakt**: `getAcceptedItems(supabase, userId)` (`acceptance_status='accepted'`) i `getRejectedItems(supabase, userId)` (`acceptance_status='rejected'`), oba `order('created_at', { ascending: false })` — symetryczne do `getPendingItems`.

#### 4. Endpoint akcji zbiorczej

**Plik**: `src/pages/api/items/bulk.ts` (nowy)

**Cel**: Atomowe zatwierdzenie/odrzucenie zaznaczonych pendingów jednym żądaniem (metryka „≤ 1 klik" + FR-007).

**Kontrakt**: `POST`, `prerender=false`. Guard `if(!user) json(401)`. `bulkActionSchema.safeParse(await request.json())` → 400 na porażce. `createClient(request.headers, cookies)`, wywołanie `setAcceptanceStatus`. Odpowiedź `{ ok: true, action, updatedIds, count }`. Generyczne `json({ ok:false, code:'internal' }, 500)` na rzut serwisu. Helper `json` jak w `classify.ts:48-53`.

#### 5. Endpoint edycji

**Plik**: `src/pages/api/items/[id].ts` (nowy)

**Cel**: Natychmiastowe utrwalenie edycji pendingu (decyzja: zapis od razu, akceptacja osobno).

**Kontrakt**: `PATCH`, `prerender=false`. Guard auth. `id` z `context.params.id` — walidacja jako UUID (400 na niepoprawnym). `editItemSchema.safeParse(body)` → 400. Wywołanie `editPendingItem`. Odpowiedź `{ ok:true, item }`; gdy serwis rzuci „brak wiersza" → `json({ ok:false, code:'not_found' }, 404)`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build/typecheck przechodzi: `npm run build`
- Testy jednostkowe serwisu mutacji przechodzą: `npm test` (derywacja `operational_status` z typu; status-guard pomija nie-pending; bulk zwraca tylko zmienione id)
- Testy integracyjne przechodzą: `npm run test:integration` (RLS izoluje usera; UPDATE z guardem `pending`; walidacja zod odrzuca zły payload / >100 id)

#### Weryfikacja ręczna:

- `curl -X POST /api/items/bulk` z `{ids:[…], action:"accept"}` na lokalnym dev → pendingi zmieniają `acceptance_status` na `accepted` (potwierdzenie w Supabase Studio).
- `curl -X PATCH /api/items/<id>` ze zmianą `type` na `note` → `operational_status` staje się `NULL`; zmiana na `task` → `new`.
- Zły payload (puste `ids`, nieznana `action`, >100 id) → 400 bez dotknięcia bazy.

**Uwaga implementacyjna**: Po zielonych weryfikacjach automatycznych zatrzymaj się na ręczne potwierdzenie człowieka przed Fazą 2.

---

## Faza 2: Widoki Aktywne + Kosz (read-only) + nawigacja filtra głównego

### Przegląd

Cienkie, read-only widoki dla zaakceptowanych i odrzuconych itemów oraz 3-pozycyjna nawigacja filtra głównego. Daje obserwowalny cel dla akcji z Fazy 3.

### Wymagane zmiany:

#### 1. Generalizacja listy read-only

**Plik**: `src/components/items/ItemList.astro` (nowy; uogólnienie `PendingItemsList.astro`)

**Cel**: Współdzielona prezentacja read-only dowolnej listy itemów (typ + tytuł + opis + etykieta statusu), używana przez Aktywne i Kosz.

**Kontrakt**: Props `items: Item[]`, opcjonalnie `emptyLabel: string`. Renderuje etykiety przez `itemTypeLabel()` / `ACCEPTANCE_STATUS_LABELS` z `labels.ts`. `PendingItemsList.astro` pozostaje nietknięty do Fazy 3.

#### 2. Nawigacja filtra głównego

**Plik**: `src/components/items/MainFilterNav.astro` (nowy)

**Cel**: Single-select nawigacja między trzema widokami z zaznaczeniem aktywnego (FR-008 filtr główny — podzbiór 3 z 5).

**Kontrakt**: Renderuje linki: „Elementy do akceptacji" → `/items`, „Aktywne" → `/items/active`, „Kosz" → `/items/trash`. Aktywny stan wyróżniony (na podstawie `Astro.url.pathname`), `cn()` z `@/lib/utils`. Osadzony na trzech stronach.

#### 3. Strony Aktywne i Kosz

**Plik**: `src/pages/items/active.astro`, `src/pages/items/trash.astro` (nowe)

**Cel**: Serwerowo renderowane widoki zaakceptowanych / odrzuconych itemów.

**Kontrakt**: `prerender=false`, `{ user }` z `Astro.locals`, `createClient(...)`, odpowiednio `getAcceptedItems` / `getRejectedItems`, fallback `[]` przy błędzie (wzorzec `items.astro:19-22`). Renderują `MainFilterNav` + `ItemList`. **Ochrona route'u:** potwierdzić, że `PROTECTED_ROUTES` w `src/middleware.ts` obejmuje prefiks `/items` (jeśli match jest exact, dopisać `/items/active`, `/items/trash`).

#### 4. Osadzenie nawigacji na widoku pendingów

**Plik**: `src/pages/items.astro` (edycja)

**Cel**: Spójna nawigacja na wszystkich trzech widokach.

**Kontrakt**: Dodanie `MainFilterNav` nad listą pendingów. Reszta strony bez zmian (lista pendingów zostaje Astro do Fazy 3).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna:

- Nawigacja przełącza między `/items`, `/items/active`, `/items/trash`; aktywny filtr wyróżniony.
- Item zaakceptowany w bazie (z Fazy 1) widoczny w Aktywne; odrzucony w Koszu; oba widoki read-only (brak akcji).
- Niezalogowany użytkownik na `/items/active` / `/items/trash` → redirect do logowania.

**Uwaga implementacyjna**: Zatrzymaj się na ręczne potwierdzenie przed Fazą 3.

---

## Faza 3: Model zaznaczania + akcje accept/reject (React island)

### Przegląd

Ekstrakcja widoku pendingów do React islandu z ujednoliconym modelem zaznaczania, akcjami zbiorczymi (optimistic + toast), potwierdzeniem tylko na ścieżce select-all.

### Wymagane zmiany:

#### 1. Komponenty UI i toast

**Plik**: `src/components/ui/checkbox.tsx`, `src/components/ui/sonner.tsx` (nowe, przez `npx shadcn@latest add checkbox sonner`)

**Cel**: Checkbox do zaznaczania i system toastów do feedbacku akcji.

**Kontrakt**: `checkbox` na istniejącym `radix-ui` (bez nowej zależności npm). `sonner` = **nowa zależność** → `npm audit` + zgoda usera przed instalacją (safe-ops). `<Toaster />` osadzony w drzewie islandu.

#### 2. Hook mutacji

**Plik**: `src/components/hooks/useItemMutation.ts` (nowy)

**Cel**: Hermetyzacja wywołań mutacji + stan pending/error, wzorzec jak `useApiKey`/`useClassification`.

**Kontrakt**: `bulkAccept(ids)`, `bulkReject(ids)` → `POST /api/items/bulk`; `editItem(id, input)` → `PATCH /api/items/[id]` (wykorzystany w Fazie 4). Zwracają `Promise<boolean>` (sukces → commit optimistic). Stan: `pending`, `error` (kod UI-friendly, bez szczegółów sieci).

#### 3. React island widoku walidacyjnego

**Plik**: `src/components/items/PendingItemsView.tsx` (nowy)

**Cel**: Interaktywna lista pendingów: zaznaczanie per-item + „zaznacz wszystkie", pasek akcji zbiorczych, optimistic update + toast, potwierdzenie select-all.

**Kontrakt**: Props `initialItems: Item[]` (z SSR). Stan: lista itemów + `Set<string>` zaznaczonych. „Zaznacz wszystkie" zaznacza wszystkie wyświetlane pendingi (brak paginacji w S-03). Pasek akcji aktywny przy ≥1 zaznaczonym: „Zatwierdź zaznaczone" / „Odrzuć zaznaczone". **Optimistic:** snapshot → usuń zaznaczone z listy → `useItemMutation` → toast sukcesu / rollback (przywróć snapshot + toast błędu). **Potwierdzenie:** gdy akcja uruchomiona po użyciu „zaznacz wszystkie" → `Dialog` „Zatwierdzić/Odrzucić N elementów?" przed wykonaniem; ręczny podzbiór → bez potwierdzenia. **Stan pusty:** gdy lista wyświetlanych pendingów jest pusta (po zatwierdzeniu/odrzuceniu wszystkich lub gdy brak pendingów na starcie) → komunikat zamiast listy (np. „Brak elementów do akceptacji"), pasek akcji ukryty/nieaktywny.

#### 4. Podłączenie islandu

**Plik**: `src/pages/items.astro` (edycja)

**Cel**: Zastąpienie read-only listy pendingów interaktywnym islandem.

**Kontrakt**: Render `<PendingItemsView client:load initialItems={items} />` zamiast `PendingItemsList.astro`. Dane nadal pobierane serwerowo (`getPendingItems`) i przekazane jako props (hydration bez dodatkowego fetcha na starcie). `MainFilterNav` zostaje.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- `npm audit` dla `sonner` czysty (lub ryzyko świadomie zaakceptowane przy bramce)
- Testy jednostkowe modelu zaznaczania / optimistic-rollback przechodzą: `npm test`

#### Weryfikacja ręczna:

- Zaznaczenie podzbioru + „Zatwierdź zaznaczone" → itemy znikają natychmiast (< 200 ms), toast, pojawiają się w Aktywne. Bez potwierdzenia.
- „Zaznacz wszystkie" + „Odrzuć zaznaczone" → `Dialog` z liczbą; po potwierdzeniu itemy w Koszu.
- Symulowany błąd serwera (np. offline) → itemy wracają na listę + toast błędu (rollback).
- Item zaakceptowany w innej karcie, potem akcja na nim tutaj → pominięty bez błędu (guard `pending`).
- Po zatwierdzeniu/odrzuceniu wszystkich pendingów → widoczny komunikat pustej listy (zamiast pustego paska akcji).

**Uwaga implementacyjna**: Zatrzymaj się na ręczne potwierdzenie przed Fazą 4.

---

## Faza 4: Edycja w stagingu (modal title/description/typ)

### Przegląd

Modal edycji pojedynczego pendingu z polami `title`/`description`/`typ`; zapis natychmiastowy (item zostaje `pending`), aktualizacja w miejscu + toast.

### Wymagane zmiany:

#### 1. Komponent Select

**Plik**: `src/components/ui/select.tsx` (nowy, przez `npx shadcn@latest add select`)

**Cel**: Wybór `typ` itemu w formularzu edycji.

**Kontrakt**: shadcn `select` na istniejącym `radix-ui` (bez nowej zależności npm). Opcje z `itemTypeLabel()` dla pięciu wartości `ItemType`.

#### 2. Modal edycji

**Plik**: `src/components/items/EditItemDialog.tsx` (nowy)

**Cel**: Formularz edycji w `Dialog` (już obecny komponent), wywoływany per item z listy.

**Kontrakt**: Props `item: Item`, `open`, `onOpenChange`, `onSaved(updated: Item)`. Pola: `Input` (title, wymagany), `Textarea` (description), `Select` (typ). „Zapisz" → `useItemMutation.editItem(id, { title, description, type })`; sukces → `onSaved` (podmiana itemu w stanie islandu) + toast + zamknięcie; błąd walidacji (pusty title) blokuje submit. **404 `not_found`** (item nie jest już `pending` — np. zaakceptowany w innej karcie podczas edycji): toast „Element nie jest już dostępny do edycji" + zamknięcie modala, item usunięty ze stanu islandu (symetrycznie do guardu „stale tab" w akcjach zbiorczych, 3.8). Derywacja `operational_status` po stronie serwera (Faza 1) — modal nie dotyka stanu operacyjnego.

#### 3. Wyzwalacz edycji w liście

**Plik**: `src/components/items/PendingItemsView.tsx` (edycja)

**Cel**: Przycisk „Edytuj" na itemie otwierający `EditItemDialog`; po zapisie item zaktualizowany w miejscu (zostaje `pending`, nie znika).

**Kontrakt**: Stan „edytowany item" (`Item | null`); render `EditItemDialog` sterowany tym stanem; `onSaved` mapuje zaktualizowany item w liście. Item po edycji NIE jest automatycznie akceptowany (decyzja: zapis osobno od akceptacji).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Testy jednostkowe formularza edycji (walidacja pustego title; payload zawiera `type`) przechodzą: `npm test`

#### Weryfikacja ręczna:

- Edycja `title`/`description` → po „Zapisz" item zaktualizowany na liście, zostaje pending, toast.
- Zmiana `typ` z `note` na `task` → po akceptacji item w Aktywne ma `operational_status='new'` (potwierdzenie w Studio); zmiana `task`→`note` → `NULL`.
- Pusty `title` blokuje zapis z komunikatem.
- Pełny przepływ S-02→S-03: paste → klasyfikacja → edycja jednego pendingu → „zatwierdź zaznaczone" → item w Aktywne z naniesioną edycją.
- Edycja itemu nie-`pending` (zaakceptowanego w innej karcie) → toast 404 + zamknięcie modala, item znika z listy.

**Uwaga implementacyjna**: Po zielonej Fazie 4 zatrzymaj się — całość gotowa do `/10x-impl-review`.

---

## Strategia testowania

### Testy jednostkowe:

- Derywacja `operational_status` z `type` (task→`new`, reszta→`null`).
- Status-guard: `editPendingItem` / `setAcceptanceStatus` nie ruszają itemu nie-`pending`.
- `bulkActionSchema` / `editItemSchema`: odrzucenie pustych `ids`, nieznanej `action`, >100 id, pustego `title`.
- Model zaznaczania islandu: select-all, toggle per-item, optimistic remove + rollback na błędzie.

### Testy integracyjne (lokalny Supabase):

- RLS: user A nie zmienia itemu usera B (UPDATE nie trafia w wiersz).
- Bulk UPDATE z guardem `pending` zmienia tylko pendingi z listy, zwraca ich id.
- Edit utrwala `title`/`description`/`type` + derywowany `operational_status`.

### Kroki testowania ręcznego:

1. Paste → klasyfikacja (S-02) → pendingi na `/items`.
2. Zaznacz podzbiór → „Zatwierdź zaznaczone" → znikają < 200 ms, toast, widoczne w `/items/active`.
3. „Zaznacz wszystkie" → „Odrzuć zaznaczone" → potwierdzenie z liczbą → widoczne w `/items/trash`.
4. Edytuj pending w modalu (zmień typ + title) → zapis, zostaje pending → zatwierdź → w Aktywne z edycją.
5. Offline podczas akcji → rollback listy + toast błędu.

## Uwagi dotyczące wydajności

- NFR reakcji < 200 ms realizowany przez optimistic update — sieć w tle. Refetch świadomie odrzucony (round-trip + spinner).
- Bulk = jeden statement DB (atomowy), nie N round-tripów; max 100 id.

## Uwagi dotyczące migracji

Brak migracji — schemat S-02 kompletny. `updated_at` ustawiany jawnie w serwisie mutacji (bez triggera; trigger `set updated_at` jako ewentualne utwardzenie w S-04/S-05, gdy mutacji itemów przybędzie).

## Referencje

- Roadmapa: `context/foundation/roadmap.md` → S-03
- PRD: `context/foundation/prd.md` (US-02, US-03, FR-007, FR-008, FR-010, FR-012)
- Lekcje: `context/foundation/lessons.md` (zod dla wielopolowego; konfiguracja fail-closed)
- Schemat S-02: `supabase/migrations/20260610052532_classification_schema.sql`
- Wzorce: `src/pages/api/profile/byok-key.ts`, `src/pages/api/ingest/classify.ts:48-53`, `src/lib/services/items.ts`, `src/components/hooks/useApiKey.ts`

## Progress

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>`, gdy krok zostanie zrealizowany. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Backend mutacji (zod + serwis + endpointy)

#### Automatyczne

- [x] 1.1 Lint przechodzi (`npm run lint`) — c7adb7c
- [x] 1.2 Build/typecheck przechodzi (`npm run build`) — c7adb7c
- [x] 1.3 Testy jednostkowe serwisu mutacji przechodzą (`npm test`) — c7adb7c
- [x] 1.4 Testy integracyjne RLS + status-guard + zod przechodzą (`npm run test:integration`) — c7adb7c

#### Ręczne

- [ ] 1.5 `curl` bulk accept zmienia pendingi na `accepted` (Studio)
- [ ] 1.6 `curl` PATCH edycji derywuje `operational_status` z typu
- [ ] 1.7 Zły payload (puste ids / zła action / >100 id) → 400 bez dotknięcia bazy

### Faza 2: Widoki Aktywne + Kosz (read-only) + nawigacja filtra głównego

#### Automatyczne

- [x] 2.1 Lint przechodzi (`npm run lint`) — 185a9ea
- [x] 2.2 Build przechodzi (`npm run build`) — 185a9ea

#### Ręczne

- [ ] 2.3 Nawigacja przełącza 3 widoki, aktywny filtr wyróżniony
- [ ] 2.4 Zaakceptowany item w Aktywne, odrzucony w Koszu (read-only)
- [ ] 2.5 Niezalogowany na `/items/active`,`/items/trash` → redirect do logowania

### Faza 3: Model zaznaczania + akcje accept/reject (React island)

#### Automatyczne

- [x] 3.1 Lint przechodzi (`npm run lint`)
- [x] 3.2 Build przechodzi (`npm run build`)
- [x] 3.3 `npm audit` dla `sonner` czysty lub ryzyko zaakceptowane
- [x] 3.4 Testy jednostkowe zaznaczania / optimistic-rollback przechodzą (`npm test`)

#### Ręczne

- [ ] 3.5 Podzbiór + „Zatwierdź zaznaczone" → znikają < 200 ms + toast + w Aktywne, bez potwierdzenia
- [ ] 3.6 „Zaznacz wszystkie" + akcja → Dialog z liczbą → po potwierdzeniu w Koszu/Aktywne
- [ ] 3.7 Symulowany błąd → rollback listy + toast błędu
- [ ] 3.8 Item zaakceptowany w innej karcie → pominięty bez błędu (guard `pending`)
- [ ] 3.9 Po zatwierdzeniu/odrzuceniu wszystkich → widoczny komunikat pustej listy

### Faza 4: Edycja w stagingu (modal title/description/typ)

#### Automatyczne

- [ ] 4.1 Lint przechodzi (`npm run lint`)
- [ ] 4.2 Build przechodzi (`npm run build`)
- [ ] 4.3 Testy jednostkowe formularza edycji przechodzą (`npm test`)

#### Ręczne

- [ ] 4.4 Edycja title/description → item zaktualizowany, zostaje pending, toast
- [ ] 4.5 Zmiana typu task↔note → derywacja `operational_status` (Studio)
- [ ] 4.6 Pusty title blokuje zapis
- [ ] 4.7 Pełny przepływ S-02→S-03 (paste→edycja→akceptacja→Aktywne z edycją)
- [ ] 4.8 Edycja itemu nie-pending → toast 404 + zamknięcie modala, item znika z listy
