# S-12 dup-react-ssr-dev-fix — Krótki plan

> Pełny plan: `context/changes/dup-react-ssr-dev-fix/plan.md`
> Badania: `context/changes/dup-react-ssr-dev-fix/research.md`

## Co i dlaczego

Naprawiamy wyścig „Invalid hook call / more than one copy of React", który wywala render SSR wysp React (`/import-sessions`, `/items*`) w `npm run dev`. To trzecia próba (S-08 i S-10 ogłosiły „naprawione" fałszywie). Dług techniczny **wyłącznie dev** — build prod jest czysty.

## Punkt wyjścia

`astro.config.mjs` przypina obecnie tylko `astro/env/runtime` w `ssr.optimizeDeps.include`. Badanie dowiodło na dysku (`deps_ssr/_metadata.json`, ogon 4801–4890), że **cała populacja ~14 zależności** (rodzina React + `@supabase/ssr`, `zod`, `sonner`, `lucide-react`, `radix-ui`, `@radix-ui/react-slot`, `cva`, `clsx`, `tailwind-merge`) siedzi jako „późno odkryte". Każda z nich, odkryta w trakcie sesji, wyzwala re-optymalizację Vite, która rozjeżdża generacje `?v=` Reacta w jednym renderze SSR.

## Pożądany stan końcowy

Na zimnym starcie `npm run dev` (cache odstawiony BEZ `--force`) pełna sesja — middleware → render wysp → otwarcie dialogu edycji itemu → trasa API — daje w logu dev **zero** `optimized dependencies changed. reloading` i **zero** `Invalid hook call`. Developer przestaje widzieć crash na `/import-sessions`.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
| --- | --- | --- | --- |
| Zakres pinu | Cała populacja (~14 depów) | Sam split zachodzi przy dowolnej reopt — tylko przypięcie wszystkich daje kryterium „zero reopt" | Plan |
| `ssr.noExternal` | Zostaw + popraw komentarz | Ma udowodniony efekt w `deps_astro`; komentarz obecnie kłamie o `deps_ssr` | Plan |
| Parytet top-level | Empirycznie: ssr-only, potem dobierz | Niepewne, czy `deps_astro` aktywuje się na workerd — config ma odzwierciedlać dowód, nie spekulację | Plan |
| Rygor weryfikacji | Pełny protokół + guard | To trzecia próba; pokrycie dialog/API + trwały wpis przeciw czwartemu fałszywemu „naprawione" | Plan |
| Zakazane | Bez downgrade React / `audit fix --force` | Twarde zakazy z `lessons.md` | Badania |

## Zakres

**W zakresie:** edycja `ssr.optimizeDeps.include` + rewizja komentarza `ssr.noExternal` w `astro.config.mjs`; deterministyczna weryfikacja ręczna; wpis do `lessons.md` + procedura repro.

**Poza zakresem:** downgrade zależności, `audit fix --force`, usunięcie `ssr.noExternal`, ruszanie `resolve.dedupe`, zmiany prod (build Rollupa nie ma tej klasy błędu).

## Architektura / Podejście

Ten sam wzorzec co fix S-10 (`astro/env/runtime`), zastosowany kompleksowo: przypiąć całą populację późno-odkrywanych depów, by cold-scan Vite złapał je od razu i żadna mid-session re-opt nie odpaliła podczas renderu wysp. Astro 6 ma trzy środowiska optymalizatora (`deps/`, `deps_ssr/`, `deps_astro/`); pin celuje w `deps_ssr` (ścieżka crashu), a parytet dla `deps_astro` dobierany empirycznie.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Pin + komentarz | Edycja `astro.config.mjs` (15 specyfikatorów + poprawiony komentarz) | `react-dom/server` musi rozwiązać się przez warunek edge/workerd |
| 2. Weryfikacja + parytet | Dowód zero-reopt na pełnej sesji; decyzja o `deps_astro` | Luka pokrycia (dialog/API) = fałszywy zielony, jak w S-10 |
| 3. Guard regresji | Wpis `lessons.md` + procedura repro | Nowy dep wyspy przywróci problem po cichu bez reguły utrzymania |

**Wymagania wstępne:** lokalny dev (Docker/Supabase dla pełnej sesji), możliwość otwarcia dialogów w UI.
**Szacowany nakład pracy:** ~1 sesja; Faza 1 trywialna (edycja config), ciężar w Fazie 2 (~15–20 min weryfikacji ręcznej).

## Otwarte ryzyka i założenia

- **Determinizm `deps_astro` na workerd** (Open Question 3 badania) — rozstrzygany empirycznie w Fazie 2; jeśli aktywuje się z późną populacją, dokładamy top-level parytet.
- **Rozdzielczość `react-dom/server`** pod adapterem edge — oczekiwane, że Vite honoruje warunek; jeśli cold-start rzuci resolve error, sprawdzić wariant zanim się obejdzie pin.
- Weryfikacja jest **wyłącznie ręczna** (człowiek) — nie da się jej tanio zautomatyzować w CI (błąd to przejściowy wyścig dev).

## Kryteria sukcesu (podsumowanie)

- Zimny start (bez `--force`) + pełna sesja (middleware + wyspy + dialog `zod` + API `zod`): **zero** `optimized dependencies changed. reloading` i zero `Invalid hook call`.
- Strukturalnie: rodzina React + populacja na **początku** `optimized` w `deps_ssr/_metadata.json`.
- Trwały guard: reguła w `lessons.md` + procedura repro, by przyszły dep wyspy nie przywrócił problemu.
