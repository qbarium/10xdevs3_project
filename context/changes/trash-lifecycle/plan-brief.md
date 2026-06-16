# Cykl życia kosza (S-06) — Krótki plan

> Pełny plan: `context/changes/trash-lifecycle/plan.md`

## Co i dlaczego

Włączamy wymiar „kosza" do cyklu życia itemu: przeniesienie zaakceptowanego itemu do kosza, przywrócenie i trwałe opróżnienie kosza (FR-013, FR-016). To domyka must-have ścieżkę zarządzania itemami — bez „Wyczyść kosz" kosz byłby nieskończenie rosnącym cmentarzyskiem. Restore staje się **dwukierunkowy** (`deleted→accepted`, `rejected→pending`) — świadoma zmiana kontraktu PRD podjęta przez użytkownika, bo brak odzysku po pomyłkowym odrzuceniu uznano za słabo uzasadniony.

## Punkt wyjścia

Schemat jest już w pełni gotowy: enum `acceptance_status` zawiera wartość `deleted` (nieużywaną nigdzie w kodzie), a RLS ma politykę `items_delete_own` dopuszczającą twardy DELETE. Widok Kosz (`trash.astro`) jest dziś read-only i pokazuje wyłącznie `rejected`. Istnieją mocne wzorce do reużycia z S-03/S-04/S-05: atomowy bulk UPDATE w serwisach, wyspa `AcceptedItemsView` (selekcja + bulk + per-item + confirm + toast + filtr typu przez cookie), hook `useItemMutation`.

## Pożądany stan końcowy

Użytkownik przenosi zaakceptowane itemy do kosza (per-item i zbiorczo) z widoków Aktywne/Zakończone/Anulowane; w Koszu przełącza pod-filtr Wszystkie/Odrzucone/Usunięte, przywraca itemy (deleted→do swojego widoku ze stanem operacyjnym; rejected→do „Elementy do akceptacji") i opróżnia cały kosz jedną globalną akcją z potwierdzeniem podającym łączną liczbę.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Zakres restore | Oba przywracalne (undo ostatniej tranzycji) | Odzysk po pomyłkowym odrzuceniu; jedna principled reguła | Plan (zmiana PRD) |
| Semantyka restore | `deleted→accepted`, `rejected→pending` | Nie auto-akceptuje odrzuconego; re-otwiera bramę walidacji | Plan |
| Brak migracji | Reużycie `deleted` + polityki DELETE | Schemat gotowy od S-02/S-04 | Plan (badanie kodu) |
| Restore w backendzie | Dwa guarded UPDATE-y | Mieszana selekcja rejected+deleted; deterministyczne z bieżącego statusu | Plan |
| Miejsce „Do kosza" | Przycisk zbiorczy + per-item na karcie | Szybkie wyrzucenie 1 itemu; parytet z FR-007 | Plan |
| Pod-filtr Kosza | Rząd przełącznika Wszystkie/Odrzucone/Usunięte | Spójne z `TypeFilter` | Plan |
| „Wyczyść kosz" | Cały kosz (rejected+deleted), ponad filtrami | FR-016 „jednym kliknięciem"; dialog z prawdziwą łączną liczbą | Plan |
| Potwierdzenia | Empty zawsze; move/restore wg istniejącego wzorca | Tarcie tylko przy nieodwracalnym hard-delete | Plan |
| Kształt API | Rozszerzyć `bulk` o trash/restore + osobny endpoint empty | Reużycie wzorca bulk; empty ma inny kontrakt (hard delete) | Plan |

## Zakres

**W zakresie:** move-to-trash (per-item + bulk) z widoków accepted; widok Kosz jako wyspa React z pod-filtrem rejected/deleted i filtrem typu; restore (per-item + bulk) dla obu statusów; „Wyczyść kosz" (globalny hard DELETE z potwierdzeniem); amendment PRD.

**Poza zakresem:** per-item permanent delete, auto-cleanup/TTL, undo-toast, sortowanie/wyszukiwanie/filtr sesji w Koszu (S-09), nowa migracja/zmiana RLS, optimistic concurrency dla move/restore/empty, testy e2e/przeglądarkowe i nowe testy integracyjne (lekcja przed nami — pokrycie jednostkowe vitest + ręczna weryfikacja UI).

## Architektura / Podejście

Backend: dwie nowe funkcje odczytu/mutacji w istniejących serwisach (`getTrashItems`, `moveToTrash`/`restoreFromTrash`/`emptyTrash`) w stylu atomowego `UPDATE/DELETE ... .in().eq().select("id")`; restore = dwa guarded UPDATE-y. API: rozszerzenie `bulkActionSchema`/`bulk.ts` o `trash`/`restore` + nowy `POST /api/items/trash/empty` (hard DELETE, bez body). Front: nowa wyspa `TrashItemsView` wzorowana na `AcceptedItemsView`; „Do kosza" dodane do `AcceptedItemsView`. Model dwuwymiarowy (akceptacja × stan operacyjny) → zachowanie stanu operacyjnego jest automatyczne (nie dotykamy `operational_status`).

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Kontrakt + Backend | Amendment PRD; odczyt/mutacje kosza; walidacja; endpointy (bulk +trash/restore, empty) | Pierwszy twardy DELETE; restore = dwa guarded UPDATE-y |
| 2. Frontend Kosz | Wyspa `TrashItemsView`: pod-filtr, restore (per-item+bulk), „Wyczyść kosz" + potwierdzenie | Reconcyliacja po restore/empty; dialog destrukcyjny z prawdziwą liczbą |
| 3. Frontend wejście do kosza | „Do kosza" w `AcceptedItemsView` (bulk + per-item); domknięcie pętli | Spójność z 4 istniejącymi przyciskami bulk; uogólnienie `confirmRequest` |

**Wymagania wstępne:** S-03 (done) — model `rejected`, selekcja, wzorzec bulk; S-04/S-05 (done) — widoki accepted, filtr typu przez cookie.
**Szacowany nakład pracy:** ~3 sesje (po jednej na fazę); bez migracji, dużo reużycia.

## Otwarte ryzyka i założenia

- Amendment PRD musi zostać wykonany wraz z implementacją (PRD = źródło prawdy); rozjazd plan↔PRD byłby błędem.
- „Wyczyść kosz" jest globalny ponad filtrami — pułapka percepcyjna („widziałem 2, skasowało 10") mitygowana łączną liczbą w dialogu.
- Testy: vitest **jednostkowe** w Fazie 1 (validation + handlery bulk/empty), bramka `npm run test`; UI w Fazach 2–3 weryfikowany **ręcznie** wg checklist. E2e/integracja poza zakresem (lekcja przed nami) — skutek: izolacja RLS twardego DELETE nie jest pokryta automatem, sprawdzana ręcznie.

## Kryteria sukcesu (podsumowanie)

- Pełna pętla `Aktywne → Do kosza → Kosz → Przywróć → Aktywne` z zachowaniem stanu operacyjnego oraz `Odrzuć → Kosz → Przywróć → Elementy do akceptacji`.
- „Wyczyść kosz" trwale usuwa wiersze rejected+deleted (znikają z DB), z potwierdzeniem podającym łączną liczbę.
- PRD nie zawiera już zapisu o jednokierunkowości wymiaru akceptacji.
