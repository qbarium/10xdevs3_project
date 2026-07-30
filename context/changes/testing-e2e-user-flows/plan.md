# Warstwa E2E — pełna ścieżka user-facing — Plan implementacji

## Przegląd

Wprowadzamy warstwę testów E2E (Playwright) pokrywającą dwa ryzyka „na poziomie przeglądarki", których nie łapią testy jednostkowe/integracyjne: **R-E1** (item przetrwa odświeżenie strony) i **R-E2** (pełna ścieżka sukcesu z PRD: login → wklej → klasyfikacja → akceptacja → „Zrobione"). Klasyfikator AI mockujemy przez istniejący szew w kodzie (`kind:"mock"`), nie przez sieć. Faza wynika z `/10x-test-plan --refresh` i domyka §4/§6.3/§7 planu testów.

## Analiza stanu obecnego

- Testy: 53 jednostkowe + 10 integracyjnych (Vitest, dwa configi), CI odpala oba. **Brak warstwy E2E** — `playwright.config.*` nie istnieje, jest tylko katalog `playwright/.auth/` (na sesję).
- Szew mock: `src/lib/ai/classifier.ts:43-46` — gałąź `kind === "mock"` celowo rzuca `UnsupportedModelError` („ciało atrapy powstanie przy wejściu testów E2E"). Włącznik: `CLASSIFIER_MODEL=mock` (`astro.config.mjs:84`, publiczny envField, domyślnie `gpt-4o-mini`). Gałąź jest przed `fetch` i przed użyciem klucza.
- Przekierowanie `baseUrl` zablokowane fail-closed allowlistą hostów (`config/ai.ts:40-54`) — szew w kodzie to jedyna droga.
- `storageState` (`playwright/.auth/user.json`) zapisany i **zweryfikowany**; konto testowe ma skonfigurowany klucz BYOK. Middleware autoryzuje z ciasteczek; wejścia na strony to GET (bez bramki CSRF).
- Kontrakt itemu: `{ type: enum(task|note|idea|decision|other), title: min 1, description: string }` (`src/lib/ai/schema.ts:13-17`).

## Pożądany stan końcowy

- `npm run e2e` uruchamia Playwrighta na dev serwerze z mockiem AI; dwa testy ryzyk (R-E1, R-E2) plus wzorcowy `seed.spec.ts` przechodzą, deterministycznie i wielokrotnie.
- Każdy test przeszedł przegląd pięciu antywzorców i weryfikację przez celowe psucie (test czerwienieje, gdy zepsuć chronione zachowanie).
- Plan testów (`context/foundation/test-plan.md`) odzwierciedla warstwę E2E: §3 (faza), §4 (Playwright w stosie), §6.3 (wzorzec e2e), §7 (skorygowane negative space). Nieaktualny komentarz w `vitest.integration.config.ts` poprawiony.

### Kluczowe odkrycia:

- Szew mock: `src/lib/ai/classifier.ts:43-46`; włącznik `CLASSIFIER_MODEL` `astro.config.mjs:84`; resolver `src/lib/ai/resolver.ts:23`.
- DOM itemu: `<article data-item-id>` + tytuł w `<h3>` (`src/components/items/ItemCard.tsx:74,163`) → `getByRole('heading',{level:3,name})` to kotwica asercji przetrwania.
- Widok wynika ze ŚCIEŻKI (`/items` pending, `/items/active`, `/items/done`), nie z query param (`src/lib/services/list-criteria.ts:20-21`).
- Endpointy: `POST /api/ingest/classify {text}`; `POST /api/items/bulk {ids,action:"accept"}`; `POST /api/items/operational {ids,status:"done"}`.
- Terminologia: „zrealizowane" = etykieta **„Zrobione"** (przycisk bulk, wymaga zaznaczenia); „w realizacji" = „W toku" (`src/lib/labels.ts`).

## Czego NIE robimy

- **Nie wpinamy E2E w CI** w tej zmianie — `storageState` niesie prawdziwy token konta (gitignored), więc CI wymagałby dedykowanego konta testowego + logowania w globalnym setupie (secrets, CSRF). Świadomy follow-up; §7 planu testów to odnotuje. E2E działa lokalnie (`npm run e2e`).
- Nie pokrywamy E2E rzeczy tańszych gdzie indziej: izolacja per-user (serwis + RLS, integracyjne), kontrakt klasyfikatora (jednostkowe), dwuwymiarowy cykl stanu (jednostkowe + integracyjne), regresja pikseli (narzędzia deterministyczne).
- Nie wprowadzamy trybu vision/MCP — DOM (snapshot) wystarcza dla tych ryzyk (M3L4).
- Nie mockujemy auth ani bazy — realne (to one rozstrzygają „przetrwa reload").

## Podejście do implementacji

Mock przez szew w kodzie (dopisujemy ciało atrapy w `kind:"mock"`), włączany zmienną `CLASSIFIER_MODEL=mock` podawaną wyłącznie serwerowi testowemu przez `webServer` Playwrighta — normalny dev pozostaje na prawdziwym AI. Auth przez zapisany `storageState`. Izolacja danych przez unikalny wsad (`E2E-<timestamp>-<rnd>` → unikalny tytuł, który atrapa odzwierciedla), plus best-effort sprzątanie do kosza. Kolejność faz: najpierw fundament + wzorzec (dowód, że infra+mock+auth działają na minimalnym teście), potem po jednym teście ryzyka przez pętlę `/10x-e2e` (GENERATE→REVIEW→VERIFY), na końcu porządki w planie testów.

## Krytyczne szczegóły implementacji

- **Wstrzyknięcie `CLASSIFIER_MODEL=mock`**: `astro dev` z adapterem cloudflare (miniflare) czyta `astro:env/server`. Preferuj `webServer.env` w `playwright.config.ts`; jeśli empirycznie okaże się, że dev nie widzi `process.env` dla `astro:env`, fallback: dedykowany skrypt (np. `cross-env` w komendzie webServer) lub osobny plik `.dev.vars`. **NIGDY** nie dodawaj `mock` do współdzielonego `.dev.vars` (zepsułoby normalny dev). Faza 1 to weryfikuje realnym przebiegiem seeda.
- **Ciało atrapy** musi być deterministyczne i wyprowadzać tytuł z wsadu: rozbij `rawText` po liniach, każda niepusta (po `trim`) linia → `{ type: "task", title: linia (przytnij do ≤200 zn, gwarantuj min 1), description: "" }`. Zwrot musi przejść `classificationResultSchema`. To pozwala testowi kontrolować tytuł itemu przez unikalny wsad. Gałąź jest martwa w prod (prod = `gpt-4o-mini` → `kind:"chat"`).
- **Zmiana stanu na „Zrobione" wymaga zaznaczenia** — najpierw checkbox itemu (lub „Zaznacz wszystkie"), potem przycisk „Zrobione"; przy zaznaczeniu wszystkich pojawia się dialog potwierdzenia „Zmienić stan N ... na „Zrobione"?".

## Faza 1: Fundament E2E — Playwright, tryb mock, wzorzec

### Przegląd

Postawić uruchamialną warstwę E2E i udowodnić minimalnym testem, że Playwright + mock AI + `storageState` działają razem.

### Wymagane zmiany:

#### 1. Zależność i skrypty

**Plik**: `package.json`

**Cel**: dodać runner E2E jako zależność deweloperską i skrypt uruchamiający. Lokalnie, nie globalnie.

**Kontrakt**: `devDependencies += @playwright/test`; `scripts += { "e2e": "playwright test" }`. Instalacja przeglądarki: `npx playwright install chromium` (po `npm audit` na nowej zależności — safe-ops). Bez zmian w istniejących skryptach.

#### 2. Konfiguracja Playwright

**Plik**: `playwright.config.ts` (nowy, root)

**Cel**: skonfigurować runner: katalog testów, baseURL, wstrzyknięta sesja, serwer dev z mockiem.

**Kontrakt**: `testDir: "e2e"`; `use: { baseURL: "http://localhost:4321", storageState: "playwright/.auth/user.json" }`; `projects: [{ name: "chromium", use: devices["Desktop Chrome"] }]`; `webServer: { command: <astro dev z CLASSIFIER_MODEL=mock>, url: "http://localhost:4321", reuseExistingServer: true, timeout }`. Mechanizm env — patrz Krytyczne szczegóły.

#### 3. Ciało atrapy klasyfikatora

**Plik**: `src/lib/ai/classifier.ts`

**Cel**: zastąpić `throw UnsupportedModelError` w gałęzi `kind === "mock"` deterministycznym ciałem zwracającym itemy wyprowadzone z wsadu.

**Kontrakt**: gałąź `kind === "mock"` zwraca `ClassifiedItem[]` zgodne z `classificationResultSchema`; tytuł każdego itemu = niepusta linia wsadu (patrz Krytyczne szczegóły). Nie dotyka sieci, klucza ani `hashUserId`.

#### 4. Test jednostkowy atrapy

**Plik**: `src/lib/ai/classifier.mock.test.ts` (nowy) lub rozszerzenie `classifier.test.ts`

**Cel**: przypiąć determinizm i kształt atrapy — dziś żaden test nie pokrywa gałęzi `kind:"mock"`.

**Kontrakt**: przy `CLASSIFIER_MODEL=mock` (lub wstrzykniętym configu) `classify("linia A\nlinia B", opts)` → dwa itemy z `title` „linia A"/„linia B", `type:"task"`, `description:""`; ten sam wsad → ten sam wynik. Wsad jednoliniowy → jeden item.

#### 5. Ignorowanie artefaktów

**Plik**: `.gitignore`

**Cel**: nie commitować raportów/wyników Playwrighta.

**Kontrakt**: dopisz `test-results/`, `playwright-report/`, `playwright/.cache/`.

#### 6. Test wzorcowy (seed)

**Plik**: `e2e/seed.spec.ts` (nowy)

**Cel**: pokazać agentowi wzór dobrego testu ORAZ udowodnić, że fundament stoi (auth + mock). Demonstruje: `getByRole`, czekanie na stan (nie czas), nazwę spiętą z celem.

**Kontrakt**: test „zalogowany użytkownik widzi Skrzynkę wejściową" — `page.goto('/ingest')`, `await expect(page.getByRole('heading',{name:'Skrzynka wejściowa'})).toBeVisible()` oraz obecność pola „Tekst do klasyfikacji" (dowód, że konto ma klucz BYOK → formularz, nie onboarding). Bez `waitForTimeout`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx tsc --noEmit`
- Testy jednostkowe przechodzą (w tym nowy test atrapy): `npm test`
- Seed E2E przechodzi: `npx playwright test e2e/seed.spec.ts`
- Nowa zależność bez podatności blokujących: `npm audit` przejrzany

#### Weryfikacja ręczna:

- Seed potwierdza, że klasyfikacja idzie przez atrapę (dev z `CLASSIFIER_MODEL=mock` nie woła sieci) — potwierdzone realnym przebiegiem, nie samym zielonym buildem.
- `git status` czysty poza zamierzonymi plikami; `playwright/.auth/` nadal ignorowane.

---

## Faza 2: Test R-E1 — item przetrwa odświeżenie

### Przegląd

Test dowodzący, że zaakceptowany item jest realnie zapisany (baza → SSR), a nie tylko potwierdzony odpowiedzią 200. Prowadzony przez `/10x-e2e`.

### Wymagane zmiany:

#### 1. Test przetrwania po reload

**Plik**: `e2e/item-survives-reload.spec.ts` (nowy)

**Cel**: pokryć R-E1 — obecność itemu po `page.reload()` na `/items/active`.

**Kontrakt**: unikalny tytuł `E2E-<timestamp>-<rnd>`. Kroki: `/ingest` → wpisz tytuł w „Tekst do klasyfikacji" → „Wyślij" → poczekaj na modal/`/items` → „Zatwierdź" (per-item) → `/items/active` → `expect(getByRole('heading',{level:3,name:tytuł})).toBeVisible()` → `page.reload()` → **ta sama asercja nadal prawdziwa**. `afterEach`: best-effort sprzątanie do kosza (mechanizm — API z Origin lub UI; potwierdzić w implementacji). Zachowanie asertowane: persystencja w bazie. Regresja łapana: utrata itemu po odświeżeniu. Źródło: `research.md` §4, `ItemCard.tsx:74,163`. Antywzorzec unikany: naiwna asercja na toast/tytuł strony.

#### 2. Przegląd i weryfikacja

**Cel**: przepuścić test przez pięć antywzorców i potwierdzić, że czerwienieje przy zepsuciu chronionego zachowania.

**Kontrakt**: REVIEW (naiwna asercja / kruchy selektor / współdzielony stan / `waitForTimeout` / brak sprzątania). VERIFY: celowo osłab persystencję lub akceptację (np. tymczasowo spraw, by accept nie zapisywał), potwierdź czerwony, **natychmiast cofnij** (nie commituj złamania).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Test przechodzi: `npx playwright test e2e/item-survives-reload.spec.ts`
- Przechodzi dwukrotnie pod rząd (izolacja/idempotencja): dwa przebiegi zielone

#### Weryfikacja ręczna:

- Przegląd pięciu antywzorców wykonany, wynik zapisany.
- Celowe psucie → test czerwony; po cofnięciu → zielony (asercja realnie pilnuje ryzyka).

---

## Faza 3: Test R-E2 — pełna ścieżka do „Zakończone"

### Przegląd

Szeroki dymny test całego kryterium sukcesu z PRD, do widoku `/items/done`. Prowadzony przez `/10x-e2e`.

### Wymagane zmiany:

#### 1. Test happy-path

**Plik**: `e2e/happy-path-smoke.spec.ts` (nowy)

**Cel**: pokryć R-E2 — przejście login (storageState) → generacja → akceptacja → „Zrobione" → obecność w „Zakończone".

**Kontrakt**: unikalny tytuł. Kroki: `/ingest` → wpisz → „Wyślij" → `/items` → „Zatwierdź" → `/items/active` → zaznacz checkbox itemu → „Zrobione" (obsłuż dialog potwierdzenia, jeśli wystąpi) → przejdź na `/items/done` → `expect(getByRole('heading',{level:3,name:tytuł})).toBeVisible()`. `afterEach`: sprzątanie. Zachowanie asertowane: pełna ścieżka domyka się w „Zakończone". Regresja łapana: zerwanie któregokolwiek ogniwa ścieżki. Źródło: PRD Success Criteria, `research.md` §5. Antywzorzec unikany: happy-path bez końcowej asercji w `/items/done`.

#### 2. Przegląd i weryfikacja

**Cel**: jak w Fazie 2 — pięć antywzorców + celowe psucie (np. zepsuj przejście na `done`), rewert.

**Kontrakt**: REVIEW + VERIFY z natychmiastowym cofnięciem złamania.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Test przechodzi: `npx playwright test e2e/happy-path-smoke.spec.ts`
- Cały zestaw E2E zielony dwukrotnie pod rząd: `npm run e2e` ×2

#### Weryfikacja ręczna:

- Przegląd pięciu antywzorców wykonany.
- Celowe psucie przejścia na „Zrobione"/`done` → czerwony; po cofnięciu → zielony.

---

## Faza 4: Aktualizacja planu testów i porządki

### Przegląd

Odzwierciedlić warstwę E2E w kanonicznym planie testów i naprawić nieaktualny komentarz.

### Wymagane zmiany:

#### 1. Plan testów

**Plik**: `context/foundation/test-plan.md`

**Cel**: dopisać E2E jako zrealizowaną warstwę.

**Kontrakt**: §3 — nowy wiersz fazy „Warstwa E2E — pełna ścieżka user-facing" (status `complete`, folder `testing-e2e-user-flows`); §4 — Playwright w tabeli stosu (dziś „e2e: brak"), z datą `checked:`; §6.3 — wzorzec dodania testu e2e (dziś „TBD"): lokalizacja `e2e/`, `getByRole`, `storageState`, mock przez `CLASSIFIER_MODEL=mock`, unikalne ID + sprzątanie, `npm run e2e`; §7 — korekta negative space (E2E user-flows WCHODZI; per-user isolation/HTTP nadal poza, pixel-regresja nadal deterministyczna). Notatka: E2E w CI = follow-up.

#### 2. Poprawka nieaktualnego komentarza

**Plik**: `vitest.integration.config.ts`

**Cel**: komentarz „NIE uruchamiane w CI (brak DB)" jest nieprawdziwy od Fazy 5 planu testów (CI stawia Supabase i odpala integrację).

**Kontrakt**: skoryguj komentarz do stanu faktycznego (CI odpala integrację na wstawianym Supabase). Bez zmian w logice configu.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint/format plików Markdown przechodzi (celowany prettier na zmienionych plikach).
- Cały zestaw jednostkowy + integracyjny nadal zielony: `npm test`.

#### Weryfikacja ręczna:

- §3/§4/§6.3/§7 planu testów spójne z tym, co realnie dostarczono.
- Komentarz w `vitest.integration.config.ts` zgodny z zachowaniem CI.

---

## Strategia testowania

### Testy jednostkowe:

- Atrapa klasyfikatora: determinizm, kształt zgodny z `classificationResultSchema`, wsad wielo-/jednoliniowy.

### Testy E2E (nowe):

- `seed.spec.ts` — smoke: auth + mock + Skrzynka wejściowa.
- `item-survives-reload.spec.ts` — R-E1: obecność itemu po `reload()` na `/items/active`.
- `happy-path-smoke.spec.ts` — R-E2: ścieżka do `/items/done`.

### Kroki testowania ręcznego:

1. `npm run e2e` — cały zestaw zielony.
2. Uruchom dwukrotnie pod rząd — brak kolizji danych (izolacja).
3. Dla każdego testu ryzyka: celowe psucie chronionego zachowania → czerwony, rewert → zielony.

## Uwagi dotyczące wydajności

E2E są wolne (uruchamiają dev + przeglądarkę). Trzy testy to świadomie mały zestaw (M3L4: konserwatywnie). `reuseExistingServer: true` przyspiesza lokalne przebiegi (reużywa działającego dev).

## Uwagi dotyczące migracji

Brak migracji danych. Atrapa mock dotyka wyłącznie środowiska testowego (`CLASSIFIER_MODEL=mock`); prod bez zmian zachowania.

## Referencje

- Badanie: `context/changes/testing-e2e-user-flows/research.md`
- Szew mock: `src/lib/ai/classifier.ts:43-46`; resolver `src/lib/ai/resolver.ts:23`
- DOM itemu: `src/components/items/ItemCard.tsx:74,163`
- Lekcja M3L4: `docs/local/lekcje/M3L4_e2e-tests-playwright-mcp-and-multimodal-scenarios.md`

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po zakończeniu kroku.

### Faza 1: Fundament E2E — Playwright, tryb mock, wzorzec

#### Automatyczne

- [x] 1.1 Lint przechodzi: `npm run lint`
- [x] 1.2 Typy przechodzą: `npx tsc --noEmit`
- [x] 1.3 Testy jednostkowe przechodzą (w tym 5 testów atrapy): `npm test` — 566 zielonych
- [x] 1.4 Seed E2E przechodzi: `npx playwright test e2e/seed.spec.ts`
- [x] 1.5 `npm audit` przejrzany — `audit fix` (bez --force) załatał vite/ws (15→11); reszta wymaga breaking astro@7 (poza zakresem, dev-tooling)

#### Ręczne

- [x] 1.6 webServer wstał z `CLASSIFIER_MODEL=mock` (health OK); pełna klasyfikacja przez atrapę potwierdzana w Fazie 2
- [x] 1.7 `git status` czysty poza zamierzonymi plikami; `playwright/.auth/` + artefakty ignorowane

### Faza 2: Test R-E1 — item przetrwa odświeżenie

#### Automatyczne

- [x] 2.1 Test przechodzi: `npx playwright test e2e/item-survives-reload.spec.ts`
- [x] 2.2 Przechodzi dwukrotnie pod rząd (izolacja) — `--repeat-each=2` zielone

#### Ręczne

- [x] 2.3 Przegląd pięciu antywzorców wykonany (role-locators, wait-for-state, unikalny tytuł+cleanup, brak waitForTimeout)
- [x] 2.4 Celowe psucie (predykat active: accepted→rejected) → czerwony; rewert → zielony

### Faza 3: Test R-E2 — pełna ścieżka do „Zakończone"

#### Automatyczne

- [x] 3.1 Test przechodzi: `npx playwright test e2e/happy-path-smoke.spec.ts`
- [x] 3.2 Cały zestaw E2E zielony dwukrotnie: `npm run e2e` ×2 (3 passed 44s / 46s) — dodano skrypt `e2e`
- [x] 3.3 Przegląd pięciu antywzorców wykonany (role-locators, wait-for-state, unikalny tytuł+cleanup, brak waitForTimeout)

#### Ręczne

- [x] 3.4 Celowe psucie (predykat done: done→cancelled) → czerwony na asercji „Zakończone"; rewert → zielony

### Faza 4: Aktualizacja planu testów i porządki

#### Automatyczne

- [ ] 4.1 Celowany lint/format zmienionych plików przechodzi
- [ ] 4.2 Zestaw jednostkowy + integracyjny nadal zielony: `npm test`

#### Ręczne

- [ ] 4.3 §3/§4/§6.3/§7 planu testów spójne z dostarczonym
- [ ] 4.4 Komentarz w `vitest.integration.config.ts` zgodny z zachowaniem CI
