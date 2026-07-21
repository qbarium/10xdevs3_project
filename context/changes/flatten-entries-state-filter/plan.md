# Konsolidacja filtra stanu Wpisów — plan implementacji

## Przegląd

Na stronie „Wpisy" oś stanu jest dziś rozłożona na dwie sąsiednie kontrolki: rozwijaną listę widoku
(`EntriesViewSelect`: Aktywne / Zakończone / Anulowane / Kosz) oraz pigułki podfiltra
(`OperationalSubFilter`: Wszystkie / Nowe / W toku, tylko w Aktywne). Czyta się to jak dublowanie,
choć funkcjonalnie nim nie jest (żadna wartość nie jest osiągalna przez obie kontrolki).

Konsolidujemy oś stanu do **jednej rozwijanej listy** o sześciu pozycjach w kolejności cyklu życia:
**Wszystko aktywne / Nowe / W toku / Zakończone / Anulowane / Kosz** (płasko, bez separatora).
Pigułki `OperationalSubFilter` znikają. To krok „teraz" (stary UI, rozwijana lista); poziome taby z
licznikami wg szkicu docelowego to osobny, późniejszy horyzont — **poza tym planem**.

## Analiza stanu obecnego

Dwie warstwy architektury dotykają stanu (konwencja bazy: „który zbiór oglądam" = ścieżka strony,
„jak go zawężam" = parametr URL):

- **Rozwijana lista widoku** — `EntriesViewSelect.tsx:13-37`. Cztery widoki; wybór wykonuje **pełną
  nawigację** `window.location.assign` na `/items/{view}` (świeży render SSR), niosąc aktywny filtr
  rodzaju jako `?type=`. Renderowana w slocie `leading` paska filtrów w **trzech** wyspach:
  `AcceptedItemsView.tsx:319` (active/done/cancelled) i `TrashItemsView.tsx:209` (trash).
- **Pigułki podfiltra operacyjnego** — `OperationalSubFilter.tsx:12-19`, montowane w
  `ListFilterBar.tsx:95-102` **tylko** dla `view==="active"`. Wybór to **klienckie** `applyCriteria`
  (`setCriteria` wyspy → re-fetch, bez zmiany strony), ustawiające `criteria.opstatus`.

Kluczowe ograniczenia i zasoby odkryte podczas badania:

- `opstatus` jest honorowany **wyłącznie dla active** — w parserze (`list-criteria.ts:127`) i w
  serializatorze (`criteriaToQuery:152`). `criteriaToQuery` jest kanonicznym, testowanym budowniczym
  query stringa i sam pomija `opstatus` dla widoków innych niż active.
- **Podfiltr już dziś ląduje w URL i historii.** Hook `useItemList.ts:180-185` po udanym re-fetchu
  robi `pushState` dla zmian dyskretnych (w tym `opstatus`). Klik „Nowe" → URL `?opstatus=new`.
  Nie ma więc niespójności „widok w URL, podfiltr nie" — oba mechanizmy już zapisują adres.
- Kolejność cyklu życia jest w kodzie: `BULK_TARGETS = new → in_progress → done → cancelled`
  (`AcceptedItemsView.tsx:49`).
- Predykat widoku (`operational-view.ts:15-20`: active = `new`|`in_progress`) **nie wymaga zmian** —
  krok „teraz" nie rusza definicji widoków, tylko warstwę kontrolki.
- Wzorzec bazy: czysta logica jest wydzielana obok źródła i testowana w vitest
  (`operational-view.test.ts`, `list-criteria.test.ts`, `type-filter.test.ts`).

## Pożądany stan końcowy

Na stronie „Wpisy" jest **jedna** kontrolka stanu (rozwijana lista) z sześcioma pozycjami. Wszystkie
dzisiejsze funkcje zachowane:

- Na `active` wybór „Wszystko aktywne / Nowe / W toku" zawęża listę **bez przeładowania** (kliencki
  `opstatus`), a adres dostaje `?opstatus=` — identycznie jak dziś pigułki.
- Wybór „Zakończone / Anulowane / Kosz" wykonuje **pełną nawigację** na stronę widoku, niosąc `?type=`
  — identycznie jak dziś rozwijana lista.
