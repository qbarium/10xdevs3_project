# Rules for AI

This file provides guidance to AI Agent when working with code in this repository.

**Session pickup:** Jeśli istnieje `@docs/local/session-handoff.md`, przeczytaj go PIERWSZY — zawiera pozycję na łańcuchu workflow, preferencje użytkownika i otwarte decyzje z poprzedniej sesji. Bez niego kontynuuj normalnie z reszty tego pliku.

## Hard rules

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **API routes**: use uppercase `GET`, `POST` exports; validate input with zod.
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies.
- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.

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

## 10xDevs AI Toolkit — Moduł 1, Lekcja 5

Wybierz platformę wdrożeniową i wdróż do produkcji za pomocą **łańcucha infrastruktury**:

```
(/10x-init  →  /10x-shape  →  /10x-prd  →  /10x-tech-stack-selector  →  /10x-bootstrapper  →  /10x-agents-md  →  /10x-rule-review  →  /10x-lesson)  →  /10x-infra-research  →  Plan Mode deploy
```

Pełny łańcuch Modułu 1 obejmuje Lekcje 1–4 (ponownie włączone, aby można było naprawić wcześniejsze kontrakty w trakcie lotu). `/10x-infra-research` to główny temat lekcji; sam krok wdrożenia wykorzystuje wbudowany w hosta **Plan Mode**, a nie dedykowaną umiejętność — artefakt (`context/deployment/deploy-plan.md`) jest tym, co jest przekazywane dalej.

### Router zadań — Od czego zacząć

| Umiejętność                                                                                                                                                                                    | Kiedy jej używać                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Infrastruktura (główny temat lekcji)**                                                                                                                                                       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `/10x-infra-research [path-to-tech-stack-or-prd]`                                                                                                                                              | Masz `context/foundation/tech-stack.md` (i najlepiej `prd.md`) i musisz wybrać platformę wdrożeniową MVP. Umiejętność ładuje stos jako twarde ograniczenie, przeprowadza 5-pytaniowy wywiad z deweloperem (trwałe połączenia, wrażliwość na koszty, istniejąca znajomość, globalny zasięg, preferencje kolokacji), uruchamia równoległe badania subagentów na sześciu platformach kandydujących, ocenia je Pass/Partial/Fail według pięciu kryteriów przyjaznych agentom z `references/agent-friendly-criteria.md`, tworzy krótką listę trzech najlepszych i przeprowadza trójwymiarową kontrolę anty-uprzedzeniową lidera (adwokat diabła, pre-mortem, nieznane niewiadome) przed zapisaniem `context/foundation/infrastructure.md`. Użyj PO `/10x-tech-stack-selector`, PRZED `/10x-implement`. |
| **Wdrożenie (wbudowane w hosta, nie umiejętność)**                                                                                                                                             |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Plan Mode deploy                                                                                                                                                                               | Masz `infrastructure.md` + `tech-stack.md` i chcesz, aby plan tylko do odczytu został przejrzany przed wprowadzeniem jakichkolwiek zmian na platformie. Aktywuj tryb planowania hosta (Claude Code: `Shift+Tab` przełącza domyślny → auto-akceptacja → plan; IDE: dedykowany przycisk) z komunikatem "Wykonajmy pierwsze wdrożenie w oparciu o `@infrastructure.md`, zgodnie ze stackiem z `@tech-stack.md`". Przeczytaj plan, zażądaj poprawek, zatwierdź, a następnie pozwól agentowi wykonać. Zatwierdzony plan pozostaje w `context/deployment/deploy-plan.md`, dzięki czemu planowanie kamieni milowych w następnej lekcji może odwoływać się do tego, co już zostało wdrożone i które sekrety są już podłączone.                                                                            |
| **Ponowne uruchomienie upstream, jeśli to konieczne**                                                                                                                                          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `/10x-init` / `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-rule-review` / `/10x-lesson` / `/10x-stack-assess` / `/10x-health-check` | Zestawione, aby można było załatać wcześniejsze kontrakty w trakcie lotu. Jeśli kontrola anty-uprzedzeniowa wymusi zmianę platformy, która wpływa na decyzję dotyczącą stosu (np. "ta baza danych nie pasuje do żadnej platformy, którą byśmy zaakceptowali"), uruchom ponownie `/10x-tech-stack-selector`, aby utrzymać zgodność `tech-stack.md` i `infrastructure.md`.                                                                                                                                                                                                                                                                                                                                                                                                                          |

