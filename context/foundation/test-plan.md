# Test Plan — TaskerLight

> Fazowe wdrożenie testów dla tego projektu. Strategia zamrożona na górze
> (§1–§5); wzorce książki kucharskiej na dole (§6) wypełniają się w miarę
> dostarczania faz. Czytaj przed napisaniem jakiegokolwiek nowego testu.
>
> Odświeżanie: uruchom ponownie `/10x-test-plan --refresh`, gdy się zdezaktualizuje (patrz §8).
>
> Last updated: 2026-07-07

## 1. Strategia

Testy w tym projekcie kierują się trzema nienegocjowalnymi zasadami:

1. **Koszt × sygnał.** Wygrywa najtańszy test, który daje prawdziwy sygnał
   dla danego ryzyka. Nie promuj do e2e dlatego, że „e2e wydaje się
   bezpieczniejsze". Nie nakładaj modelu wizyjnego na deterministyczną różnicę,
   która i tak łapie regresję.
2. **Obawy użytkownika to pełnoprawny dowód.** Ryzyka zakotwiczone w
   „zespół martwi się o X, a awaria ujawniłaby się gdzieś w obszarze <…>"
   mają tę samą wagę co linie PRD czy dane hot-spotów.
3. **Ryzyka to scenariusze, nie lokalizacje kodu.** Ten plan dokumentuje
   *co może zawieść* i *dlaczego uważamy, że jest to prawdopodobne* —
   wyprowadzone z dokumentów, wywiadu i *sygnału* z bazy kodu (zmienność,
   struktura, baza testowa). NIE twierdzi, że wie, która linia jest
   właścicielem awarii. Ta wiedza powstaje w `/10x-research` podczas każdej
   fazy wdrożenia. Jeśli plan i badanie nie zgadzają się co do tego, gdzie
   żyje awaria, źródłem prawdy jest badanie.

Zakres hot-spotów użyty do ważenia prawdopodobieństwa: `src/`, `supabase/migrations/`.

## 2. Mapa ryzyka

Najważniejsze scenariusze awarii, przed którymi ten projekt musi się bronić,
uporządkowane wg ryzyka = wpływ × prawdopodobieństwo. Ryzyka to scenariusze
awarii w kategoriach użytkownika/biznesu, nie nazwy testów. Kolumna Źródło
cytuje *dowód, który podniósł to ryzyko* — nigdy konkretnego pliku jako
„miejsca, w którym żyje awaria" (to zadanie badania, patrz §1 zasada #3).

| # | Ryzyko (scenariusz awarii) | Wpływ | Prawd. | Źródło (dowód — nie kotwica) |
|---|---|---|---|---|
| 1 | Klucz API użytkownika wycieka do logów / komunikatu błędu / raportu błędu (także jako zmienna w stack trace) | Wysoki | Średni | FR-026 (twardy guardrail, wszystkie środowiska), NFR „Klucze API w spoczynku"; wywiad Q1; zarchiwizowany F-01 (filtr maskujący) |
| 2 | Użytkownik A odczytuje lub mutuje itemy/sesje użytkownika B (IDOR — brak kontroli własności, nie tylko „zalogowany") | Wysoki | Średni | PRD Access Control (izolacja per-user); wywiad Q1 + Q4; hot-spot `src/lib/services` (53 commity/30d), `src/pages/api/items` |
| 3 | Graniczny wsad (do 100 000 znaków / ~100 itemów) przeciąża klasyfikację — twardy crash lub utrata wsadu zamiast czystego „niepowodzenie" z zachowanym wsadem | Wysoki | Średni | wywiad Q1 + Q4; tech-stack.md (Cloudflare Workers, CPU 10 ms/Free); roadmap S-02 (bramka wydajności); NFR timeout 60 s; FR-020 (safety-net 100) |
| 4 | Surowy wsad (prywatne notatki) trafia poza skonfigurowanego dostawcę AI — egress do wrogiego hosta bazowego albo retencja po stronie dostawcy | Wysoki | Niski | NFR „Prywatność wsadu"; lessons.md (reguła „konfiguracja wrażliwa na bezpieczeństwo — waliduj fail-closed"); wywiad Q1 |
| 5 | Refaktor list/mutacji cicho łamie model dwóch wymiarów stanu (kosz gubi stan operacyjny; `rejected→pending` nie wraca do bramy walidacji; `zrealizowane` nie znika z Aktywne) | Średni | Wysoki | FR-009, FR-012, FR-013; hot-spot `src/components/items` (101 zmian/30d), `src/lib/services` (53/30d) |
| 6 | Naruszenie kontraktu klasyfikatora zapisane albo źle obsłużone (brak pól obowiązkowych / >100 itemów / pusta odpowiedź mylona z błędem) | Średni | Średni | FR-005, FR-020; hot-spot `src/lib/ai` (7 zmian/30d) |

