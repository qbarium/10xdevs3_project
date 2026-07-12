# Test Plan — TaskerLight

> Plan testów dla tego projektu. Na górze (§1–§5) jest strategia — ustalona i
> niezmienna. Na dole (§6) jest „książka kucharska", która rośnie w miarę
> dopisywania testów. Przeczytaj to, zanim napiszesz nowy test.
>
> Gdy plan się zdezaktualizuje, odśwież go: `/10x-test-plan --refresh` (patrz §8).
>
> Ostatnia aktualizacja: 2026-07-12

## 1. Strategia

Testy w tym projekcie trzymają się trzech zasad, od których nie ma odstępstw:

1. **Najtańszy test, który daje prawdziwy sygnał, wygrywa.** Nie rób ciężkiego
   testu „od kliknięcia do wyniku" (e2e) tylko dlatego, że wydaje się
   bezpieczniejszy. Nie stawiaj modelu AI oglądającego ekran tam, gdzie zwykłe
   porównanie i tak wyłapie błąd.
2. **Obawa zespołu to pełnoprawny powód.** „Martwimy się, że coś się zepsuje w
   obszarze X" waży tyle samo, co zapis w dokumencie wymagań czy dane o tym,
   które pliki zmieniają się najczęściej.
3. **Ryzyko to scenariusz awarii, nie miejsce w kodzie.** Ten plan opisuje, _co_
   może się zepsuć i _dlaczego_ uważamy to za prawdopodobne. Nie wskazuje, która
   linia kodu za to odpowiada — to ustala się osobno, w kroku `/10x-research`,
   dla każdej fazy. Jeśli plan i badanie różnią się co do tego, gdzie leży błąd,
   rację ma badanie.

Przy ocenie „jak prawdopodobna jest awaria" patrzymy na to, jak często zmieniają
się pliki w `src/` i `supabase/migrations/`.

## 2. Mapa ryzyka

Najważniejsze awarie, przed którymi projekt musi się bronić, uszeregowane wg
wagi (waga = jak bardzo boli × jak prawdopodobne). Każdy wiersz to sytuacja
widziana oczami użytkownika lub firmy, nie nazwa testu. Kolumna „Źródło" mówi,
_skąd wiemy, że to realne ryzyko_ — a nie wskazuje pliku, w którym „siedzi błąd"
(to ustala badanie, patrz §1 zasada 3).

| #   | Ryzyko (scenariusz awarii)                                                                                                                                                    | Wpływ  | Prawd. | Źródło (dowód — nie kotwica)                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Klucz API użytkownika wycieka do logów / komunikatu błędu / raportu błędu (także jako zmienna w stack trace)                                                                  | Wysoki | Średni | FR-026 (twardy guardrail, wszystkie środowiska), NFR „Klucze API w spoczynku"; wywiad Q1; zarchiwizowany F-01 (filtr maskujący)                 |
| 2   | Użytkownik A odczytuje lub mutuje itemy/sesje użytkownika B (IDOR — brak kontroli własności, nie tylko „zalogowany")                                                          | Wysoki | Średni | PRD Access Control (izolacja per-user); wywiad Q1 + Q4; hot-spot `src/lib/services` (53 commity/30d), `src/pages/api/items`                     |
| 3   | Graniczny wsad (do 100 000 znaków / ~100 itemów) przeciąża klasyfikację — twardy crash lub utrata wsadu zamiast czystego „niepowodzenie" z zachowanym wsadem                  | Wysoki | Średni | wywiad Q1 + Q4; tech-stack.md (Cloudflare Workers, CPU 10 ms/Free); roadmap S-02 (bramka wydajności); NFR timeout 60 s; FR-020 (safety-net 100) |
| 4   | Surowy wsad (prywatne notatki) trafia poza skonfigurowanego dostawcę AI — egress do wrogiego hosta bazowego albo retencja po stronie dostawcy                                 | Wysoki | Niski  | NFR „Prywatność wsadu"; lessons.md (reguła „konfiguracja wrażliwa na bezpieczeństwo — waliduj fail-closed"); wywiad Q1                          |
| 5   | Refaktor list/mutacji cicho łamie model dwóch wymiarów stanu (kosz gubi stan operacyjny; `rejected→pending` nie wraca do bramy walidacji; `zrealizowane` nie znika z Aktywne) | Średni | Wysoki | FR-009, FR-012, FR-013; hot-spot `src/components/items` (101 zmian/30d), `src/lib/services` (53/30d)                                            |
| 6   | Naruszenie kontraktu klasyfikatora zapisane albo źle obsłużone (brak pól obowiązkowych / >100 itemów / pusta odpowiedź mylona z błędem)                                       | Średni | Średni | FR-005, FR-020; hot-spot `src/lib/ai` (7 zmian/30d)                                                                                             |

