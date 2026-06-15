# Jednolita lista (filtr typu) + edycja zaakceptowanych itemów — Plan implementacji

## Przegląd

S-05 dokłada dwie zdolności do gotowej infrastruktury 5 widoków list (zbudowanej w S-02/S-03/S-04):

1. **Filtr typu** (Wszystkie / Zadania / Notatki / Pomysły / Decyzje / Inne) — druga warstwa FR-008 — na widokach **Aktywne / Zakończone / Anulowane**, realizowany jako filtrowanie klienckie w islandzie React.
2. **Edycję zaakceptowanych itemów** (`title`, `description`, `typ`) — FR-011 — z reużyciem istniejącego `EditItemDialog` i lekkim optimistic concurrency (compare-and-swap na `updated_at` → 409).

Zmiana jest **czysto aplikacyjna** — bez migracji. Schemat już niesie `updated_at` (timestamptz, aktualizowane aplikacyjnie) i `operational_status` dla wszystkich typów (po S-04).

## Analiza stanu obecnego

Filtr główny FR-008 (5 rozłącznych widoków) jest **w 100% gotowy**:

- 5 stron Astro SSR: `/items` (pending), `/items/active`, `/items/done`, `/items/cancelled`, `/items/trash`.
- `src/components/items/MainFilterNav.astro` — nawigacja filtra głównego (rząd przycisków, single-select po `pathname`).
- `src/components/items/AcceptedItemsView.tsx` — jeden reużyty island dla Aktywne/Zakończone/Anulowane; per-item zmiana stanu operacyjnego (klikalny `OperationalStatusBadge`) + bulk (4 przyciski) + zaznaczanie. **Brak edycji, brak filtra typu.**
- `src/components/items/PendingItemsView.tsx` — pending: bulk accept/reject + inline edycja przez `EditItemDialog`.
- `src/components/items/ItemList.astro` — Kosz, read-only.

Czego brakuje dla S-05:

- **Filtr typu** — całkowicie nieobecny na wszystkich widokach (`src/lib/services/items.ts` nie ma funkcji z filtrem typu; islandy nie mają stanu filtra typu).
- **Edycja zaakceptowanych** — `AcceptedItemsView` nie renderuje akcji „Edytuj"; serwis `editPendingItem` (`src/lib/services/items-mutation.ts:85`) ma guard `eq('acceptance_status','pending')`, więc PATCH zaakceptowanego zwraca dziś 404.

## Pożądany stan końcowy

Na widokach Aktywne / Zakończone / Anulowane użytkownik:

- widzi rząd przycisków filtra typu (Wszystkie / Zadania / Notatki / Pomysły / Decyzje / Inne), klika jeden i lista natychmiast (klient, <200 ms) zawęża się do tego typu;
- klika „Edytuj" przy itemie, w dialogu zmienia `title` / `description` / `typ`, zapisuje — item aktualizuje się w miejscu, **zachowując stan operacyjny**;
- jeśli ten sam item został w międzyczasie zmieniony gdzie indziej (inna karta), zapis kończy się komunikatem „element zmieniony — odśwież", a nie cichym nadpisaniem.

Weryfikacja: edycja zaakceptowanego itemu zmienia pola i utrzymuje `operational_status`; filtr typu zawęża render bez przeładowania strony; równoległa edycja tego samego itemu z nieaktualnym `updated_at` zwraca 409.

### Kluczowe odkrycia:

- `src/lib/services/items-mutation.ts:85` — `editPendingItem` z guardem `eq('acceptance_status','pending')` i re-derywacją `operational_status` z typu (`deriveOperationalStatus` zawsze `'new'`, linia ~30). To pułapka dla accepted — re-derywacja zresetowałaby postęp.
- `src/pages/api/items/[id].ts` — PATCH; walidacja `editItemSchema` z `src/lib/validation/items.ts:47`; kanoniczny kształt błędu `{ ok:false, code, error }`.
- `src/components/items/EditItemDialog.tsx` — dialog edycji generyczny na `item: Item`; reużywalny dla accepted (czyta `item.updated_at`).
- `src/components/items/edit-form.ts` — czysta walidacja (`isTitleValid`, `buildEditPayload`); reużywalna bez zmian.
- `src/components/items/AcceptedItemsView.tsx` — wiersz: `[Checkbox][Type badge][OperationalStatusBadge][Title][Description]`; logika `reconcileAfterChange` z `operational-view.ts` (wzorzec usuwania itemu wypadającego z predykatu widoku) — analogiczny do potrzebnej logiki filtra typu.
- `src/components/hooks/useItemMutation.ts` — `editItem(id, input)` → PATCH; mapuje 404 → `reason:"not_found"`. Wzorzec do rozszerzenia o `expectedUpdatedAt` + `reason:"conflict"`.
- `src/lib/labels.ts` — `ITEM_TYPE_LABELS` (etykiety typów). Źródło etykiet przycisków filtra.
- `import-sessions.astro:16` — istnieje wzorzec query paramów (whitelista + fallback), ale **świadomie nieużywany** tu (decyzja #1: filtr kliencki).

## Czego NIE robimy

- **Filtr typu na Pending i Kosz** — poza tym wycinkiem (decyzja #2; pełny FR-008 warstwa-typ domknięty osobno).
- **Sortowanie, wyszukiwanie, filtr po sesji/dacie** — to S-09 (`list-filters-search`).
- **Query paramy / linkowalność filtra** — świadomie kliencki, niezachowywany w URL (decyzja #1).
- **Edycja itemów w Koszu** — FR-011: Kosz read-only (zostaje jak jest).
- **Zmiana migracji / schematu** — `updated_at` i `operational_status` już istnieją.
- **Bulk edycja pól** — edycja jest per-item (FR-011); bulk dotyczy tylko accept/reject/operational.
- **Trigger DB `updated_at`** — utrzymujemy wzorzec aktualizacji aplikacyjnej (spójnie z S-03/S-04).

## Podejście do implementacji

Trzy fazy, każda samodzielnie weryfikowalna i odpowiadająca jednemu sub-issue na boardzie:

1. **Backend** — rozszerzenie edycji na accepted + optimistic concurrency (serwis, endpoint, walidacja, testy).
2. **Frontend edycja** — reużycie `EditItemDialog` w `AcceptedItemsView`, obsługa 409.
3. **Frontend filtr typu** — komponent filtra + stan + „przypięte" id dla zachowania edytowanych itemów wbrew predykatowi.

Kolejność backend → edycja → filtr buduje pełen pion edycji, zanim warstwa filtra (UI-only) wejdzie na wierzch; interakcja filtr↔edycja (decyzja #6) jest świadomie domknięta w Fazie 3.

## Krytyczne szczegóły implementacji

- **Optimistic concurrency wymaga rozróżnienia 404 vs 409 dwukrokowo.** Pojedynczy UPDATE z guardem `acceptance_status IN ('pending','accepted') AND updated_at = <oczekiwane>` zwracający 0 wierszy jest **niejednoznaczny**: item mógł nie istnieć / być nieedytowalny (→ 404) albo być nieaktualny (→ 409). Po 0-wierszowym UPDATE wykonaj follow-up SELECT po `id` (RLS-scoped): jeśli wiersz istnieje i ma status edytowalny, lecz inne `updated_at` → **409 conflict**; w przeciwnym razie → **404 not editable**. Bez tego rozróżnienia UI nie odróżni „ktoś nadpisał" od „item zniknął".
- **Edycja NIE modyfikuje `operational_status`** (decyzja #3). Usuń `deriveOperationalStatus` z payloadu UPDATE w ścieżce edycji. Dla pendingów to no-op (są `'new'`), dla accepted zachowuje postęp. To nieoczywiste, bo dziś S-03 jawnie ustawia stan przy edycji — pokusa „rozszerz guard i zostaw resztę" wprowadziłaby regresję.

## Faza 1: Backend — edycja zaakceptowanych + optimistic concurrency

### Przegląd

Rozszerzenie ścieżki edycji itemu (serwis + endpoint + walidacja) tak, by obejmowała itemy `accepted`, nie modyfikowała stanu operacyjnego i egzekwowała compare-and-swap na `updated_at`.

### Wymagane zmiany:

#### 1. Schemat walidacji edycji

**Plik**: `src/lib/validation/items.ts`

**Cel**: Dodać do `editItemSchema` oczekiwane `updated_at`, by serwer mógł wykonać compare-and-swap. Wejście wielopolowe → zod (hard rule + lekcja).

**Kontrakt**: `editItemSchema` zyskuje pole `expectedUpdatedAt: string` (ISO 8601, walidacja datetime). Pozostałe pola (`title`, `description`, `type`) bez zmian.

#### 2. Serwis mutacji — `editItem`

**Plik**: `src/lib/services/items-mutation.ts`

**Cel**: Przemianować/rozszerzyć `editPendingItem` na `editItem` obsługujący `pending` **i** `accepted`, bez dotykania `operational_status`, z compare-and-swap i rozróżnieniem konflikt/niedostępny.

**Kontrakt**: `editItem(supabase, id, input, expectedUpdatedAt): Promise<Item>`.
- Guard UPDATE: `.in('acceptance_status', ['pending','accepted'])` + `.eq('updated_at', expectedUpdatedAt)`.
- Payload UPDATE: `title`, `description`, `type`, `updated_at: now()` — **bez** `operational_status`.
- 0 wierszy → follow-up SELECT po `id`: istnieje + status edytowalny + inne `updated_at` ⇒ rzuć `ItemConflictError`; w przeciwnym razie ⇒ rzuć `ItemNotEditableError` (istniejąca klasa).
- Nowa klasa błędu `ItemConflictError` obok `ItemNotEditableError`.

#### 3. Endpoint PATCH

**Plik**: `src/pages/api/items/[id].ts`

**Cel**: Przekazać `expectedUpdatedAt` do serwisu i zmapować nowy błąd konfliktu na 409 w kanonicznym kształcie.

**Kontrakt**: Body walidowane rozszerzonym `editItemSchema`. Mapowanie błędów: `ItemConflictError` → `409 { ok:false, code:"conflict", error:"Element został zmieniony w innym miejscu — odśwież i spróbuj ponownie." }`; `ItemNotEditableError` → `404` (bez zmian). Sukces `200 { ok:true, item }`.

#### 4. Testy

**Plik**: `src/lib/services/items-mutation.test.ts`, `src/pages/api/items/[id].test.ts`

**Cel**: Pokryć nowe ścieżki; zaktualizować istniejące asercje S-03 (jeśli zakładały ustawianie `operational_status` przy edycji).

**Kontrakt**: Serwis — edycja accepted (sukces, stan operacyjny zachowany), edycja pending (sukces), nieaktualne `updated_at` → `ItemConflictError`, nieedytowalny/nieistniejący → `ItemNotEditableError`. Endpoint — 200, 409, 404, 400 (zła walidacja/UUID), 401.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna:

- Edycja zaakceptowanego itemu w realnej aplikacji zmienia `title`/`description`/`typ` i **zachowuje** stan operacyjny (np. „w realizacji" pozostaje „w realizacji").
- Edycja w dwóch kartach tego samego itemu: druga próba zapisu (z nieaktualnym `updated_at`) zwraca 409, nie nadpisuje cicho.

**Uwaga implementacyjna**: Po przejściu automatycznych weryfikacji zatrzymaj się na ręczne potwierdzenie człowieka przed Fazą 2.

---

## Faza 2: Frontend — edycja w widokach zaakceptowanych

### Przegląd

Reużycie `EditItemDialog` w `AcceptedItemsView`: przycisk „Edytuj" w wierszu, przekazanie `updated_at` do compare-and-swap, obsługa 409. Pending zyskuje to samo utwardzenie (spójność).

### Wymagane zmiany:

#### 1. Hook mutacji

**Plik**: `src/components/hooks/useItemMutation.ts`

**Cel**: `editItem` przesyła `expectedUpdatedAt` i rozpoznaje konflikt.

**Kontrakt**: `editItem(id, input, expectedUpdatedAt)` dokłada `expectedUpdatedAt` do body PATCH; mapuje `409` → `{ ok:false, reason:"conflict" }` (obok istniejącego `"not_found"`/`"failed"`).

#### 2. Dialog edycji

**Plik**: `src/components/items/EditItemDialog.tsx`

**Cel**: Uczynić dialog reużywalnym dla accepted i obsłużyć konflikt.

**Kontrakt**: Czyta `item.updated_at` jako `expectedUpdatedAt` przy zapisie. Nowy opcjonalny callback `onConflict?(id)` (gdy `reason:"conflict"`) — toast „element zmieniony — odśwież" + sygnał do rodzica o odświeżenie. Bez zmian w polach/walidacji (`edit-form.ts` reużyte).

#### 3. Widok zaakceptowanych

**Plik**: `src/components/items/AcceptedItemsView.tsx`

**Cel**: Dodać akcję „Edytuj" per wiersz + osadzić dialog + callbacki.

**Kontrakt**: Stan `editing: Item | null`; przycisk „Edytuj" w wierszu (po `OperationalStatusBadge`); render `<EditItemDialog>` na dole. `onSaved(updated)` → podmiana itemu w stanie (stan operacyjny zachowany ⇒ item zostaje w bieżącym widoku operacyjnym). `onNotFound(id)` → usuń z listy + z zaznaczenia. `onConflict()` → toast + odświeżenie widoku (przeładowanie SSR — ścieżka wyjątkowa, poza NFR 200 ms).

#### 4. Spójność pendingów

**Plik**: `src/components/items/PendingItemsView.tsx`

**Cel**: Przekazać `item.updated_at` do `EditItemDialog`, by edycja pendingów też korzystała z compare-and-swap.

**Kontrakt**: Bez zmian UX; tylko przekazanie `expectedUpdatedAt` i ewentualny `onConflict`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna:

- W widokach Aktywne / Zakończone / Anulowane przycisk „Edytuj" otwiera dialog; zapis aktualizuje wiersz w miejscu bez przeładowania.
- Zmiana typu w dialogu działa; po zapisie item zachowuje stan operacyjny i pozostaje w tym samym widoku głównym.
- Toast potwierdza zapis; konflikt (409) pokazuje komunikat „element zmieniony — odśwież" i odświeża widok.

**Uwaga implementacyjna**: Po przejściu automatycznych weryfikacji zatrzymaj się na ręczne potwierdzenie człowieka przed Fazą 3.

---

## Faza 3: Frontend — filtr typu na widokach zaakceptowanych

### Przegląd

Rząd przycisków filtra typu (single-select, 6 opcji) w `AcceptedItemsView`, filtrujący klient-side już załadowane itemy. Edytowane itemy, które po zmianie typu wypadają z aktywnego filtra, **zostają widoczne** do przełączenia filtra/odświeżenia (decyzja #6).

### Wymagane zmiany:

#### 1. Czysta logika filtra

**Plik**: `src/components/items/type-filter.ts` (nowy) + `type-filter.test.ts` (nowy)

**Cel**: Wydzielić testowalną logikę filtrowania i „przypinania".

**Kontrakt**: `TYPE_FILTER_VALUES` = `["all","task","note","idea","decision","other"]`; `applyTypeFilter(items, filter, pinnedIds): Item[]` zwraca itemy spełniające `filter === "all" || item.type === filter` **lub** `pinnedIds.has(item.id)`. Czysta funkcja, testowana w node.

#### 2. Komponent filtra

**Plik**: `src/components/items/TypeFilter.tsx` (nowy)

**Cel**: Prezentacyjny rząd przycisków single-select.

**Kontrakt**: Props `value: TypeFilterValue`, `onChange(value)`. Etykiety: „Wszystkie" + `ITEM_TYPE_LABELS` z `src/lib/labels.ts`. Wizualnie spójny z `MainFilterNav` (aktywny = podświetlony). Bez własnego stanu (kontrolowany).

#### 3. Wpięcie w widok

**Plik**: `src/components/items/AcceptedItemsView.tsx`

**Cel**: Stan filtra + „przypięte" id + render filtra + pusta lista + zawężenie zaznaczania do widocznych.

**Kontrakt**:
- Stan `typeFilter` (domyślnie `"all"`) i `pinnedIds: Set<string>`.
- Renderowana lista = `applyTypeFilter(items, typeFilter, pinnedIds)`.
- Zmiana filtra → wyczyść `pinnedIds` (item znika dopiero przy przełączeniu — decyzja #6).
- W `onSaved`: jeśli nowy `type` nie pasuje do `typeFilter` (i `typeFilter !== "all"`) → dodaj `id` do `pinnedIds` (zostaje widoczny).
- „Zaznacz wszystkie" operuje na **widocznej** (przefiltrowanej) liście, nie na pełnym zbiorze.
- Pusty stan: gdy przefiltrowana lista pusta → komunikat „Brak itemów tego typu w tym widoku".

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą (w tym `type-filter.test.ts`): `npm test`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna:

- Kliknięcie przycisku typu natychmiast (<200 ms) zawęża listę; „Wszystkie" przywraca pełną.
- Przy aktywnym filtrze „Zadania" edycja itemu na inny typ → item **zostaje widoczny** do przełączenia filtra/odświeżenia, potem znika.
- „Zaznacz wszystkie" zaznacza tylko widoczne itemy; bulk operacyjny działa na zaznaczonych.
- Pusty filtr pokazuje komunikat zamiast pustego ekranu.

**Uwaga implementacyjna**: Po przejściu automatycznych weryfikacji zatrzymaj się na ręczne potwierdzenie człowieka.

---

## Strategia testowania

### Testy jednostkowe:

- `type-filter.ts` — `applyTypeFilter` dla `all`/konkretnego typu, z `pinnedIds` i bez (zachowanie przypiętych mimo niezgodności).
- `items-mutation.ts` — `editItem`: accepted sukces (stan operacyjny zachowany), pending sukces, konflikt `updated_at`, nieedytowalny.
- Endpoint `[id].ts` — 200 / 409 / 404 / 400 / 401.

### Testy integracyjne:

- (Opcjonalnie, `npm run test:integration`) pełny PATCH zaakceptowanego itemu z poprawnym i nieaktualnym `updated_at`.

### Kroki testowania ręcznego:

1. Zaloguj się, wejdź na `/items/active`, edytuj item zmieniając typ — sprawdź zachowanie stanu operacyjnego.
2. Otwórz ten sam item w dwóch kartach, zapisz w obu — druga ma dać 409.
3. Przełączaj filtr typu — render zawęża się natychmiast bez reloadu.
4. Przy filtrze „Zadania" zmień typ itemu na „Notatka" — item zostaje do przełączenia filtra.

## Uwagi dotyczące wydajności

Filtr kliencki na małym wolumenie (`target_scale: small`) jest natychmiastowy i mieści się w NFR „reakcja ≤ 200 ms". Ścieżka 409 (konflikt) z przeładowaniem SSR jest wyjątkowa i poza budżetem 200 ms — akceptowalne.

## Uwagi dotyczące migracji

Brak. Schemat (`updated_at`, `operational_status` dla wszystkich typów) wystarcza; zmiana jest aplikacyjna.

## Referencje

- Roadmapa: `context/foundation/roadmap.md` (S-05)
- PRD: FR-008 (warstwa filtra typu), FR-011 (edycja zaakceptowanych), OQ5/OQ6
- Lekcje: `context/foundation/lessons.md` (optimistic concurrency → S-05; kształt błędu `{ok:false,code,error}`)
- Wzorzec edycji: `src/components/items/EditItemDialog.tsx`, `src/components/items/edit-form.ts`
- Wzorzec reconcile: `src/components/items/operational-view.ts` (`reconcileAfterChange`)
- Serwis: `src/lib/services/items-mutation.ts:85` (`editPendingItem`)

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po zakończeniu kroku. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Backend — edycja zaakceptowanych + optimistic concurrency

#### Automatyczne

- [x] 1.1 Lint przechodzi: `npm run lint` — e79baad
- [x] 1.2 Testy jednostkowe przechodzą: `npm test` — e79baad
- [x] 1.3 Build przechodzi: `npm run build` — e79baad

#### Ręczne

- [ ] 1.4 Edycja zaakceptowanego itemu zmienia pola i zachowuje stan operacyjny
- [ ] 1.5 Równoległa edycja z nieaktualnym `updated_at` zwraca 409 (brak cichego nadpisania)

### Faza 2: Frontend — edycja w widokach zaakceptowanych

#### Automatyczne

- [x] 2.1 Lint przechodzi: `npm run lint`
- [x] 2.2 Testy jednostkowe przechodzą: `npm test`
- [x] 2.3 Build przechodzi: `npm run build`

#### Ręczne

- [ ] 2.4 Przycisk „Edytuj" w Aktywne/Zakończone/Anulowane otwiera dialog; zapis aktualizuje wiersz w miejscu
- [ ] 2.5 Zmiana typu zachowuje stan operacyjny i widok główny
- [ ] 2.6 Konflikt (409) pokazuje komunikat „element zmieniony — odśwież" i odświeża widok

### Faza 3: Frontend — filtr typu na widokach zaakceptowanych

#### Automatyczne

- [ ] 3.1 Lint przechodzi: `npm run lint`
- [ ] 3.2 Testy jednostkowe przechodzą (w tym `type-filter.test.ts`): `npm test`
- [ ] 3.3 Build przechodzi: `npm run build`

#### Ręczne

- [ ] 3.4 Kliknięcie typu natychmiast zawęża listę; „Wszystkie" przywraca pełną
- [ ] 3.5 Edycja zmieniająca typ przy aktywnym filtrze — item zostaje widoczny do przełączenia/odświeżenia
- [ ] 3.6 „Zaznacz wszystkie" zaznacza tylko widoczne; pusty filtr pokazuje komunikat
