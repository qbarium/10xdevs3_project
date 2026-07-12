---
date: 2026-07-12T16:18:47+02:00
researcher: Jakub
git_commit: 265f0e397c62f47fe3bad043cdbd230d5431c8e0
branch: main
repository: qbarium/10xdevs3_project
topic: "Regresja cyklu życia itemu (ryzyko #5, Faza 4) — dwuwymiarowy model stanu i weryfikacja trzech inwariantów"
tags: [research, codebase, items, lifecycle-state, acceptance-status, operational-status, trash-cycle, risk-5, faza-4]
status: complete
last_updated: 2026-07-12
last_updated_by: Jakub
---

# Research: Regresja cyklu życia itemu (ryzyko #5, Faza 4)

**Date**: 2026-07-12T16:18:47+02:00
**Researcher**: Jakub
**Git Commit**: 265f0e397c62f47fe3bad043cdbd230d5431c8e0
**Branch**: main
**Repository**: qbarium/10xdevs3_project

> Wszystkie odniesienia `plik:linia` wskazują stan kodu na commicie `265f0e3`.

## Research Question

Faza 4 planu testów (`context/foundation/test-plan.md` §3) pokrywa **ryzyko #5**: „Refaktor list/mutacji cicho łamie model dwóch wymiarów stanu (kosz gubi stan operacyjny; `rejected→pending` nie wraca do bramy walidacji; `zrealizowane` nie znika z Aktywne)". Zgodnie z §2 planu badanie ma ustalić w **bieżącym kodzie**:

1. Gdzie żyją zmiany stanu itemu (wspólny serwis) i jakie przejścia są dozwolone (maszyna stanu).
2. Co jest współdzielone między widokami — żeby „test jednego widoku" nie udawał pokrycia całości.
3. Trzy konkretne inwarianty: **kosz pamięta stan operacyjny**; **„odrzucone → do sprawdzenia" wraca do bramki**; **„zrealizowane" znika z Aktywnych** — gdzie każdy jest egzekwowany, jaki refaktor mógłby go cicho złamać, co już jest przypięte testem, a co jest luką, i jaki jest najtańszy sensowny test.

## Summary

**Model dwóch wymiarów to dwie niezależne kolumny enum na tabeli `items`**, nie jedna: `acceptance_status` (`pending`/`accepted`/`rejected`/`deleted`) i `operational_status` (`new`/`in_progress`/`done`/`cancelled`). „Kosz" nie jest osobną kolumną ani flagą — żyje w wymiarze akceptacji jako `rejected` + `deleted`. „Zrealizowane" to `operational_status='done'` w wymiarze operacyjnym. **Nie istnieje** kolumna `trashed_at`, `previous_status` ani `realized_at` (potwierdzone grepem migracji i pełnym schematem tabeli).

**Wszystkie zapisy stanu są scentralizowane w jednym pliku** — `src/lib/services/items-mutation.ts` — plus funkcja SQL `persist_classification` (zapis przy imporcie). Odczyty i predykaty widoków są w drugim pliku — `src/lib/services/items.ts` (`listItems`). Widoki (Do akceptacji / Aktywne / Zakończone / Anulowane / Kosz) są **wyprowadzane** z pary dwóch kolumn w locie, nie przechowywane. To dobra wiadomość dla testów: powierzchnia mutacji jest wąska i każdy UPDATE jest strzeżony statusem źródłowym w klauzuli SQL WHERE.

**Rozkład pokrycia trzech inwariantów jest bardzo nierówny — i to on wyznacza pracę Fazy 4:**

| Inwariant | Gdzie egzekwowany | Stan pokrycia |
| --- | --- | --- |
| (a) kosz pamięta stan operacyjny | `moveToTrash` / `restoreFromTrash` — przez **nietykanie** `operational_status` | **LUKA — zero testów** |
| (b) `rejected→pending` wraca do bramki | drugi guarded UPDATE w `restoreFromTrash` | **LUKA na zachowaniu** — kształt zapytania przypięty mockiem, realne przejście DB + powrót do bramki nietestowane |
| (c) zrealizowane znika z Aktywnych | predykat `active` (allowlista) + rekonsyliacja kliencka | **JUŻ PRZYPIĘTE** — serwer (unit + integracja) i klient |

