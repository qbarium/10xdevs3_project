# Walidacja — akceptacja, odrzucenie i edycja pendingów (S-03) — Krótki plan

> Pełny plan: `context/changes/validation-accept-reject/plan.md`

## Co i dlaczego

Domykamy łańcuch gwiazdy przewodniej: po tym, jak S-02 zamienia wsad na typowane pendingi, S-03 daje użytkownikowi **warstwę akceptacji** — zaznaczyć, zatwierdzić (z edycją) lub odrzucić itemy, by zaakceptowane trafiły do Aktywne, a odrzucone do Kosza. To realizacja sedna produktu: decyzja „czym to jest" zostaje przy użytkowniku, ale w tanim momencie przeglądu.

## Punkt wyjścia

S-02 dostarczył kompletny schemat (`items` z `acceptance_status`/`operational_status`, RLS, indeksy) oraz **read-only** widok pendingów (`src/pages/items.astro` + `PendingItemsList.astro` z komentarzem „granica S-03"). Brakuje wyłącznie warstwy mutacji i interaktywnego UI — żadnej nowej tabeli.

## Pożądany stan końcowy

Na `/items` użytkownik zaznacza pendingi (per-item + „zaznacz wszystkie"), klika „Zatwierdź zaznaczone" lub „Odrzuć zaznaczone" (itemy znikają natychmiast z toastem) i widzi je w read-only widokach Aktywne / Kosz, między którymi przełącza nawigacja filtra głównego. Pojedynczy pending edytuje w modalu (`title`/`description`/`typ`) z zapisem od razu.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Granica zakresu | Minimalne Aktywne + Kosz (read-only) + nawigacja 3 filtrów | Dowodzi US-02/US-03 end-to-end; zgodne z roadmapą „pierwsze dwa filtry główne" | Plan |
| UX edycji (OQ6) | Modal (shadcn `Dialog`) | Komponent już obecny; izoluje edycję, pasuje do „poprawka przed akceptacją" | Plan |
| Utrwalanie edycji | Zapis od razu, akceptacja osobno | Edycja to samodzielna trwała zdolność (FR-010); przetrwa nawigację | Plan |
| Próg bulk-confirm (OQ4) | Potwierdzenie tylko na „zaznacz wszystkie" | Zero tarcia przy świadomym wyborze; bramka na hurtowym geście | Plan |
| Aktualizacja UI | Optimistic + toast, rollback na błędzie | Spełnia NFR < 200 ms; wrażenie natychmiastowości | Plan |
| Walidacja payloadu | `zod` (już zależnością z S-02) | Hard rule „wielopolowe → zod"; bez nowej instalacji/audytu | Plan |
| Mapowanie typu (OQ5) | Derywacja: task→`new`, inaczej `NULL` | Pendingi zawsze `new`/`NULL` — bezstratne; bogatszy wariant → S-05 | Plan |
| Migracje | Brak | Schemat S-02 kompletny; accept/reject/edit to UPDATE | Plan |

## Zakres

**W zakresie:** model zaznaczania (per-item + select-all); akcje zbiorcze zatwierdź/odrzuć; edycja pendingu w modalu (title/description/typ, zapis natychmiastowy); minimalne read-only Aktywne + Kosz; nawigacja 3 filtrów głównych; endpointy `POST /api/items/bulk` + `PATCH /api/items/[id]` z walidacją zod.

**Poza zakresem:** przenieś-do-kosza/przywróć/wyczyść (S-06); edycja zaakceptowanych na liście (S-05); stan operacyjny + Zakończone/Anulowane (S-04); filtr typu i filtry dodatkowe (S-05/S-09); próg liczbowy bulk-confirm; migracje.

## Architektura / Podejście

Backend najpierw (zod → serwis `items-mutation.ts` → endpointy → serwisy odczytu), potem cienkie read-only widoki Aktywne/Kosz + nawigacja, potem React island z zaznaczaniem i akcjami (optimistic + `sonner` toast), na końcu modal edycji. Bulk = jeden atomowy UPDATE `...in('id',ids).eq('acceptance_status','pending')` (RLS dokłada `user_id`; guard statusu realizuje FR-007 „reszta pomijana bez błędu"). Lista pendingów przechodzi z Astro SSR na React island; Aktywne/Kosz zostają SSR.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Backend mutacji | Serwis + endpointy bulk/edit + zod + serwisy odczytu | Semantyka status-guard / RLS w bulk UPDATE |
| 2. Aktywne + Kosz + nawigacja | Read-only widoki docelowe + 3 filtry główne | Ochrona nowych route'ów `/items/*` w middleware |
| 3. Zaznaczanie + accept/reject | React island, optimistic + toast, confirm select-all | Rollback optimistic; nowa zależność `sonner` (audit) |
| 4. Edycja w modalu | Dialog title/description/typ, zapis natychmiastowy | Spójność stanu islandu po podmianie itemu |

**Wymagania wstępne:** S-02 done (schemat + widok pendingów). Lokalny stack Supabase (Docker) do testów integracyjnych.
**Szacowany nakład pracy:** ~3–4 sesje w 4 fazach (1 backend, 3 frontend/UI).

## Otwarte ryzyka i założenia

- `sonner` to jedyna nowa zależność (Faza 3) → wymaga `npm audit` + zgody usera przed instalacją (safe-ops); checkbox/select idą na istniejącym `radix-ui`.
- Brak paginacji w S-03 — „zaznacz wszystkie" obejmuje wszystkie wyświetlane pendingi (safety net 100/sesja z S-02 ogranicza skalę). Sort/wyszukiwanie/filtry → S-09.
- `updated_at` ustawiany jawnie w serwisie; trigger rozważyć w S-04/S-05.

## Kryteria sukcesu (podsumowanie)

- Użytkownik zatwierdza/odrzuca zaznaczone pendingi jednym kliknięciem, z natychmiastowym efektem (< 200 ms) i widocznym rezultatem w Aktywne/Kosz.
- Edycja pendingu (title/description/typ) zapisuje się od razu, item zostaje pending, zmiana typu poprawnie derywuje `operational_status`.
- Pełny przepływ S-02→S-03 (paste → klasyfikacja → walidacja → akceptacja → Aktywne) działa bez błędów stagingowych ani przerwań nawigacyjnych.
