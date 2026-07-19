# Repository Guidelines

**Session pickup:** If `@docs/local/session-handoff.md` exists, read it FIRST — it carries workflow position, user preferences, and open decisions from the previous session. Without it, continue normally with the rest of this file.

TaskerLight — Astro 6 SSR web app with React 19 islands, Tailwind 4, Supabase Auth, deployed to Cloudflare Workers. Architecture detail in `@CLAUDE.md`; local setup in `@README.md`.

This file is a **downstream mirror of `@CLAUDE.md`**: it follows the shared project rules defined there (one-way, `CLAUDE.md` → `AGENTS.md`). Change shared rules in `CLAUDE.md`, then propagate them here — never the reverse.

## Hard rules

- Never use Next.js directives (`"use client"` etc.) — Astro islands handle client/server split.
- API routes export uppercase `GET`/`POST`/etc.; validate structured/multi-field input with `zod` before any side effect; single scalar fields may use manual validation (trim + reject empty).
- New Supabase tables ship with RLS enabled and granular per-operation, per-role policies. Migrations live in `supabase/migrations/` named `YYYYMMDDHHmmss_short_description.sql`.
- Path alias `@/*` → `./src/*`. Use it; never write `../../../`.
- Tailwind composition goes through `cn()` from `@/lib/utils`. Never concatenate class strings manually.
- Local quality gates, two layers: a per-edit agent hook (`.claude/hooks/lint.sh`, `PostToolUse: Write|Edit`) lints the edited file and blocks with `exit 2` on error so the agent sees the report; pre-commit (husky) runs `lint-staged` (`eslint --fix` + `prettier --write`) then `tsc --noEmit`. Don't bypass with `--no-verify`.

## GitHub sync (live project state)

