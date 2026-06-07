# Bezpieczna warstwa sekretu BYOK (F-01) — Krótki plan

> Pełny plan: `context/changes/byok-secret-security/plan.md`

## Co i dlaczego

Fundament bezpieczeństwa BYOK: (1) szyfrowanie klucza API użytkownika w spoczynku i (2) aktywny filtr maskujący, który nie pozwala kluczom trafić do logów ani raportów błędów. Musi działać, zanim jakikolwiek klucz zostanie zapisany lub użyty — bo FR-026 to twardy zakaz globalny, a wejście filtra po pierwszym zapisie oznaczałoby okno wycieku.

## Punkt wyjścia

Aplikacja jest na produkcji (auth + deploy), ale nie ma warstwy kryptograficznej ani centralnego loggera; błędy lecą ad hoc, `no-console` jest tylko `"warn"`, brak test runnera. `nodejs_compat` jest włączony, więc Web Crypto jest dostępne natywnie.

## Pożądany stan końcowy

W kodzie istnieją przetestowane: moduł szyfrujący klucz do koperty `v1.iv.ct` i z powrotem (fail-closed), centralny logger maskujący sekrety jako jedyny dozwolony punkt `console`, flaga `hasKek` w `/api/health`, oraz działający `npm run test` podpięty do CI. Żaden klucz nie może pojawić się w logu.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Prymityw | AES-256-GCM (Web Crypto) | Natywny w workerd/Node, uwierzytelniony | Plan |
| KEK | Surowy 32-bajtowy sekret (base64) | Mocny, bez KDF | Plan |
| Rotacja KEK | Statyczny + wersja w kopercie | PRD odkłada rotację do V2, haczyk za darmo | Plan |
| Koperta | `v1.<iv>.<ct+tag>` (string) | Samoopisująca, jedna kolumna w S-01 | Plan |
| Masker | Centralny logger (jeden komin) | Egzekwuje FR-026 globalnie | Plan |
| Egzekucja | ESLint `no-console: error` + wyjątek loggera | Mechaniczne wymuszenie | Plan |
| Zakres masek | Prefiks `sk-` (konfig) + fallback entropii | Obrona w głąb, OpenAI | Plan |
| Dostawca | OpenAI; prefiks/nazwa jako konfiguracja | Bez zamrażania OQ3 w kodzie | Plan |
| Błąd crypto | Fail-closed (typowany błąd) | Nigdy cicho nie używać złego klucza | Plan |
| Brak KEK | Opcjonalny + flaga health (bramka komunikatem → S-01) | Build CI bez sekretu przechodzi; brak banera-widma w prod | Plan |
| Testy | Vitest + krok `test` w CI | Guardrail wymaga regresji | Plan |
| FR-025 hash | Do S-02 | Trzymanie zakresu roadmapy | Plan |

## Zakres

**W zakresie:** moduł crypto (encrypt/decrypt + koperta), centralny logger + masker, ESLint `no-console`, pole `BYOK_KEK` + flaga `hasKek`, Vitest + CI.

**Poza zakresem:** schemat DB i kolumna klucza (S-01), UI profilu (S-01), wpis KEK w `config-status` + baner/bramkowanie komunikatem (S-01 — w F-01 tylko `hasKek` w health), wywołania dostawcy + FR-025 hash (S-02), retrofit przekazań błędów w trasach auth, rotacja KEK (V2), walidacja klucza przy zapisie (FR-022/S-01).

## Architektura / Podejście

Rozdział **czystego rdzenia** (`src/lib/crypto/aes-gcm.ts`, `src/lib/services/mask.ts` — bez `astro:env`, testowalne w Vitest) od **otoczki konfiguracyjnej** (`src/lib/services/byok-crypto.ts`, `logger.ts` — czytają sekrety/konfigurację). Niesekretna konfiguracja (prefiks `sk-`, nazwa „OpenAI", progi entropii) w `src/lib/config/byok.ts`; KEK jako sekret w `astro:env`.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Tooling + szkielet | Vitest + alias + krok test w CI, konfig BYOK, typy, pole KEK | Rozwiązanie aliasu `@` w Vitest |
| 2. Crypto | encrypt/decrypt + koperta + otoczka KEK, fail-closed | Poprawność IV/GCM, testy ścieżek błędów |
| 3. Logger + masker | masker, logger-komin, ESLint `no-console` | Kompletność maskera (entropia vs nie-sekret) |
| 4. Widoczność | flaga `hasKek` w health (status/baner → S-01) | Brak wycieku wartości w health |

**Wymagania wstępne:** brak (fundament). **Szacowany nakład:** ~2–3 sesje w 4 fazach.

## Otwarte ryzyka i założenia

- Fallback entropii może nadgorliwie zamaskować długi nie-sekret — akceptowalne (bezpieczeństwo > wierność logu); testy pilnują przypadku granicznego.
- Logger nie może rzucać przy logowaniu błędu — `maskUnknown` owija serializację w try/catch (cykle, `BigInt` → `[unserializable]`); pokryte testem.
- Test otoczki KEK wymaga mocka `astro:env/server` — jeśli kruchy, ścieżka weryfikowana ręcznie przez `/api/health`.
- Sekret `BYOK_KEK` musi zostać wygenerowany i wgrany przez [USER] (`wrangler secret put` + `.dev.vars`) przed realnym użyciem w S-01.

## Kryteria sukcesu (podsumowanie)

- `npm run lint && npm run build && npm run test` przechodzą; lint z `no-console: error` nie przepuszcza surowego `console` poza loggerem.
- Masker maskuje klucz `sk-`/`sk-proj-`, przepuszcza długi nie-sekret.
- `/api/health` zwraca `hasKek` bez wartości sekretu.
