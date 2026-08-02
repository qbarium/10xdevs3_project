---
change_id: refactor-opportunities
title: Guard rozjazdu props↔migracja + charakteryzacja cichego upsertu (plan L4)
status: planned
created: 2026-08-02
updated: 2026-08-02
based_on: context/changes/refactor-opportunities/research.md
---

# Plan: guard props↔migracja + charakteryzacja cichego upsertu

Realizacja rankingu z `research.md` (element ④). Wybór z bramki decyzyjnej: **K1 (guard) jako główna zmiana + tani test charakteryzujący z K3**. Filozofia: **guard, nie przebudowa** — wszystkie fazy to *dodanie testów*, zero zmian w kodzie produkcyjnym, każda faza osobno odwracalna. Zakres celowo wąski (kontrola pola rażenia).

## Stan obecny (z research + weryfikacji ast-grep)

- **K1:** każdy z 12 plików kształtów (`tlschema/src/shapes`) trzyma ręcznie zgrywaną triadę (walidator propsów + numery wersji + migracje). Nic nie wymusza migracji przy zmianie walidatora; `validateMigrations` pilnuje tylko numeracji sekwencji. Udowodniona historia bugów desync (m.in. utrata danych, #2302). Fundament pod guard istnieje: `StoreSchema.serialize()` (`store/src/lib/StoreSchema.ts:762`) — ale zwraca **tylko numery wersji** (`{schemaVersion, sequences}`), więc sam snapshot **nie łapie** zmiany walidatora bez migracji.
- **K3:** `createShapes` (`editor/.../Editor.ts:8573`) nie sprawdza kolizji własnego `id` (tylko `parentId`, `:8615`); przy kolizji `Store.put` (`store/.../Store.ts:620`) cicho nadpisuje (udokumentowany upsert, docstring `:603`, test kontraktu `Store.test.ts:125`). `createShapes.test.ts` nie ma testu kolizji `id`.

## Stan docelowy

Trzy testy-strażniki chroniące najbardziej kruche miejsca zapisu kształtu, bez zmiany zachowania produkcyjnego:
1. Niezamierzona zmiana **numerów wersji** migracji → czerwony test.
2. Dodanie/usunięcie **pola (klucza) propsów** kształtu bez odpowiadającej migracji → czerwony test — najczęstszy przypadek desync z K1. (Świadoma granica: zmiana samego *typu* istniejącego pola, np. `T.number`→`T.positiveNumber`, pozostaje poza zasięgiem tego strażnika — patrz Faza 2.)
3. Ciche nadpisanie przy kolizji `id` w `createShapes` → utrwalone testem (gdyby ktoś w przyszłości zmienił to zachowanie, test złapie zmianę).

---

## Phase 1: Snapshot sekwencji migracji (charakteryzacja)

Najtańszy pierwszy krok, oparty na gotowym `serialize()`. Utrwala obecny zestaw numerów wersji migracji; łapie przypadkowe usunięcie/przenumerowanie migracji.

### Changes Required
- Nowy plik testu w `packages/tlschema`, zgodnie z konwencją pakietu (testy leżą koło kodu lub w `__tests__` — np. `createTLSchema.test.ts`; ścieżka `src/test/...` NIE jest tu konwencją).
- Asercja: `expect(createTLSchema().serialize()).toMatchSnapshot()`.
- Wygenerowany plik `.snap` wchodzi do repo (charakteryzacja stanu zastanego). Uwaga: `toMatchSnapshot` nie jest jeszcze używany w samym `tlschema` (10 użyć z research jest w innych pakietach monorepo) — vitest wspiera go wszędzie, więc to nieblokujące.
- **CI:** testy jednostkowe `tlschema` biegną w `test-ci` (`.github/workflows/checks.yml`), więc snapshot łapie desync automatycznie na PR-ach — bez dokładania osobnego checku CI.

### Success Criteria
#### Automated
- Test przechodzi na obecnym kodzie (tworzy snapshot).
- Weryfikacja skuteczności: tymczasowa zmiana numeru wersji dowolnej migracji → test świeci na czerwono; po cofnięciu → zielony. (Zmiany nie commitujemy.)
#### Manual
- Przegląd wygenerowanego `.snap` — czy zawiera wszystkie sekwencje kształtów.

---

## Phase 2: Snapshot kluczy propsów per kształt (częściowy guard K1 — z jawną granicą)

Mądrzejszy strażnik: obok numeru wersji utrwala **zbiór kluczy (nazw pól) propsów każdego typu kształtu**. Dodanie/usunięcie pola bez bumpu wersji zmienia snapshot bez zmiany numeru → czerwony test = „zmieniłeś kształt, sprawdź czy potrzebna migracja".

**Jawna granica (potwierdzona w kodzie):** snapshot niesie *nazwy* pól, nie ich *typy*. Wartości propsów to walidatory (`bend: T.number`, `scale: T.nonZeroNumber`, `richText: richTextValidator` — `tlschema/src/shapes/TLArrowShape.ts:237-254`), a walidatory nie mają czytelnej serializacji. Więc guard **łapie** dodanie/usunięcie pola (najczęstszy desync), ale **nie łapie** zmiany samego walidatora istniejącego pola (`T.number`→`T.positiveNumber`, inny enum, przebudowa zagnieżdżona) — a to też była klasa cichych zmian z historii (#2302). Keys-only to świadomy, pragmatyczny sufit; plan go **nazywa**, nie maskuje.

### Changes Required
- **Prerekwizyt — już rozwiązany** (do domknięcia od ręki): dostęp do kluczy propsów istnieje — `defaultShapeSchemas` jest eksportowany (`tlschema/src/createTLSchema.ts:150-169`), a każde `.props` to `Record<string, Validator>`, więc `Object.keys(defaultShapeSchemas.arrow.props)` działa; pojedyncze `arrowShapeProps` itd. też są eksportowane.
- **Osobny** plik testu + **osobny** `.snap` (nie rozszerzenie Fazy 1) — żeby Faza 2 pozostała samodzielnie wycofywalna.
- Dla każdego typu kształtu z propsami zserializuj `{ wersja, klucze_propsów }` i `toMatchSnapshot()`.
- **Opcjonalnie, tanie poszerzenie zasięgu:** zejdź rekurencyjnie po `ObjectValidator.config` (`validate/src/lib/validation.ts:650`) i utrwal `id` styli (`StyleProp` ma tożsamość) — to złapie część zmian *wartości*, nie tylko kluczy.

### Success Criteria
#### Automated
- Test przechodzi na obecnym kodzie.
- Przypadek POZYTYWNY: tymczasowe dodanie/usunięcie pola propsa **bez** bumpu wersji → test czerwony; po cofnięciu → zielony. (Nie commitujemy.)
- Przypadek NEGATYWNY (utrwala granicę): tymczasowa zmiana walidatora istniejącego pola bez zmiany nazwy i bez bumpu → test **zostaje zielony**; udokumentuj to w teście jako znane ograniczenie, nie jako sukces.
#### Manual
- Snapshot obejmuje wszystkie **13** typów kształtów (`group` ma puste propsy `{}` i nie niesie migracji; pozostałe **12** mają wersjonowaną triadę). Komunikat błędu naprowadza na „dodaj migrację".

---

## Phase 3: Test charakteryzujący cichego upsertu w `createShapes` (K3)

Tani, bezpieczny zysk „niezależnie od rankingu". Utrwala obecne zachowanie — nic nie zmienia.

### Changes Required
- Dopisanie testu do `packages/tldraw/src/test/commands/createShapes.test.ts`.
- Scenariusz: utwórz kształt o danym `id`, potem `createShapes` z tym samym `id` (inne propsy) → asercja obecnego zachowania: drugie wywołanie **nadpisuje** (jeden kształt, zaktualizowane propsy), **bez** rzucenia błędu.

### Success Criteria
#### Automated
- Test przechodzi (dokumentuje ciche nadpisanie).
#### Manual
- Komentarz w teście jasno mówi, że utrwala *obecne* (nie docelowe) zachowanie — problem wyroczni z M3L1.

---

## What We're NOT Doing

- **Nie zmieniamy architektury migracji** — to świadome, nośne rozwiązanie (guard, nie przebudowa).
- **Nie dodajemy ostrzeżenia/błędu przy kolizji `id`** w `createShapes` — intencja jest `[unknown]`, zmiana zachowania to osobna decyzja (follow-up).
- **Nie ruszamy `Store.put`** — upsert jest tam zamierzony i zablokowany testem `[S2]`.
- **Nie tykamy K2** (synchronizacja wersji schematu) — działający, dojrzały protokół; ewentualnie osobna nota o inwariancie, nie refaktor.
- **Nie naprawiamy zawartości** — plan tylko *wykrywa* rozjazdy props↔migracja, nie dopisuje brakujących migracji.
- **Nie dokładamy pozostałych brakujących testów** (walidatory kształtu, rollback `updateShapes`, readonly, nieznany typ) — poza tym wąskim wycinkiem.

---

## Progress

### Phase 1: Snapshot sekwencji migracji
#### Automated
- [ ] Test `createTLSchema().serialize()` toMatchSnapshot przechodzi
- [ ] Weryfikacja skuteczności: zmiana numeru wersji → czerwony (cofnięta)
#### Manual
- [ ] Przegląd wygenerowanego `.snap`

### Phase 2: Snapshot kluczy propsów per kształt
#### Automated
- [ ] Osobny plik testu + osobny `.snap` (dostęp przez `defaultShapeSchemas`)
- [ ] Test snapshotu `{wersja, klucze_propsów}` przechodzi
- [ ] Pozytywny: dodanie/usunięcie pola bez bumpu → czerwony (cofnięta)
- [ ] Negatywny: zmiana typu istniejącego pola bez bumpu → zostaje zielony, udokumentowane jako granica
#### Manual
- [ ] Snapshot obejmuje 13 typów (group puste; 12 z triadą); komunikat naprowadza na migrację

### Phase 3: Test charakteryzujący cichego upsertu w createShapes
#### Automated
- [ ] Test kolizji `id` w `createShapes.test.ts` przechodzi
#### Manual
- [ ] Komentarz zaznacza, że utrwala obecne, nie docelowe zachowanie
