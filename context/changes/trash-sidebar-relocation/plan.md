# Kosz jako osobne miejsce w panelu bocznym — Plan implementacji

## Przegląd

Przenosimy „Kosz" z osi stanu strony „Wpisy" do panelu bocznego jako osobne miejsce w grupie „Biblioteka", a jego pozycja w sidebarze dostaje ikonę odzwierciedlającą stan (pusty kosz vs kosz z zawartością). Oś „Wpisów" zostaje wtedy czystym cyklem życia. Zmiana jest **czysto prezentacyjna / IA** — trasa `/items/trash`, zapytania listy, przywracanie i „Wyczyść kosz" pozostają nietknięte. Pochodzenie itemu (odrzucone / usunięte) nadal niesie badge na karcie; osobny filtr pochodzenia pozostaje poza zakresem.

## Analiza stanu obecnego

- **Oś stanu** żyje w czystym module `src/components/items/state-filter.ts` (`STATE_FILTER_OPTIONS`, 6 pozycji, `:50` to „Kosz") i renderuje się przez `StateFilterSelect.tsx` osadzony w dwóch wyspach: `AcceptedItemsView.tsx:317` (active/done/cancelled) oraz `TrashItemsView.tsx:215` (strona Kosza, z podświetleniem „Kosz").
- **Sidebar** to statyczny `src/components/shell/AppSidebar.astro` (bez wyspy React). Grupa „Biblioteka" **już istnieje** („Wpisy" → `/items/active`, „Sesje importu" → `/import-sessions`). Pozycje to ręcznie wypisane literały `<a>`, nie struktura danych.
- **Podświetlanie aktywnej pozycji**: `src/components/shell/nav-active.ts` — `NAV_MATCHERS` (kolejność = priorytet, pierwsze trafienie wygrywa). Dziś `/items/trash` wpada w prefix `/items/` → świeci jako „Wpisy" (zamrożone testem `nav-active.test.ts:14`).
- **Ikony powłoki**: `src/components/shell/Icon.astro` — inline SVG w stylu lucide; typ `IconName` egzekwuje dozwolone warianty. **Nie ma wariantu kosza** (dostępne: `layers`, `tray`, `inbox`, `history`, `book`, `settings`, `log-out`).
- **Dane dynamiczne powłoki**: `src/layouts/AppLayout.astro:30-50` liczy `pendingCount` (count-only `head:true`) i `keyConfigured` w dwóch **sekwencyjnych** blokach `try/catch`, przekazuje je do `AppSidebar`. Ten sam wzorzec obsłuży wskaźnik kosza.
- **Precedens `pending`**: „Do akceptacji" jest wartością widoku z własną stroną (`/items`) i pozycją w sidebarze, ale nigdy nie było na osi stanu. Kosz idzie tą samą ścieżką 1:1.

## Pożądany stan końcowy

