---
bootstrapped_at: 2026-05-31T10:53:54Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: tasker-light
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

Verbatim copy of `context/foundation/tech-stack.md`:

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: tasker-light
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

### Why this stack (verbatim from hand-off body)

Solo autor szlifuje MVP web-app w 3 tygodnie po godzinach z twardym deadline'm 2026-07-05; produkt potrzebuje auth (Supabase Auth pokrywa passwordless / OAuth bez własnego backendu), bazy danych (Postgres przez Supabase), file storage serwerowego dla wsadu plikowego (Supabase Storage — domknięcie FR-015/NFR Retencja po doprecyzowaniu) oraz wywołań do zewnętrznego dostawcy AI dla klasyfikacji w trybie BYOK. 10x Astro Starter to recommended-default dla komórki `(web, js)` — zalicza wszystkie cztery bramki agent-friendly (typed via TypeScript, convention-based, popular w training data, well-documented), a pewność bootstrapper'a `first-class` oznacza że scaffolding powinien przejść gładko, choć nie jest jeszcze battle-tested end-to-end. Cloudflare Pages + Workers to natywny target adaptera `@astrojs/cloudflare` — najtańsza droga do pierwszego deploy'a, edge runtime mieści synchroniczną klasyfikację z timeoutem 60 s (NFR), a Workers obsłużą wywołanie zewnętrznego dostawcy AI bez wydzielonego backendu. CI na GitHub Actions z auto-deploy-on-merge to standardowy shape startera, w sam raz dla solo bez staging gate'u. Audio (FR-004 nice-to-have) zostawione poza must-have MVP, więc `has_background_jobs` = false; w razie eskalacji scope'u — Cloudflare Queues pokryją.

## Pre-scaffold verification

| Signal       | Value                                                       | Severity | Notes                                                              |
| ------------ | ----------------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| npm package  | not run                                                     | n/a      | `cmd_template` starts with `git clone` — no npm CLI to version-check |
| GitHub repo  | przeprogramowani/10x-astro-starter last pushed 2026-05-17   | fresh    | from card.docs_url; 14 days before bootstrap                       |

`gh` CLI nie zalogowane — fallback do publicznego REST API GitHub (bez auth).

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 18 (top-level items: `.env.example`, `.github/`, `.husky/`, `.nvmrc`, `.prettierrc.json`, `.vscode/`, `README.md`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules/`, `package-lock.json`, `package.json`, `public/`, `src/`, `supabase/`, `tsconfig.json`, `wrangler.jsonc`)
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold` (existing CLAUDE.md preserved; scaffold's version sidelined for diff)
**.gitignore handling**: append-merged with 13 patterns from starter (cwd's 10xDevs-skill ignore rules kept in order, scaffold patterns appended under `# from 10x-astro-starter` separator; no overlap detected)
**.bootstrap-scaffold cleanup**: deleted (upstream `.git/` removed before merge; temp dir empty after move-up)
**npm install result**: 773 packages added; 1 minute wall-clock

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW (total 10 advisories)
**Direct vs transitive**: 0/0/2/0 direct of total 0/1/9/0 (2 direct MODERATE: `@astrojs/check`, `wrangler`; rest transitive)
**Dependency counts (npm)**: 895 total, 449 prod, 316 dev

#### CRITICAL findings

none

#### HIGH findings

- **devalue** (transitive, via Svelte-family deps)
  - Advisory: [GHSA-77vg-94rm-hx3p](https://github.com/advisories/GHSA-77vg-94rm-hx3p) — Svelte devalue: DoS via sparse array deserialization
  - Affected range: `5.6.3 - 5.8.0`
  - Fix available via: `npm audit fix`

#### MODERATE findings

- **@astrojs/check** (direct) — via vulnerable `@astrojs/language-server`. Fix available via `npm audit fix`.
- **@astrojs/language-server** (transitive) — via `volar-service-yaml`. Cascaded from `yaml`.
- **@cloudflare/vite-plugin** (transitive) — depends on vulnerable `miniflare`, `wrangler`, `ws`.
- **miniflare** (transitive) — depends on vulnerable `ws`.
- **volar-service-yaml** (transitive) — depends on vulnerable `yaml-language-server`.
- **wrangler** (direct) — depends on vulnerable `miniflare`. Range: `<=0.0.0-kickoff-demo || 3.108.0 - 4.93.0`. Fix available via `npm audit fix`.
- **ws** (transitive) — Advisory: [GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx) — Uninitialized memory disclosure. Range: `8.0.0 - 8.20.0`. Fix available via `npm audit fix`.
- **yaml** (transitive) — Advisory: [GHSA-48c2-rrv3-qjmp](https://github.com/advisories/GHSA-48c2-rrv3-qjmp) — Stack Overflow via deeply nested YAML collections. Range: `2.0.0 - 2.8.2`. Fix available via `npm audit fix --force` (breaking).
- **yaml-language-server** (transitive) — cascaded from `yaml`.

#### LOW / INFO findings

none

#### Action suggestion (informational, not auto-applied)

`npm audit fix` powinien rozwiązać większość znalezisk bez breaking changes. `yaml` wymaga `--force` (breaking). Decyzja po stronie usera, bootstrapper nie modyfikuje projektu.

## Hints recorded but not acted on

| Hint                       | Value                              |
| -------------------------- | ---------------------------------- |
| bootstrapper_confidence    | first-class                        |
| quality_override           | false                              |
| path_taken                 | standard                           |
| self_check_answers         | null                               |
| team_size                  | solo                               |
| deployment_target          | cloudflare-pages                   |
| ci_provider                | github-actions                     |
| ci_default_flow            | auto-deploy-on-merge               |
| has_auth                   | true                               |
| has_payments               | false                              |
| has_realtime               | false                              |
| has_ai                     | true                               |
| has_background_jobs        | false                              |

v1 bootstrapper'a odczytuje te wskazówki, ale ich nie egzekwuje (brak CI workflow, brak generacji AGENTS.md/CLAUDE.md, brak konfiguracji feature-flag-aware). Pozostają w logu jako audit trail dla przyszłej skill'a M1L4.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history. (W tym repo `.git/` już istnieje od początku — pomijasz ten krok.)
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep. (Konkretnie: `CLAUDE.md.scaffold` zawiera oficjalny CLAUDE.md startera Astro+Supabase+Cloudflare; Twój oryginalny `CLAUDE.md` ma sentinel block z `@przeprogramowani/10x-cli` po m1l3. Decyzja czy scalić zawartość, podmienić, czy usunąć scaffold — Twoja.)
- Address audit findings per your project's risk tolerance — the full breakdown is in this log. `npm audit fix` rozwiązuje większość bez breakage; `yaml` wymaga `--force`.