### Jak łańcuch przekazuje dane

- `/10x-infra-research` odczytuje `context/foundation/tech-stack.md` (język, framework, środowisko uruchomieniowe, baza danych) jako **twarde ograniczenia** — platformy, które nie mogą uruchomić stosu, są odrzucane przed oceną. Odczytuje również `context/foundation/prd.md` (skala, opóźnienia, oczekiwania dotyczące czasu pracy) jako **miękkie wagi** podczas oceniania. Oba wejścia są opcjonalne, ale zdecydowanie zalecane; bez nich umiejętność działa, ale ostrzega.
- Umiejętność zapisuje `context/foundation/infrastructure.md` jako trzeci kontrakt podstawowy: frontmatter (`project`, `researched_at`, `recommended_platform`, `runner_up`, `context_type`, `tech_stack`) plus treść obejmującą rekomendację, pełne porównanie platform z macierzą punktacji, wyniki anty-uprzedzeniowe, historię operacyjną (podgląd / sekrety / wycofywanie / zatwierdzanie / logi) oraz rejestr ryzyka, wiążący każdy wpis z soczewką, która go ujawniła. W przypadku kolizji umiejętność pyta: nadpisać, zapisać jako `infrastructure-v2.md` lub przerwać.
- Plan Mode odczytuje `infrastructure.md` i `tech-stack.md` razem. Agent emituje plan krok po kroku, obejmujący zautomatyzowane kroki, które wykonuje, ręczne bramki konfiguracji (tworzenie konta, konfiguracja sekretów), dokładne polecenia wdrożenia (polecenia Pages vs Workers NIE są zamienne na Cloudflare — plan musi to określać) oraz kroki weryfikacji. Plan jest odrzucany/edytowany, dopóki nie będzie poprawny; dopiero wtedy Plan Mode kończy działanie i rozpoczyna się wykonanie. Zatwierdzony plan trafia do `context/deployment/deploy-plan.md` i jest wykorzystywany przez umiejętności planowania kamieni milowych jako źródło prawdy o tym, "co już zostało wdrożone".

### Co umiejętności lekcji obejmują (a czego NIE)

- **`/10x-infra-research` obejmuje**: krótką listę platform ocenionych według pięciu kryteriów przyjaznych agentom (jakość CLI, stopień zarządzania/serverless, dokumentacja czytelna dla agenta, stabilne/skryptowalne API wdrożeniowe, MCP lub integracja agenta pierwszej klasy), trzy wyniki anty-uprzedzeniowe dotyczące lidera (ponumerowane słabości, 150–200-słowowa narracja o awarii, 3–5 nieznanych niewiadomych), historię operacyjną z jedną konkretną odpowiedzią na oś (nie kategorie) oraz rejestr ryzyka, w którym każdy wiersz nazywa swoją soczewkę źródłową (`Devil's advocate` / `Pre-mortem` / `Unknown unknowns` / `Research finding`). Status każdej funkcji niebędącej w GA jest przechwytywany w tekście (`beta` / `preview` / `region-limited` / `deprecated`) z datą sprawdzenia statusu.
- **`/10x-infra-research` NIE** tworzy obrazów Docker ani nie pisze Dockerfile'ów, nie konfiguruje potoków CI/CD ani nie planuje poza zakresem MVP (wieloregionowe HA jest wyraźnie poza zakresem). NIE decyduje za Ciebie — użytkownik akceptuje, zamienia na drugiego w kolejności lub przerywa po kontroli krzyżowej, a ta decyzja jest rejestrowana w wynikach.
- **Plan Mode** obejmuje: wyraźną bramkę ludzką między "agent ma plan" a "agent zmienia produkcję". Artefakt (`deploy-plan.md`) jest ścieżką audytu dla "co miało się wydarzyć", gdy uruchomienie na żywo pójdzie nie tak. Plan Mode NIE zastępuje `/10x-infra-research` (decyzja o platformie musi być już podjęta — Plan Mode planuje wdrożenie, nie wybiera miejsca wdrożenia).

### Pięć kryteriów przyjaznych agentom (i dlaczego są one kluczowe)

Kryteria, które tworzą macierz punktacji `/10x-infra-research`, nie są ogólnymi osiami "dobrej platformy" — są to specyficzne cechy, które określają, czy agent może obsługiwać tę platformę z sesji bez Twojej pomocy:

