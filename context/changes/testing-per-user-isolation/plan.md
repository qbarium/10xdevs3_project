# Testy izolacji per-user (IDOR) — Plan implementacji

## Przegląd

Faza 2 wdrożenia test-planu (`context/foundation/test-plan.md §3`): testy **integracyjne** izolacji
per-user dla **ryzyka #2** — użytkownik A nie odczytuje ani nie mutuje zasobów użytkownika B, i przy
odczycie, i przy zmianie. Tryb pracy jak w Fazie 1: **audyt istniejącego pokrycia + domknięcie
realnych luk + przypięcie regresji** — bez duplikowania tego, co już otestowane, i **bez zmian w
kodzie produkcyjnym**. Warstwa: prawdziwy lokalny Supabase, dwóch użytkowników (A/B) przez `signUp` +
anon key (RLS aktywny) — nigdy service-role.

## Analiza stanu obecnego

Badanie (`research.md`) + odczyt plików testów ustalił, że rdzeń ryzyka #2 jest już otestowany, a
izolacja stoi na trzech warstwach: jedna fabryka klienta user-scoped (`src/lib/supabase.ts:5-27`,
brak service-role w całym `src/**`), komplet polityk RLS na czterech tabelach + Storage, RPC
`persist_classification` jako `SECURITY INVOKER`.

**Co JEST pokryte (nie duplikować):**

- Tabela (RLS): `profiles` (`profiles-rls.integration.test.ts:55-66`), `items`+`import_sessions`
  (`classification-rls.integration.test.ts:79-92`), `import_files`, `storage`.
- Serwis (A/B): `createManualItem`, `setAcceptanceStatus`, `editItem`
  (`items-mutation.integration.test.ts:117-129,242-265`), `setOperationalStatus`
  (`items-operational.integration.test.ts:79-84`), RPC `persist_classification`
  (`import-session.integration.test.ts:86-91`).

**Luki do domknięcia (realne, sprawdzone w plikach):**

1. **Cykl kosza** — `moveToTrash` / `restoreFromTrash` / `emptyTrash` (`items-mutation.ts:143-206`):
   mutacje polegające **wyłącznie na RLS** (bez jawnego `.eq("user_id")`), zero testu IDOR. Najsłabsze
   ogniwo obrony w głąb.
2. **Ponowienie sesji** — `getSessionForRetry` (`import-session.ts:199-209`, **jedyna jawna kontrola
   własności w kodzie serwera**) + `reopenSession` (`import-session.ts:226-232`): nieotestowane
   cross-user. To dokładnie „czy też kod serwera" z mapy §2.
3. **Odczyty cross-user** — `getSessionItems` (`items.ts:138-148`), `listItems` (`items.ts:72-78`),
   `getImportSessions` (`import-session.ts:118-131`): jawny `.eq("user_id")` (obrona w głąb)
   nieprzypięty między A i B (`listItems` testowany dziś tylko jednym użytkownikiem).

## Pożądany stan końcowy

Po tej zmianie zestaw testów integracyjnych **jawnie przypina inwariant izolacji per-user na wszystkich
ścieżkach mutacji i odczytu itemów oraz sesji** — dla kosza, ponowienia sesji i odczytów cross-user —
z asercją dwóch rzeczy: (a) B nie zmienia/nie widzi zasobu A, (b) zasób A pozostaje nietknięty i
„cudzy = nieistniejący" (404 / pusta lista / ciche pominięcie, nigdy cudze dane). `test-plan.md §6.2` i
§6.4 przestają mówić „TBD" o wzorcu testu IDOR. Weryfikacja: `npm run test:integration` zielony z
działającym lokalnym Supabase; §6.2/§6.4 wypełnione; przegląd potwierdza, że każdy nowy test idzie
przez **klienta user-scoped** (nie service-role) i przez **funkcję serwisową**, którą woła endpoint.

### Kluczowe odkrycia:

- Mutacje polegają **wyłącznie na RLS**, odczyty dokładają jawny `.eq("user_id")` — asymetria opisana
  w komentarzach kodu (`items-mutation.ts:6-7`, `import-session.ts:64-65`). Test kosza pilnuje
  najsłabszego ogniwa: zaświeci się, gdyby ktoś osłabił RLS.
