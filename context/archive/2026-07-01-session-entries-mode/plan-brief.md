# Tryb „Pokaż wpisy" (S-13) — Krótki plan

> Pełny plan: `context/changes/session-entries-mode/plan.md`
> Krótki opis ramowy: `context/changes/session-entries-mode/frame.md`

## Co i dlaczego

Rzeczywisty problem (za ramką): **podwójna własność prezentacji i operacji na wpisach** — dziennik sesji przerósł rolę przeglądu (aneks 2026-06-27) i utrzymuje równoległą, rozjeżdżającą się implementację listy wpisów; należy skonsolidować wpisy sesji jako tryb kontekstowy strony listy wpisów (`/items?session=<id>`, wszystkie stany, akcje zachowane), a dziennik zredukować do nawigacyjnych kart. Miarą sukcesu jest zniknięcie *drugiej implementacji* (panelowa ścieżka mutacji, osobny hook, osobna karta), nie samo przeniesienie widoku.

## Punkt wyjścia

Dziś działają dwie powierzchnie wpisów: trzy widoki `/items*` (karta inline, po akcji wpis znika z listy) oraz panel master-detail S-10 w dzienniku (własna karta i hook, wpis po akcji zostaje w miejscu). `?session=` nie przeżyłby żadnej interakcji (serializator adresu go wymazuje), paginacja istnieje tylko w dzienniku (S-11) i jest przyspawana do jego kryteriów, a `listItems`/`GET /api/items` nie znają okna strony ani licznika.

## Pożądany stan końcowy

Dziennik to pełnoszerokie karty (status, źródło, data, licznik) z akcjami „Pokaż wpisy" / „Ponów". Kliknięcie „Pokaż wpisy" prowadzi na `/items?session=<id>`: baner sesji, wyszarzone zakładki i filtry z aktywnym „Wyczyść filtry", wszystkie 4 stany akceptacji z akcjami pojedynczymi (wpis po akcji zostaje w miejscu ze świeżym wierszem), paginacja. Zwykła lista wpisów (5 widoków) też stronicuje — w pełnym parytecie z dziennikiem. W kodzie: jedna karta, jeden hook, jedna ścieżka mutacji.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
| --- | --- | --- | --- |
| Nośnik trybu | `/items?session=<id>` (twardy wymóg) | Rdzeń to konsolidacja na stronie listy wpisów, mimo strukturalnego oporu (ścieżkowa tożsamość widoków) | Ramka |
| Zakres i akcje | Wszystkie stany, akcje zachowane; paginacja w zakresie | Panel jest realnie używany — zastępstwo nie może być uboższe | Ramka |
| Semantyka akcji | Kolejka znika (widoki główne) / rejestr zostaje (tryb sesji) — jedna implementacja, dwie polityki | Zachowuje znane zachowania; dublowanie znika w kodzie, nie w UX | Ramka / Plan |
| Układ trybu | Zakładki + pasek filtrów wyszarzone; aktywne tylko „Wyczyść filtry" + baner z powrotem | Stały układ strony, wyjście dokładnie tam, gdzie użytkownik szuka filtrów | Plan |
| Akcje zbiorcze w trybie | Brak — tylko akcje pojedyncze (parytet z panelem) | „Zaznacz wszystkie" na liście 4 stanów jest niejednoznaczne; bulk był świadomie poza S-10 | Plan |
| Paginacja listy wpisów | Pełny parytet S-11 (przyciski, skok, rozmiar z zapamiętywaniem) przez uogólnienie komponentów | Jedno doświadczenie stronicowania; realne reużycie zamiast kopii | Plan |
| Mutacje × strony | Lokalnie, bez ponownego pobierania; auto-cofnięcie przy opustoszałej stronie | Zachowuje inwariant „mutacje nie re-fetchują" (zero migotania/wyścigów) | Plan |
| Endpoint trybu | Dedykowany `GET /api/import-sessions/[id]/items` + paginacja (nie `?session=` w `/api/items`) | Sesja to zakres ponad stanami, nie widok — kontrakt `view` i ograniczenie FR-008 nietknięte | Plan |
| Zły odnośnik | Tryb z komunikatem „sesja niedostępna" + akcje wyjścia | Uczciwa informacja bez przekierowań gubiących kontekst; RLS i tak zwraca pustkę | Plan |
| Karta sesji | „Pokaż wpisy" tylko przy żywych wpisach; „Ponów" dla `failed`; karta nie jest w całości klikalna | Przycisk nigdy nie prowadzi do pustego widoku; koniec aparatu listbox | Plan |