**Rubryka wpływ × prawdopodobieństwo.** Oceniaj obie osie w skali Wysoki /
Średni / Niski, żeby dwóch czytelników zgodziło się na ten sam wiersz.

| Ocena | Wpływ | Prawdopodobieństwo |
|---|---|---|
| Wysoki | użytkownik traci dostęp, dane lub pieniądze; awaria publicznie widoczna | obszar zmienia się co tydzień lub już się tu sparzyliśmy |
| Średni | funkcja degraduje, istnieje obejście, dotyka tylko części użytkowników | dotykany okazjonalnie, bywał źródłem błędów |
| Niski | kosmetyka, łatwo cofnąć, brak wpływu na dane | kod stabilny, rzadko dotykany |

Uwaga o kolejności: brak scenariuszy Wysoki × Wysoki. Ryzyka #1–#3 (Wysoki
wpływ) bronione są najpierw, mimo że siedzą w obszarach o niższej zmienności
niż #5 — kolejność broni najpierw tego, co najdroższe do zepsucia, nie tego,
co najczęściej dotykane. Ryzyko #4 (Wysoki × Niski) zależy od inwariantu
konfiguracji, który już istnieje — test pinuje go przeciw cichej regresji.

**Soczewka nadużyć/bezpieczeństwa.** Produkt ma uwierzytelnianie, BYOK i
przyjmuje wejście użytkownika, więc mapa zawiera scenariusze nadużyć:
autoryzacja/dostęp (#2 IDOR), wyciek sekretu/PII (#1 klucz, #4 wsad),
nadużycie zasobów / degradacja pod obciążeniem (#3). Nie są to osobna
struktura — to zwykłe scenariusze awarii na tych samych osiach.

### Wskazówki reagowania na ryzyko

| Ryzyko | Co udowodniłoby ochronę | Musi kwestionować | Kontekst do ugruntowania przez `/10x-research` | Prawdopodobnie najtańsza warstwa | Anty-wzorzec |
|---|---|---|---|---|---|
| #1 | Żaden log/błąd/raport nie zawiera fragmentu klucza — także na ścieżce błędu | „Filtr maskujący istnieje, więc bezpiecznie" — nowa ścieżka loga może go ominąć; happy-path log ≠ error-path log | Gdzie żyje filtr maskujący, jakie ścieżki logowania i raportowania błędów istnieją, format klucza (wzorzec maskowania) | Unit (log/błąd z kluczem → asercja maskowania) | Test tylko happy-path; oracle wzięty z tego samego wzorca, którego używa filtr (tautologia) |
| #2 | Żądanie A o zasób B → odmowa (403/404), nie dane B — dla ODCZYTU i MUTACJI | „Zalogowany" ≠ „to mój zasób"; RLS włączone ≠ endpoint egzekwuje własność | Kształt guardu własności w endpointach `[id]`/`bulk`/`trash`; czy RLS to jedyna warstwa, czy serwis też filtruje po użytkowniku | Integration (dwóch użytkowników, lokalny Supabase + RLS) | Test tylko właściciela; mock Supabase omijający RLS |
| #3 | Graniczny wsad → poprawny wynik LUB czyste „niepowodzenie" z zachowanym wsadem; nigdy crash/utrata; timeout respektowany | „Działa na małym" ≠ „na granicznym"; „200 = sukces" (może być obcięte) | Gdzie liczony timeout 60 s, jak liczony limit 100 (pre/post), co robi runtime Workers przy przekroczeniu CPU, gdzie wsad zachowywany przy błędzie | Unit na safety-necie/timeout (deterministyczne) + osobna bramka obserwacyjna dla realnego CPU Workers | e2e z realnym dostawcą AI (wolne/kosztowne/niedeterministyczne); mierzenie „szybkości" zamiast „czystej degradacji" |
| #4 | Wsad nie wychodzi poza allowlistę hostów; „no-store" egzekwowane; wroga wartość konfiguracji → odmowa (fail-closed), nie cichy egress | „Konfiguracja/env jest zaufana"; „domyślnie bezpieczne wystarcza" | Gdzie odczytywana konfiguracja egress i „no-store", gdzie allowlista hostów (utrzymywana w kodzie, nie w env) | Unit (wroga wartość hosta bazowego / „store=true" → rzuca/odmawia) | Test tylko wartości domyślnej; pominięcie wrogiego nadpisania (to jest sedno) |
| #5 | Tranzycje zachowują inwarianty: kosz zachowuje stan operacyjny; `deleted→accepted` wraca do poprzedniego stanu; `rejected→pending` wraca do bramy; `zrealizowane` → Zakończone | „Refaktor UI listy nie tknął logiki stanu" — mutacje żyją w dzielonym serwisie; „test jednego widoku pokrywa wszystkie" | Gdzie żyją tranzycje (serwis mutacji), macierz dozwolonych przejść akceptacja × operacyjny, co reużywane per widok | Unit/integration na serwisie mutacji (nie e2e per widok) | Test lustrzany implementacji; snapshot UI zamiast asercji tranzycji stanu |
| #6 | Naruszenie kontraktu → nic nie zapisane + sesja `niepowodzenie` + oferta retry; pusta (0 itemów) → `zakończona bez itemów`, NIE błąd | „Pusta odpowiedź = błąd" (to poprawny wynik); „model zawsze zwraca poprawny JSON" | Gdzie walidowany kontrakt, jak rozróżniane 0-itemów vs błąd, próg 100 (pre/post-truncate) | Unit z fixture'ami odpowiedzi klasyfikatora (0 / poprawne N / brak pól / 101) | Oracle problem — oczekiwana wartość wzięta z tego, co model zwrócił, zamiast z FR-005/FR-020 |

## 3. Phased Rollout

Każdy wiersz to odrębna faza wdrożenia, która otworzy własny folder zmiany
przez `/10x-new`. Status przesuwa się od lewej do prawej wg wartości poniżej;
orkiestrator aktualizuje Status w miarę pojawiania się artefaktów na dysku.
Wartości Status są literałami parsera — nie tłumacz ich.

| # | Nazwa fazy | Cel (jedna linia) | Ryzyka | Typy testów | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Inwarianty bezpieczeństwa/prywatności | Klucz nigdy w logach; wsad nie wychodzi poza allowlistę hostów | #1, #4 | unit | change opened | testing-security-privacy-invariants |
| 2 | Izolacja per-user (IDOR) | A nie sięga po zasób B — odczyt i mutacja | #2 | integration | not started | — |
| 3 | Kontrakt klasyfikatora + stan sesji | Naruszenie kontraktu i degradacja obsłużone czysto; 0-itemów ≠ błąd | #6, #3 (część deterministyczna) | unit | not started | — |
| 4 | Regresja cyklu życia itemu | Model dwóch wymiarów stanu trzyma przy refaktorze | #5 | unit + integration | not started | — |
| 5 | Podłączenie bramek + obserwacja obciążenia | Testy jako wymagana bramka CI; realne zachowanie dużego wsadu na Workers | #3 (część runtime) | gates + obserwacja | not started | — |

**Słownik statusu** (stały — literały parsera):

| Wartość | Znaczenie |
|---|---|
| `not started` | Brak folderu zmiany dla tej fazy wdrożenia. |
| `change opened` | `context/changes/<id>/` istnieje z `change.md`; badanie niewykonane. |
| `researched` | `research.md` istnieje w folderze zmiany. |
| `planned` | `plan.md` istnieje z sekcją `## Progress`. |
| `implementing` | Sekcja postępu ma co najmniej jeden `[x]` i co najmniej jeden `[ ]`. |
| `complete` | Sekcja postępu w pełni `[x]`. |

## 4. Stos

Klasyczna baza testowa tego projektu. Narzędzia AI-natywne (jeśli są) niosą
datę `checked:`. Rekomendacje ugruntowane w lokalnych manifestach/configach
plus MCP/narzędzia faktycznie wystawione w bieżącej sesji.

| Warstwa | Narzędzie | Wersja | Uwagi |
|---|---|---|---|
| unit + integration | Vitest | 4.1.8 | Dwa configi: jednostkowy (`vitest.config.ts`, env node, wyklucza `*.integration.test.ts`) + integracyjny (`vitest.integration.config.ts`, wymaga lokalnego Supabase dla RLS) |
| mockowanie API | brak dedykowanej biblioteki (MSW nieobecny) | — | Mock na granicy HTTP (fetch klasyfikatora) — wzorzec do potwierdzenia w §3 Faza 3 |
| e2e | brak | — | Brak zestawu e2e; poza bieżącym wdrożeniem (rozważ przy `--refresh`, jeśli pojawi się ryzyko wymagające pełnego kształtu wdrożonego) |
| dostępność (a11y) | brak | — | Poza zakresem (UI wyłączone w §7) |
| (opcjonalna) AI-natywna | brak — świadomie pominięta (§7) | n/a | Playwright MCP niedostępny w sesji; klasyfikacja jest BYOK, więc eval mierzyłby cudzy model, nie nasz kod; checked: 2026-07-06 |

**Narzędzia ugruntowania stosu (bieżąca sesja):**
- Docs: brak (Context7 / framework docs MCP niedostępny) — oparto na lokalnych manifestach; checked: 2026-07-06
- Search: `WebSearch` (host-owy) dostępny — nieużyty (stos w pełni ugruntowany lokalnie); checked: 2026-07-06
- Runtime/browser: Playwright MCP niedostępny; istnieje `playwright-skill` (skill hosta) — nieużyty w tym wdrożeniu; checked: 2026-07-06
- Provider/platform: brak MCP; `gh` CLI dostępny przez Bash — istotny dla §3 Faza 5 (bramka CI); checked: 2026-07-06

## 5. Bramki jakości

Pełen zestaw bramek, które muszą przejść, zanim zmiana trafi na produkcję.
„Wymagana po §3 Faza N" oznacza, że bramka jest egzekwowana, gdy ta faza
wdrożenia wyląduje; wcześniej jest `planowana`.

| Bramka | Gdzie | Wymagana? | Łapie |
|---|---|---|---|
| lint + typecheck | lokalnie + CI | wymagana (już podłączona) | dryf składni / typów |
| unit + integration | lokalnie + CI | wymagana po §3 Faza 5 | regresje logiki |
| hook po edycji | lokalnie (pętla agenta) | zalecana (konfiguracja to Moduł 3 Lekcja 3, poza tym wdrożeniem) | regresje w momencie edycji |
| smoke przed-produkcyjny | między merge a prod | opcjonalna | awarie specyficzne dla środowiska (istnieje `/api/health`: `hasKek`/`hasSupabase`) |

Uwaga: dziś CI uruchamia **lint + build**; testy jednostkowe i integracyjne
istnieją (`npm test`, `npm run test:integration`), ale **nie są jeszcze
podłączone jako bramka CI** — podłącza to §3 Faza 5.

## 6. Wzorce książki kucharskiej

Jak dodawać nowe testy w tym projekcie. Każda podsekcja wypełnia się, gdy
odpowiednia faza wdrożenia wyląduje; wcześniej czyta „TBD — patrz §3 Faza N".

### 6.1 Dodanie testu jednostkowego

- **Lokalizacja**: współlokowany obok testowanego modułu w `src/**` (konwencja obecnego zestawu).
- **Nazewnictwo**: `<moduł>.test.ts`.
- **Test referencyjny**: TBD — najbliższy istniejący w `src/lib/services/` do wskazania przez §3 Faza 1/Faza 4.
- **Uruchomienie lokalnie**: `npm test`.

### 6.2 Dodanie testu integracyjnego

- **Lokalizacja**: współlokowany, nazwa `<moduł>.integration.test.ts` (wykluczony z configu jednostkowego).
- **Polityka mockowania**: mockuj wyłącznie na granicy sieci; nigdy nie mockuj wewnętrznych modułów ani RLS (izolacja per-user musi iść przez realny lokalny Supabase).
- **Test referencyjny**: TBD — patrz §3 Faza 2 (izolacja per-user).
- **Uruchomienie lokalnie**: `npm run test:integration` (wymaga lokalnego Supabase).

### 6.3 Dodanie testu e2e

- TBD — brak fazy e2e w bieżącym wdrożeniu; rozważ przy `--refresh`.

### 6.4 Dodanie testu dla nowego endpointu API

- **Typ testu**: integration (preferowany) — asercja żądanie → kształt odpowiedzi ORAZ efekty uboczne (zapis w bazie), z mockiem tylko zewnętrznej granicy HTTP.
- **Wzorzec błędu**: endpointy zwracają `{ ok:false, code, error }` (lessons.md) — asercja kontraktu błędu, nie tylko statusu.
- **Test referencyjny**: TBD — patrz §3 Faza 2/Faza 3.
- **Kiedy zamiast tego e2e**: tylko gdy tryb awarii wymaga pełnego wdrożonego kształtu (auth + cookie + handler).

### 6.5 Dodanie testu dla inwariantu bezpieczeństwa/prywatności

- TBD — patrz §3 Faza 1 (wzorzec: klucz nigdy w logach; egress fail-closed przeciw wrogiej konfiguracji).

### 6.6 Notatki per faza wdrożenia

(Opcjonalne. Po wylądowaniu każdej fazy `/10x-implement` dopisuje tu 2–3 linie
uchwytujące, czego faza nauczyła — np. reużywalny katalog fixture'ów.)

## 7. Czego świadomie NIE testujemy

Wykluczenia uzgodnione podczas wdrożenia (wywiad Fazy 2, Q5). Przyszli
kontrybutorzy powinni je uszanować, dopóki nie zmieni się leżące u ich
podstaw założenie.

- **Komponenty `src/components/ui` (shadcn)** — wygenerowana biblioteka, generator jest testem. Zrewiduj, jeśli dołożymy do nich własną logikę. (Źródło: wywiad Fazy 2, Q5.)
- **Bugi dev-only (np. dup-React SSR)** — dług deweloperski, nie ryzyko produkcyjne; kryterium naprawy w `lessons.md`, nie w zestawie testów. (Źródło: wywiad Fazy 2, Q5 + lessons.md.)
- **Audio jako wsad** — nice-to-have poza MVP; nie testujemy czegoś, czego nie ma. Zrewiduj, jeśli audio wejdzie do zakresu (PRD OQ2). (Źródło: PRD Non-Goals.)
- **Mitygacja prompt injection** — PRD Non-Goal; ryzyko przeniesione na klucz BYOK użytkownika. (Źródło: PRD Non-Goals.)
- **Warstwa AI-natywna (eval jakości klasyfikacji / acceptance-rate)** — model jest BYOK, aplikacja nie kontroluje jego trafności; ryzyko #6 celuje w *obsługę* wyjścia, nie w jego jakość. (Źródło: synteza Fazy 3, koszt × sygnał.)

## 8. Rejestr świeżości

- Strategia (§1–§5) ostatnio przeglądana: 2026-07-06
- Wersje stosu ostatnio zweryfikowane: 2026-07-06
- Referencje narzędzi AI-natywnych ostatnio zweryfikowane: 2026-07-06

Odśwież (`/10x-test-plan --refresh`), gdy:

- pojawi się nowe ryzyko z top-3 z mapy drogowej lub archiwum,
- data `checked:` zalecanego narzędzia jest starsza niż trzy miesiące,
- zmieni się stos technologiczny projektu (nowy framework, nowy runner testów),
- §7 przestrzeń negatywna przestanie odpowiadać temu, w co wierzy zespół.
