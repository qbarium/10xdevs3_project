---
date: 2026-08-06T14:59:31+02:00
researcher: Jakub
git_commit: c938d4095fb2fc0d319f3dfed324a6b7fee3fdd1
branch: main
repository: qbarium/10xdevs3_project
topic: "S-16 trash-sidebar-relocation — relokacja Kosza do panelu bocznego"
tags: [research, codebase, trash, sidebar, state-filter, information-architecture]
status: complete
last_updated: 2026-08-06
last_updated_by: Jakub
last_updated_note: "Zdjęto filtr pochodzenia z zakresu S-16 (decyzja użytkownika 2026-08-06) — pochodzenie zostaje na badge karty. Usunięto wątek filtra; research to teraz relokacja + licznik."
---

# Research: S-16 — Kosz jako osobne miejsce w panelu bocznym

**Date**: 2026-08-06T14:59:31+02:00
**Researcher**: Jakub
**Git Commit**: c938d4095fb2fc0d319f3dfed324a6b7fee3fdd1
**Branch**: main
**Repository**: qbarium/10xdevs3_project

## Research Question

Zbadać bazę kodu pod slice **S-16 (`trash-sidebar-relocation`)**: przeniesienie „Kosza" z osi stanu strony „Wpisy" do panelu bocznego jako osobnego miejsca (grupa „Biblioteka"). Zmiana **czysto prezentacyjna / IA — bez zmian zachowania**. Zmapować wszystkie punkty styku dla `/10x-plan` i rozstrzygnąć niewiadomą o liczniku kosza.

> **Uszczegółowienie zakresu (2026-08-06):** pierwotny brief S-16 zawierał też **filtr pochodzenia** w widoku Kosza (Wszystko / Odrzucone / Usunięte). Po badaniu i decyzji użytkownika filtr został **zdjęty z zakresu** — pochodzenie (`rejected`/`deleted`) pozostaje widoczne przez **badge na karcie** (jak dziś), bez kontrolki zawężającej. Ten dokument odzwierciedla już węższy zakres; sekcje o wpięciu filtra pochodzenia usunięto.

## Summary

Zmiana jest **architektonicznie dobrze ugruntowana i niskiego ryzyka**. Kluczowy wniosek: istnieje gotowy precedens — **`pending` („Do akceptacji")** jest wartością `MainView`, ma własną stronę (`/items`) i własną pozycję w sidebarze, ale **nigdy nie był na osi stanu** (`STATE_FILTER_OPTIONS`). „Kosz" po S-16 idzie dokładnie tą samą ścieżką: zostaje wartością `MainView` z własną trasą `/items/trash`, dostaje pozycję w sidebarze i **znika z osi stanu**.

Po zdjęciu filtra pochodzenia praca rozpada się na trzy wątki:

1. **Wyjęcie „Kosza" z osi stanu** — wąski blast radius. Usunięcie jednego wiersza w `state-filter.ts:50`, legalna zmiana **zamrożonego testu** `state-filter.test.ts`, oraz — to sedno — **usunięcie `StateFilterSelect` z `TrashItemsView.tsx:215`** (inaczej strona Kosza pokaże 5 zakładek bez podświetlenia). `list-criteria.ts`, `items.ts`, trasa i zachowanie Kosza **nie zmieniają się**.
2. **Dodanie „Kosza" do sidebara** — grupa „Biblioteka" **już istnieje** (`AppSidebar.astro`); to jeden dodatkowy `<a>` link + nowy matcher aktywności w `nav-active.ts` (i aktualizacja jego zamrożonego testu `nav-active.test.ts:14`, bo dziś `/items/trash` świeci jako „Wpisy").
3. **Licznik kosza (niewiadoma)** — **technicznie tani**, analogiczny 1:1 do licznika „Do akceptacji" (jedno lekkie zapytanie `count/head:true` w `AppLayout.astro`). Decyzja jest **produktowa, nie kosztowa**.

Widok Kosza **zostaje bez zmian merytorycznych**: jeden wór, per-wierszowy badge „Odrzucone"/„Usunięte", zawężanie tylko filtrem typu — dokładnie jak dziś. Zachowanie (restore, „Wyczyść kosz") jest origin-agnostyczne i **zostaje nietknięte**.

Uwaga historyczna: filtr pochodzenia był zaprojektowany w S-06 i **świadomie wycięty** (scope-down 2026-06-19). S-16 **utrzymuje tę decyzję** — badge wystarcza, filtr pozostaje poza zakresem.

## Detailed Findings

### 1. Oś stanu i `state-filter` — blast radius wyjęcia „trash"

**Gdzie żyje oś.** Logika osi jest w czystym module `src/components/items/state-filter.ts`, a renderuje ją komponent `src/components/items/StateFilterSelect.tsx` (płaski `<nav>` z 6 zakładkami-linkami `<a href>` po `STATE_FILTER_OPTIONS.map`). Oś **nie jest w `.astro`/layoutcie** — jest osadzona wewnątrz **dwóch wysp React**:

- `AcceptedItemsView.tsx:317` — dla stron `active`/`done`/`cancelled`.
- `TrashItemsView.tsx:215` — dla strony `trash`, z podświetleniem na „Koszu".

**Blast radius jest bardzo wąski.** `navigateHref` i typ `StateFilterOption` mają **dokładnie po jednym konsumencie** (`StateFilterSelect.tsx`). Sam `StateFilterSelect` konsumują tylko `AcceptedItemsView.tsx` i `TrashItemsView.tsx`. Poza tym: tylko zamrożony test.

**`MainView`/"trash" w `list-criteria.ts` — NIE wymaga zmian.** `MainView` (`:21`) zawiera `"trash"`; `MAIN_VIEWS` (`:24`) zasila runtime-guard `isMainView` (`:83`), którym **tylko endpoint** waliduje surowy `?view=`. Traktowanie trash jest **generyczne** — nigdzie nie ma gałęzi `view === "trash"` w tym pliku (`defaultSort` wrzuca trash do „else"; `opstatus` honorowany tylko dla `active`). Usunięcie „trash" z osi **nie rusza** `list-criteria.ts` — trasa/route/endpoint Kosza nadal potrzebują wartości `"trash"`.

**Bezpieczeństwo typów:** usunięcie elementu z `STATE_FILTER_OPTIONS` **nie powoduje żadnego błędu TypeScript** — `stateSelectValue` nadal zwraca `view` dla nie-active, a `MainView` zachowuje `"trash"`. Efekt jest wyłącznie runtime/wizualny.

**Precedens `pending`.** `pending` jest w `MainView`, ma własną stronę (`/items`, „Do akceptacji") i pozycję w sidebarze, ale **nigdy nie był w `STATE_FILTER_OPTIONS`**. To dowód, że „wartość `MainView` z własną stroną + wpisem w sidebarze, bez zakładki na osi" to już działający wzorzec — Kosz idzie nim 1:1.

**Terminologia — pułapka:** `"trash"` istnieje też jako **akcja** bulk (move-to-trash) w `lib/validation/items.ts:21`, `useItemMutation.ts`, `AcceptedItemsView.tsx`, `api/items/bulk.ts`, e2e. To **inny byt** niż widok — wyjęcie z osi go nie dotyka.

**Dokładna powierzchnia zmiany (rdzeń — wyjęcie z osi):**

| Plik | Linie | Zmiana |
| --- | --- | --- |
| `state-filter.ts` | `:50` | Usuń wiersz `{ value: "trash", label: "Kosz", view: "trash", opstatus: undefined }`. Tablica → 5 pozycji. |
| `state-filter.ts` | `:2-3, 7-8, 32-37` | Kosmetyka komentarzy („6 pozycji", „zwieńczone Koszem"). |
| `StateFilterSelect.tsx` | `:2` | Kosmetyka komentarza. |
| `state-filter.test.ts` | `:7-15` | **Zamrożony test** — usuń `"trash"` z wartości; tytuł „6 pozycji" → 5. |
| `state-filter.test.ts` | `:18-26` | Usuń `"Kosz"` z etykiet. |
| `state-filter.test.ts` | `:34-38` | `view !== "active"` z `["done","cancelled","trash"]` → `["done","cancelled"]`. |
| `state-filter.test.ts` | `:52, :57` | `stateSelectValue("trash", …)` — mechanicznie **nadal przechodzą** (funkcja bez zmian); decyzja: zostawić czy usunąć (semantycznie zgrzytają). |
| `TrashItemsView.tsx` | `:215, :8, :213-215` | **KLUCZOWE:** usuń użycie `<StateFilterSelect view="trash" …>`, import i komentarz — inaczej oś Kosza pokaże 5 zakładek **bez podświetlenia**. |
| `AcceptedItemsView.tsx` | `:317` | **Bez zmiany kodu** — zakładka „Kosz" po prostu znika z wyrenderowanego rzędu. |

**Nietknięte przez wyjęcie z osi (route + zachowanie Kosza zostają):** `list-criteria.ts` (`MainView`/`MAIN_VIEWS`), `items.ts:94`, `trash.astro`, `useItemList("trash")`, akcja bulk „trash", testy widoku trash (`list-criteria.test.ts`, `items.test.ts`, `useItemList.test.ts`, `api/items/index.test.ts`).

### 2. Sidebar / powłoka i wpięcie „Kosza"

**Komponent:** `src/components/shell/AppSidebar.astro` — statyczny Astro (bez wyspy React), props `pathname`, `pendingCount`, `keyConfigured`, `userEmail`. **Pozycje nawigacji to ręcznie wypisane literały `<a>`, NIE struktura danych** (żadnej tablicy `NAV_ITEMS`). Grupy to `<div>` z nagłówkiem-etykietą. Układ:

- **CTA:** „Skrzynka wejściowa" → `/ingest` (`:39-50`).
- **Grupa „Przepływ"** (`:52-74`): „Do akceptacji" → `/items` + **badge licznika** (`:58-73`).
- **Grupa „Biblioteka"** (`:76-100`) — **JUŻ ISTNIEJE**: „Wpisy" → `/items/active` (`:82-90`), „Sesje importu" → `/import-sessions` (`:91-99`). (Pozycja „Dziennik" była tu w S-15, ale została usunięta jako martwy placeholder.)
- **Stopka** (`:102-134`): „Ustawienia", „Wyloguj się", kafelek konta.

**Podświetlanie aktywnej pozycji:** `src/components/shell/nav-active.ts`. `activeNavId(pathname)` (`:30-35`) dopasowuje do tablicy `NAV_MATCHERS` (`:21-27`) — **kolejność = priorytet, pierwsze trafienie wygrywa**; reguły `exact` (równość) lub `prefix` (`startsWith`). Dziś: `pending`→exact `/items`, `entries`→prefix `/items/`. **Skutek: `/items/trash` wpada w prefix `/items/` → świeci jako „Wpisy"** — zamrożone testem `nav-active.test.ts:14`.

**Punkt wstawienia „Kosza":**

| Plik | Miejsce | Zmiana |
| --- | --- | --- |
| `AppSidebar.astro` | między `:90` (koniec „Wpisy") a `:91` (start „Sesje importu") | Nowy `<a>` „Kosz" → `/items/trash`, wzorzec 1:1 z „Wpisy" (`:82-90`): `class:list={[navLayout, active === "trash" ? navOn : navIdle]}`, `aria-current`, ikona (potwierdzić dostępność np. `trash-2` w `Icon.astro`). Daje kolejność Wpisy → Kosz → Sesje importu. |
| `nav-active.ts` | między `:23` (`pending`) a `:24` (`entries`) | Nowy matcher `{ id: "trash", match: { type: "exact", path: "/items/trash" } }` — **exact musi być PRZED prefixem** `entries`. |
| `nav-active.test.ts` | `:14` | Zaktualizuj asercję (dziś `activeNavId("/items/trash") === "entries"`). |

### 3. Widok Kosza i routing — bez zmian merytorycznych

Po zdjęciu filtra pochodzenia S-16 **nie dotyka danych ani filtrowania Kosza** — jedyna zmiana w tym widoku to usunięcie osi stanu (§1). Poniżej stan bieżący jako kontekst dla planu (**wszystko zostaje**):

- **Widok:** `src/components/items/TrashItemsView.tsx` — interaktywna wyspa reużywająca wzorca `AcceptedItemsView` (selekcja, dim, dialog confirm, toast, filtr typu). Lista serwerowa przez `useItemList("trash", …)` (`:79`). Szukajka i „Wyczyść kosz" żyją w topbarze powłoki przez mostek `useItemTopbarBridge` (`:89-98`). Komentarz właścicielski `:55-60` („bez osobnego filtra statusu — decyzja 2026-06-19") **pozostaje aktualny** — S-16 go nie zmienia.
- **Routing:** **nie ma dynamicznej trasy `[view]`** — każdy widok to osobny statyczny `.astro`. `/items/trash` → `src/pages/items/trash.astro`; SSR czyta `parseListCriteria("trash", …)` (`:24`) i ładuje `listItems(...)` (`:35`). **Bez zmian.**
- **Zapytanie (jeden wór, bez zmian):** `src/lib/services/items.ts`, `listItems` (`:72-126`), predykat kosza `:94-96` = `query.in("acceptance_status", ["rejected", "deleted"])`.
- **Pochodzenie na badge (zostaje):** `acceptanceOriginLabel` (`src/lib/labels.ts:44-47, 77-80`, „Odrzucone"/„Usunięte") renderowane per-wiersz w `ItemCard.tsx:215-217`, włączane propem `badges.origin` (`:74`) tylko w Koszu (`TrashItemsView.tsx:286`). To jedyny nośnik rozróżnienia `rejected`/`deleted` — i to wystarcza (filtr zdjęty z zakresu).
- **`list-criteria.ts` bez zmian** — nie dochodzi żadne pole kryterium (patrz §1).

### 4. Licznik kosza — rozstrzygnięcie niewiadomej

**Jak działa licznik „Do akceptacji" (wzorzec):** liczony **inline w `src/layouts/AppLayout.astro` (`:30-43`)** — lekkie zapytanie count-only (`head: true`, bez pobierania wierszy), raz na render, klientem usera (RLS per-user):
```ts
supabase.from("items").select("id", { count: "exact", head: true })
  .eq("user_id", user.id).eq("acceptance_status", "pending")
```
Błąd → `0`. Przekazany jako `pendingCount` do `AppSidebar` (`:57`), renderowany jako inline badge (`AppSidebar.astro:66-72`).

**Werdykt: licznik kosza jest TANI.** Dodać drugie count-only query z filtrem `.in("acceptance_status", ["rejected","deleted"])` (predykat widoku `trash`), zapisać jako `trashCount`, przekazać nowym propsem do `AppSidebar` (interfejs `:9-14` + `:57`) i zrenderować kopią markupu badge'a. **Koszt marginalny = identyczny jak już zaakceptowany licznik pending** (jedno zapytanie count/head na render chronionej strony; AppLayout owija wszystkie). Bez zmian w bazie/RLS/serwisach. Opcjonalnie zrównoleglić trzy odczyty layoutu (`pending` + `trash` + status klucza) przez `Promise.all` (dziś sekwencyjne). Jedyny „dług": badge to inline literał → powstałby drugi egzemplarz tego samego markupu (kandydat do drobnej ekstrakcji, nieobowiązkowy).

**Rekomendacja dla `/10x-plan`:** decyzja jest **produktowa, nie kosztowa** — czy liczba w koszu jest dla użytkownika sygnałem do działania jak „pending". Technicznie nic nie stoi na przeszkodzie; jeśli dodać — najlepiej od razu z `Promise.all` w AppLayout.

### 5. Zachowanie bez zmian — restore + „Wyczyść kosz" (potwierdzone)

- **Restore:** `src/lib/services/items-mutation.ts`, `restoreFromTrash` (`:170-191`) — dwa strzeżone UPDATE-y: `deleted → accepted` oraz `rejected → pending`. **Origin-aware, niezależny od filtra widoku.** Endpoint `POST /api/items/bulk` (`action:"restore"`). Wyspa: `executeRestore` (`TrashItemsView.tsx:118-148`), optimistic. **Bez zmian.**
- **„Wyczyść kosz":** `emptyTrash` (`items-mutation.ts:200-209`) — twardy `DELETE ... .in("acceptance_status", ["rejected","deleted"])`, **globalny, ponad filtrami**. Endpoint `POST /api/items/trash/empty` (`:23-37`, bez body/`ids`). Dialog mówi „obejmuje CAŁY kosz … niezależnie od aktywnych filtrów" (`TrashItemsView.tsx:373-376`). **Bez zmian.**

Obie ścieżki są origin-agnostyczne — zgodne z briefem „US-05 / FR-013 / FR-016 bez zmian zachowania".

## Code References

- `src/components/items/state-filter.ts:39-51` — `STATE_FILTER_OPTIONS` (6 pozycji, `:50` to „Kosz"/trash do usunięcia); `navigateHref` (`:59`), `stateSelectValue` (`:68`).
- `src/components/items/state-filter.test.ts:7-24,34-38,52,57` — zamrożony test osi (do legalnej zmiany kontraktu).
- `src/components/items/StateFilterSelect.tsx:39-45` — render `<nav>` z zakładek-linków; osadzenie w wyspach.
- `src/components/items/AcceptedItemsView.tsx:317` — oś dla active/done/cancelled (bez zmian kodu).
- `src/components/items/TrashItemsView.tsx:215` — oś na stronie Kosza (**do usunięcia**); `:55-60` komentarz „bez filtra statusu" (**pozostaje aktualny**); `:79` `useItemList("trash")`; `:118-186` restore/empty; `:286` badge pochodzenia (zostaje).
- `src/components/shell/AppSidebar.astro:76-100` — grupa „Biblioteka" (punkt wstawienia „Kosza" po `:90`); `:58-73` badge licznika „Do akceptacji".
- `src/components/shell/nav-active.ts:21-35` — `NAV_MATCHERS` + `activeNavId` (dodać matcher `trash` przed `entries`).
- `src/components/shell/nav-active.test.ts:14` — zamrożona asercja `/items/trash → "entries"`.
- `src/layouts/AppLayout.astro:30-43,57` — licznik „Do akceptacji" (wzorzec dla ewentualnego licznika kosza).
- `src/lib/services/list-criteria.ts:21,24` — `MainView`/`MAIN_VIEWS` (zachowują `"trash"`; **bez zmian**).
- `src/lib/services/items.ts:72-126` — `listItems`; `:94-96` predykat kosza (**bez zmian**).
- `src/lib/services/items-mutation.ts:170-191` (`restoreFromTrash`), `:200-209` (`emptyTrash`) — zachowanie bez zmian.
- `src/lib/labels.ts:44-47,77-80` — `acceptanceOriginLabel` (badge „Odrzucone"/„Usunięte"; nadal używane per-wiersz).
- `src/components/items/ItemCard.tsx:74,215-217` — badge pochodzenia per-wiersz (zostaje).
- `src/pages/items/trash.astro:24,35` — SSR trasy Kosza (bez zmian); `src/pages/api/items/trash/empty.ts:23-37` — empty-trash (bez zmian).
- `src/types.ts:73` — `AcceptanceStatus = "pending" | "accepted" | "rejected" | "deleted"`.

## Architecture Insights

- **Precedens `pending`** to architektoniczny klucz S-16: „wartość `MainView` z własną stroną i wpisem w sidebarze, bez zakładki na osi" już działa. Kosz go powtarza — dlatego zmiana jest niskiego ryzyka.
- **Oś stanu żyje w wyspach React, nie w `.astro`** — dlatego renderuje się identycznie na stronie Kosza. Usunięcie „trash" z modelu **bez** wyjęcia `StateFilterSelect` z `TrashItemsView` zostawi oś Kosza bez podświetlenia — te dwie zmiany muszą iść razem.
- **Konwencja bazy:** „który zbiór oglądam" = ŚCIEŻKA strony; „jak go zawężam" = parametr URL. Kosz jest ŚCIEŻKĄ (`/items/trash`) — po S-16 wskazywaną z sidebara zamiast z osi.
- **Zamrożone kontrakty:** dwa testy zamrażają stringi/kształt (`state-filter.test.ts`, `nav-active.test.ts`) — S-16 świadomie i legalnie je zmienia. Nietykalne pozostają teksty akcji „Do kosza"/„Przywróć" i kontrakty DOM (`article[data-item-id]`, `<h3>` tytuł, role ARIA).
- **Mostek topbar↔lista** (`useItemTopbarBridge`) obsługuje szukajkę i „Wyczyść kosz" Kosza; przegląd Fazy 9 S-15 flagował ryzyko wyścigu hydracji — S-16 dotyka tego obszaru lekko (usunięcie osi), warto mieć na uwadze przy testach.

## Historical Context (from prior changes)

**S-06 `trash-lifecycle`** (`context/archive/2026-06-16-trash-lifecycle/`; brak `research.md`):
- Model: `acceptance_status` = `pending|accepted|rejected|deleted`; Kosz = `rejected` + `deleted`; pochodzenie **deterministyczne z samego statusu** (brak kolumny „previous_status"). Bez migracji (RLS `items_delete_own` już dopuszczał DELETE). `plan.md:11,22,28,29,40`.
- Restore dwukierunkowy `deleted→accepted` / `rejected→pending` jako **dwa osobne guarded UPDATE-y** (nie wspólnie transakcyjne — świadome ograniczenie solo-MVP). `plan.md:51,91-92`; `plan-brief.md:21-24`; `reviews/impl-review.md:55-63`.
- „Wyczyść kosz" = globalny hard DELETE ponad filtrami, z potwierdzeniem i łączną liczbą; osobny endpoint. `plan.md:52,54,198`.
- **Filtr pochodzenia był zaprojektowany, potem WYCIĘTY** (scope-down 2026-06-19, commit `be3b01d`): pod-filtr Wszystkie/Odrzucone/Usunięte + `trash-view.ts`/`applyTrashSubFilter` usunięte; rozróżnienie zeszło na **badge karty**, zawężanie tylko filtrem typu. Etykiety `acceptanceOriginLabel` **przetrwały**. `change.md:14`; `plan.md:154,180-184`. **→ S-16 utrzymuje tę decyzję** — badge wystarcza; filtr pochodzenia pozostaje poza zakresem (potwierdzone decyzją użytkownika 2026-08-06).

**S-15 `ui-redesign`** (`context/archive/2026-08-03-ui-redesign/`):
- Powłoka jako **czysty Astro** (`AppSidebar.astro` + `Icon.astro` + `nav-active.ts`), bez React-owego shadcn `sidebar`. Grupy: „Przepływ" (Do akceptacji + licznik), „Biblioteka" (Wpisy, Sesje importu; „Dziennik" **później usunięty** jako martwy placeholder). `plan.md:130,138,142`; `ui-design-system.md:79`.
- **Faza 9** spłaszczyła oś stanu do płaskiego rzędu 6 zakładek `<a href>` (Aktywne | Nowe | W toku | Zakończone | Anulowane | Kosz), usuwając kliencki podfiltr. `plan.md:446-468`; `reviews/impl-review-phase-9.md:26-27`. **To jest dokładnie oś, z której S-16 usuwa „Kosz".**
- Zakładki zakresu to **stylowane linki, nie interaktywny `tabs`** (zakres = trasa multi-page). Aktywny stan: exact `/items`, prefix `/items/`. Ryzyko F1 (Fazy 9): sztywne `h-screen` pod banerem configu — naprawione propem `Layout.fullHeight` + E2E.
- Martwy kod w `state-filter.ts` (Select→zakładki) usuwano w Fazie 8 z niuansem: dotykał **zamrożonego** `state-filter.test.ts`. `reviews/impl-review-phase-3.md:64-72`.

**Foundation:**
- `lessons.md`: zakaz top-level `return` we frontmatterze `.astro` (S-16 rusza `AppSidebar.astro` + strony → po edycji `npm run lint`); walidacja API zod dla wielopolowego / ręczna dla pojedynczego skalaru; formatuj tylko celowane ścieżki.
- `ui-design-system.md:81,85` — opisuje jeszcze **stary** stan („zakładki zakresu … Kosz — z licznikami", „Wpisy → /items/active + zakładki do …/trash"). **Sprzeczne z celem S-16** — dokument prawdopodobnie wymaga aktualizacji IA w ramach slice'u. Nietykalne pozostają etykiety widoków (w tym „Kosz") i teksty akcji.

## Related Research

- Brak wcześniejszego `research.md` dla trash-lifecycle (S-06). Najbliższe artefakty: `context/archive/2026-08-03-ui-redesign/research.md` (powłoka, oś stanu) oraz `context/archive/2026-06-16-trash-lifecycle/plan.md` (model kosza, restore, empty).

## Open Questions

1. **Licznik kosza w sidebarze** — dodać czy nie? Technicznie tani (§4). Decyzja produktowa dla `/10x-plan`.
2. **`stateSelectValue("trash", …)` w zamrożonym teście** (`state-filter.test.ts:52,57`) — po wyjęciu z osi asercje przechodzą mechanicznie, ale semantycznie zgrzytają. Zostawić czy usunąć?
3. **Ikona „Kosza" w sidebarze** — potwierdzić nazwę ikony dostępną w `Icon.astro` (np. `trash-2`).
4. **Aktualizacja `ui-design-system.md`** (§Historical) — czy S-16 aktualizuje opis IA (przeniesienie „Kosza" z osi do Biblioteki), czy zostawia to poza zakresem slice'u.
