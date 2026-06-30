# Reaktywne filtry dziennika sesji importu (S-11) — Krótki plan

> Pełny plan: `context/changes/session-log-filter-ux/plan.md`
> Badania: `context/changes/session-log-filter-ux/research.md`

## Co i dlaczego

Dziennik sesji importu (`/import-sessions`) filtruje dziś po statusie i sortuje po dacie w modelu „formularz + Zastosuj + przeładowanie strony" — niespójnym z resztą aplikacji (listy główne dostały reaktywne filtry w S-09). S-11 przenosi go na ten sam model reaktywny: zmiana kontrolki natychmiast zawęża listę bez przeładowania, kryteria są w adresie strony. Przy okazji dziennik dostaje paginację, bo rośnie bez ograniczeń, a dziś ładowany jest w całości.

## Punkt wyjścia

Lista sesji powstaje przez render serwerowy (`getImportSessions` w `import-sessions.astro`), przekazywana do wyspy React jako props; filtr/sort działa przez `<form method="get">` z przeładowaniem; natywne `<select>`; brak endpointu listy i brak paginacji (serwis ciągnie wszystkie wiersze, indeks tylko po `user_id`).

## Pożądany stan końcowy

Użytkownik przełącza status i sortowanie, a lista zawęża się i przeładowuje z serwera natychmiast, bez „Zastosuj" i bez przeładowania strony; kryteria i numer strony są w adresie (odświeżenie i „wstecz/dalej" je zachowują); listę przegląda stronami; pusty wynik z filtrem rozróżnia się od pustego dziennika; kontrolki to spójny, motywowany `Select`.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
| --- | --- | --- | --- |
| Błąd podwójnego React-a (tryb dev) | Poza zakresem → S-12 | Błąd wyłącznie deweloperski; produkcja go nie ma, więc nie blokuje S-11 ani deadline'u | Plan |
| Źródło danych przy zmianie filtra | Nowy `GET /api/import-sessions` | Reaktywność + paginacja wymaga pobrania serwerowego; endpoint listy dziś nie istnieje | Badania/Plan |
| Paginacja | Stronowa (offset), pełna od razu | Dziennik rośnie bez ograniczeń; offset prosty i wystarczający dla pojedynczego użytkownika | Plan |
| Indeks bazy | Dodać `(user_id, created_at, id)` | Wsparcie sortu po dacie + stabilne stronicowanie (tie-break po `id`) | Badania/Plan |
| Deep-link `?session=` | Usunięty | To przegląd listy, nie ma tu linków do pojedynczej sesji | Plan |
| Wyszukiwanie tekstowe | Pominięte | Dziennik filtruje tylko po statusie | Badania |
| Kontrolki filtra/sortu | Motywowany `Select` | Roadmapa S-11 wymaga spójnych dropdownów, nie natywnych `<select>` | Roadmapa/Badania |

## Zakres

**W zakresie:** reaktywny filtr statusu i sortowanie po dacie (bez przeładowania); kryteria w adresie; paginacja stronowa; motywowany `Select`; rozróżnienie pustego wyniku; `GET /api/import-sessions` + indeks.

**Poza zakresem:** błąd podwójnego React-a (→ S-12); deep-link `?session=`; wyszukiwanie tekstowe; zmiany w panelu master-detail z S-10; paginacja kursorowa.

## Architektura / Podejście

Od danych do interfejsu: (serwer) indeks + `getImportSessions` z paginacją i tie-break + wspólna funkcja mapująca wiersz + endpoint `GET /api/import-sessions` jako cienka nakładka na serwis; (klient) hook `useSessionList` synchronizujący kryteria z adresem i pobierający z endpointu bez przeładowania; (UI) motywowany `Select` + kontrolki stron. Wspólny parser kryteriów dla serwera i klienta zapewnia identyczny pierwszy render (brak przeskoku po nawodnieniu). Wzorzec w całości z S-09.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Dane + endpoint + indeks | serwerowa podstawa: migracja, serwis z paginacją, `GET /api/import-sessions` | poprawny tie-break po `id` (inaczej powtórki/braki na granicy strony) |
| 2. Reaktywne filtry/sort | hook + adres, motywowany `Select`, rozróżnienie pustego wyniku | parytet renderu serwer↔klient (wspólny parser kryteriów) |
| 3. Paginacja w UI + domknięcie | kontrolki stron, reset do strony 1, ładowanie/błąd | dryf offsetu przy nowych wpisach (akceptowalny dla 1 usera) |

**Wymagania wstępne:** brak (warstwa serwerowa niezależna; stara strona działa do Fazy 2).
**Szacowany nakład pracy:** ~3 sesje w 3 fazach.

## Otwarte ryzyka i założenia

- Błąd podwójnego React-a żyje w trybie deweloperskim na tej stronie — **weryfikacja ręczna prowadzona na `npm run preview` (build produkcyjny, bez błędu)**, nie na `npm run dev`. Dołożenie hooka filtrów może nasilić objaw w dev; to oczekiwane i poza zakresem (S-12).
- Paginacja offset dryfuje przy nowych wpisach na głowie listy — akceptowalne dla pojedynczego użytkownika i niskiej częstości importów.

## Kryteria sukcesu (podsumowanie)

- Zmiana statusu/sortowania zawęża listę bez przeładowania; kryteria i strona w adresie, zachowane po odświeżeniu i przez „wstecz/dalej".
- Lista przeglądana stronami; pusty wynik z filtrem rozróżniony od pustego dziennika; brak „Zastosuj" i natywnych `<select>`.