1. **CLI-first** — każda rutynowa operacja ma udokumentowane polecenie; agent nie musi klikać w panelu.
2. **Managed / serverless** — mniej ruchomych części oznacza mniej sposobów, w jakie agent (lub Ty) może coś zepsuć, co platforma miała obsłużyć.
3. **Agent-readable docs** — dokumentacja w formacie markdown / `llms.txt` / hostowana na GitHubie, którą agent może pobrać i przeanalizować, a nie strony marketingowe renderowane w JS.
4. **Stable, scriptable deploy API** — przewidywalne kody wyjścia, ustrukturyzowane dane wyjściowe, brak interaktywnych monitów w trakcie wdrożenia.
5. **MCP server or first-class agent integration** — bonus, nie wymagane. Samo CLI wystarczy dla MVP; MCP sprawdza się, gdy agent wykonuje dziesiątki ustrukturyzowanych zapytań do stanu na żywo.

Twarde filtry stosuje się przed punktacją (wymóg trwałego połączenia odrzuca Netlify/Vercel tylko serverless; niezgodność środowiska uruchomieniowego stosu technologicznego całkowicie odrzuca platformę). Odpowiedzi na wywiad ponownie ważą kryteria później — wrażliwość na koszty karze drogie podstawowe poziomy, znajomość rozstrzyga remisy, preferencje globalnego zasięgu faworyzują platformy edge-native, preferencje kolokacji faworyzują zintegrowane bazy danych.

### Anty-uprzedzenia jako dyscyplina decyzyjna (nie teatr)

Każda rozmowa badawcza z LLM ma wbudowane skłonności do tego, co użytkownik już zasygnalizował. `/10x-infra-research` uruchamia trzy ustrukturyzowane soczewki przeciwko liderowi ZANIM plik zostanie zapisany, a nie po:

- **Devil's advocate** — _znajdź słabości, ukryte koszty i tryby awarii specyficzne dla wdrożenia `<tego stosu>` na `<tej platformie>`_. Wynikiem jest numerowana lista 3–5 konkretów, a nie kategorii.
- **Pre-mortem** — _sześć miesięcy później ta decyzja okazała się kompletną katastrofą; przeanalizuj założenia i niedoszacowane ryzyka, które do tego doprowadziły_. Wynikiem jest narracja o długości 150–200 słów; narracje ujawniają konkretne kształty awarii, które abstrakcyjne listy ryzyka ukrywają.
- **Unknown unknowns** — _co jest prawdą o tej kombinacji, czego strona marketingowa i dokumentacja nie ujawniają w oczywisty sposób?_ Wynikiem jest 3–5 nieoczywistych ryzyk.

Po kontroli krzyżowej użytkownik ma trzy realne opcje: **kontynuować z liderem i włączyć ryzyka do rejestru**, **zamienić na drugiego w kolejności** (i ponownie uruchomić kontrolę krzyżową na nowym liderze) lub **zamienić na trzecie miejsce**. Trzecia opcja jest rzadka; jeśli nigdy się nie zdarza w wielu uruchomieniach, kontrola krzyżowa zdegradowała się do rytuału i powinna zostać przepisana.

