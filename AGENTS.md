# Repository Guidelines

**Session pickup:** If `@docs/local/session-handoff.md` exists, read it FIRST — it carries workflow position, user preferences, and open decisions from the previous session. Without it, continue normally with the rest of this file.

TaskerLight — Astro 6 SSR web app with React 19 islands, Tailwind 4, Supabase Auth, deployed to Cloudflare Workers. Architecture detail in `@CLAUDE.md`; local setup in `@README.md`.

## Hard rules

- Never use Next.js directives (`"use client"` etc.) — Astro islands handle client/server split.
- API routes export uppercase `GET`/`POST`/etc. and validate input with `zod` before any side effect.
- New Supabase tables ship with RLS enabled and granular per-operation, per-role policies. Migrations live in `supabase/migrations/` named `YYYYMMDDHHmmss_short_description.sql`.
- Path alias `@/*` → `./src/*`. Use it; never write `../../../`.
- Tailwind composition goes through `cn()` from `@/lib/utils`. Never concatenate class strings manually.
- Pre-commit hook runs `eslint --fix` + `prettier --write` via husky + lint-staged. Don't bypass with `--no-verify`.

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
- CI runs on push/PR to `master`: `npm ci` → `npx astro sync` → `npm run lint` → `npm run build`. `SUPABASE_URL` / `SUPABASE_KEY` must be set as repo secrets for the build step.

## Security

- `SUPABASE_URL` / `SUPABASE_KEY` are server-only via `astro:env/server`. Never expose to client.
- Local secrets in `.env` (Node) or `.dev.vars` (Cloudflare local). Both gitignored.
- User-provided AI provider keys (PRD FR-026) MUST NEVER appear in logs, audit trail, error reports, or telemetry. See `@context/foundation/prd.md`.