GitHub Issues + the private Projects v2 board "TaskerLight" (`https://github.com/users/qbarium/projects/3`) are a **synchronized** mirror of project state — not decorative. Files stay the source of truth (`context/foundation/roadmap.md`, each change's `## Progress`), but **every state change in those files must be reflected on GitHub in the same turn**. Applies to every agent, including coding agents.

**This is hard and NON-NEGOTIABLE.** The user tracks progress **live on the board**, so the board MUST faithfully mirror the roadmap and phase state at all times — any board↔file drift is a bug to **fix immediately, in the same turn**, never deferred. Constant Projects v2 field/option/card IDs + ready-made `gh project item-edit` / sub-issue GraphQL commands → **`docs/local/github-board-ops.md`** (read BEFORE touching the board).

- Roadmap item F-NN/S-NN → **parent Issue** (label `foundation`/`slice`; north star also `north-star`).
- Stream A–D → **milestone**.
- Item status (`proposed`/`ready`/`in-progress`/`in-review`/`blocked`/`done`) → built-in **Status** field, columns `Backlog`/`Todo`/`In Progress`/`Review`/`Done`/`Blocked` (1:1; the only place for status — don't duplicate in labels).
- A `/10x-plan` change (`context/changes/<id>/`) → **as many sub-issues (label `task`) as there are phases in `## Progress`**; one sub-issue per phase, linked as a sub-issue of the parent (GraphQL `addSubIssue`) and added to the board. **NEVER** a single umbrella sub-issue for the whole change — the user wants to watch progress phase by phase.
- Phase sub-issues **move across board columns with progress**: phase start → its sub-issue to `In Progress`; phase checked off in `## Progress` → sub-issue to `Done` and closed. Parent Issue: `In Progress` with the first phase → once all phases are implemented (PR open/merged) → `Review`, where it **waits for `/10x-impl-review`** — merging the code alone does NOT move it to `Done`. Only after the review is closed out (triage done; if it produced fixes — after they are merged to `main`) does the parent → `Done`. `/10x-archive` (after `Done`) closes the Issue and moves the change to the archive. **Consequence of the model: all phase sub-issues can be `Done` while the parent is still `Review` — that is correct, not drift.**
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

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit — Moduł 3, Lekcja 1

Rozpocznij Moduł 3, tworząc **trwałą umowę jakościową opartą na ryzyku** przed napisaniem jakiegokolwiek testu — a następnie przeprowadzaj każdą fazę wdrożenia przez standardowy łańcuch zmian.

```
PRD + mapa drogowa + archiwum
        │
        ▼
   /10x-test-plan  ──►  context/foundation/test-plan.md  (strategia §1–§5 zamrożona + książka kucharska §6 rośnie)
        │
        ▼  (jedna faza wdrożenia na raz, /clear między przekazaniami)
   /10x-new ──► /10x-research ──► /10x-plan ──► /10x-implement
```

`/10x-test-plan` to **stanowy orkiestrator**, a nie jednorazowy generator. Przy pierwszym uruchomieniu zapisuje fazowe wdrożenie do `context/foundation/test-plan.md`. Przy każdym kolejnym uruchomieniu ponownie wyprowadza stan z artefaktów na dysku i przedstawia następne przekazanie. Lekcja koncentruje się na **strategii i sekwencjonowaniu wdrożenia, a nie na konfiguracji**. Hooki, serwery MCP i YAML CI są konfigurowane w późniejszych lekcjach tego modułu.

### Router zadań — Od czego zacząć

| Umiejętność | Kiedy jej użyć |
| --- | --- |
| **Strategia jakości jako plik reguł (fokus lekcji)** | |
| `/10x-test-plan` | Masz PRD (i idealnie mapę drogową oraz kilka zarchiwizowanych fragmentów) i zamierzasz napisać pierwsze testy projektu, lub zauważyłeś, że testy generowane przez AI lądują na pomocnikach, podczas gdy krytyczne przepływy pozostają niepokryte. Pierwsze wywołanie uruchamia odkrywanie (PRD + mapa drogowa + archiwum + skan gorących punktów), 5-pytaniowy wywiad z użytkownikiem i przejście syntezy z obowiązkową kontrolą challengera, a następnie zapisuje `test-plan.md` w `context/foundation/` z mapą ryzyka (5–7 scenariuszy awarii), tabelą fazowego wdrożenia, tabelą stosu, tabelą bramek jakości, sekcją książki kucharskiej (`§6`, wypełnia się w miarę realizacji faz) i sekcją przestrzeni negatywnej (czego celowo nie testujemy). Kolejne wywołania posuwają wdrożenie o jedno przekazanie na raz. |
| `/10x-test-plan --status` | `test-plan.md` już istnieje i chcesz uzyskać zwięzłą migawkę stanu wdrożenia — które fazy są `not started`, `change opened`, `researched`, `planned`, `implementing` lub `complete`, i jakie jest następne działanie. Nie wykonuje żadnej pracy; bezpieczne do uruchomienia w dowolnym momencie. |
| `/10x-test-plan --refresh` | `test-plan.md` już istnieje i jedno z: pojawiło się nowe ryzyko z top-3 z mapy drogowej lub archiwum, data `checked:` narzędzia jest starsza niż trzy miesiące, zmienił się stos technologiczny projektu, lub §7 przestrzeń negatywna nie odpowiada już temu, w co wierzy zespół. Otwiera nowy folder zmian `test-plan-refresh-<RRRR-MM-DD>` zamiast edytować przewodnik na miejscu. |

### Łańcuch wdrożenia — co dzieje się po napisaniu przewodnika

Tabela §3 *Phased Rollout* przewodnika jest stanem orkiestratora. Dla każdego wiersza innego niż `complete` orkiestrator wybiera następne przekazanie na podstawie tego, które artefakty istnieją w `context/changes/<change-id>/`:

| Stan na dysku | Następne przekazanie | Status zmienia się na |
| --- | --- | --- |
| brak folderu zmian | `/10x-new <change-id>` | `change opened` |
| tylko `change.md` | `/10x-research` (z krótkim opisem ryzyk do zweryfikowania) | `researched` |
| `+ research.md` | `/10x-plan` (z ograniczeniami koszt × sygnał + aktualizacja książki kucharskiej) | `planned` |
| `+ plan.md` z oczekującymi elementami `## Progress` | `/10x-implement <change-id> phase <N>` | `implementing` / `complete` |
| `+ plan.md` w pełni `[x]` | Oznacz wiersz §3 jako `complete`; przejdź do następnego oczekującego wiersza | — |

Każde przekazanie to **punkt STOP**. Orkiestrator kopiuje następne polecenie do schowka, prosi użytkownika o `/clear` i uruchomienie go, a następnie kończy działanie. Ponownie wywołaj `/10x-test-plan` (bez argumentów), aby przejść dalej.

### Reguły priorytetyzacji opartej na ryzyku

- Ryzyka to **scenariusze awarii w kategoriach użytkownika / biznesowych**, a nie nazwy testów. „Wylogowany użytkownik uzyskuje dostęp do płatnych treści za pomocą nieaktualnego tokena” to ryzyko; „testowanie formularza logowania” nie.
- Od 5 do 7 ryzyk. Mniej jest zbyt ogólne; więcej sprawia, że priorytetyzacja jest bezużyteczna.
- Wpływ i prawdopodobieństwo to oceny użytkownika/biznesu, a nie złożoność techniczna.
- Każde ryzyko ma swoje źródło: sekcja PRD, zarchiwizowany fragment, wpis w mapie drogowej, pytanie z wywiadu Fazy 2, **katalog** gorących punktów z liczbą zmian, lub ograniczenie stosu technologicznego. Brak wymyślonych ryzyk.
- **Sygnał, a nie wiedza.** §2 cytuje *dowody, które podniosły ryzyko*, nigdy plik jako „miejsce, w którym występuje awaria”. Kotwice plik:linia, nazwy funkcji, nazwy schematów i nazwy modułów są zabronione w §2 — należą do danych wyjściowych `/10x-research`, generowanych dla każdej fazy wdrożenia w stosunku do bieżącego kodu. Plan jest specyfikacją QA; nie jest audytem kodu.
- Pokrycie nie jest metryką. **Pokrycie ryzyka** jest metryką.

### Reguły mapowania dwuwarstwowego

- Najpierw warstwa klasyczna: wygrywa najtańszy test, który daje prawdziwy sygnał. Promuj do e2e tylko wtedy, gdy żadna tańsza warstwa nie pokrywa ryzyka.
- Druga warstwa natywna dla AI, i tylko tam, gdzie dodaje sygnał, którego klasyczne testy nie dają tanio.
- Każdy wiersz natywny dla AI ma linię **„Kiedy NIE używać”**. Jeśli nie możesz jej napisać, usuń wiersz.
- Każda nazwa narzędzia zawiera datę `checked: <RRRR-MM-DD>`. Nazwy narzędzi są przykładami kategorii, a nie rekomendacjami.
- Obie warstwy muszą być niepuste w ostatecznym przewodniku, jeśli projekt tego wymaga. Tylko klasyczna to plan z 2020 roku; tylko natywna dla AI to szum. Fazy natywne dla AI nie są obowiązkowe — włącz je tylko wtedy, gdy brief uzasadniał je pod względem kosztu × sygnału.

### Reguły bramek jakości

- Wymagane bramki (lint, typecheck, unit+integration, e2e na krytycznych przepływach) muszą odpowiadać rzeczywistym krokom CI. Jeśli wymagana bramka nie jest jeszcze podłączona, oznacz ją jako `required after §3 Phase <N>` i pozwól nazwanej fazie wdrożenia ją podłączyć.
- Hook po edycji jest **zalecany lokalnie**, a nie jako substytut CI.
- Wielomodalny przegląd wizualny jest **selektywny**, stosowany do 1–3 krytycznych ekranów, a nie do każdej strony.
- Awaryjne rozwiązanie oparte na wizji (Anthropic Computer Use lub OpenAI CUA) jest zarezerwowane dla powierzchni niedostępnych dla DOM; drogie na akcję.

### Wzorce książki kucharskiej (§6) — wypełnia się z czasem

`test-plan.md` to zarówno fazowa strategia, jak i **rosnąca książka kucharska**. §6 zaczyna się jako miejsca docelowe (`TBD — see §3 Phase <N>`) i wypełnia się stopniowo — plan każdej fazy wdrożenia kończy się podfazą, która aktualizuje odpowiedni wpis w §6 (lokalizacja, nazewnictwo, test referencyjny, polecenie uruchomienia). Po zakończeniu Modułu 3, §6 staje się kanoniczną odpowiedzią na pytanie „jak dodać test dla X w tym projekcie?” — i to, co `/10x-tdd` czyta w Lekcji 2.

### Granice lekcji

- Nie pisz kodu testowego. To jest Lekcja 2 (`/10x-tdd` i tworzenie testów jednostkowych).
- Nie konfiguruj hooków, cyklu życia hooków ani hooków debugowania. To jest Lekcja 3.
- Nie konfiguruj serwerów MCP, API Playwright, kodu e2e ani kodu scenariuszy multimodalnych. To jest Lekcja 4.
- Nie uruchamiaj przepływu pracy od błędu do poprawki do testu regresji. To jest Lekcja 5.
- Nie twórz potoków CI/CD od podstaw ani nie pisz YAML GitHub Actions. Przewodnik nazywa bramki; konfiguracja jest własnością Modułu 1 Lekcji 5 i Modułu 2 Lekcji 5.
- Nie testuj modeli multimodalnych. Cytuj kryteria (koszt, opóźnienie, przyjazność dla agenta), nigdy ranking.
- Nie czytaj bazy kodu w celu zdobycia wiedzy (grafy wywołań, schematy, „który plik jest właścicielem tej awarii”). To jest zadanie `/10x-research`, dla każdej fazy wdrożenia.

### Ścieżki używane w tej lekcji

- `context/foundation/test-plan.md` — umowa jakościowa tworzona i utrzymywana przez `/10x-test-plan`
- `context/foundation/prd.md` — główne źródło ryzyka
- `context/foundation/roadmap.md` — ważenie prawdopodobieństwa
- `context/foundation/tech-stack.md` — dane wejściowe stosu (jeśli są obecne)
- `context/archive/<change-id>/plan.md` — zaimplementowana powierzchnia ryzyka
- `context/changes/<change-id>/` — folder zmian dla każdej fazy wdrożenia (jeden na wiersz w §3)

<!-- END @przeprogramowani/10x-cli -->
