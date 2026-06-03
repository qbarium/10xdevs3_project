# Plan: Integracja i wdrożenie TaskerLight na Cloudflare Workers

## Kontekst

Projekt TaskerLight (Astro 6 SSR + React 19 + Supabase + `@astrojs/cloudflare` v13) jest scaffoldnięty i ma zdomknięty kontrakt `context/foundation/infrastructure.md` (decyzja: Cloudflare Workers, runner-up Render). Brakuje pierwszego deployu produkcyjnego. Plan obejmuje **pierwszą integrację end-to-end** — od założenia kont i lokalnego stacku Supabase przez Docker, przez konfigurację `wrangler.jsonc`, sekretów i Supabase Auth URL (z chicken-and-egg trickiem), pierwszy manualny `wrangler deploy`, smoke test signup→confirm→signin, aż po podpięcie **Cloudflare Workers Builds** (auto-deploy po stronie Cloudflare wyzwalany pushem do `main`). GitHub Actions deploy job, sekrety AI BYOK i audio upload pozostają w **kolejnych krokach** (rozpoznana roadmapa, nie wycięte).

Wynikiem ma być działający `https://tasker-light.<subdomain>.workers.dev` z funkcjonalnym przepływem signup → confirm → signin → dashboard, z czystą separacją dev (lokalny Docker stack Supabase) vs prod (cloud Supabase project), oraz CI po stronie Cloudflare reagujący na merge do `main`.

**Legenda ról:**
- **[USER]** — krok, który musisz wykonać samodzielnie (klikanie w panelu, paste sekreta z password managera, akceptacja OAuth, decyzje destruktywne).
- **[AGENT]** — krok, który po wyjściu z Plan Mode wykona agent (edycje plików, komendy budowania/deploy/testów, parsowanie logów).
- **[USER → AGENT]** — krok inicjowany ręcznie (np. OAuth login w przeglądarce), w którym agent dopomaga (instrukcja, weryfikacja, kolejna komenda).

---

## Faza 0 — Wymagania wstępne (środowisko, konta, lokalny stack)

Pięć zewnętrznych zależności, które muszą być gotowe **zanim** ruszą jakiekolwiek edycje konfiguracji w repo.

