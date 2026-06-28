# Review follow-ups — session-items-detail

## F5 (impl-review) — dup-React SSR crash potwierdzony i naprawiony (2026-06-28)

**Status:** FIXED (config), zweryfikowane deterministycznie.

### Ustalenie
Kryterium **3.8** (`## Progress`: „`/import-sessions` renderuje się bez «Invalid hook call», potwierdzone w trybie re-optymalizacji") było odhaczone `[x]`, ale przegląd implementacji **odtworzył crash NA ŻYWO** na bieżącym kodzie (zimny start + render zalogowanej wyspy):

```
[vite] ✨ new dependencies optimized: astro/env/runtime
[vite] ✨ optimized dependencies changed. reloading
[ERROR] Invalid hook call. (...) 3. You might have more than one copy of React
[ERROR] TypeError: Cannot read properties of null (reading 'useState')
    at useState   (.vite/deps_ssr/chunk-EMAOOZFV.js?v=18bd8eab)        ← React core, gen A
    at useItemList (src/components/hooks/useItemList.ts:98)
    at AcceptedItemsView (src/components/items/AcceptedItemsView.tsx:81)
    at renderWithHooks (.vite/deps_ssr/react-dom_server.js?v=0ba053fe)   ← react-dom/server, gen B
```

Dwie generacje `?v=` (`18bd8eab` vs `0ba053fe`) w jednym renderze SSR = „more than one copy of React" → `useState` na null dispatcherze. **Wyłącznie dev** (prod = Rollup, brak `?v=`); racy — łapie render „w poprzek" re-optymalizacji (organicznie złapała go stara zakładka HMR `/items/active`).

### Przyczyna źródłowa
Dotychczasowy fix (`resolve.dedupe` + `ssr.noExternal` dla `react`/`react-dom`) był **NIEPEŁNY** — nie zapobiegał mid-session re-optymalizacji. `astro/env/runtime` był odkrywany **późno** → Vite robił „optimized dependencies changed. reloading" → rendery w poprzek reloadu rozjeżdżały generacje `?v=` Reacta (core vs `react-dom/server`).

### Fix (`astro.config.mjs`)
Pre-bundling `astro/env/runtime` OD RAZU (klient + SSR), by NIE był odkrywany późno → re-optymalizacja **nie firuje** → rozjazd generacji niemożliwy:

```js
optimizeDeps: { include: ["astro/env/runtime"] },
ssr: {
  noExternal: ["react", "react-dom"],
  optimizeDeps: { include: ["astro/env/runtime"] },
},
```

### Weryfikacja (zimne starty + uwierzytelniony hammer 40 s × 16 workerów na chronionych trasach)
| Cykl | Config | reopt_fired | invalid_hook_call |
|------|--------|:-----------:|:-----------------:|
| baseline2 | przed fixem | **1** (trigger obecny) | 0 (wyścig za wąski dla curl) |
| fix1 | po fixie | **0** | 0 |
| fix2 | po fixie | **0** | 0 |
| fix3 | po fixie | **0** | 0 |

Dowód **deterministyczny**: kryterium nie jest „nie złapaliśmy crashu" (zawodne — wyścig), lecz „trigger (re-optymalizacja) wyeliminowany". `npm run build` + `npm run lint` zielone.

### Residual / na przyszłość
- `react-dom/server` nadal jest osobnym `?v=` chunkiem w `deps_ssr` — **nieszkodliwe bez re-optymalizacji** (nie ma czego rozjeżdżać). Gdyby kiedyś pojawił się INNY późno odkrywany dep i wrócił reopt → dorzucić go do `optimizeDeps.include` (ten sam wzorzec).
- Wzmacnia lekcję `lessons.md` §54: dla tej klasy buga „naprawione" = **`reopt_fired=0` na zimnym starcie**, a nie pojedynczy udany render.