- „Kosz" ma własną pozycję w sidebarze (grupa „Biblioteka", między „Wpisy" a „Sesje importu"), podświetla się na trasie `/items/trash` i nigdzie indziej.
- Ikona Kosza w sidebarze pokazuje jego stan: **pusty kontur**, gdy kosz jest pusty, **kosz z zawartością**, gdy coś w nim jest. Stan liczony serwerowo, odświeżany przy nawigacji między stronami.
- Oś stanu na stronach „Wpisów" to 5 zakładek cyklu życia (Wszystko aktywne / Nowe / W toku / Zakończone / Anulowane) — bez „Kosza".
- Strona `/items/trash` nie renderuje osi stanu; filtr typu, lista, przywracanie i „Wyczyść kosz" działają dokładnie jak dziś.
- `ui-design-system.md` opisuje nową architekturę informacji (Kosz w „Bibliotece" ze wskaźnikiem, nie na osi).

Weryfikacja: `npm test` (zaktualizowane zamrożone testy zielone), `npm run lint`, `npm run build`, oraz ręczne przejście nawigacji i obu stanów ikony.

### Kluczowe odkrycia:

- Oś stanu żyje w wyspach React, nie w `.astro` (`state-filter.ts:39-51`, `StateFilterSelect.tsx`, osadzenie `TrashItemsView.tsx:215`) — dlatego usunięcie „trash" z modelu i wyjęcie `StateFilterSelect` z widoku Kosza **muszą iść razem**, inaczej strona Kosza pokaże 5 zakładek bez podświetlenia.
- `Icon.astro:7` — typ `IconName` egzekwuje warianty; dodanie ikony kosza wymaga rozszerzenia typu (inaczej błąd TS), nie tylko dopisania SVG.
- `nav-active.ts:21-27` — kolejność matcherów to priorytet; matcher `trash` (exact `/items/trash`) musi być **przed** prefixem `entries` (`/items/`).
- `AppLayout.astro:30-50` — wzorzec licznika (count-only `head:true`, błąd → wartość neutralna) jest gotowy do skopiowania na wskaźnik kosza; predykat kosza to `.in("acceptance_status", ["rejected","deleted"])`.
- Usunięcie „trash" z `STATE_FILTER_OPTIONS` **nie powoduje błędu TypeScript** — `MainView` zachowuje `"trash"` (trasa Kosza nadal go potrzebuje), efekt jest wyłącznie runtime/wizualny (`state-filter.ts`, `list-criteria.ts` bez zmian).

## Czego NIE robimy

- **Bez licznika kosza** (liczby) — tylko binarny wskaźnik pusty/niepusty przez ikonę.
- **Bez filtra pochodzenia** w widoku Kosza — rozróżnienie `rejected`/`deleted` zostaje na badge karty.
- **Bez zmian zachowania** — restore i „Wyczyść kosz" (`items-mutation.ts`), predykat listy (`items.ts:94`), trasa `/items/trash` (`trash.astro`), endpointy — nietknięte.
- **Bez zmian w bazie / RLS / migracji** — zero zmian schematu.
- **Bez reaktywnego sidebara na żywo** — wskaźnik odświeża się przy nawigacji (świadome ograniczenie, patrz niżej), nie natychmiast po akcji w wyspie.
- **Bez dotykania osi na stronach Wpisów poza usunięciem „Kosza"** — `AcceptedItemsView.tsx` nie zmienia kodu (zakładka znika sama).

## Podejście do implementacji

Trzy fazy w kolejności celowej: **najpierw Kosz zyskuje nowy punkt wejścia (sidebar ze wskaźnikiem), potem traci stary (oś), na końcu dokumentacja**. Dzięki temu nigdy nie ma momentu, gdy Kosz znika z nawigacji. Faza 1 buduje pełną pozycję Kosza w sidebarze jako jedną spójną, widoczną dla użytkownika całość (bez przejściowego stanu, w którym ikona nie odpowiada zawartości).

## Krytyczne szczegóły implementacji

- **Sekwencjonowanie (Faza 2):** usunięcie wiersza „trash" z `STATE_FILTER_OPTIONS` i wyjęcie `<StateFilterSelect>` z `TrashItemsView.tsx` to **jedna nierozdzielna zmiana**. Sam model bez wyjęcia z widoku zostawi oś Kosza wyrenderowaną z 5 zakładek, ale bez żadnej aktywnej (bo „trash" już nie ma dopasowania) — wizualnie zepsute.
- **Kolejność matcherów (Faza 1):** w `nav-active.ts` matcher `trash` (exact) MUSI trafić przed `entries` (prefix `/items/`). Wstawiony po nim nigdy nie zadziała — prefix złapie `/items/trash` pierwszy.
- **Specyfikacja UX — świeżość wskaźnika:** ikona kosza jest liczona serwerowo raz na render strony (jak `pendingCount`). Po „Wyczyść kosz" lub przywróceniu ostatniego elementu **na samej stronie Kosza** (akcja optimistic w wyspie, bez przeładowania) ikona nie zmieni się natychmiast — dopiero przy następnej nawigacji między stronami. To akceptowane, spójne z istniejącym licznikiem „Do akceptacji".

## Faza 1: Pozycja Kosza w sidebarze ze wskaźnikiem stanu

### Przegląd

