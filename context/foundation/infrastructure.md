---
project: TaskerLight
researched_at: 2026-06-02
recommended_platform: Cloudflare Workers
runner_up: Render
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6
  runtime: Cloudflare workerd (adapter @astrojs/cloudflare v13.6.0+)
---

## Rekomendacja

**Wdróż na Cloudflare Workers.** Jest natywnym targetem aktualnie zainstalowanego adaptera `@astrojs/cloudflare` v13.6.0 (zero refactoru stosu), zalicza 4 z 5 kryteriów agent-friendly (CLI-first przez wrangler, managed/serverless, llms.txt + agent-readable docs, stable scriptable deploy API), a 60s synchroniczna klasyfikacja (FR-006) mieści się w Paid plan ($5/mo) gdzie wall-clock nie ma twardego limitu. Drugie miejsce dla Render — najdojrzalsze MCP (GA) i dedykowana strona „Coding Agents", ale wymaga swapu adaptera na `@astrojs/node` i $7/mo Starter.

## Decyzja techniczna: Workers (nie Pages)

`@astrojs/cloudflare` v13 (zainstalowany w `package.json` projektu) celuje **wyłącznie w Cloudflare Workers** — target Pages został usunięty z adaptera. Workers Static Assets osiągnęło w 2026 pełną parytetowość z Pages (static + SSR + custom domains), a Pages pozostaje w trybie maintenance-only po stronie adaptera (brak nowych funkcji, brak wymuszonego terminu wyłączenia). W `wrangler.jsonc` projektu już znajduje się konfiguracja Workers Static Assets (`assets` binding + `main: "@astrojs/cloudflare/entrypoints/server"`); kontrakt `tech-stack.md` został w tej samej sesji zsynchronizowany na `deployment_target: cloudflare-workers`.

**Konsekwencja praktyczna:** stosuj komendy `wrangler deploy` / `wrangler tail` / `wrangler rollback`, **nie** `wrangler pages deploy` / `wrangler pages dev`. Dokumentacja Cloudflare Pages nadal jest online, ale dla tego stosu jest nieaktualna — agenci czytający docs muszą wiedzieć, że target to Workers, nie Pages.

## Porównanie platform

