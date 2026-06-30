# Follow-up: błąd podwójnego React-a (tryb deweloperski) na `/import-sessions` → S-12

- **Data**: 2026-06-28
- **Status**: wynesione poza S-11 jako osobny punkt **S-12** (decyzja użytkownika 2026-06-28). NIE blokuje S-11 ani deadline'u.
- **Źródło**: obserwacja użytkownika — błąd nadal występuje w `npm run dev` mimo dwóch wcześniejszych deklaracji „naprawione" (S-08, S-10). Kryterium `reopt_fired=0` z poprzedniego podejścia okazało się niewystarczające.

## Czego dotyczy

Strona `/import-sessions` (wyspa React `ImportSessionsView → SessionsList → SessionRow → useSessionRetry`, montowana `client:load`) wywala render serwerowy komunikatem „Invalid hook call / more than one copy of React" — **wyłącznie w trybie deweloperskim** (`npm run dev`).

Przyczyna: wyścig optymalizatora zależności Vite (`optimizeDeps`, wersjonowanie `?v=`) — zależny od czasu i kolejności ładowania, więc pojawia się nieprzewidywalnie. Dwie kolejne próby „naprawy" (config w `astro.config.mjs`: `resolve.dedupe` + `ssr.noExternal` + pre-bundling `astro/env/runtime`) nie wyeliminowały go w pełni.

## Dlaczego nie blokuje produkcji ani S-11

- Build produkcyjny idzie przez Rollup, bez pre-bundlingu i wersjonowania `?v=` — tego mechanizmu tam nie ma (`lessons.md`: „Build prod (Rollup, bez pre-bundlingu) tego nie ma").
- Dowód empiryczny: S-10 (`session-items-detail`) z tą samą stroną został wdrożony i zarchiwizowany 2026-06-28; gdyby strona crashowała w produkcji, S-10 by nie wszedł.
- Wpływ na S-11: weryfikacja ręczna `/import-sessions` prowadzona na `npm run preview` (build produkcyjny, bez błędu), nie na `npm run dev`. Dołożenie hooka filtrów w S-11 może nasilić objaw w trybie deweloperskim — oczekiwane, nie traktować jako regresji S-11.

## Co rozstrzygnie S-12 (gdy ruszy)

- Odtworzyć błąd w jego **prawdziwym trybie awarii** (re-optymalizacja w trakcie sesji, nie zimny render) — bez tego nie ma dowodu naprawy (`lessons.md`).
- Ustalić **aktualny** trigger (która późno-odkrywana zależność wyzwala re-optymalizację rozjeżdżającą generacje `?v=` React-a), bo `reopt_fired=0` z poprzedniego podejścia nie wystarczył.
- Wyeliminować trigger (pre-bundling właściwej zależności), nie polegać wyłącznie na `dedupe` + `ssr.noExternal`.
- Kryterium „naprawione": brak re-optymalizacji w trakcie sesji na zimnym starcie, potwierdzone realnym odtworzeniem trybu awarii — nie zielony build ani pojedynczy udany render.

## Powiązania

- Lekcje: `context/foundation/lessons.md` (dwie pozycje o błędzie podwójnego React-a tylko w dev).
- Poprzednie podejścia: `context/archive/2026-06-13-import-session-log-retry/` (S-08), `context/archive/2026-06-24-session-items-detail/follow-ups/review-fixes.md` (S-10).
- Konfiguracja: `astro.config.mjs:16-44`.