Kosz dostaje pełną pozycję w sidebarze: ikonę (dwa warianty), link nawigacyjny z poprawnym podświetlaniem oraz wskaźnik pusty/niepusty zasilany lekkim odczytem serwerowym. Po tej fazie oś nadal ma zakładkę „Kosz" — przejściowa redundancja, nic nie jest zepsute.

### Wymagane zmiany:

#### 1. Ikona Kosza (dwa warianty)

**Plik**: `src/components/shell/Icon.astro`

**Cel**: Dodać ikonę kosza w dwóch wariantach — pusty i z zawartością — tak by sidebar mógł wizualnie sygnalizować stan.

**Kontrakt**: Rozszerz typ `IconName` (`:7`) o `"trash" | "trash-full"`. Dodaj dwa bloki `{ icon === "trash" && (…) }` i `{ icon === "trash-full" && (…) }` z `<path>` w stylu lucide (pokrywa + korpus kosza; wariant `trash-full` z widocznym sygnałem zawartości, np. wypełnione/zaznaczone wnętrze). Zachowaj konwencję pliku: realne `<path>` (bez `set:html`), dziedziczenie `currentColor`.

#### 2. Odczyt stanu kosza w powłoce

**Plik**: `src/layouts/AppLayout.astro`

**Cel**: Policzyć, czy kosz jest niepusty (wartość logiczna), i przekazać ją do sidebara — obok istniejących `pendingCount` i `keyConfigured`. Trzy odczyty zrównoleglić przez `Promise.all` (dziś są dwa sekwencyjne).

**Kontrakt**: Nowa zmienna `trashHasItems: boolean` (domyślnie `false` przy błędzie/braku usera). Zapytanie count-only wzorem licznika pending, z predykatem kosza `.in("acceptance_status", ["rejected", "deleted"])`, zredukowane do `(count ?? 0) > 0`. Blok `:30-50` przepisany na jeden `Promise.all` z fallbackiem **per odczyt** (jeden błąd nie może wywalić pozostałych). Przekazać `trashHasItems` do `<AppSidebar>` (`:55-60`).

```ts
// Promise.all odrzuca całość przy pierwszym rejectcie — dlatego catch PER odczyt,
// nie jeden wspólny try wokół all. Każdy odczyt sam degraduje do wartości neutralnej.
const [pendingCount, trashHasItems, keyConfigured] = await Promise.all([
  supabase.from("items").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).eq("acceptance_status", "pending")
    .then(({ count }) => count ?? 0).catch(() => 0),
  supabase.from("items").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).in("acceptance_status", ["rejected", "deleted"])
    .then(({ count }) => (count ?? 0) > 0).catch(() => false),
  getKeyStatus(supabase, user.id).then((s) => s.configured).catch(() => false),
]);
```

#### 3. Pozycja „Kosz" w sidebarze

**Plik**: `src/components/shell/AppSidebar.astro`

**Cel**: Dodać link „Kosz" w grupie „Biblioteka" i wybrać wariant ikony wg stanu kosza.

**Kontrakt**: Interfejs `Props` (`:9-14`) rośnie o `trashHasItems: boolean`. Nowy `<a href="/items/trash">` wstawiony między „Wpisy" (`:82-90`) a „Sesje importu" (`:91`), wzorowany 1:1 na „Wpisy”: `class:list={[navLayout, active === "trash" ? navOn : navIdle]}`, `aria-current={active === "trash" ? "page" : undefined}`, `aria-label="Kosz"`, label „Kosz”, `<Icon icon={trashHasItems ? "trash-full" : "trash"} size={17} class="shrink-0" />`. Kolejność w grupie: Wpisy → Kosz → Sesje importu.

#### 4. Matcher aktywności dla Kosza

**Plik**: `src/components/shell/nav-active.ts`

**Cel**: Sprawić, by `/items/trash` podświetlał „Kosz", a nie „Wpisy".

**Kontrakt**: Dodać `{ id: "trash", match: { type: "exact", path: "/items/trash" } }` do `NAV_MATCHERS` **między** `pending` (`:23`) a `entries` (`:24`) — exact przed prefixem `/items/`. Zaktualizować komentarz nagłówkowy (`:2-4`), który dziś wymienia `trash` jako część grupy „Wpisy".

#### 5. Test matchera

**Plik**: `src/components/shell/nav-active.test.ts`

