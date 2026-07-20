# Faza 5 planu testów — bramki CI + obserwacja/utwardzenie wsadu — Krótki plan

> Pełny plan: `context/changes/testing-ci-gates-load-observation/plan.md`
> Badania: `context/changes/testing-ci-gates-load-observation/research.md`

## Co i dlaczego

Domykamy Fazę 5 planu testów: testy mają być **wymaganą bramką CI**, a graniczny wsad
(≤100 itemów / ≤100 000 znaków) na Cloudflare Workers ma zachowywać się przewidywalnie.
To ostatnia otwarta pozycja planu testów.

## Punkt wyjścia

Testy jednostkowe **już** bramkują merge (`ci.yml:25`, check `ci` wymagany) — wbrew
nieaktualnej notce w test-plan §5. Brakuje trzech rzeczy: testy integracyjne nie chodzą
w CI (są pomijane bez bazy), pełny typecheck jest tylko w pre-commit, a sesja importu może
utknąć w statusie `processing`, gdy Worker zostanie ubity limitem CPU.

## Pożądany stan końcowy

CI na każdym PR uruchamia integrację na prawdziwym Supabase i sprawdza typy. Zachowanie
dużego wsadu na żywym Workerze jest udokumentowane. Zawieszona sesja sama wraca do stanu,
który da się ponowić — użytkownik nie zostaje w ślepym zaułku.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Kiedy integracja w CI | Na każdym PR | Pełna ochrona; koszt ~1–3 min zaakceptowany | Plan |
| Jak postawić bazę w CI | `npx supabase start` (pełny stack) | Testy idą przez auth+RLS+Storage; sam Postgres nie wystarcza | Badania |
| Typecheck w CI | Dołożyć `tsc --noEmit` | Mały krok, zamyka realną dziurę (parytet z pre-commit) | Plan |
| Workers | Obserwuj i napraw | Użytkownik wybrał utwardzenie, nie samą obserwację | Plan |
| Jak naprawić zawieszenie | Reaper `processing→failed` (Opcja B) | Najmniejsza powierzchnia; reużywa retry; bez migracji i zmian UI | Badania |
| Osobny job CI | Nie | Kroki wchodzą do joba `ci`; brak zmian branch protection | Plan |

## Zakres

**W zakresie:** typecheck w CI; integracja w CI (Supabase w kontenerze); obserwacja
granicznego wsadu na Workers; reaper nieświeżej sesji `processing`; aktualizacja test-plan +
tablicy.

**Poza zakresem:** upgrade Workers do Paid / `cpu_ms` (Faza 8 deploy-planu); osobny job CI;
watchdog/cron; zmiany w `retry.ts`/UI; testy z prawdziwym dostawcą AI.

## Architektura / Podejście

Dwie osie infrastruktury (CI: typecheck + integracja jako kroki istniejącego joba `ci`) i
jedna osi produktu (reaper w serwisie sesji, wołany przy wejściu na dziennik, flip nieświeżej
`processing`→`failed` po progu 5 min — reszta odzysku przez istniejącą ścieżkę retry).

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Typecheck w CI | `tsc --noEmit` bramkuje merge | Minimalne |
| 2. Integracja w CI | Supabase w kontenerze + `test:integration` na PR | Czas/stabilność bootu Supabase |
| 3. Obserwacja Workers | Udokumentowane zachowanie granicznego wsadu | Wymaga deployu + klucza BYOK |
| 4. Reaper | Zawieszona sesja wraca do ponawialnej | Dobór progu (5 min >> 60 s) |
| 5. Domknięcie | test-plan prawdziwy + tablica zsync. | Brak |

**Wymagania wstępne:** Docker + Supabase CLI lokalnie (są); działający deploy + klucz BYOK dla Fazy 3.
**Szacowany nakład pracy:** ~3–4 sesje, 5 małych faz.

## Otwarte ryzyka i założenia

- `supabase status -o env` — dokładne nazwy pól potwierdzić w implementacji (cel: dwie
  `SUPABASE_TEST_*` dla kroku testów).
- Luka zawieszonej sesji może nie zareprodukować na prod (np. mały realny wsad / Paid) —
  reaper i tak jest poprawny (luka latentna), więc Faza 4 nie zależy od wyniku Fazy 3.
- Boot Supabase w CI może być wolny/flaky — mitygacja: potwierdzenie health przed testami.

## Kryteria sukcesu (podsumowanie)

- Zła zmiana (błąd typu / złamana izolacja per-user) czerwieni `ci` i blokuje merge.
- Zachowanie dużego wsadu na Workers jest udokumentowane, z werdyktem o luce.
- Żadna sesja `processing` nie wisi na zawsze — nieświeża sama staje się ponawialna.
