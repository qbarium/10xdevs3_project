---
project: TaskerLight
version: 1
status: draft
created: 2026-06-05
updated: 2026-08-06
prd_version: 1
main_goal: speed
top_blocker: time
---

# Mapa drogowa: TaskerLight

> Wywiedziono z `context/foundation/prd.md` (v1) + `tech-stack.md` + `infrastructure.md` + `context/deployment/deploy-plan.md` + automatycznie zbadana baza kodu.
> Edytuj na miejscu; archiwizuj po zastąpieniu.
> Poniższe elementy są wymienione w kolejności zależności. Tabela „W skrócie" to indeks.
> **Stan synchronizowany w GitHub:** Issues #4–#14 + tablica Projects v2 „TaskerLight" (`https://github.com/users/qbarium/projects/3`). Ten plik pozostaje źródłem prawdy; GitHub jest jego synchronizowanym odbiciem — zasada w `CLAUDE.md` („GitHub jako synchronizowany stan projektu").

## Podsumowanie wizji

TaskerLight przyjmuje surowy, nieuporządkowany wsad głosowo-tekstowy i rozdziela go na typowane itemy (`task` / `note` / `idea` / `decision` / `other`) przez zewnętrznego dostawcę AI w modelu BYOK (użytkownik podaje własny klucz API). Sednem produktu jest przesunięcie decyzji „czym jest ta myśl" z momentu zapisu (drogiego, w terenie) do momentu przeglądu (taniego): AI zdejmuje koszt klasyfikacji, ale użytkownik zachowuje kontrolę przez warstwę akceptacji. MVP jest świadomie okrojony — jeden element wsadu na sesję, przetwarzanie synchroniczne z timeoutem ~60 s — by zmieścić się w budżecie 3 tygodni po godzinach z twardym deadline'em 2026-07-05.

## Gwiazda przewodnia

**S-02: Wklej tekst → klasyfikacja → typowane itemy do akceptacji** — pierwszy moment, w którym surowy wsad realnie zamienia się w sklasyfikowane itemy; dowodzi, że klasyfikacja AI poprawnie typuje (najbardziej ryzykowne założenie produktu, mierzone w Success Criteria jako acceptance rate ≥ 70%).

> „Gwiazda przewodnia" = najmniejszy kompleksowy (end-to-end) wycinek, którego pomyślne dostarczenie udowadnia podstawową hipotezę produktu — umieszczony tak wcześnie, jak pozwalają na to Wymagania wstępne, bo wszystko inne ma znaczenie dopiero, gdy to działa. Pełna ścieżka, którą wskazałeś (wklej → klasyfikacja → walidacja → akceptacja/odrzucenie → zmiana stanu), domyka się dopiero przez kolejne wycinki łańcucha: S-02 (klasyfikacja → pendingi) → S-03 (akceptacja/odrzucenie) → S-04 (cykl operacyjny itemu). **Decyzja projektowa 2026-06-15:** stan operacyjny obejmuje **wszystkie typy** itemów (rozszerzenie pierwotnego FR-009 task-only) — „oznaczenie notatki jako obsłużona / decyzji jako podjęta / pomysłu jako obsłużony" WCHODZI do zakresu, z etykietami stanu per-typ; `zrealizowane`/obsłużone dowolnego typu trafia do widoku Zakończone. Te wycinki są sekwencjonowane jako pierwsze i ciągłe, zgodnie z celem „szybkość uruchomienia".

## W skrócie

| ID    | Change ID                | Wynik (użytkownik może…)                                                   | Wymagania wstępne | Odnośniki PRD                              | Status   |
| ----- | ------------------------ | -------------------------------------------------------------------------- | ----------------- | ------------------------------------------ | -------- |
| F-01  | byok-secret-security     | (fundament) klucze BYOK szyfrowane w spoczynku + maskowane w logach        | —                 | FR-021, FR-026, NFR Klucze/Prywatność      | done |
| S-01  | byok-key-config          | zapisać, podejrzeć zamaskowany i usunąć własny klucz API; submit bramkowany | F-01              | US-06, FR-021, FR-022, FR-024              | done |
| S-02  | first-gated-generation   | wkleić tekst/plik i zobaczyć typowane itemy jako pendingi do akceptacji     | S-01, F-01  | US-01, FR-002, FR-003, FR-005, FR-006, FR-015, FR-018, FR-020, FR-023, FR-025 | done |
| S-03  | validation-accept-reject | zaakceptować (z edycją) lub odrzucić pendingi; zaakceptowane → Aktywne      | S-02              | US-02, US-03, FR-007, FR-008, FR-010, FR-012 | done |
| S-04  | task-operational-lifecycle | zmieniać stan operacyjny itemu dowolnego typu (nowe/w realizacji/zrealizowane/anulowane) | S-03              | US-04, FR-009                              | done |
| S-05  | unified-list-and-edit    | przeglądać Aktywne/Zakończone/Anulowane (filtr typu) i edytować itemy       | S-03              | FR-008, FR-011                             | done |
| S-06  | trash-lifecycle          | przenieść item do kosza, przywrócić i wyczyścić kosz                        | S-03              | US-05, FR-013, FR-016                      | done |
| S-07  | manual-item-entry        | dodać item ręcznie (bez klucza, od razu `accepted`)                         | S-02              | US-08, FR-028                              | done |
| S-08  | import-session-log-retry | przejrzeć dziennik sesji importu i ponowić sesję `niepowodzenie`            | S-02              | US-07, FR-027                              | done |
| S-09  | list-filters-search      | sortować i wyszukiwać listy po dacie i tytule (+ podfiltr stanu w Aktywne)  | S-05              | FR-008 (filtry dodatkowe)                  | done |
| S-10  | session-items-detail     | w dzienniku sesji wybrać sesję i zobaczyć/edytować jej elementy (master-detail) | S-08, S-05, S-06 | FR-027 (rozszerzony); nadpisuje FR-008/FR-015 | done |
| S-11  | session-log-filter-ux    | filtrować dziennik sesji reaktywnie (bez „Zastosuj"), spójne dropdowny, „Wyczyść filtry" | S-08 | FR-027 / FR-008 (parytet UX) | done |
| S-12  | dup-react-ssr-dev-fix    | (naprawa, dev-only) wyeliminować błąd podwójnego React-a na `/import-sessions` w `npm run dev` | — | — (dług techniczny; lessons.md) | done |
| S-13  | session-entries-mode     | otworzyć wpisy danej sesji jako pełną listę („Pokaż wpisy") zamiast master-detail; lista sesji jako karty + paginacja wpisów | S-10, S-11 | FR-027 / FR-008 (zastępuje master-detail S-10) | done |
| S-14  | csrf-hardening           | (utwardzenie) endpointy mutujące odporne na CSRF — aplikacyjny origin-check + jawny SameSite | — | NFR Bezpieczeństwo (obrona w głąb) | done |
| S-15  | ui-redesign              | (redesign) nowa szata „techniczna" (jasny+ciemny) + trwała powłoka (sidebar+topbar); wszystkie widoki | — | — (prezentacyjne; reguluje `ui-design-system.md`) | done |
| S-16  | trash-sidebar-relocation | (reorg. IA) otworzyć „Kosz" jako osobne miejsce w panelu bocznym (nie zakładkę pod „Wpisami"); oś „Wpisów" tylko cykl życia (pochodzenie na badge, bez filtra) | S-06, S-15 | — (prezentacyjne; US-05/FR-013/FR-016 bez zmian zachowania) | done |
| S-17  | help-page                | (pomoc) dodać w aplikacji stronę „Pomoc" opisującą działanie programu (orientacja „Jak zacząć" + sekcje per funkcja z kotwicami) + instrukcja „skąd wziąć klucz" na `/profile` | S-15 | — (pomoc użytkownika; poza pierwotnym MVP) | ready |