Dwie dodatkowe techniki (nie wymagające umiejętności, surowe podpowiedzi) należą do tego samego zestawu narzędzi: zmuszanie modelu do porównania trzech alternatyw w tabeli markdown (struktura jest lepsza niż "ta sama odpowiedź w różnych słowach) oraz rotacja ról (ta sama decyzja oczami dewelopera frontendowego, osoby odpowiedzialnej za bezpieczeństwo i właściciela kosztów — ujawnienie kosztów, jakie ponosi każda rola, i zaproponowanie alternatyw, jeśli którakolwiek z nich się wzdrygnie).

### CLI vs MCP dla operacyjności infrastruktury na żywo

Po wdrożeniu agent potrzebuje sposobu na komunikację z działającą platformą. Dwie ścieżki, uzupełniające się, a nie konkurujące:

- **CLI** (`wrangler`, `flyctl`, `vercel`, `gh`) — jawne i audytowalne, dane wyjściowe pozostają w terminalu, bezpieczniejsze wartości domyślne dla nieodwracalnych działań (np. `netlify deploy` domyślnie jest szkicem; należy przekazać `--prod`). Najlepsze dla MVP: minimalna konfiguracja, niski koszt kontekstu (brak wstępnie załadowanych schematów narzędzi), a agent musi znać polecenie (w czym pomaga umiejętność dla każdego narzędzia).
- **MCP** — dedykowany serwer udostępniający ustrukturyzowane narzędzia ze schematami (`pages_deployments_list` itp.). Każdy podłączony serwer MCP dodaje definicje narzędzi do okna kontekstu, więc koszt rośnie wraz z liczbą serwerów. Sprawdza się, gdy agent wykonuje wiele zapytań typu discovery do stanu na żywo (logi, różnice w wdrożeniach), a ustrukturyzowany JSON jest lepszy niż parsowanie danych wyjściowych CLI.

Rozsądna wartość domyślna: zacznij od CLI, dodaj MCP, gdy zauważysz powtarzający się wzorzec przechodzenia przez `--help`, który agent musi wykonać, aby odpowiedzieć na klasę pytań. Własne ramy Anthropic [building-agents-that-reach-production](https://claude.com/blog/building-agents-that-reach-production-systems-with-mcp) mówią, że "API, CLI i MCP to trzy uzupełniające się ścieżki" — wybieraj według zadania, a nie według szumu.

### Granica dostępu do produkcji (minimalne uprawnienia, człowiek przy nieodwracalnych operacjach)

Zarówno CLI, jak i MCP mogą dać agentowi bezpośredni dostęp do produkcji. Lekcja ustala domyślną postawę:

- **Tokeny są ograniczone, a nie klucze główne.** Na Cloudflare: token API ograniczony do Pages lub Workers dla jednego projektu, bez DNS, bez Workers Secrets dla niepowiązanych projektów, bez rozliczeń. Odpowiednik AWS / GCP: ograniczona rola IAM z `console-only-user` lub tylko do odczytu na produkcji, pełny dostęp na środowisku staging.
- **Tokeny znajdują się w zmiennych środowiskowych, a nie w `.mcp.json` zatwierdzonym w repozytorium.** Agent pobiera je za pośrednictwem serwera MCP lub wykrywania środowiska CLI, a nie w postaci jawnego tekstu w rozmowie.
- **Destrukcyjne działania są tylko dla ludzi.** Usunięcie bazy danych, rotacja głównego sekretu, usunięcie projektu — to operacje wykonywane ręcznie w panelu, nawet jeśli agent je sugeruje. Ręczne kliknięcie kosztuje 30 sekund; sprzątanie po zautomatyzowanym błędzie kosztuje godziny.

To jest postawa MVP. W miarę dojrzewania projektu naturalną ewolucją jest pełny dostęp agenta do środowiska staging, a produkcja staje się tylko do odczytu — omówione w późniejszych modułach.

### Ścieżki podstawowe używane w tej lekcji

- `context/foundation/tech-stack.md` — dane wejściowe (przekazanie z Lekcji 2, twarde ograniczenia)
- `context/foundation/prd.md` — dane wejściowe (przekazanie z Lekcji 1, miękkie wagi)
- `context/foundation/infrastructure.md` — dane wyjściowe (trzeci kontrakt podstawowy)
- `context/deployment/deploy-plan.md` — dane wyjściowe wdrożenia w trybie Plan Mode (ścieżka audytu "co miało się wydarzyć")
- `context/foundation/lessons.md` — powtarzające się zasady i pułapki (użyj `/10x-lesson` z Lekcji 4, jeśli zauważysz klasę błędów agenta podczas badań lub wdrożenia)
- `docs/reference/contract-surfaces.md` — rejestr kluczowych nazw

### Uniwersalny język

Dostarczona umiejętność nie zawiera odniesień do 10xDevs / kohorty / certyfikacji. Lista platform kandydujących (Cloudflare, Vercel, Netlify, Fly.io, Railway, Render) jest początkową soczewką badawczą, a nie zestawem rekomendacji — kluczowe są potok punktacji + wywiad + kontrola krzyżowa, a platformę nieobecną na domyślnej liście można dodać, rozszerzając krok badawczy. Pięć kryteriów przyjaznych agentom to prawdziwy rdzeń artefaktu; `/10x-infra-research` ponownie odczytuje je z `references/agent-friendly-criteria.md`, aby ewoluowały wraz z platformami.

Umiejętności nie mogą zapisywać do `context/archive/`. Zarchiwizowane zmiany są niezmienne; jeśli rozwiązana ścieżka docelowa zaczyna się od `context/archive/`, przerwij z komunikatem: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
