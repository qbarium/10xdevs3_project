# Warstwa E2E — pełna ścieżka user-facing — Krótki plan

> Pełny plan: `context/changes/testing-e2e-user-flows/plan.md`
> Badania: `context/changes/testing-e2e-user-flows/research.md`

## Co i dlaczego

Wprowadzamy warstwę testów E2E (Playwright) na dwa ryzyka „na poziomie przeglądarki", których nie łapią testy jednostkowe/integracyjne: **item przetrwa odświeżenie strony** (R-E1) i **pełna ścieżka sukcesu z PRD** (R-E2: login → wklej → klasyfikacja → akceptacja → „Zrobione"). To domyka lekcję M3L4 i uzupełnia plan testów o warstwę, którą wcześniej świadomie odłożono.

## Punkt wyjścia

Projekt ma 53 testy jednostkowe + 10 integracyjnych (Vitest, CI odpala oba), ale **zero E2E** — brak `playwright.config`. Autor zostawił jednak celowy szew: gałąź `kind:"mock"` w `classifier.ts` (dziś rzuca błąd), włączana zmienną `CLASSIFIER_MODEL=mock`. Sesja logowania jest już zapisana i zweryfikowana (`storageState`).

## Pożądany stan końcowy

`npm run e2e` uruchamia Playwrighta na dev serwerze z mockowaną AI; trzy testy (wzorzec + R-E1 + R-E2) przechodzą deterministycznie i wielokrotnie. Każdy test ryzyka przeszedł przegląd pięciu antywzorców i weryfikację przez celowe psucie. Plan testów odzwierciedla nową warstwę.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Mock AI | Szew `kind:"mock"` w kodzie + `CLASSIFIER_MODEL=mock` | Klasyfikacja server-side; `page.route` jej nie łapie, a allowlista hostów blokuje mock po `baseUrl` | Badania |
| Ciało atrapy | Deterministyczne, tytuł z wsadu (linia → item) | Test kontroluje tytuł unikalnym wsadem → izolacja + kotwica asercji | Plan |
| Auth | Reużycie `storageState` | Zapisany i zweryfikowany; middleware autoryzuje z ciasteczek | Badania |
| Klucz BYOK | Polegać na koncie testowym | Konto ma klucz; mock i tak go nie używa | Badania |
| Izolacja danych | Unikalny wsad `E2E-<ts>-<rnd>` + best-effort sprzątanie | Unikalność zapobiega kolizjom; sprzątanie to higiena | Plan |
| E2E w CI | Poza tą zmianą (follow-up) | `storageState` = token konta (gitignored); CI potrzebuje osobnego konta + logowania | Plan |
| Kotwica asercji | `getByRole('heading',{level:3,name})` | Tytuł itemu to `<h3>`, niezależny od stanu, w SSR HTML | Badania |

## Zakres

**W zakresie:** runner Playwright (devDependency) + config, ciało atrapy mock + test jednostkowy, wzorzec `seed.spec.ts`, testy R-E1 i R-E2, przegląd antywzorców + weryfikacja, aktualizacja planu testów (§3/§4/§6.3/§7) + poprawka komentarza w `vitest.integration.config.ts`.

**Poza zakresem:** E2E w CI, izolacja per-user w E2E (pokryta serwis+RLS), kontrakt klasyfikatora (jednostkowe), regresja pikseli (deterministyczne), tryb vision/MCP.

## Architektura / Podejście

Mock przez szew w kodzie, włączany `CLASSIFIER_MODEL=mock` podawaną wyłącznie serwerowi testowemu przez `webServer` Playwrighta (normalny dev bez zmian). Auth przez `storageState`. Testy asertują persystencję przez `page.reload()` + obecność `<h3>` z tytułem (SSR z bazy, nie stan klienta). Ścieżka: `/ingest` → `/items` (pending) → `/items/active` → `/items/done`.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Fundament | Playwright + config + atrapa mock + `seed.spec.ts` (smoke) | Wstrzyknięcie `CLASSIFIER_MODEL=mock` do dev (process.env vs .dev.vars) |
| 2. R-E1 | Test przetrwania po `reload()` | Naiwna asercja zamiast realnej persystencji |
| 3. R-E2 | Test pełnej ścieżki do „Zakończone" | Happy-path bez końcowej asercji w `/items/done` |
| 4. Porządki | Aktualizacja planu testów + fix komentarza | Rozjazd dokumentacji z rzeczywistością |

**Wymagania wstępne:** dev na `localhost:4321`, `storageState` zapisany, skill `/10x-e2e` pobrany (wszystko gotowe).
**Szacowany nakład pracy:** ~3–4 sesje robocze, 4 fazy.

## Otwarte ryzyka i założenia

- Mechanizm wstrzyknięcia env do `astro dev` (miniflare) — rozstrzygany empirycznie w Fazie 1 (seed potwierdza).
- Sprzątanie danych przez API może kolidować z bramką CSRF — fallback: sprzątanie przez UI lub poleganie na unikalności; potwierdzić w implementacji.
- Konto testowe musi zachować klucz BYOK; seed asertuje formularz (fail-fast, gdyby zniknął).

## Kryteria sukcesu (podsumowanie)

- `npm run e2e` zielony, dwukrotnie pod rząd (izolacja).
- Każdy test ryzyka czerwienieje przy celowym zepsuciu chronionego zachowania i wraca do zielonego po cofnięciu.
- Plan testów wiernie odzwierciedla warstwę E2E.