## Strumienie

Pomoc nawigacyjna — grupuje elementy współdzielące łańcuch Wymagań wstępnych. Kanoniczna kolejność nadal jest w grafie zależności poniżej; ta tabela to proponowana kolejność czytania w równoległych ścieżkach.

| Strumień | Temat                          | Łańcuch                                          | Uwaga                                                                          |
| -------- | ------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| A        | Ścieżka generacji              | `F-01` → `S-01` → `S-02` → `S-03` → `S-04`       | Ścieżka must-have „happy path"; rdzeń celu „szybkość uruchomienia".            |
| B        | Zarządzanie itemami i edycja   | `S-05` → `S-09`                                  | Dołącza do Strumienia A w `S-03`; `S-09` to późne utwardzanie filtrów.        |
| C        | Cykl kosza                     | `S-06`                                           | Dołącza do Strumienia A w `S-03`; równolegle z `S-04`/`S-05`.                 |
| D        | Wejścia poboczne i diagnostyka | `S-07` / `S-08` → `S-10`, `S-11`                  | `S-07`/`S-08` dołączają do Strumienia A w `S-02`; `S-10` rozbudowuje dziennik sesji (`S-08`) o master-detail elementów, a `S-11` przenosi na dziennik reaktywny model filtrów z `S-09`. |

## Baza

Co już jest na miejscu w bazie kodu na dzień `2026-06-05` (automatycznie zbadane + potwierdzone przez użytkownika).
Poniższe fundamenty zakładają, że to jest obecne i NIE odbudowują tego.

- **Frontend:** częściowy — Astro 6.3.1 + React 19 + Tailwind 4 (scaffold); strony `auth/{signin,signup,confirm-email}`, `dashboard`, `index`; komponenty React tylko w `src/components/auth/`. Brak stron/komponentów domenowych.
- **Backend / API:** częściowy — `src/pages/api/health.ts` + `src/pages/api/auth/{signin,signup,signout}.ts`. Brak endpointów domenowych.
- **Dane:** częściowy — `@supabase/ssr` + `supabase-js`, `src/lib/supabase.ts` działa; migracja `supabase/migrations/20260604214624_init.sql` to pusty placeholder (brak tabel domenowych); brak `src/types.ts`.
- **Auth:** obecny — Supabase Auth SSR, `src/middleware.ts` z `PROTECTED_ROUTES=["/dashboard"]`; signin → dashboard działa na produkcji. **FR-001 (login) spełnione przez baseline** — brak osobnego wycinka.
- **Wdrożenie / infrastruktura:** obecny — Cloudflare Workers live (`tasker-light.qbarium.workers.dev`), Workers Builds auto-deploy na `main`, branch protection, CI zielony. Plan **Free** (Free uciąga klasyfikację, bo 60 s to wall-clock fetch-wait, nie CPU; ewentualny upgrade do Paid jako bramka wydajności dla dużych wsadów → `deploy-plan.md` Faza 8).
- **Obserwowalność:** częściowy — `observability.enabled` w `wrangler.jsonc` + `wrangler tail`. Brak app-level loggera / error trackingu / filtra maskującego klucze (wymaga F-01 / FR-026).

## Fundamenty

### F-01: Bezpieczna warstwa sekretu BYOK

- **Wynik:** (fundament) helper szyfrowania/odszyfrowania klucza w spoczynku (KEK z konfiguracji aplikacji) oraz aktywny filtr maskujący ciągi w kształcie klucza w warstwie loggera i raportowania błędów — działa, zanim jakikolwiek klucz zostanie zapisany lub użyty.
- **Change ID:** byok-secret-security
- **Odnośniki PRD:** FR-021, FR-026, NFR „Klucze API w stanie spoczynku", NFR „Prywatność wsadu"
- **Odblokowuje:** S-01 (zapis zaszyfrowanego klucza), S-02 (wywołanie dostawcy AI bez wycieku klucza do logów)
- **Wymagania wstępne:** —
- **Równolegle z:** —
- **Blokady:** —
- **Niewiadome:** Polityka rotacji KEK (PRD OQ7) — Właściciel: spec techniczna. Blokuje: nie (dla MVP wystarcza statyczny KEK w konfiguracji).
- **Ryzyko:** Twardy globalny guardrail (FR-026, wszystkie środowiska) — jeśli filtr maskujący wejdzie po pierwszym zapisie klucza, ryzyko wycieku do logów w międzyczasie; dlatego sekwencjonowany jako pierwszy.
- **Status:** done

## Wycinki

### S-01: Konfiguracja klucza BYOK

- **Wynik:** użytkownik może zapisać własny klucz API zewnętrznego dostawcy AI w profilu, podejrzeć go w postaci zamaskowanej (prefiks + ostatnie znaki) i usunąć; akcje wymagające klucza (submit) są zablokowane z komunikatem i linkiem do strony dostawcy, dopóki klucz nie jest skonfigurowany.
- **Change ID:** byok-key-config
- **Odnośniki PRD:** US-06, FR-021, FR-022, FR-024
- **Wymagania wstępne:** F-01
- **Równolegle z:** — (S-02 zależy od S-01, więc nie jest z nim równoległy)
- **Blokady:** —
- **Niewiadome:** —
- **Ryzyko:** Klucz zapisywany bez walidacji (FR-022, świadomy kompromis) — niepoprawny klucz ujawni się dopiero w S-02 przy pierwszym wywołaniu; wprowadza kolumnę `openai_api_key_encrypted` w profilu (część schematu danych).
- **Status:** done

### S-02: Pierwsza bramkowana generacja (gwiazda przewodnia)

- **Wynik:** użytkownik może wkleić tekst (do 100 000 znaków) lub wrzucić jeden plik `.txt`/`.md` (do 300 KB), kliknąć submit, zobaczyć blokujący wskaźnik aktywności podczas synchronicznej klasyfikacji, a po jej zakończeniu — typowane itemy jako pendingi w widoku „Elementy do akceptacji".
- **Change ID:** first-gated-generation
- **Odnośniki PRD:** US-01, FR-002, FR-003, FR-005, FR-006, FR-015, FR-018, FR-020, FR-023, FR-025
- **Wymagania wstępne:** S-01, F-01
- **Równolegle z:** —
- **Blokady:** —
- **Niewiadome:**
  - Konkretny model klasyfikacji (okno ≥ 128k tokenów) — Właściciel: spec techniczna (PRD OQ3). Blokuje: nie.
  - Polityka retry przy błędach 5xx/timeout dostawcy AI — Właściciel: spec techniczna. Blokuje: nie.
- **Ryzyko:** Najcięższy, najbardziej ryzykowny wycinek — łączy wejście, synchroniczny pipeline klasyfikacji, sesję importu i schemat itemów (model dwóch niezależnych wymiarów: stan akceptacji × stan operacyjny). Sekwencjonowany jako gwiazda przewodnia, bo dowodzi sensu produktu; `/10x-plan` może go podzielić na kilka zmian. Runtime: 60 s klasyfikacji to wall-clock fetch-wait (nie liczy się do CPU), więc plan Free wystarcza dla typowych wsadów; duże wsady (do 100 itemów, FR-020) mogą przekroczyć 10 ms CPU na Free — monitoruj `wrangler tail`, podnieś do Workers Paid + `cpu_ms` jeśli pojawi się „Exceeded CPU" (`deploy-plan.md` Faza 8). To bramka wydajności, nie twardy prerekwizyt.
- **Status:** done