| Platforma | CLI-first | Managed/Serverless | Docs agent-readable | Stable deploy API | MCP integration | Razem | Notatka |
|---|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Partial | 4P+1Pa | Wrangler dojrzały, llms.txt + content-negotiation `Accept: text/markdown`, 17 MCP serwerów ale bez GA labelek |
| Render | Pass | Partial | Pass | Pass | Pass | 4P+1Pa | Kontenerowy (Partial managed), GA MCP od Aug 2025, dedykowana strona „Using Render with Coding Agents", llms.txt |
| Vercel | Pass | Pass | Pass | Pass | Partial | 4P+1Pa | CLI najdojrzalszy, Vercel MCP Public Beta (OAuth), Pro $20/mo bo Hobby = non-commercial |
| Railway | Pass | Partial | Pass | Pass | Partial | 3P+2Pa | Kontener, llms.txt + docs.railway.com/*.md, Railway MCP "WIP", Amsterdam EU |
| Fly.io | Pass | Partial | Partial | Pass | Partial | 2P+3Pa | Pełna kontrola przez Dockerfile, brak llms.txt, `fly mcp` experimental, FRA |
| ~~Netlify~~ | — | — | — | — | — | hard-fail | Sync Functions cap 10s/26s — łamie FR-006 (60s timeout). Background Functions async = łamią UX kontrakt |

### Platformy na krótkiej liście

#### 1. Cloudflare Workers (zalecana)

Adapter `@astrojs/cloudflare` v13.6.0 dostarcza dev=prod parity przez `@cloudflare/vite-plugin` (workerd uruchamia się w `npm run dev` — `wrangler dev` nie jest już potrzebny dla rutyny). Paid plan $5/mo daje 30s CPU (raisable do 5min) i **brak limitu wall-clock** podczas oczekiwania na subrequest — 60s synchroniczna klasyfikacja BYOK fitnie naturalnie. Cold start <5ms (V8 isolate). Dokumentacja: `llms.txt` + `llms-full.txt` per produkt + `Accept: text/markdown`. Wrangler CLI w pełni skryptowalny: deploy, rollback, tail logs (JSON), secrets (stdin pipe), versions list.

#### 2. Render

Persistent Web Service eliminuje cały temat timeoutów (60s sync = trywialnie). Najdojrzalsze tooling dla agentów: GA MCP server od sierpnia 2025 (20+ narzędzi: Services/Deploys/Logs/Metrics/Postgres/KV) plus dedykowana strona docs `Using Render with Coding Agents`. Frankfurt GA dla regionu EU. Cena: $7/mo Starter (Free ma 30-60s cold spin-up po 15min idle — łamie UX submit→60s AI→done). Wymaga swap adaptera Astro na `@astrojs/node` (standalone) + aktualizacja `tech-stack.md`.

#### 3. Vercel

Najwyższe timeouty (Hobby 300s, Pro 800s pod Fluid Compute) i najdojrzalszy CLI. Vercel MCP w Public Beta od sierpnia 2025 (OAuth, Claude/ChatGPT/Cursor). Blokery: Hobby plan ma klauzulę **non-commercial only** — projekt kursowy TaskerLight technicznie podpada → Pro $20/mo. Hard 4.5MB body cap na funkcjach blokuje 25MB upload audio bezpośrednio — obejście: direct upload do Supabase Storage przez signed URL (workaround standardowy, ale kawałek implementacji). Astro 6 + adapter ma świeży bug #16258 (esbuild parse failure na component script chunks).

## Weryfikacja krzyżowa anty-uprzedzeniowa: Cloudflare Workers

### Adwokat diabła — słabe strony

1. **MCP servers bez GA labelek.** 17 serwerów (Docs / Bindings / Builds / Observability), ale CF nie publikuje statusu GA/beta — przyjmujemy "preview-grade". W razie zmiany API agent traci strukturalną drogę do stanu produkcji. Render w tym samym kryterium ma GA MCP od sierpnia 2025.
2. **Świeży adapter v13 = peer-dep churn.** Astro 6.0.8 + adapter 13.1.3 + `@cloudflare/vite-plugin` 1.30.x crashował (`require_dist is not a function`, GH #16029, fix dopiero w 13.1.4 — marzec 2026). Wzorzec sugeruje, że kolejne minor bumpy 13.x mogą znowu zerwać build.
3. **Adapter v13 usunął target Pages.** `tech-stack.md` deklaruje `deployment_target: cloudflare-pages`, ale aktualny `@astrojs/cloudflare` celuje **wyłącznie w Workers** — Pages w maintenance-only. Kontrakt foundation rozjedzie się z rzeczywistością.
4. **`nodejs_compat` flag wymagany dla Supabase SSR.** `@supabase/ssr` używa `node:buffer`/`node:crypto` → bez flagi w `wrangler.jsonc` build/runtime się sypie z tajemniczym stack trace.
5. **CPU vs wall-clock niejasność limitów.** Paid plan default 30s CPU (raisable do 5min) — 60s sync klasyfikacja jest CPU-light (większość to fetch wait do AI), więc fitnie, ale jeśli Zod walidacja schematu albo prompt parsing zżerze >30s CPU, sesja zerwana. Wymaga jawnego ustawienia `[limits] cpu_ms`.

### Pre-mortem — jak to mogło się nie udać

Sześć miesięcy po wdrożeniu na Cloudflare Workers TaskerLight zaliczał kursowo „warunkowo". Solo deweloper, pod presją deadline 2026-07-05, wziął bootstrapową konfigurację `@astrojs/cloudflare` v13 bez weryfikacji compatibility flags. Pierwszy submit tekstowy w prod 500'ował — okazało się że brakuje `nodejs_compat` w `wrangler.jsonc`; dwa wieczory na debug Supabase SSR cookie handlingu. Po ustabilizowaniu tekstu doszło testowanie audio 25 MB: `wrangler dev` przepuszczał, ale w produkcji Worker memory limit (128 MB Free / 256 MB base Paid) odbijał streaming body przy parsowaniu po stronie serwera. Próba upgrade'u adaptera 13.1.4 → 13.2.0 wniosła kolejny peer-dep mismatch z `@cloudflare/vite-plugin`. Próba pivotu na Render w panice tygodnia 3 — wymagała przepisania adaptera, removal `Astro.locals.runtime` accessów, redeployu sekretów, nowego CI. Deadline minięty o tydzień, autor zniechęcony, dalsza praca na ścieżce 10xDevs porzucona. Główna lekcja: ekosystem Astro 6 + `@astrojs/cloudflare` jest świeży, peer-dep stability nie battle-tested, solo dev w 3-tyg deadline nie ma marży na regressions ekosystemu.

### Nieznane niewiadome

- **Trzy poziomy node-compat** (`nodejs_compat`, `nodejs_compat_v2`, `nodejs_als`). Docs nie zawsze jasno mówi który dla Supabase SSR — zły wybór = silent runtime failures w `async_hooks` przy SSR cookies.
- **Workers automatic tracing billing rusza 2026-01-15** (open beta status). Jeśli włączysz `[observability]` „bo polecane", po fiskalnym miesiącu może wpaść zaskakujący billing tier change.
- **`--legacy-peer-deps` ukrywa peer-dep ostrzeżenia.** Sesja wcześniej zaakceptowała MODERATE-yaml chain w `npm audit fix` (session-handoff §5). Jeśli w przyszłości ktoś użyje `--legacy-peer-deps`, mismatch między adapterem a vite-plugin przejdzie cicho → dev OK, prod broken.
- **Brak `.env` fallback w Workers prod.** Astro `astro:env/server` w prod wymaga `wrangler secret put` ręcznie per environment (preview, prod). Brak sekreta = 500 silent. CF docs nie podkreślają tego dla framework users.
- **Edge region affinity vs Supabase eu-central-1.** Worker odpowiada z najbliższego edge node, ale fetch do Supabase robi cross-Atlantic hop jeśli edge = SJC. p95 latency rośnie dla user-ów spoza PL/EU. Smart Placement (opt-in) heurystyką naprawia, ale niedeterministycznie.

## Historia operacyjna

- **Wdrożenia podglądowe**: każdy push do branch ≠ main → preview przez `wrangler versions upload --tag <branch>`; URL `<version-id>-tasker-light.<account>.workers.dev`. TaskerLight = single-user MVP, więc bez Cloudflare Access — dostęp gatuje Supabase Auth wewnątrz aplikacji. PR'y z forków deploy się nie wykonają (brak sekretów) — akceptowalne.
- **Sekrety**: `SUPABASE_URL` + `SUPABASE_KEY` + przyszły `AI_PROVIDER_API_KEY` w Workers Secrets per environment (`wrangler secret put X --env production`). Lokalnie `.dev.vars` (gitignored). Rotacja: `wrangler secret put` z nowym value; brak versionowania sekretów po stronie CF — trzymaj backup w password manager.
- **Wycofywanie**: `wrangler rollback [version-id] --message "<reason>"` przywraca poprzednią wersję w ~5s. Schema migrations Supabase wycofuje się ręcznie (down migration SQL lub `supabase db reset` lokalnie — nigdy na prod). Audit: `wrangler deployments list`.
- **Zatwierdzanie**: agent autonomicznie: `wrangler deploy`, `wrangler tail`, `wrangler secret list`. Tylko-człowiek: `wrangler secret put` (paste sekreta z password manager), `wrangler delete` (usunięcie projektu — UI tylko), rotacja `AI_PROVIDER_API_KEY`, purge bazy Supabase. Zgodne z lekcją „destruktywne tylko ręcznie".
- **Logi**: `wrangler tail --format json --status error` live JSON Lines, agent-parsable. Workers Observability dashboard ma full-text search (open beta — billing 2026-01-15). CI build logs: GitHub Actions workflow `lint + build` (`.github/workflows/ci.yml`).

## Rejestr ryzyka

| Ryzyko | Źródło | Praw. | Wpływ | Łagodzenie |
|---|---|---|---|---|
| `@astrojs/cloudflare` v13.x peer-dep churn (regression `require_dist is not a function`) | Devil's advocate | Ś | W | `package.json` ma aktualnie caret (`^13.5.0`) — przed pierwszym deployem prod zmień na tilde (`~13.6.0`); `@cloudflare/vite-plugin` w tym samym range; smoke test `npm run build` po każdym dep bump |
| Free plan CPU limit (10 ms/wywołanie) za ciasny dla parsowania odpowiedzi AI + walidacji Zod + zapisu do Supabase | Research finding | W | Ś | Przed pierwszym realnym użyciem przejście na Workers Paid (5 USD/mc); na Free testować tylko ścieżki bez klasyfikacji lub z bardzo małymi wsadami |
| CPU limit 30s default na Paid blokuje 60s sync klasyfikacji przy dużych wsadach | Devil's advocate | N | Ś | Ustaw `"limits": { "cpu_ms": 60000 }` w `wrangler.jsonc` przed pierwszym deployem prod; monitor `wrangler tail` na pierwszej sesji testowej |
| `wrangler.jsonc` ma `name: "10x-astro-starter"` ze startera — pomyłka przy deploy do złego projektu CF | Research finding | Ś | N | Podmień na `"name": "tasker-light"` w ramach pierwszego deploya |
| Pre-mortem: panic-pivot na inną platformę w tyg. 3 minie deadline | Pre-mortem | N | W | Bramka decyzyjna w tyg. 1: jeśli ≥2 dni stracone na adapter peer-deps → pivot na Render natychmiast (nie pod koniec deadline). Buffer 3 dni rezerwy. |
| MCP servers "preview-grade" — API może się zmienić | Devil's advocate | Ś | N | Polegaj na `wrangler` CLI (GA) dla MVP; MCP ewaluacja po m1l5 |
| Workers Tracing (GA od 2026-01-15) z `observability.enabled: true` w starterze — billing na Paid | Research finding | N | N | Paid (5 USD/mc) zawiera 20 mln eventów/mc; TaskerLight przy <100 req/dzień generuje ~30k eventów/mc = ułamek procenta limitu; zostaw włączone, monitor dashboard po pierwszym miesiącu |
| `--legacy-peer-deps` ukrywa peer-dep mismatch | Unknown unknowns | Ś | Ś | Nie używać `--legacy-peer-deps` w CI; `npm ci` z lockfile |
| Brak `.env` fallback w prod = brakujący sekret to 500 silent | Unknown unknowns | N | Ś | Health-check endpoint `/api/health` czyta sekrety przez `astro:env/server`; README checklist `wrangler secret put` przed pierwszym deploy |
| Edge↔Supabase cross-region latency dla user-ów spoza PL | Unknown unknowns | N | N | Single-user MVP w PL — nieaktualne; w razie scope-up: `[placement] mode = "smart"` |
| Worker memory limit 128/256MB dla 25MB audio body parsing | Pre-mortem / Research finding | Ś | Ś | Audio upload bezpośrednio do Supabase Storage z presigned URL (Worker nie procesuje body); FR-004 to nice-to-have, w MVP audio może być pominięte |

> **Rozwiązane w tej sesji** (nie ma już w aktywnym rejestrze): (a) `tech-stack.md` rozjazd `cloudflare-pages` vs adapter v13 — zsynchronizowany na `cloudflare-workers` 2026-06-02; (b) brak `nodejs_compat` flag — bootstrap dostarczył w `wrangler.jsonc`; (c) brak `compatibility_date` — bootstrap ustawił `2026-05-08` (`nodejs_compat` aktywuje v2 semantics dla dat ≥ 2024-09-23, więc obsługa `async_hooks` dla Supabase SSR jest pokryta).

## Rozpoczęcie pracy

1. **Zweryfikuj wersje adaptera w `package.json`**: `@astrojs/cloudflare ≥ 13.6.0` (Astro 6 support + fix peer-dep #16029). Aktualnie w repo: `^13.5.0` (caret) — rozważ pin tilde (`~13.6.0`) przed pierwszym deployem prod, żeby ograniczyć ryzyko minor-bump regressions.
2. **Zweryfikuj `wrangler.jsonc` w root** (bootstrap dostarczył już większość konfiguracji):
   - **Już jest**: `compatibility_date: "2026-05-08"`, `compatibility_flags: ["nodejs_compat"]`, `assets` binding (Workers Static Assets), `observability: { enabled: true }`, `main: "@astrojs/cloudflare/entrypoints/server"`.
   - **Do dodania przed pierwszym deployem prod**: `"limits": { "cpu_ms": 60000 }` (dla 60s sync klasyfikacji — Paid default to 30s CPU, raisable do 5 min).
   - **Do podmiany przed pierwszym deployem**: `"name": "10x-astro-starter"` → `"name": "tasker-light"`.
3. **Wybierz plan Workers**: na czas pierwszych testów MVP Free wystarczy (200k logów/dzień w cenie), ale **przed pierwszym realnym użyciem** przejdź na **Workers Paid (5 USD/mc)** — Free ma 10 ms CPU per invocation, co przy parsowaniu odpowiedzi AI + walidacji Zod + zapisie do Supabase może być za ciasne. Paid: 30s CPU (raisable do 5 min) + 10k subrequests + 20 mln eventów observability w cenie.
4. **Załoguj wrangler**: `npx wrangler login` (otwiera browser; user akceptuje OAuth). Następnie utwórz API token ograniczony do Workers dla projektu `tasker-light` (bez DNS, bez billing — zgodnie z lekcją „tokeny są ograniczone, nie klucze główne").
5. **Wgraj sekrety**: `npx wrangler secret put SUPABASE_URL`, `npx wrangler secret put SUPABASE_KEY` (paste-input z password manager). Te same wartości lokalnie w `.dev.vars` (już gitignored).
6. **Deploy + verify**: `npm run build` + `npx wrangler deploy`. Sanity check: `npx wrangler tail --format json` w jednym terminalu + curl produkcyjnego `/api/health` (do utworzenia) w drugim.

> Note ze stosu: w adapterze v13 + `@cloudflare/vite-plugin` **`npm run dev` już uruchamia workerd lokalnie** — `wrangler dev` nie jest potrzebny dla rutynowej pracy. `wrangler pages dev` / `wrangler pages deploy` są **dla tego stosu nieaplikowalne** (Pages target usunięty z adaptera v13).

## Poza zakresem

- Konfiguracja obrazu Docker (Workers = workerd runtime, nie kontenery)
- Konfiguracja potoku CI/CD dla deploy (`.github/workflows/ci.yml` z `/10x-bootstrapper` pokrywa lint+build; deploy workflow do CF dodaje się w późniejszej lekcji)
- Architektura na skalę produkcyjną (multi-region failover, SLA, dedicated support)
