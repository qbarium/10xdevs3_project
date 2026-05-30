---
project: TaskerLight
version: 1
status: draft
created: 2026-05-30
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-07-05
  after_hours_only: true
---

# TaskerLight — Product Requirements Document

## Vision & Problem Statement

Autor generuje w ciągu dnia wiele myśli — pomysłów, zadań, notatek, decyzji — w sytuacjach, w których strukturalny zapis jest niemożliwy (winda, ruch) albo świadomie niepożądany (prowadzenie samochodu, spacer w kontemplacji, rozmowa), ponieważ wybicie się z bieżącej czynności kosztuje więcej niż wartość zapisu. Status quo (notatki cyfrowe, aplikacje produktywności, surowy dyktafon) wymaga od autora decydowania w momencie nagrania, czym dana myśl jest (zadanie? pomysł? notatka?) i jak ma być sformatowana — ten koszt powoduje, że myśli przepadają, a te same pomysły są wielokrotnie generowane i znów zapominane.

Porządkowanie własnych myśli przestało być pracą człowieka, ale nie przestało być jego decyzją. Aplikacja przyjmuje nieuporządkowany strumień głosowo-tekstowy i rozdziela zaszumione wypowiedzi na typowane itemy (zadanie / notatka / pomysł / decyzja / inne) — zdejmując z użytkownika koszt klasyfikacji, ale zostawiając mu kontrolę przez warstwę akceptacji. To zmienia warunki, w których powstaje narzędzie do zarządzania własnym życiem: decyzja „co to jest" przesuwa się z momentu zapisu (drogiego) do momentu przeglądu (taniego), co usuwa największą barierę między myślą a notatką.

## User & Persona

Autor — pojedynczy użytkownik (na MVP). Korzysta z dyktafonu noszonego na szyi w trybie voice-activated, generuje dziesiątki krótkich i kilka długich wypowiedzi dziennie. Wypowiedzi mają dwie formy:

- **Krótkie dyrektywy** — np. „przyciąć drzewko", „rozsiać nawóz na trawnik". Typowo materiał na `task`.
- **Dłuższe rozważania z kontekstem** — np. „zaprojektować aplikację X" + akapit szczegółów. Typowo materiał na `idea`, `note` lub `decision`.

Moment, w którym sięga po TaskerLight: po sesji nagraniowej w terenie. Ma na ręku surowy transkrypt (z dyktafonu albo z innego źródła tekstowego), chce go w jednym geście wrzucić do aplikacji i zobaczyć już rozdzielone, typowane itemy do akceptacji.

## Success Criteria

### Primary

- Pierwszy flow MVP działa end-to-end dla testowej sesji: **login → konfiguracja klucza API zewnętrznego dostawcy AI (BYOK) → paste tekstu LUB upload jednego pliku `.md`/`.txt` → submit → synchroniczna blokada interakcji z UI ze wskaźnikiem aktywności → klasyfikacja → komunikat „zakończona z N itemami" + auto-przejście do widoku walidacyjnego (filtr główny „Elementy do akceptacji") → akceptacja przez ujednolicony model (zaznacz + zatwierdź zaznaczone, z opcjonalną edycją `title`/`description`/`typ` lub odrzuceniem) → zaakceptowane itemy widoczne w widoku Aktywne (z filtrem typu Zadania / Notatki / Pomysły / Decyzje / Inne) → zmiana stanu operacyjnego zadania na `zrealizowane` (zadanie przechodzi do widoku Zakończone)**. Brak błędów stagingowych, brak przerwań nawigacyjnych.

### Secondary

- **Acceptance rate ≥ 70%** w pojedynczej sesji review — co najmniej 70% itemów zaproponowanych przez klasyfikator jest akceptowanych (z ewentualną edycją), a nie odrzucanych. Mierzy bezpośrednio jakość klasyfikacji — jeśli klasyfikacja źle typuje, „praca → decyzja" nie zadziałało.
- **Click count od submit do listy ≤ 1** (bulk accept) lub **≤ N** (indywidualna walidacja N itemów). Żadnych dodatkowych kroków nawigacyjnych pomiędzy submit a docelową listą. Mierzy zdrowie głównej ścieżki — UX musi być jednoklikowa.

### Guardrails

- **Klucze API użytkowników nigdy nie pojawiają się w logach aplikacji, audit trail, raportach błędów ani telemetrii.** Komunikaty błędów dotyczące klucza nie mogą zawierać żadnego jego fragmentu. Wyciek klucza w log = wyciek użytkowego sekretu trzeciej strony.
- **Surowy wsad użytkownika nie trafia do żadnego trzeciego serwisu poza zewnętrznym dostawcą AI, którego klucz user skonfigurował.** Brak narzędzi observability / tracingu wywołań klasyfikacji w MVP — wsad to potencjalnie prywatne myśli; nie wysyłamy go do narzędzi obserwowalności.
- **Każdy zaakceptowany item zachowuje powiązanie z sesją importu, z której pochodzi** — audit trail jest zawsze odtwarzalny; nie tracimy wiedzy o tym, z jakiego raw_input pochodzi dany item.
- **Item lifecycle jest jednokierunkowy w wymiarze akceptacji** — item raz zaakceptowany NIE wraca do statusu `pending`; może być przeniesiony do kosza i z niego przywrócony (zachowując stan operacyjny) lub trwale usunięty przez „wyczyść kosz". Stan operacyjny zadania (`nowe` / `w realizacji` / `zrealizowane` / `anulowane`) jest niezależny od stanu akceptacji i wzajemnie przechodni.

## User Stories

### US-01: Submit wsadu tekstowego

- **Given** user jest zalogowany i ma skonfigurowany klucz zewnętrznego dostawcy AI
- **When** wkleja tekst do pola wsadu i klika „submit"
- **Then** aplikacja blokuje interakcję z UI ze wskaźnikiem aktywności i komunikatem „analizujemy wsad"; po zakończeniu klasyfikacji UI przechodzi w stan „zakończona z N itemami" z przyciskiem „Przejdź do walidacji teraz" i automatycznym odliczaniem; po przejściu user widzi widok walidacyjny (filtr główny „Elementy do akceptacji") z wszystkimi swoimi pendingami

#### Acceptance Criteria

