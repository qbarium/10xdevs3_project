# Dziennik sesji importu + ponowienie — Krótki plan

> Pełny plan: `context/changes/import-session-log-retry/plan.md`

## Co i dlaczego

S-08: osobny widok „dziennika sesji importu" + ponowienie sesji `failed`. Użytkownik, którego klasyfikacja padła (np. zły klucz), ma móc przejrzeć chronologiczny rejestr sesji i ponowić nieudaną sesję bez wprowadzania wsadu od nowa (US-07, FR-027, FR-024).

## Punkt wyjścia

S-02 zostawił komplet danych: tabele `import_sessions` + `import_files`, RLS per-user, bucket Storage `import-files`, a nawet indeks `import_sessions_user_idx` opisany „pod S-08". Brakuje wyłącznie odczytu/listowania w serwisie oraz ścieżki ponowienia — bo `POST /api/ingest/classify` jest bezstanowy względem sesji (bierze tylko świeży wsad, tworzy nową sesję, nie umie wrócić do istniejącej).

## Pożądany stan końcowy

`/import-sessions` (link w Topbarze) pokazuje listę sesji: skrócony podgląd wejścia + typ, status (badge), liczba itemów lub błąd; sort po dacie + filtr statusu. Sesje `failed` mają „Spróbuj ponownie" — klik odtwarza wsad z sesji (paste z bazy, plik ze Storage), sprawdza klucz, ponawia klasyfikację na tym samym wierszu i pokazuje wynik inline.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) |
| --- | --- | --- |
| Architektura retry | Nowy endpoint `/api/import-sessions/retry` | `classify.ts` zostaje bezstanowy i czysty; retry ma własny guard własności + FR-024 |
| Model sesji przy retry | Reuse wiersza (`failed→processing`) | Brak duplikacji wsadu; jeden wiersz = jeden wsad |
| Zakres wsadu retry | Paste **i** plik | Błąd `invalid_key` dotyka tak samo plików; serwisy dekodowania już istnieją |
| UX retry | Inline status w wierszu | Lekkie i spójne z reuse wiersza (wiersz *jest* sesją) |
| Granica zakresu | Min FR-027 + sort/filtr statusu | Wygodniejszy dziennik — świadome, wąskie wyprzedzenie S-09 |
| Rejestr wejścia | Skrócony podgląd + typ | Zwięzły wiersz; pełna treść i tak w bazie (audit) |
| Rdzeń klasyfikacji | Ekstrakcja `classifyAndRespond` do współdzielonego modułu | Oba endpointy wołają ten sam timeout+persist+fail, bez rozjazdu |

## Zakres

**W zakresie:** widok dziennika (rejestr wejścia, status, liczba/błąd), sort po dacie + filtr statusu, endpoint retry (paste+plik), inline retry UI, re-check klucza FR-024, testy (4 brzegowe + ścieżka poz./neg.).

**Poza zakresem:** per-file rozbicie, podgląd itemów w sesji, usuwanie sesji, pełne filtry/wyszukiwanie (S-09), powiadomienia async, migracja (schemat gotowy).

## Architektura / Podejście

Serwis odczytu + `loadSessionInput` (paste/plik) + ekstrakcja rdzenia klasyfikacji → nowy endpoint retry na tym rdzeniu (reuse wiersza, guardy auth/RLS/status/FR-024) → protected SSR widok (wzorzec `items.astro`) → React island na inline retry. Bez migracji.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Serwis + rdzeń | Odczyt sesji, odtwarzanie wsadu, ekstrakcja `classifyAndRespond`, label | Refactor rdzenia nie może zregresować ingestu (testy S-02 strażnikiem) |
| 2. Endpoint retry | `POST /api/import-sessions/retry` z guardami + testy brzegowe | Poprawny re-check klucza i odtworzenie wsadu pliku |
| 3. Widok dziennika | SSR lista + sort/filtr + nawigacja | Drobne nakładanie sort/filtr z S-09 |
| 4. Inline retry | React island + hook, status w wierszu | Guard podwójnego kliku, odświeżenie po wyniku |

**Wymagania wstępne:** S-02 (done). Branch `feature/import-session-log-retry` od `main`. Lokalny stack Supabase + `BYOK_KEK`.
**Szacowany nakład:** ~3–4 sesje w 4 fazach; brak migracji obniża ryzyko.

## Otwarte ryzyka i założenia

- Sort/filtr statusu nakłada się z S-09 — świadome wąskie wyprzedzenie, ryzyko drobnego dublowania.
- Reuse wiersza nadpisuje audit poprzedniej porażki (`error_message`/`item_count`) — historia prób nie zachowywana.
- Plik w Storage musi istnieć przy retry (bucket bez TTL); brak → błąd `storage`/`encoding`.

## Kryteria sukcesu (podsumowanie)

- Użytkownik widzi dziennik swoich sesji i ponawia sesję `failed` jednym kliknięciem bez wprowadzania wsadu od nowa.
- Ponowienie reużywa ten sam wiersz sesji; sukces → itemy w `/items`; porażka/klucz-usunięty → czytelny komunikat bez wycieku.
- Testy jednostkowe + integracyjne (4 przypadki brzegowe + ścieżka poz./neg.) zielone.
