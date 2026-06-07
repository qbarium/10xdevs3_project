# Rules for AI

This file provides guidance to AI Agent when working with code in this repository.

**Session pickup:** Jeśli istnieje `@docs/local/session-handoff.md`, przeczytaj go PIERWSZY — zawiera pozycję na łańcuchu workflow, preferencje użytkownika i otwarte decyzje z poprzedniej sesji. Bez niego kontynuuj normalnie z reszty tego pliku.

**AGENTS.md follows this file.** `@AGENTS.md` is a downstream mirror of the shared project rules defined in `CLAUDE.md`. When you change a shared rule here, propagate it to `AGENTS.md` in the same turn. The flow is **one-way — `CLAUDE.md` → `AGENTS.md`, never the reverse**.

## Hard rules

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **API routes**: use uppercase `GET`, `POST` exports; validate input with zod.
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies.
- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.

## GitHub jako synchronizowany stan projektu

GitHub Issues + tablica Projects v2 („TaskerLight", `https://github.com/users/qbarium/projects/3`) są **synchronizowanym** odbiciem stanu projektu — nie poglądowym. Źródłem prawdy pozostają pliki (`context/foundation/roadmap.md`, `context/changes/<id>/` `## Progress`), ale **każda zmiana stanu w tych plikach musi w tej samej turze zostać odzwierciedlona w GitHubie**. Obowiązuje każdego agenta, w tym kodującego.

Mapowanie kanon ↔ GitHub:

- Element roadmapy F-NN / S-NN → **parent Issue** (etykieta `foundation` lub `slice`; gwiazda przewodnia dodatkowo `north-star`).
- Strumień A–D → **milestone**.
- Status elementu (`proposed`/`ready`/`in-progress`/`blocked`/`done`) → wbudowane **pole „Status"** na tablicy, kolumny `Backlog`/`Todo`/`In Progress`/`Review`/`Done`/`Blocked` (mapowanie: proposed→Backlog, ready→Todo, in-progress→In Progress, in-review→Review, done→Done, blocked→Blocked; jedyne miejsce statusu — nie dubluj w etykietach).
- Task z `/10x-plan` (`context/changes/<id>/`) → **pod-zgłoszenie** (sub-issue, etykieta `task`) pod właściwym parent Issue, dodane do tablicy.
- Odhaczona faza w `## Progress` → zamknij pod-zgłoszenie / przesuń kartę do `Done`.
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

## 10xDevs AI Toolkit — Moduł 2, Lekcja 2

Przekształć jeden element planu działania w pierwszy cykl implementacji za pomocą **łańcucha planowania zmian**:

```
/10x-roadmap -> /10x-new -> /10x-plan -> /10x-plan-review -> /10x-implement
```

`/10x-new`, `/10x-plan`, `/10x-plan-review` i `/10x-implement` to główne tematy lekcji. `/10x-frame` i `/10x-research` nie są tutaj wymaganymi rytuałami; są to ścieżki eskalacji wprowadzone w następnej lekcji.

### Router zadań — Od czego zacząć

| Umiejętność | Użyj, gdy |
| --- | --- |
| **Konfiguracja zmiany (główny temat lekcji)** | |
| `/10x-new <change-id>` | Wybrałeś element planu działania i potrzebujesz stabilnego folderu zmian. Tworzy `context/changes/<change-id>/change.md`, dzięki czemu planowanie, implementacja, postęp, commity i późniejsza recenzja mają jedną tożsamość. Użyj PO wyborze planu działania, PRZED `/10x-plan`. |
| **Planowanie (główny temat lekcji)** | |
| `/10x-plan <change-id>` | Masz folder zmian i potrzebujesz planu implementacji do recenzji. Odczytuje kontekst planu działania, dokumenty podstawowe, dowody z bazy kodu i wszelkie istniejące notatki o zmianach; zapisuje `plan.md` i `plan-brief.md` z fazami, kontraktami plików, kryteriami sukcesu i `## Progress`. |
| **Gotowość planu (główny temat lekcji)** | |
| `/10x-plan-review <change-id>` | Masz `plan.md` i potrzebujesz lekkiej kontroli gotowości przed kodowaniem. Użyj jej, aby wychwycić brakujący stan końcowy, słabe kontrakty, źle sformułowany postęp, dryf zakresu lub martwe punkty, zanim rozpoczną się zmiany w kodzie. |
| **Implementacja (główny temat lekcji)** | |
| `/10x-implement <change-id> phase <n>` | Masz zatwierdzony plan i chcesz wykonać jedną fazę z weryfikacją, ręczną bramką, rytuałem commitowania i zapisem SHA do `## Progress`. |
| **Zamknięcie cyklu życia** | |
| `/10x-archive <change-id>` | Zmiana została scalona lub celowo zamknięta. Przenieś ją z aktywnego `context/changes/` do stanu archiwum. |

### Jak działa przekazywanie w łańcuchu

- `/10x-new` tworzy trwałą tożsamość zmiany.
- `/10x-plan` przekształca tę tożsamość w kontrakt implementacyjny.
- `/10x-plan-review` sprawdza plan, zanim agent zmodyfikuje kod.
- `/10x-implement` wykonuje jedną zaplanowaną fazę, weryfikuje, prosi o ręczne potwierdzenie, gdy jest to potrzebne, commituje i rejestruje postęp.

### Granice lekcji

- Plan jest domyślnym routerem po wyborze planu działania. Zacznij od `/10x-plan`, chyba że problem jest niejasny lub blokują go zewnętrzne dowody.
- Nie uruchamiaj `/10x-frame + /10x-research` jako ceremonii dla każdej zmiany.
- Nie przekształcaj tej lekcji w pełną, kompleksową budowę produktu. Punkt kontrolny z zaplanowanym i częściowo lub w pełni zaimplementowanym strumieniem jest ważny.
- Przegląd kodu zaimplementowanej różnicy należy do Lekcji 3 za pośrednictwem `/10x-impl-review`.
- Zamknięcie cyklu życia za pośrednictwem `/10x-archive` po scaleniu lub celowym zamknięciu zmiany.

### Ścieżki używane w tej lekcji

- `context/foundation/roadmap.md` - nadrzędny plan działania
- `context/changes/<change-id>/change.md` - tożsamość zmiany
- `context/changes/<change-id>/plan.md` - kontrakt implementacyjny
- `context/changes/<change-id>/plan-brief.md` - skompresowane przekazanie
- `context/foundation/lessons.md` - powtarzające się zasady i pułapki
- `docs/reference/contract-surfaces.md` - rejestr nazw nośnych

Umiejętności nie mogą zapisywać do `context/archive/`. Zarchiwizowane zmiany są niezmienne; jeśli rozwiązana ścieżka docelowa zaczyna się od `context/archive/`, przerwij z komunikatem: "Ta zmiana jest zarchiwizowana. Zamiast tego otwórz nową zmianę za pomocą `/10x-new`."

<!-- END @przeprogramowani/10x-cli -->