- Wybór pozycji aktywnej **z innej strony** (np. z Kosza „Nowe") nawiguje na `/items/active` z
  `?opstatus=` i niesionym `?type=`.

Weryfikacja: pigułki `OperationalSubFilter` nie istnieją w drzewie ani w kodzie; rozwijana lista
odzwierciedla bieżący stan (widok + `opstatus`) jako zaznaczoną pozycję.

### Kluczowe odkrycia:

- Heterogeniczny `onChange` jednej kontrolki — dwa mechanizmy na pozycję (`EntriesViewSelect.tsx:32-37`
  vs `ListFilterBar.tsx:96-101`).
- `criteriaToQuery` (`list-criteria.ts:139-156`) do budowy URL nawigacji — reużyć zamiast ręcznie
  sklejać (sam respektuje „opstatus tylko dla active").
- `applyCriteria(resetToFirstPage(...))` (`AcceptedItemsView.tsx:225-228,315`) czyści zaznaczenie i
  resetuje stronę — to ścieżka, którą musi wołać kliencki podfiltr, tak jak dziś pigułki.

## Czego NIE robimy

- **Poziome taby z licznikami** (szkic docelowy) — osobny, późniejszy krok.
- **Rozszerzanie `opstatus` na inne widoki** — zostaje wyłącznie dla active (`list-criteria.ts:127,152`
  bez zmian).
- **Zmiana predykatu widoku** (`operational-view.ts`, `items.ts`) — Aktywne dalej = `new`+`in_progress`.
- **Zmiana osi rodzaju** (`TypeFilter`) — zostaje w swoim rzędzie bez zmian.
- **Zapamiętywanie `opstatus` między nawigacjami widoków** — nawigacja resetuje kryteria poza `type`
  do domyślnych widoku (zachowanie dzisiejsze).

## Podejście do implementacji

Trzy fazy: (1) czysta logika wyboru stanu + testy jako fundament; (2) rozszerzony, przemianowany
komponent podpięty do wysp, z **celową tymczasową koegzystencją** pigułek do weryfikacji parytetu;
(3) usunięcie pigułek. Podział izoluje ryzykowną część (heterogeniczny wybór) w testowalnej, czystej
funkcji i pozwala potwierdzić równoległość „lista == pigułka", zanim skasujemy stare.

## Krytyczne szczegóły implementacji

- **Gałąź kliencki-vs-nawigacja jest źródłem regresji.** Tylko `view==="active"` + pozycja aktywna =
  kliencki podfiltr (bez `location.assign`); **każda inna** kombinacja = pełna nawigacja. Pomyłka
  (nawigacja na active zamiast re-fetchu) zamienia płynne zawężenie w przeładowanie strony.
- **Kliencki podfiltr MUSI iść przez `resetToFirstPage` + czyszczenie zaznaczenia.** Pominięcie resetu
  strony daje offset za końcem zbioru → błąd PGRST103 (baza komentuje to w `AcceptedItemsView.tsx:230-235`).
  Callback ma replikować dzisiejszą ścieżkę pigułek, nie skrót.
- **shadcn `Select` wymaga unikalnych wartości string na pozycję.** Trzy pozycje aktywne dzielą widok
  `active`, więc potrzebują rozłącznych wartości (np. `active`, `active:new`, `active:in_progress`).
- **Szerokość triggera.** Dziś `w-[136px]` mieści „Aktywne"; „Wszystko aktywne" jest dłuższe —
  trigger musi się rozszerzyć/dopasować, by etykieta nie była ucięta.

## Faza 1: Czysta logika filtra stanu + testy

### Przegląd

Wydzielić całą decyzję „która pozycja → jaka akcja" oraz „który stan → zaznaczona pozycja" do czystej,
testowalnej funkcji. Bez zmian w UI — aplikacja działa jak dotąd.

### Wymagane zmiany:

#### 1. Moduł czystej logiki wyboru stanu

**Plik**: `src/components/items/state-filter.ts` (nowy)

**Cel**: Jedno źródło prawdy o pozycjach filtra stanu (model, kolejność, etykiety) i o mapowaniu
wyboru na akcję. Komponent w Fazie 2 tylko woła te funkcje — logika żyje tu, żeby była testowana w
node (wzorzec `operational-view.ts` / `type-filter.ts`).

**Kontrakt**:
- Model 6 pozycji w kolejności: `Wszystko aktywne`, `Nowe`, `W toku` (rodzina „active" z `opstatus`
  odpowiednio `undefined`/`new`/`in_progress`), potem `Zakończone`, `Anulowane`, `Kosz` (rodzina
  „nav" z docelowym `MainView`). Każda pozycja ma unikalną wartość string dla `Select`. Etykiety
  stanów operacyjnych z `operationalStatusLabel`; „Wszystko aktywne" i etykiety widoków — literały
  zgodne z dzisiejszym `ENTRY_VIEWS`.
- `resolveStateSelection(value: string, ctx: { view: MainView; type: TypeFilterValue }): StateSelection`
  gdzie wynik to typ rozłączny. Reużywa `criteriaToQuery` do budowy `href` (dzięki czemu `opstatus`
  jest w URL tylko przy nawigacji na active; `type` niesiony gdy różny od `all`).
- `stateSelectValue(view: MainView, opstatus: OperationalStatus | undefined): string` — zaznaczona
  pozycja: dla `active` wg `opstatus`, dla pozostałych wg `view`.

Kontrakt typu wyniku (od niego zależy Faza 2):

```ts
export type StateSelection =
  | { kind: "subfilter"; opstatus: OperationalStatus | undefined } // tylko gdy ctx.view === "active"
  | { kind: "navigate"; href: string };                            // pozostałe przypadki
```

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Testy jednostkowe przechodzą: `npm run test`
- Linting przechodzi: `npm run lint`
- Build/typecheck przechodzi: `npm run build`

#### Weryfikacja ręczna:

- Przegląd `state-filter.test.ts` potwierdza pokrycie matrycy: 6 pozycji × strony źródłowe
  (active / done|cancelled / trash), w tym: „Nowe" z active → `subfilter{new}`; „Nowe" z trash →
  `navigate` na `/items/active?opstatus=new` (+ `type` gdy ustawiony); „Zakończone" → `navigate`
  bez `opstatus`; `stateSelectValue` dla wszystkich `view`×`opstatus`.

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu automatów, zatrzymaj się na ręczne
potwierdzenie przed Fazą 2.

---

## Faza 2: Komponent `StateFilterSelect` + podpięcie 3 wysp

### Przegląd

Przemianować i rozszerzyć rozwijaną listę tak, by renderowała 6 pozycji i działała przez logikę z
Fazy 1. Podpiąć w trzech wyspach. Pigułki **zostają** — tymczasowa koegzystencja do weryfikacji
parytetu.

### Wymagane zmiany:

#### 1. Rename + rozszerzenie komponentu

**Plik**: `src/components/items/EntriesViewSelect.tsx` → `src/components/items/StateFilterSelect.tsx`

**Cel**: Jedna kontrolka stanu z 6 pozycjami i heterogenicznym wyborem. Na pozycję aktywną gdy jesteśmy
na active — kliencki podfiltr przez callback; w pozostałych przypadkach — pełna nawigacja.

**Kontrakt**: Props `{ view: MainView; type: TypeFilterValue; opstatus: OperationalStatus | undefined;
onSelectActiveSubfilter?: (opstatus: OperationalStatus | undefined) => void }`. `value` triggera =
`stateSelectValue(view, opstatus)`. `onValueChange` woła `resolveStateSelection`; dla `kind==="subfilter"`
wywołuje `onSelectActiveSubfilter?.(opstatus)`, dla `kind==="navigate"` — `window.location.assign(href)`.
Renderuje 6 `SelectItem` z modelu Fazy 1 (płasko, bez separatora). Trigger rozszerzony/dopasowany do
„Wszystko aktywne"; `aria-label` zmienione na oddające filtr stanu (np. „Filtr stanu wpisów").

#### 2. Podpięcie w wyspie accepted

**Plik**: `src/components/items/AcceptedItemsView.tsx`

**Cel**: Przekazać do kontrolki bieżący `opstatus` i callback klienckiego podfiltra, replikujący
dzisiejszą ścieżkę pigułek (czyszczenie zaznaczenia + reset strony).

**Kontrakt**: Import i JSX `EntriesViewSelect`→`StateFilterSelect` (`:10,319`). Przekazać
`opstatus={criteria.opstatus}` oraz `onSelectActiveSubfilter={(opstatus) =>
applyCriteria(resetToFirstPage({ ...criteria, opstatus }))}`.

#### 3. Podpięcie w wyspie kosza

**Plik**: `src/components/items/TrashItemsView.tsx`

**Cel**: Przełączyć na nowy komponent; na trash pozycje aktywne rozwiązują się do nawigacji, więc
callback jest zbędny.

**Kontrakt**: Import i JSX (`:6,209`) na `StateFilterSelect`; przekazać `opstatus={undefined}` (Kosz nie
ma podfiltra operacyjnego); `onSelectActiveSubfilter` pominięte.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Istniejące testy przechodzą: `npm run test`
- Linting przechodzi: `npm run lint`
- Build/typecheck przechodzi: `npm run build`

#### Weryfikacja ręczna:

- `/items/active`: lista pokazuje 6 pozycji w kolejności cyklu życia; „Nowe"/„W toku" zawęża **bez
  przeładowania**, adres dostaje `?opstatus=`; „Wszystko aktywne" czyści podfiltr.
- Parytet: „Nowe" z listy zawęża identycznie jak pigułka „Nowe" (obie widoczne w tej fazie).
- Z `/items/done` i `/items/trash`: wybór „Nowe" nawiguje na `/items/active?opstatus=new`, niosąc
  aktywny `?type=`; wybór „Zakończone/Anulowane/Kosz" nawiguje jak dziś (z `?type=`).
- Zmiana podfiltra czyści zaznaczenie i wraca na stronę 1.
- Trigger mieści „Wszystko aktywne" bez ucięcia.

**Uwaga implementacyjna**: Zatrzymaj się na ręczne potwierdzenie parytetu przed Fazą 3.

---

## Faza 3: Usunięcie pigułek `OperationalSubFilter`

### Przegląd

Zdjąć teraz-zbędne pigułki. Po tej fazie jedyną kontrolką stanu jest rozwijana lista.

### Wymagane zmiany:

#### 1. Usunięcie renderu pigułek z paska filtrów

**Plik**: `src/components/items/ListFilterBar.tsx`

**Cel**: Usunąć podfiltr operacyjny z pierwszego rzędu; oś stanu obsługuje już `StateFilterSelect`
w slocie `leading`.

**Kontrakt**: Usunąć import `OperationalSubFilter` (`:3`) i cały blok `criteria.view === "active" && (…)`
(`:95-102`). Zaktualizować komentarze rzędu kategorii (`:53-57,86`), które wymieniają podfiltr stanu.

#### 2. Skasowanie osieroconego komponentu

**Plik**: `src/components/items/OperationalSubFilter.tsx` (usunięcie)

**Cel**: Usunąć martwy plik po odpięciu jego jedynego konsumenta.

**Kontrakt**: Plik usunięty; brak pozostałych referencji w `src/`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Brak referencji: `grep -r OperationalSubFilter src/` nic nie zwraca.
- Testy przechodzą: `npm run test`
- Linting przechodzi: `npm run lint`
- Build/typecheck przechodzi: `npm run build`

#### Weryfikacja ręczna:

- Pigułki zniknęły z `/items/active`; jedyna kontrolka stanu to rozwijana lista.
- Pełny obieg jeszcze raz: podfiltr aktywny, nawigacje widoków, „Wyczyść filtry" resetuje do
  „Wszystko aktywne".
- Brak regresji w filtrze rodzaju / sortowaniu / wyszukiwaniu.

---

## Strategia testowania

### Testy jednostkowe (`state-filter.test.ts`, Faza 1):

- `resolveStateSelection` dla 6 pozycji ze stron źródłowych active / done / trash — poprawny
  `kind` i `href`/`opstatus`.
- Niesienie `type` w `href` (i pominięcie gdy `all`); pominięcie `opstatus` przy nawigacji na widoki
  inne niż active (przez `criteriaToQuery`).
- `stateSelectValue` dla wszystkich `view`×`opstatus`.

### Testy integracyjne:

- Brak nowych — zmiana jest w warstwie prezentacji; istniejące testy `list-criteria`/`useItemList`
  pokrywają kontrakt `opstatus`/URL, który zostaje bez zmian.

### Kroki testowania ręcznego:

1. Na `/items/active` przełącz „Nowe" i „W toku" — lista zawęża bez przeładowania, URL ma `?opstatus=`.
2. Z `/items/trash` wybierz „Nowe" — ląduje na `/items/active?opstatus=new` z niesionym `?type=`.
3. Wybierz „Zakończone", potem „Kosz" — pełne nawigacje z zachowanym `?type=`.
4. „Wyczyść filtry" na zawężonej liście — wraca do „Wszystko aktywne".

## Uwagi dotyczące wydajności

Brak. Zmiana czysto prezentacyjna; liczba żądań i ich kształt bez zmian (te same ścieżki
`setCriteria`/nawigacji co dziś).

## Uwagi dotyczące migracji

Brak migracji danych ani zmian API. Adresy z `?opstatus=` pozostają kompatybilne (parser bez zmian).

## Referencje

- Ramka: `context/changes/flatten-entries-state-filter/frame.md`
- Kontrolka widoku: `src/components/items/EntriesViewSelect.tsx:13-37`
- Pigułki podfiltra: `src/components/items/OperationalSubFilter.tsx:12-19`
- Pasek filtrów: `src/components/items/ListFilterBar.tsx:95-102`
- Kryteria + serializacja URL: `src/lib/services/list-criteria.ts:127,139-156`
- Zapis URL po fetchu: `src/components/hooks/useItemList.ts:180-185`
- Kolejność cyklu życia: `src/components/items/AcceptedItemsView.tsx:49`
- Predykat widoku: `src/components/items/operational-view.ts:15-20`

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po zakończeniu kroku.
> Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Czysta logika filtra stanu + testy

#### Automatyczne

- [x] 1.1 Testy jednostkowe przechodzą: `npm run test` — 3e36a56
- [x] 1.2 Linting przechodzi: `npm run lint` — 3e36a56
- [x] 1.3 Build/typecheck przechodzi: `npm run build` — 3e36a56

#### Ręczne

- [ ] 1.4 Przegląd `state-filter.test.ts` potwierdza pokrycie matrycy 6 pozycji × strony źródłowe

### Faza 2: Komponent `StateFilterSelect` + podpięcie 3 wysp

#### Automatyczne

- [x] 2.1 Istniejące testy przechodzą: `npm run test` — e827e0c
- [x] 2.2 Linting przechodzi: `npm run lint` — e827e0c
- [x] 2.3 Build/typecheck przechodzi: `npm run build` — e827e0c

#### Ręczne

- [ ] 2.4 `/items/active`: 6 pozycji w kolejności; „Nowe"/„W toku" zawęża bez przeładowania, URL ma `?opstatus=`
- [ ] 2.5 Parytet „Nowe" z listy == „Nowe" z pigułki (obie widoczne)
- [ ] 2.6 Z done/trash „Nowe" nawiguje na `/items/active?opstatus=new` z niesionym `?type=`; „Zakończone/Anulowane/Kosz" nawiguje z `?type=`
- [ ] 2.7 Zmiana podfiltra czyści zaznaczenie i wraca na stronę 1; trigger mieści „Wszystko aktywne"

### Faza 3: Usunięcie pigułek `OperationalSubFilter`

#### Automatyczne

- [x] 3.1 Brak referencji: `grep -r OperationalSubFilter src/` pusty
- [x] 3.2 Testy przechodzą: `npm run test`
- [x] 3.3 Linting przechodzi: `npm run lint`
- [x] 3.4 Build/typecheck przechodzi: `npm run build`

#### Ręczne

- [ ] 3.5 Pigułki zniknęły; jedyna kontrolka stanu to rozwijana lista
- [ ] 3.6 Pełny obieg (podfiltr, nawigacje, „Wyczyść filtry" → „Wszystko aktywne") bez regresji rodzaju/sortu/szukania
