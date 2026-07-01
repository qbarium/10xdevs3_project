---
change_id: dup-react-ssr-dev-fix
title: Naprawa błędu podwójnego React-a na /import-sessions (tylko tryb deweloperski)
status: implemented
created: 2026-07-01
updated: 2026-07-01
archived_at: null
---

## Notes

Wyniesione z roadmapy jako **S-12** (dług techniczny, dev-only). Błąd „Invalid hook call / more than one copy of React" wywala render SSR `/import-sessions` w `npm run dev`; build produkcyjny jest czysty, więc to poprawa doświadczenia deweloperskiego, nie wydania.

Kontekst źródłowy (pełna diagnoza + historia dwóch nieudanych podejść z S-08 i S-10):

- `context/archive/2026-06-28-session-log-filter-ux/follow-ups/dup-react-ssr-dev-only.md` — zgłoszenie z pełnym kontekstem.
- `context/foundation/roadmap.md` → S-12 (Niewiadoma: „Aktualny trigger re-optymalizacji Vite"; `reopt_fired=0` okazał się niewystarczającym kryterium).
- `context/foundation/lessons.md` → dwie lekcje tej klasy: „Bug widoczny tylko w `dev`…" oraz „«Naprawione» dla dup-React SSR = brak re-optymalizacji na zimnym starcie…".

Kryterium „naprawione" (z `lessons.md`): **BRAK mid-session re-optymalizacji Vite na zimnym starcie** (brak logu „optimized dependencies changed. reloading") — a nie pojedynczy udany render, nie zielony `npm run build` (przy `output:"server"` nie SSR-uje stron), nie zimny render (nie wyzwala wyścigu). Weryfikacja: odstaw `.vite`/`.astro` BEZ `--force` (`--force` tłumi re-optymalizację → fałszywy zielony wynik).

## Weryfikacja Faza 2 (2026-07-01) — wynik

Zimny start bez `--force`, pełna sesja: middleware (`@supabase/ssr`) + render publicznych wysp (`/auth/signin`, `/auth/signup`) + **zalogowanych** wysp (`/import-sessions`, `/items`, `/items/active`, `/items/trash` — konto testowe utworzone przez signup, „Confirm email" OFF → od razu logowalne) + trasa API z `zod` (`PATCH /api/items/[id]` → 401, moduł z `zod` załadowany). Statyczne importy `EditItemDialog`/`AddItemDialog` → graf `zod` pokryty przy renderze SSR (luka pokrycia S-10 domknięta).

- **Behawioralnie:** log dev (18 linii, same startowe) — **zero** `optimized dependencies changed. reloading`, zero `Invalid hook call`. Żaden `_metadata.json` nie przepisany po cold-scanie (wszystkie mtime ze startu) → zero mid-session reopt.
- **Strukturalnie:** `deps_ssr/_metadata.json` — 15 pinów na liniach 7–91 (początek `optimized`), jeden `browserHash 217bc995`. Nie w ogonie 4800+.
- **Parytet top-level (Open Question 3):** ZBĘDNY. `deps_astro` nie zawiera populacji React (`noExternal` wbudowuje ją w graf SSR, brak chunków `?v=`) i nie odpalił reopt. Na workerd ścieżką crashu jest wyłącznie `deps_ssr` → fix ssr-only wystarcza; `optimizeDeps.include` top-level zostaje `["astro/env/runtime"]`.