Kluczowa obserwacja: **istniejące testy cyklu kosza to wyłącznie testy IDOR z Fazy 2** (użytkownik B nie rusza itemów użytkownika A). Faza 2 przypięła **wymiar bezpieczeństwa** tych samych funkcji (`moveToTrash`/`restoreFromTrash`/`emptyTrash`), a zostawiła **wymiar cyklu życia** całkowicie otwarty. To dokładna ilustracja tezy planu o dwóch wymiarach: te same funkcje, ortogonalna troska.

**Praca Fazy 4:** napisać dwa testy integracyjne round-trip na wspólnym serwisie — (a) `move→restore` zachowuje `operational_status`, (b) `restore(rejected)→pending` i item wraca do widoku „Do akceptacji". Inwariant (c) zostawić bez nowego testu (ewentualnie jeden opcjonalny, cienki test przebiegu-tranzycji). Wzorzec: `tests/integration/items-mutation.integration.test.ts`, uruchamiany `npm run test:integration` (wymaga lokalnego Supabase).

**Jedna pułapka dla autora testu:** „kosz pamięta stan" dotyczy **wyłącznie wymiaru operacyjnego** (`operational_status`). Wymiar akceptacji **nie jest** przez nic pamiętany — przywrócenie jest deterministyczne (`deleted→accepted`, `rejected→pending`). Nie wolno asertować „odrzucone wraca jako odrzucone" — to fałszywe oczekiwanie.

## Detailed Findings

### 1. Dwuwymiarowy model stanu — dwie kolumny enum