### 0.1 Konto Cloudflare + workers.dev subdomain
- [ ] **[USER]** Rejestracja na `https://dash.cloudflare.com/sign-up` (jeśli jeszcze brak).
- [ ] **[USER]** Potwierdzenie e-maila + zalogowanie do dashboardu.
- [ ] **[USER]** Sprawdzenie, że domyślny plan to **Workers Free** (200k żądań/dzień, 10 ms CPU/wywołanie) — wystarczy do MVP smoke testów. Przejście na **Workers Paid (5 USD/mc)** **nie teraz** — bramka decyzyjna w Fazie 8.
- [ ] **[USER]** **Zanotuj Account ID** (Workers & Pages → Overview, prawa kolumna).
- [ ] **[USER]** **Zanotuj workers.dev subdomain** (Workers & Pages → Overview → „Your workers.dev subdomain", zwykle prawa kolumna lub footer). Jeśli świeże konto bez workera → przycisk **„Set up a subdomain"** → wybierz nazwę (rekomendacja: `<twoja-nazwa>` typu `jakub-rusek`). Format: `<subdomain>.workers.dev`.
- [ ] **[USER]** Zapisz **przewidywany pełny URL produkcyjny**: `https://tasker-light.<subdomain>.workers.dev` — będzie potrzebny w Fazie 4.1 PRZED pierwszym deployem.

### 0.2 Wrangler CLI
- [ ] **[AGENT]** Weryfikacja, że `wrangler` jest już w `package.json` jako devDependency (`wrangler: ^4.90.0` — jest zainstalowany).
- [ ] **[AGENT]** Sanity check: `npx wrangler --version` (oczekiwane `4.90.x`).
- [ ] **[USER → AGENT]** `npx wrangler login` — otworzy się przeglądarka, **[USER]** akceptuje OAuth, **[AGENT]** weryfikuje sukces przez `npx wrangler whoami` (powinno pokazać e-mail Cloudflare i Account ID zgodne z zanotowanym w 0.1).
- [ ] **[USER]** Notatka: w MVP używamy konta usera (pełne uprawnienia). Wygenerowanie zawężonego API tokenu → w „Kolejnych krokach".

### 0.3 Supabase — cloud project + lokalny stack Docker

**Dwa równoległe światy:** *cloud* (prod, hostowany na supabase.com) i *lokalny stack* (dev, Docker na Twojej maszynie). Workers na edge nie dostaną się do `127.0.0.1:54321` lokalnego stacku — dlatego cloud project jest **niezbędny**, niezależnie od lokalnego setupu.

#### 0.3.A Cloud project (produkcja)
- [ ] **[USER]** Rejestracja na `https://supabase.com` (jeśli jeszcze brak).
- [ ] **[USER]** Dashboard → „New project" — wybór:
  - **Name**: `tasker-light` (lub `tasker-light-prod`)
  - **Database password**: wygeneruj silne, **zapisz w password managerze** (używane przez `supabase db` CLI w Fazie 1.5 do push migracji).
  - **Region**: najbliższy geograficznie (PL → `eu-central-1` Frankfurt rekomendowany przez infrastructure.md + obrazek kursowy).
  - **Plan**: Free OK na start. **Uwaga: Supabase Free pauzuje projekt po 7 dniach bezczynności** — jeśli deadline `2026-07-05` poślizgnie się o tygodnie, pre-launch sprawdź czy projekt nie jest spauzowany (unpause = klik w dashboardzie + kilka minut wait).
- [ ] **[USER]** Settings → API — skopiuj do password managera:
  - `Project URL` (postaci `https://<ref>.supabase.co`) → trafi do sekreta `SUPABASE_URL` w Fazie 2.2
  - `anon public` key (krótki JWT) → trafi do sekreta `SUPABASE_KEY` w Fazie 2.2. **Potwierdź, że kopiujesz anon, NIE `service_role`** — service_role bypassuje RLS i wystawiłby admin operations każdemu zalogowanemu userowi.
  - **Project ref** (część przed `.supabase.co`, np. `abc123xyz`) → potrzebne do `supabase link` w 0.3.B.

#### 0.3.B Lokalny stack przez Docker (development)
- [ ] **[AGENT]** Weryfikacja, że `supabase` CLI jest w devDependencies (`supabase: ^2.23.4` — jest).
- [ ] **[USER]** Instalacja **Docker Desktop** (Windows): `winget install Docker.DockerDesktop` lub instalator z `https://www.docker.com/products/docker-desktop`. Po instalacji uruchom Docker Desktop (musi działać w tle).
- [ ] **[AGENT]** Sanity check Dockera: `docker --version` (oczekiwane ≥ 24.x) + `docker info` (musi pokazać działający daemon, nie błąd).
- [ ] **[AGENT]** `npx supabase init` w root projektu — tworzy `supabase/config.toml` i bazową strukturę (jeśli nie istnieje).
- [ ] **[AGENT]** `npx supabase start` — pierwsze uruchomienie pobiera obrazy Dockera (~kilka GB) i odpala ~10 kontenerów: db (Postgres), auth (GoTrue), storage, kong (API gateway), realtime, studio (UI na `http://127.0.0.1:54323`). Czas: 2–5 min przy pierwszym razie.
- [ ] **[AGENT]** `npx supabase status` — output zawiera **lokalny API URL** (`http://127.0.0.1:54321`) i **lokalny anon key** (JWT). **[AGENT]** zapisuje te wartości na potrzeby Fazy 2.1.
- [ ] **[USER → AGENT]** `npx supabase link --project-ref <ref-z-0.3.A>` — **[USER]** wkleja project ref. **[AGENT]** weryfikuje, że link się udał (komenda zapisuje state w `supabase/.temp/`).

### 0.4 GitHub CLI
- [ ] **[USER]** Instalacja `gh` z `https://cli.github.com` (Windows: `winget install GitHub.cli`).
- [ ] **[USER → AGENT]** `gh auth login` — wybór `GitHub.com` → `HTTPS` → `Login with web browser`. **[USER]** wkleja kod, akceptuje OAuth. **[AGENT]** weryfikuje przez `gh auth status`.
- [ ] **[AGENT]** Sanity check: `gh repo view --json name,defaultBranchRef` — pokazuje repo i default branch (oczekiwany `main`).

**Bramka:** Wszystkie sub-kroki Fazy 0 muszą być oznaczone `[x]` zanim ruszamy do Fazy 1. Zwłaszcza:
- Docker Desktop **uruchomiony**
- `npx supabase status` zwraca lokalny URL + key
- Workers.dev subdomain zanotowany (kluczowy dla Fazy 4.1)

---

## Faza 1 — Konfiguracja repo + pierwsza migracja

### 1.1 Bump adapter Cloudflare (peer-dep stability)
- [ ] **[AGENT]** Edycja `package.json` linia 16: `"@astrojs/cloudflare": "^13.5.0"` → `"@astrojs/cloudflare": "~13.6.0"` (tilde — fix peer-dep #16029, zgodnie z infrastructure.md §Rejestr ryzyka wiersz 1).
- [ ] **[AGENT]** `npm install` — regeneruje `package-lock.json`.
- [ ] **[AGENT]** Smoke `npm run build` — musi przejść bez błędów `require_dist is not a function`.

### 1.2 Poprawki `wrangler.jsonc`
- [ ] **[AGENT]** Edycja `wrangler.jsonc` linia 3: `"name": "10x-astro-starter"` → `"name": "tasker-light"` (infrastructure.md §Rejestr ryzyka wiersz 4). **Ważne:** ta nazwa determinuje finalny worker URL — musi być zgodna z URL zapisanym w 0.1.
- [ ] **[AGENT]** **NIE dodawać** `[limits] cpu_ms: 60000` w tej fazie — Free plan ma hard cap 10 ms; dodanie tej dyrektywy następuje **dopiero w Fazie 8** po przejściu na Paid.
- [ ] **[AGENT]** Weryfikacja nietkniętych: `compatibility_date: "2026-05-08"`, `compatibility_flags: ["nodejs_compat"]`, `assets` binding, `observability.enabled: true`.

### 1.3 Sanity check builda
- [ ] **[AGENT]** `npm run lint` — bez błędów.
- [ ] **[AGENT]** `npm run build` — produkcyjny build kończy się sukcesem (`dist/` wygenerowany).

### 1.4 Branch CI: master → main (rozstrzygnięte)
Repo lokalnie jest na branchu **`main`**, ale `.github/workflows/ci.yml` linie 5+7 wskazują **`master`** — CI nie odpala się przy pushu do `main`. Decyzja: ujednolicić na `main`.
- [ ] **[AGENT]** Edycja `.github/workflows/ci.yml` linie 5 i 7 — `master` → `main`. Commit z opisem rozjazdu.
- [ ] **[AGENT]** Weryfikacja zdalnego default branch: `gh repo view --json defaultBranchRef` — jeśli zdalnie `master`, **[USER]** w GitHub Settings → Branches → zmienia default na `main`. **[AGENT]** weryfikuje ponownie po zmianie.
- [ ] **[AGENT]** Sanity push (trywialny commit) — CI uruchamia się na `main`, lint+build job zielony.

### 1.5 Pierwsza migracja Supabase (placeholder init)
W MVP-week-1 nie tworzymy jeszcze tabel domeny (FR-001..028 wchodzą w M2). Tworzymy **migration placeholder**, żeby pipeline lokal→cloud był ustawiony.
- [ ] **[AGENT]** `npx supabase migration new init` — tworzy plik `supabase/migrations/<YYYYMMDDHHmmss>_init.sql` (pusty).
- [ ] **[AGENT]** Edycja pliku migracji — dodanie minimalnego komentarza SQL (`-- TaskerLight init migration; domain tables in M2 (FR-001..028)`) plus jednorazowo: weryfikacja, że `auth` schema istnieje (`SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth';` jako komentarz dokumentacyjny, nie blokujący).
- [ ] **[AGENT]** `npx supabase db reset` — re-aplikuje wszystkie migracje na lokalnym stacku (pełen reset = idempotentny test).
- [ ] **[USER → AGENT]** `npx supabase db push` — wysyła migrację do **cloud** project. **[USER]** może być poproszony o database password (zapisany w 0.3.A). **[AGENT]** weryfikuje przez `npx supabase db diff` (powinno zwrócić brak różnic).

---

## Faza 2 — Sekrety: lokalne (.dev.vars z lokalnego stacku) + produkcyjne (Workers Secrets z cloud)

### 2.1 Lokalne `.dev.vars` (workerd dev runtime przeciw lokalnemu Supabase)
- [ ] **[AGENT]** Weryfikacja, że `.dev.vars` jest w `.gitignore` (powinno być od bootstrappingu; jeśli nie — dopisać).
- [ ] **[AGENT]** Utworzenie `.dev.vars` w root projektu z **LOKALNYMI wartościami z Fazy 0.3.B** (`npx supabase status`):
  ```
  SUPABASE_URL=http://127.0.0.1:54321
  SUPABASE_KEY=<lokalny-anon-key-z-supabase-status>
  ```
  **NIE wkładamy tu cloud anon key** — separacja dev/prod jest cały sens lokalnego stacku.
- [ ] **[AGENT]** Smoke `npm run dev` — strona główna powinna się załadować bez 500, middleware powinno utworzyć Supabase client wskazujący na lokalny stack. Sanity: w `wrangler tail` lokalnym (jeśli dev używa workerd) brak errorów.

### 2.2 Sekrety produkcyjne (Cloudflare Workers Secrets z cloud Supabase)
- [ ] **[USER → AGENT]** `npx wrangler secret put SUPABASE_URL` — **[USER]** wkleja **cloud URL** z password managera (Faza 0.3.A) w prompt stdin. **[AGENT]** prowadzi.
- [ ] **[USER → AGENT]** `npx wrangler secret put SUPABASE_KEY` — **[USER]** wkleja **cloud anon key**. Potwierdzenie, że to anon, NIE service_role.
- [ ] **[AGENT]** Weryfikacja: `npx wrangler secret list` — pokazuje dwa wpisy bez wartości (CF nie zwraca wartości po wgraniu — to feature).
- [ ] **[USER]** Notatka: `AI_PROVIDER_API_KEY` **NIE** jest wgrywany w tej iteracji — wejdzie wraz z FR-006 klasyfikacją w M2 (kolejne kroki).

---

## Faza 3 — Health endpoint

### 3.1 Utworzenie `src/pages/api/health.ts`
- [ ] **[AGENT]** Nowy plik `src/pages/api/health.ts` z exportem `GET`, `export const prerender = false`, używający `astro:env/server` do sprawdzenia obecności `SUPABASE_URL`/`SUPABASE_KEY` i próby utworzenia klienta Supabase. Odpowiedź JSON: `{ ok: true, hasSupabase: boolean, runtime: "workerd", checkedAt: <ISO> }`. **Bez wycieku wartości sekretów** — tylko `hasSupabase: true|false`.
- [ ] **[AGENT]** Smoke `npm run dev` + `curl http://localhost:4321/api/health` — odpowiedź 200 z `hasSupabase: true` (bo `.dev.vars` wgrany w Fazie 2.1 wskazuje na lokalny stack).

---

## Faza 4 — Supabase Auth URL Configuration (PRZED pierwszym deployem)

Wykonywane **przed** Fazą 5 dzięki chicken-and-egg trickowi: worker URL jest deterministyczny z `wrangler.jsonc` `name` + workers.dev subdomain (oba znane od Fazy 0.1 + 1.2). Konfiguracja Supabase **przed** deployem znaczy, że pierwszy testowy signup po deployu (Faza 6) od razu wysyła prawidłowy email confirm — bez okna „link wskazuje na localhost".

### 4.1 Supabase Dashboard → Authentication → URL Configuration
- [ ] **[USER]** Supabase Dashboard → cloud project `tasker-light` → Authentication → URL Configuration:
  - **Site URL**: `https://tasker-light.<subdomain>.workers.dev` (podstaw `<subdomain>` zapisany w 0.1).
  - **Redirect URLs** (Add URL — każdy w osobnej linii):
    1. `https://tasker-light.<subdomain>.workers.dev/auth/confirm-email`
    2. `https://tasker-light.<subdomain>.workers.dev/dashboard`
    3. `https://*-tasker-light.<subdomain>.workers.dev/**` — **wildcard dla Workers Builds preview branches** (format URL preview: `<version-id>-tasker-light.<subdomain>.workers.dev` zgodnie z infrastructure.md §Historia operacyjna; bez wildcard sign-in z preview branch lądowałby na Supabase error page).
  - **Save**.

### 4.2 Auth Providers (Email + Confirm email ON)
Decyzja MVP-week-1: tylko Email provider, OAuth (Google/GitHub) i Magic Link → „Kolejne kroki".
- [ ] **[USER]** Authentication → Providers → Email — `Enable Email provider` **ON**, `Confirm email` **ON** (wymagane dla pełnego smoke flow w Fazie 6).
- [ ] **[USER]** Authentication → Providers → wszystkie pozostałe (Google, GitHub, Magic Link, Phone, OAuth providers) — pozostawić **OFF** w MVP-week-1.
- [ ] **[USER]** Authentication → Email Templates → Confirm signup — opcjonalnie podmień templete na pl-PL (domyślny en-US działa, ale brzydki).

---

## Faza 5 — Pierwszy manualny deploy do produkcji

### 5.1 Build i deploy
- [ ] **[AGENT]** `npm run build`.
- [ ] **[AGENT]** `npx wrangler deploy` — output zawiera URL postaci `https://tasker-light.<subdomain>.workers.dev`. **[AGENT]** weryfikuje, że URL zgadza się z tym zapisanym w Fazie 0.1 i wpisanym do Supabase w 4.1.

### 5.2 Live verification
- [ ] **[AGENT]** W terminalu A: `npx wrangler tail --format json --status error` (live JSON Lines log; pozostaje uruchomione).
- [ ] **[AGENT]** W terminalu B: `curl <worker-url>/api/health` — oczekiwane 200 + `hasSupabase: true`.
- [ ] **[AGENT]** Drugi smoke: `curl -I <worker-url>/` — oczekiwane 200 i nagłówek `cf-ray`.
- [ ] **[AGENT]** Sprawdzenie terminala A — brak logów error podczas powyższych requestów.

**Bramka:** Jeśli `hasSupabase: false` w prod (a `true` lokalnie) → sekrety nie zostały wgrane prawidłowo, wróć do Fazy 2.2 i `npx wrangler secret list` weryfikuje obecność.

---

## Faza 6 — End-to-end smoke (auth flow w prod)

### 6.1 Pełen przepływ signup → confirm → signin
- [ ] **[USER]** W przeglądarce: `https://tasker-light.<subdomain>.workers.dev/auth/signup` → utworzenie konta testowego (Twój roboczy alias lub e-mail jednorazowy) → otrzymanie maila confirm w skrzynce → kliknięcie linku.
- [ ] **[USER]** Link confirm przekierowuje na `https://tasker-light.<subdomain>.workers.dev/auth/confirm-email` (NIE na localhost — bo Site URL ustawione w 4.1) → user zalogowany → redirect na `/dashboard`.
- [ ] **[USER]** Logout (przez `/api/auth/signout`) → ponowny signin → wyświetla dashboard.
- [ ] **[AGENT]** Podczas testów monitoruje `npx wrangler tail` na błędy serwerowe.

**Bramka:** Pełny przepływ działa bez 500/redirect-loop. Jeśli redirect loop na `/dashboard` → sprawdź ciasteczko Supabase w DevTools → Application → Cookies i czy `middleware.ts` widzi usera (log lokalny).

---

## Faza 7 — Cloudflare Workers Builds (CI po stronie CF, auto-deploy na merge do main)

### 7.1 Podpięcie Workers Builds
- [ ] **[USER]** Cloudflare Dashboard → Workers & Pages → `tasker-light` → Settings → Builds → **Connect to Git**.
- [ ] **[USER]** OAuth GitHub: autoryzacja Cloudflare na konto/organizację. Wybór repo: `10xdevs3_project` (lub aktualna nazwa).
- [ ] **[USER]** Konfiguracja:
  - **Production branch**: `main` (zgodne z decyzją 1.4)
  - **Build command**: `npm run build`
  - **Deploy command**: `npx wrangler deploy`
  - **Root directory**: `/` (default)
  - **Build variables**: brak (sekrety są w Workers Secrets, dostępne w runtime).
- [ ] **[USER]** Save & deploy.

### 7.2 Weryfikacja pierwszego CF-build
- [ ] **[USER]** Trywialny commit (np. dopisek w README) → push do `main`.
- [ ] **[USER + AGENT]** Obserwacja Cloudflare Dashboard → Builds: status `Building` → `Deploying` → `Success`. **[AGENT]** równolegle: `npx wrangler deployments list` po ~2 min.
- [ ] **[AGENT]** Po success: `curl <worker-url>/api/health` — 200, znacznik czasowy świeższy niż przed pushem.

### 7.3 Preview deployments (opcjonalnie)
- [ ] **[USER]** W Workers Builds settings: włącz **Preview deployments** dla branch ≠ `main` — każdy PR dostaje preview URL formatu `<version-id>-tasker-light.<subdomain>.workers.dev`. Już wpadają w wildcard z Fazy 4.1.
- [ ] **[USER]** Notatka: TaskerLight = single-user MVP, więc bez Cloudflare Access; dostęp gatuje Supabase Auth wewnątrz aplikacji.

---

## Faza 8 — Bramka decyzyjna Free → Paid

### 8.1 Monitor sygnałów wymuszenia
- [ ] **[AGENT]** Po pierwszych 1–2 sesjach testowych obserwacja `npx wrangler tail` — szukamy:
  - Errors `Exceeded CPU` lub `Script will never generate a response` → CPU za ciasne.
  - Czas odpowiedzi `/api/health` >50 ms (Workers Free ma 10 ms CPU hard cap — łagodne pages OK, ale walidacja Zod + Supabase RPC może przekroczyć).
- [ ] **[AGENT]** Jeśli sygnały występują **lub** rozpoczynamy implementację FR-006 (60 s klasyfikacja AI) → bramka aktywna.

### 8.2 Upgrade do Paid
- [ ] **[USER]** Cloudflare Dashboard → Plans → Workers Paid (5 USD/mc, dodaje 30 s CPU/wywołanie raisable do 5 min, 10k subrequests, 20 mln eventów observability).
- [ ] **[AGENT]** Po upgrade: edycja `wrangler.jsonc` — dopisanie:
  ```jsonc
  "limits": { "cpu_ms": 60000 }
  ```
  (60 s CPU dla synchronicznej klasyfikacji AI z FR-006).
- [ ] **[AGENT]** `npx wrangler deploy` — propagacja limitu.
- [ ] **[AGENT]** Smoke: `curl <worker-url>/api/health` + `npx wrangler tail` — bez regresji.

---

## Kolejne kroki (po pierwszym udanym Workers Builds — nie w tej iteracji, ale w roadmapie)

Nie są wycięte ze scope projektu, tylko świadomie odłożone, by trzymać pierwszy deploy w prostocie:

- [ ] **GHA deploy job** — rozszerzenie `.github/workflows/ci.yml` o krok `wrangler deploy` z `CLOUDFLARE_API_TOKEN` jako repository secret. Decyzja: która ścieżka kanoniczna — Workers Builds (CF-side) czy GHA — by uniknąć dwóch jednoczesnych deployów na ten sam push. Rekomendacja: zostawić Workers Builds jako primary, GHA jako gateowane testami (np. integration) z `wrangler deploy` tylko na release tag.
- [ ] **Zawężony API token Cloudflare** — zastąpienie konta-usera tokenem ograniczonym do `Workers Scripts:Edit` + `Account Workers:Read` dla pojedynczego projektu `tasker-light`, bez DNS, bez billing (infrastructure.md §Granica dostępu do produkcji).
- [ ] **`AI_PROVIDER_API_KEY`** — wraz z implementacją FR-006 w M2: `npx wrangler secret put AI_PROVIDER_API_KEY`.
- [ ] **Audio upload (FR-004 nice-to-have)** — direct upload do Supabase Storage przez presigned URL z klienta (Worker nie procesuje 25 MB body — memory limit 128/256 MB).
- [ ] **Smart Placement** — opt-in `"placement": { "mode": "smart" }` w `wrangler.jsonc` jeśli scope rozszerzy się poza single-user PL.
- [ ] **Health endpoint v2** — `auth.getSession()` z timeoutem 2 s zamiast samego `hasSupabase` flag (faktyczne sprawdzenie połączenia do Supabase).
- [ ] **OAuth providers** (Google/GitHub) — Authentication → Providers w Supabase + Client ID/Secret z konsoli providera (PRD Open Question 1 wymaga decyzji).
- [ ] **Domena custom** — Cloudflare Workers → Triggers → Custom Domains (gdy MVP wychodzi z workers.dev URL).

---

## Commit cadence (po każdej Fazie zakończonej sukcesem)

Po pomyślnym ukończeniu każdej Fazy, w której zmieniły się pliki repo, **[AGENT]** proponuje commit message i **czeka na `filutek`** od **[USER]**. Bez `filutek` nie ma commit. Cadence:

| Faza | Commit? | Proponowana wiadomość |
|---|---|---|
| 0 (całość) | Nie | Zewnętrzne systemy (Cloudflare, Supabase, Docker) — brak zmian w repo. |
| 1.1 | Tak | `chore(deps): bump @astrojs/cloudflare to ~13.6.0 (fix peer-dep #16029)` |
| 1.2 | Tak | `chore(wrangler): rename worker to tasker-light` |
| 1.4 | Tak | `ci: switch workflow trigger from master to main` |
| 1.5 | Tak | `db: add supabase init migration placeholder + cloud push` |
| 2 | Nie | Sekrety (`.dev.vars` gitignored, Workers Secrets w CF). |
| 3 | Tak | `feat(api): add /api/health endpoint for deploy verification` |
| 4 (całość) | Nie | Konfiguracja Supabase Dashboard — brak zmian w repo. |
| 5 (deploy) | Nie | Artefakt deploya, nie repo. |
| 6 (smoke) | Nie | Testy obserwacyjne. |
| 7 (Workers Builds) | Nie | Konfiguracja w CF Dashboard. |
| 8 (po Paid upgrade) | Tak | `chore(wrangler): add cpu_ms 60000 limit for AI classification` |

**Łącznie ~6 commitów** (1.1, 1.2, 1.4, 1.5, 3, 8). Granularny rollback przez `git revert <hash>` jest możliwy dla każdego z nich osobno.

---

## Rollback / recovery — co zrobić, jeśli krok się nie powiedzie

Per-Faza ścieżka cofnięcia. Sekcja **referencyjna** — używać tylko, gdy weryfikacja danej Fazy nie przejdzie i trzeba czyszczenie przed retry.

### Faza 0 (środowisko)
- Brak rollback w repo. Wszystko w zewnętrznych systemach + lokalna instalacja.
- **Docker daemon nie startuje** → restart Docker Desktop; w skrajności `wsl --shutdown` (Windows) i ponowne uruchomienie.
- **`supabase start` zawiesza się** → `npx supabase stop --no-backup` + ponowne `start`.

### Faza 1 (konfiguracja repo + migracja)
- **1.1 adapter bump zepsuł build** → `git checkout package.json package-lock.json` + `npm install` (przywraca `^13.5.0`).
- **1.2 wrangler.jsonc rename** → `git checkout wrangler.jsonc`.
- **1.4 ci.yml branch** → `git checkout .github/workflows/ci.yml`.
- **1.5 migracja zepsuła cloud** → **NIE ma automatycznego rollback** z `supabase db push`. Recovery manualne: Supabase Dashboard → SQL Editor → odwróć SQL z migracji (na MVP migracja jest pustym placeholderem z komentarzami → reverse trywialny). Lokalnie: `npx supabase db reset` (idempotentnie przywraca stan migracji).

### Faza 2 (sekrety)
- **2.1 .dev.vars** → `Remove-Item .dev.vars` (PowerShell), plik gitignored, zero wpływu na repo.
- **2.2 Workers Secrets** → `npx wrangler secret delete SUPABASE_URL` + `npx wrangler secret delete SUPABASE_KEY`. Re-wgrywka przez `wrangler secret put`.

### Faza 3 (health endpoint)
- Jeśli commit nie wykonany → `Remove-Item src/pages/api/health.ts`.
- Jeśli commit wykonany → `git revert <hash>`.

### Faza 4 (Supabase Auth URL)
- Supabase Dashboard → Authentication → URL Configuration → ręczna edycja:
  - Site URL → reset do default (puste lub `http://localhost:3000`).
  - Redirect URLs → usunięcie wpisów z workers.dev przez „Remove" obok każdego.

### Faza 5 (pierwszy deploy)
- **Zła wersja w prod** → `npx wrangler rollback --message "<reason>"` cofa do poprzedniej wersji w ~5 s.
- **Worker całkiem zły** → `npx wrangler delete` (lub Cloudflare Dashboard → Workers & Pages → tasker-light → Delete) — destrukcyjne, **tylko user-side**.

### Faza 6 (smoke)
- Brak rollback — testy obserwacyjne. Recovery przez naprawienie konfiguracji w Fazach 2, 4 lub 5 i ponowny smoke.

### Faza 7 (Workers Builds)
- Cloudflare Dashboard → Workers & Pages → tasker-light → Settings → Builds → **Disconnect from Git**. Auto-deploy zatrzymany; manualny `wrangler deploy` nadal działa.

### Faza 8 (Free → Paid)
- Cloudflare Dashboard → Plans → downgrade do Free (manualnie, **tylko user-side**).
- `git checkout wrangler.jsonc` cofa `[limits]`.
- Uwaga: downgrade z Paid może wymagać oczekiwania do końca okresu rozliczeniowego.

---

## Krytyczne pliki do modyfikacji w tym planie

| Plik | Rola w planie | Typ zmiany |
|---|---|---|
| `package.json` | Bump adapter `^13.5.0` → `~13.6.0` (Faza 1.1) | Edit |
| `wrangler.jsonc` | Nazwa Workera + (w Fazie 8) `[limits]` | Edit |
| `src/pages/api/health.ts` | Health endpoint (Faza 3) | Create |
| `.dev.vars` | Sekrety lokalne z lokalnego Supabase stacku (Faza 2.1) | Create (gitignored, paste z `supabase status`) |
| `.github/workflows/ci.yml` | Branch `master` → `main` (Faza 1.4) | Edit |
| `supabase/config.toml` | Inicjalizacja lokalnego stacku (Faza 0.3.B) | Create (przez `supabase init`) |
| `supabase/migrations/<ts>_init.sql` | Placeholder migracja (Faza 1.5) | Create (przez `supabase migration new`) |
| `context/deployment/deploy-plan.md` | Artefakt audytowy „co miało się wydarzyć" (per CLAUDE.md §Ścieżki podstawowe) | Create (po wyjściu z Plan Mode kopia tego planu) |

**Pliki, których NIE dotykamy w tym planie:**
- `src/lib/supabase.ts` — early-return `null` przy braku sekretów jest poprawny, health endpoint wykorzystuje ten sam wzorzec.
- `src/middleware.ts` — `PROTECTED_ROUTES = ["/dashboard"]` zostaje bez zmian.
- `astro.config.mjs` — env schema z `optional: true` jest celowo „miękki", by build w CI bez sekretów przeszedł.

---

## Weryfikacja end-to-end (po wykonaniu Faz 0–7)

1. **Local dev przeciw lokalnemu Supabase**: `npm run dev` + przeglądarka `http://localhost:4321/auth/signup` → flow działa lokalnie (mail confirm w Supabase Studio `http://127.0.0.1:54323` → Authentication → Users → kliknięcie magic link).
2. **Prod health**: `curl https://tasker-light.<subdomain>.workers.dev/api/health` → `{ "ok": true, "hasSupabase": true, "runtime": "workerd", ... }`.
3. **Prod auth flow** (Faza 6): signup z prawdziwym mailem → confirm-email link kieruje na **prod URL** (nie localhost!) → signin → dashboard. Bez 500, bez redirect loop.
4. **CI auto-deploy** (Faza 7): trywialny commit do `main` → push → Cloudflare Dashboard pokazuje build success w <3 min → `curl /api/health` zwraca nowszy `checkedAt`.
5. **Preview deploy** (jeśli włączone): push branch ≠ main → preview URL z formatem `<id>-tasker-light.<subdomain>.workers.dev` → sign-in działa dzięki wildcardowi z 4.1.
6. **Rollback drill (sucha próba)**: `npx wrangler deployments list` pokazuje historię; `npx wrangler rollback --message "drill"` cofa do poprzedniej wersji w ~5 s. Nie wykonujemy na żywo — weryfikacja przez `--help`.
7. **Logs sanity**: `npx wrangler tail --format json --status error` przez 5 min podczas testów — brak nieobsłużonych errorów.
8. **Migration round-trip**: edycja `supabase/migrations/<ts>_init.sql` → `npx supabase db reset` (lokalnie OK) → `npx supabase db push` (cloud OK) → `npx supabase db diff` zwraca brak różnic.

**Definicja „done" tego planu:** punkty 1–4 zaznaczone, punkt 5 zaliczony jeśli włączysz preview, punkty 6–8 zweryfikowane.
