---
date: 2026-07-01T18:39:35+02:00
researcher: Jakub
git_commit: ee6ab133b1fc0f6c2e1e4e2646948236cd15ddbb
branch: main
repository: 10xdevs3_project
topic: "S-12 dup-react-ssr-dev-fix — bieżący trigger re-optymalizacji Vite powodujący «more than one copy of React» w dev SSR"
tags: [research, codebase, vite, optimizeDeps, astro, react-ssr, dev-only, S-12]
status: complete
last_updated: 2026-07-01
last_updated_by: Jakub
---

# Research: S-12 dup-react-ssr-dev-fix — bieżący trigger re-optymalizacji Vite

**Date**: 2026-07-01T18:39:35+02:00
**Researcher**: Jakub
**Git Commit**: ee6ab133b1fc0f6c2e1e4e2646948236cd15ddbb
**Branch**: main
**Repository**: 10xdevs3_project (qbarium/10xdevs3_project)

## Research Question

Błąd „Invalid hook call / more than one copy of React" wciąż wywala render SSR `/import-sessions` w `npm run dev`, mimo dwóch wcześniejszych deklaracji „naprawione" (S-08, S-10). Kryterium `reopt_fired=0` z podejścia S-10 okazało się niewystarczające. Zadanie S-12 (dług techniczny, dev-only): **ustalić aktualny trigger re-optymalizacji zależności Vite**, który rozjeżdża generacje `?v=` Reacta (core vs `react-dom/server`) w jednym renderze SSR — oraz podać metodykę deterministycznego odtworzenia trybu awarii i kierunek eliminacji dla `/10x-plan`.

## Summary

**Nie istnieje pojedynczy „nowy" trigger. Istnieje cała *populacja* późno odkrywanych zależności** — a poprzednie fixy przypięły z niej dokładnie jedną (`astro/env/runtime`).

Rozstrzygający dowód to faktyczny cache optymalizatora dev na dysku: `node_modules/.vite/deps_ssr/_metadata.json` (ścieżka renderu wysp = ścieżka crashu). W jego ogonie `optimized` (linie ~4801–4890), **doklejone po ~4800 liniach cold-scanu**, siedzą jako *późno odkryte*: cała rodzina React (`react` 4801, `react-dom/server.edge.js` 4825), `@supabase/ssr` (4837), `sonner` (4867), `lucide-react` (4855), `radix-ui` (4861), `@radix-ui/react-slot` (4831), `class-variance-authority` (4843), `clsx` (4849), `tailwind-merge` (4873), `zod` (4879). **Przypięty (force-included) jest tylko `astro/env/runtime`** (linia 7). Każda z tych ~15 zależności, odkryta w trakcie sesji, wyzwala re-optymalizację (`optimized dependencies changed. reloading`), która bumpuje `browserHash` środowiska SSR — a jeśli w tym samym renderze `react` (core) jest już rezydentny pod starym hashem, a `react-dom/server` doładowuje się pod nowym (lub odwrotnie) → dwie instancje Reacta → „more than one copy of React".

Trzy najważniejsze wnioski, które korygują dotychczasowy model:

