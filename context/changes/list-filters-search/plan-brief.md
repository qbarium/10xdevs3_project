# Filtry dodatkowe list — sortowanie, wyszukiwanie, podfiltr stanu — Krótki plan

> Pełny plan: `context/changes/list-filters-search/plan.md`

## Co i dlaczego

S-09 dokłada **trzecią warstwę FR-008** (filtry dodatkowe) do gotowej jednolitej listy: sortowanie (po tytule i — osobno — dacie utworzenia lub modyfikacji), wyszukiwanie po tytule i opisie oraz podfiltr stanu operacyjnego w widoku Aktywne. Przy okazji ujednolica filtr typu, przenosząc go na ten sam mechanizm. Cel: domknąć must-have część FR-008 tak, by przy rosnącej liczbie elementów dało się je znaleźć i uporządkować.

## Punkt wyjścia

Filtr główny (5 widoków) i filtr typu działają, ale filtr typu jest **kliencki** (cookie `tl_typefilter` + `applyTypeFilter`), obecny tylko na widokach zaakceptowanych i w Koszu, a sortowanie jest stałe i nie ma wyszukiwania ani podfiltra stanu. Żaden endpoint nie czyta dziś parametrów z adresu strony.

## Pożądany stan końcowy

Na każdym widoku list (w tym „Elementy do akceptacji") użytkownik sortuje, wyszukuje i filtruje po typie; w Aktywne dodatkowo zawęża po stanie operacyjnym. Wszystkie kryteria są w **adresie strony** — odświeżenie, „wstecz/dalej" i wysłany odnośnik je zachowują. Render serwerowy od razu pokazuje przefiltrowaną listę (brak przeskoku po hydracji).

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
| --- | --- | --- | --- |
| Gdzie filtrowanie | Po stronie serwera | Jedno źródło prawdy, naturalne dla URL i SSR | Plan |
| Trwałość stanu filtrów | Parametry w adresie strony (URL) | Odświeżenie, back/forward, odnośnik do dzielenia | Plan |
| Dostarczenie | `GET /api/items` + wyspa fetchuje, URL synchronizowany | Płynne, spełnia NFR ≤ 200 ms, shareable | Plan |
| Filtr typu | Migracja klient+cookie → serwer+URL | Jeden spójny mechanizm filtrów we wszystkich widokach | Plan |
| Filtr daty | Tylko jako klucz sortowania (bez zakresu „od–do") | Pokrywa realną potrzebę minimalnym UI | Plan |
| Sortowanie | Jedno pole naraz + tie-break po `id` | Brak sortowania złożonego dla użytkownika; deterministyczna kolejność | Plan |
| Podfiltr stanu operacyjnego | Tylko widok Aktywne | Jedyny widok z >1 stanem (`new` + `in_progress`) | Kanon (FR-008) |
| Zakres „Elementy do akceptacji" | Filtr typu + wyszukiwanie + sortowanie; bez podfiltra stanu | Pending nie ma stanu operacyjnego; reszta spójna z innymi widokami | Plan |
| Selekcja przy zmianie filtra | Czyszczona | Brak akcji na niewidocznych; inwariant „zaznaczenie ⊆ widoczne" | Plan |

## Zakres

**W zakresie:** sortowanie (tytuł / data utworzenia / data modyfikacji), wyszukiwanie (tytuł + opis), podfiltr stanu operacyjnego (Aktywne), migracja filtra typu na serwer+URL we wszystkich widokach, czyszczenie selekcji + komunikat pustego wyniku.

**Poza zakresem:** filtr po sesji importu i widok elementów sesji (→ S-10); zakres dat „od–do"; sortowanie złożone; paginacja/wirtualizacja; zmiana schematu/migracja; filtr poprzedniego statusu w Koszu (etykieta wg FR-012).

## Architektura / Podejście

Pure moduł kryteriów (`list-criteria.ts`: typ `ListCriteria` + `parseListCriteria` ↔ `criteriaToQuery`) jest wspólny dla SSR, endpointu i hooka — to gwarantuje identyczny render serwera i klienta. `listItems(criteria)` w serwisie składa jedno zapytanie Supabase (predykat widoku + typ + podfiltr operacyjny + `ilike` + sort). `GET /api/items` waliduje `view` i buduje kryteria przez `parseListCriteria` (jeden tolerancyjny walidator, bez osobnego zod) i woła `listItems`. Hook `useItemList` fetchuje wg kryteriów, debounce'uje wyszukiwanie i zapisuje URL (`pushState` dla zmian dyskretnych, `replaceState` dla liter wyszukiwania) + `popstate` dla „wstecz/dalej". Zmiana kryterium = re-fetch (autorytatywna lista); mutacje pozostają optimistic (bez wymuszania re-fetchu) — dzięki temu znika mechanizm `pinnedIds`.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Warstwa danych | `listItems` + kryteria + (de)serializacja URL (jeden walidator, bez osobnego zod) | Poprawne domyślne sortowanie per widok |
| 2. Endpoint `GET /api/items` | Parametry z URL → walidacja → lista | Pierwszy endpoint czytający query string |
| 3. Hook `useItemList` + URL | Fetch wg kryteriów, debounce, zapis URL | Debounce tylko dla wyszukiwania |
| 4. Migracja filtra typu (serwer+URL+SSR) | Wszystkie widoki na nowym potoku; pending zyskuje filtr typu | Dotyka działających widoków (S-05/S-06); hydration-stability |
| 5. Nowe kontrolki + UX | Sort, wyszukiwanie, podfiltr stanu; czyszczenie selekcji; pusty stan | Escapowanie `%`/`_` w wyszukiwaniu |

**Wymagania wstępne:** S-05 (jednolita lista + filtr typu), S-06 (Kosz) — oba `done`.
**Szacowany nakład pracy:** ~5 faz, po jednym przekazaniu `/10x-implement` na fazę.

## Otwarte ryzyka i założenia

- Migracja filtra typu dotyka działających widoków — ryzyko regresji ograniczone testami i zachowaniem renderu serwerowego (SSR czyta te same parametry).
- Wyszukiwanie `ilike` bez indeksu pełnotekstowego — akceptowalne na `target_scale: small`; przy wzroście danych do rozważenia indeks (poza zakresem).
- Brak paginacji — świadome; cała przefiltrowana lista ładowana naraz.

## Kryteria sukcesu (podsumowanie)

- Na każdym widoku użytkownik sortuje, wyszukuje i filtruje po typie; w Aktywne zawęża po stanie operacyjnym.
- Kryteria żyją w adresie strony: odświeżenie, „wstecz/dalej" i odnośnik zachowują filtry; render serwerowy bez przeskoku.
- Filtr typu działa na nowym potoku (serwer+URL) we wszystkich widokach; cookie `tl_typefilter` i kliencki `applyTypeFilter` znikają.
