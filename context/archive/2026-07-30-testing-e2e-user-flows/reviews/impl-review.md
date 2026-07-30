<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Warstwa E2E — pełna ścieżka user-facing

- **Plan**: context/changes/testing-e2e-user-flows/plan.md
- **Zakres**: wszystkie 4 fazy (pełny plan)
- **Data**: 2026-07-30
- **Werdykt**: WYMAGA UWAGI
- **Ustalenia**: 0 krytycznych, 1 ostrzeżenie, 3 obserwacje

## Werdykty

| Wymiar | Werdykt |
|--------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | WARNING |
| Bezpieczeństwo i jakość | WARNING |
| Architektura | PASS |
| Spójność wzorców | WARNING |
| Kryteria sukcesu | PASS |

Kryteria sukcesu zweryfikowane świeżo: `npx vitest run` — 566 zielonych (54 pliki, w tym 5 testów atrapy); `tsc --noEmit` — OK; `eslint` na plikach zmiany — OK. E2E (3 testy) zielone dwukrotnie w Fazach 2–3 (odhaczone), CI ich nie odpala (local-only); integracyjne odpalane w CI na wstawianym Supabase. Pełny `eslint .` lokalnie się zawiesza (środowisko/OneDrive), ale przeszedł w CI przy PR #165.

## Ustalenia

### F1 — Gałąź mock nie jest fail-closed poza środowiskiem testowym

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: src/lib/ai/classifier.ts:43-54 (dot. src/lib/config/ai.ts:68-74)
- **Szczegóły**: Przed zmianą gałąź `kind==="mock"` rzucała `UnsupportedModelError` — mock na produkcji był fail-closed (błąd). Po zmianie zwraca ciche itemy (każda niepusta linia → item `task`), bez sieci i klucza. Sąsiednie parametry wrażliwe (`OPENAI_STORE` przez `assertNoStore`, `OPENAI_BASE_URL` przez `assertSafeBaseUrl`) wywracają config na złej wartości, ale `CLASSIFIER_MODEL="mock"` jest przyjmowane po cichu, bez guardu. Domyślna wartość (`gpt-4o-mini` → `kind:"chat"`) jest bezpieczna, więc prod nie trafia tu przypadkiem; realne ryzyko to jawne ustawienie `mock` na prod → cicha degradacja zamiast błędu. Ekspozycja bezpieczeństwa niska (atrapa nie dotyka klucza/sieci/`hashUserId`).
- **Poprawka A ⭐ Zalecana**: Dodać symetryczny guard fail-closed — odrzucić `model==="mock"` poza środowiskiem nie-produkcyjnym/E2E.
  - Siła: Przywraca fail-closed sprzed zmiany; spójne z `assertNoStore`/`assertSafeBaseUrl` w `ai.ts`.
  - Kompromis: Trzeba wybrać sygnał odróżniający E2E od prod (`import.meta.env.DEV`/`PROD` w workerd) tak, by E2E przechodziło, a prod odrzucał.
  - Pewność: MED — wzorzec fail-closed istnieje w repo; rozróżnienie prod/E2E wymaga decyzji o sygnale.
  - Martwy punkt: jak dokładnie webServer/dev sygnalizuje „nie-prod" na runtime workerd.
- **Poprawka B**: Zaakceptować jako świadome ograniczenie i udokumentować (lessons.md / plan).
  - Siła: Domyślna wartość bezpieczna; mock wymaga jawnego działania operatora; zero kodu.
  - Kompromis: Zostaje utrata fail-closed sprzed zmiany, jeśli ktoś ustawi mock na prod.
  - Pewność: HIGH — analiza łańcucha resolvera potwierdza bezpieczny default.
  - Martwy punkt: przyszły operator kopiujący env z konfiguracji E2E.
- **Decyzja**: NAPRAWIONE (Poprawka A) — `assertClassifierModel` w `src/lib/config/ai.ts` (guard fail-closed `import.meta.env.PROD && model==="mock"` → `AiConfigError`), symetryczny do `assertNoStore`/`assertSafeBaseUrl`. Dowód: 2 nowe testy w `ai.test.ts` (prod odrzuca / dev-test przepuszcza) — 28 zielonych, tsc OK.

### F2 — Uzasadnione dodatki spoza litery planu

- **Ważność**: ℹ️ OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; oczywiste
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: playwright.config.ts:27, vitest.config.ts, .gitignore
- **Szczegóły**: `reuseExistingServer:false` (plan mówił `true` — broniony: gwarantuje świeży serwer w trybie mock, wiszący `astro dev` z prawdziwym AI nie zostanie zreużyty i nie złamie założenia atrapy); `vitest.config.ts += exclude "e2e/**"` (konieczny klej, by `npm test` nie zbierał speców Playwrighta importujących `@playwright/test`); `.gitignore += .playwright-cli/` + utwardzenia configu (`workers:1`, `trace`, `url=/api/health`). Wszystkie uzasadnione i nieszkodliwe; brak MISSING w całym planie.
- **Poprawka**: Zaakceptować; opcjonalnie dopisać jedno zdanie do planu/§6.3, że `reuseExistingServer` i wykluczenie `e2e/**` są celowe.
- **Decyzja**: ZAAKCEPTOWANE — dodatki spoza litery planu są świadome i uzasadnione (bronią trybu mock / konieczny klej dla runnera jednostkowego); bez zmian w kodzie.

### F3 — Trace Playwrighta zapisuje ciasteczko sesji

- **Ważność**: ℹ️ OBSERWACJA
- **Wpływ**: 🏃 NISKI
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: playwright.config.ts:21
- **Szczegóły**: `trace:"on-first-retry"` zapisuje kontekst przeglądarki (w tym ciasteczko sesji) do `test-results/`. Katalog jest gitignored, a E2E jest local-only (nie w CI), więc ekspozycja minimalna.
- **Poprawka**: Bez zmian teraz; przy przyszłym wpięciu E2E do CI pilnować, by artefakt trace nie był publikowany.
- **Decyzja**: ZAAKCEPTOWANE — ryzyko zmitygowane (`test-results/` gitignored, E2E local-only); obserwacja do pilnowania przy ewentualnym wpięciu E2E do CI.

### F4 — Brak beforeEach(mockReset) — parytet z siostrzanym testem

- **Ważność**: ℹ️ OBSERWACJA
- **Wpływ**: 🏃 NISKI
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: src/lib/ai/classifier.mock.test.ts
- **Szczegóły**: Siostrzany `classifier.test.ts` ma `beforeEach(mockReset)`/`afterEach(clearAllMocks)`; `classifier.mock.test.ts` nie. Dziś nieszkodliwe (gałąź mock nigdy nie woła fetch, więc asercja „nie woła sieci" trzyma niezależnie od kolejności), ale bez parytetu stałoby się zależne od kolejności, gdyby dodano test ćwiczący fetch.
- **Poprawka**: Dodać `beforeEach(() => fetchMock.mockReset())` dla parytetu.
- **Decyzja**: NAPRAWIONE — dodano `beforeEach(() => fetchMock.mockReset())` w `classifier.mock.test.ts` (parytet z `classifier.test.ts`); 5 testów atrapy zielonych, lint OK.
