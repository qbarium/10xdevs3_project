# Rules for AI

This file provides guidance to AI Agent when working with code in this repository.

**Session pickup:** Jeśli istnieje `@docs/local/session-handoff.md`, przeczytaj go PIERWSZY — zawiera pozycję na łańcuchu workflow, preferencje użytkownika i otwarte decyzje z poprzedniej sesji. Bez niego kontynuuj normalnie z reszty tego pliku.

**AGENTS.md follows this file.** `@AGENTS.md` is a downstream mirror of the shared project rules defined in `CLAUDE.md`. When you change a shared rule here, propagate it to `AGENTS.md` in the same turn. The flow is **one-way — `CLAUDE.md` → `AGENTS.md`, never the reverse**.

## Hard rules

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **API routes**: use uppercase `GET`, `POST` exports; validate structured/multi-field input with zod; single scalar fields may use manual validation (trim + reject empty).
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies.
- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.

## GitHub jako synchronizowany stan projektu

GitHub Issues + tablica Projects v2 („TaskerLight", `https://github.com/users/qbarium/projects/3`) są **synchronizowanym** odbiciem stanu projektu — nie poglądowym. Źródłem prawdy pozostają pliki (`context/foundation/roadmap.md`, `context/changes/<id>/` `## Progress`), ale **każda zmiana stanu w tych plikach musi w tej samej turze zostać odzwierciedlona w GitHubie**. Obowiązuje każdego agenta, w tym kodującego.

**To zasada twarda i NIE PODLEGA DYSKUSJI.** Użytkownik śledzi postęp **na żywo na boardzie**, więc board MUSI w każdej chwili wiernie odzwierciedlać roadmapę i stan faz — rozjazd board↔pliki to błąd do **natychmiastowej naprawy w tej samej turze**, nie do odłożenia „na później". Stałe ID pól/opcji/kart Projects v2 + gotowe komendy `gh project item-edit` / sub-issue GraphQL → **`docs/local/github-board-ops.md`** (czytaj PRZED dotknięciem boardu).

Mapowanie kanon ↔ GitHub:

- Element roadmapy F-NN / S-NN → **parent Issue** (etykieta `foundation` lub `slice`; gwiazda przewodnia dodatkowo `north-star`).
- Strumień A–D → **milestone**.
- Status elementu (`proposed`/`ready`/`in-progress`/`in-review`/`blocked`/`done`) → wbudowane **pole „Status"** na tablicy, kolumny `Backlog`/`Todo`/`In Progress`/`Review`/`Done`/`Blocked` (mapowanie: proposed→Backlog, ready→Todo, in-progress→In Progress, in-review→Review, done→Done, blocked→Blocked; jedyne miejsce statusu — nie dubluj w etykietach).
- Zmiana z `/10x-plan` (`context/changes/<id>/`) → **tyle pod-zgłoszeń (sub-issue, etykieta `task`), ile jest faz w `## Progress`** planu; jedno pod-zgłoszenie = jedna faza, powiązane jako sub-issue parenta (GraphQL `addSubIssue`) i dodane do tablicy. **NIGDY** jedno zbiorcze pod-zgłoszenie na całą zmianę — użytkownik chce obserwować postęp faza po fazie.
- Pod-zgłoszenia faz **przechodzą przez kolumny boardu wraz z postępem**: start fazy → sub-issue na `In Progress`; odhaczenie fazy w `## Progress` → sub-issue na `Done` i zamknięte. Parent Issue: `In Progress` z pierwszą fazą → po zaimplementowaniu wszystkich faz (PR otwarty/zmergowany) → `Review`, gdzie **czeka na `/10x-impl-review`** — sam merge kodu NIE przenosi go do `Done`. Dopiero po domknięciu przeglądu (triaż zakończony; jeśli wygenerował poprawki — po ich zmergowaniu na `main`) parent → `Done`. `/10x-archive` (po `Done`) zamyka Issue i przenosi zmianę do archiwum. **Skutek modelu: wszystkie pod-zgłoszenia faz mogą być `Done`, a parent nadal `Review` — to stan poprawny, nie rozjazd.**
- `/10x-archive` (status → `done`) → zamknij parent Issue, karta → `Done`.

Reguły operacyjne:

- Nowy lub zmieniony F-NN/S-NN w `roadmap.md` → utwórz/zaktualizuj parent Issue + dodaj do tablicy + ustaw pole „Status".
- Rutynowy sync stanu (tworzenie/aktualizacja Issues i pod-zgłoszeń, pole „Status", zamykanie) jest **dozwolony bez dopytywania** — taki jest cel jednoczesności.
- **Granica:** operacje destrukcyjne na GitHub (usunięcie Issue / tablicy / pola / milestone) oraz `git push` / PR / merge / deploy / sekrety pozostają **tylko za jawną zgodą** (zgodnie z „Human-in-the-loop" niżej).

## Safe operations

- **Audit before installing or running — in that order.** Run `npm audit` and review a new or unfamiliar dependency **before** adding, installing, or executing it. Never install/run first and check afterwards. Pin versions where stability matters; prefer surgical fixes (e.g. a targeted `overrides` entry) over `npm audit fix --force` or other bulk changes.
- **Act on security findings only after checking primary sources.** Confirm an advisory against its source before drawing conclusions or recommending drastic action: distinguish GitHub **reviewed** vs **unreviewed** advisories and check whether the package is actually deprecated/quarantined on the registry. Never present an unverified lookup or model-generated summary as fact — state confidence and uncertainty explicitly.
- **Secrets hygiene.** Never echo, log, or commit secrets. Keep real credentials only in gitignored files (`.dev.vars`, `docs/local/`) and use placeholders in tracked docs. Supply CI/prod secrets via the platform secret store, never in committed files.
- **Human-in-the-loop for irreversible or outward-facing actions.** Propose and confirm before destructive or hard-to-reverse operations — deploys, `wrangler`/`supabase` state changes, secret rotation, deletions, force-fixes, and any `git push`.
- **Reversible, calibrated defaults.** Prefer the smallest reversible change; report plainly what was and was not verified, and do not overstate certainty.

## Repo content & commit inclusion

- **`context/blog/` is intentional course documentation** (board screenshots, progress artifacts for the course assessment). Always commit it as-is alongside the work it documents — never treat it as a stray/unrelated path to leave behind, and never delete it.
- **Course-lesson artifacts ride along with project commits.** Fetching a 10x-cli lesson modifies `CLAUDE.md` (sentinel block), `.claude/.10x-cli-manifest.json`, and `.claude/skills/**`. These are expected project state — commit them on an ongoing basis with the project work they accompany (a dedicated `chore(course): …` commit is acceptable), not left dangling. When a per-phase commit ritual flags them as "unrelated dirty paths", the resolution is to commit them separately, not to forget them.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

**Astro 6 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default. API routes must export `const prerender = false`.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected page example: `src/pages/dashboard.astro`

### Key conventions

- **Astro components** for static content/layout; **React components** only when interactivity is needed.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`.
- **Services/helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs) go in `src/types.ts`.

### Environment

- Node.js v22.14.0 (see `.nvmrc`)
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY` (copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev)
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored)
- Deploy: `npx wrangler deploy` (requires Cloudflare account + `wrangler` auth)

## CI

GitHub Actions workflow (`.github/workflows/ci.yml`) runs lint + build on every push and PR to main. Requires `SUPABASE_URL` and `SUPABASE_KEY` repository secrets for the build step.

<!-- BEGIN @przeprogramowani/10x-cli -->

---
name: 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)
description: End-to-end testing with AI
license: CC BY-NC-ND 4.0
metadata:
  tags: AI, E2E, testing, Playwright
  version: 1.0.0
  module: 3
  lesson: 4
---

## 10xDevs AI Toolkit - Moduł 3, Lekcja 4 (Testy E2E)

**Do testów E2E użyj umiejętności `/10x-e2e`.** Jest to jedyne źródło prawdy
dla przepływu pracy — ryzyko → test początkowy + zasady → generowanie → przegląd pod kątem pięciu
antywzorców → ponowne zapytanie → weryfikacja. `references/` umiejętności zawierają pełne
zasady, antywzorce, wzorzec początkowy i szablon promptu.

Kilka twardych zasad, które obowiązują jeszcze przed wywołaniem umiejętności:

- **Lokalizatory:** Najpierw `getByRole` / `getByLabel` / `getByText`; `getByTestId`
  tylko wtedy, gdy atrybuty dostępności są niejednoznaczne. Nigdy selektory CSS, XPath
  ani struktura DOM.
- **Nigdy `page.waitForTimeout()`.** Czekaj na stan: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Niezależność testów + czyszczenie.** Każdy test działa samodzielnie — własna konfiguracja,
  akcja, asercja i czyszczenie; unikalne identyfikatory (sufiks znacznika czasu), aby równoległe uruchomienia
  i ponowne uruchomienia nie kolidowały.

Dwie granice, które należy rozróżnić:

- **DOM (migawka) jest domyślny.** Wizja (`--caps=vision`) jest uzupełnieniem dla
  ryzyk wizualnych (układ, z-index, animacja); dla regresji pikseli preferuj
  narzędzia deterministyczne (`toMatchSnapshot`, Argos, Lost Pixel). Wybór/koszt modelu VLM
  to temat debugowania (Lekcja 5), a nie testowania.
- **Healer pomaga w selektorach, szkodzi w logice.** Zmieniony selektor → healer
  odnajduje go ponownie (trasa przez przegląd PR). Zmienione zachowanie biznesowe → healer
  maskuje błąd; ten przypadek nieudanego testu do naprawy to Lekcja 5.

<!-- END @przeprogramowani/10x-cli -->
