# Faza 5 planu testów — bramki CI + obserwacja i utwardzenie dużego wsadu — Plan implementacji

## Przegląd

Domykamy Fazę 5 planu testów (`context/foundation/test-plan.md` §3). Rozbicie na trzy
osie: (1) **dopiąć bramki CI** — testy integracyjne i typecheck jako wymagana część
checku `ci`; (2) **zaobserwować** realne zachowanie granicznego wsadu (≤100 itemów /
≤100 000 znaków) na Cloudflare Workers; (3) **utwardzić** znalezioną lukę — sesja importu
nie może na zawsze utknąć w statusie `processing`, gdy Worker zostanie ubity limitem CPU.

Podstawa: `context/changes/testing-ci-gates-load-observation/research.md` (commit `49db863`).

## Analiza stanu obecnego

- **Unit już bramkuje.** `.github/workflows/ci.yml:25` ma `npm run test`; `ci` jest wymaganym
  status-checkiem branch protection (`required_status_checks=["ci"]`, `enforce_admins=true`,
  auto-merge off). Dodano w F-01 (`byok-secret-security`, 2026-06-07). Notatka w test-plan §5
  („CI robi tylko lint + build") jest **nieaktualna**.
- **Integracja NIE jest w CI.** `test:integration` (`vitest run --config vitest.integration.config.ts`)
  wymaga pełnego Supabase (auth GoTrue + RLS + Storage). Bez env → `describe.skip` (zielono,
  ale nieuruchomione). 9 plików w `tests/integration/`, wzorzec `signUpClient`, czytają
  `SUPABASE_TEST_URL`/`SUPABASE_TEST_ANON_KEY` (tylko anon). Klucze lokalne deterministyczne
  (demo), zero sekretów. Docker + Supabase CLI dostępne (CLI jest devDependency).
- **Typecheck poza CI.** Pełny `tsc --noEmit` żyje tylko w `.husky/pre-commit`; CI robi tylko
  `eslint` (type-aware, częściowo) + `astro build` (bez `astro check`). Commit z `--no-verify`
  lub edycja przez web wniósłby błąd typów na `main` bez sygnału z CI.
- **Luka „zawieszonej sesji".** Wsad jest utrwalany w DB **przed** klasyfikacją
  (`classify.ts:147`/`:109`), więc crash nie gubi wejścia. Ale gdy Worker jest ubity limitem
  CPU w trakcie `JSON.parse`+zod (`classifier.ts:96-108`), `catch`/`finally` w
  `classify-core.ts:78-89` się nie wykona → sesja zostaje `processing`. Retry ponawia tylko
  `failed` (`retry.ts:54`) → sesja wisi na zawsze, a UI (`SessionCard.tsx:125`) pokazuje
  przycisk „Ponów" tylko dla `failed` → ślepy zaułek. Brak reapera/watchdoga.
- **Workers CPU.** `wrangler.jsonc` bez `limits.cpu_ms`; Faza 8 (Free→Paid) niezrobiona →
  prawdopodobnie Free (~10 ms CPU). Timeout 60 s to wall-clock fetch-wait, nie CPU.

## Pożądany stan końcowy

- CI na każdym PR uruchamia: lint → typecheck → build → unit → **integrację na prawdziwym
  Supabase** — wszystko w wymaganym checku `ci`. Błąd typu lub złamana izolacja per-user
  czerwieni CI i blokuje merge.
- Zachowanie granicznego wsadu na żywym Workerze jest **udokumentowane** (kody HTTP, logi,
  stan sesji), z jednoznacznym werdyktem, czy luka zawieszonej sesji reprodukuje na prod.
- Sesja `processing` **nie może utknąć na zawsze** — nieświeża (starsza niż próg) wraca do
  `failed` przy wejściu na dziennik, więc istniejący retry ją odzyskuje. Przypięte testem.
- `test-plan.md` odzwierciedla rzeczywistość (§5 poprawione, §3 Faza 5 `complete`, §6.6 dopisek).

### Kluczowe odkrycia:

- Wzorzec testu integracyjnego i „sprzęt" bazy: `context/archive/2026-07-12-testing-per-user-isolation/research.md:170-179`.
- Reaper: użyj `created_at` (niezmienny), nie `updated_at` (brak triggera; `classification_schema.sql:30-39`).
- Odzysk przez istniejącą ścieżkę `failed`→retry — zero zmian w `retry.ts`/UI (Opcja B).
- Env integracji w CI z `supabase status -o env` (odporne na zmianę generowania kluczy w CLI 2.x).

## Czego NIE robimy

- **Nie** przenosimy integracji do osobnego joba ani nie zmieniamy branch protection — kroki
  wchodzą do istniejącego joba `ci` (który już jest wymagany), więc nie dotykamy konfiguracji
  chronionej gałęzi. (Osobny job = możliwa przyszła optymalizacja czasu.)
- **Nie** upgrade'ujemy Workers do Paid ani nie dodajemy `cpu_ms` — to Faza 8 deploy-planu,
  odpalana tylko jeśli obserwacja (Faza 3) pokaże realne `Exceeded CPU`.
- **Nie** dokładamy redundantnego watchdoga/crona ani nie zmieniamy modelu stanów sesji poza
  jednym reaperem (Opcja B). Opcja A (retry akceptuje `processing`) odrzucona — dotyka retry+UI.
- **Nie** testujemy z prawdziwym dostawcą AI w CI (wolny/drogi/niedeterministyczny; §7 planu).

## Podejście do implementacji

Kolejność wg zależności i ryzyka: najpierw tani, niezależny typecheck (Faza 1), potem
główna robota CI (Faza 2), potem obserwacja na żywo (Faza 3), która informuje naprawę
(Faza 4), na końcu domknięcie dokumentacji i tablicy (Faza 5). Fazy 3–4 są sparowane:
obserwacja potwierdza ryzyko, reaper je zamyka niezależnie od tego, czy akurat zareprodukuje
(zawieszona `processing` to luka latentna przy każdym nieprzechwyconym ubiciu).

## Krytyczne szczegóły implementacji

- **Kolejność w CI:** `tsc --noEmit` i `test:integration` wymagają typów z `npx astro sync`
  (już `ci.yml:19`) — nowe kroki idą PO nim. Supabase musi w pełni wstać (health DB) przed
  `test:integration`; `supabase start` czeka sam, ale warto potwierdzić `supabase status`.
- **Reaper — próg >> 60 s:** ustaw 5 min. Żywy przebieg finalizuje w ≤60 s, a ubita sesja ma
  `created_at` zamrożony i **zero zapisanych itemów** (persist to atomowe RPC — status
  `processing` dowodzi, że RPC się nie wykonał), więc flip na `failed` nie może zduplikować
  danych ani przeciąć trwającego przebiegu.

## Faza 1: Typecheck w CI

### Przegląd

Domknięcie bramki typów: pełny `tsc --noEmit` w CI, parytet z pre-commit.

### Wymagane zmiany:

#### 1. Workflow CI

**Plik**: `.github/workflows/ci.yml`

**Cel**: błędy typów niełapane przez reguły type-aware eslint są blokowane w CI, tak jak
lokalnie przez pre-commit. Zamyka drogę wejścia błędu typu na `main` przez `--no-verify`/web.

**Kontrakt**: nowy krok `- run: npx --no-install tsc --noEmit` w jobie `ci`, po `npm run lint`
(typy z `astro sync` już wygenerowane wcześniej). Job pozostaje jednym wymaganym checkiem `ci`
— brak zmian w branch protection. `tsc` biegnie na całym projekcie (typy są globalne).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `ci.yml` zawiera krok `tsc --noEmit` w jobie `ci`
- `npx --no-install tsc --noEmit` przechodzi lokalnie (exit 0)
- CI zielony na PR z tą zmianą

#### Weryfikacja ręczna:

- Wstrzyknięty tymczasowo błąd typu czerwieni check `ci` (potwierdzone raz, potem cofnięte)

**Uwaga implementacyjna**: zatrzymaj się po tej fazie na ręczne potwierdzenie przed Fazą 2.

---

## Faza 2: Testy integracyjne w CI

### Przegląd

CI stawia pełny Supabase w kontenerze i uruchamia `test:integration` przy każdym PR.

### Wymagane zmiany:

#### 1. Workflow CI — Supabase + integracja

**Plik**: `.github/workflows/ci.yml`

**Cel**: testy integracyjne (izolacja per-user, RLS, Storage) biegną na prawdziwej bazie jako
część wymaganego checku `ci`, zamiast być cicho pomijane. Realizuje główny cel Fazy 5.

**Kontrakt**: w jobie `ci`, po kroku unit (`npm run test`), dołóż kroki: (a) `npx supabase start`
(stawia stack w Dockerze + nakłada migracje z `supabase/migrations/`); (b) eksport env z outputu
CLI do `$GITHUB_ENV` — `SUPABASE_TEST_URL` ← API URL, `SUPABASE_TEST_ANON_KEY` ← anon key
(uwaga: nazwy z prefiksem `TEST`, inne niż `SUPABASE_URL/KEY` używane przy `build`); (c)
`npm run test:integration`. Bez sekretów (klucze lokalne, efemeryczne). ubuntu-latest ma Dockera;
`supabase` CLI jest już w devDependencies (`npx`, bez instalacji globalnej).

Eksport env (nieoczywisty — stąd fragment):

```bash
# po `npx supabase start`
eval "$(npx --no-install supabase status -o env)"   # udostępnia API_URL, ANON_KEY
{
  echo "SUPABASE_TEST_URL=$API_URL"
  echo "SUPABASE_TEST_ANON_KEY=$ANON_KEY"
} >> "$GITHUB_ENV"
```

(Dokładne nazwy pól z `-o env` potwierdź w kroku implementacji — mogą to być `API_URL`/`ANON_KEY`;
gdyby CLI zwracał inne, zmapuj odpowiednio. Cel kontraktu: dwie zmienne `SUPABASE_TEST_*` widoczne
dla kroku `test:integration`.)

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `ci.yml` ma kroki: `supabase start`, eksport env, `npm run test:integration`
- W logu CI testy integracyjne się URUCHAMIAJĄ (widać N przechodzących, nie „skipped")
- `npm run test:integration` zielony lokalnie na `npx supabase start`
- CI zielony na PR z tą zmianą

#### Weryfikacja ręczna:

- Log CI potwierdza, że Supabase wstał i migracje się nałożyły; łączny czas builda akceptowalny

**Uwaga implementacyjna**: zatrzymaj się po tej fazie na ręczne potwierdzenie przed Fazą 3.

---

## Faza 3: Obserwacja dużego wsadu na Workers

### Przegląd

Ręczny pomiar na żywym Workerze: co robi graniczny wsad i czy luka zawieszonej sesji reprodukuje.

### Wymagane zmiany:

#### 1. Notatka obserwacji

**Plik**: `context/changes/testing-ci-gates-load-observation/observation.md` (nowy)

**Cel**: utrwalić empiryczny wynik — bez tego „obserwacja" jest nieodtwarzalna. Zasila decyzję
Free→Paid (deploy-plan Faza 8) i potwierdza/obala lukę zawieszonej sesji dla Fazy 4.

**Kontrakt**: notatka z: użytym wsadem (rozmiar/kształt), kodami HTTP, sygnaturami logów
(`classify: ok {durationMs}` / `failed` / `Exceeded CPU`), i stanem wiersza `import_sessions`
po każdym przebiegu (czy zostaje `processing` przy 5xx). Przepis w research.md „Observation recipe".

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `/api/health` na deployu zwraca `hasSupabase:true` i `hasKek:true` (`curl`)

#### Weryfikacja ręczna:

- `wrangler tail` uruchomiony; wysłany graniczny wsad (~100 000 znaków oraz wariant ~100+ itemów)
- Zanotowane: kody HTTP, sygnatury logów, stan `import_sessions` (czy zostaje `processing` przy 5xx)
- `observation.md` zapisana; jednoznaczny werdykt, czy luka zawieszonej sesji reprodukuje na prod

**Uwaga implementacyjna**: ta faza wymaga działającego deployu + realnego klucza BYOK w profilu
(inaczej `hasKek:false` → 503). Zatrzymaj się na ręczne potwierdzenie przed Fazą 4.

---

## Faza 4: Naprawa zawieszonej sesji (reaper)

### Przegląd

Nieświeża `processing` wraca do `failed` przy wejściu na dziennik → odzysk przez istniejący retry.

### Wymagane zmiany:

#### 1. Funkcja reapera

**Plik**: `src/lib/services/import-session.ts`

**Cel**: sesja ubita bez terminalnego update'u (utknięta `processing`) po progu czasu wraca do
`failed`, dzięki czemu istniejący przycisk „Ponów" i ścieżka retry ją odzyskują — bez zmian w
`retry.ts` ani w UI.

**Kontrakt**: nowa funkcja `reapStaleProcessing(supabase, userId)` wykonująca warunkowy UPDATE:
`status='failed', error_message='timeout' WHERE user_id=… AND status='processing' AND created_at < now() - interval '5 minutes'`.
Best-effort (błąd nie propaguje). Próg 5 min (>> 60 s timeout). Kotwica na `created_at` (niezmienny;
`updated_at` bez triggera). RLS + jawny `user_id` (parytet z pozostałymi funkcjami serwisu).

#### 2. Wywołanie reapera

**Plik**: ścieżka ładowania dziennika — jedyny wywołujący `getImportSessions`
(`src/pages/api/import-sessions/index.ts` lub odpowiednik SSR; implementator potwierdza faktyczną
ścieżkę danych widoku dziennika).

**Cel**: reaper odpala się opportunistycznie przy każdym wejściu na dziennik, tuż przed pobraniem
listy — bez crona/watchdoga.

**Kontrakt**: wywołanie `reapStaleProcessing(supabase, user.id)` przed `getImportSessions`; awaria
reapa nie może wywalić listy (opakowane best-effort).

#### 3. Test

**Plik**: `tests/integration/import-session-reap.integration.test.ts` (nowy)

**Cel**: przypiąć inwariant „nieświeża `processing` → `failed`, świeża nietknięta".

**Kontrakt**: na prawdziwej bazie (próg `now()` jest DB-side, więc test integracyjny, nie unit):
wstaw `processing` z `created_at` w przeszłości (> próg) → po reapie `failed`; wstaw świeżą
`processing` → po reapie nietknięta. Reużyj wzorca `signUpClient`/`insertItem`/`rowOf` z
`items-mutation.integration.test.ts`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `reapStaleProcessing` istnieje w `import-session.ts` z predykatem `created_at < now()-5min`, flip `processing→failed`
- Reaper wołany przed `getImportSessions` w ścieżce dziennika
- Nowy test integracyjny (nieświeża→failed, świeża nietknięta) zielony
- `npm run test:integration` zielony (lokalnie i w CI z Fazy 2)
- lint + `tsc --noEmit` zielone

#### Weryfikacja ręczna:

- Po reapie wcześniej zawieszona sesja pokazuje „Ponów" i daje się ponowić (ręcznie w UI)

**Uwaga implementacyjna**: zatrzymaj się po tej fazie na ręczne potwierdzenie przed Fazą 5.

---

## Faza 5: Domknięcie — dokumentacja + tablica

### Przegląd

Doprowadzenie `test-plan.md` do prawdy i synchronizacja stanu na GitHubie.

### Wymagane zmiany:

#### 1. Aktualizacja planu testów

**Plik**: `context/foundation/test-plan.md`

**Cel**: dokument przestaje kłamać o CI i odnotowuje domknięcie Fazy 5.

**Kontrakt**: (a) §5 — poprawić notkę „CI tylko lint + build" (unit już był w CI; teraz też
integracja + typecheck) i wiersz tabeli „unit + integration" (bramka aktywna); (b) §3 wiersz 5
status → `complete`; (c) §6.6 — dopisek 2–3 zdania o Fazie 5 (Supabase w CI, reaper, wynik obserwacji).

#### 2. Synchronizacja tablicy GitHub

**Cel**: board wiernie odzwierciedla stan (zgodnie z twardą regułą sync w CLAUDE.md).

**Kontrakt**: pod-zgłoszenia faz przez kolumny (start → In Progress, odhaczenie → Done); parent
Issue → Review po zaimplementowaniu wszystkich faz (czeka na `/10x-impl-review`). Operacje wg
`docs/local/github-board-ops.md`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `test-plan.md` §5 zaktualizowane (grep: brak „tylko … budowanie" w kontekście CI)
- `test-plan.md` §3 wiersz 5 status `complete`

#### Weryfikacja ręczna:

- §6.6 dopisek o Fazie 5 dodany
- Tablica GitHub zsynchronizowana (pod-zgłoszenia faz Done, parent w Review)

---

## Strategia testowania

### Testy jednostkowe:

- Brak nowych unit — logika reapera zależy od `now()` DB, więc testowana integracyjnie.

### Testy integracyjne:

- Reaper: nieświeża `processing`→`failed`, świeża nietknięta (Faza 4).
- Cały istniejący zestaw `test:integration` zaczyna biec w CI (Faza 2) — regres-sygnał izolacji.

### Kroki testowania ręcznego:

1. Faza 1: wstrzyknij błąd typu → `ci` czerwony → cofnij.
2. Faza 3: deploy + `wrangler tail` + graniczny wsad → zanotuj HTTP/logi/stan DB.
3. Faza 4: doprowadź sesję do `processing`, poczekaj > próg (lub wstaw wprost), wejdź na dziennik
   → sesja `failed` z „Ponów" → ponów.

## Uwagi dotyczące wydajności

- `supabase start` dokłada ~1–3 min do CI (pull obrazów; skracalne cache'em Dockera) — świadomy
  koszt „na każdym PR". Ryzyko flakiness: potwierdź health DB przed testami.

## Uwagi dotyczące migracji

- Brak migracji. Reaper używa istniejących kolumn `status`/`created_at`/`error_message`.

## Referencje

- Badania: `context/changes/testing-ci-gates-load-observation/research.md`
- Wzorzec integracji/reap: `tests/integration/items-mutation.integration.test.ts`
- Reaper — logika stanu: `src/lib/services/import-session.ts:55-61,226-235`
- Retry (bez zmian): `src/pages/api/import-sessions/retry.ts:54`

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po zakończeniu kroku.
> Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Typecheck w CI

#### Automatyczne

- [x] 1.1 `ci.yml` zawiera krok `tsc --noEmit` w jobie `ci` — 6d9f44a
- [x] 1.2 `npx --no-install tsc --noEmit` przechodzi lokalnie (exit 0) — 6d9f44a
- [x] 1.3 CI zielony na PR z tą zmianą — PR #153 (CI zielony)

#### Ręczne

- [x] 1.4 Wstrzyknięty błąd typu czerwieni check `ci` (potwierdzone raz, potem cofnięte) — sonda PR #154: CI czerwony na kroku `tsc --noEmit` (TS2322 w `src/typecheck-probe.ts`), lint przeszedł; PR zamknięty bez merge

### Faza 2: Testy integracyjne w CI

#### Automatyczne

- [x] 2.1 `ci.yml` ma kroki: `supabase start`, eksport env, `npm run test:integration` — 9a36644
- [x] 2.2 W logu CI testy integracyjne się uruchamiają (N przechodzących, nie „skipped") — PR #153: 55 testów integracyjnych przeszło (10 plików), 0 „skipped"
- [x] 2.3 `npm run test:integration` zielony lokalnie na `npx supabase start` — 9a36644
- [x] 2.4 CI zielony na PR z tą zmianą — PR #153

#### Ręczne

- [x] 2.5 Log CI potwierdza start Supabase + nałożone migracje; czas builda akceptowalny — PR #153 (Supabase wstał; wszystkie testy RLS zielone = migracje nałożone; build ~3 min)

### Faza 3: Obserwacja dużego wsadu na Workers

#### Automatyczne

- [ ] 3.1 `/api/health` na deployu zwraca `hasSupabase:true` i `hasKek:true`

#### Ręczne

- [ ] 3.2 `wrangler tail` uruchomiony; wysłany graniczny wsad (~100k znaków oraz ~100+ itemów)
- [ ] 3.3 Zanotowane: kody HTTP, sygnatury logów, stan `import_sessions` przy 5xx
- [ ] 3.4 `observation.md` zapisana; werdykt, czy luka zawieszonej sesji reprodukuje

### Faza 4: Naprawa zawieszonej sesji (reaper)

#### Automatyczne

- [x] 4.1 `reapStaleProcessing` w `import-session.ts` (predykat `created_at < now()-5min`, `processing→failed`) — ebe0d94
- [x] 4.2 Reaper wołany przed `getImportSessions` w ścieżce dziennika (best-effort) — ebe0d94
- [x] 4.3 Nowy test integracyjny (nieświeża→failed, świeża nietknięta) zielony — ebe0d94
- [x] 4.4 `npm run test:integration` zielony (lokalnie i w CI) — PR #153 (55 testów w CI)
- [x] 4.5 lint + `tsc --noEmit` zielone — ebe0d94

#### Ręczne

- [ ] 4.6 Po reapie zawieszona sesja pokazuje „Ponów" i daje się ponowić (ręcznie w UI)

### Faza 5: Domknięcie — dokumentacja + tablica

#### Automatyczne

- [ ] 5.1 `test-plan.md` §5 zaktualizowane (notka + tabela)
- [ ] 5.2 `test-plan.md` §3 wiersz 5 status `complete`

#### Ręczne

- [ ] 5.3 §6.6 dopisek o Fazie 5 dodany
- [ ] 5.4 Tablica GitHub zsynchronizowana (pod-zgłoszenia faz Done, parent w Review)
