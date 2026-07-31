# Artifact 1 — Terytorium (gdzie projekt żyje)

- **Repo:** tldraw (monorepo TS, yarn+lerna); klon single-branch, `main`.
- **Okno:** ostatnie ~12 miesięcy (2025-07-30 → 2026-07-31).
- **Metoda:** `git log --since --no-merges --name-only`; zliczanie per folder (poziom 2) i plik; szum odfiltrowany (lockfile, snapshoty, `*.api.*`/api-report, CHANGELOG, locales/messages, assets, `version.ts`-bumpy, `releases/next`).
- **Status:** sesja Terytorium ZAKOŃCZONA (prompty 1–4).

## Prompt 1 — TOP aktywności (12 mies.)

| # | Obszar | Zmiany | Rola (hipoteza) |
|---|--------|-------:|-----------------|
| 1 | `apps/dotcom` | 3069 | Produkcyjny SaaS (tldraw.com): konta, sync, kolaboracja — **główny hotspot** |
| 2 | `packages/tldraw` | 1740 | Rdzeń SDK (editor + domyślne UI/shape'y) |
| 3 | `apps/examples` | 1349 | Demo/przykłady SDK |
| 4 | `apps/docs` | 1155 | Dokumentacja |
| 5 | `packages/editor` | 828 | Silnik edytora (core); plik `Editor.ts` = najgorętszy w repo (87) |
| 6 | `packages/fairy-shared` | 493 | ⚠️ **USUNIĘTY z repo** — kampania AI (spike Q4-25), potem skasowana |
| 7 | `templates/agent` | 413 | Szablon agenta AI (kampanijny) |
| 8 | `packages/tlschema` | 237 | Schema/model danych — **kontrakt SDK** |
| 9 | `packages/sync-core` | 231 | Synchronizacja real-time (**wrażliwe**) |
| 10 | `internal/scripts` | 219 | Skrypty build/deploy |
| 11–15 | `.github/workflows`, `apps/mcp-app`, `templates/workflow`, `packages/utils`, `packages/dotcom-shared` | 196–128 | CI, MCP app (AI), szablony, utils, warstwa shared dotcom |

**Szum release'owy (oznaczony, NIE hotspot):** `version.ts` (×5, po 38), `releases/next.mdx` (48), `deploy-dotcom.ts` (38) — mechaniczny auto-bump/deploy.

## Prompt 2 — Kwartały (stałe centrum vs kampania)

| Obszar | Q3-25 | Q4-25 | Q1-26 | Q2-26 | Q3-26 | Wniosek |
|--------|------:|------:|------:|------:|------:|---------|
| `packages/tldraw` | 308 | 337 | 395 | 560 | 102 | **stałe centrum**, rośnie do Q2 |
| `packages/editor` | 145 | — | 275 | 243 | 40 | **stałe centrum** SDK |
| `apps/dotcom` | 106 | **1691** | 564 | 520 | 156 | **kampania Q4-25** + stała obecność |
| `apps/examples`/`docs` | wysoko | — | 698/369 | 265/218 | — | stale wysoko (demo/docs SDK) |
| `packages/fairy-shared` | — | 419 | — | — | — | **kampania Q4-25** (usunięta później) |
| `templates/agent` | 142 | — | 197 | — | — | kampanijny (AI) |
| `packages/commenting` | — | — | — | — | 75 | **świeży** obszar (bieżąca praca) |

→ `tldraw`+`editor` to prawdziwe stałe rdzenie; `dotcom` miał wielki spike Q4-25 (kampania), lecz nadal żyje; `fairy-shared` i `templates/agent` to zamknięte/wyciszone kampanie AI; `commenting` dopiero się rozgrzewa.

## Prompt 3 — Współzmiany (co-change coupling, top pary)

| Zmiany | Para | Interpretacja |
|-------:|------|---------------|
| 141 | `editor` + `tldraw` | **rdzeń SDK** — silnik i warstwa wyżej zmieniają się razem |
| 78 / 51 | `examples` + `tldraw`/`editor` | demo podąża za API SDK (tańszy coupling, API-driven) |
| 63 / 41 | `dotcom` + `tldraw`/`editor` | produkcja konsumuje SDK |
| 56 | `dotcom` + `dotcom-shared` | app + warstwa shared |
| 50 | `dotcom` + `internal/scripts` | deploy dotcom |
| 38 / 24 | `tldraw`/`editor` + `tlschema` | SDK + schema (kontrakt danych) |
| 32 | `dotcom` + `fairy-shared` | dotcom używał AI (kampania) |
| 31 | `.github/workflows` + `internal/scripts` | infra CI razem |

→ Klaster rdzenia: `editor ↔ tldraw ↔ tlschema` (schema jako kontrakt). `dotcom` orbituje wokół SDK + `dotcom-shared` + `scripts`. `examples`/`docs` sprzęgają się przez API, nie logikę.

## Prompt 4 — Wspólny mianownik + weryfikacja istnienia

- **Globalne pliki (wspólny mianownik):** `eslint.config.mjs` (15), `.gitignore` (15) — konfiguracja repo; **`CLAUDE.md` (11), `AGENTS.md` (6), `CONTEXT.md` (5)** — pliki context-engineering (tldraw sam stosuje techniki z modułu 4); `lazy.config.ts` (6) — build. Zmieniają się „globalnie", niezależnie od modułów.
- **Weryfikacja istnienia:** wszystkie TOP obszary istnieją **oprócz `packages/fairy-shared` (USUNIĘTY)**. Kluczowe pliki (`Editor.ts`, `TldrawApp.ts`, `TLUserDurableObject.ts`) — obecne.

## Wnioski dla pracy w legacy (Terytorium)

- **Rdzeń stały:** `packages/editor` + `packages/tldraw` + `packages/tlschema` — czytaj tu najpierw, tu zmiana rozlewa się przez SDK.
- **Produkcja:** `apps/dotcom` (+ `dotcom-shared`, sync-worker) — największy wolumen; Q4-25 to była duża kampania.
- **Wrażliwe:** `sync-core` + Durable Objects (real-time sync) — uważaj przy zmianie.
- **Historia ≠ teraźniejszość:** `fairy-shared` gorący, ale usunięty; `templates/agent` wyciszony — nie traktuj jako żywego rdzenia.

## Unknowns / do przeniesienia dalej

- `unknown`: dokładny kierunek i cykle importów rdzenia (`editor`/`tldraw`/`tlschema`) — to zadanie grafu zależności (Krok 2, `artifact-2`).
- `unknown`: co robił `fairy-shared` i dlaczego usunięty (kontekst kontrybutorów / Deep Focus).
- `unknown`: czy `sync-core` ↔ `dotcom/sync-worker` mają runtime coupling niewidoczny w co-change.
- co-change to historia — nie pokazuje kontraktów, które POWINNY się synchronizować, a nie robią tego.
