<!-- PLAN-REVIEW-REPORT -->
# Przegląd planu: Bezpieczna warstwa sekretu BYOK (F-01)

- **Plan**: `context/changes/byok-secret-security/plan.md`
- **Tryb**: Głęboki
- **Data**: 2026-06-07
- **Werdykt**: DO POPRAWY → po sortowaniu: SOLIDNY (wszystkie ustalenia naniesione)
- **Ustalenia**: 0 krytycznych · 3 ostrzeżenia · 2 obserwacje (5/5 zastosowane)

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność ze stanem końcowym | ZALICZONY |
| Oszczędna realizacja | ZALICZONY |
| Dopasowanie architektoniczne | ZALICZONY |
| Martwe punkty | OSTRZEŻENIE (F1, F3, F4) |
| Kompletność planu | OSTRZEŻENIE (F2, F5) |

## Ugruntowanie

7/7 ścieżek modyfikowanych ✓ (astro.config.mjs, eslint.config.js, config-status.ts, health.ts, ci.yml, package.json, tsconfig.json), 7/7 nowych plików poprawnie nieobecnych ✓, symbole 4/4 ✓ (configStatuses, no-console:warn@eslint:23, envField@astro:19, config-status konsument = Layout.astro:4), brief↔plan ✓, zero istniejących `console.` ✓. `lessons.md` i `contract-surfaces.md` nie istnieją → sprawdzenia pominięte. Mechanika `## Postęp`↔Faza: spójna (4 fazy, 1.1–4.5).

Sub-agent (general-purpose) zweryfikował 5 najryzykowniejszych twierdzeń — wszystkie POTWIERDZONE (Web Crypto w workerd+Node 22; pure/config split konieczny bo `astro:env/server` to wirtualny moduł; config-status konsumowany tylko przez Layout.astro baner; zero `console.`; brak istniejącego vitest/aliasu).

## Ustalenia

### F1 — Wpis KEK w config-status daje globalny baner widoczny dla użytkowników w produkcji

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 4 — Status konfiguracji KEK
- **Szczegóły**: `missingConfigs` (z `config-status.ts`) jest konsumowane wyłącznie przez `src/layouts/Layout.astro:4,23` i napędza globalny baner. Dodanie wpisu „BYOK KEK" → każdy użytkownik w prod widzi baner, dopóki sekret nie jest ustawiony; kod F-01 deployuje się przed wgraniem sekretu ([USER]). Dodatkowo „bramkowanie ścieżek wymagających KEK" nie ma w F-01 żadnej ścieżki (UI profilu = S-01).
- **Poprawka A ⭐ Zalecana**: W F-01 zostaw tylko `hasKek` w `/api/health`; wpis config-status/baner → S-01.
  - Siła: Zero banera-widma; config-status ląduje tam, gdzie ma konsumenta.
  - Kompromis: Faza 4 kurczy się do health flag.
  - Pewność: WYSOKA — sub-agent potwierdził jedynego konsumenta (Layout.astro).
- **Poprawka B**: Zostaw wpis, ale wgraj `BYOK_KEK` przed mergem F-01.
  - Siła: Pełna widoczność od razu.
  - Kompromis: Wiąże kolejność deployu z sekretem [USER].
  - Pewność: ŚREDNIA — zależy od dyscypliny kolejności.
- **Decyzja**: FIXED (Poprawka A) — Faza 4 zredukowana do flagi `hasKek`; wpis config-status + bramkowanie → „Czego NIE robimy" (S-01); stan końcowy, kryteria, Postęp, strategia testów i brief zaktualizowane.

### F2 — Type-aware ESLint zlintuje pliki testów i `vitest.config.ts` (Faza 1 tego nie okablowuje)

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Kompletność planu
- **Lokalizacja**: Faza 1 — Test runner Vitest
- **Szczegóły**: `eslint.config.js:18` ma `projectService: true` + `strictTypeChecked`, `tsconfig.json:3` obejmuje `**/*` → `*.test.ts` i `vitest.config.ts` lintowane type-aware. Bez okablowania globali/typów `npm run lint` (i krok CI z Poprawki 1) padnie.
- **Poprawka**: W Fazie 1 jawnie okabluj typy testów (import z `vitest` albo `vitest/globals` + `test.globals: true`); zapewnij, że `vitest.config.ts` spełnia strict (lub ignores); zainstaluj `vitest` przed pierwszym lintem; kryterium: lint obejmuje pliki testów bez błędu.
- **Decyzja**: FIXED — kontrakt Fazy 1 item #1 rozszerzony o okablowanie type-aware lint; kryterium sukcesu i Postęp 1.5 zaktualizowane.

### F3 — `reportError` maskuje tylko message+stack; sekret może siedzieć w innych polach błędu

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 3 — Centralny logger (kontrakt `reportError`)
- **Szczegóły**: Klucz może siedzieć w innych enumerowalnych polach błędu (`config.headers.authorization`, `cause`). Maskowanie dwóch pól zostawia furtkę FR-026.
- **Poprawka**: `reportError` serializuje cały błąd (pola enumerowalne + `cause`) przez `maskUnknown`.
- **Decyzja**: FIXED — kontrakt `reportError` zmieniony; przypadek testowy dodany do strategii, kryteriów Fazy 3 i Postępu 3.2.

### F4 — Brak twardego progu Node (`engines`)

- **Waga**: 🔬 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 1 / package.json
- **Szczegóły**: `.nvmrc` doradczy, CI pinuje major `22`, brak `engines`; Node <20 cicho bez `globalThis.crypto.subtle`.
- **Poprawka**: `"engines": { "node": ">=20" }` w `package.json`.
- **Decyzja**: FIXED — dodane do kontraktu Fazy 1 item #1.

### F5 — Granica „prefiks + znaki klucza" w maskerze nieokreślona

- **Waga**: 🔬 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja
- **Wymiar**: Kompletność planu
- **Lokalizacja**: Faza 3 / config/byok.ts
- **Szczegóły**: „prefiks `sk-` + następujące znaki" bez klasy znaków/długości może pod-/nad-dopasować.
- **Poprawka**: Nazwij klasę znaków klucza (`BYOK_KEY_CHARS`, np. `[A-Za-z0-9_-]{20,}`) w `config/byok.ts`. Fallback entropii bez zmian.
- **Decyzja**: FIXED — dodane do kontraktu Fazy 1 item #2.