**Jak oceniać wagę.** Obie rzeczy — „jak bardzo boli" i „jak prawdopodobne" —
oceniaj w skali Wysoki / Średni / Niski, tak żeby dwie osoby niezależnie trafiły
w ten sam wiersz.

| Ocena  | Wpływ                                                                   | Prawdopodobieństwo                                       |
| ------ | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| Wysoki | użytkownik traci dostęp, dane lub pieniądze; awaria publicznie widoczna | obszar zmienia się co tydzień lub już się tu sparzyliśmy |
| Średni | funkcja degraduje, istnieje obejście, dotyka tylko części użytkowników  | dotykany okazjonalnie, bywał źródłem błędów              |
| Niski  | kosmetyka, łatwo cofnąć, brak wpływu na dane                            | kod stabilny, rzadko dotykany                            |

Uwaga o kolejności: nie ma tu nic w kategorii „bardzo boli i bardzo
prawdopodobne". Ryzyka #1–#3 (te, które bardzo bolą) bierzemy najpierw, choć
siedzą w spokojniejszych częściach kodu niż #5 — bronimy najpierw tego, co
najdroższe do zepsucia, a nie tego, co najczęściej dotykane. Ryzyko #4 (bardzo
boli, mało prawdopodobne) opiera się na zabezpieczeniu, które już istnieje — test
pilnuje tylko, żeby ktoś go po cichu nie zepsuł.

