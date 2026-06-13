---
change_id: validation-accept-reject
title: Walidacja — akceptacja, odrzucenie i edycja pendingów w stagingu
status: implementing
created: 2026-06-13
updated: 2026-06-13
---

## Notes

Źródło: `@context/foundation/roadmap.md` → S-03 (strumień A „Ścieżka generacji"; domyka łańcuch gwiazdy przewodniej po S-02). Wymagania wstępne: S-02 (done — tabela `items` z enumami `acceptance_status`/`operational_status`, `import_sessions`, RLS per-operacja, read-only widok pendingów `src/pages/items.astro` + `PendingItemsList.astro`).

Wynik: na widoku „Elementy do akceptacji" użytkownik zaznacza pendingi (per-item + „zaznacz wszystkie"), zatwierdza zaznaczone (z opcjonalną edycją `title`/`description`/`typ`) lub odrzuca; zaakceptowane → `acceptance_status='accepted'` (widok Aktywne), odrzucone → `acceptance_status='rejected'` (widok Kosz). Wprowadza ujednolicony model zaznaczania (FR-007) i pierwsze dwa filtry główne listy (Pending → Aktywne/Kosz).

Odnośniki PRD: US-02, US-03, FR-007, FR-008 (filtr główny — podzbiór), FR-010, FR-012.
Odblokowuje: S-04 (cykl operacyjny zadania), S-05 (jednolita lista + edycja zaakceptowanych), S-06 (cykl kosza).

Kluczowe decyzje (6/6 z `/10x-plan`):
- **Granica zakresu:** S-03 dokłada minimalne, read-only widoki Aktywne + Kosz + nawigację 3 filtrów głównych (Elementy do akceptacji / Aktywne / Kosz). Zakończone/Anulowane + filtr typu + edycja zaakceptowanych → S-04/S-05; przenieś-do-kosza/przywróć/wyczyść → S-06.
- **UX edycji (OQ6):** modal (shadcn `Dialog`, już obecny) z polami `title`/`description`/`typ`.
- **Utrwalanie edycji:** zapis natychmiastowy (item zostaje `pending`); akceptacja to osobna akcja — edycja jest samodzielną trwałą zdolnością (FR-010).
- **Próg bulk-confirm (OQ4):** potwierdzenie wymagane wyłącznie na ścieżce „zaznacz wszystkie" (niezależnie od liczby); ręczny wybór podzbioru bez potwierdzenia.
- **Aktualizacja UI:** optimistic removal + `sonner` toast, rollback na błędzie (NFR reakcja < 200 ms).
- **Walidacja:** `zod` (już zależnością z S-02 — bez nowej instalacji/audytu) na granicy endpointów dla wielopolowego payloadu (hard rule + lessons.md).

Decyzje rozstrzygnięte samodzielnie (bez wkładu usera):
- **Zero nowych migracji** — schemat S-02 kompletny; accept/reject/edit to UPDATE `acceptance_status` (+ derywacja `operational_status`); istniejący indeks `items_user_acceptance_idx` obsługuje też Aktywne/Kosz.
- **OQ5 (mapowanie typu)** dla pendingów deterministyczne: `typ=task → operational_status='new'`, inaczej `NULL`. Bogatszy wariant (zaakceptowane itemy nie-`new`) → S-05.
- **Kształt API:** `POST /api/items/bulk` `{ids, action}` (wsadowo, atomowo) + `PATCH /api/items/[id]` `{title, description, type}` (edycja). Guard `acceptance_status='pending'` w `WHERE` realizuje FR-007 „działa tylko na uprawnionych, reszta pomijana bez błędu".
- **Nowa zależność:** tylko `sonner` (Faza 3) → `npm audit` + zgoda usera przed instalacją.

GitHub: parent Issue #7 (S-03, etykiety `slice`). Pod-zgłoszenia faz z tego planu (4 fazy → 4 sub-issue `task`).
