---
date: 2026-07-19T23:14:39+02:00
researcher: Jakub
git_commit: 49db86301ed6ea16522cbdfcca4075dacb7f615e
branch: main
repository: qbarium/10xdevs3_project
topic: "Faza 5 planu testów — testy jako wymagana bramka CI + obserwacja dużego wsadu na Workers"
tags: [research, codebase, ci, vitest-integration, supabase, cloudflare-workers, risk-3]
status: complete
last_updated: 2026-07-19
last_updated_by: Jakub
---

# Research: Faza 5 — bramki CI + obserwacja dużego wsadu na Workers

**Date**: 2026-07-19T23:14:39+02:00
**Researcher**: Jakub
**Git Commit**: 49db86301ed6ea16522cbdfcca4075dacb7f615e (`main`, wypchnięty)
**Repository**: qbarium/10xdevs3_project

## Research Question

Faza 5 planu testów (`context/foundation/test-plan.md` §3, wiersz 5): „Testy jako wymagana
bramka CI; realne zachowanie dużego wsadu na Workers". Zamiar zmiany: **podłączyć
unit+integration do CI jako wymaganą bramkę i sprawdzić zachowanie granicznego wsadu
(≤100 itemów / ≤100 000 znaków) na Cloudflare Workers** (runtime część ryzyka #3).

Dwie decyzje o zakresie badania (użytkownik, 2026-07-19): (1) integracja w CI — **zbadaj
obie ścieżki i porównaj koszt**; (2) obserwacja Workers — **kod + gotowy przepis obserwacji**.
Docker i Supabase CLI są zainstalowane lokalnie.

## Summary

**Najważniejsze ustalenie: połowa „bramkowania" już istnieje.** `.github/workflows/ci.yml:25`
ma krok `npm run test` (unit) w jobie `ci`, a `ci` jest **wymaganym** status-checkiem
branch protection na `main`. Czyli testy jednostkowe **już blokują merge**. Dodano to w
F-01 (`byok-secret-security`, commit `11eb8cf`, 2026-06-07), zanim powstał plan testów.
Notatka w `test-plan.md` §5 („dziś CI uruchamia tylko lint + build") jest **nieaktualna**.

Realny zakres Fazy 5 zawęża się więc do trzech rzeczy:

1. **Testy integracyjne w CI** — dziś ich nie ma. Wymagają pełnego stacku Supabase
   (auth GoTrue + RLS + Storage), więc jedyna sensowna ścieżka to `npx supabase start`
   w GitHub Actions. Wariant „sam Postgres" **odpada** — testy budowane wokół `signUp`
   i RLS `authenticated` bez GoTrue nie zadziałają.
2. **Luka typecheck w CI** — pełny `tsc --noEmit` żyje tylko w pre-commit (husky).
   Błąd typów niełapany przez reguły type-aware eslint przejdzie dziś przez CI.
   (Poza literalnym zakresem fazy, ale to bramka jakości — decyzja przy planie.)
3. **Obserwacja dużego wsadu na Workers** — runtime część ryzyka #3, odłożona ze
   wszystkich Faz 1–4. To **nie test**, lecz ręczny pomiar na deployu (`wrangler tail`
   + `/api/health` + stan DB). Odkryto przy okazji **realną lukę**: przy ubiciu Workera
   limitem CPU sesja może utknąć w statusie `processing` (nie `failed`) i wtedy nie da
   się jej ponowić.

## Detailed Findings

### A. Obecny stan bramek CI

Jeden job `ci` (`ubuntu-latest`), triggery push+PR do `main`. Kroki (wszystkie bramkują):

| Krok | Linia | Rola |
|---|---|---|
| `npm ci` | ci.yml:18 | instalacja / rozjazd lockfile |
| `npx astro sync` | ci.yml:19 | generacja typów Astro — **nie** typecheck |
| `npm run lint` (`eslint .`) | ci.yml:20 | lint z regułami **type-aware** |
| `npm run build` (`astro build`) | ci.yml:21-24 | build; env `SUPABASE_URL/KEY` z secrets |
| `npm run test` (`vitest run`) | ci.yml:25 | **bramka testów jednostkowych** |

Branch protection na `main` (`gh api .../branches/main/protection`):
`required_status_checks.contexts=["ci"]`, `strict:false`, `enforce_admins.enabled=true`,
PR wymagany z `required_approving_review_count=0`, `allow_force_pushes:false`,
`allow_deletions:false`. Auto-merge wyłączony (`allow_auto_merge:false`). Zielony `ci` =
przeszedł też `npm run test`.

**Luka typecheck:** nic w CI nie odpala `tsc --noEmit` ani `astro check`. `astro build`
domyślnie NIE robi `astro check` (choć `@astrojs/check` jest w zależnościach). `eslint`
z `strictTypeChecked` (eslint.config.js:15) łapie tylko podzbiór błędów typów. Pełny
`tsc --noEmit` istnieje wyłącznie w `.husky/pre-commit` — czyli commit z `--no-verify`
lub edycja przez web UI wniosłaby błąd typów na `main` bez sygnału z CI.

### B. Testy integracyjne — wymagania i ścieżki w CI

**Konfiguracja** (`vitest.integration.config.ts`): env `node`, `include ["**/*.integration.test.ts"]`,
`env: loadEnv("test", cwd, "")` (ładuje `.env.test*`), `testTimeout/hookTimeout: 30000`,
**brak `setupFiles`**. Komentarz autora wprost: „NIE uruchamiane w CI (brak DB)". Skrypt
`test:integration` (package.json:17) NIE stawia Supabase.

**9 plików** w `tests/integration/`, identyczny skopiowany wzorzec (brak wspólnego helpera,
brak `setup.ts`):
- Czytają `process.env.SUPABASE_TEST_URL` + `SUPABASE_TEST_ANON_KEY` (**tylko anon**,
  nigdzie service-role).
- Bramka `ready = Boolean(URL && ANON)` → bez env cały plik `describe.skip` (**zielony,
  ale nieuruchomiony** — dlatego dziś w CI się nie czerwienią).
- `signUpClient(tag)`: `auth.signUp` z unikalnym mailem per przebieg; **twardo zależy od
  `enable_confirmations=false`** (inaczej rzuca w `beforeAll`).
- Zależą od: pełnego łańcucha **8 migracji**, **GoTrue (auth)**, **Storage** (2 testy:
  `storage-rls`, `file-upload`), RPC `persist_classification`. `seed.sql` — **nie istnieje
  i nie jest potrzebny** (testy tworzą własne dane).

**Pułapka nazewnicza:** testy używają `SUPABASE_TEST_URL/SUPABASE_TEST_ANON_KEY`, a
aplikacja i build-CI używają `SUPABASE_URL/SUPABASE_KEY` (ci.yml:23-24). W CI trzeba
ustawić właśnie te z prefiksem `TEST`. Lokalny anon key to znany, deterministyczny
demo-JWT (`iss:"supabase-demo", role:"anon"`) — nie sekret produkcyjny.

**Ścieżka (a) — `npx supabase start` (pełny stack):** `supabase` jest już devDependency,
więc `npx supabase start` bez instalacji globalnej stawia w Dockerze cały stack i sam
nakłada migracje. Env do testów najlepiej z `supabase status -o env` (odporne na przyszłą
zmianę generowania kluczy w CLI 2.x) → zmapować na `SUPABASE_TEST_*`. Koszt: ~1–3 min
bootu (pull obrazów; skracalne cache'em Dockera). Sekrety: **żadne**. Pokrycie: **100%**
(auth + RLS + Storage + RPC).

**Ścieżka (b) — sam Postgres + migracje:** ~kilkanaście s startu, ale **niewystarczające** —
bez GoTrue `signUp` nie ma do czego uderzyć (FK do `auth.users` pękają, RLS `authenticated`
odfiltrowuje wszystko), a bez Storage dwa testy twardo failują. Odtwarzanie GoTrue+Storage
ręcznie jako osobne `services` jest kruche i w praktyce gorsze niż (a).

**Wniosek faktograficzny (bez przesądzania decyzji):** jeśli integracja ma realnie chodzić
w CI, jedyną drogą z prawdziwym pokryciem jest **(a)**.

### C. Runtime dużego wsadu (ryzyko #3) + obserwacja

**Limity w kodzie:**
- Safety-net 100 itemów (FR-020): `MAX_ITEMS=100` w `src/lib/ai/classify-core.ts:23`,
  sprawdzenie :67-71 → `failSession("too_many_items")` → **422** (jedyny twardy nie-200;
  reszta stanów failed idzie 200). Świadomie **nie** w zod (schema.ts:20). Granica dokładnie
  100 (test: 100 przechodzi, 101 failuje).
- Limit wejścia: `INPUT_MAX_CHARS=100_000` w `src/lib/text/sanitize.ts:8`, egzekwowany dla
  paste w `classify.ts:80`. Plik: limit 300 KB rozmiaru (`file-upload.ts:15`), nie znaków.
- Timeout 60 s: `AI_REQUEST_TIMEOUT_MS=60_000` (`src/lib/config/ai.ts:18`), AbortController
  w `classify-core.ts:60-63` na fetchu klasyfikatora. To **wall-clock fetch-wait, NIE CPU** —
  na Workers oczekiwanie na subrequest nie liczy się do CPU.

**Zachowanie wsadu przy błędzie — utrwalany PRZED klasyfikacją:**
- Paste: `createSession(supabase, user.id, rawText)` (`classify.ts:147`) zapisuje sesję
  `processing` z pełnym `raw_input` zanim ruszy `runClassification`.
- Plik: `createSession(..., null)` + upload do Storage (`classify.ts:109-115`).
- Crash w trakcie klasyfikacji **nie gubi wejścia** — sesja i treść już w DB/Storage.
- Stany: `completed_with_items` (atomowe RPC `persist_classification`), `completed_no_items`
  (0 itemów = poprawny wynik, nie błąd), `failed` (→ HTTP 200 z `status:"failed"`).

**⚠️ Luka istotna dla ryzyka #3:** `failSession` z bloku `catch` (`classify-core.ts:78-86`)
odpala się tylko, jeśli JS wróci z `classify()`. Jeśli **Worker zostanie ubity limitem CPU**
w trakcie `JSON.parse` + zod (`classifier.ts:96-108`), `catch`/`finally` się nie wykona →
sesja zostaje w **`processing`** (nie `failed`). Retry (`retry.ts:54`) ponawia tylko `failed`
→ taka sesja utyka bez normalnej ścieżki ponowienia. Wsad zachowany, ale status zawieszony.
**To trzeba zaobserwować empirycznie.**

**Limity CPU Workers:** `wrangler.jsonc` **nie ma** bloku `limits`/`cpu_ms`; Faza 8
(Free→Paid) w deploy-plan jest niezaznaczona → produkcja prawdopodobnie na **Free (~10 ms
CPU)**. Po przekroczeniu CPU workerd ubija izolat → użytkownik dostaje **5xx / zerwane
połączenie** (nie czysty `failed`). Profil CPU dużego wsadu to głównie `JSON.parse` dużej
odpowiedzi + zod na 100 obiektach + `JSON.stringify` do RPC — na Free realne ryzyko
przekroczenia.

**Przepis obserwacji (patrz „Observation recipe" niżej).**

### D. Kontekst historyczny

- Wszystkie Fazy 1–4 **świadomie** odłożyły bramkę CI i runtime #3 do Fazy 5
  (cytaty w „Historical Context").
- Branch protection na `main` włączone 2026-06-05 (deploy-plan §7.4).
- `npm run test` dodano do CI w F-01 (2026-06-07, commit `11eb8cf`) — stąd unit-gate
  istnieje mimo że test-plan tego nie odnotował.
- S-02 (`first-gated-generation`): decyzje o safety-net 100 i timeout 60 s; Workers Free,
  upgrade do Paid tylko jeśli prod realnie utnie na CPU (deploy-plan Faza 8). Naprawa F4:
  `OPENAI_MAX_TOKENS` 8000→16000, by duży (poprawny) wsad nie był obcinany i mylnie
  raportowany jako `failed`.
- Guard 413 na `Content-Length` działa tylko w runtime Workers, bez unit-testu (syntetyczny
  `Request` w vitest nie niesie `Content-Length`) — kandydat do obserwacji w Fazie 5.

## Code References

Permalinki na commit `49db863`:

- [`.github/workflows/ci.yml#L25`](https://github.com/qbarium/10xdevs3_project/blob/49db86301ed6ea16522cbdfcca4075dacb7f615e/.github/workflows/ci.yml#L25) — `npm run test` już w CI (unit-gate)
- [`package.json#L16-L17`](https://github.com/qbarium/10xdevs3_project/blob/49db86301ed6ea16522cbdfcca4075dacb7f615e/package.json#L16-L17) — `test` vs `test:integration`
- [`vitest.integration.config.ts`](https://github.com/qbarium/10xdevs3_project/blob/49db86301ed6ea16522cbdfcca4075dacb7f615e/vitest.integration.config.ts) — brak setupFiles, „NIE w CI"
- [`.husky/pre-commit`](https://github.com/qbarium/10xdevs3_project/blob/49db86301ed6ea16522cbdfcca4075dacb7f615e/.husky/pre-commit) — jedyne miejsce `tsc --noEmit`
- [`src/lib/ai/classify-core.ts#L23`](https://github.com/qbarium/10xdevs3_project/blob/49db86301ed6ea16522cbdfcca4075dacb7f615e/src/lib/ai/classify-core.ts#L23) — `MAX_ITEMS=100`
- [`src/lib/ai/classify-core.ts#L60-L86`](https://github.com/qbarium/10xdevs3_project/blob/49db86301ed6ea16522cbdfcca4075dacb7f615e/src/lib/ai/classify-core.ts#L60-L86) — AbortController + catch→failSession (luka `processing`)
- [`src/lib/config/ai.ts#L18`](https://github.com/qbarium/10xdevs3_project/blob/49db86301ed6ea16522cbdfcca4075dacb7f615e/src/lib/config/ai.ts#L18) — `AI_REQUEST_TIMEOUT_MS=60_000`
- [`src/lib/text/sanitize.ts#L8`](https://github.com/qbarium/10xdevs3_project/blob/49db86301ed6ea16522cbdfcca4075dacb7f615e/src/lib/text/sanitize.ts#L8) — `INPUT_MAX_CHARS=100_000`
- [`src/pages/api/ingest/classify.ts#L147`](https://github.com/qbarium/10xdevs3_project/blob/49db86301ed6ea16522cbdfcca4075dacb7f615e/src/pages/api/ingest/classify.ts#L147) — sesja+`raw_input` zapisane przed klasyfikacją
- [`src/pages/api/import-sessions/retry.ts#L54`](https://github.com/qbarium/10xdevs3_project/blob/49db86301ed6ea16522cbdfcca4075dacb7f615e/src/pages/api/import-sessions/retry.ts#L54) — retry tylko dla `failed`
- [`src/pages/api/health.ts`](https://github.com/qbarium/10xdevs3_project/blob/49db86301ed6ea16522cbdfcca4075dacb7f615e/src/pages/api/health.ts) — `hasSupabase`/`hasKek`/`runtime`
- [`wrangler.jsonc`](https://github.com/qbarium/10xdevs3_project/blob/49db86301ed6ea16522cbdfcca4075dacb7f615e/wrangler.jsonc) — brak `limits.cpu_ms`; `observability.enabled`
- `supabase/config.toml:209` — `enable_confirmations=false` (warunek działania testów integracyjnych)

## Architecture Insights

- **Bramka = kroki w jobie `ci` + branch protection, nie osobny mechanizm.** Dodanie
  integracji to dodanie kroków w tym samym jobie `ci` (który już jest wymagany) — nie
  trzeba nowego wymaganego checku.
- **Testy integracyjne z założenia idą przez prawdziwy auth+RLS+Storage** (nie atrapy) —
  to celowa konwencja z Fazy 2 („cudzy = nieistniejący", sygnał tylko na realnej bazie).
  Dlatego CI musi dać pełny stack Supabase, nie samą bazę.
- **Wsad jest utrwalany przed pracą ubijalną przez CPU** — projekt świadomie zapisuje
  wejście najpierw. Słaby punkt to nie utrata wsadu, lecz **status sesji** przy twardym
  crashu (utyka w `processing`).
- **60 s to fetch-wait, nie CPU** — kluczowe rozróżnienie: Free nie ubija za długie
  oczekiwanie na OpenAI, ubija za długie liczenie (parsowanie/walidacja dużej odpowiedzi).

## Observation recipe (żywy Workers, ryzyko #3 runtime)

1. **Sanity deployu:** `curl https://tasker-light.qbarium.workers.dev/api/health` →
   `hasSupabase:true` **i `hasKek:true`** (bez `hasKek` klasyfikacja → 503).
2. **Stream logów:** `npx wrangler tail --format pretty` (lub `--format json --status error`).
   Sygnatury crashu CPU: `Exceeded CPU`, `Worker exceeded resource limits`,
   `Script will never generate a response`.
3. **Wyślij graniczny wsad** (zalogowany, realny klucz BYOK w profilu) na
   `POST /api/ingest/classify`: (a) ~100 000 znaków, (b) treść prowokująca ~100+ itemów
   (test safety-net 422).
4. **Obserwuj równolegle:** HTTP (`200 completed_*` = czysto; `200 failed code:timeout` =
   AbortController zadziałał; `422 too_many_items` = safety-net; **5xx/zerwane = crash CPU**),
   `wrangler tail` (`classify: ok {durationMs}` / `failed` / `Exceeded CPU`), oraz stan DB
   (Supabase Studio → `import_sessions`: wiersz MUSI istnieć; jeśli po 5xx zostaje
   `processing` → potwierdzona luka).
5. **Retry-sonda:** dla utkniętej sesji `POST /api/import-sessions/retry` → potwierdź, że
   `processing` daje `409 not_retryable`, a tylko `failed` da się ponowić.
6. **Interpretacja:** „bezpiecznie" = wsad zawsze w DB + wynik zawsze czysty stan, nigdy
   5xx-crash. Mierz „czy degraduje czysto", nie „jak szybko". Jeśli Free daje `Exceeded CPU`
   → dowód na Workers Paid + `"limits": { "cpu_ms": 60000 }` (deploy-plan Faza 8).

## Historical Context (from prior changes)

- `context/archive/2026-07-07-testing-security-privacy-invariants/plan.md:63` — „NIE
  podłączamy bramki CI dla testów — to Faza 5 test-planu."
- `context/archive/2026-07-12-testing-per-user-isolation/plan.md:78,297-298` — „NIE dotykamy
  bramki CI (Faza 5)"; procedura lokalnego `npx supabase start` + `.env.test.local`.
- `context/archive/2026-07-12-testing-classifier-contract-session-state/change.md:18` —
  „Runtime'owa część #3 (realne zachowanie Cloudflare Workers pod granicznym wsadem) należy
  do Fazy 5."
- `context/archive/2026-06-07-byok-secret-security/plan.md:105-122,306` — dodanie
  `- run: npm run test` do `ci.yml` (commit `11eb8cf`); „branch protection blokuje merge
  z nieprzechodzącymi testami."
- `context/deployment/deploy-plan.md:238-241` — branch protection na `main` ✓ 2026-06-05
  (`required_status_checks=[ci]`, `enforce_admins=true`).
- `context/deployment/deploy-plan.md:245-263` — Faza 8 Free→Paid: monitor `wrangler tail`
  pod `Exceeded CPU`, upgrade + `cpu_ms:60000`. To wprost „obserwacja dużego wsadu".
- `context/archive/2026-06-10-first-gated-generation/plan.md:62,65` — decyzje safety-net 100
  i timeout 60 s; `reviews/plan-review.md:71-79` — `OPENAI_MAX_TOKENS` 8000→16000.
- `context/foundation/roadmap.md:112` — S-02 Ryzyko: duże wsady mogą przekroczyć 10 ms CPU
  na Free; „bramka wydajności, nie twardy prerekwizyt".

## Related Research

- `context/archive/2026-07-12-testing-per-user-isolation/research.md` — kanoniczny opis
  sprzętu integracyjnego (vitest.integration.config, wzorzec signUpClient).
- `context/archive/2026-06-10-first-gated-generation/plan.md` — pełny kontekst limitów wsadu.

## Open Questions

1. **Rozjazd test-plan ↔ ci.yml:** §5 twierdzi „unit nie w CI", a `ci.yml:25` je ma. Do
   rozstrzygnięcia w planie: zaktualizować §5 + tabelę §5 (część unit „już podłączona").
2. **Typecheck w CI:** czy Faza 5 obejmuje domknięcie luki (dodać `tsc --noEmit` /
   `astro check` do `ci.yml`), czy to osobna zmiana? Literalny zakres fazy to „testy", ale
   §5 planu wymienia „lint + typecheck" jako bramkę.
3. **Integracja w CI — koszt vs wartość:** ~1–3 min bootu Supabase na każdy PR. Czy zawsze,
   czy tylko na wybranym evencie? (b) odpada technicznie.
4. **Luka `processing` przy crashu CPU:** czy Faza 5 tylko ją *obserwuje/dokumentuje*, czy
   od razu utwardza (np. przejście `processing→failed` po stronie retry / watchdog)?
   Utwardzenie to zmiana produktu — prawdopodobnie osobna zmiana, nie ta faza.
5. **Env integracyjne w CI:** odczyt z `supabase status -o env` vs stała demo-key —
   do wyboru w planie (rekomendacja badania: odczyt z CLI, odporniejszy na wersję).