**Kątem oka na nadużycia.** Aplikacja ma logowanie, przyjmuje klucz użytkownika
i jego dane, więc mapa uwzględnia typowe nadużycia: dostęp do cudzych danych
(#2), wyciek klucza lub danych (#1, #4) i przeciążenie pod dużym obciążeniem
(#3). To nie osobna kategoria — to zwykłe awarie na tej samej skali wagi.

### Wskazówki reagowania na ryzyko

| Ryzyko | Co potwierdza, że jest bezpiecznie                                                                                                                                                    | Fałszywe założenie do obalenia                                                                                                          | Co ustalić w kodzie (krok /10x-research)                                                                                                                                           | Najtańszy sensowny test                                                                                          | Czego nie robić                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| #1     | Żaden log, komunikat błędu ani zgłoszenie nie zawiera nawet fragmentu klucza — także wtedy, gdy coś się wywali                                                                        | „Jest filtr maskujący, więc jest bezpiecznie" — nowa ścieżka logu może go ominąć; log z udanego przebiegu to nie to samo co log z błędu | Gdzie jest filtr maskujący, którędy idą logi i zgłoszenia błędów, jak wygląda klucz (żeby wiedzieć, co maskować)                                                                   | Jednostkowy: zaloguj błąd z kluczem i sprawdź, że klucz jest zamaskowany                                         | Testu tylko dla „szczęśliwej ścieżki"; brania wartości testowej z tego samego wzorca, którego używa filtr (test wtedy niczego nie sprawdza) |
| #2     | Gdy użytkownik A prosi o dane użytkownika B → dostaje odmowę (403/404), nie cudze dane — i przy odczycie, i przy zmianie                                                              | „Zalogowany" to nie „to jego dane"; włączone reguły dostępu w bazie (RLS) to nie to samo co endpoint pilnujący właściciela              | Jak endpointy (`[id]`/`bulk`/`trash`) sprawdzają właściciela; czy pilnuje tego tylko baza, czy też kod serwera                                                                     | Integracyjny: dwóch użytkowników, prawdziwa lokalna baza z regułami dostępu                                      | Testu tylko dla właściciela; podstawiania atrapy bazy, która omija reguły dostępu                                                           |
| #3     | Bardzo duży wsad → albo poprawny wynik, albo czyste „nie udało się" z zachowanym wsadem; nigdy crash ani utrata danych; limit czasu jest respektowany                                 | „Działa na małym" to nie „działa na dużym"; „odpowiedź 200 = sukces" (mogła zostać ucięta)                                              | Gdzie liczony jest limit 60 s, jak liczony limit 100 elementów, co robi środowisko (Cloudflare Workers) po przekroczeniu czasu procesora, gdzie wsad jest zachowywany przy błędzie | Jednostkowy na zabezpieczeniu i limicie czasu (przewidywalny) + osobna obserwacja realnego zachowania na Workers | Testu z prawdziwym dostawcą AI (wolny, drogi, nieprzewidywalny); mierzenia „szybkości" zamiast „czy degraduje czysto"                       |
| #4     | Wsad nie wychodzi poza dozwoloną listę adresów; ustawienie „nie zapamiętuj" jest wymuszone; zła wartość konfiguracji → odmowa (blokada), nie cichy wyciek                             | „Konfiguracja i zmienne środowiskowe są zaufane"; „domyślnie bezpieczne wystarczy"                                                      | Gdzie czytane są ustawienia wysyłki i „nie zapamiętuj", gdzie jest lista dozwolonych adresów (trzymana w kodzie, nie w zmiennych środowiskowych)                                   | Jednostkowy: podaj zły adres albo „zapamiętuj = tak" i sprawdź, że aplikacja odmawia                             | Testu tylko dla wartości domyślnej; pominięcia złej, podstawionej wartości (a to jest sedno)                                                |
| #5     | Zmiany stanu trzymają zasady: kosz pamięta stan operacyjny; „przywrócone" wraca do poprzedniego stanu; „odrzucone → do sprawdzenia" wraca do bramki; „zrealizowane" znika z Aktywnych | „Przebudowa listy nie tknęła logiki stanu" — a zmiany stanu żyją we wspólnym miejscu; „test jednego widoku pokrywa wszystkie"           | Gdzie żyją zmiany stanu (wspólny serwis), jakie przejścia są dozwolone, co jest współdzielone między widokami                                                                      | Jednostkowy/integracyjny na wspólnym serwisie zmian (nie osobny test „od kliknięcia" dla każdego widoku)         | Testu, który tylko powtarza implementację; robienia zrzutu ekranu zamiast sprawdzenia realnej zmiany stanu                                  |
| #6     | Zła odpowiedź od AI → nic nie zapisane + sesja „nie udało się" + możliwość ponowienia; pusta odpowiedź (0 elementów) → „zakończona bez elementów", a NIE błąd                         | „Pusta odpowiedź = błąd" (a to poprawny wynik); „model zawsze zwróci poprawny JSON"                                                     | Gdzie sprawdzany jest kształt odpowiedzi, jak odróżnia się „0 elementów" od błędu, gdzie działa limit 100                                                                          | Jednostkowy z gotowymi przykładami odpowiedzi (0 / poprawne N / bez wymaganych pól / 101)                        | Brania oczekiwanego wyniku z tego, co model zwrócił, zamiast z wymagań (FR-005/FR-020)                                                      |

## 3. Phased Rollout

Każdy wiersz to osobna faza, która dostaje własny folder zmiany (przez
`/10x-new`). Status przesuwa się od lewej do prawej wraz z postępem prac. Uwaga:
wartości w kolumnie Status to słowa kluczowe odczytywane przez program — nie
tłumacz ich ani nie zmieniaj.

| #   | Nazwa fazy                                 | Cel (jedna linia)                                                        | Ryzyka                          | Typy testów        | Status      | Change folder                       |
| --- | ------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------- | ------------------ | ----------- | ----------------------------------- |
| 1   | Inwarianty bezpieczeństwa/prywatności      | Klucz nigdy w logach; wsad nie wychodzi poza allowlistę hostów           | #1, #4                          | unit               | complete    | testing-security-privacy-invariants |
| 2   | Izolacja per-user (IDOR)                   | A nie sięga po zasób B — odczyt i mutacja                                | #2                              | integration        | planned     | testing-per-user-isolation          |
| 3   | Kontrakt klasyfikatora + stan sesji        | Naruszenie kontraktu i degradacja obsłużone czysto; 0-itemów ≠ błąd      | #6, #3 (część deterministyczna) | unit               | not started | —                                   |
| 4   | Regresja cyklu życia itemu                 | Model dwóch wymiarów stanu trzyma przy refaktorze                        | #5                              | unit + integration | not started | —                                   |
| 5   | Podłączenie bramek + obserwacja obciążenia | Testy jako wymagana bramka CI; realne zachowanie dużego wsadu na Workers | #3 (część runtime)              | gates + obserwacja | not started | —                                   |

**Co znaczą statusy** (słowa kluczowe programu — nie zmieniaj):

| Wartość         | Znaczenie                                                            |
| --------------- | -------------------------------------------------------------------- |
| `not started`   | Brak folderu zmiany dla tej fazy wdrożenia.                          |
| `change opened` | `context/changes/<id>/` istnieje z `change.md`; badanie niewykonane. |
| `researched`    | `research.md` istnieje w folderze zmiany.                            |
| `planned`       | `plan.md` istnieje z sekcją `## Progress`.                           |
| `implementing`  | Sekcja postępu ma co najmniej jeden `[x]` i co najmniej jeden `[ ]`. |
| `complete`      | Sekcja postępu w pełni `[x]`.                                        |

## 4. Stos

Czym testujemy w tym projekcie. Narzędzia oparte na AI (jeśli są) mają datę
sprawdzenia (`checked:`). Wszystko poniżej wynika z plików konfiguracyjnych
projektu i z narzędzi realnie dostępnych w tej sesji.

| Warstwa                 | Narzędzie                                   | Wersja | Uwagi                                                                                                                                                                        |
| ----------------------- | ------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit + integration      | Vitest                                      | 4.1.8  | Dwa configi: jednostkowy (`vitest.config.ts`, env node, wyklucza `*.integration.test.ts`) + integracyjny (`vitest.integration.config.ts`, wymaga lokalnego Supabase dla RLS) |
| mockowanie API          | brak dedykowanej biblioteki (MSW nieobecny) | —      | Mock na granicy HTTP (fetch klasyfikatora) — wzorzec do potwierdzenia w §3 Faza 3                                                                                            |
| e2e                     | brak                                        | —      | Brak zestawu e2e; poza bieżącym wdrożeniem (rozważ przy `--refresh`, jeśli pojawi się ryzyko wymagające pełnego kształtu wdrożonego)                                         |
| dostępność (a11y)       | brak                                        | —      | Poza zakresem (UI wyłączone w §7)                                                                                                                                            |
| (opcjonalna) AI-natywna | brak — świadomie pominięta (§7)             | n/a    | Playwright MCP niedostępny w sesji; klasyfikacja jest BYOK, więc eval mierzyłby cudzy model, nie nasz kod; checked: 2026-07-06                                               |

**Skąd te informacje (ta sesja):**

- Docs: brak (Context7 / framework docs MCP niedostępny) — oparto na lokalnych manifestach; checked: 2026-07-06
- Search: `WebSearch` (host-owy) dostępny — nieużyty (stos w pełni ugruntowany lokalnie); checked: 2026-07-06
- Runtime/browser: Playwright MCP niedostępny; istnieje `playwright-skill` (skill hosta) — nieużyty w tym wdrożeniu; checked: 2026-07-06
- Provider/platform: brak MCP; `gh` CLI dostępny przez Bash — istotny dla §3 Faza 5 (bramka CI); checked: 2026-07-06

## 5. Bramki jakości

Sprawdzenia, które muszą przejść, zanim zmiana trafi na produkcję. „Wymagana po
§3 Faza N" znaczy: to sprawdzenie zaczyna obowiązywać, gdy dana faza zostanie
zrobiona — wcześniej jest dopiero planowane.

| Bramka                  | Gdzie                   | Wymagana?                                                        | Łapie                                                                              |
| ----------------------- | ----------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| lint + typecheck        | lokalnie + CI           | wymagana (już podłączona)                                        | dryf składni / typów                                                               |
| unit + integration      | lokalnie + CI           | wymagana po §3 Faza 5                                            | regresje logiki                                                                    |
| hook po edycji          | lokalnie (pętla agenta) | zalecana (konfiguracja to Moduł 3 Lekcja 3, poza tym wdrożeniem) | regresje w momencie edycji                                                         |
| smoke przed-produkcyjny | między merge a prod     | opcjonalna                                                       | awarie specyficzne dla środowiska (istnieje `/api/health`: `hasKek`/`hasSupabase`) |

Uwaga: dziś CI (automat sprawdzający kod po wysłaniu) uruchamia tylko sprawdzenie
składni i budowanie. Testy jednostkowe i integracyjne już istnieją (`npm test`,
`npm run test:integration`), ale nie są jeszcze wpięte do CI jako wymóg — zrobi
to Faza 5.

## 6. Wzorce książki kucharskiej

Jak dodawać nowe testy w tym projekcie. Każdy podpunkt uzupełnia się, gdy
odpowiednia faza zostanie zrobiona; wcześniej stoi w nim „TBD — patrz §3 Faza N".

### 6.1 Dodanie testu jednostkowego

- **Lokalizacja**: obok testowanego pliku w `src/**` (tak wygląda cały obecny zestaw).
- **Nazewnictwo**: `<moduł>.test.ts`.
- **Test do naśladowania**: `src/lib/services/mask.test.ts` (prosty test zwykłej funkcji). Gdy testujesz coś, co sprawdza ustawienia już przy starcie aplikacji, zobacz `src/lib/config/ai.test.ts`. (Faza 4 może dodać kolejny przykład.)
- **Jak uruchomić**: `npm test`.

### 6.2 Dodanie testu integracyjnego

- **Lokalizacja**: obok testowanego pliku, nazwa `<moduł>.integration.test.ts` (config testów jednostkowych je pomija).
- **Co wolno udawać**: tylko połączenia sieciowe na zewnątrz. Nigdy nie udawaj wewnętrznych części aplikacji ani reguł dostępu do bazy (RLS) — sprawdzenie „czy użytkownik widzi tylko swoje dane" musi iść przez prawdziwą, lokalną bazę Supabase.
- **Test do naśladowania**: `tests/integration/classification-rls.integration.test.ts` — kanoniczna triada izolacji per-user: (1) właściciel widzi swój zasób, (2) użytkownik B `.select` cudzego wiersza → `[]`, (3) B `.update` cudzego wiersza → `[]`, a ponowny odczyt właściciela potwierdza brak zmiany. Dwóch użytkowników zakłada się wzorcem `signUpClient("a")`/`signUpClient("b")` (anon key + `signUp`, RLS aktywny), powtórzonym inline w każdym pliku — świadoma konwencja; wspólny helper jest możliwy, ale to zmiana o większym zasięgu. Ten sam inwariant na warstwie funkcji serwisowej (nie surowej tabeli) pokazuje `tests/integration/items-mutation.integration.test.ts`.
- **Jak uruchomić**: `npm run test:integration` (wymaga lokalnego Supabase).

### 6.3 Dodanie testu e2e

- TBD — w tym wdrożeniu nie ma fazy e2e; rozważ przy `--refresh`.

### 6.4 Dodanie testu dla nowego endpointu API

- **Rodzaj testu**: najlepiej integracyjny — sprawdź, co endpoint zwraca ORAZ co realnie zapisał w bazie; udawaj tylko połączenia na zewnątrz.
- **Format błędu**: endpointy zwracają błąd w stałym kształcie `{ ok:false, code, error }` (patrz lessons.md) — sprawdzaj ten kształt, nie tylko kod odpowiedzi HTTP.
- **Test do naśladowania**: `tests/integration/items-mutation.integration.test.ts` — izolacja per-user (IDOR) sprawdzana na warstwie **funkcji serwisowej, którą woła endpoint** (nie przez pełne żądanie HTTP — e2e jest poza zakresem, §4/§7). Asertuje obie strony inwariantu: B nie zmienia zasobu A (puste `updatedIds` / przeżycie wiersza) ORAZ stan A pozostaje nietknięty przy odczycie z perspektywy A. Trzymaj się zasady „cudzy = nieistniejący" (pusty wynik / 404 / ciche pominięcie, nigdy cudze dane), a przy błędach sprawdzaj kształt `{ ok:false, code, error }`, nie sam kod HTTP.
- **Kiedy zamiast tego zrobić test e2e**: tylko gdy błąd ujawnia się dopiero na w pełni złożonej aplikacji (logowanie + ciasteczko + obsługa żądania).

### 6.5 Dodanie testu bezpieczeństwa lub prywatności

Takie testy pilnują dwóch rzeczy: żeby klucz użytkownika nie wyciekł do logów i żeby jego dane nie poszły tam, gdzie nie powinny.

**Gdzie położyć plik i jak go nazwać.** Test leży w tym samym folderze co plik, który sprawdza, i nazywa się tak samo, tyle że z końcówką `.test.ts`. Gdy test dotyczy sytuacji „brakuje jakiegoś ustawienia" (np. klucza szyfrującego), robimy osobny plik z tą sytuacją w nazwie, np. `byok-crypto.no-kek.test.ts`.

**Cztery gotowe wzorce — wybierz ten pasujący do tego, co sprawdzasz:**

1. **Samo maskowanie klucza** (funkcja, która zamienia klucz na `[REDACTED]`). Wywołaj ją wprost i sprawdź wynik. Przykład: `src/lib/services/mask.test.ts`.
2. **Aplikacja odmawia startu przy złym ustawieniu** (np. gdyby klucz miał polecieć na obcy adres). Test podmienia ustawienia i sprawdza, że wczytanie się wywala. Przykład: `src/lib/config/ai.test.ts`.
3. **Nic nie wycieka w żądaniu do dostawcy AI** — klucz jest tylko w nagłówku, a dane nie są zapamiętywane po stronie dostawcy. Podstawiasz atrapę wysyłki i oglądasz, co naprawdę poszło. Przykład: `src/lib/ai/classifier.test.ts`.
4. **Nic tajnego nie trafia do logów.** Podglądasz, co poszło na konsolę, i sprawdzasz, że klucz jest zamaskowany. Przykład: `src/lib/services/logger.test.ts`, `src/lib/services/byok-endpoint.test.ts`.

**Jedna pułapka, o którą łatwo się potknąć.** Nie buduj testu z takiej wartości, którą filtr i tak rozpoznaje — bo wtedy test przejdzie, mimo że niczego nie sprawdza. Gdy chcesz pokazać, że filtr czegoś **nie** łapie, użyj klucza w kształcie, którego filtr nie zna (krótszego niż jego próg). Gdy sprawdzasz, że coś **nie** trafiło do logu, użyj takiego znacznika, którego maskowanie by nie ruszyło — inaczej maskowanie „posprząta" dowód i problem Ci umknie.

**Jak uruchomić:** `npm test`.

### 6.6 Notatki per faza wdrożenia

(Opcjonalne. Po każdej zrobionej fazie `/10x-implement` dopisuje tu 2–3 zdania o
tym, czego faza nauczyła — np. gotowy zestaw danych testowych do ponownego użycia.)

- **Faza 1 — bezpieczeństwo i prywatność (lipiec 2026):** Maskowanie klucza to druga linia obrony, nie pierwsza — rozpoznaje klucze OpenAI (te z `sk-` i długie), ale nie każdy możliwy klucz. Pierwsza linia to prosta zasada: klucz nigdy nie jest przekazywany do logów. Dopisaliśmy test, który pilnuje, że surowy błąd sieci od dostawcy nie trafia do logów — zaświeci się na czerwono, gdyby ktoś zaczął go tam wypisywać. Wysyłkę danych do dostawcy sprawdzały już wcześniejsze testy; dołożyliśmy tylko jeden, pilnujący, że w żądaniu jest ustawienie „nie zapamiętuj".
- **Faza 2 — izolacja per-user / IDOR (lipiec 2026):** Najsłabsze ogniwo to mutacje polegające **wyłącznie na regułach dostępu bazy (RLS)** — cykl kosza (`moveToTrash`/`restoreFromTrash`/`emptyTrash`) nie dokłada jawnego sprawdzenia właściciela w kodzie. Dołożone testy przypinają, że drugi użytkownik ich nie ruszy, a wiersz właściciela przeżyje; zaświecą się na czerwono, gdyby ktoś osłabił RLS. Każdy test idzie przez klienta drugiego użytkownika (`signUpClient("b")` — anon key + sesja), NIGDY przez service-role, bo inaczej reguły dostępu byłyby omijane i test niczego by nie dowodził. Warstwa testu to funkcja serwisowa, którą woła endpoint (nie żądanie HTTP), a asercja zawsze obejmuje obie strony: „B nie sięgnął" ORAZ „zasób A nietknięty" (inwariant „cudzy = nieistniejący": pusty wynik / `null`, nigdy cudze dane). Przy okazji naprawiliśmy trzy zastane, przeterminowane asercje (`setAcceptanceStatus` zwraca pełne wiersze `Item[]` od S-10, nie `{ updatedIds }`) — gniły po cichu, bo testy integracyjne domyślnie się pomijają (brak lokalnego Supabase / nie w CI do Fazy 5). To dokładnie ta klasa problemu, przed którą broni ten plan.

## 7. Czego świadomie NIE testujemy

Rzeczy, których świadomie nie testujemy — ustalone podczas rozmowy planistycznej.
Trzymaj się tego, dopóki nie zmieni się powód, dla którego coś tu trafiło.

- **Gotowe komponenty `src/components/ui` (shadcn)** — to gotowa biblioteka, jej twórcy ją testują. Wróć do tego, jeśli dołożymy do nich własną logikę. (Źródło: rozmowa planistyczna, Q5.)
- **Błędy widoczne tylko w trybie deweloperskim (np. podwójny React)** — to dług deweloperski, nie ryzyko na produkcji; jak je naprawiać, opisuje `lessons.md`, nie zestaw testów. (Źródło: rozmowa planistyczna, Q5 + lessons.md.)
- **Audio jako wejście** — miłe, ale poza zakresem MVP; nie testujemy czegoś, czego nie ma. Wróć do tego, jeśli audio wejdzie do zakresu (PRD OQ2). (Źródło: PRD Non-Goals.)
- **Obrona przed „prompt injection"** — świadomie poza zakresem produktu; to ryzyko po stronie klucza użytkownika (BYOK). (Źródło: PRD Non-Goals.)
- **Ocena jakości samej AI** (czy dobrze klasyfikuje) — model podłącza użytkownik, nie kontrolujemy jego trafności; ryzyko #6 dotyczy tego, jak _obsługujemy_ jego odpowiedź, a nie jak dobra ona jest. (Źródło: synteza Fazy 3, koszt × sygnał.)
- **Testy „od kliknięcia do wyniku" (e2e) oraz warstwy HTTP dla izolacji per-user** — świadomie poza zakresem. Kontrola własności żyje w parze funkcja serwisowa + reguły dostępu bazy (RLS), więc test na warstwie serwisu daje pełny sygnał taniej; zestawu e2e nie ma (§4), a symulacja żądania HTTP (middleware, ciasteczka sesji dwóch użytkowników) byłaby krucha. Wróć do tego, jeśli pojawi się błąd własności ujawniany dopiero na w pełni złożonej aplikacji. (Źródło: badania Fazy 2, Open Question 1; §4.)
- **Utwardzenie mutacji jawnym sprawdzeniem właściciela** (redundantny filtr `user_id` w kodzie mutacji obok RLS) — poza zakresem tej fazy. Mutacje (kosz i inne) polegają dziś wyłącznie na RLS; dołożenie filtra to obrona w głąb, ale **zmiana produktu**, nie test. Fazę 2 pilnuje istniejące zachowanie testem, a utwardzenie zostaje kandydatem na osobną zmianę. (Źródło: badania Fazy 2, Open Question 2; spójne z Fazą 1 „przypnij granicę, nie utwardzaj".)

## 8. Rejestr świeżości

- Strategia (§1–§5) ostatnio przeglądana: 2026-07-06
- Wersje stosu ostatnio zweryfikowane: 2026-07-06
- Referencje narzędzi AI-natywnych ostatnio zweryfikowane: 2026-07-06

Odśwież plan (`/10x-test-plan --refresh`), gdy:

- pojawi się nowe ważne ryzyko z mapy drogowej lub z archiwum,
- narzędzie z §4 nie było sprawdzane od ponad trzech miesięcy,
- zmieni się technologia projektu (nowy framework, nowy program do testów),
- lista z §7 („czego nie testujemy") przestanie pasować do tego, w co wierzy zespół.
