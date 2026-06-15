---
change_id: unified-list-and-edit
title: Jednolita lista (filtr typu) + edycja zaakceptowanych itemów
status: implementing
created: 2026-06-15
updated: 2026-06-15
---

## Notes

S-05 z roadmapy (Strumień B — zarządzanie itemami i edycja; dołącza do Strumienia A w S-03). Wynik: **filtr typu** (Wszystkie / Zadania / Notatki / Pomysły / Decyzje / Inne) na widokach Aktywne / Zakończone / Anulowane + **edycja zaakceptowanych itemów** (`title`, `description`, `typ`). Odnośniki PRD: FR-008 (warstwa 2 — filtr typu), FR-011 (edycja zaakceptowanych).

Bez migracji — schemat (`updated_at`, `operational_status` dla wszystkich typów po S-04) już to niesie. Zmiana czysto aplikacyjna: serwis mutacji + endpoint PATCH + dwa islandy React.

### Decyzje projektowe (sesja /10x-plan 2026-06-15)

1. **Filtr typu = filtrowanie klienckie (React state).** Dane widoku już ładowane SSR do islandu; filtr derywuje listę w pamięci. Cel „szybkość", mały wolumen danych. Bez query paramów, bez nowych zapytań serwisowych.
2. **Zakres filtra = tylko widoki zaakceptowane** (Aktywne / Zakończone / Anulowane). Pending ma edycję z S-03, Kosz read-only; pełny FR-008 (typ na Pending/Kosz) poza tym wycinkiem.
3. **Zmiana typu przy edycji ZACHOWUJE stan operacyjny** — rozstrzyga OQ5. Po S-04 stan operacyjny jest niezależny od typu (różnią się tylko etykiety), więc edycja **nie dotyka** `operational_status`. Upraszcza serwis: dziś `editPendingItem` re-derywuje `operational_status → 'new'`; nowa reguła „edycja nie modyfikuje stanu operacyjnego" jest poprawna dla pendingów (i tak są `'new'`) i dla accepted (zachowują postęp).
4. **Optimistic concurrency WCHODZI** (lekcja lessons.md „lost update" wprost wskazała S-05): klient wysyła oczekiwany `updated_at` z chwili otwarcia, serwis robi compare-and-swap → `409 conflict`. Kolumna `updated_at` już istnieje (aktualizowana aplikacyjnie).
5. **Forma filtra = rząd przycisków/zakładek single-select** (spójne z `MainFilterNav`).
6. **Po zmianie typu w aktywnym filtrze item ZOSTAJE widoczny do odświeżenia/przełączenia filtra** (zbiór „przypiętych" id renderowany wbrew predykatowi). Świadomy wyłom z domyślnej czystej derywacji (decyzja użytkownika; zmieniona z rekomendowanego „znika natychmiast").
