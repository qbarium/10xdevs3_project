---
change_id: unified-list-and-edit
title: Jednolita lista (filtr typu) + edycja zaakceptowanych itemów
status: archived
created: 2026-06-15
updated: 2026-06-16
archived_at: 2026-06-16T21:04:30Z
---

## Notes

S-05 z roadmapy (Strumień B — zarządzanie itemami i edycja; dołącza do Strumienia A w S-03). Wynik: **filtr typu** (Wszystkie / Zadania / Notatki / Pomysły / Decyzje / Inne) na widokach Aktywne / Zakończone / Anulowane + **edycja zaakceptowanych itemów** (`title`, `description`, `typ`). Odnośniki PRD: FR-008 (warstwa 2 — filtr typu), FR-011 (edycja zaakceptowanych).

Bez migracji — schemat (`updated_at`, `operational_status` dla wszystkich typów po S-04) już to niesie. Zmiana czysto aplikacyjna: serwis mutacji + endpoint PATCH + dwa islandy React.

### Decyzje projektowe (sesja /10x-plan 2026-06-15)

1. **Filtr typu = filtrowanie klienckie (React state).** Dane widoku już ładowane SSR do islandu; filtr derywuje listę w pamięci. Cel „szybkość", mały wolumen danych. Bez query paramów, bez nowych zapytań serwisowych. **Refinement (2026-06-16, feedback):** filtr persystowany w **jednym wspólnym cookie** (`tl_typefilter`) dla trzech widoków zaakceptowanych, by przeżył odświeżenie strony (np. „Odśwież" z toasta konfliktu) ORAZ był spójny przy przełączaniu widoków (per-widok powodował skok filtra na nieaktualną wartość drugiego widoku). Cookie jest czytany **serwerowo** (`Astro.cookies` → `initialTypeFilter` prop), więc SSR renderuje od razu poprawnie przefiltrowaną listę — **bez przeskoku po hydracji** (wcześniejszy `sessionStorage` był niewidoczny dla serwera → lista skakała). Wciąż **poza URL** (brak query paramów/linkowalności; to S-09).
2. **Zakres filtra = tylko widoki zaakceptowane** (Aktywne / Zakończone / Anulowane). Pending ma edycję z S-03, Kosz read-only; pełny FR-008 (typ na Pending/Kosz) poza tym wycinkiem.
3. **Zmiana typu przy edycji ZACHOWUJE stan operacyjny** — rozstrzyga OQ5. Po S-04 stan operacyjny jest niezależny od typu (różnią się tylko etykiety). Pierwotnie: edycja **nie dotyka** `operational_status` (usunięcie auto-derywacji `→'new'`, która resetowałaby postęp accepted). **ZMIANA (rewizja UX, 2026-06-16) — patrz #7:** edycja **ustawia** `operational_status`, ale JAWNIE (z selektora w dialogu, prefill bieżącej wartości). Inwariant „brak cichego resetu" zachowany — serwer zapisuje wartość podaną, nie derywowaną; edycja samej treści wysyła niezmieniony stan, więc go zachowuje.

7. **Rewizja UX (2026-06-16): cała per-itemowa edycja w dialogu, na liście tylko badge.** Po implementacji okazało się niespójne, że stan był zmieniany inline (klikalny badge z S-04), a typ tylko w dialogu — i odwrotnie. Ujednolicenie (decyzja użytkownika): **dialog „Edytuj" edytuje wszystkie pola** (`title`, `description`, `type`, **`operational_status`** — selektor tylko dla `accepted`); **badge typu i stanu na liście są tylko do odczytu** (`OperationalStatusBadge` z opcjonalnym `onChange` → tryb statyczny). Bulk-toolbar (zmiana stanu wielu zaznaczonych) **zostaje** jako osobna akcja multi-select. **Edytowany item ZOSTAJE widoczny** po zapisie (decyzja #6 rozszerzona ze zmiany typu na zmianę stanu) — `handleSaved` tylko podmienia go w miejscu, NIE usuwa, nawet gdy nowy stan/typ wypada poza bieżący widok/filtr; znika dopiero po reloadzie SSR. Bulk usuwa od razu (`reconcileAfterChange`) — to świadomie odrębne zachowanie multi-select.
4. **Optimistic concurrency WCHODZI** (lekcja lessons.md „lost update" wprost wskazała S-05): klient wysyła oczekiwany `updated_at` z chwili otwarcia, serwis robi compare-and-swap → `409 conflict`. Kolumna `updated_at` już istnieje (aktualizowana aplikacyjnie).
5. **Forma filtra = rząd przycisków/zakładek single-select** (spójne z `MainFilterNav`).
6. **Po zmianie typu w aktywnym filtrze item ZOSTAJE widoczny do odświeżenia/przełączenia filtra** (zbiór „przypiętych" id renderowany wbrew predykatowi). Świadomy wyłom z domyślnej czystej derywacji (decyzja użytkownika; zmieniona z rekomendowanego „znika natychmiast").

8. **Przełącznik rozszerzania dialogu edycji na obszar listy (aneks post-implementacyjny, 2026-06-16).** Poza pierwotnym planem i decyzjami #1–#7: `EditItemDialog` zyskał toggle Maximize/Minimize (commity `5f7ee19`, `81c6a84`, `79d16c5`) — przy długim opisie dialog rozszerza się na szerokość obszaru listy zamiast wychodzić poza ekran, a textarea wypełnia dostępną przestrzeń. Czysty feature UX dorzucony w trakcie; izolowany (tylko prezentacja dialogu, bez wpływu na kontrakt edycji/serwis). Udokumentowany tu jako odkryty zakres (zgodnie z wzorcem aneksów repo), wychwycony przez `/10x-impl-review` (F1). Brak testów interakcji toggle — akceptowalne dla feature'u czysto prezentacyjnego w MVP.