**Cel**: Odzwierciedlić nowy kontrakt: `/items/trash` → „trash".

**Kontrakt** (zamrożony test — legalna zmiana): Usuń asercję `expect(activeNavId("/items/trash")).toBe("entries")` z bloku „grupa Wpisy" (`:14`). Dodaj asercję `expect(activeNavId("/items/trash")).toBe("trash")` (np. w bloku mapowań pozycji na id). Pozostałe zakresy Wpisów (`active`/`done`/`cancelled`) nadal „entries".

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Testy jednostkowe przechodzą: `npm test`
- Sprawdzanie typów / build przechodzi: `npm run build`
- Linting przechodzi (po edycji `.astro`): `npm run lint`

#### Weryfikacja ręczna:

- „Kosz" widoczny w sidebarze w grupie „Biblioteka", w kolejności Wpisy → Kosz → Sesje importu
- Wejście na `/items/trash` podświetla „Kosz" (a nie „Wpisy")
- Ikona Kosza pokazuje wariant „pełny", gdy w koszu są elementy, i „pusty", gdy kosz jest pusty (sprawdzić oba stany)
- Po opróżnieniu kosza i przejściu na inną stronę ikona zmienia się na „pusty" (odświeżenie przy nawigacji)
- Sidebar zwężony do ikon (≤920 px) — ikona Kosza czytelna w obu wariantach

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu automatycznych weryfikacji, zatrzymaj się na ręczne potwierdzenie (oba stany ikony, podświetlanie) przed Fazą 2.

---

## Faza 2: Wyjęcie Kosza z osi stanu

### Przegląd

Usuwamy „Kosz" z modelu osi i z widoku Kosza (razem), a zamrożony test osi dostosowujemy do 5 pozycji. Po tej fazie oś Wpisów to czysty cykl życia, a Kosz jest osiągalny wyłącznie z sidebara.

### Wymagane zmiany:

#### 1. Model osi stanu

**Plik**: `src/components/items/state-filter.ts`

**Cel**: Usunąć „Kosz" jako pozycję osi; oś schodzi do 5 zakładek.

**Kontrakt**: Usuń wiersz `:50` (`{ value: "trash", label: "Kosz", view: "trash", opstatus: undefined }`) — `STATE_FILTER_OPTIONS` → 5 pozycji. Zaktualizuj komentarze mówiące o „sześciu pozycjach" / „zwieńczone Koszem" (`:2-3`, `:7-8`, `:32-37`) oraz komentarz `StateFilterSelect.tsx:2` („każda z 6 pozycji" → „5 pozycji"). Funkcje `navigateHref` i `stateSelectValue` **bez zmian** (`MainView` zachowuje `"trash"` dla trasy Kosza).

#### 2. Widok Kosza — usunięcie osi

**Plik**: `src/components/items/TrashItemsView.tsx`

**Cel**: Zdjąć oś stanu ze strony Kosza (idzie w parze z usunięciem z modelu).

**Kontrakt**: Usuń import `StateFilterSelect` (`:8`) i jego użycie `<StateFilterSelect view="trash" type={criteria.type} opstatus={undefined} />` (`:215`) wraz z komentarzem opisującym zakładki zakresu (`:213-214`). Reszta nieruchomego paska (`ListFilterBar`, pasek zaznaczania) oraz badge pochodzenia (`:286`) i komentarz właścicielski o braku filtra statusu (`:55-60`) **zostają**.

#### 3. Zamrożony test osi

**Plik**: `src/components/items/state-filter.test.ts`

**Cel**: Dostosować test do 5-pozycyjnej osi bez „trash" i usunąć asercje `stateSelectValue("trash", …)`.

**Kontrakt** (zamrożony test — legalna zmiana): Usuń `"trash"` z asercji wartości (`:7-15`) i etykiet (`:18-26`); tytuł „to 6 pozycji" → „5 pozycji". W asercji `view !== "active"` (`:34-38`) `["done","cancelled","trash"]` → `["done","cancelled"]`. Usuń dwie asercje `stateSelectValue("trash", …)` (`:52`, `:57`). Test round-trip (`:60-64`) iteruje po modelu — dostosuje się sam, bez zmian w kodzie.

