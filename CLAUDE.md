# Rules for AI

This file provides guidance to AI Agent when working with code in this repository.

**Session pickup:** Jeśli istnieje `@docs/local/session-handoff.md`, przeczytaj go PIERWSZY — zawiera pozycję na łańcuchu workflow, preferencje użytkownika i otwarte decyzje z poprzedniej sesji. Bez niego kontynuuj normalnie z reszty tego pliku.

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
- Status elementu (`proposed`/`ready`/`in-progress`/`blocked`/`done`) → **pole „Etap"** na tablicy, kolumny `Backlog`/`Ready`/`In Progress`/`Review`/`Done`/`Blocked` (mapowanie 1:1; jedyne miejsce statusu — nie dubluj w etykietach).
- Task z `/10x-plan` (`context/changes/<id>/`) → **pod-zgłoszenie** (sub-issue, etykieta `task`) pod właściwym parent Issue, dodane do tablicy.
- Odhaczona faza w `## Progress` → zamknij pod-zgłoszenie / przesuń kartę do `Zrobione`.
- `/10x-archive` (status → `done`) → zamknij parent Issue, karta → `Zrobione`.

Reguły operacyjne:

- Nowy lub zmieniony F-NN/S-NN w `roadmap.md` → utwórz/zaktualizuj parent Issue + dodaj do tablicy + ustaw „Etap".
- Rutynowy sync stanu (tworzenie/aktualizacja Issues i pod-zgłoszeń, pole „Etap", zamykanie) jest **dozwolony bez dopytywania** — taki jest cel jednoczesności.
- **Granica:** operacje destrukcyjne na GitHub (usunięcie Issue / tablicy / pola / milestone) oraz `git push` / PR / merge / deploy / sekrety pozostają **tylko za jawną zgodą** (zgodnie z „Human-in-the-loop" niżej).

## Safe operations

- **Audit before installing or running — in that order.** Run `npm audit` and review a new or unfamiliar dependency **before** adding, installing, or executing it. Never install/run first and check afterwards. Pin versions where stability matters; prefer surgical fixes (e.g. a targeted `overrides` entry) over `npm audit fix --force` or other bulk changes.
- **Act on security findings only after checking primary sources.** Confirm an advisory against its source before drawing conclusions or recommending drastic action: distinguish GitHub **reviewed** vs **unreviewed** advisories and check whether the package is actually deprecated/quarantined on the registry. Never present an unverified lookup or model-generated summary as fact — state confidence and uncertainty explicitly.
- **Secrets hygiene.** Never echo, log, or commit secrets. Keep real credentials only in gitignored files (`.dev.vars`, `docs/local/`) and use placeholders in tracked docs. Supply CI/prod secrets via the platform secret store, never in committed files.
- **Human-in-the-loop for irreversible or outward-facing actions.** Propose and confirm before destructive or hard-to-reverse operations — deploys, `wrangler`/`supabase` state changes, secret rotation, deletions, force-fixes, and any `git push`.
- **Reversible, calibrated defaults.** Prefer the smallest reversible change; report plainly what was and was not verified, and do not overstate certainty.

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

GitHub Actions workflow (`.github/workflows/ci.yml`) runs lint + build on every push and PR to master. Requires `SUPABASE_URL` and `SUPABASE_KEY` repository secrets for the build step.

<!-- BEGIN @przeprogramowani/10x-cli -->

---
name: 10xDevs AI Toolkit - Module 2, Lesson 1
description: Move from sprint-zero setup to project orchestration with the roadmap chain.
license: CC BY-NC-ND 4.0
metadata:
  module: 2
  lesson: 1
  author: 10xDevs
---

## 10xDevs AI Toolkit - Moduł 2, Lekcja 1

Przejdź od konfiguracji sprint-zero do orkiestracji projektu za pomocą **łańcucha mapy drogowej**:

```
(dokumenty podstawowe Modułu 1) -> /10x-roadmap -> elementy mapy drogowej gotowe do backlogu
```

`/10x-roadmap` to główny temat lekcji. `/10x-new` jest celowo wprowadzony w Module 2, Lekcji 2, gdy wybrany element mapy drogowej staje się folderem zmian implementacyjnych.

### Router zadań - Od czego zacząć

| Umiejętność | Użyj, gdy |
| --- | --- |
| **Mapa drogowa (główny temat lekcji)** | |
| `/10x-roadmap` | Masz `context/foundation/prd.md` i podstawę projektu, a potrzebujesz mapy drogowej MVP z podejściem vertical-first. Umiejętność odczytuje PRD, sprawdza bazę kodu, używa dostępnych dokumentów podstawowych, takich jak `tech-stack.md`, `infrastructure.md` i `deploy-plan.md`, a następnie zapisuje `context/foundation/roadmap.md`. Użyj jej PRZED tworzeniem folderów dla poszczególnych zmian lub planów implementacji. |
| **Ponowne uruchomienie upstream w razie potrzeby** | |
| `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-infra-research` | Zgrupowane z Modułu 1, aby kontrakty podstawowe mogły zostać naprawione przed sekwencjonowaniem mapy drogowej. Jeśli generowanie mapy drogowej ujawni lukę w PRD, napraw PRD, zanim udasz, że backlog jest gotowy. |

### Jak działa przekazywanie w łańcuchu

- `/10x-roadmap` łączy produkt z implementacją. Nie wybiera frameworków, nie projektuje schematów ani nie pisze planu implementacji dla każdej zmiany.
- Wynikiem jest `context/foundation/roadmap.md`: uporządkowane kamienie milowe, pionowe wycinki, ograniczone podstawy, zależności, niewiadome, ryzyko i pola przekazania do backlogu.
- Elementy mapy drogowej powinny otrzymywać stabilne, czytelne dla człowieka identyfikatory w narzędziach backlogu. Rzeczywisty folder `context/changes/<change-id>/` jest tworzony w Lekcji 2 za pomocą `/10x-new`.

### Granice mapy drogowej

- Domyślnie pionowe wycinki: widoczne dla użytkownika wyniki, które obejmują interfejs użytkownika, dane, logikę biznesową i integracje.
- Praca horyzontalna jest dozwolona tylko jako ograniczony element umożliwiający, który nazywa kolejny pionowy kamień milowy, który odblokowuje.
- Unikaj osieroconej pracy horyzontalnej, takiej jak "zbuduj całą bazę danych", "zbuduj wszystkie punkty końcowe API" lub "zaprojektuj cały interfejs użytkownika" przed pierwszym widocznym dla użytkownika przepływem.
- Mapa drogowa nie jest szacunkiem kalendarzowym. Nie wymyślaj dat, punktów historii ani prędkości sprintu, chyba że użytkownik wyraźnie poprosi o oddzielny artefakt planistyczny.

### Ścieżki podstawowe używane w tej lekcji

- `context/foundation/prd.md` - wejście
- `context/foundation/tech-stack.md` - opcjonalne wejście
- `context/foundation/infrastructure.md` - opcjonalne wejście
- `context/deployment/deploy-plan.md` - opcjonalne wejście
- `context/foundation/roadmap.md` - wyjście
- `context/foundation/lessons.md` - powtarzające się zasady i pułapki
- `docs/reference/contract-surfaces.md` - rejestr nazw nośnych

Umiejętności nie mogą zapisywać do `context/archive/`. Zarchiwizowane zmiany są niezmienne; jeśli docelowa ścieżka zaczyna się od `context/archive/`, przerwij z komunikatem: "Ta zmiana jest zarchiwizowana. Zamiast tego otwórz nową zmianę za pomocą `/10x-new`."

<!-- END @przeprogramowani/10x-cli -->
