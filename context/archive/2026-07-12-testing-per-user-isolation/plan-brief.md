# Testy izolacji per-user (IDOR) — Krótki plan

> Pełny plan: `context/changes/testing-per-user-isolation/plan.md`
> Badania: `context/changes/testing-per-user-isolation/research.md`

## Co i dlaczego

Faza 2 wdrożenia test-planu: testy **integracyjne** izolacji per-user dla ryzyka #2 — użytkownik A nie
odczytuje ani nie mutuje zasobów użytkownika B, i przy odczycie, i przy zmianie. Rdzeń jest już
otestowany (RLS tabeli + kluczowe mutacje serwisu), więc cel to **audyt + domknięcie realnych luk +
przypięcie regresji** — nie pisanie od zera, i unikanie anty-wzorca z §2 („test tylko dla właściciela /
atrapa bazy omijająca reguły dostępu").

## Punkt wyjścia

Izolacja stoi na trzech warstwach: jedna fabryka klienta user-scoped (anon key + ciasteczko, **zero
service-role** w `src/**`), komplet polityk RLS na 4 tabelach + Storage, RPC jako `SECURITY INVOKER`.
Istnieje 9 testów integracyjnych; kilka już testuje IDOR dwóch użytkowników (`profiles-rls`,
`classification-rls`, `items-mutation` dla `editItem`/`setAcceptanceStatus`, `items-operational` dla
`setOperationalStatus`). Kluczowa asymetria: **odczyty** mają jawny `.eq("user_id")` (obrona w głąb),
**mutacje** polegają wyłącznie na RLS — to najsłabsze ogniwo.

## Pożądany stan końcowy

Zestaw integracyjny **jawnie przypina inwariant izolacji na wszystkich ścieżkach mutacji i odczytu** —
kosz, ponowienie sesji, odczyty cross-user — asertując dwie rzeczy: B nie zmienia/nie widzi zasobu A,
oraz „cudzy = nieistniejący" (404 / pusta lista / ciche pominięcie, nigdy cudze dane). `test-plan.md`
§6.2 i §6.4 przestają mówić „TBD" o wzorcu testu IDOR.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
| --- | --- | --- | --- |
| Warstwa testu | Integration przez funkcję serwisową (nie HTTP/e2e, nie surowa tabela) | Ownership żyje w parze serwis+RLS; „najtańszy sensowny test" mapy §2; e2e poza zakresem (§4) | Badania → Plan |
| Tryb pracy | Audyt + domknięcie luk + pin (nie od zera) | Rdzeń IDOR już pokryty; unikamy duplikacji (dyscyplina Fazy 1) | Badania |
| Klient testowy | User-scoped B (`signUp` + anon), nigdy service-role | Sedno testu IDOR to prawdziwe RLS; service-role je omija (anty-wzorzec §2) | Badania |
| Utwardzanie mutacji | Nie (odrzucone) | Dodanie jawnego `.eq("user_id")` to zmiana produktu, nie test; osobna zmiana | Plan |
| HTTP-endpoint / e2e | Nie (przestrzeń negatywna §7) | Brak sprzętu e2e (§4); ownership testowalny taniej na warstwie serwisu | Badania → Plan |
| Lokalizacja testów | Rozszerzenie plików per moduł serwisu (kosz→items-mutation, sesja→import-session, odczyt→items-operational) | Konwencja „plik per serwis"; §6.2 wskazuje istniejący `classification-rls` jako kanon | Plan |
| Wspólny helper `signUpClient` | Nie — inline jak w 9 plikach | Spójność z konwencją; ekstrakcja to zmiana o większym zasięgu | Badania → Plan |

## Zakres

**W zakresie:** testy IDOR kosza (`moveToTrash`/`restoreFromTrash`/`emptyTrash`); retry/reopen sesji
(`getSessionForRetry`/`reopenSession`); odczyty cross-user (`getSessionItems`/`listItems`/`getImportSessions`);
wypełnienie `test-plan.md §6.2/§6.4/§6.6/§7/§8`.

**Poza zakresem:** utwardzanie produktu (jawny `user_id` w mutacjach); testy HTTP-endpoint/e2e;
service-role/atrapa bazy; duplikacja pokrytego rdzenia; ekstrakcja wspólnego helpera; CSRF (S-14);
inwarianty klucza/egress (Faza 1); bramka CI (Faza 5).

## Architektura / Podejście

Wyłącznie nowe testy integracyjne rozszerzające istniejące pliki dopasowane do modułu serwisu, każdy
naśladujący wzorzec `signUpClient("a")`/`signUpClient("b")` + triada asercji IDOR (właściciel widzi / B
nie widzi-nie zmienia / stan A nietknięty). Prawdziwy lokalny Supabase, RLS aktywny. Zero kodu
produkcyjnego. Zamykająca podfaza aktualizuje markdown książki kucharskiej i przestrzeni negatywnej w
`test-plan.md`.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Cykl kosza | IDOR na `moveToTrash`/`restoreFromTrash`/`emptyTrash` (mutacje solely-RLS) | Test zielony przypadkiem, jeśli poszedłby przez service-role zamiast klienta B |
| 2. Sesja + odczyty | IDOR na retry/reopen (jawny ownership serwera) + odczyty cross-user | Pominięcie strony „stan A nietknięty" / mylenie pustego wyniku z błędem |
| 3. Książka kucharska | §6.2/§6.4/§6.6 + przestrzeń negatywna §7 + świeżość §8 | Wzorzec §6 nieczytelny dla kogoś spoza fazy |

**Wymagania wstępne:** `research.md` (jest); lokalny Supabase `Up` (Docker) + `.env.test.local`
(`SUPABASE_TEST_URL`/`SUPABASE_TEST_ANON_KEY`) — bez tego testy integracyjne to `describe.skip`.
**Szacowany nakład pracy:** ~1 sesja, 3 fazy (mała-średnia zmiana testowa).

## Otwarte ryzyka i założenia

- **Testy integracyjne dają sygnał tylko z działającym lokalnym Supabase.** Bez `.env.test.local` są
  pomijane (zielone, ale nieuruchomione) i NIE są w CI (Faza 5). Kryterium automatyczne wymaga
  podniesionego stacku — założenie do potwierdzenia przy implementacji.
- **Mutacje polegają wyłącznie na RLS (świadoma decyzja).** Przypinamy to zachowanie testem, nie
  zmieniamy go. Jeśli zespół uzna, że chce obrony w głąb także w kodzie mutacji (jawny `user_id`), to
  osobna zmiana produktu — odnotowana w §7 jako kandydat, nie robiona tutaj.
- **Warstwa HTTP-endpoint zostaje nieotestowana bezpośrednio.** Zakładamy, że endpoint to cienkie
  opakowanie serwisu; jeśli kiedyś pojawi się bug ownership ujawniany dopiero na złożonej aplikacji,
  wróci temat e2e (zapisane w §7).

## Kryteria sukcesu (podsumowanie)

- `npm run test:integration` zielony z lokalnym Supabase; nowe testy IDOR kosza/retry/odczytu
  uruchamiają się (nie `skip`) i przechodzą; brak regresji.
- Każdy nowy test idzie przez klienta user-scoped B (nie service-role) i asertuje obie strony
  inwariantu (B nie zmienia/nie widzi + stan A nietknięty / „cudzy = nieistniejący").
- `test-plan.md §6.2/§6.4` wypełnione — koniec „TBD" dla wzorca testu izolacji per-user.