#### 4. Oś na stronach Wpisów

**Plik**: `src/components/items/AcceptedItemsView.tsx`

**Cel**: Potwierdzić brak zmian — zakładka „Kosz" znika z wyrenderowanego rzędu automatycznie po usunięciu z modelu.

**Kontrakt**: Bez zmian kodu (`:317` renderuje `STATE_FILTER_OPTIONS`, które są już krótsze).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Testy jednostkowe przechodzą: `npm test` (zaktualizowany `state-filter.test.ts`; testy trasy/zachowania Kosza — `list-criteria.test.ts`, `items.test.ts`, `useItemList.test.ts` — nadal zielone)
- Sprawdzanie typów / build przechodzi: `npm run build`
- Linting przechodzi: `npm run lint`

#### Weryfikacja ręczna:

- Oś na `/items/active`, `/items/done`, `/items/cancelled` pokazuje 5 zakładek (Wszystko aktywne / Nowe / W toku / Zakończone / Anulowane), bez „Kosz"
- Strona `/items/trash` nie renderuje osi stanu; filtr typu, lista, „Zaznacz wszystkie", „Przywróć zaznaczone" i „Wyczyść kosz" działają jak dotąd
- Kosz nadal osiągalny z sidebara; trasa `/items/trash` renderuje się poprawnie
- Przywracanie (`deleted→accepted`, `rejected→pending`) i „Wyczyść kosz" bez zmian zachowania

**Uwaga implementacyjna**: Po automatycznych weryfikacjach zatrzymaj się na ręczne potwierdzenie (oś 5 zakładek, strona Kosza bez osi, zachowanie nietknięte) przed Fazą 3.

---

## Faza 3: Aktualizacja dokumentu IA

### Przegląd

Doprowadzamy `ui-design-system.md` do zgodności z nową architekturą informacji: Kosz w „Bibliotece" ze wskaźnikiem stanu, poza osią zakresu.

### Wymagane zmiany:

#### 1. Opis powłoki nawigacyjnej

**Plik**: `context/foundation/ui-design-system.md`

**Cel**: Opisać Kosz jako osobne miejsce w „Bibliotece" (ze wskaźnikiem pusty/pełny) i zdjąć go z opisu osi zakresu oraz z mapowania tras Wpisów.