1. **`ssr.noExternal:["react","react-dom"]` NIE chroni ścieżki crashu.** Dysk pokazuje React w pełni zoptymalizowany (`?v=`) w `deps_ssr` — premisa komentarza z `astro.config.mjs:28-38` („bundluj Reacta do grafu SSR zamiast serwować z wersjonowanych chunków") **nie trzyma się** na środowisku, które faktycznie renderuje wyspy.

2. **Astro ma trzy środowiska optymalizatora, a dwa pokrętła configu trafiły w różne.** `optimizeDeps.include`/`ssr.optimizeDeps.include` dosięgły `deps_ssr` (`astro/env/runtime` przypięty, linia 7), ale **nie** `deps_astro` (tam `astro/env/runtime` znów jest późny — linia 1213); `ssr.noExternal` zadziałało w `deps_astro` (brak Reacta), ale **nie** w `deps_ssr`. Legacy-klucze `ssr.*` mapują się nierówno na środowiska Vite w Astro 6.

3. **`reopt_fired=0` był chwiejny z zasady, nie z pecha.** `?v=` to per-środowiskowy `browserHash`, a rozjazd generacji jest **przejściowy** — istnieje tylko w oknie samej re-optymalizacji (moduły starej generacji już załadowane, gdy moduły nowej dochodzą w tym samym renderze). Ustabilizowany snapshot na dysku **nigdy** nie pokaże rozjazdu (dlatego „jeden zielony render" nigdy nie był dowodem), a pojedynczy pomiar `reopt_fired` łapie tylko tę ścieżkę żądań, którą akurat wykonano.

**S-11 (`session-log-filter-ux`) jest niewinny.** Wbrew ostrzeżeniu z follow-upu, hook filtrów S-11 **nie dołożył żadnej nowej zależności third-party ani głębokiego/warunkowego importu** do grafu wyspy `/import-sessions`. Każda biblioteka dotykana przez filtry (`radix-ui`/Select, `lucide-react`, `sonner`, `Button`) była już w grafie od S-10; nowe pliki S-11 są bezzależnościowe (wbudowane `URLSearchParams`/`localStorage`). Trigger nie jest regresją S-11 — to residual S-10, który S-10 sam przewidział.

## Detailed Findings

### 1. Graf importów SSR wysp React — co realnie ląduje w renderze

Wszystkie dyrektywy klienta w projekcie to `client:load` (brak `visible`/`idle`/`only`/`media`). Strony istotne dla crashu:

- `src/pages/import-sessions.astro:52` → `<ImportSessionsView client:load>` (import `:4`).
- `src/pages/items.astro:42` → `PendingItemsView`; `src/pages/items/{active,cancelled,done}.astro` → `AcceptedItemsView`; `src/pages/items/trash.astro` → `TrashItemsView`.

Poddrzewo wyspy `/import-sessions` (klient) osiąga: `react` (`ImportSessionsView.tsx:10`), `lucide-react` (`:9`, `SessionRow.tsx:11`), `sonner` (`ui/sonner.tsx:1`, użyte w `ImportSessionsView.tsx:22`), `radix-ui` (`ui/select.tsx:2`, `ui/dialog.tsx:3`), `@radix-ui/react-slot` (`ui/button.tsx:2`), `class-variance-authority` (`ui/button.tsx:3`), `clsx`+`tailwind-merge` (`lib/utils.ts:1-2`), oraz — przez most `ImportSessionsView → SessionItemsPanel (:16) → EditItemDialog (SessionItemsPanel.tsx:13)` — cały poddrzewo dialogu itemów łącznie z `zod` (`lib/ai/schema.ts:5`, `lib/validation/items.ts:6` przez importy **wartości** `ITEM_TYPES`/`OPERATIONAL_STATUSES`).

Server-only (frontmatter `.astro` + `Layout.astro` + `middleware.ts`): `@supabase/ssr` (`src/lib/supabase.ts:1`), `astro:env/server` → `astro/env/runtime` (`src/lib/supabase.ts:3`, `src/lib/config-status.ts:1`). `@supabase/supabase-js` jest wyłącznie **type-only** (`src/lib/services/import-session.ts:6`, `items.ts:8`) → wymazywane w kompilacji, nie jest osobną jednostką runtime (jedzie w chunku `@supabase/ssr`).

**Kluczowy niuans:** `react-dom/server` **nie jest** importowany nigdzie w `src/` — wstrzykuje go renderer `@astrojs/react` (`astro.config.mjs:12`), by SSR-ować wyspy pod adapterem Cloudflare/workerd (na dysku: `react-dom/server.edge.js`). Na stronach crashu powierzchnia runtime Reacta to więc dokładnie `react` (kod wyspy) vs `react-dom/server` (renderer frameworka) — dwie strony zgłaszanego rozjazdu.

### 2. Cache `.vite` na dysku — smoking gun (trzy środowiska)

Cache istnieje (zapisany w jednej sesji `2026-07-01T17:47`), z trzema środowiskami, każde z własnym `_metadata.json` (ten sam `lockfileHash: 2d59a462`, różne `configHash`):

- **`deps/` — KLIENT** (`browserHash 05f502c6`): `astro/env/runtime` przypięty (linia 7). Zawiera `react`, `react-dom`, `react-dom/client`, jsx-runtime, UI-libs, `zod`. Brak `react-dom/server` (poprawnie). Re-opt tutaj → reload przeglądarki, **nie** crash SSR.
- **`deps_ssr/` — RENDER WYSP (ścieżka crashu)** (`browserHash 80730772`): `astro/env/runtime` przypięty na linii 7, ale **rodzina React + wszystkie deps aplikacji są w ogonie „późno odkrytych"** (linie 4801–4890, po ~4800 liniach cold-scanu astro-runtime/prismjs). `react-dom/server.edge.js` (4825) potwierdza render wysp pod adapterem edge. **`ssr.noExternal` tu nie zadziałało** — React jest chunkiem `?v=`.
- **`deps_astro/` — drugie środowisko SSR** (`browserHash 1dbd37ba`): **brak** react/react-dom/server i UI-libs (tu `noExternal` zadziałało), ale `astro/env/runtime` jest ostatnią pozycją `optimized` (**linia 1213**) = późno odkryty → **force-include tu nie dotarł**.

Na hashach: `?v=` doklejany do URL-i optymalizatora to pojedynczy per-środowiskowy `browserHash`, nie per-plikowy `fileHash`. W ustabilizowanym snapshocie wszystkie deps dzielą jeden `browserHash` (więc `react` i `react-dom/server` *aktualnie zgadzają się* na dysku). Rozjazd to stan **przejściowy** wyłącznie w trakcie re-optymalizacji — dlatego snapshot nie może go pokazać.

### 3. Mechanika `optimizeDeps` (Vite 7 / Astro 6)

- **Zimny start:** esbuild statycznie skanuje crawlowalne entry (`.astro`, referowane `.ts/.tsx`) i pre-bundluje znalezione do `deps*/`; `browserHash` liczony raz.
- **Re-optymalizacja w trakcie sesji** (`optimized dependencies changed. reloading`): odpala, gdy żądanie wciąga *bare import* spoza zbioru cold-scanu. Vite dokleja nowego, przelicza optymalizację i **nowy `browserHash`**. Moduł już zaimportowany pod starym `browserHash`, stojący w rejestrze modułów SSR obok modułu importowanego teraz pod nowym → druga instancja. Dla Reacta: `react` (stara gen) + `react-dom/server` (nowa gen) w jednym renderze → „Invalid hook call".
- **Klasy późno odkrywanych depów** (spoza cold-scanu, pojawiają się na pierwszym żądaniu):
  - osiągalne tylko przez **render strony SSR** (poddrzewo wyspy React ciągnięte przy `client:load`) — `react-dom/server`, `lucide-react`, `sonner`, `radix-ui`;
  - osiągalne tylko przez **`src/middleware.ts`** (odpala na pierwszym żądaniu *każdej* trasy) — `@supabase/ssr`;
  - osiągalne tylko przez **API route** (`src/pages/api/**`) — `zod` na trasach item-detail/session-items/classify;
  - osiągalne tylko przez **dynamiczny `import()`** lub **wirtualne moduły `astro:*`** rozwiązywane w runtime — `astro/env/runtime` (dlaczego S-10 musiał je przypiąć).

### 4. Historia S-08 → S-10 → S-11 i dlaczego `reopt_fired=0` zawiódł

- **S-08** (`2026-06-13-import-session-log-retry`, fix `c5f5788`): pierwsza konfiguracja — tylko `resolve.dedupe` + `ssr.noExternal` dla `react`/`react-dom`. Kryterium „naprawione" = **pojedynczy udany render prod** (`npm run preview` → `200 OK`) + jeden ręczny retry. Świadomie zaakceptowano residualne ryzyko dev. Niewystarczające — S-10 to obalił.
- **S-10** (`2026-06-24-session-items-detail`, follow-up `review-fixes.md`): impl-review **odtworzył crash na żywo** na zimnym starcie mimo odhaczonego kryterium 3.8 (log: `✨ new dependencies optimized: astro/env/runtime` → `reloading` → `Invalid hook call`; dwie generacje `?v=` `18bd8eab` vs `0ba053fe`). Fix: pre-bundling `astro/env/runtime` (`optimizeDeps.include` + `ssr.optimizeDeps.include`). Weryfikacja: `reopt_fired` na zimnych startach (baseline `1` → fix `0`×3). **Residual (dosłownie):** „*Gdyby kiedyś pojawił się INNY późno odkrywany dep i wrócił reopt → dorzucić go do `optimizeDeps.include` (ten sam wzorzec).*" — to dokładnie obecna sytuacja.
- **S-11** (`2026-06-28-session-log-filter-ux`): config **nietknięty** względem S-10. S-11 jawnie odłożył fix dup-React do S-12; jego `research.md:38` (KOREKTA) przyznaje, że bug **wciąż żyje w `npm run dev`**, więc weryfikację ręczną prowadzono na `npm run preview`. **S-11 nie dołożył nowej zależności** do grafu wyspy — dowód commitami: `radix-ui`/Select weszło w S-10 (`SessionItemsPanel`→`EditItemDialog`→`ui/select`), `lucide-react` w S-08 (`SessionRow`, `081227a`); nowe pliki S-11 (`session-list-criteria.ts`, `page-size-pref.ts`, `session-pagination.ts`, `useSessionList.ts`) są bezzależnościowe.

**Dlaczego `reopt_fired=0` był fałszywie zielony:** (a) ustabilizowany snapshot nigdy nie pokazuje przejściowego rozjazdu; (b) hammer S-10 (curl na trasy chronione) pokrywał *jedną* ścieżkę żądań — nie otwierał dialogów (`zod`) i mógł nie trafić w okno re-opt renderu wyspy; (c) kryterium mierzyło „nie złapaliśmy reopt", a nie „wyeliminowaliśmy *populację* późnych depów". Przy ~15 nieprzypiętych depach zerowy pomiar to funkcja pokrycia testu, nie dowód strukturalny.

## Root Cause (skonsolidowana)

Środowisko optymalizatora dev, które renderuje wyspy React (`deps_ssr`), pozostawia **całą rodzinę React i wszystkie deps aplikacji jako późno odkrywane**; przypięty jest tylko `astro/env/runtime`. Dowolna z tych zależności odkryta w trakcie sesji bumpuje `browserHash` środowiska SSR; jeśli trafi w okno, gdy `react` (core) i `react-dom/server` są ładowane w poprzek generacji jednego renderu → „more than one copy of React". Poprzednie fixy (`dedupe` + `ssr.noExternal` w S-08; pin `astro/env/runtime` w S-10) zredukowały, ale **nie wyeliminowały** triggera — bo `noExternal` nie objęło `deps_ssr`, a pin objął jedną z ~15 pozycji.

## Ranked current trigger candidates

Wszystkie potwierdzone jako późno odkryte w `deps_ssr/_metadata.json` (ogon 4801–4890). Ranking wg prawdopodobieństwa rozjazdu Reacta w jednym renderze wyspy:

1. **`react-dom/server` (`react-dom/server.edge.js`, 4825)** — najwyższa wartość naprawy: entry renderera SSR, odkrywany dokładnie przy pierwszym renderze wyspy; musi współdzielić generację z `react` (4801). Jego własne późne odkrycie to najbardziej bezpośrednia droga do bumpa `browserHash`, gdy `react` core jest już rezydentny.
2. **`@supabase/ssr` (4837)** — najwcześniejszy późny dep sesji (middleware, pierwsze żądanie, przed renderem). Wysokie prawdopodobieństwo bycia pierwszym reopt sesji.
3. **`sonner` (4867), `lucide-react` (4855), `radix-ui` (4861)** — największe UI-deps importowane wprost przez crashujące poddrzewo; odkrywane w trakcie renderu, czyli w oknie między `react` a `react-dom/server`.
4. **`@radix-ui/react-slot` (4831), `class-variance-authority` (4843), `clsx` (4849), `tailwind-merge` (4873)** — ciągnięte przez `ui/button.tsx`; to samo okno renderu.
5. **`zod` (app, 4879)** — odkrywany na trasach API/detail i w łańcuchu classify; trigger sesyjny (nie „pierwszego malowania").

## Fix direction (dla `/10x-plan` — NIE implementować tutaj)

Ten sam wzorzec co fix S-10, **zastosowany kompleksowo** zamiast do jednego depu: przypiąć obecnie-późną populację, by cold-scan złapał ją od razu i żadna re-opt w trakcie sesji nie odpaliła.

- **Minimum (właściwy inwariant — rodzina React)** w `ssr.optimizeDeps.include`: `react`, `react-dom`, `react-dom/server`, `react/jsx-runtime`, `react/jsx-dev-runtime`.
- **Robust (eliminacja całej populacji triggerów)** — dołożyć: `@supabase/ssr`, `zod`, `sonner`, `lucide-react`, `radix-ui`, `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`.
- **Parytet środowisk:** wyrazić include także na **top-level `optimizeDeps.include`** (nie tylko pod `ssr`), bo Astro mapuje legacy `ssr.*` nierówno na środowiska Vite — inaczej `deps_astro` (i potencjalnie inne) nie zostaną zaseedowane.
- **Rewizja `ssr.noExternal`:** dysk dowodzi, że nie chroni ścieżki crashu — premisę komentarza `astro.config.mjs:28-38` należy zweryfikować, a nie jej ufać. Pin rodziny React w `ssr.optimizeDeps.include` to niezawodna dźwignia.
- **Zakazane** (z `lessons.md`): `npm audit fix --force`, downgrade React, poleganie wyłącznie na `dedupe` + `noExternal`.

## Verification / repro methodology (deterministyczna)

Kryterium „naprawione" (z `change.md` i `lessons.md`): **BRAK `optimized dependencies changed. reloading` na zimnym starcie**, na sesji która realnie przechodzi wszystkie klasy późnych depów.

Procedura:
1. **Odstaw cache BEZ `--force`:** usuń `node_modules/.vite` i `.astro` (`--force` tłumi re-optymalizację → fałszywy zielony wynik). Nie usuwaj `node_modules`.
2. **Zimny start** `npm run dev`.
3. **Wykonaj prawdziwy tryb awarii — pokryj wszystkie ścieżki późnego odkrycia**, których hammer S-10 nie pokrył:
   - pierwsze żądanie przez middleware (`@supabase/ssr`),
   - render wyspy `/import-sessions` **oraz** `/items*` (`react-dom/server`, `lucide-react`, `sonner`, `radix-ui`, `button→cva/clsx/tailwind-merge`),
   - **otwarcie dialogu edycji/dodawania** itemu (ścieżka `zod` — kluczowa luka pokrycia S-10),
   - trafienie trasy API z `zod` (`/api/items/[id]`, `/api/import-sessions/[id]/items`, classify).
4. **Sukces** = w logu dev **zero** wystąpień `optimized dependencies changed. reloading` **i** zero `Invalid hook call` na pełnej sesji dotykającej powyższych ścieżek. Dodatkowo: inspekcja `deps_ssr/_metadata.json` — cała rodzina React i przypięte deps na **początku** `optimized` (nie w ogonie).
5. **NIE jest dowodem:** zielony `npm run build` (przy `output:"server"` nie SSR-uje stron), pojedynczy zimny render, sesja z `--force`, `reopt_fired=0` bez pokrycia ścieżki dialogu/API.

## Code References

- `astro.config.mjs:16-18` — `resolve.dedupe:["react","react-dom"]` (rozdzielczość, nie kontrola `?v=`).
- `astro.config.mjs:25-27` — `optimizeDeps.include:["astro/env/runtime"]` (klient).
- `astro.config.mjs:28-44` — `ssr.noExternal` + `ssr.optimizeDeps.include:["astro/env/runtime"]` (komentarz zakłada bundling Reacta do grafu SSR — dysk to obala).
- `node_modules/.vite/deps_ssr/_metadata.json:7` — `astro/env/runtime` przypięty; `:4801-4890` — ogon późno odkrytych (react, react-dom/server.edge.js, @supabase/ssr, sonner, lucide-react, radix-ui, zod, cva, clsx, tailwind-merge).
- `node_modules/.vite/deps_astro/_metadata.json:1213` — `astro/env/runtime` późny (force-include nie dotarł).
- `node_modules/.vite/deps/_metadata.json:7` — klient, `astro/env/runtime` przypięty.
- `src/pages/import-sessions.astro:4,52` — entry wyspy `ImportSessionsView client:load`.
- `src/components/import-sessions/ImportSessionsView.tsx:9,16,21,22` — `lucide-react`, `SessionItemsPanel`, `ui/button`, `ui/sonner`.
- `src/components/import-sessions/SessionItemsPanel.tsx:13` — most do `EditItemDialog` (ciągnie `zod`).
- `src/components/items/EditItemDialog.tsx:20,22` — importy wartości `ITEM_TYPES`/`OPERATIONAL_STATUSES` (→ `zod`).
- `src/lib/ai/schema.ts:5`, `src/lib/validation/items.ts:6` — `zod` (client-reachable).
- `src/pages/api/items/[id].ts:8`, `src/pages/api/import-sessions/[id]/items.ts:11` — `zod` (API-reachable).
- `src/middleware.ts:2`, `src/lib/supabase.ts:1,3` — `@supabase/ssr` + `astro:env/server` na pierwszym żądaniu.
- `src/components/import-sessions/SessionRow.tsx:11,14` — `lucide-react`; hook `useSessionRetry` (wyspa z hookiem, historyczny punkt crashu).

## Architecture Insights

- **`dedupe` ≠ kontrola generacji.** `resolve.dedupe` rozwiązuje jedną fizyczną kopię z `node_modules`, ale nie steruje wersjonowaniem `?v=` pre-bundla dev — nie może zapobiec rozjazdowi generacji. To dwa różne mechanizmy Vite.
- **Astro 6 = wiele środowisk optymalizatora Vite.** `deps/` (klient), `deps_ssr/` (render wysp), `deps_astro/` (drugie SSR). Legacy-klucze `ssr.*` mapują się nierówno; niezawodny pin wymaga wyrażenia include także na top-levelu, by zaseedować każde środowisko.
- **Trigger to wyścig, nie stan.** Rozjazd generacji istnieje wyłącznie w oknie re-optymalizacji; dysk w spoczynku go nie pokaże. Dlatego jedyny wiarygodny sygnał to **brak samego zdarzenia reopt** na pokrytej sesji, a nie brak złapanego crashu.
- **Wyłącznie dev.** Build prod (Rollup) nie ma `optimizeDeps`/`?v=` — mechanizm tam nie istnieje. `output:"server"` sprawia, że `npm run build` nie SSR-uje stron, więc nie wykryje tej klasy błędu; prod potwierdza się osobno `npm run preview`.

## Historical Context (from prior changes)

- `context/archive/2026-06-13-import-session-log-retry/follow-ups/review-fixes.md` — S-08: pierwszy fix (`dedupe` + `ssr.noExternal`); kryterium „pojedynczy render prod" (niewystarczające).
- `context/archive/2026-06-24-session-items-detail/follow-ups/review-fixes.md` — S-10: pin `astro/env/runtime`; weryfikacja `reopt_fired`; **residual przewidział obecny stan** („INNY późno odkrywany dep → dorzucić do include").
- `context/archive/2026-06-28-session-log-filter-ux/` — S-11: `research.md:38` KOREKTA (bug wciąż żyje w dev); config nietknięty; brak nowej zależności.
- `context/archive/2026-06-28-session-log-filter-ux/follow-ups/dup-react-ssr-dev-only.md` — zgłoszenie wynoszące problem do S-12 z pełnym kontekstem.
- `context/foundation/lessons.md` — dwie lekcje tej klasy (§54 „Bug widoczny tylko w dev…", §68 „«Naprawione» = brak reopt na zimnym starcie…").

## Related Research

- `context/changes/dup-react-ssr-dev-fix/change.md` — tożsamość zmiany S-12 (kryterium „naprawione", ostrzeżenie o `--force`).
- Brak wcześniejszego `research.md` dla tej klasy — poprzednie podejścia dokumentowane w follow-upach impl-review (wyżej).

## Open Questions

- **Minimum vs robust w `/10x-plan`:** czy przypiąć tylko rodzinę React (właściwy inwariant, mniejszy config), czy całą populację (eliminacja wszystkich triggerów, większa lista do utrzymania)? Rekomendacja: cała rodzina React + `@supabase/ssr` (pewni najwcześniejsi/najbardziej bezpośredni sprawcy), reszta UI-libs opcjonalnie — decyzja koszt×sygnał dla planu.
- **`ssr.noExternal` — zostawić czy usunąć?** Skoro nie chroni ścieżki crashu, czy trzymać go dla `deps_astro` (gdzie zadziałał), czy zastąpić spójnym pinem we wszystkich środowiskach? Do rozstrzygnięcia w planie po eksperymencie.
- **Determinizm repro na Windows/workerd:** czy `deps_astro` bywa aktywowane przy renderze wysp w tym adapterze (Cloudflare), czy tylko `deps_ssr`? Jeśli tylko `deps_ssr`, pin top-level jest zabezpieczeniem na przyszłość, nie warunkiem koniecznym — warto potwierdzić w fazie implementacji.
