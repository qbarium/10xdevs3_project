# Jednolita lista (filtr typu) + edycja zaakceptowanych itemów — Krótki plan

> Pełny plan: `context/changes/unified-list-and-edit/plan.md`

## Co i dlaczego

S-05 dokłada **filtr typu** (Wszystkie / Zadania / Notatki / Pomysły / Decyzje / Inne) i **edycję zaakceptowanych itemów** (`title`, `description`, `typ`) do gotowej już infrastruktury 5 widoków list. Domyka warstwę 2 FR-008 (filtr typu) i FR-011 (edycja post-akceptacja) dla widoków zaakceptowanych.

## Punkt wyjścia

Filtr główny FR-008 (Aktywne / Zakończone / Anulowane / Elementy do akceptacji / Kosz) jest w 100% gotowy po S-02/S-03/S-04 — 5 stron Astro + `MainFilterNav` + dwa islandy React. Pending ma już edycję (S-03). Brakuje filtra typu (nigdzie) i edycji itemów zaakceptowanych (`AcceptedItemsView` ich nie ma; endpoint blokuje guardem `pending`-only).

## Pożądany stan końcowy

W widokach Aktywne / Zakończone / Anulowane użytkownik klika rząd przycisków typu i lista natychmiast się zawęża, oraz edytuje itemy przez ten sam dialog co przy pendingach — z zachowaniem stanu operacyjnego i ochroną przed cichym nadpisaniem (409 przy równoległej edycji).

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Mechanizm filtra typu | Filtrowanie klienckie (React state) | Dane już SSR w islandzie; natychmiastowe, zero nowych zapytań — cel „szybkość", mały wolumen | Plan |
| Zakres filtra | Tylko Aktywne / Zakończone / Anulowane | Trzyma wycinek wąsko; Pending ma edycję, Kosz read-only | Plan |
| Zmiana typu przy edycji | Zachowuje stan operacyjny | Po S-04 stan operacyjny niezależny od typu (tylko etykiety per-typ) — rozstrzyga OQ5 | Plan |
| Optimistic concurrency | Tak, lekkie compare-and-swap (`updated_at` → 409) | Lekcja lessons.md wskazała S-05; kolumna już istnieje, koszt niski | Plan |
| Forma filtra | Rząd przycisków single-select | Spójne z `MainFilterNav`; wszystkie opcje widoczne | Plan |
| Po zmianie typu w aktywnym filtrze | Item zostaje widoczny do odświeżenia/przełączenia | Mniej zaskakujące niż natychmiastowe zniknięcie po edycji (decyzja użytkownika) | Plan |

## Zakres

**W zakresie:** filtr typu na 3 widokach zaakceptowanych; edycja `title`/`description`/`typ` zaakceptowanych; optimistic concurrency (też dla pendingów); reużycie `EditItemDialog`.

**Poza zakresem:** filtr typu na Pending/Kosz; sortowanie/wyszukiwanie/filtr sesji (S-09); query-paramowa linkowalność filtra; edycja w Koszu (read-only); migracja schematu; bulk edycja pól.

## Architektura / Podejście

Zmiana czysto aplikacyjna (bez migracji). **Backend**: serwis `editItem` (guard `IN ('pending','accepted')`, bez dotykania `operational_status`, compare-and-swap na `updated_at` z rozróżnieniem 404/409) → endpoint PATCH (409 w kanonicznym `{ok:false,code,error}`) → walidacja zod rozszerzona o `expectedUpdatedAt`. **Frontend**: reużycie `EditItemDialog` w `AcceptedItemsView` (przycisk „Edytuj", obsługa 409) + nowy `TypeFilter` (presentational) sterujący stanem filtra i zbiorem „przypiętych" id w islandzie.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Backend | Edycja accepted + optimistic concurrency (serwis, endpoint, walidacja, testy) | Rozróżnienie 404 vs 409 wymaga dwukrokowego UPDATE+SELECT; nie zresetować `operational_status` |
| 2. Frontend edycja | „Edytuj" w widokach zaakceptowanych, obsługa 409 | Reużycie dialogu bez regresji dla pendingów |
| 3. Frontend filtr typu | Rząd przycisków + filtr kliencki + „przypięte" id | Zachowanie edytowanego itemu wbrew predykatowi (celowy kod, nie czysta derywacja) |

**Wymagania wstępne:** S-03 (done), S-04 (done). Brak migracji.
**Szacowany nakład pracy:** ~3 sesje (1 faza = 1 przekazanie), wycinek wąski.

## Otwarte ryzyka i założenia

- Założenie: wszystkie itemy `pending`/`accepted` mają `operational_status` ustawiony (po backfillu S-04) — więc „edycja nie dotyka stanu" nie zostawia NULL.
- Ryzyko UX: „przypięte" itemy mogą zaskakiwać po przełączeniu filtra (znikają) — złagodzone toastem przy zapisie.

## Kryteria sukcesu (podsumowanie)

- Edycja zaakceptowanego itemu zmienia pola i **zachowuje** stan operacyjny.
- Filtr typu zawęża listę natychmiast, bez przeładowania.
- Równoległa edycja z nieaktualnym `updated_at` zwraca 409 zamiast cichego nadpisania.