**Kontrakt** (edycja czysto tekstowa):
- Linia 79 (grupa „Biblioteka") — dodać „Kosz" (z ikoną-wskaźnikiem pusty/niepusty); przy okazji usunąć nieistniejący już „Dziennik" (usunięty w S-15).
- Linia 81 („Zakładki zakresu … / Kosz") — zaktualizować całą listę do 5 zakładek cyklu życia (Wszystko aktywne / Nowe / W toku / Zakończone / Anulowane) i usunąć „— z licznikami" (płaska oś ich nie ma — dług sprzed S-15).
- Linia 85 (mapowanie tras) — usunąć `trash` z zakładek Wpisów (`/items/done|cancelled|trash` → `/items/done|cancelled`) i dodać osobne mapowanie „Kosz → `/items/trash`".

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Format markdown przechodzi (celowany): `npx prettier --check context/foundation/ui-design-system.md`

#### Weryfikacja ręczna:

- Opis powłoki w `ui-design-system.md` zgodny z zaimplementowaną nawigacją: Kosz w „Bibliotece" ze wskaźnikiem, brak „Kosza" w opisie osi zakresu i w mapowaniu tras Wpisów

---

## Strategia testowania

### Testy jednostkowe:

- `nav-active.test.ts` — `/items/trash` → „trash"; pozostałe zakresy `/items/*` → „entries" (zamrożony, legalna zmiana)
- `state-filter.test.ts` — 5-pozycyjny model osi bez „trash"; brak asercji `stateSelectValue("trash", …)` (zamrożony, legalna zmiana)
- Bez nowych testów dla wskaźnika kosza (logika to jeden odczyt count-only w layoutcie; weryfikacja ręczna obu stanów)

### Testy integracyjne:

- Brak nowych — trasa `/items/trash`, predykat listy i zachowanie (restore/empty) nie zmieniają się; istniejące testy trasy/zachowania muszą pozostać zielone

### Kroki testowania ręcznego:

1. Zaseeduj kosz co najmniej jednym elementem → sidebar pokazuje ikonę „pełny"; wejdź na `/items/trash` → podświetla „Kosz"
2. „Wyczyść kosz" → przejdź na inną stronę → ikona sidebara zmienia się na „pusty"
3. Otwórz `/items/active` → oś ma 5 zakładek bez „Kosza"; `/items/trash` → brak osi, filtr typu i przywracanie działają
4. Zwężony sidebar (≤920 px) → ikona Kosza czytelna w obu wariantach

## Uwagi dotyczące wydajności

Faza 1 dokłada jeden odczyt count-only (`head:true`, bez pobierania wierszy) w `AppLayout.astro`, który owija wszystkie chronione strony — koszt marginalny, identyczny jak istniejący licznik „Do akceptacji". Zrównoleglenie trzech odczytów przez `Promise.all` (dziś dwa sekwencyjne) może wręcz skrócić łączny czas renderu powłoki. Bez zmian w bazie/RLS/serwisach.

## Uwagi dotyczące migracji

Brak. Zero zmian schematu, danych ani polityk RLS.

## Referencje

- Powiązane badania: `context/changes/trash-sidebar-relocation/research.md`
- Wzorzec licznika w powłoce: `src/layouts/AppLayout.astro:30-50`
- Precedens „wartość widoku + pozycja w sidebarze, bez zakładki na osi": `pending` (`AppSidebar.astro:58-73`)
- Model osi: `src/components/items/state-filter.ts:39-51`; render: `StateFilterSelect.tsx`
- Zachowanie Kosza (bez zmian): `src/lib/services/items-mutation.ts:170-191` (restore), `:200-209` (empty)
- Lekcja: brak top-level `return` we `.astro`; `npm run lint` po edycji `.astro` (`context/foundation/lessons.md`)

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po zakończeniu kroku. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Pozycja Kosza w sidebarze ze wskaźnikiem stanu

#### Automatyczne

- [x] 1.1 Testy jednostkowe przechodzą: `npm test` — ed4d9a1
- [x] 1.2 Sprawdzanie typów / build przechodzi: `npm run build` — ed4d9a1
- [x] 1.3 Linting przechodzi (po edycji `.astro`): `npm run lint` — ed4d9a1

#### Ręczne

- [ ] 1.4 „Kosz" widoczny w „Bibliotece", kolejność Wpisy → Kosz → Sesje importu
- [ ] 1.5 `/items/trash` podświetla „Kosz", nie „Wpisy"
- [ ] 1.6 Ikona: wariant „pełny" gdy kosz niepusty, „pusty" gdy pusty (oba stany)
- [ ] 1.7 Po opróżnieniu i nawigacji ikona zmienia się na „pusty"
- [ ] 1.8 Zwężony sidebar (≤920 px) — ikona Kosza czytelna

### Faza 2: Wyjęcie Kosza z osi stanu

#### Automatyczne

- [x] 2.1 Testy jednostkowe przechodzą: `npm test` (state-filter + testy trasy/zachowania Kosza)
- [x] 2.2 Sprawdzanie typów / build przechodzi: `npm run build`
- [x] 2.3 Linting przechodzi: `npm run lint`

#### Ręczne

- [ ] 2.4 Oś Wpisów to 5 zakładek bez „Kosza"
- [ ] 2.5 `/items/trash` bez osi; filtr typu, lista, przywracanie, „Wyczyść kosz" działają
- [ ] 2.6 Kosz osiągalny z sidebara; trasa renderuje się poprawnie
- [ ] 2.7 Restore i „Wyczyść kosz" bez zmian zachowania

### Faza 3: Aktualizacja dokumentu IA

#### Automatyczne

- [ ] 3.1 Format markdown przechodzi (celowany): `npx prettier --check context/foundation/ui-design-system.md`

#### Ręczne

- [ ] 3.2 Opis powłoki zgodny z nową IA (Kosz w „Bibliotece" ze wskaźnikiem; brak „Kosza" na osi zakresu)