- `getSessionForRetry` (`import-session.ts:204-209`) to jedyna funkcja z jawnym `.eq("user_id")`
  **przed** mutacją → cudza/nieistniejąca sesja = null → endpoint 404 (`retry.ts:51`).
- Kanoniczny wzorzec dwóch użytkowników istnieje: `signUpClient("a")`/`signUpClient("b")` +
  triada asercji IDOR (`classification-rls.integration.test.ts`, `profiles-rls.integration.test.ts`).
  `config.toml` `enable_confirmations=false` → sesja od razu po `signUp`, bez service-role.
- Sprzęt: `vitest.integration.config.ts` (brak `setupFiles`), skrypt `test:integration`
  (`package.json:17`) NIE stawia Supabase; bez `.env.test.local` → `describe.skip`. Konwencja:
  `client()`/`signUpClient()` inline w każdym pliku (brak wspólnego helpera).

## Czego NIE robimy

- **NIE utwardzamy produktu** — nie dodajemy jawnego `.eq("user_id")` do mutacji (kosz i in.). To
  obrona w głąb, ale **zmiana produktu**, nie test; przypinamy obecne zachowanie, nie zmieniamy go
  (spójnie z Fazą 1 „przypnij granicę, nie utwardzaj"). Ewentualne utwardzenie = osobna zmiana.
- **NIE piszemy testów HTTP-endpoint / e2e** — nie importujemy handlerów `POST`/`GET` z syntetycznym
  `APIContext` ani nie stawiamy dev servera. Ownership żyje w parze serwis + RLS; e2e jest poza
  zakresem test-planu (§4, brak sprzętu). Testujemy funkcję serwisową, którą woła endpoint.
- **NIE używamy service-role ani atrapy bazy** — cały sens testu IDOR to prawdziwe RLS przez klienta
  user-scoped (anti-wzorzec z §2: „atrapa bazy omijająca reguły dostępu").
- **NIE duplikujemy** pokrytego rdzenia (RLS tabeli `profiles`/`items`/`import_sessions`; serwisy
  `editItem`/`setAcceptanceStatus`/`setOperationalStatus`/`createManualItem`; RPC).
- **NIE ekstrahujemy wspólnego helpera** `signUpClient` — zostajemy przy konwencji inline (spójność z
  9 plikami); ekstrakcję odnotowujemy jako opcję w książce kucharskiej.
- **NIE dotykamy** CSRF (zamknięte S-14), inwariantów klucza/egress (Faza 1) ani bramki CI (Faza 5).

## Podejście do implementacji

Najpierw domknięcie luki mutacji o najwyższej wartości (kosz — solely-RLS, Faza 1), potem ownership
sesji + odczyty cross-user (Faza 2), na końcu zamykająca podfaza książki kucharskiej i przestrzeni
negatywnej (Faza 3). Każdy nowy test rozszerza plik dopasowany do modułu serwisu i naśladuje istniejący
wzorzec referencyjny (`items-mutation.integration.test.ts` — `signUpClient` A/B + lokalne
`insertItem`/`rowOf`; triada asercji z `classification-rls`).

## Krytyczne szczegóły implementacji

- **Test IDOR MUSI iść przez klienta user-scoped B** (`signUpClient("b")`, anon key + sesja), a nie
  service-role — inaczej RLS jest omijane i test niczego nie dowodzi. To sedno, nie detal.
- **`npm run test:integration` daje sygnał TYLKO z działającym lokalnym Supabase** + `.env.test.local`
  (`SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`). Bez env testy to `describe.skip` — zielone, ale
  **nieuruchomione**. Implementator musi mieć kontenery Supabase `Up` (Docker) i wypełniony
  `.env.test.local` przed uznaniem kryterium automatycznego za spełnione. (Lokalny stack bywa już
  podniesiony — patrz session-handoff §5.)
- **`emptyTrash` nie przyjmuje `ids`** — kasuje własny kosz globalnie. Kształt testu IDOR: A ma item w
  koszu (`rejected`/`deleted`), B woła `emptyTrash`, asercja że item A w koszu **przetrwał** (B skasował
  co najwyżej swój pusty kosz). Nie da się tego zrobić przez „B kasuje item A po id" — bo takiego
  wejścia nie ma; dowód idzie przez przeżycie wiersza A.
- **Retry wymaga sesji `failed` należącej do A.** Setup: `createSession(A)` → `failSession(A, code)`.
  Potem `getSessionForRetry(B.supabase, B.id, sessionA)` → `null` (jawny `user_id` wyklucza), a
  `getSessionForRetry(A.supabase, A.id, sessionA)` → zwraca sesję (właściciel widzi). `reopenSession`
  wołane przez B nie zmienia statusu sesji A (RLS → 0 wierszy).
- **Asercja „cudzy = nieistniejący" jest osobnym inwariantem** obok „nie da się zmienić": dla odczytu
  sprawdzamy pusty wynik (nie błąd, nie cudze dane), dla mutacji `updatedIds`/`count` puste + ponowny
  odczyt A potwierdza brak zmiany.

## Faza 1: Cykl kosza — IDOR mutacji polegających wyłącznie na RLS

### Przegląd

Przypiąć izolację per-user na trzech mutacjach kosza, które dziś trzyma sam RLS: `moveToTrash`,
`restoreFromTrash`, `emptyTrash`. To najsłabsze ogniwo obrony w głąb (mutacja bez jawnego `user_id`).

### Wymagane zmiany:

#### 1. Testy IDOR cyklu kosza

**Plik**: `tests/integration/items-mutation.integration.test.ts`

**Cel**: Udowodnić, że B nie przenosi do kosza, nie przywraca ani nie opróżnia kosza cudzych itemów A —
a itemy A pozostają w niezmienionym stanie. Domyka lukę „mutacje solely-RLS bez testu IDOR".

**Kontrakt**: Nowe `it(...)` w istniejącym `describe`; import `moveToTrash`, `restoreFromTrash`,
`emptyTrash` z `@/lib/services/items-mutation`. Reużyj `signUpClient` A/B, lokalne `insertItem`/`rowOf`
z pliku. Trzy scenariusze: (a) B `moveToTrash([itemAaccepted])` → `updatedIds`/count puste, item A
nadal `accepted` (nie `deleted`); (b) A ma item w koszu (`moveToTrash` przez A lub insert
`acceptance_status:"deleted"`), B `restoreFromTrash([itemA])` → bez efektu, item A nadal w koszu; (c) A
ma item w koszu, B `emptyTrash()` → item A **przetrwał** (`rowOf(A, itemA)` nie rzuca). Każdy scenariusz
+ asercja stanu wiersza A z perspektywy A. Kształt asercji jak `items-mutation.integration.test.ts:124-129`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- [ ] Testy IDOR kosza przechodzą: `npm run test:integration` (lokalny Supabase `Up`)
- [ ] Cały zestaw integracyjny zielony bez regresji: `npm run test:integration`
- [ ] Lint + typecheck czyste: `npm run lint`

#### Weryfikacja ręczna:

- [ ] Każdy scenariusz idzie przez klienta user-scoped B (`signUpClient("b")`), nie service-role — potwierdzone w przeglądzie kodu testu
- [ ] Asercja obejmuje OBIE strony inwariantu: B nie zmienia (puste `updatedIds`/przeżycie wiersza) ORAZ stan A nietknięty z perspektywy A

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznych, zatrzymaj
się na ręczne potwierdzenie przed Fazą 2.

---

## Faza 2: Ownership sesji importu + odczyty cross-user

### Przegląd

Przypiąć jedyną jawną kontrolę własności w kodzie serwera (`getSessionForRetry`/`reopenSession` →
cudza sesja = 404/bez efektu) oraz wykluczenie cross-user w odczytach (`getSessionItems`, `listItems`,
`getImportSessions` → lista B nie zawiera zasobów A).

### Wymagane zmiany:

#### 1. Testy IDOR ponowienia sesji

**Plik**: `tests/integration/import-session.integration.test.ts`

**Cel**: Udowodnić, że B nie ponawia ani nie „odblokowuje" cudzej sesji `failed` należącej do A, a
odczyt własnościowy zwraca cudzej sesji ten sam wynik co nieistniejącej (null → endpoint 404).

**Kontrakt**: Nowe `it(...)`; import `getSessionForRetry`, `reopenSession` z
`@/lib/services/import-session` (obok istniejących `createSession`/`failSession`). Setup: `createSession(A)`
→ `failSession(A, "provider")`. Asercje: `getSessionForRetry(B.supabase, B.id, sessionA)` → `null`;
`getSessionForRetry(A.supabase, A.id, sessionA)` → zwraca sesję (właściciel widzi); `reopenSession(B.supabase,
sessionA)` nie zmienia statusu sesji A (odczyt A nadal `failed`). Reużyj wzorca `signUpClient` A/B i
odczytu przez `count`/`eq` jak w `import-session.integration.test.ts:44-116`.

#### 2. Testy IDOR odczytu sesji (`getImportSessions`)

**Plik**: `tests/integration/import-session.integration.test.ts`

**Cel**: Przypiąć, że dziennik sesji B nie zawiera sesji A (jawny `.eq("user_id")` + RLS).

**Kontrakt**: Nowe `it(...)`; import `getImportSessions`. A tworzy sesję; asercja, że
`getImportSessions(B.supabase, B.id, ...)` nie zawiera `sessionA` w wyniku (i że
`getImportSessions(A.supabase, A.id, ...)` ją zawiera). Argumenty paginacji/kryteria wg sygnatury
serwisu.

#### 3. Testy IDOR odczytu itemów (`getSessionItems`, `listItems`)

**Plik**: `tests/integration/items-operational.integration.test.ts`

**Cel**: Przypiąć, że B nie odczytuje itemów sesji A przez `getSessionItems` (podwójny filtr
`user_id`+`import_session_id`) ani nie widzi itemów A w `listItems` (dziś testowane tylko jednym
użytkownikiem).

**Kontrakt**: Nowe `it(...)`; import `getSessionItems` z `@/lib/services/items` (obok istniejącego
`listItems`). A tworzy sesję + item w niej. Asercje: `getSessionItems(B.supabase, B.id, sessionA)` →
pusta lista (`items:[]`, `total:0`); `listItems(B.supabase, B.id, defaultCriteria("active"))` nie
zawiera itemu A. Reużyj `insertItem`/`signUpClient` z pliku.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- [ ] Testy IDOR retry/reopen przechodzą: `npm run test:integration`
- [ ] Testy IDOR odczytu sesji i itemów przechodzą: `npm run test:integration`
- [ ] Cały zestaw integracyjny zielony bez regresji: `npm run test:integration`
- [ ] Lint + typecheck czyste: `npm run lint`

#### Weryfikacja ręczna:

- [ ] `getSessionForRetry` cross-user zwraca dokładnie `null` (nie błąd, nie cudzą sesję) — inwariant „cudzy = nieistniejący"
- [ ] Odczyty cross-user zwracają pusty wynik (nie błąd) i wykluczają zasób A — potwierdzone w przeglądzie
- [ ] Wszystkie ścieżki idą przez klienta user-scoped B, nie service-role

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznych, zatrzymaj
się na ręczne potwierdzenie przed Fazą 3.

---

## Faza 3: Książka kucharska §6.2/§6.4 + przestrzeń negatywna + świeżość

### Przegląd

Domknąć fazę podfazą aktualizującą `test-plan.md`: wypełnić wzorzec testu IDOR (§6.2, §6.4), dopisać
notatkę per-faza (§6.6), przestrzeń negatywną (§7) i datę świeżości (§8) — tak by §6 stało się
kanoniczną odpowiedzią „jak dodać test izolacji per-user w tym projekcie".

### Wymagane zmiany:

#### 1. Wypełnienie książki kucharskiej §6.2 i §6.4

**Plik**: `context/foundation/test-plan.md`

**Cel**: Zastąpić placeholdery „TBD — patrz §3 Faza 2" konkretnym wzorcem testu IDOR i wskazać testy
referencyjne.

**Kontrakt**: Edycja markdown. §6.2 („Dodanie testu integracyjnego") — „Test do naśladowania" →
`tests/integration/classification-rls.integration.test.ts` (kanoniczna triada IDOR: właściciel widzi /
B `.select` → `[]` / B `.update` → `[]` + odczyt A bez zmian) + wzmianka o wzorcu `signUpClient` A/B i
świadomej konwencji inline (opcja ekstrakcji helpera). §6.4 („Dodanie testu dla nowego endpointu API")
— „Test do naśladowania" → `tests/integration/items-mutation.integration.test.ts` (IDOR na warstwie
**serwisu, który woła endpoint** — bo e2e/HTTP poza zakresem, §4/§7); przypomnieć sprawdzanie kształtu
błędu `{ok:false,code,error}` i inwariantu „cudzy = nieistniejący".

#### 2. Notatka per-faza §6.6 + przestrzeń negatywna §7 + świeżość §8

**Plik**: `context/foundation/test-plan.md`

**Cel**: Zapisać, czego faza nauczyła, i utrwalić świadome granice zakresu.

**Kontrakt**: §6.6 — 2-3 zdania (mutacje solely-RLS to najsłabsze ogniwo → test kosza je pilnuje;
inwariant „cudzy = nieistniejący"; warstwa testu = serwis, nie HTTP). §7 — dwa wpisy do przestrzeni
negatywnej: (a) **HTTP-endpoint / e2e IDOR** świadomie poza zakresem (ownership żyje w serwisie+RLS,
brak sprzętu e2e — §4; wrócić, jeśli pojawi się bug ujawniany dopiero na złożonej aplikacji);
(b) **utwardzenie mutacji jawnym `.eq("user_id")`** poza zakresem tej fazy (to zmiana produktu, nie
test — kandydat na osobną zmianę). §8 — zaktualizować datę „Strategia ostatnio przeglądana", jeśli
dotyczy.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- [ ] `test-plan.md §6.2` nie zawiera już „TBD — patrz §3 Faza 2" (grep pusty)
- [ ] `test-plan.md §6.4` nie zawiera już „TBD — patrz §3 Faza 2/Faza 3" (grep pusty)
- [ ] Lint/format markdown czyste: `npm run format` (lub równoważne dla `.md`)

#### Weryfikacja ręczna:

- [ ] §6.2/§6.4/§6.6 opisują realny wzorzec (lokalizacja, nazewnictwo, test referencyjny, komenda) zgodny z tym, co faza faktycznie zrobiła
- [ ] §7 zawiera oba wpisy przestrzeni negatywnej z uzasadnieniem (HTTP-e2e; utwardzenie mutacji)
- [ ] Przegląd potwierdza, że §6 czytelne dla kogoś, kto nie brał udziału w tej fazie

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznych, zatrzymaj
się na ręczne potwierdzenie. Po niej zmiana jest gotowa do `/10x-impl-review`.

---

## Strategia testowania

### Testy integracyjne:

- **Kosz IDOR**: B `moveToTrash`/`restoreFromTrash`/`emptyTrash` na itemach A → bez efektu, itemy A
  nietknięte (przeżycie wiersza dla `emptyTrash`).
- **Retry IDOR**: `getSessionForRetry(B, sessionA)` → `null`; `reopenSession(B, sessionA)` → sesja A
  nadal `failed`; właściciel A widzi swoją sesję.
- **Odczyt IDOR**: `getSessionItems(B, sessionA)` → pusto; `listItems(B)` i `getImportSessions(B)`
  wykluczają zasoby A.
- **Przypadki brzegowe**: dwóch użytkowników przez `signUp` (RLS aktywny), nie service-role; inwariant
  „cudzy = nieistniejący" (pusty wynik/404, nigdy cudze dane).

### Testy jednostkowe:

- Brak — ryzyko #2 wymaga prawdziwej bazy z regułami dostępu (§2: „atrapa bazy omijająca reguły
  dostępu" to anty-wzorzec). Cała zmiana jest integracyjna.

### Kroki testowania ręcznego:

1. Podnieś lokalny Supabase (`npx supabase start` lub potwierdź, że kontenery Docker `Up`), wypełnij
   `.env.test.local` (`SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY` z `npx supabase status`).
2. `npm run test:integration` — nowe testy IDOR uruchamiają się (NIE `skip`) i są zielone.
3. Przejrzyj `test-plan.md §6.2/§6.4` — wzorzec czytelny dla kogoś spoza tej fazy.

## Uwagi dotyczące wydajności

Brak implikacji wydajnościowych — zmiana wyłącznie testowa, bez kodu produkcyjnego.

## Uwagi dotyczące migracji

Brak — żadnych zmian schematu, danych ani konfiguracji runtime.

## Referencje

- Powiązane badania: `context/changes/testing-per-user-isolation/research.md`
- Umowa jakościowa: `context/foundation/test-plan.md` (§2 mapa ryzyka #2 + „Wskazówki reagowania",
  §3 Faza 2, §6.2/§6.4 książka kucharska, §7 przestrzeń negatywna)
- Testy referencyjne: `tests/integration/classification-rls.integration.test.ts`,
  `tests/integration/items-mutation.integration.test.ts`, `tests/integration/import-session.integration.test.ts`
- Poprzednik metodologiczny: `context/archive/2026-07-07-testing-security-privacy-invariants/plan.md` (Faza 1)
- Kontekst historyczny: `context/archive/2026-06-16-trash-lifecycle/plan.md` (S-06 kosz),
  `context/archive/2026-06-13-import-session-log-retry/plan.md` (S-08 retry),
  `context/archive/2026-07-02-csrf-hardening/plan.md` (S-14 origin-check)

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po zakończeniu kroku. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Cykl kosza — IDOR mutacji polegających wyłącznie na RLS

#### Automatyczne

- [x] 1.1 Testy IDOR kosza przechodzą: `npm run test:integration` (lokalny Supabase `Up`)
- [x] 1.2 Cały zestaw integracyjny zielony bez regresji: `npm run test:integration`
- [x] 1.3 Lint + typecheck czyste: `npm run lint`

#### Ręczne

- [x] 1.4 Każdy scenariusz idzie przez klienta user-scoped B, nie service-role — potwierdzone w przeglądzie
- [x] 1.5 Asercja obejmuje obie strony inwariantu: B nie zmienia ORAZ stan A nietknięty

### Faza 2: Ownership sesji importu + odczyty cross-user

#### Automatyczne

- [ ] 2.1 Testy IDOR retry/reopen przechodzą: `npm run test:integration`
- [ ] 2.2 Testy IDOR odczytu sesji i itemów przechodzą: `npm run test:integration`
- [ ] 2.3 Cały zestaw integracyjny zielony bez regresji: `npm run test:integration`
- [ ] 2.4 Lint + typecheck czyste: `npm run lint`

#### Ręczne

- [ ] 2.5 `getSessionForRetry` cross-user zwraca dokładnie `null` (inwariant „cudzy = nieistniejący")
- [ ] 2.6 Odczyty cross-user zwracają pusty wynik i wykluczają zasób A — potwierdzone w przeglądzie
- [ ] 2.7 Wszystkie ścieżki idą przez klienta user-scoped B, nie service-role

### Faza 3: Książka kucharska §6.2/§6.4 + przestrzeń negatywna + świeżość

#### Automatyczne

- [ ] 3.1 `test-plan.md §6.2` nie zawiera już „TBD — patrz §3 Faza 2" (grep pusty)
- [ ] 3.2 `test-plan.md §6.4` nie zawiera już „TBD — patrz §3 Faza 2/Faza 3" (grep pusty)
- [ ] 3.3 Lint/format markdown czyste: `npm run format`

#### Ręczne

- [ ] 3.4 §6.2/§6.4/§6.6 opisują realny wzorzec zgodny z tym, co faza zrobiła
- [ ] 3.5 §7 zawiera oba wpisy przestrzeni negatywnej (HTTP-e2e; utwardzenie mutacji)
- [ ] 3.6 Przegląd potwierdza, że §6 czytelne dla kogoś spoza tej fazy