### S-03: Walidacja — akceptacja, odrzucenie, edycja w stagingu

- **Wynik:** użytkownik może zaznaczyć pendingi (model: per item + „zaznacz wszystkie"), zatwierdzić zaznaczone (z opcjonalną edycją `title`/`description`/`typ`) lub odrzucić; zaakceptowane trafiają do widoku Aktywne, odrzucone do Kosza (poprzedni status `rejected`).
- **Change ID:** validation-accept-reject
- **Odnośniki PRD:** US-02, US-03, FR-007, FR-008, FR-010, FR-012
- **Wymagania wstępne:** S-02
- **Równolegle z:** S-07, S-08
- **Blokady:** —
- **Niewiadome:**
  - Próg akcji zbiorczej wymagającej potwierdzenia (5? 10?) — Właściciel: spec techniczna / UX (PRD OQ4). Blokuje: nie.
  - Mapowanie stanów operacyjnych przy zmianie typu itemu — Właściciel: spec techniczna (PRD OQ5). Blokuje: nie.
  - Realizacja UX edycji (inline/modal/drawer) — Właściciel: spec techniczna / UX (PRD OQ6). Blokuje: nie.
- **Ryzyko:** Wprowadza ujednolicony model zaznaczania (FR-007) i pierwsze dwa filtry główne listy (Pending → Aktywne/Kosz); zmiana typu w stagingu dotyka mapowania stanów (OQ5), które plan musi rozstrzygnąć.
- **Status:** done

### S-04: Cykl operacyjny itemu (wszystkie typy)

- **Wynik:** użytkownik może zmienić stan operacyjny itemu **dowolnego typu** (`nowe` / `w realizacji` / `zrealizowane` / `anulowane`, wzajemnie przechodnie) per item i zbiorczo; `zrealizowane` przenosi item z Aktywne do Zakończone, `anulowane` do Anulowane. Etykiety stanu są per-typ (np. `zrealizowane`: zadanie „Zrobione", notatka „Obsłużona", decyzja „Podjęta", pomysł „Obsłużony").
- **Change ID:** task-operational-lifecycle
- **Odnośniki PRD:** US-04, FR-009
- **Wymagania wstępne:** S-03
- **Równolegle z:** S-05, S-06
- **Blokady:** —
- **Niewiadome:** —
- **Ryzyko:** Domyka ścieżkę gwiazdy przewodniej (wskazaną przez użytkownika). **Decyzja projektowa 2026-06-15 (wyłom z pierwotnego FR-009 task-only):** stan operacyjny rozszerzony na wszystkie typy itemów, z etykietami per-typ; `done` dowolnego typu → widok Zakończone. Koszt: migracja backfill `NULL→'new'` + zmiana RPC `persist_classification` (szczegóły w planie zmiany `task-operational-lifecycle`). FR-009 w PRD do zaktualizowania osobno.
- **Status:** done

### S-05: Jednolita lista i edycja zaakceptowanych itemów

- **Wynik:** użytkownik może przeglądać widoki Aktywne / Zakończone / Anulowane z filtrem typu (Wszystkie / Zadania / Notatki / Pomysły / Decyzje / Inne) i edytować zaakceptowane itemy (`title`, `description`, `typ`).
- **Change ID:** unified-list-and-edit
- **Odnośniki PRD:** FR-008, FR-011
- **Wymagania wstępne:** S-03
- **Równolegle z:** S-04, S-06
- **Blokady:** —
- **Niewiadome:** —
- **Ryzyko:** Rozbudowuje filtr główny + filtr typu z FR-008 na pełen zestaw widoków zaakceptowanych; bez sortowania/wyszukiwania (te w S-09), by trzymać wycinek wąsko zgodnie z celem „szybkość".
- **Status:** done

### S-06: Cykl życia kosza

- **Wynik:** użytkownik może przenieść zaakceptowany item do kosza (zachowując stan operacyjny), przywrócić go z kosza dokładnie do poprzedniego stanu oraz trwale opróżnić kosz globalną akcją z potwierdzeniem.
- **Change ID:** trash-lifecycle
- **Odnośniki PRD:** US-05, FR-013, FR-016
- **Wymagania wstępne:** S-03
- **Równolegle z:** S-04, S-05
- **Blokady:** —
- **Niewiadome:** —
- **Ryzyko:** Model dwóch niezależnych wymiarów stanu (akceptacja × operacyjny) musi gwarantować zachowanie stanu operacyjnego przy przenoszeniu i przywracaniu; brak per-item permanent delete (poza MVP).
- **Status:** done

### S-07: Ręczne dodawanie itemu

- **Wynik:** użytkownik może dodać item ręcznie (wybór typu + `title` + `description`) z pominięciem klasyfikacji; item powstaje od razu jako `accepted` / `nowe` i pojawia się w Aktywne. Akcja NIE wymaga klucza API.
- **Change ID:** manual-item-entry
- **Odnośniki PRD:** US-08, FR-028
- **Wymagania wstępne:** S-02
- **Równolegle z:** S-03, S-04, S-05, S-06, S-08
- **Blokady:** —
- **Niewiadome:** —
- **Ryzyko:** Wyjątek od FR-024 (działa bez klucza) — daje testowalność UI list bez wywołań dostawcy AI; niezależny od łańcucha klasyfikacji, więc dobry kandydat do równoległego uruchomienia (dźwignia przy blokadzie „czas/pojemność").
- **Status:** done

### S-08: Dziennik sesji importu + ponowienie

- **Wynik:** użytkownik może przejrzeć chronologiczny dziennik sesji importu (rejestr wejścia, status, liczba itemów lub błąd) i ponowić sesję ze statusem `niepowodzenie` (np. niepoprawny klucz) bez wprowadzania wsadu od nowa.
- **Change ID:** import-session-log-retry
- **Odnośniki PRD:** US-07, FR-027
- **Wymagania wstępne:** S-02
- **Równolegle z:** S-03, S-07
- **Blokady:** —
- **Niewiadome:** —
- **Ryzyko:** Polityka retry sprawdza stan klucza przed ponowieniem (klucz usunięty między błędem a retry → komunikat); per-file rozbicie i podgląd itemów poza MVP.
- **Status:** done

### S-09: Filtry dodatkowe list — sortowanie, wyszukiwanie, podfiltr stanu

- **Wynik:** użytkownik może sortować listy po dacie utworzenia/modyfikacji i tytule, wyszukiwać po tytule i opisie oraz zawężać po stanie operacyjnym w widoku Aktywne; filtr typu i sortowanie/wyszukiwanie działają na modelu serwer + parametry w adresie strony. (Filtr po sesji importu przeniesiony do S-10; rozróżnienie statusu w Koszu realizuje etykieta wg FR-012.)
- **Change ID:** list-filters-search
- **Odnośniki PRD:** FR-008 (warstwa filtrów dodatkowych)
- **Wymagania wstępne:** S-05
- **Równolegle z:** S-06, S-10
- **Blokady:** —
- **Niewiadome:** —
- **Ryzyko:** Utwardzanie UX na końcu łańcucha — must-have część FR-008, ale sekwencjonowane późno zgodnie z celem „szybkość uruchomienia" (najpierw ścisła ścieżka generacji). Przeniesienie filtra typu z modelu klient + cookie na serwer + parametry w adresie strony dotyka działających widoków (S-05/S-06) — wymaga zachowania poprawnego renderu serwerowego (SSR czyta parametry z adresu).
- **Status:** done

### S-10: Widok elementów sesji (master-detail w dzienniku importu)

- **Wynik:** użytkownik może w dzienniku sesji importu wybrać sesję i zobaczyć po prawej wszystkie jej elementy naraz (wszystkie stany akceptacji — `pending`/`accepted`/`rejected`/`deleted` — rozróżniane etykietą, bez filtrów), a następnie podejrzeć, edytować lub usunąć element bezpośrednio w tym widoku, reużywając operacje z list głównych (dialog edycji z S-05, przeniesienie do kosza z S-06). Wybrana sesja zapisana w adresie strony.
- **Change ID:** session-items-detail
- **Odnośniki PRD:** FR-027 (rozszerzony — podgląd/edycja elementów sesji wchodzi do zakresu); nadpisuje FR-008/FR-015 (sesja poza filtrami listy)
- **Wymagania wstępne:** S-08, S-05, S-06
- **Równolegle z:** S-09
- **Blokady:** —
- **Niewiadome:** —
- **Ryzyko:** Rozszerza FR-027 poza pierwotny zakres MVP (podgląd elementów sesji). Prawa lista pobiera elementy po `import_session_id` dedykowanym endpointem (`GET /api/import-sessions/[id]/items`), zwracając wszystkie stany akceptacji. Elementy `rejected`/`deleted` pozostają tylko do odczytu wg FR-011 (edycja/usuwanie tylko dla `pending`/`accepted`); operacje to reużycie (EditItemDialog z S-05, move-to-trash z S-06), nie budowane od nowa. Lista jednej sesji jest ograniczona (≤ 100 elementów wg FR-020), więc nie powiela problemu skalowania filtra sesji.
- **Status:** done

### S-11: Reaktywne filtry dziennika sesji importu (parytet UX z S-09)

- **Wynik:** użytkownik filtruje i sortuje dziennik sesji importu (`/import-sessions`) **reaktywnie** — zmiana kontrolki natychmiast zawęża listę bez przycisku „Zastosuj", a kryteria są w adresie strony (refresh / „wstecz-dalej" / odnośnik je zachowują); dropdowny sort/status są spójne wizualnie z resztą aplikacji (custom `Select` pod motyw cosmic, nie natywne `<select>`); pusty wynik przy aktywnym filtrze pokazuje komunikat z akcją „Wyczyść filtry" (rozróżnienie „pusto bo filtr" vs „brak sesji").
- **Change ID:** session-log-filter-ux
- **Odnośniki PRD:** FR-027 (dziennik sesji importu), FR-008 (warstwa filtrów — parytet UX z listami głównymi)
- **Wymagania wstępne:** S-08 (dziennik sesji istnieje)
- **Równolegle z:** S-10 (oba rozbudowują dziennik z S-08, ale niezależnie: S-10 = master-detail elementów sesji, S-11 = reaktywne filtry listy sesji)
- **Blokady:** —
- **Niewiadome:** Czy reaktywność oprzeć na dedykowanym `GET /api/import-sessions` (jak `GET /api/items` w S-09), czy na lżejszym wariancie fetch obecnej strony — rozstrzyga `/10x-plan`. Blokuje: nie.
- **Ryzyko:** Czysto UX, na istniejącej powierzchni — niski koszt; wzorzec gotowy w S-09 (`useItemList` + `list-criteria` + `SortControl`/`ListFilterBar`) do reużycia/uogólnienia. Uwaga architektoniczna: dziennik to wyspa hookowa (`SessionsList → SessionRow → useSessionRetry`) — historyczne źródło blokera dup-React SSR (naprawione w `astro.config.mjs`: `vite.resolve.dedupe` + `ssr.noExternal`); dołożenie hooka filtrów wymaga potwierdzenia dev SSR realnym renderem, nie tylko zielonym buildem (lekcja „bug widoczny tylko w dev", `lessons.md`). Pełny kontekst zgłoszenia: `context/archive/2026-06-13-import-session-log-retry/follow-ups/session-log-filter-ux.md`.
- **Dopisane z S-10 (2026-06-25):** do zakresu S-11 wchodzi **paginacja (lub „pokaż starsze") listy sesji** — dziennik jest append-only i rośnie bez ograniczeń, a `getImportSessions` ciągnie dziś wszystkie wiersze bez `LIMIT`; oraz **zapis wybranej sesji w adresie strony** (`?session=`, deep-link do panelu master-detail z S-10) — projektowane **razem** z paginacją, bo deep-link do sesji spoza bieżącej strony wymaga świadomego rozwiązania (np. kursorowego „załaduj stronę zawierającą sesję"). Decyzja przy planowaniu S-10: oba świadomie odłożone z S-10 tutaj.
- **Status:** done

### S-12: Naprawa błędu podwójnego React-a na `/import-sessions` (tylko tryb deweloperski)

- **Wynik:** (naprawa, dług techniczny) strona `/import-sessions` przestaje wywalać render serwerowy („Invalid hook call / more than one copy of React") w `npm run dev`; build produkcyjny i tak był wolny od błędu, więc to poprawa doświadczenia deweloperskiego, nie wydania.
- **Change ID:** dup-react-ssr-dev-fix
- **Odnośniki PRD:** — (dług techniczny; brak FR)
- **Wymagania wstępne:** — (niezależne; wynesione z S-11, sekwencjonowane po nim)
- **Równolegle z:** —
- **Blokady:** —
- **Niewiadome:** Aktualny trigger re-optymalizacji Vite — dwa wcześniejsze podejścia (S-08, S-10) nie wyeliminowały błędu, a `reopt_fired=0` okazał się niewystarczającym kryterium. Rozstrzyga diagnoza w fazie naprawy. Blokuje: nie.
- **Ryzyko:** Błąd zależny od czasu i kolejności ładowania (tryb deweloperski), trudny do deterministycznego odtworzenia; kryterium „naprawione" wymaga odtworzenia prawdziwego trybu awarii, nie zielonego buildu. Pełny kontekst: `context/changes/session-log-filter-ux/follow-ups/dup-react-ssr-dev-only.md`.
- **Status:** done

### S-13: Tryb „Pokaż wpisy" — kontekstowy widok elementów sesji (zastępuje master-detail)

- **Wynik:** użytkownik w dzienniku sesji (lista kart: status, źródło, data, liczba wpisów) klika „Pokaż wpisy" na sesji i trafia na pełną listę wpisów w **trybie kontekstowym sesji** (adres `?session=<id>`): baner „Wpisy dla sesji importu — <źródło>, <data>" z akcją powrotu, normalne filtry/wyszukiwanie ukryte, widoczne WSZYSTKIE elementy sesji (wszystkie stany akceptacji), z zachowanymi akcjami (edycja/akceptacja/odrzucenie reużyte z list głównych). Sesje `niepowodzenie` mają „Ponów" zamiast „Pokaż wpisy". Master-detail (prawy panel) znika — lista sesji staje się pełnoszerokimi kartami.
- **Change ID:** session-entries-mode
- **Odnośniki PRD:** FR-027 (rozszerzony), FR-008 (filtr sesji jako tryb kontekstowy, nie zwykły filtr) — zastępuje model master-detail z S-10
- **Wymagania wstępne:** S-10 (endpoint `GET /api/import-sessions/[id]/items` + `getSessionItems` do reużycia), S-11 (paginacja listy do reużycia)
- **Równolegle z:** —
- **Blokady:** —
- **Niewiadome:** —
- **Decyzje (uzgodnione 2026-07-01):** (1) tryb sesji pokazuje WSZYSTKIE itemy sesji niezależnie od stanu akceptacji (jak panel S-10); (2) akcje (edycja/akceptacja/odrzucenie) ZACHOWANE, nie read-only; (3) paginacja zostaje w trybie sesji i dochodzi też do zwykłej listy wpisów (reużycie dorobku S-11). Warstwa danych istnieje (S-10), więc zmiana jest głównie prezentacyjna (panel → pełna strona + baner) plus tryb/filtr sesji na liście wpisów i paginacja wpisów.
- **Ryzyko:** Cofa decyzję S-10 (master-detail) — usuwa `SessionItemsPanel`/`useSessionItems`/dwukolumnowy layout z `ImportSessionsView`. Reużywa endpoint S-10, więc warstwa danych zostaje. Główny koszt: redesign listy sesji na karty + tryb kontekstowy na liście wpisów (baner, wyszarzone filtry, deep-link `?session=`) + paginacja wpisów. Prowadzone przez `/10x-frame` (2026-07-01, `frame.md` — pewność WYSOKA) i zaplanowane `/10x-plan` (2026-07-01, 5 faz, `plan.md` + `plan-brief.md`).
- **Status:** done

### S-14: Utwardzenie anty-CSRF mutujących endpointów

- **Wynik:** (utwardzenie bezpieczeństwa, poza pierwotnym zakresem MVP) każde żądanie mutujące (POST/PUT/PATCH/DELETE) niepochodzące z tego samego originu jest odrzucane z 403 — egzekwowane w dwóch niezależnych warstwach: wbudowanej Astro (jawnie przypiętej `checkOrigin: true`) oraz aplikacyjnej w `middleware.ts` (fail-closed `Origin`/`Sec-Fetch-Site`, pokrywającej też klasę `application/json`, którą Astro przepuszcza). Ciasteczko sesji ma jawny `SameSite=Lax`. Test jednostkowy pinuje predykat przeciw regresji.
- **Change ID:** csrf-hardening
- **Odnośniki PRD:** — (NFR Bezpieczeństwo, obrona w głąb; brak dedykowanego FR — CSRF nie był w pierwotnym PRD)
- **Wymagania wstępne:** — (samodzielna, na istniejącej powierzchni mutującej)
- **Równolegle z:** —
- **Blokady:** —
- **Niewiadome:** —
- **Ryzyko:** Badanie wykazało, że powierzchnia jest już chroniona niejawnie (domyślny `checkOrigin: true` Astro + `SameSite=Lax` Supabase + preflight CORS) — zmiana czyni ochronę jawną, testowaną i odporną na cichą regresję, dokładając warstwę aplikacyjną dla klasy JSON. Wariant tokenowy świadomie odrzucony jako redundantny (brak wspólnego wrappera `fetch`). Plan: 2 fazy (`plan.md` + `plan-brief.md`, 2026-07-02).
- **Status:** done

### S-15: Nowa szata graficzna (wariant techniczny) + powłoka nawigacyjna

- **Wynik:** użytkownik dostaje spójny, przeprojektowany interfejs w wariancie „technicznym" (font IBM Plex Sans, ostre małe zaokrąglenia, gęste wiersze, kolorowy grzbień + chip per typ) w dwóch motywach (jasny + ciemny, z przełącznikiem), z trwałą powłoką: stały sidebar (Skrzynka / Do akceptacji / Wpisy / Sesje importu) + topbar. Wszystkie widoki przeniesione na nowy język wizualny; widoki spoza makiety (profil/BYOK, tryb „Pokaż wpisy", dialogi, modal klasyfikacji, auth, landing) wywnioskowane z języka makiety.
- **Change ID:** ui-redesign
- **Odnośniki PRD:** — (zmiana prezentacyjna; zachowanie nienaruszone. Warstwę wizualną reguluje `context/foundation/ui-design-system.md`; źródło prawdy wizualnej: `context/foundation/ui-mockup/taskerlight-list.html`.)
- **Wymagania wstępne:** — (na istniejącej powierzchni UI: S-05/S-08/S-13 i wcześniejsze, wszystkie done)
- **Równolegle z:** —
- **Blokady:** —
- **Niewiadome:** —
- **Decyzje (uzgodnione 2026-08-03):** (1) **multi-page** zostaje — powłokę odtwarzamy w Astro, aktywny stan z adresu strony, bez SPA; (2) **wariant „techniczny" + dark mode** (pozostałe 5 presetów i przełącznik stylu poza zakresem); (3) **bez metadanych przyszłości** (priorytet/termin/tagi) i **bez „pewności %"** w „Do akceptacji"; (4) **wszystkie widoki**, brakujące w makiecie wnioskowane z istniejących; (5) opis wyglądu żyje w `ui-design-system.md` (foundation), nie w PRD — bo zachowanie się nie zmienia.
- **Nośnik pracy:** cała zmiana na gałęzi `feature/ui-redesign`, fazy sekwencyjnie, **jeden PR mergowany na końcu** (bez merge per faza). Plan fazowy powstanie w `context/changes/ui-redesign/plan.md` (`/10x-plan`).
- **Ryzyko:** przekrojowa zmiana (powłoka + tokeny + kilkanaście–kilkadziesiąt komponentów z zaszytymi kolorami `white/…`). Największe ryzyko: rozjazd z uchwytami testów (role/nazwy/`data-item-id`) — plan musi jawnie je zachować (test-plan: E2E asertuje funkcję przez DOM, nie wygląd).
- **Status:** done

### S-16: Kosz jako osobne miejsce w panelu bocznym

- **Wynik:** użytkownik otwiera „Kosz" jako **osobną pozycję w panelu bocznym** (grupa „Biblioteka", pod „Wpisami") zamiast zakładki na osi stanu „Wpisów". Kosz pozostaje **jednym worem** (soft-delete przez `acceptance_status`: `rejected` z „Do akceptacji" + `deleted` z „Wpisów"); pochodzenie (odrzucone / usunięte) pozostaje widoczne przez **badge na karcie** (`acceptanceOriginLabel` już istnieją), **bez osobnego filtra pochodzenia**. Oś stanu „Wpisów" zawęża się do samego cyklu życia: Aktywne | Nowe | W toku | Zakończone | Anulowane (bez „Kosza").
- **Change ID:** trash-sidebar-relocation
- **Odnośniki PRD:** — (reorganizacja architektury informacji; **bez zmian zachowania**. Dotyka US-05 / FR-013 / FR-016 wyłącznie prezentacyjnie — przywracanie i „Wyczyść kosz" bez zmian.)
- **Wymagania wstępne:** S-06 (`trash-lifecycle` — model kosza: `rejected`+`deleted`, restore świadomy pochodzenia, „Wyczyść kosz"), S-15 (`ui-redesign` — powłoka/sidebar + płaska oś stanu).
- **Równolegle z:** —
- **Blokady:** — (praktycznie: zaczekać aż S-15 się zmerguje — dotyka tych samych plików: sidebar, `state-filter.ts`, `TrashItemsView`).
- **Niewiadome:** czy dołożyć licznik kosza w sidebarze (jak licznik „Do akceptacji") — do rozstrzygnięcia w `/10x-plan`.
- **Decyzje (uzgodnione 2026-08-06):** (1) **Opcja A** — Kosz jako pojedyncze, poprzeczne miejsce w sidebarze; **odrzucona opcja B** (dwa osobne kosze) jako rozbijająca jeden byt DB, fragmentująca „Wyczyść kosz" i dublująca widoki. (2) **Bez filtra pochodzenia** (uszczegółowione 2026-08-06 po badaniu): rozróżnienie `rejected`/`deleted` niesie **badge na karcie** (jak dziś, zgodnie ze scope-downem S-06) — S-16 nie dodaje kontrolki zawężającej. Wcześniejszy wariant „filtr pochodzenia w widoku" **wycofany** (badge wystarcza; brak regresu — filtra i tak dziś nie ma). (3) Zmiana **czysto prezentacyjna / IA** — model danych (`acceptance_status`, restore `deleted→accepted` / `rejected→pending`, twardy „Wyczyść kosz") **bez zmian**.
- **Nośnik pracy:** osobna gałąź + PR (po zmerge S-15). Plan fazowy w `context/changes/trash-sidebar-relocation/plan.md` (`/10x-plan`).
- **Ryzyko:** wyjęcie „Kosza" z osi stanu rusza `state-filter.ts` i jego **zamrożony test** `state-filter.test.ts` (trasa `trash` + etykieta „Kosz") oraz `nav-active.ts` + jego zamrożony test (`/items/trash` świeci dziś jako „Wpisy") — legalne zmiany kontraktu, do zrobienia świadomie z testami. Reszta to czysta nawigacja (sidebar) + wpis w grupie „Biblioteka".
- **Status:** done

### S-17: Pomoc dla użytkownika — strona opisująca działanie

- **Wynik:** użytkownik ma w aplikacji **jedno, odkrywalne z powłoki miejsce „Pomoc"** (trasa `/help`, pozycja w sidebarze), które wyjaśnia jak działa TaskerLight: krótka orientacja „Jak zacząć" (skonfiguruj klucz → wrzuć wsad → zaakceptuj) + przeszukiwalne **sekcje per funkcja z kotwicami** (Skrzynka/klasyfikacja, Do akceptacji: akceptuj/odrzuć/edytuj, cykl życia, Kosz: przywróć/wyczyść + pochodzenie, Sesje importu + „ponów", klucz BYOK). Treść jawnie tłumaczy punkty dziś nieopisane: „Odrzuć" vs „Usuń", statusy sesji i kiedy „ponów", czasowniki cyklu życia. Dodatkowo na `/profile` pojawia się krótka instrukcja „skąd wziąć klucz".
- **Change ID:** help-page
- **Odnośniki PRD:** — (pomoc / dokumentacja użytkownika; poza pierwotnym zakresem MVP — luka ujawniona po S-16: brak jakiegokolwiek punktu wejścia do „jak to działa").
- **Wymagania wstępne:** S-15 (`ui-redesign` — powłoka/sidebar, do którego dokładamy pozycję „Pomoc" i wariant ikony).
- **Równolegle z:** — (niezależne od pozostałych wycinków; czysto addytywne).
- **Blokady:** —
- **Niewiadome:** struktura treści (jedna strona vs sekcje/podstrony) i głębokość opisu — do rozstrzygnięcia w `/10x-plan`.
- **Decyzje (uzgodnione 2026-08-07, `/10x-frame`):** (1) forma = **osobna strona** `/help` (nie modal), link w stopce sidebara obok „Ustawienia"; (2) odbiorca = **oba** (orientacja startowa + referencja per funkcja) → struktura „Jak zacząć" + sekcje z kotwicami; (3) zakres = **pełny przegląd** + jawne wytłumaczenie mylących różnic; (4) **instrukcja klucza na `/profile`** wciągnięta do zakresu (jedyny fragment pomocy kontekstowej); (5) reszta pomocy kontekstowej (tooltipy, puste stany, czasowniki przejść na listach) — **poza zakresem**, osobny follow-up UX.
- **Nośnik pracy:** samodzielna gałąź + PR. Frame: `context/changes/help-page/frame.md`. Plan fazowy powstanie z `/10x-plan`.
- **Ryzyko:** niskie — zmiana głównie addytywna (nowa strona + pozycja w powłoce, wzorzec 1:1 jak „Kosz" w S-16: wariant w `Icon.astro`, `AppSidebar.astro`, `nav-active.ts` + test). Główne ryzyko to utrzymanie treści w zgodzie z UI przy przyszłych zmianach.
- **Status:** ready

## Przekazanie backlogu

| ID mapy drogowej | Change ID                  | Sugerowany tytuł problemu                                  | Gotowe do `/10x-plan` | Uwagi                                              |
| ---------------- | -------------------------- | --------------------------------------------------------- | --------------------- | -------------------------------------------------- |
| F-01             | byok-secret-security       | Szyfrowanie klucza BYOK at-rest + filtr maskujący w logach | yes                   | Uruchom `/10x-plan byok-secret-security`            |
| S-01             | byok-key-config            | Konfiguracja klucza API BYOK w profilu                    | no                    | Po F-01                                            |
| S-02             | first-gated-generation     | Wklej/plik → klasyfikacja → pendingi do akceptacji        | no                    | Gwiazda przewodnia; po S-01, F-01            |
| S-03             | validation-accept-reject   | Walidacja: akceptacja/odrzucenie/edycja w stagingu        | no                    | Po S-02                                            |
| S-04             | task-operational-lifecycle | Stan operacyjny zadania (Aktywne ↔ Zakończone/Anulowane)  | no                    | Po S-03                                            |
| S-05             | unified-list-and-edit      | Jednolita lista (Aktywne/Zakończone/Anulowane) + edycja   | no                    | Po S-03; równolegle z S-04/S-06                    |
| S-06             | trash-lifecycle            | Kosz: przenieś / przywróć / wyczyść                       | no                    | Po S-03; równolegle z S-04/S-05                    |
| S-07             | manual-item-entry          | Ręczne dodawanie itemu (bez klucza)                       | no                    | Po S-02; niezależny — kandydat do równoległości    |
| S-08             | import-session-log-retry   | Dziennik sesji importu + ponowienie                      | no                    | Po S-02; niezależny — kandydat do równoległości    |
| S-09             | list-filters-search        | Filtry dodatkowe: sort / wyszukiwanie / podfiltr stanu   | no                    | Po S-05                                            |
| S-10             | session-items-detail       | Widok elementów sesji (master-detail w dzienniku)        | no                    | Po S-08 + S-05 + S-06                              |
| S-11             | session-log-filter-ux      | Reaktywne filtry dziennika sesji (parytet UX z S-09)     | yes                   | Zaplanowane (`plan.md`); `/10x-implement … phase 1` |
| S-12             | dup-react-ssr-dev-fix      | Naprawa błędu podwójnego React-a (tylko dev) na `/import-sessions` | no          | Po S-11; dług techniczny, dev-only                  |
| S-13             | session-entries-mode       | Tryb „Pokaż wpisy" + filtr sesji na liście wpisów (zastępuje master-detail) | yes         | Zaimplementowane (5 faz + poprawki po testach ręcznych 2026-07-02); czeka na `/10x-impl-review` |
| S-14             | csrf-hardening             | Utwardzenie anty-CSRF mutujących endpointów (origin-check + jawny SameSite) | yes         | Zaimplementowane (2 fazy, zmergowane edd5bde 2026-07-03); czeka na `/10x-impl-review` |
| S-15             | ui-redesign                | Nowa szata „techniczna" + powłoka nawigacyjna                              | yes         | Na `feature/ui-redesign`; następny krok `/10x-research ui-redesign`               |
| S-16             | trash-sidebar-relocation   | Kosz jako osobne miejsce w panelu bocznym                                 | yes         | Zaimplementowane 2026-08-06 (3 fazy: ed4d9a1/c1eb138/22d64e8; automatyczne bramki zielone). Czeka na `/10x-impl-review`; weryfikacja ręczna po stronie użytkownika. Następny krok `/10x-impl-review trash-sidebar-relocation` |
| S-17             | help-page                  | Pomoc dla użytkownika — strona „jak działa aplikacja"                     | yes         | Sframe'owane 2026-08-07 (`/10x-frame`, pewność WYSOKA); następny krok `/10x-plan help-page` |

## Otwarte pytania dotyczące mapy drogowej

1. **Czy audio jako wsad wejdzie do MVP (FR-004 nice-to-have)?** — **ROZSTRZYGNIĘTE 2026-07-20: NIE.** Audio pozostaje w Zaparkowane → V2 (PRD OQ2 rozstrzygnięte, Issue #14 zamknięte). Właściciel decyzji: produkt.

(Niewiadome dotyczące poszczególnych wycinków — model AI, próg akcji zbiorczej, mapowanie stanów przy zmianie typu, UX edycji, rotacja KEK — pozostają przy swoich wycinkach jako niewiadome z `Block: no`; rozstrzyga je `/10x-plan`. Wybór providera auth (PRD OQ1) jest faktycznie rozstrzygnięty przez baseline (Supabase email); OAuth → Zaparkowane.)

## Zaparkowane

- **Audio jako wsad (FR-004, FR-019, nice-to-have)** — Dlaczego: poza ścisłą ścieżką must-have; oś asynchroniczna/transkrypcyjna kosztuje nieproporcjonalnie dużo w budżecie 3 tygodni (PRD OQ2 / Non-Goals). **Potwierdzone 2026-07-20 (OQ2/#14): pozostawienie w Zaparkowane jest wiążącą decyzją produktową — audio → V2, nie domyślne odłożenie.**
- **Email confirm + własny SMTP** — Dlaczego: wbudowany wysyłacz Supabase nie dostarcza maili; „Confirm email" = OFF do czasu podpięcia SMTP (decyzja użytkownika + `deploy-plan.md` Kolejne kroki). Poza MVP.
- **OAuth providers (Google/GitHub) + custom domain** — Dlaczego: baseline auth = Supabase email wystarcza dla MVP; OAuth i domena custom w `deploy-plan.md` Kolejne kroki.
- **Multi-file submit i przetwarzanie asynchroniczne** — Dlaczego: PRD Non-Goal; MVP = jeden element wsadu synchronicznie.
- **Observability/tracing wywołań klasyfikacji** — Dlaczego: PRD Non-Goal; surowy wsad to prywatne myśli, nie wychodzi poza dostawcę AI.
- **Integracje wychodzące/wchodzące poza dostawcą AI** (dyski, kalendarz, todo, mail, mobilne dyktowanie) — Dlaczego: PRD Non-Goal.
- **Funkcje domenowe poza klasyfikacją** (parsowanie dat, deduplikacja, projekty, SRS, priorytety, podobne itemy) — Dlaczego: PRD Non-Goal.
- **Mitygacja prompt injection** — Dlaczego: PRD Non-Goal; ryzyko przeniesione na klucz BYOK użytkownika.
- **Archiwizacja itemów / per-item permanent delete / auto-cleanup (TTL)** — Dlaczego: PRD Non-Goals.
- **Choice modelu klasyfikacji w profilu / undo toast / progresywne ostrzeganie pola / zewnętrzny KMS / usuwanie sesji importu** — Dlaczego: PRD Non-Goals.

## Done

- **S-01: użytkownik może zapisać własny klucz API zewnętrznego dostawcy AI w profilu, podejrzeć go w postaci zamaskowanej (prefiks + ostatnie znaki) i usunąć; akcje wymagające klucza (submit) są zablokowane z komunikatem i linkiem do strony dostawcy, dopóki klucz nie jest skonfigurowany.** — Zarchiwizowano 2026-06-12 → `context/archive/2026-06-08-byok-key-config/`. Lekcja: —.
- **S-02: użytkownik może wkleić tekst (do 100 000 znaków) lub wrzucić jeden plik `.txt`/`.md` (do 300 KB), kliknąć submit, zobaczyć blokujący wskaźnik aktywności podczas synchronicznej klasyfikacji, a po jej zakończeniu — typowane itemy jako pendingi w widoku „Elementy do akceptacji".** — Zarchiwizowano 2026-06-12 → `context/archive/2026-06-10-first-gated-generation/`. Lekcja: konfiguracja LLM fail-closed + modeluj schemat wg kardynalności (lessons.md); FR-015 złagodzony do best-effort (set null).
- **S-03: użytkownik może zaznaczyć pendingi (model: per item + „zaznacz wszystkie"), zatwierdzić zaznaczone (z opcjonalną edycją `title`/`description`/`typ`) lub odrzucić; zaakceptowane trafiają do widoku Aktywne, odrzucone do Kosza (poprzedni status `rejected`).** — Zarchiwizowano 2026-06-14 → `context/archive/2026-06-13-validation-accept-reject/`. Lekcja: edycja bez optimistic concurrency = lost-update (świadome ograniczenie solo-MVP); ujednolicony kształt błędu API `{ok:false,code,error}` (lessons.md).
- **S-08: użytkownik może przejrzeć chronologiczny dziennik sesji importu (rejestr wejścia, status, liczba itemów lub błąd) i ponowić sesję ze statusem `niepowodzenie` (np. niepoprawny klucz) bez wprowadzania wsadu od nowa.** — Zarchiwizowano 2026-06-14 → `context/archive/2026-06-13-import-session-log-retry/`. Lekcja: dev-only wyścig optimizeDeps Vite — dup-React w SSR (lessons.md).
- **S-04: użytkownik może zmienić stan operacyjny itemu dowolnego typu (`nowe` / `w realizacji` / `zrealizowane` / `anulowane`, wzajemnie przechodnie) per item i zbiorczo; `zrealizowane` przenosi item z Aktywne do Zakończone, `anulowane` do Anulowane. Etykiety stanu są per-typ (np. `zrealizowane`: zadanie „Zrobione", notatka „Obsłużona", decyzja „Podjęta", pomysł „Obsłużony").** — Zarchiwizowano 2026-06-15 → `context/archive/2026-06-15-task-operational-lifecycle/`. Lekcja: —.
- **S-05: użytkownik może przeglądać widoki Aktywne / Zakończone / Anulowane z filtrem typu (Wszystkie / Zadania / Notatki / Pomysły / Decyzje / Inne) i edytować zaakceptowane itemy (`title`, `description`, `typ`).** — Zarchiwizowano 2026-06-16 → `context/archive/2026-06-15-unified-list-and-edit/`. Lekcja: —.
- **S-06: użytkownik może przenieść zaakceptowany item do kosza (zachowując stan operacyjny), przywrócić go z kosza dokładnie do poprzedniego stanu oraz trwale opróżnić kosz globalną akcją z potwierdzeniem.** — Zarchiwizowano 2026-06-20 → `context/archive/2026-06-16-trash-lifecycle/`. Lekcja: —.
- **S-07: użytkownik może dodać item ręcznie (wybór typu + `title` + `description`) z pominięciem klasyfikacji; item powstaje od razu jako `accepted` / `nowe` i pojawia się w Aktywne. Akcja NIE wymaga klucza API.** — Zarchiwizowano 2026-06-19 → `context/archive/2026-06-16-manual-item-entry/`. Lekcja: —.
- **S-09: użytkownik może sortować listy po dacie utworzenia/modyfikacji i tytule, wyszukiwać po tytule i opisie oraz zawężać po stanie operacyjnym w widoku Aktywne; filtr typu i sortowanie/wyszukiwanie działają na modelu serwer + parametry w adresie strony. (Filtr po sesji importu przeniesiony do S-10; rozróżnienie statusu w Koszu realizuje etykieta wg FR-012.)** — Zarchiwizowano 2026-06-23 → `context/archive/2026-06-20-list-filters-search/`. Lekcja: —.
- **S-10: użytkownik może w dzienniku sesji importu wybrać sesję i zobaczyć po prawej wszystkie jej elementy naraz (wszystkie stany akceptacji — `pending`/`accepted`/`rejected`/`deleted` — rozróżniane etykietą, bez filtrów), a następnie podejrzeć, edytować lub usunąć element bezpośrednio w tym widoku, reużywając operacje z list głównych (dialog edycji z S-05, przeniesienie do kosza z S-06). Wybrana sesja zapisana w adresie strony.** — Zarchiwizowano 2026-06-28 → `context/archive/2026-06-24-session-items-detail/`. Lekcja: dup-React SSR (dev-only) — fix configu niepełny, znana wada; kryterium naprawy (reopt_fired=0) w lessons.md.
- **S-14: (utwardzenie bezpieczeństwa, poza pierwotnym zakresem MVP) każde żądanie mutujące (POST/PUT/PATCH/DELETE) niepochodzące z tego samego originu jest odrzucane z 403 — egzekwowane w dwóch niezależnych warstwach: wbudowanej Astro (jawnie przypiętej `checkOrigin: true`) oraz aplikacyjnej w `middleware.ts` (fail-closed `Origin`/`Sec-Fetch-Site`, pokrywającej też klasę `application/json`, którą Astro przepuszcza). Ciasteczko sesji ma jawny `SameSite=Lax`. Test jednostkowy pinuje predykat przeciw regresji.** — Zarchiwizowano 2026-07-05 → `context/archive/2026-07-02-csrf-hardening/`. Lekcja: —.
- **S-11: użytkownik filtruje i sortuje dziennik sesji importu (`/import-sessions`) reaktywnie — zmiana kontrolki natychmiast zawęża listę bez przycisku „Zastosuj", kryteria w adresie strony (refresh / „wstecz-dalej" / odnośnik je zachowują); dropdowny sort/status spójne wizualnie (custom `Select`, nie natywne `<select>`); pusty wynik z filtrem pokazuje „Wyczyść filtry"; doszła paginacja stronowa (indeks + serwis + endpoint) oraz — poza planem — rozmiar strony z zapamiętywaniem i skok do strony.** — Zarchiwizowano 2026-07-01 → `context/archive/2026-06-28-session-log-filter-ux/`. Lekcja: wspólne kryterium przekazuj przez WSZYSTKIE warstwy (SSR + endpoint) — częściowe wpięcie `size` dało rozjazd hydratacji (F1, impl-review).
- **S-12: (naprawa, dług techniczny) strona `/import-sessions` przestaje wywalać render serwerowy („Invalid hook call / more than one copy of React") w `npm run dev`; build produkcyjny i tak był wolny od błędu, więc to poprawa doświadczenia deweloperskiego, nie wydania.** — Zarchiwizowano 2026-07-01 → `context/archive/2026-07-01-dup-react-ssr-dev-fix/`. Lekcja: przypnij CAŁĄ populację późno-odkrywanych depów w `ssr.optimizeDeps.include` (nie jeden), weryfikuj dwutorowo z pokryciem dialog/API (lessons.md).
- **S-13: użytkownik w dzienniku sesji (lista kart: status, źródło, data, liczba wpisów) klika „Pokaż wpisy" na sesji i trafia na pełną listę wpisów w trybie kontekstowym sesji (adres `?session=<id>`): baner „Wpisy dla sesji importu — <źródło>, <data>" z akcją powrotu, normalne filtry/wyszukiwanie ukryte, widoczne WSZYSTKIE elementy sesji (wszystkie stany akceptacji), z zachowanymi akcjami (edycja/akceptacja/odrzucenie reużyte z list głównych). Sesje `niepowodzenie` mają „Ponów" zamiast „Pokaż wpisy". Master-detail (prawy panel) znika — lista sesji staje się pełnoszerokimi kartami.** — Zarchiwizowano 2026-07-02 → `context/archive/2026-07-01-session-entries-mode/`. Lekcja: nie używaj top-level `return` we frontmatterze `.astro` — crash lint no-misused-promises (lessons.md).
- **S-15: użytkownik dostaje spójny, przeprojektowany interfejs w wariancie „technicznym" (font IBM Plex Sans, ostre małe zaokrąglenia, gęste wiersze, kolorowy grzbień + chip per typ) w dwóch motywach (jasny + ciemny, z przełącznikiem), z trwałą powłoką: stały sidebar (Skrzynka / Do akceptacji / Wpisy / Sesje importu) + topbar. Wszystkie widoki przeniesione na nowy język wizualny; widoki spoza makiety (profil/BYOK, tryb „Pokaż wpisy", dialogi, modal klasyfikacji, auth, landing) wywnioskowane z języka makiety.** — Zarchiwizowano 2026-08-06 → `context/archive/2026-08-03-ui-redesign/`. Lekcja: F1 (przegląd Fazy 9) — powłoka nie może brać sztywnych 100vh nad banerem w flow; opakowanie w kolumnę h-screen + regresyjny E2E z szwem dev.
- **S-16: użytkownik otwiera „Kosz" jako osobną pozycję w panelu bocznym (grupa „Biblioteka", pod „Wpisami") zamiast zakładki na osi stanu „Wpisów". Kosz pozostaje jednym worem (soft-delete przez `acceptance_status`: `rejected` z „Do akceptacji" + `deleted` z „Wpisów"); pochodzenie (odrzucone / usunięte) pozostaje widoczne przez badge na karcie (`acceptanceOriginLabel` już istnieją), bez osobnego filtra pochodzenia. Oś stanu „Wpisów" zawęża się do samego cyklu życia: Aktywne | Nowe | W toku | Zakończone | Anulowane (bez „Kosza").** — Zarchiwizowano 2026-08-06 → `context/archive/2026-08-06-trash-sidebar-relocation/`. Lekcja: —.

## Zrobione

- **F-01: (fundament) helper szyfrowania/odszyfrowania klucza w spoczynku (KEK z konfiguracji aplikacji) oraz aktywny filtr maskujący ciągi w kształcie klucza w warstwie loggera i raportowania błędów — działa, zanim jakikolwiek klucz zostanie zapisany lub użyty.** — Zarchiwizowano 2026-06-08 → `context/archive/2026-06-07-byok-secret-security/`. Lekcja: —.

(Puste przy pierwszym generowaniu. `/10x-archive` dodaje tutaj wpis — i zmienia `Status` elementu na `done` — gdy zmiana, której `Change ID` odpowiada elementowi mapy drogowej, zostanie zarchiwizowana. NIE wypełniaj wstępnie.)