## Zakres

**W zakresie:** paginacja danych (`listItems`, oba endpointy list) i UI (5 widoków + tryb sesji + uogólnione komponenty S-11); wspólna karta wpisu; tryb sesji z banerem i obsługą złego odnośnika; dziennik jako karty; usunięcie `SessionItemsPanel`/`useSessionItems`/layoutu dwukolumnowego/listboxa; sprzątanie martwego kodu (`ItemList.astro`, nieużywane nakładki serwisu).

**Poza zakresem:** zmiany schematu DB; bulk/„Dodaj item" w trybie sesji; filtry/wyszukiwanie w trybie; zmiana semantyki widoków głównych; aktualizacja adnotacji PRD (osobna edycja); paginacja kursorowa.

## Architektura / Podejście

Od danych do prezentacji, bez okresu z utraconą funkcją: kontrakty danych addytywnie (faza 1) → paginacja UI listy wpisów na uogólnionym dorobku S-11, wszystkie warstwy naraz (faza 2) → czysty refaktor wspólnej karty (faza 3) → tryb sesji wyłącznie ze wspólnych klocków: kryteria z `session`, jeden hook z rozgałęzieniem endpointu, karta w polityce „rejestr" (faza 4) → demontaż panelu i redukcja dziennika do kart, gdy zastępstwo już działa (faza 5).

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Kontrakty danych paginacji | `{items,total}` + okno w serwisie i obu endpointach, kompatybilnie wstecz | Niezauważone złamanie ścieżki bez okna (panel S-10, SSR) |
| 2. Paginacja 5 widoków | Uogólnione kontrolki + parser/SSR/endpoint/hook naraz | Rozjazd hydratacji przy częściowym wpięciu (lekcja S-11 F1) |
| 3. Wspólna karta wpisu | `ItemCard` + czysta logika akcji; 3 widoki bez zmiany zachowania | Cicha zmiana zachowania przy refaktorze (regres w akcjach/zaznaczaniu) |
| 4. Tryb sesji | `?session=` w kryteriach, baner, wyszarzenia, rejestr z akcjami, paginacja | Trwałość `session` w cyklu adresu; fałszywy 409 bez świeżych wierszy |
| 5. Dziennik jako karty | Karty + demontaż panelu/hooka/listboxa, sprzątanie | Utrata funkcji przy usuwaniu (kolejność: najpierw zastępstwo) |

**Wymagania wstępne:** S-10 (endpoint + serwis wpisów sesji) i S-11 (dorobek paginacji) — oba zakończone.
**Szacowany nakład pracy:** ~4–5 sesji w 5 fazach (fazy 1 i 3 małe, 2 i 4 największe).

## Otwarte ryzyka i założenia

- Wyszarzone zakładki wymagają wariantu `disabled` w statycznym `MainFilterNav.astro` — zakładamy prostą realizację (span + `aria-disabled`); gdyby UX raził, alternatywą jest ukrycie paska (odnotowane odstępstwo od decyzji).
- Zmiany grafu importów wysp (fazy 2–5) mogą obudzić klasę błędów dup-React w dev — weryfikacja wg lekcji S-12 po każdej fazie; nowych pakietów npm nie planujemy.
- `count: "exact"` + offset — świadomy kompromis skali MVP (jak S-11 F3).

## Kryteria sukcesu (podsumowanie)

- Użytkownik przegląda i obsługuje wpisy sesji na pełnej stronie listy (baner, wszystkie stany, akcje, paginacja), a dziennik czyta jako proste karty — bez żadnej utraconej funkcji względem panelu.
- `?session=` przeżywa stronicowanie, wstecz/dalej i odświeżenie; zły odnośnik daje czytelne wyjście.
- W repozytorium nie ma drugiej implementacji listy wpisów (panel/hook/karta panelowa usunięte), a 5 widoków stronicuje spójnie z dziennikiem.
