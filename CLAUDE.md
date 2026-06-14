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
