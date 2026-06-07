# Repository Guidelines

**Session pickup:** If `@docs/local/session-handoff.md` exists, read it FIRST — it carries workflow position, user preferences, and open decisions from the previous session. Without it, continue normally with the rest of this file.

TaskerLight — Astro 6 SSR web app with React 19 islands, Tailwind 4, Supabase Auth, deployed to Cloudflare Workers. Architecture detail in `@CLAUDE.md`; local setup in `@README.md`.

This file is a **downstream mirror of `@CLAUDE.md`**: it follows the shared project rules defined there (one-way, `CLAUDE.md` → `AGENTS.md`). Change shared rules in `CLAUDE.md`, then propagate them here — never the reverse.

## Hard rules

- Never use Next.js directives (`"use client"` etc.) — Astro islands handle client/server split.
- API routes export uppercase `GET`/`POST`/etc. and validate input with `zod` before any side effect.
- New Supabase tables ship with RLS enabled and granular per-operation, per-role policies. Migrations live in `supabase/migrations/` named `YYYYMMDDHHmmss_short_description.sql`.
- Path alias `@/*` → `./src/*`. Use it; never write `../../../`.
- Tailwind composition goes through `cn()` from `@/lib/utils`. Never concatenate class strings manually.
- Pre-commit hook runs `eslint --fix` + `prettier --write` via husky + lint-staged. Don't bypass with `--no-verify`.

## GitHub sync (live project state)

GitHub Issues + the private Projects v2 board "TaskerLight" (`https://github.com/users/qbarium/projects/3`) are a **synchronized** mirror of project state — not decorative. Files stay the source of truth (`context/foundation/roadmap.md`, each change's `## Progress`), but **every state change in those files must be reflected on GitHub in the same turn**. Applies to every agent, including coding agents.

**This is hard and NON-NEGOTIABLE.** The user tracks progress **live on the board**, so the board MUST faithfully mirror the roadmap and phase state at all times — any board↔file drift is a bug to **fix immediately, in the same turn**, never deferred. Constant Projects v2 field/option/card IDs + ready-made `gh project item-edit` / sub-issue GraphQL commands → **`docs/local/github-board-ops.md`** (read BEFORE touching the board).

- Roadmap item F-NN/S-NN → **parent Issue** (label `foundation`/`slice`; north star also `north-star`).
- Stream A–D → **milestone**.
- Item status (`proposed`/`ready`/`in-progress`/`blocked`/`done`) → built-in **Status** field, columns `Backlog`/`Todo`/`In Progress`/`Review`/`Done`/`Blocked` (1:1; the only place for status — don't duplicate in labels).
- A `/10x-plan` change (`context/changes/<id>/`) → **as many sub-issues (label `task`) as there are phases in `## Progress`**; one sub-issue per phase, linked as a sub-issue of the parent (GraphQL `addSubIssue`) and added to the board. **NEVER** a single umbrella sub-issue for the whole change — the user wants to watch progress phase by phase.
- Phase sub-issues **move across board columns with progress**: phase start → its sub-issue to `In Progress`; phase checked off in `## Progress` → sub-issue to `Done` and closed. Parent Issue: `In Progress` with the first phase → `Review` on open PR → `Done` on merge / `/10x-archive`.
- Routine state sync (create/update Issues & sub-issues, Status field, closing) is allowed without asking. Destructive GitHub ops (deleting an Issue/board/field/milestone) and `git push`/PR/merge/deploy/secrets require explicit consent.

## Repo content & commit inclusion

- **`context/blog/` is intentional course documentation** (board screenshots, progress artifacts for the course assessment). Always commit it as-is alongside the work it documents — never treat it as a stray/unrelated path to leave behind, and never delete it.
- **Course-lesson artifacts ride along with project commits.** Fetching a 10x-cli lesson modifies `CLAUDE.md` (sentinel block), `.claude/.10x-cli-manifest.json`, and `.claude/skills/**`. These are expected project state — commit them on an ongoing basis with the project work they accompany (a dedicated `chore(course): …` commit is acceptable), not left dangling.

## Commands

- `npm run dev` — Astro dev server (Cloudflare workerd runtime).
- `npm run build` — production SSR build via `@astrojs/cloudflare`.
- `npm run lint` / `lint:fix` — ESLint with type-checked rules.
- `npm run format` — Prettier (includes `prettier-plugin-astro` + `prettier-plugin-tailwindcss`).
- `npx supabase start` — local Supabase stack (requires Docker).
- `npx wrangler deploy` — Cloudflare Workers deploy.

## Project structure

- `src/pages/` — Astro routes; `api/auth/{signin,signup,signout}.ts`, `auth/*.astro`, `dashboard.astro` (protected example).
- `src/components/ui/` — shadcn/ui, "new-york" variant. Add via `npx shadcn@latest add <name>`.
- `src/components/hooks/` — React hooks.
- `src/lib/` — services and helpers; `src/lib/services/` for extracted business logic.
- `src/lib/supabase.ts` — SSR Supabase client. `src/middleware.ts` — auth resolution; routes in `PROTECTED_ROUTES` require sign-in.
- `src/types.ts` — shared types (entities, DTOs).
- `supabase/migrations/` — schema migrations.
- `context/foundation/` — PRD, tech-stack, lessons (consumed by `/10x-*` skills).

## Conventions

- Astro components for static content/layout; React components only when interactivity is needed.
- React hooks live in `src/components/hooks/`. No Next.js-style directives.
- ESLint config in `@eslint.config.js`; rules are type-checked.

## Commits & CI

- Imperative subject, no Conventional-Commits prefix. Two threads in one commit join with `;` (see `git log`).
- CI runs on push/PR to `main`: `npm ci` → `npx astro sync` → `npm run lint` → `npm run build`. `SUPABASE_URL` / `SUPABASE_KEY` must be set as repo secrets for the build step.

## Security

- `SUPABASE_URL` / `SUPABASE_KEY` are server-only via `astro:env/server`. Never expose to client.
- Local secrets in `.env` (Node) or `.dev.vars` (Cloudflare local). Both gitignored.
- User-provided AI provider keys (PRD FR-026) MUST NEVER appear in logs, audit trail, error reports, or telemetry. See `@context/foundation/prd.md`.
