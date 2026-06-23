---
change_id: list-filters-search
title: Filtry dodatkowe list — sortowanie, wyszukiwanie, podfiltr stanu
status: archived
created: 2026-06-20
updated: 2026-06-23
archived_at: 2026-06-23T19:56:22Z
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- **2026-06-21/22 — przegląd planu (`/10x-plan-review`, tryb głęboki) — triaż ZAKOŃCZONY:** werdykt wejściowy DO POPRAWY (3 krytyczne, 5 ostrzeżeń); po naprawach → SOLIDNY. Wszystkie 8 ustaleń naprawione w `plan.md`/`plan-brief.md`: **F1** (hook `useItemList` zyskuje `applyOptimistic` — bez niego optimistic mutacje + create flow S-07 by się zepsuły), **F2** (back/forward: `pushState` dla zmian dyskretnych + `replaceState` dla liter wyszukiwania + listener `popstate`; samo `replaceState` nie dawało historii), **F3** (`GET /api/items` BEZ osobnego zod — jeden walidator `parseListCriteria`, manualny guard `view`, clamp `q`; świadome odchylenie od twardej reguły „zod dla wejścia wielopolowego", zaakceptowane przez użytkownika), **F4** (wyszukiwanie `.or()` — neutralizacja delimiterów PostgREST `, ( ) .` obok `%`/`_`), **F5** = wariant A (`AbortController` — każde `setCriteria` anuluje poprzedni fetch; `AbortError` połykany; chroni przed „stale wins"), **F6** = Poprawka A (stały łańcuch tie-break `created_at DESC` potem `id ASC`; powód: `items.id` to losowy UUID `gen_random_uuid`, więc sam `id` stabilizuje, ale układa losowo — `created_at` daje chronologiczny porządek paczek bulk-akcji o wspólnym `updated_at`; §4 znów spójne z §3), **F7** (spójność Postęp↔Faza: Faza 3 bez bramki ręcznej, Faza 4 rozbita 4.5→4.5+4.6), **F8** (widoczny komunikat błędu fetchu w Fazie 5). Następny krok łańcucha: `/10x-implement list-filters-search phase 1`.
- **2026-06-20 — zmiana zakresu (rozbicie na S-09 + S-10):** filtr po sesji importu wypadł z S-09 (nie skaluje się — sesji mogą być tysiące) i przeniósł się do nowego wycinka **S-10 `session-items-detail`** jako widok master-detall w dzienniku sesji. Kanon zaktualizowany w tej samej turze: PRD FR-008/FR-015 (sesja poza filtrami listy), FR-027 (podgląd elementów sesji wchodzi do zakresu), roadmapa (S-09 zawężony, S-10 dodany), GitHub (#13 zaktualizowane, #82 utworzone). Szczegóły w `roadmap.md` (S-09/S-10).
- **Decyzje projektowe (sesja planowania 2026-06-20):**
  - Filtrowanie **po stronie serwera**, stan filtrów w **adresie strony (URL query params)** — nowy `GET /api/items`; SSR czyta te same parametry dla renderu początkowego (hydration-stable).
  - **Migracja filtra typu** z modelu klient + cookie (`tl_typefilter`, `applyTypeFilter`) na serwer + URL — dotyczy działających widoków (S-05/S-06).
  - **Data wyłącznie jako klucz sortowania** (utworzenia / modyfikacji), bez zakresu „od–do".
  - **Sortowanie: jedno pole naraz** (tytuł / data utworzenia / data modyfikacji), single-select, każde z kierunkiem; tie-break po `id` (stabilizacja, nie drugie kryterium użytkownika).
  - **Podfiltr stanu operacyjnego** tylko w widoku **Aktywne** (jedyny widok z >1 stanem: `new` + `in_progress`).
  - **„Elementy do akceptacji" (pending)** dostaje spójnie: filtr typu (nowy — dziś go brak), wyszukiwanie (tytuł+opis), sortowanie (tytuł / utworzenia / modyfikacji). **Bez** podfiltra stanu operacyjnego (pending nie ma stanu operacyjnego).
  - **Zmiana dowolnego filtra czyści zaznaczenie**; pusty wynik = czytelny komunikat.