- Interakcja z UI jest zablokowana do końca klasyfikacji lub timeoutu (np. 60 s) — brak możliwości anulowania w stanie „przetwarzanie".
- Widok walidacyjny pokazuje wszystkie pending itemy usera (brak filtra „bieżąca sesja" jako domyślnego).
- Limit 100 000 znaków na pole wklejania egzekwowany przed submit z widocznym licznikiem.

### US-02: Bulk akceptacja przez ujednolicony model zaznaczania

- **Given** user jest na widoku walidacyjnym (filtr „Elementy do akceptacji") z N itemami
- **When** klika „zaznacz wszystkie" + „zatwierdź zaznaczone"
- **Then** wszystkie N itemów otrzymuje status akceptacji `accepted` i pojawia się w widoku Aktywne (zgodnie z filtrem głównym + filtrem typu); widok walidacyjny dla tych itemów jest pusty

#### Acceptance Criteria

- Akcja powyżej progu (konkretny próg w spec technicznej, np. 5+ itemów) wymaga potwierdzenia z liczbą („zaakceptować N itemów?").
- Po akceptacji widok pozostaje na walidacyjnym; user widzi efekt akcji (lista skrócona o zaznaczone itemy).
- Itemy zachowują powiązanie z sesją importu jako filtrem dodatkowym.

### US-03: Indywidualna walidacja z edycją i odrzuceniem

- **Given** user jest na widoku walidacyjnym z 3 itemami
- **When** pierwszy zaznacza i klika „zatwierdź zaznaczone"; drugiemu edytuje pola (`title`, `description`, opcjonalnie `typ`) i klika „zatwierdź zaznaczone"; trzeci zaznacza i klika „odrzuć zaznaczone"
- **Then** pierwszy item otrzymuje status `accepted` i widoczny w Aktywne; drugi (z edycją) — analogicznie; trzeci otrzymuje status `rejected` i jest widoczny w widoku Kosz (z filtrem dodatkowym poprzedniego statusu = `rejected`)

#### Acceptance Criteria

- Edycja w stagingu obejmuje `title`, `description` oraz `typ` itemu.
- Odrzucenie znika item z widoku walidacyjnego natychmiast (zachowanie statusu `rejected` w bazie).
- Item odrzucony dostępny w widoku Kosz; nie można go już zaakceptować (lifecycle nie wraca do `pending`).

### US-04: Zmiana stanu operacyjnego zadania

- **Given** zaakceptowane zadanie jest w widoku Aktywne (filtr typu: Zadania)
- **When** user zmienia stan operacyjny z `nowe` lub `w realizacji` na `zrealizowane`
- **Then** zadanie znika z widoku Aktywne i pojawia się w widoku Zakończone; stan operacyjny `zrealizowane` zapisany; user może w każdej chwili cofnąć stan z powrotem na `nowe` lub `w realizacji`

#### Acceptance Criteria

- Akcja zmiany stanu operacyjnego dostępna per item i jako akcja zbiorcza.
- Wszystkie cztery stany (`nowe` / `w realizacji` / `zrealizowane` / `anulowane`) są wzajemnie przechodnie — brak stanu finalnego dopóki item nie jest w koszu.
- Akcja dostępna tylko dla itemów typu `task`.

### US-05: Przeniesienie do kosza i przywrócenie z kosza

- **Given** zaakceptowana notatka jest w widoku Aktywne (filtr typu: Notatki)
- **When** user klika „przenieś do kosza"
- **Then** notatka znika z widoku Aktywne i pojawia się w widoku Kosz (filtr dodatkowy poprzedniego statusu: `deleted`); status akceptacji zmieniony na `deleted`, stan operacyjny zachowany

#### Alternatywny flow — przywrócenie

- **Given** notatka jest w widoku Kosz ze statusem `deleted`
- **When** user klika „przywróć z kosza"
- **Then** notatka wraca do widoku Aktywne ze stanem operacyjnym dokładnie takim, jakim była przed przeniesieniem

#### Acceptance Criteria

- Akcje „przenieś do kosza" i „przywróć z kosza" dostępne per item i jako akcje zbiorcze.
- Trwałe usunięcie itemu z kosza tylko przez globalną akcję „wyczyść kosz".

### US-06: Konfiguracja klucza zewnętrznego dostawcy AI (BYOK)

- **Given** user jest zalogowany pierwszy raz i nie ma skonfigurowanego klucza zewnętrznego dostawcy AI
- **When** próbuje submitować wsad
- **Then** aplikacja blokuje akcję, pokazuje komunikat „skonfiguruj Klucz API <nazwa dostawcy AI> w ustawieniach" z linkiem do strony dostawcy AI (gdzie user generuje klucz) oraz linkiem do profilu (gdzie user wkleja klucz); user przechodzi do profilu, wkleja klucz, wraca do submitu

#### Acceptance Criteria

- Klucz zapisywany w postaci zaszyfrowanej; w profilu pokazywany w postaci zamaskowanej zachowującej zdolność identyfikacji.
- Brak walidacji klucza przy zapisie.
- Po zapisaniu klucza user może ponowić submit — akcje wymagające klucza odblokowane.
- Komunikat błędu, ekran ustawień i ekran submitu używają jednolitej nazwy „Klucz API <nazwa dostawcy AI>".

### US-07: Błąd klasyfikacji — niepoprawny klucz dostawcy AI

- **Given** user ma skonfigurowany klucz zewnętrznego dostawcy AI, ale niepoprawny lub wygasły
- **When** submituje wsad
- **Then** po klasyfikacji UI przechodzi w stan „niepowodzenie" z komunikatem „Klucz API <nazwa dostawcy AI> jest niepoprawny lub wygasł — sprawdź ustawienia" i przyciskiem „Spróbuj ponownie"; sesja importu tworzona ze statusem `niepowodzenie`, wsad zachowany w sesji (do ponowienia bez konieczności wprowadzania od nowa)

#### Acceptance Criteria

- Komunikat błędu NIE zawiera żadnego fragmentu klucza.
- Akcja „Spróbuj ponownie" sprawdza stan klucza przed ponowieniem — jeśli klucz został usunięty z profilu między błędem a kliknięciem, pokazuje komunikat „Klucz API <nazwa dostawcy AI> został usunięty z profilu, skonfiguruj nowy klucz przed ponowieniem".
- Sesja importu widoczna w dzienniku sesji z możliwością ponowienia.

### US-08: Ręczne dodanie itemu z pominięciem klasyfikacji

- **Given** user jest zalogowany (z lub bez skonfigurowanego klucza zewnętrznego dostawcy AI)
- **When** klika akcję „dodaj item", wybiera typ (zadanie / notatka / pomysł / decyzja / inne), wpisuje `title` i `description`, zatwierdza formularz
- **Then** item powstaje od razu ze statusem akceptacji `accepted` i stanem operacyjnym `nowe`; omija etap `pending` i widok walidacyjny; pojawia się w widoku Aktywne (z filtrem typu odpowiadającym wybranemu typowi)

#### Acceptance Criteria

- Akcja **NIE wymaga skonfigurowanego klucza zewnętrznego dostawcy AI** — działa w pełni offline od strony klasyfikacji (wyjątek od FR-024).
- Item ma status akceptacji `accepted` i (dla typu `task`) stan operacyjny `nowe`; itemy typu nie-`task` mają stan operacyjny domyślny zgodny z FR-009.
- Item nie pochodzi z sesji importu klasyfikacji; nie pojawia się w dzienniku sesji importu (FR-027).
- Item podlega tym samym akcjom co itemy zaakceptowane z klasyfikacji (edycja FR-011, zmiana stanu operacyjnego FR-009, przeniesienie do kosza FR-013).

## Functional Requirements

### Authentication & Profile

- FR-001: User może utworzyć konto i się zalogować. Priority: must-have
  > Sokrates: Rozważone kontrargumenty — spowolnienie przepływu „quick-capture" przez krok logowania, ryzyko nadużyć w publicznej aplikacji z BYOK, jednorazowe konta bez weryfikacji e-mail. Rozstrzygnięcie: utrzymujemy FR bez zmian; długa sesja typu „zapamiętaj mnie" (TTL np. 30 dni) niezależna od mechanizmu logowania neutralizuje ryzyko tarcia. Sesja wraca tylko po wylogowaniu lub wygaśnięciu TTL.

- FR-021: User może zapisać, podejrzeć w postaci zamaskowanej i usunąć swój klucz API zewnętrznego dostawcy AI w profilu. Klucz przechowywany w postaci zaszyfrowanej w stanie spoczynku. Priority: must-have
  > Sokrates: Rozważone kontrargumenty — klucz szyfrujący w konfiguracji aplikacji jako potencjalna luka security, zamaskowany podgląd za mało dla identyfikacji, brak polityki cascade dla delete klucza podczas trwającego submitu. Rozstrzygnięcie: FR stoi z mitygacjami. (1) **Klucz szyfrujący przechowywany w konfiguracji aplikacji.** Dla MVP-zaliczeniowego akceptowalne — zewnętrzny system zarządzania kluczami to **dług architektoniczny do V2**. Konkretna konfiguracja i polityka rotacji → spec techniczna. (2) **Format zamaskowania klucza w UI: zamaskowany podgląd zachowujący zdolność identyfikacji** (np. prefiks + ostatnie kilka znaków) — wystarczające dla persony (jeden user, jeden klucz). (3) **Polityka cascade dla delete klucza**: klucz odczytywany raz, na początku przetwarzania submitu, trzymany w pamięci procesu serwera do końca operacji. Usunięcie klucza w spoczynku z innej sesji (scenariusz multi-device) NIE wpływa na trwającą klasyfikację — kończy się normalnie. Następny submit (po usunięciu) trafia na „brak skonfigurowanego klucza" wg FR-024.

- FR-022: Klucz API jest zapisywany bez walidacji przy zapisie. Niepoprawny lub wygasły klucz objawia się błędem przy pierwszej próbie wywołania klasyfikacji; błąd komunikowany w UI z sugestią weryfikacji klucza w ustawieniach. Priority: must-have
  > Sokrates: Rozważone kontrargumenty — brak feedback dla usera po zapisie, trywialna walidacja formatu byłaby tania, brak trim/normalize przy paste'cie z BOM/spacjami. Rozstrzygnięcie: brak kontrargumentu — FR stoi bez zmian. Brak walidacji = świadomy kompromis spójny z priorytetem „minimalny czas implementacji". Detale (format check / normalize / feedback po save) → spec techniczna.

- FR-024: Akcje wymagające klucza API (submit wsadu, klasyfikacja tekstu, transkrypcja audio) są zablokowane dla użytkownika bez skonfigurowanego klucza zewnętrznego dostawcy AI. UI pokazuje komunikat „skonfiguruj Klucz API <nazwa dostawcy AI> w ustawieniach" z linkiem do strony dostawcy AI, gdzie user generuje klucz. Pozostałe akcje (przeglądanie list, edycja itemów, oznaczanie zadań jako wykonane, zarządzanie koszem, ręczne dodawanie itemów) działają bez klucza. Polityka retry po błędzie klasyfikacji sprawdza stan klucza przed ponowieniem — jeśli klucz został usunięty między błędem a kliknięciem retry, aplikacja pokazuje komunikat „Klucz API <nazwa dostawcy AI> został usunięty z profilu, skonfiguruj nowy klucz przed ponowieniem". Priority: must-have
  > Sokrates: Rozważone kontrargumenty — onboarding gap (komunikat za generyczny), spójność komunikatów z FR-022, brak polityki retry po błędzie z usuniętym kluczem. Rozstrzygnięcie: FR stoi z doprecyzowaniem nazewnictwa i polityki retry. (1) **Komunikat o brakującym kluczu doprecyzowany** — wszędzie zamiast generycznego „klucz API" używamy nazwy dostawcy AI zgodnej z decyzją architektoniczną autora (zob. `## Forward: tech-stack` w shape-notes) wraz z linkiem do strony dostawcy AI. Dotyczy: ekranu submit przy braku klucza, ekranu ustawień profilu, komunikatu w przypadku błędu (FR-022). (2) **Spójność komunikatów** rozwiązana przez wskazanie konkretnych user stories — US-06 (BYOK setup) i US-07 (błąd klasyfikacji, niepoprawny klucz). Te dwa scenariusze pokrywają wszystkie ścieżki komunikatu o kluczu; FR-024 nie konkuruje z US-06/US-07, ale je egzekwuje. (3) **Polityka retry po błędzie klasyfikacji** sprawdza stan klucza przed ponowieniem — jeśli klucz został usunięty z profilu między błędem a kliknięciem retry, aplikacja zamiast ponawiać klasyfikację pokazuje komunikat o usunięciu klucza. User wraca do ustawień, dodaje klucz, ponawia.

### Input

- FR-002: User może wprowadzić wsad jako wklejony tekst w polu tekstowym z widocznym licznikiem znaków. Limit: 100 000 znaków liczonych w jednostkach UTF-16 code units (zgodnie ze standardową właściwością długości łańcucha w JavaScript); po przekroczeniu pole blokuje dalsze wprowadzanie. Sanityzacja wsadu po stronie przeglądarki przed wysłaniem (natychmiastowy efekt w liczniku, gwarantujący że user widzi rezultat sanityzacji bez round-trip do serwera): normalizacja Unicode do NFC, usunięcie znaków sterujących poza standardowymi białymi znakami (LF, tabulacja), przycięcie białych znaków z początku i końca. Priority: must-have
  > Sokrates: Rozważone kontrargumenty — niejednoznaczność jednostki „znak" przy emoji i parach surrogate, ukryte znaki formatujące z wklejeń z edytorów dokumentów, brak podglądu kosztu tokenów przed wysłaniem. Rozstrzygnięcie: utrzymujemy FR z trzema mitygacjami. (1) Limit 100 000 = długość ciągu w UTF-16 code units; licznik widoczny w UI. (2) Sanityzacja wsadu w dwóch miejscach zależnie od źródła: dla pola wklejania — po stronie przeglądarki przed wysłaniem (gwarancja: licznik aktualizuje się natychmiast, user widzi efekt sanityzacji w momencie wklejenia); dla plików tekstowych (FR-003) — po stronie serwera po odbiorze (gwarancja: surowa zawartość pliku nie trafia do klasyfikatora przed normalizacją). Zakres sanityzacji jednolity. (3) Podgląd kosztu tokenów świadomie poza zakresem MVP — w modelu BYOK user widzi koszty w panelu dostawcy AI.

- FR-003: User może wprowadzić wsad jako drag-and-drop pliku transkrypcji (`.txt`, `.md`). Pliki traktowane jako zwykły tekst (bez parsowania struktury markdown — klasyfikator sam rozumie znaczniki w treści). Sanityzacja po stronie serwera po odbiorze (gwarancja: surowa zawartość pliku nie trafia do klasyfikatora przed normalizacją). Obowiązkowa obsługa kodowań UTF-8 (w tym z BOM) i Windows-1250. Inne popularne kodowania — best-effort, bez gwarancji dla MVP, w zależności od bibliotek wybranych na etapie spec technicznej. Plik nieczytelny w żadnym obsługiwanym kodowaniu — przyjazny komunikat z listą obsługiwanych kodowań i sugestią zapisu w jednym z nich; plik nie trafia do klasyfikatora. Priority: must-have
  > Sokrates: Rozważone kontrargumenty — wpływ struktury markdown na klasyfikację, problemy z kodowaniem i końcami linii, redundancja względem FR-002 (wklejanie). Rozstrzygnięcie: utrzymujemy FR z mitygacjami zaszytymi w treści (plain text, dwa obowiązkowe kodowania, fallback komunikat). Drop nie jest redundantny — główny przypadek użycia (transkrypty z dyktafonu na dysku) realnie korzysta z drop bez otwierania w edytorze; dwie ścieżki wsadu są celowe.

- FR-004: User może wprowadzić wsad jako drag-and-drop pliku audio (`.mp3`, `.wav`). Pliki przekraczające limit rozmiaru (FR-019) są odrzucane z komunikatem, bez prób chunkingu. Każdy plik = osobna sesja importu (zgodnie z FR-015). Priority: nice-to-have
  > Sokrates: Rozważone kontrargumenty — audio jako nice-to-have zamyka kluczową obietnicę produktu (persona = dyktafon na szyi), asynchroniczność i maszyna stanów transkrypcji to nowa oś infrastruktury, limit rozmiaru praktycznie ogranicza długość nagrania. Rozstrzygnięcie: utrzymujemy nice-to-have ze świadomą akceptacją kompromisu z Phase 3 MVP Discipline. (1) Bez audio user z dyktafonem może transkrybować plik zewnętrznie (darmowe aplikacje, lokalne narzędzia transkrypcji) i wkleić tekst — to nie jest pełna realizacja obietnicy, ale akceptowalny MVP udowadniający wartość samej klasyfikacji. (2) Zarzut o nowej osi infrastruktury wzmacnia decyzję o pozostawieniu audio w `could`. (3) Limit usługi transkrypcji audio dla persony (krótkie pomysły, dziesiątki sekund) jest praktycznie nieosiągalny.

- FR-018: Limit rozmiaru pliku tekstowego (`.txt`, `.md`): 300 KB. UI blokuje upload większych plików przed submitem z komunikatem. Priority: must-have
  > Sokrates: Rozważone kontrargumenty — asymetria znaków a bajtów (paste a plik), KB zależne od kodowania, limit per plik a łączny dla wsadu. Rozstrzygnięcie: FR stoi. (1) **Asymetria świadoma:** pole wklejania mierzone w znakach (UI z widocznym licznikiem), plik tekstowy mierzony w bajtach (proste i tanie do realizacji, naturalne dla pliku). (2) Limit w KB świadomie zaakceptowany — liczba znaków po dekodowaniu zależy od kodowania, ale to nie problem dla pipeline'u. (3) **Limit per element wsadu** (paste do 100k znaków, plik tekstowy do 300 KB każdy, plik audio do 25 MB każdy).

- FR-019: Limit rozmiaru pliku audio (`.mp3`, `.wav`): 25 MB (limit usługi transkrypcji audio dostawcy AI). UI blokuje upload większych plików przed submitem z komunikatem. Priority: nice-to-have
  > Sokrates: Rozważone kontrargumenty — limit per plik a łączny dla wsadu, zmiana limitu po stronie usługi transkrypcji, walidacja formatu (magic-bytes). **Rozstrzygnięcie: ŚWIADOMA DECYZJA O CIĘCIU ZAKRESU MVP do single-file synchronicznego submitu.** Po analizie złożoności asynchronicznego przetwarzania multi-file (kolejki, workery, powiadomienia w UI, infrastruktura) i porównaniu z budżetem 3–4 tygodni TaskerLight (projekt zaliczeniowy), zapadła decyzja o ograniczeniu MVP. **Zmiany w stosunku do wcześniejszych mitygacji:** (1) **Wsad = jeden element:** paste tekstu LUB jeden plik tekstowy LUB jeden plik audio. Brak kompletowania wielu plików w jednej sesji. (2) **Przetwarzanie synchroniczne** z timeoutem (np. 60 s). Bez kolejek, workerów, asynchronicznych zadań w tle. (3) **UI w trakcie klasyfikacji blokuje interakcję bez możliwości anulowania** (rewizja mitygacji FR-006): Stan 1 (przetwarzanie) — wskaźnik aktywności, blokada interakcji bez przerwania; Stan 2 (zakończone z itemami) — przycisk „przejdź do walidacji teraz" + auto-odliczanie; Stan 3 (zakończone bez itemów) — komunikat + zamknij; Stan 4 (błąd) — komunikat + „spróbuj ponownie". (4) **Brak asynchronicznych powiadomień w UI.** Brak ścieżki „wracam do aplikacji, dostanę powiadomienie". Wsad zachowywany w sesji importu — ponowienie z poziomu UI lub z dziennika sesji. (5) **Limit liczby plików w sesji ZNIKA** — wsad w MVP = pojedynczy element. (6) **Dziennik sesji uproszczony** (rewizja mitygacji FR-015): każda sesja = jeden submit = jeden element wsadu; per-file rozbicie odpada. **Uzasadnienie cięcia:** TaskerLight to projekt zaliczeniowy z budżetem 3–4 tygodnie. Multi-file z asynchronicznością wymaga tygodnia pracy nad samą infrastrukturą, nie dowożąc proporcjonalnej wartości dla POC. Single-file synchroniczne wystarcza do udowodnienia insightu produktowego (capture → klasyfikacja → walidacja → strukturalne itemy). **Dla FR-019 konkretnie:** limit 25 MB per plik audio zostaje. Walidacja magic-bytes po stronie serwera. Brak limitu łącznego — wsad w MVP = pojedynczy element.

### Classification & Import Session

- FR-005: Po submit aplikacja przekazuje wsad do zewnętrznego klasyfikatora (dostawcy AI), który dekomponuje go na 0..N itemów wg kontraktu JSON (`type`, `title`, `description`). Pełniejszy kontrakt z `confidence`, `importance`, `tags` zachowany jako forward-compatible schema — UI MVP używa tylko podzbioru. Priority: must-have
  > Sokrates: Rozważone kontrargumenty — pusta tablica jako poprawny wynik wymaga obsługi, brak retry przy błędach klasyfikatora, brak walidacji struktury wyjścia. Rozstrzygnięcie: FR stoi z mitygacjami. (1) Puste sesje (0 itemów) są konstrukcyjnie wymagane — większość wsadów z dyktafonu może być pusta (rozmowy, dygresje, własne myśli); aplikacja zarejestruje pustą sesję i pozwoli iść dalej, bez sztucznego wypełniacza typu „minimum 1 item `other`" (zaśmiecałby bazę i zmuszał do odrzucania nieinformacyjnych itemów przy każdym wsadzie bez treści). (2) Obsługa błędów i retry (transient errors, timeout, polityka odczekiwania) → decyzja specyfikacji technicznej. (3) Walidacja kontraktu JSON wymagana przed zapisem (obecność i typy obowiązkowych pól; pola dodatkowe — `confidence`/`importance`/`tags` — dopuszczalne). **Surowa odpowiedź klasyfikatora nie trafia do bazy** — zapisujemy wyłącznie zinterpretowane itemy zgodne z kontraktem; surowa odpowiedź to artefakt techniczny, opcjonalnie logowany po stronie serwera do diagnostyki. Naruszenie kontraktu = wewnętrzny błąd aplikacji (generyczny komunikat dla usera z sugestią ponowienia), nie błąd usera; powtarzające się naruszenia = sygnał do poprawy promptu.

- FR-015: Każdy submit (jeden element wsadu — paste tekstu LUB jeden plik tekstowy LUB jeden plik audio) tworzy nową sesję importu z unikalnym identyfikatorem. Sesja zawiera: rejestr wejścia (dla paste — treść wklejonego tekstu zapisana bezpośrednio w sesji; dla pliku tekstowego lub audio — referencja do pliku, którego zawartość przechowywana jest w storage serwera i jest nierozerwalnie związana z sesją), status sesji (`przetwarzanie` / `zakończona z itemami` / `zakończona bez itemów` / `niepowodzenie`), liczbę wygenerowanych itemów lub komunikat błędu. Sesja importu jest **filtrem dodatkowym** w widokach jednolitej listy (FR-008), nie filtrem głównym; widok walidacyjny domyślnie nie filtruje po sesji. Sesje zachowywane bez TTL (audit log; polityka cleanup poza MVP). Priority: must-have
  > Sokrates: Rozważone kontrargumenty — brzmienie filtra domyślnego sprzeczne z mitygacją FR-006, time-window łączenia submitów, sesje bez TTL jako rosnący dataset. Rozstrzygnięcie: FR stoi co do istoty (każdy submit = osobna sesja z unikalnym ID), brzmienie do przepisania. (1) **W nowym modelu nawigacji lista itemów i dziennik sesji to dwa osobne miejsca w UI.** Lista itemów (widoki Aktywne / Zakończone / Anulowane / Elementy do akceptacji / Kosz) **nie operuje na sesjach** — sesja importu jest jednym z kryteriów filtrów dodatkowych w obrębie widoku. (2) **Dziennik sesji importu** = osobny widok diagnostyczny z minimalnym zakresem: rejestr wejścia (wklejony tekst + referencja do pliku), łączny status sesji, liczba wygenerowanych itemów lub komunikat błędu, akcja „spróbuj ponownie" dla niepowodzeń. Per-file status i podgląd itemów → poza MVP. (3) Time-window łączenia submitów ODRZUCONE — każdy submit = osobna sesja. (4) Sesja importu jako audit log bez TTL — świadomie zaakceptowane; polityka cleanup → poza MVP.
  >
  > **🔁 REWIZJA w turze 5 Sokratesa (mitygacja FR-019):** każda sesja = **jeden element wsadu** (paste LUB jeden plik tekstowy LUB jeden plik audio). Dziennik sesji uproszczony — per-file rozbicie odpada, bo zawsze jest jeden element. Minimalny zakres dziennika: rejestr wejścia (paste lub plik), łączny status sesji, liczba itemów lub błąd, akcja „spróbuj ponownie".

- FR-020: Aplikacja zapisuje wszystkie itemy zwrócone przez klasyfikator bez obcinania ani sztucznego łączenia bytów. Prompt do klasyfikatora zawiera instrukcje jakościowe („nie rozbijaj zdań na sub-itemy, łącz powiązane myśli w jeden item") bez konkretnego limitu liczbowego. **Safety net techniczny: 100 itemów per sesja** — jeśli klasyfikator zwróci więcej niż 100, aplikacja traktuje to jako anomalię techniczną (halucynacja modelu): nie zapisuje żadnego itemu, kończy sesję ze statusem `niepowodzenie`, daje userowi opcję „spróbuj ponownie". Limit 100 to safety net, nie jest widoczny dla usera jako limit produktowy. Priority: must-have
  > Sokrates: Rozważone kontrargumenty — silent truncate przy 50 = utrata audit trail, 50 może być za dużo dla walidacji, pre/post-truncate niezdefiniowane. **Rozstrzygnięcie: ZMIANA MODELU OBSŁUGI LIMITU.** (1) **Twardy limit produktowy 50 itemów USUNIĘTY** z FR-020. Aplikacja zapisuje wszystkie itemy zwrócone przez klasyfikator bez obcinania ani sztucznego łączenia bytów. Twarde cięcie po stronie aplikacji lub instrukcja limitu w prompcie do klasyfikatora = utrata danych z perspektywy usera + ryzyko popychania modelu do nienaturalnego scalania powiązanych, ale odrębnych itemów. (2) **Safety net techniczny na poziomie 100 itemów** per sesja — założenie architektoniczne chroniące bazę przed wybuchem rekordów w razie halucynacji modelu. Realny wsad to 5–80 itemów; 100 jest praktycznie nieosiągalne w normalnym użyciu. Jeśli klasyfikator zwróci więcej niż 100, aplikacja traktuje to jako anomalię techniczną — **zwraca błąd, NIE zapisuje, daje userowi opcję ponowienia.** Nie jest to limit produktowy widoczny dla usera. (3) **Prompt do klasyfikatora zawiera instrukcje jakościowe** („nie rozbijaj zdań na sub-itemy, łącz powiązane myśli w jeden item") bez konkretnego limitu liczbowego.

- FR-023: Aplikacja używa jednego modelu klasyfikacji dostawcy AI dla klasyfikacji tekstu — user nie wybiera modelu w UI. Konkretny model klasyfikacji = decyzja w spec technicznej, nie w PRD. Usługa transkrypcji audio dostawcy AI używana dla transkrypcji audio (gdy wejdzie nice-to-have audio). Priority: must-have
  > Sokrates: Rozważone kontrargumenty — free-tier user dostawcy AI bez dostępu do flagship modelu, brak flexibility per-user, niejasność jak hardcoded model się aktualizuje. Rozstrzygnięcie: FR stoi z doprecyzowaniem. (1) **Wybór modelu = świadoma decyzja architektoniczna autora aplikacji.** User świadomie wybiera aplikację z BYOK, akceptując że musi mieć adekwatne konto u dostawcy AI. Brak dostępu do wybranego modelu (np. free tier) → odpowiedni komunikat błędu w UI przy konfiguracji klucza i ewentualnie w komunikacie błędu. (2) **Brak konfiguracji modelu per-user** — to NIE konfigurowalność dla user-a, to decyzja produktowa autora (analogicznie jak inne aplikacje konsumenckie nie pytają user-a o model). Choice modelu w profilu — **świadomie poza zakresem, nie-feature**, nie nice-to-have. (3) **Konkretny model konfigurowalny przez konfigurację aplikacji** (nie przez panel user-a), aktualizowalny przez redeploy. Daje to autorowi możliwość zmiany modelu (przy deprecation po stronie dostawcy AI, przy nowych modelach, przy zmianie cenowej) bez modyfikacji kodu. Decyzja architektoniczna, nie produktowa.

- FR-027: User ma dostęp do osobnego widoku **dziennika sesji importu** — chronologicznej listy sesji z minimalnym zakresem informacji: rejestr wejścia (treść wklejonego tekstu lub nazwa i typ pliku), łączny status sesji (`przetwarzanie` / `zakończona z itemami` / `zakończona bez itemów` / `niepowodzenie`), liczba wygenerowanych itemów lub komunikat błędu, akcja „spróbuj ponownie" dostępna dla sesji ze statusem `niepowodzenie` (wsad zachowany — brak konieczności wprowadzania od nowa). Per-file rozbicie i podgląd zawartości itemów w obrębie sesji → poza MVP. Priority: must-have

### Manual Item Entry

- FR-028: User może dodać item ręcznie z poziomu UI, z pominięciem wsadu i klasyfikacji. Formularz zawiera wybór typu (`task` / `note` / `idea` / `decision` / `other`) oraz pola `title` i `description`. Po zapisie item powstaje od razu ze statusem akceptacji `accepted` i stanem operacyjnym `nowe` — omija etap `pending` i widok walidacyjny. Akcja **NIE wymaga skonfigurowanego klucza dostawcy AI** — działa w pełni offline od strony klasyfikacji (wyjątek od FR-024). Konkretna lokalizacja akcji w UI (przycisk w nawigacji, w widoku Aktywne, w innym miejscu) → spec techniczna. Priority: must-have
  > **Decyzja z fazy sokratejskiej:** Ręczne dodawanie itemów jest must-have dla MVP z dwóch powodów: (1) **testowalność UI bez klasyfikatora** — bez tej ścieżki każdy test UI (jednostkowy, integracyjny, E2E) musi przechodzić przez wywołanie zewnętrznego dostawcy AI, co jest wolne, kosztowne i niedeterministyczne; ręczne dodawanie pozwala wypełnić listy testowymi danymi z pełnym pokryciem typów i stanów operacyjnych. (2) **realny przypadek użycia** — user przy komputerze, ma pomysł, chce go szybko dopisać bez konieczności wklejania wsadu i czekania na klasyfikację. **Implikacja dla FR-024:** akcje wymagające klucza są zablokowane dla user-a bez klucza, ALE ręczne dodawanie pozostaje dostępne — user bez skonfigurowanego klucza może operować aplikacją w trybie offline (dodawać itemy, zarządzać listami, oznaczać stany operacyjne).

### Validation & Staging

- FR-006: Po submit aplikacja **blokuje interakcję z UI w widoczny sposób** z czterema stanami przebiegu klasyfikacji: (1) **trwa** — wskaźnik aktywności + komunikat „analizujemy wsad", **brak możliwości anulowania** (interakcja zablokowana do końca operacji lub timeoutu, np. 60 s); (2) **zakończona z N itemami** — komunikat „sesja zawiera N itemów" + przycisk „Przejdź do walidacji teraz" + automatyczne odliczanie do przejścia; (3) **zakończona bez itemów** — komunikat „nie znaleziono itemów do walidacji" + przycisk „Zamknij"; (4) **niepowodzenie** — komunikat błędu + przycisk „Spróbuj ponownie"; wsad zachowany w sesji importu, bez konieczności wprowadzania od nowa. Po stanie (2) user trafia na widok walidacyjny pokazujący **wszystkie pendingi user-a** (filtr główny „Elementy do akceptacji"), nie tylko z bieżącej sesji — eliminuje to ryzyko zapomnienia zaległych. Sesja importu jest filtrem dodatkowym, nie filtrem głównym. Priority: must-have
  > Sokrates: Rozważone kontrargumenty — auto-redirect przerywa sesję wprowadzania kolejnych wsadów, brak loading state'u podczas klasyfikacji, filtr „bieżąca sesja" ukrywa zaległe pendingi z poprzednich sesji. Rozstrzygnięcie: FR stoi z istotną reorganizacją UX. (1) **Cztery stany po wysłaniu** (zob. treść FR powyżej). (2) **Auto-przejście działa WYŁĄCZNIE w obrębie otwartej blokady.** Jeśli user zamknął blokadę w stanie „trwa", mechanizm auto-przejścia jest nieaktywny — zamiast tego pojawia się powiadomienie w UI informujące o zakończeniu z możliwością świadomego przejścia lub ponowienia. Powiadomienie nie wyrywa usera z bieżącej aktywności. (3) **Brak filtra „bieżąca sesja"** w widoku walidacyjnym — widok pokazuje wszystkie pendingi usera, eliminuje ryzyko zapomnienia zaległych. Sesja importu jako byt zyskuje **osobny widok dziennika operacji** (historia sesji ze statusami). Dwie różne perspektywy: walidacyjna działa na itemach, dziennik na sesjach. (4) Wsad = wszystkie elementy jako jedno żądanie klasyfikacji. (5) Metryka click count z sukcesu dotyczy domyślnego przepływu; świadome wyjście usera z domyślnego przepływu nie jest wliczane.
  >
  > **🔁 REWIZJA w turze 5 Sokratesa (mitygacja FR-019):** zmiana architektury z asynchronicznej na **synchroniczną**. Blokada interakcji z UI **bez możliwości anulowania** w stanie 1 (przetwarzanie). Brak ścieżki „wracam do aplikacji, dostanę powiadomienie". Powiadomienia async usunięte ze scope MVP. Timeout (np. 60 s) zamiast asynchronicznego workera. UI nadal ma 4 stany, ale Stan 1 jest blokujący.

- FR-007: Na liście walidacyjnej (filtr główny „Elementy do akceptacji") user korzysta z **ujednoliconego modelu zaznaczania** — selekcja per item + akcja „zaznacz wszystkie" + akcje zbiorcze („zatwierdź zaznaczone", „odrzuć zaznaczone"). Per-item akceptacja = zaznacz jeden + „zatwierdź zaznaczone". Bulk akceptacja wszystkich = „zaznacz wszystkie" + „zatwierdź zaznaczone". Te same dwa kliknięcia obsługują oba przypadki. Akcja zbiorcza działa wyłącznie na zaznaczonych itemach, dla których jest dozwolona; pozostałe pomijane bez błędu. Akcja akceptacji powyżej progu (próg konkretny — decyzja w spec technicznej, np. 5 lub 10 itemów) wymaga potwierdzenia z informacją o liczbie („zaakceptować N itemów?"). Priority: must-have
  > Sokrates: Rozważone kontrargumenty — dwa konkurujące tryby walidacji (bulk vs per-item), brak potwierdzenia dla bulk accept, brak akcji „częściowy bulk z wyłączeniami". Rozstrzygnięcie: FR stoi z reorganizacją modelu UX. (1) **Bulk i per-item to TEN SAM ujednolicony mechanizm** — selekcja + akcje zbiorcze. User zaznacza dowolny podzbiór itemów (od 1 do wszystkich przez „zaznacz wszystkie") i wybiera akcję; akcja działa na zaznaczonych, dla których jest dozwolona, pozostałe pomijane bez błędu. Per-item akcept = zaznacz 1 + „zatwierdź zaznaczone". Bulk wszystkiego = „zaznacz wszystkie" + „zatwierdź zaznaczone". Te same dwa kliknięcia obsługują oba przypadki. (2) **Akceptacja powyżej progu** (np. 5 lub 10 itemów) wymaga lekkiego potwierdzenia z informacją o liczbie („zaakceptować 23 itemy?") — konkretny próg i realizacja UX-owa → spec techniczna. (3) **Częściowy bulk z wyłączeniami niepotrzebny** — w ujednoliconym modelu user zaznacza tylko te do zaakceptowania (lub osobno te do odrzucenia + osobno te do akceptacji). Dwa kroki zamiast jednej hipotetycznej akcji „z wyłączeniami". (4) Wariant „akceptuj wszystko, popraw później na listach per typ" odrzucony — przerzucałby koszt weryfikacji z momentu walidacji na późniejsze sesje pracy z listami; cały sens kroku walidacyjnego polega na tym, że ostateczna decyzja zapada przed wejściem itemów do aktywnej części aplikacji.

### Lists per Type

- FR-008: Itemy są widoczne na **jednej jednolitej liście z trzema warstwami filtrowania**. (1) **Filtr główny** (widok nawigacyjny, single-select) przełącza między rozłącznymi zbiorami: **Aktywne** (`accepted`, operacyjnie otwarte) / **Zakończone** (`accepted`, zamknięte operacyjnie) / **Anulowane** (zadania w stanie `anulowane`) / **Elementy do akceptacji** (`pending`) / **Kosz** (`rejected` + `deleted`). (2) **Filtr typu** (rząd akcji w widoku, single-select): Wszystkie / Zadania / Notatki / Pomysły / Decyzje / Inne — eliminuje potrzebę osobnych zakładek per typ. (3) **Filtry dodatkowe** w obrębie aktualnego widoku: sortowanie i filtrowanie po dacie utworzenia, dacie modyfikacji, tytule, sesji importu; wyszukiwanie po tytule i opisie; filtr po statusie operacyjnym tam, gdzie widok zawiera więcej niż jeden status; w obrębie widoku Kosz dodatkowy filtr typu poprzedniego statusu (`rejected` vs `deleted`). Mitygacja nadużywania typu `other` przez klasyfikator realizowana na poziomie promptu (definicja, kiedy `other` jest właściwy + monitoring udziału `other` jako sygnał diagnostyczny) — szczegóły w spec technicznej. Priority: must-have
  > Sokrates: Rozważone kontrargumenty — 5 osobnych list per typ to dużo UI, `other` jako catch-all nadużywany przez klasyfikator, brak sortowania w obrębie listy. Rozstrzygnięcie: FR wymaga PRZEPISANIA — w MVP nie ma 5 osobnych list per typ. Jest **JEDNA jednolita lista itemów z trzema warstwami filtrowania**. (1) Filtr główny: Aktywne / Zakończone / Anulowane / Elementy do akceptacji / Kosz. (2) Filtr typu: Wszystkie / Zadania / Notatki / Pomysły / Decyzje / Inne. (3) Filtry dodatkowe: sortowanie po dacie, tytule, sesji; wyszukiwanie. (4) **Mitygacja nadużywania `other`** — na poziomie promptu klasyfikatora (wyraźna definicja kiedy `other` jest właściwy + monitorowanie udziału `other` w klasyfikacjach jako sygnał diagnostyczny do poprawy promptu); konkretna realizacja → spec techniczna.

- FR-009: Zadania (typ `task`) mają **stan operacyjny** o czterech wzajemnie przechodnich wartościach: `nowe` / `w realizacji` / `zrealizowane` / `anulowane`. User może w każdej chwili zmienić stan operacyjny zadania (w tym cofnąć `zrealizowane` do `w realizacji` lub `nowe`). Stan operacyjny i stan akceptacji to dwa niezależne wymiary — przeniesienie do kosza zmienia tylko stan akceptacji; stan operacyjny zachowany przez cały cykl życia itemu. Brak stanu operacyjnie finalnego dopóki item nie jest w koszu. Akcje zmieniające stan operacyjny dostępne zarówno per item, jak i jako akcje zbiorcze w ujednoliconym modelu z FR-007. Itemy typu nie-`task` nie mają stanu operacyjnego (lub mają jeden stan domyślny — szczegół w spec technicznej). Priority: must-have
  > Sokrates: Rozważone kontrargumenty — niejasne zachowanie „done" wzgl. filtrów Aktywne/Zakończone, brak osobnej akcji „anuluj zadanie", brak undo. Rozstrzygnięcie: FR stoi. (1) „Wykonane" znika z widoku Aktywne i pojawia się w widoku Zakończone (model dwóch wymiarów stanu z mitygacji FR-007/FR-008). (2) „Anuluj zadanie" jako **równoległy stan operacyjny** do „wykonane" — zadanie anulowane trafia do widoku Anulowane (osobny widok główny w filtrze). (3) **Stany operacyjne zadania (`nowe` / `w realizacji` / `zrealizowane` / `anulowane`) są wzajemnie przechodnie** — user może w każdej chwili zmienić stan, w tym cofnąć „wykonane" do „w realizacji" lub „nowe". Nie ma stanu finalnego, dopóki item nie jest w koszu.

- FR-010: User może edytować item w stagingu (widok „Elementy do akceptacji"): pola edytowalne to `title`, `description` oraz `typ` (zadanie / notatka / pomysł / decyzja / inne). Zmiana typu może wpływać na dostępne stany operacyjne — mapowanie stanów przy zmianie typu jest decyzją specyfikacji technicznej. Konkretna realizacja UX edycji → spec techniczna. Priority: must-have
  > Sokrates: Rozważone kontrargumenty — edycja zachęca do over-validation i zabija acceptance rate (sukces secondary), zakres edycji (czy obejmuje zmianę typu), inline a dialog UX. Rozstrzygnięcie: FR stoi z mitygacjami. (1) Edycja w stagingu = poprawka przed akceptacją (klasyfikator rozłożył wsad prawie dobrze, user koryguje); pełna przeróbka = świadoma decyzja usera. Wpływ na acceptance rate akceptowany jako koszt jakości. (2) Edycja obejmuje **title + description + TYP itemu**; zmiana typu może wpływać na dostępne stany operacyjne — mapowanie stanów przy zmianie typu → decyzja specyfikacji technicznej. (3) Konkretna realizacja UX edycji → spec techniczna.

- FR-011: User może edytować zaakceptowane itemy w widokach jednolitej listy (Aktywne / Zakończone / Anulowane) — pola edytowalne tożsame z FR-010: `title`, `description`, `typ`. Itemy w widoku Kosz są read-only (przywracalne przez akcję „przywróć z kosza" — FR-013, nie edytowalne bezpośrednio). Priority: must-have
  > Sokrates: Rozważone kontrargumenty — edycja post-accept jako scope creep, ryzyko łamania audit trail bez change log, edytowalność zadań zakończonych. Rozstrzygnięcie: brak kontrargumentu — wymóg zostaje.

### Trash Lifecycle

- FR-012: Item odrzucony w stagingu otrzymuje status akceptacji `rejected` i znika z widoku walidacyjnego (filtr „Elementy do akceptacji"). User MA dostęp do odrzuconych itemów przez **filtr główny Kosz** (FR-008), gdzie dodatkowy filtr w obrębie widoku rozróżnia poprzedni status (`rejected` vs `deleted`). Status `rejected` zachowany na zawsze (audit trail) — usuwany dopiero akcją „wyczyść kosz" (FR-016). Priority: must-have
  > Sokrates: Rozważone kontrargumenty — user nie widzi odrzuconych w MVP (utrata przy pomyłkowym odrzuceniu), konflikt z filtrem „Kosz". Rozstrzygnięcie: **ZMIANA SCOPE — Kosz realizujemy w MVP jako zwykły dodatkowy filtr na liście (niski koszt realizacji).** Konsekwencje: Phase 3 scope-down hybrid w części dotyczącej kosza zostaje **unieważnione** — widok kosza WCHODZI do MVP must-have. FR-013 (przeniesienie zaakceptowanego do kosza) → promocja na **must-have**. Status `rejected` zostaje audit-relevant, ale user MA dostęp do widoku Kosz.

- FR-013: User może przenieść zaakceptowany item do kosza (status akceptacji: `accepted` → `deleted`); akcja dostępna per item i jako akcja zbiorcza w ujednoliconym modelu z FR-007. Stan operacyjny itemu zachowany przy przeniesieniu (model dwóch niezależnych wymiarów — patrz FR-009). User może **przywrócić item z kosza** akcją „przywróć z kosza" (status `deleted` → `accepted`); item wraca dokładnie do poprzedniego stanu operacyjnego (zadanie zakończone → po przywróceniu znów zakończone). Item raz zaakceptowany nie wraca do statusu `pending` — może być tylko przeniesiony do kosza i z niego przywrócony lub trwale usunięty (FR-016). Priority: must-have
  > Sokrates: Rozważone kontrargumenty — brak undo dla move-to-trash, utrata stanu operacyjnego przy przeniesieniu, brak per-item permanent delete. Rozstrzygnięcie: FR stoi promowany na must-have z mitygacjami. (1) Undo przez ephemeryczny element UI → nice-to-have (świadomie poza MVP); user ma akcję „przywróć z kosza" zamiast tego. (2) **Stan operacyjny i stan akceptacji to dwa niezależne wymiary.** Przeniesienie do kosza zmienia tylko stan akceptacji (`accepted` → `deleted`); stan operacyjny pozostaje nienaruszony. Przywrócenie z kosza: `deleted` → `accepted`, item wraca dokładnie do tego, czym był (zadanie zakończone → po przywróceniu znów zakończone). Z definicji modelu brak utraty stanu operacyjnego. (3) „Usuń permanentnie" dla pojedynczego itemu → poza MVP; globalna akcja „wyczyść kosz" (FR-016) wystarcza.

- FR-016: User może opróżnić kosz globalną akcją „wyczyść kosz" — trwale usuwa wszystkie itemy w widoku Kosz (zarówno `rejected`, jak i `deleted`) jednym kliknięciem z potwierdzeniem informującym o liczbie usuwanych itemów. Brak per-item permanent delete (poza MVP). Brak auto-cleanup (TTL — poza MVP). Priority: must-have
  > Sokrates: Rozważone kontrargumenty — promocja na must-have czy nice-to-have, brak per-item permanent delete, ryzyko accidental destruction. Rozstrzygnięcie: FR stoi promowany na must-have. Kosz bez akcji opróżniania = nieskończenie rosnąca lista, cmentarzysko bez funkcji. Per-item permanent delete → poza MVP. Akcja wymaga potwierdzenia z informacją o liczbie usuwanych itemów — konkretna realizacja UX-owa → spec techniczna. Brak auto-cleanup (TTL) zachowany.

### Classification Provider Audit

- FR-025: Każde wywołanie zewnętrznego dostawcy AI z aplikacji zawiera w body parametr identyfikacyjny user-a w postaci **stabilnego hasha z solą** — nie surowego identyfikatora wewnętrznego. Zachowuje stabilność identyfikatora per user (wymaganą dla abuse detection po stronie dostawcy AI), ale przerywa łańcuch deanonimizacji w razie wycieku — sam hash bez znajomości salta nie pozwala zmapować na rekord w bazie aplikacji. User informowany w polityce prywatności o przekazywaniu identyfikatora do dostawcy AI dla celów abuse detection. Konkretna implementacja hashowania (algorytm, źródło salta) → spec techniczna. Priority: must-have
  > Sokrates: Rozważone kontrargumenty — identyfikator user-a leakuje do dostawcy AI (potencjalne naruszenie guardrail prywatności), trace permanentny po stronie dostawcy AI, surowy identyfikator. Rozstrzygnięcie: FR stoi z doprecyzowaniem. (1) **Guardrail „surowy wsad nie wychodzi do trzecich" dotyczy TREŚCI wsadu** (tekst, transkrypcja audio), nie identyfikatorów technicznych. Identyfikator user-a w body wywołania jest częścią standardu API dostawcy AI, nie wsadem klasyfikowanym. Brak naruszenia. (2) **Trace permanentny po stronie dostawcy AI = świadomy kompromis** — w zamian aplikacja zyskuje możliwość izolowania abuse detection per konkretny user (zamiast całego klucza). User przy zakładaniu konta jest informowany w polityce prywatności o przekazywaniu identyfikatora dla celów abuse detection. (3) **Stabilny hash z solą zamiast surowego identyfikatora** — aplikacja przekazuje do dostawcy AI stabilny hash z solą. Zachowuje stabilność identyfikatora per user (wymaganą dla abuse detection), ale **przerywa łańcuch deanonimizacji** w razie wycieku — sam hash bez znajomości salta nie pozwala zmapować na rekord w bazie aplikacji. Konkretna implementacja → spec techniczna.

- FR-026: Klucze API użytkowników NIE są nigdy logowane — ani w logach aplikacji, ani w audit trail, ani w raportach błędów, ani w telemetrii. Klucz istnieje wyłącznie w zaszyfrowanej formie w spoczynku oraz w pamięci procesu w momencie wywołania zewnętrznego dostawcy AI. Komunikaty błędów dotyczące klucza nie mogą zawierać żadnego jego fragmentu. Priority: must-have
  > Sokrates: Rozważone kontrargumenty — stack traces produkcyjne mogą zawierać klucz w lokalnej zmiennej, brak mechanizmu PII scrubbing w samym FR, niezdefiniowane environment scope. Rozstrzygnięcie: FR stoi z mechanizmami egzekucyjnymi. (1) **Wyciek klucza przez stack trace do zewnętrznych narzędzi monitorujących błędy = realny problem.** Mitygacja: **aktywny mechanizm filtrujący po stronie aplikacji**, który przed wysłaniem jakiegokolwiek raportu błędu skanuje treść i maskuje fragmenty pasujące do formatu klucza. Konkretna implementacja → spec techniczna. (2) **Sam zakaz bez mechanizmu czyszczącego = życzenie.** Aplikacja musi mieć w warstwie logowania i w narzędziach monitorujących błędy **aktywny mechanizm filtrujący, który wymusza zakaz automatycznie**. Decyzja implementacyjna w spec technicznej. (3) **Zakaz dotyczy WSZYSTKICH środowisk** — produkcji, środowiska testowego i lokalnego developmentu. Developer NIE może debugować przez wypisywanie klucza do konsoli. W lokalnym dev używamy kluczy testowych z dedykowanego konta z minimalnym kredytem, lub podstawiamy fałszywe wywołania klasyfikatora (mocki) w testach. **FR-026 = twardy zakaz globalny.** Mechanizmy techniczne → spec.

## Non-Functional Requirements

- **Klasyfikacja synchroniczna z timeoutem.** Użytkownik widzi rezultat klasyfikacji albo komunikat błędu w czasie nie dłuższym niż 60 sekund od momentu kliknięcia submit. Po przekroczeniu timeoutu sesja importu otrzymuje status `niepowodzenie`, wsad jest zachowany w sesji, UI udostępnia akcję „Spróbuj ponownie".
- **Reakcja interfejsu na akcję użytkownika.** Każde kliknięcie w interfejsie (akcja po submit, akcja zbiorcza, zmiana stanu operacyjnego, edycja itemu, przejście między filtrami) zwraca widoczny rezultat w czasie nie dłuższym niż 200 ms. Dla operacji trwających dłużej obecny widoczny wskaźnik aktywności.
- **Prywatność wsadu.** Surowy wsad użytkownika (treść wklejonego tekstu, zawartość plików tekstowych i audio) trafia wyłącznie do zewnętrznego dostawcy AI, którego klucz user skonfigurował. Aplikacja nie wysyła wsadu do żadnego innego serwisu trzeciej strony — w szczególności brak narzędzi observability / tracingu wywołań klasyfikacji w MVP. Wsad to potencjalnie prywatne myśli użytkownika.
- **Wsparcie przeglądarek (MVP).** Aplikacja zachowuje pełną funkcjonalność na najnowszych wersjach trzech głównych przeglądarek desktopowych (Google Chrome, Microsoft Edge, Mozilla Firefox). Wsparcie pozostałych przeglądarek (Safari, Brave, Opera, starsze wersje wymienionych) świadomie poza zakresem MVP — planowane na V2. Decyzja motywowana zakresem projektu zaliczeniowego.
- **Klucze API w stanie spoczynku.** Klucze użytkowników przechowywane wyłącznie w postaci zaszyfrowanej. Klucz szyfrujący aplikacji utrzymywany w konfiguracji aplikacji (zewnętrzny system zarządzania kluczami to dług architektoniczny do V2). Klucze nigdy nie pojawiają się w żadnej formie logów, audit trail, raportów błędów ani telemetrii — egzekwowane przez aktywny mechanizm filtrujący w warstwie logowania i narzędzi monitorujących błędy. Zakaz globalny we wszystkich środowiskach (produkcja, test, lokalny development).
- **Retencja danych.** Sesje importu zachowywane bez TTL jako audit log (możliwość prześledzenia, z jakiego wsadu pochodzi każdy item). Polityka auto-cleanup poza zakresem MVP. Itemy odrzucone (`rejected`) i przeniesione do kosza (`deleted`) usuwane wyłącznie manualnie przez akcję „wyczyść kosz". Zawartość plików (tekstowych i audio) przechowywana w storage serwera dziedziczy politykę retencji sesji importu — brak TTL, brak auto-cleanup w MVP; plik znika wyłącznie razem z sesją, do której należy.

## Business Logic

**Aplikacja przyjmuje surowy, niesformatowany wsad użytkownika i automatycznie dekomponuje go na typowane itemy (zadanie, notatka, pomysł, decyzja, inne), dzięki czemu użytkownik nie musi w momencie zapisu decydować, czym dana myśl jest ani jak ją sformatować.**

Aplikacja konsumuje surowy, niesformatowany wsad: wklejony tekst w polu (do 100 000 znaków w UTF-16 code units), upload pliku tekstowego `.txt`/`.md` (do 300 KB), opcjonalnie upload pliku audio `.mp3`/`.wav` (do 25 MB; nice-to-have). Każdy submit to JEDEN element wsadu (przetwarzanie synchroniczne). Treść wsadu jest dowolnie ustrukturyzowana lub nie — może być pojedynczą myślą, listą kilku tematów, swobodnym strumieniem refleksji albo transkrypcją głosową.

Aplikacja zwraca od 0 do wielu typowanych itemów. Każdy item ma trzy obowiązkowe pola w kontrakcie: `type` (jedna z pięciu wartości: `task` / `note` / `idea` / `decision` / `other`), `title` (krótkie streszczenie lub dyrektywa) oraz `description` (pełna lub uzupełniająca treść). Pełniejszy kontrakt z dodatkowymi polami (`confidence`, `importance`, `tags`) jest forward-compatible — MVP używa tylko podzbioru. Pusta odpowiedź (0 itemów) jest poprawnym wynikiem klasyfikacji — większość wsadów z dyktafonu może nie zawierać treści do klasyfikacji (rozmowy, dygresje, własne myśli).

User dostarcza wsad w pojedynczej akcji submit, w trakcie klasyfikacji interakcja z UI jest zablokowana ze wskaźnikiem aktywności (max 60 s), a po jej zakończeniu otrzymuje wszystkie wygenerowane itemy do walidacji w widoku „Elementy do akceptacji". **Decyzja klasyfikacyjna** (jak typować daną wypowiedź) należy do aplikacji; **decyzja akceptacyjna** (czy zatwierdzić, edytować, czy odrzucić wynik) należy do użytkownika. Ta separacja — praca klasyfikacji zdjęta z użytkownika, decyzja kontroli zachowana — jest sednem produktu.

## Access Control

### Auth model

Multi-user od dnia 1. Każde konto ma izolowane dane (single-user-per-account; user widzi tylko swoje rekordy). Flat user model — brak ról (admin / member / guest); jedyna decyzja access to „user widzi wyłącznie własne dane".

Priorytet wyboru providera auth: **minimalny czas implementacji**. W kolejności preferencji:

1. Passwordless email lub OAuth — jeśli stack daje to natywnie.
2. Własna baza userów z hasłem — fallback dla stacku bez natywnego auth.

Konkretny provider auth → decyzja w kroku stack-selection (zob. `## Forward: tech-stack` w shape-notes).

### Capabilities

Jedna rola: `user`. Capabilities:

- Submit wsadu — wymaga skonfigurowanego klucza zewnętrznego dostawcy AI w profilu (patrz BYOK poniżej).
- Edycja, akceptacja, odrzucenie własnych itemów.
- Zarządzanie własnym kluczem API (zapis, podgląd zamaskowany, usunięcie).
- Ręczne dodawanie itemów (FR-028) — **nie wymaga klucza**.
- Brak operacji administracyjnych (no impersonation, no cross-user access).

### Unauthenticated access

Każda ścieżka aplikacyjna poza stronami publicznymi (landing, signup, login) jest gated. Unauthenticated user trafiający na gated route → redirect do logowania.

### BYOK — klucz zewnętrznego dostawcy AI

Każdy user może zapisać w profilu własny klucz API zewnętrznego dostawcy AI. Polityki:

- Klucz zapisywany **bez walidacji przy zapisie** — niepoprawny lub wygasły klucz objawia się błędem przy pierwszej próbie wywołania klasyfikacji, komunikowanym w UI w stanie „niepowodzenie" z sugestią weryfikacji w ustawieniach.
- Klucz **przechowywany w postaci zaszyfrowanej w stanie spoczynku**; klucz szyfrujący aplikacji utrzymywany w konfiguracji aplikacji (zewnętrzny system zarządzania kluczami to dług architektoniczny do V2).
- Klucz w UI **pokazywany tylko w postaci zamaskowanej zachowującej zdolność identyfikacji** (np. prefiks + ostatnie kilka znaków).
- Klucz **nigdy nie jest logowany** — ani w logach aplikacji, ani w audit trail, ani w raportach błędów, ani w telemetrii. Wymaga aktywnego mechanizmu filtrującego w warstwie logowania i narzędzi monitorujących błędy. Zakaz globalny — wszystkie środowiska (prod, test, local dev).
- Każde wywołanie zewnętrznego dostawcy AI z aplikacji zawiera w body parametr identyfikacyjny user-a w postaci **stabilnego hasha z solą** — nie surowego identyfikatora. Stabilność per user dla abuse detection po stronie dostawcy AI + przerwany łańcuch deanonimizacji w razie wycieku.
- Akcje wymagające klucza (submit wsadu, klasyfikacja tekstu, transkrypcja audio) są **zablokowane** dla usera bez skonfigurowanego klucza; UI pokazuje komunikat „skonfiguruj Klucz API <nazwa dostawcy AI> w ustawieniach" z linkiem do strony dostawcy AI (gdzie user generuje klucz). Pozostałe akcje (przeglądanie list, edycja itemów, zmiana stanów operacyjnych, zarządzanie koszem, dziennik sesji, ręczne dodawanie itemów) działają bez klucza.
- Polityka cascade dla delete klucza: klucz odczytywany raz na początku przetwarzania submitu, trzymany w pamięci procesu do końca operacji. Usunięcie klucza w spoczynku z innej sesji (multi-device) nie wpływa na trwającą klasyfikację. Następny submit po usunięciu trafia na „brak skonfigurowanego klucza" wg FR-024.
- Polityka retry po błędzie: akcja „Spróbuj ponownie" sprawdza stan klucza przed ponowieniem; klucz usunięty między błędem a retry → komunikat „Klucz API <nazwa dostawcy AI> został usunięty z profilu, skonfiguruj nowy klucz przed ponowieniem".

## Non-Goals

- **Multi-file submit i asynchroniczne przetwarzanie.** MVP = jeden element wsadu na sesję (paste tekstu LUB jeden plik tekstowy LUB jeden plik audio), przetwarzanie synchroniczne z timeoutem ~60 s. Kolejki, workery, powiadomienia w UI po zakończeniu sesji w tle — poza MVP (V2 / docelowy produkt).
- **Narzędzia observability i tracingu wywołań klasyfikacji.** Surowy wsad to potencjalnie prywatne myśli — nie wysyłamy go do żadnego trzeciego serwisu poza zewnętrznym dostawcą AI, którego klucz user skonfigurował. Tracing → V2 po przemyśleniu implikacji prywatnościowych.
- **Integracje wychodzące i wchodzące poza zewnętrznym dostawcą AI**: synchronizacja z chmurowymi dyskami, kalendarz, aplikacje todo, mail, automatyzacje typu workflow runner, czat z agentem, mobilne dyktowanie. MVP ma jeden kanał wejścia (web paste/upload) i zero integracji wychodzących. Docelowy produkt (poza zakresem zaliczenia) zaadresuje multi-channel.
- **Funkcje domenowe poza klasyfikacją**: parsowanie `due_text` na konkretne daty, deduplikacja itemów między wsadami, grupowanie itemów w projekty, fiszki SRS, klasyfikacja priorytetów po imporcie, suggestowanie podobnych itemów. MVP zatrzymuje się na klasyfikacji typu + listach z filtrami; dalsza inteligencja → V2.
- **Mitygacja prompt injection.** Świadomie poza MVP. Model BYOK przerzuca ryzyko nadużyć na klucz użytkownika (dostawca AI monitoruje abuse per klucz w połączeniu z hashem identyfikatora user-a — FR-025). Sanityzacja wsadu w MVP ogranicza się do podstawowej normalizacji Unicode i usuwania znaków sterujących (FR-002), bez filtrowania semantycznego instrukcji.
- **Archiwizacja itemów.** Zamrażanie itemów obsłużonych do późniejszego wglądu bez udziału w aktywnych flow — V2. W MVP zaakceptowany item ma tylko dwa stany akceptacji (`accepted` w widoku Aktywne/Zakończone/Anulowane lub `deleted` w widoku Kosz).
- **Per-item permanent delete.** W MVP usuwanie trwałe wyłącznie przez globalną akcję „wyczyść kosz" (FR-016). Granularne usuwanie pojedynczych itemów z pominięciem kosza → V2.
- **Auto-cleanup (TTL) kosza i sesji importu.** Brak polityki automatycznego czyszczenia. Sesje importu zachowywane bez TTL jako audit log; itemy w koszu usuwane wyłącznie manualnie.
- **Choice modelu klasyfikacji w profilu użytkownika.** Konkretny model konfigurowany przez konfigurację aplikacji (FR-023); user nie wybiera modelu w UI.
- **Undo dla move-to-trash w postaci ephemerycznego elementu UI.** Po przeniesieniu itemu do kosza user nie widzi ephemerycznego elementu UI „cofnij" — przywracanie wyłącznie przez widok Kosz + akcję „przywróć z kosza" (FR-013).
- **Progresywne ostrzeganie pola wklejania** (czerwony licznik przy 80% limitu i podobne). MVP ma tylko widoczny licznik + blokadę przy limicie (FR-002).
- **Zewnętrzny system zarządzania kluczem szyfrującym aplikacji.** Klucz szyfrujący w konfiguracji aplikacji dla MVP — dług architektoniczny do V2.
- **Usuwanie sesji importu i powiązanych plików.** W MVP nie istnieje akcja kasowania sesji importu — ani ręczna per-sesja, ani automatyczna (TTL). Struktury danych (sesja importu + storage plików) są zaprojektowane tak, by w przyszłości skasowanie sesji usuwało równocześnie powiązaną zawartość pliku ze storage, ale sama akcja kasowania pozostaje poza MVP.

## Open Questions

1. **Wybór providera auth** (passwordless email, OAuth, własna baza z hasłem) — owner: krok stack-selection. Priorytet: minimalny czas implementacji. Preferencja: passwordless / OAuth, jeśli stack daje to natywnie.
2. **Czy audio jako wsad wejdzie do MVP (FR-004 nice-to-have)?** — decyzja produktowa po PRD, najpóźniej przed planowaniem implementacji. Jeśli `tak` → wymaga integracji usługi transkrypcji audio dostawcy AI + walidacji magic-bytes + zachowania single-file synchronicznego przepływu.
3. **Konkretny model klasyfikacji u zewnętrznego dostawcy AI** — owner: spec techniczna. Wymóg: model z oknem ≥ 128k tokenów (mniejsze modele odpadają). Decyzja zależna m.in. od cenowej kalibracji modelu.
4. **Próg akcji zbiorczej wymagającej potwierdzenia** (5? 10? inne) — owner: spec techniczna / UX. Decyzja zależna od UX testów lub wczesnego feedbacku.
5. **Mapowanie stanów operacyjnych przy zmianie typu itemu** (np. zadanie `zrealizowane` zmienione na notatkę — co ze stanem operacyjnym?) — owner: spec techniczna.
6. **Konkretna implementacja UX edycji itemów** — owner: spec techniczna / UX.
7. **Polityka rotacji klucza szyfrującego aplikacji** — owner: spec techniczna. Dla MVP wystarcza statyczny klucz w konfiguracji; rotacja → V2.