Model to dwie osobne kolumny na tabeli `public.items` (`supabase/migrations/20260610052532_classification_schema.sql:49-60`), zaprojektowane jako niezależne od początku (komentarz `…schema.sql:2-3`: „Pełny model dwóch niezależnych wymiarów (akceptacja × operacyjny) od razu").

**Wymiar A — `acceptance_status`** (enum, `…schema.sql:16`): `pending | accepted | rejected | deleted`. `NOT NULL DEFAULT 'pending'` (`…schema.sql:56`). Typ TS: `src/types.ts:73`. Tu żyje kosz: `deleted` = soft-delete zaakceptowanego itemu, `rejected` = odrzucony w bramie. Twardego DELETE wiersza w cyklu życia nie ma — jedyny twardy DELETE to „Wyczyść kosz".

**Wymiar B — `operational_status`** (enum, `…schema.sql:19`): `new | in_progress | done | cancelled`. Kolumna **nullable, bez defaultu** (`…schema.sql:57`). Typ TS: `src/types.ts:79`. Tu żyje „zrealizowane" (`done`) i „anulowane" (`cancelled`).

**Zmiana kształtu (S-04) — aktualny stan:** `supabase/migrations/20260615152731_operational_status_all_types.sql` robi backfill `NULL→'new'` dla wszystkich istniejących itemów (`:15-17`), dokłada indeks `(user_id, acceptance_status, operational_status)` (`:22-23`) i nadpisuje RPC tak, że **każdy** typ (nie tylko `task`) dostaje `operational_status='new'` przy imporcie (`:50`). Kolumna pozostaje technicznie nullable, ale kod i RPC zawsze ustawiają wartość (komentarz `:11-12`).

**Czego NIE ma:** brak kolumny `trashed_at`/`deleted_at`, `previous_status`/`prev_status`, `realized_at`/`fulfilled`. Potwierdzone grepem migracji (zero trafień) i pełnym odczytem schematu. Skutek: „przynależność do widoku" nie jest przechowywana — jest wyprowadzana z pary `(acceptance_status, operational_status)`. Restore nie ma skąd odczytać „stanu sprzed kosza", bo takiego pola nie ma — działa deterministycznie ze statusu źródłowego (patrz §5a).

### 2. Powierzchnia mutacji — `src/lib/services/items-mutation.ts`

Wszystkie mutacje `items` idą przez klienta Supabase z RLS (ciasteczka użytkownika, **nie** service-role — komentarz `items-mutation.ts:1-7`). Każdy UPDATE jest strzeżony statusem w klauzuli WHERE, co realizuje FR-007 („działa tylko na uprawnionych, reszta pomijana bez błędu").

| Funkcja | Linia | Przejście / zapis | Guard (WHERE) | Zwraca |
| --- | --- | --- | --- | --- |
| `deriveOperationalStatus` | `:48` | zawsze `'new'` (S-04) | — | `OperationalStatus` |
| `createManualItem` | `:62` | INSERT `accepted` / `new` / `session=NULL` (S-07) | — | `Item` |
| `setAcceptanceStatus` | `:95` | `pending → accepted \| rejected` | `eq('acceptance_status','pending')` | `Item[]` (S-10) |
| `setOperationalStatus` | `:119` | dowolny `operational_status` (m.in. `done`) | `eq('acceptance_status','accepted')` | `{ updatedIds }` |
| `moveToTrash` | `:143` | `accepted → deleted`; **nie tyka** `operational_status` | `eq('acceptance_status','accepted')` | `{ updatedIds }` |
| `restoreFromTrash` | `:170` | DWA UPDATE-y: `deleted → accepted` (`:172-178`) i `rejected → pending` (`:181-187`) | `eq(...,'deleted')` / `eq(...,'rejected')` | `Item[]` (S-10) |
| `emptyTrash` | `:200` | twardy DELETE `rejected` + `deleted` (globalny, bez `ids`) | `in('acceptance_status',['rejected','deleted'])` | `{ deletedCount }` |
| `editItem` | `:224` | `title/description/type/operational_status` jawnie z wejścia | `in(...,['pending','accepted'])` + compare-and-swap `updated_at` | `Item` |

Zapis przy imporcie: `persistItems` (`src/lib/services/import-session.ts:31`) woła RPC `persist_classification`, która wstawia itemy z `acceptance_status='pending'` + `operational_status='new'`.

Dwie rzeczy istotne dla inwariantów:
- **`moveToTrash` celowo zapisuje tylko `acceptance_status`** (`items-mutation.ts:146`), komentarz `:140-141`: „Stan operacyjny NIETKNIĘTY — kosz i stan operacyjny to dwa niezależne wymiary (FR-009), więc po przywróceniu item wraca dokładnie do swojego stanu". To jest cały mechanizm inwariantu (a).
- **`restoreFromTrash` to dwa osobne guarded UPDATE-y**, nie jeden — właśnie po to, żeby `deleted` wracał na `accepted`, a `rejected` na `pending` (`:172-188`). To jest cały mechanizm inwariantu (b).

### 3. Warstwa odczytu i predykaty widoków — `src/lib/services/items.ts`

Jedna funkcja `listItems` (`items.ts:72`) składa w jedno zapytanie predykat widoku (`switch` `:81-97`), filtr typu, podfiltr operacyjny (tylko dla `active`), wyszukiwanie i sort. Widoki są wyprowadzane, nie przechowywane:

| Widok | Predykat | Linia |
| --- | --- | --- |
| `pending` (Do akceptacji = brama walidacji) | `acceptance='pending'` | `items.ts:83` |
| `active` (Aktywne) | `acceptance='accepted'` **AND** `operational IN ('new','in_progress')` | `items.ts:86` |
| `done` (Zakończone) | `acceptance='accepted'` AND `operational='done'` | `items.ts:89` |
| `cancelled` (Anulowane) | `acceptance='accepted'` AND `operational='cancelled'` | `items.ts:92` |
| `trash` (Kosz) | `acceptance IN ('rejected','deleted')` | `items.ts:95` |

Predykat `active` jest **allowlistą** (`.in('operational_status',['new','in_progress'])`), więc `done` i `cancelled` wypadają strukturalnie — to mechanizm inwariantu (c) na serwerze.

Odgałęzienie: `getSessionItems` (`items.ts:138`) — tryb sesji (S-10/S-13) filtruje po `import_session_id` i **świadomie NIE filtruje stanu akceptacji** (komentarz `:130-137`), więc pokazuje wszystkie cztery stany naraz; sort `created_at ASC`, więc zmiana stanu nigdy nie przesuwa wiersza. Nie przechodzi przez `switch` widoków.

### 4. Konsumenci stanu w widokach — dlaczego „test jednego widoku" nie wystarcza

**Warstwa wspólna** (jedna zmiana rozchodzi się na wszystkie widoki):
- `listItems` `switch` predykatów — `items.ts:81-97` (pięć widoków, jedno zapytanie).
- Hook `useItemList` (`src/components/hooks/useItemList.ts`) — używany przez wszystkie wyspy list; fetch, URL/historia, paginacja, optimistic update.
- Parser `parseListCriteria` (`src/lib/services/list-criteria.ts`) — jedno źródło kryteriów dla SSR, endpointu i klienta.
- Endpoint `GET /api/items` (`src/pages/api/items/index.ts:33`).

**Warstwa per-widok** (refaktor może zepsuć jeden widok, gdy inne nadal przechodzą testy) — każda wyspa nakłada zmiany optimistycznie WŁASNYM predykatem, który musi ręcznie zgadzać się z serwerowym:
- `PendingItemsView.tsx` — po accept/reject bezwarunkowe `removeByIds` (założenie „każdy pending znika po akcji").
- `AcceptedItemsView.tsx` (`active`/`done`/`cancelled`) — kliencka rekonsyliacja `reconcileAfterChange` (`src/components/items/operational-view.ts:28`) usuwa itemy, których nowy stan wypada poza predykat widoku.
- `TrashItemsView.tsx` — `removeByIds` po restore; czyszczenie listy do `[]` po „Wyczyść kosz".
- `SessionEntriesView.tsx` — odwrotna semantyka: wpis NIGDY nie znika, tylko jest podmieniany w miejscu (`replaceRow`); „Do kosza" lokalnie ustawia `acceptance_status:'deleted'` bez usunięcia.

Klient ma **własną kopię** predykatu Aktywnych: `matchesView` (`operational-view.ts:15-20`) powiela `new|in_progress`. Jeśli refaktor zmieni skład Aktywnych na serwerze (np. `active` przestanie być allowlistą), a nie ruszy `matchesView`, serwer i klient rozjadą się — i odwrotnie. To jest właśnie ślepy zaułek: jeden widok testowany, drugi cicho zepsuty.

### 5. Trzy inwarianty — egzekucja i tryb cichej awarii

#### (a) Kosz pamięta stan operacyjny — POTWIERDZONE (przez przemilczenie)

**Gdzie:** `moveToTrash` (`items-mutation.ts:143-153`) i `restoreFromTrash` (`:170-191`) piszą **wyłącznie** `acceptance_status`. Wartość `operational_status` przeżywa podróż do kosza i z powrotem, bo nikt jej nie nadpisuje. Nie ma kolumny „stan sprzed kosza" — nie jest potrzebna (komentarz `:159-160`).

**Cichy tryb awarii:** refaktor, który przy koszowaniu/przywracaniu „normalizuje" oba wymiary jednym payloadem — np. wspólny helper mutacji zawsze zapisujący obie kolumny, albo dopisanie `operational_status:'new'` do UPDATE w `moveToTrash`/`restoreFromTrash` pod hasłem „czysty start po przywróceniu". Skutek: item `in_progress` (albo `done`) po cyklu kosz→przywróć wraca jako `new`. Postęp znika; item `done` po przywróceniu ląduje w Aktywnych zamiast w Zakończonych. Test dotykający tylko wymiaru akceptacji tego nie złapie.

#### (b) `rejected → pending` wraca do bramy walidacji — POTWIERDZONE

**Gdzie:** drugi guarded UPDATE w `restoreFromTrash` — `items-mutation.ts:181-187`: `.update({acceptance_status:'pending'}).eq('acceptance_status','rejected')`. Item wraca do bramy, bo widok `pending` filtruje `acceptance='pending'` (`items.ts:83`), a to jest strona „Do akceptacji". Ścieżka UI: „Przywróć" w Koszu → `POST /api/items/bulk` action `restore` (`src/pages/api/items/bulk.ts:44`) → `restoreFromTrash`.

**Cichy tryb awarii:** „uproszczenie" dwóch UPDATE-ów do jednego, np. `.update({acceptance_status:'accepted'}).in('acceptance_status',['deleted','rejected'])`. Wtedy item **odrzucony** (użytkownik świadomie odrzucił go w bramie, nigdy nie był zaakceptowany) po przywróceniu trafia prosto na `accepted` i ląduje w Aktywnych, całkowicie omijając bramę walidacji. Śmieć błędnie sklasyfikowany przez AI, który użytkownik odrzucił, wraca jako zaakceptowana treść. Obie wersje „przywracają z kosza" i obie przejdą szybki test na itemach `deleted` — różnica ujawnia się **tylko na itemie `rejected`**.

#### (c) Zrealizowane znika z Aktywnych — POTWIERDZONE (dwa punkty egzekucji)

„Zrealizowany" = `operational_status='done'`, ustawiane przez `setOperationalStatus` (`items-mutation.ts:119`) lub `editItem` (`:236`). Odfiltrowanie z Aktywnych ma dwie warstwy, które muszą być zgodne:
- **Serwer:** allowlista `active` — `items.ts:86` (`done` nie jest na liście → wypada).
- **Klient (lustro):** `matchesView('done','active')→false` (`operational-view.ts:17`) + `reconcileAfterChange` (`:28-37`) usuwa świeżo oznaczony `done` z listy po mutacji.

**Cichy tryb awarii:** zamiana allowlisty na wykluczenie, np. `.neq('operational_status','cancelled')` (pozornie sensowne „aktywne = zaakceptowane i nieanulowane") albo skrócenie predykatu do samego `acceptance='accepted'`. Wtedy `done` zostaje w Aktywnych. Bliźniacze ryzyko po stronie klienta: gdyby gałąź `active` w `matchesView` przepisać na `status !== 'cancelled'`, `reconcileAfterChange` zostawiłby oznaczony `done` na liście do następnego re-fetchu (błąd przejściowy: dobrze po reloadzie, źle zaraz po kliknięciu).

### 6. Istniejące pokrycie testów zmapowane na inwarianty

Guardy siedzą w SQL WHERE, więc **testy jednostkowe z mockiem query-buildera dowodzą tylko KSZTAŁTU zapytania**; realny round-trip stanu wymaga integracji z lokalnym Supabase. To rozróżnienie decyduje o rekomendacji w §7.

**Inwariant (a) — kosz pamięta stan operacyjny → CAŁKOWITA LUKA.**
- Unit: brak. `items-mutation.test.ts` nie ma bloku `describe` dla `moveToTrash` ani `emptyTrash` — pokrywa `deriveOperationalStatus`/`createManualItem`/`setAcceptanceStatus`/`setOperationalStatus`/`restoreFromTrash`/`editItem`. Nikt nie przypina, że payload `moveToTrash` pomija `operational_status`.
- Integracja: `tests/integration/items-mutation.integration.test.ts:278-307` testuje **tylko IDOR** (B nie przenosi/przywraca/opróżnia kosza A). Round-trip właściciela (`move→restore` zachowuje `operational_status`) nie istnieje. Test restore `:285-292` wstawia item `deleted` i nigdy nie asertuje stanu operacyjnego.

**Inwariant (b) — `rejected→pending` → CZĘŚCIOWO (kształt), realny przebieg = LUKA.**
- Unit: `items-mutation.test.ts:154-172` przypina, że `restoreFromTrash` buduje oba guarded UPDATE-y, w tym `eq('acceptance_status','rejected')` (`:166-167`). Ale to mock — **nie asertuje, że payload gałęzi rejected pisze `'pending'`**, ani że baza to honoruje.
- Integracja: brak round-tripu `rejected→pending`. Test restore `:285-292` używa `deleted` (nie `rejected`) i sprawdza tylko IDOR. Inne testy dotykające `rejected` (`:145-154` accept pomija rejected; `:232-243` edit rejected → `ItemNotEditableError`) nie dowodzą przejścia `restore(rejected)→pending`.

**Inwariant (c) — zrealizowane znika z Aktywnych → JUŻ PRZYPIĘTE.**
- Unit (kształt): `items.test.ts:53-58` (`active` = `eq accepted` + `in ['new','in_progress']`, `done` wykluczone).
- Integracja (realne dane): `tests/integration/items-operational.integration.test.ts:98-126`, w szczególności `:113` `expect(active).not.toContain(doneId)`. Plus guard `setOperationalStatus` (accepted-only) `:87-96`.
- Klient: `src/components/items/operational-view.test.ts:38-56` (`reconcileAfterChange` usuwa `new→done` z Aktywnych).

**Pokrycie poboczne (kontekst, nie inwarianty #5):** izolacja per-user na `editItem`/bulk (Faza 2), zachowanie/zmiana `operational_status` przy edycji S-05 (`items-mutation.integration.test.ts:156-193`), compare-and-swap 409 (`:210-230`), predykaty wszystkich widoków i sort/okno (`items.test.ts`). Endpointy (`bulk.test.ts`, `trash/empty.test.ts`) mockują serwis — pilnują tylko kontraktu endpointu (auth, zod, kształt `{ok,...}`), jawnie delegując warstwę serwis→RLS→DB do integracji.

### 7. Najtańszy test na każdy inwariant

Podstawa: `test-plan.md:78` (najtańszy sensowny test dla #5 = „jednostkowy/integracyjny na wspólnym serwisie zmian, nie osobny test «od kliknięcia» dla każdego widoku"; „czego nie robić: test, który tylko powtarza implementację"). Faza 4 jest typowana **„unit + integration"** (`test-plan.md:93`). Wzorzec warstwy serwisowej z §6.2/§6.4 planu to `tests/integration/items-mutation.integration.test.ts`.

**Inwariant (a) → INTEGRACYJNY (nowy test — najwyższy priorytet).**
Scenariusz: wstaw `accepted` + `operational_status='in_progress'` (i wariant `done`) → `moveToTrash(A)` → sprawdź `acceptance='deleted'` i `operational_status` bez zmian → `restoreFromTrash(A)` → asertuj `acceptance='accepted'` **oraz `operational_status` nadal `'in_progress'`**. Dlaczego nie unit: mock „payload pomija `operational_status`" tylko powtarza implementację (`test-plan.md:78` „czego nie robić") i nie złapie DB-defaultu/triggera resetującego kolumnę. Referencja: reużyj `signUpClient`/`insertItem`/`rowOf`/`statusOf` z `items-mutation.integration.test.ts` — blok IDOR kosza `:278-307` ma już cały setup, dołóż ścieżkę round-trip właściciela.

**Inwariant (b) → INTEGRACYJNY (nowy test — najwyższy priorytet, najgroźniejsza luka).**
Scenariusz: wstaw `rejected` (A) → `restoreFromTrash(A)` → asertuj `acceptance='pending'` na realnej bazie, a idealnie `listItems(A, defaultCriteria('pending'))` teraz zawiera item (realny powrót do bramki). Domknij symetryczną gałąź `deleted→accepted` tym samym round-tripem. Dlaczego nie unit: kształt zapytania jest już przypięty mockiem — brakuje dowodu, że baza faktycznie robi `rejected→pending` i że item pojawia się w widoku pending. Referencja: rozszerz istniejący test restore `:285-292` o asercję po stronie właściciela.

**Inwariant (c) → JUŻ POKRYTE — nowy test niekonieczny.**
Najtańszy test już istnieje (unit kształt `items.test.ts:53-58` + integracja realne dane `items-operational.integration.test.ts:113`). Dodawanie kolejnego = powtarzanie implementacji. Opcjonalnie, najniższy priorytet: cienki integracyjny przebieg-tranzycja (`setOperationalStatus(A,[id],'done')` a potem `listItems(A, active)` nie zawiera id) — obie połowy już przypięte osobno, więc złożenie daje marginalny sygnał.

## Code References

- `supabase/migrations/20260610052532_classification_schema.sql:16,19,49-60` — enumy `acceptance_status`/`operational_status` + tabela `items`.
- `supabase/migrations/20260615152731_operational_status_all_types.sql:11-17,50` — S-04: `operational_status` dla wszystkich typów, backfill, RPC.
- `src/types.ts:73,79,127-138` — `AcceptanceStatus`, `OperationalStatus`, DTO `Item`.
- `src/lib/services/items-mutation.ts:143-153` — `moveToTrash` (nie tyka `operational_status`) — inwariant (a).
- `src/lib/services/items-mutation.ts:170-191` — `restoreFromTrash` (dwa guarded UPDATE-y `deleted→accepted`, `rejected→pending`) — inwarianty (a) i (b).
- `src/lib/services/items-mutation.ts:119-133` — `setOperationalStatus` (ustawia `done`).
- `src/lib/services/items-mutation.ts:224-259` — `editItem` (jawny `operational_status`, compare-and-swap).
- `src/lib/services/items.ts:81-97` — `switch` predykatów widoków; `:86` allowlista `active` — inwariant (c) serwer.
- `src/lib/services/items.ts:138-158` — `getSessionItems` (scope po sesji, bez filtra akceptacji).
- `src/components/items/operational-view.ts:15-20,28-37` — kliencki `matchesView`/`reconcileAfterChange` — inwariant (c) klient.
- `tests/integration/items-mutation.integration.test.ts:278-307` — istniejące testy kosza (tylko IDOR).
- `tests/integration/items-operational.integration.test.ts:98-126` — inwariant (c) na realnej bazie.
- `src/lib/services/items-mutation.test.ts:154-172` — `restoreFromTrash` kształt zapytania (mock).
- `src/lib/services/items.test.ts:45-78` — predykaty wszystkich widoków (mock).
- `src/components/items/operational-view.test.ts:38-56` — kliencka rekonsyliacja (c).

## Architecture Insights

- **Widoki są wyprowadzane, nie przechowywane.** Nie ma kolumny „lista" ani „widok" — przynależność do Aktywne/Zakończone/Kosz wynika z pary `(acceptance_status, operational_status)`. To upraszcza mutacje (zmiana jednej kolumny „przenosi" item między widokami), ale znaczy, że **spójność widoków to spójność predykatów**, powielonych na serwerze (`items.ts`) i częściowo na kliencie (`operational-view.ts`).
- **Guard w SQL WHERE → dwa poziomy dowodu.** Mock query-buildera dowodzi, że serwis buduje właściwy guard (kształt); tylko realna baza dowodzi, że przejście faktycznie zachodzi i że kolumna przeżywa. Dla ryzyka #5 (regresja zachowania, nie składni) liczy się poziom integracyjny.
- **Dwa wymiary są ortogonalne z premedytacją.** `moveToTrash` nie tyka `operational_status`, a `setOperationalStatus`/`editItem` nie tykają kosza. Inwariant (a) to bezpośrednia konsekwencja tej ortogonalności — a najłatwiej ją złamać „sprzątającym" refaktorem, który zaczyna zapisywać obie kolumny naraz.
- **Restore jest deterministyczny, nie pamięciowy.** Brak kolumny `previous_status` to świadoma decyzja: `deleted` może pochodzić tylko z `move-to-trash(accepted)`, a `rejected` tylko z `reject(pending)`, więc sam marker kosza koduje pochodzenie. Autor testu musi to uszanować — inwariant (a) dotyczy `operational_status`, a nie odtworzenia poprzedniego `acceptance_status`.
- **Edycja jawnie zapisuje `operational_status` (decyzja #3, S-05).** Wcześniejsze ryzyko cichego resetu przez auto-derywację (`→'new'`) zostało zamknięte przez zapisywanie wartości z wejścia; jest przypięte testem (`items-mutation.integration.test.ts:156-176`). To sąsiad inwariantu (a), ale osobna ścieżka (edycja, nie kosz).

## Historical Context (from prior changes)

- **S-06, cykl kosza** — `context/archive/2026-06-16-trash-lifecycle/plan.md`. Źródło `moveToTrash`/`restoreFromTrash`/`emptyTrash`, dwukierunkowego restore i decyzji „bez kolumny previous_status" (FR-013, FR-016). To rdzeń inwariantów (a) i (b).
- **S-04, wymiar operacyjny dla wszystkich typów** — `context/archive/2026-06-15-task-operational-lifecycle/plan.md`. „Wyłom z FR-009": `operational_status` przestaje być tylko dla `task`; backfill `NULL→'new'`. Rdzeń inwariantu (c).
- **S-05, ujednolicona lista + edycja** — `context/archive/2026-06-15-unified-list-and-edit/plan.md`. Jedna `listItems` zamiast pięciu funkcji widoku; edycja `pending`+`accepted` z jawnym `operational_status` (decyzja #3, zachowanie postępu).
- **S-03, walidacja accept/reject** — `context/archive/2026-06-13-validation-accept-reject/plan.md`. Brama walidacji: `pending → accepted|rejected`, guard `pending`. Też źródło znanego ograniczenia „lost update" (patrz `lessons.md`).
- **S-07, itemy ręczne** — `context/archive/2026-06-16-manual-item-entry/plan.md`. `createManualItem` z niezmiennikami serwera (`accepted`/`new`/`session=NULL`), fail-closed na przemyconych polach stanu.
- **S-10, panel sesji (master-detail)** — `context/archive/2026-06-24-session-items-detail/research.md` + `plan.md`. Powód, dla którego `setAcceptanceStatus`/`restoreFromTrash` zwracają `Item[]` (świeży `updated_at` dla compare-and-swap). Uwaga: Faza 2 naprawiła 3 przeterminowane asercje oczekujące jeszcze `{updatedIds}` (`test-plan.md:199`).
- **S-13, tryb sesji** — `context/archive/2026-07-01-session-entries-mode/plan.md` + `frame.md`. `?session=<id>` przełącza listę w rejestr jednej sesji (odwrotna semantyka: wpis nigdy nie znika, tylko podmiana w miejscu). Też okno paginacji w `listItems`.
- **Faza 2 testów, izolacja per-user** — `context/archive/2026-07-12-testing-per-user-isolation/{research,plan}.md`. Przypięła IDOR cyklu kosza (te same `moveToTrash`/`restoreFromTrash`/`emptyTrash`, wymiar bezpieczeństwa) i **świadomie odroczyła** utwardzenie mutacji jawnym filtrem `user_id` jako zmianę produktu, nie test (`test-plan.md:213`). Faza 4 bierze te same funkcje od strony cyklu życia.

## Related Research

- `context/archive/2026-07-07-testing-security-privacy-invariants/research.md` — Faza 1 (ryzyka #1, #4).
- `context/archive/2026-07-12-testing-per-user-isolation/research.md` — Faza 2 (ryzyko #2, IDOR — najbliższy poprzednik, te same funkcje kosza).
- `context/archive/2026-07-12-testing-classifier-contract-session-state/research.md` — Faza 3 (ryzyka #6, #3 część deterministyczna).
- `context/foundation/test-plan.md` §2 (wiersz #5), §3 (Faza 4), §6.2/§6.4 (książka kucharska testów integracyjnych/endpointów).

## Open Questions

- **`restoreFromTrash` nie jest transakcyjny** (dwa UPDATE-y, świadome ograniczenie solo-MVP, `items-mutation.ts:161-163`). Przy mieszanej selekcji `rejected`+`deleted`, jeśli drugi UPDATE rzuci po pierwszym, endpoint zwraca 500, ale stan per-item pozostaje spójny. Do decyzji planu: pokrywać ten tryb testem, czy zostawić jako świadomie niepokryty (analogicznie do §7 planu)?
- **Pułapka NULL w wymiarze operacyjnym.** `operational_status` jest nullable, a wszystkie widoki accepted wykluczają NULL (allowlista/`eq`); `matchesView(null)→false`. Nowa ścieżka zapisu wstawiająca `accepted` item bez `operational_status` uczyniłaby go niewidocznym we wszystkich widokach naraz. To sąsiad inwariantu (c) — opcjonalny test regresji „accepted + NULL nie znika z systemu"?
- **Zakres asercji dla (b):** czy test ma dowodzić tylko kolumny (`acceptance='pending'`), czy też realnego powrotu do widoku (`listItems(pending)` zawiera item)? Rekomendacja badania: oba — sama kolumna nie dowodzi „wraca do bramki", dopiero widok zamyka inwariant.
- **Oryginalne uzasadnienia z archiwum (S-03/S-10/S-13):** proweniencję niosą komentarze w kodzie (ID slice'ów, numery FR), więc badanie jest kompletne bez sięgania do `plan.md` w archiwum. Gdyby plan potrzebował dosłownych cytatów decyzji, źródła są wypunktowane w „Historical Context".
