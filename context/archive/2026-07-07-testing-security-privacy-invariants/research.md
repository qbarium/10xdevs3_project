---
date: 2026-07-07T11:29:36+0200
researcher: Jakub
git_commit: 736bfd967d7f9f69bbff832496ad94a1f0a4dd86
branch: main
repository: qbarium/10xdevs3_project
topic: "Security/privacy invariants — grounding risks #1 (key-in-logs) and #4 (batch egress) for the Faza 1 unit-test rollout"
tags: [research, codebase, security, privacy, byok, egress, masking, test-plan-phase-1]
status: complete
last_updated: 2026-07-07
last_updated_by: Jakub
---

# Research: Inwarianty bezpieczeństwa/prywatności — ugruntowanie ryzyk #1 i #4 dla Fazy 1 wdrożenia testów

**Date**: 2026-07-07T11:29:36+0200
**Researcher**: Jakub
**Git Commit**: 736bfd967d7f9f69bbff832496ad94a1f0a4dd86
**Branch**: main
**Repository**: qbarium/10xdevs3_project

## Research Question

Ugruntować w bieżącym kodzie powierzchnię ryzyka dla **Fazy 1** tabeli §3 *Phased Rollout* w `context/foundation/test-plan.md` — „Inwarianty bezpieczeństwa/prywatności", warstwa **unit**, pokrywająca:

- **Ryzyko #1** — klucz API użytkownika (BYOK) wycieka do logów / komunikatu błędu / raportu błędu / stack trace.
- **Ryzyko #4** — surowy wsad (prywatne notatki) trafia poza skonfigurowanego dostawcę AI (egress do wrogiego hosta lub retencja po stronie dostawcy).

Konkretnie: gdzie żyją strażnicy, jak są testowalne, i **których scenariuszy jeszcze nie pokrywają istniejące testy** — żeby `/10x-plan` mógł zaplanować testy jednostkowe wg zasady koszt × sygnał (§1 test-planu), unikając anty-wzorca „test tylko happy-path / oracle z tego samego wzorca, którego używa filtr".

## Summary

**Najważniejsze ustalenie: inwarianty tej fazy są już w dużej mierze otestowane.** Repo ma **52 współlokowane pliki testów jednostkowych** (Vitest 4.1.8), a strażnicy obu ryzyk mają dedykowane testy:

- **Ryzyko #4 (egress)** jest praktycznie w pełni pokryte. `src/lib/config/ai.ts` implementuje fail-closed `assertSafeBaseUrl` (https + allowlista hostów w kodzie) i `assertNoStore`, a `src/lib/config/ai.test.ts` już asertuje wszystkie cztery wrogie wartości (host spoza allowlisty, `http://`, zły URL, `store=true`). Realna robota Fazy 1 tutaj to **audyt kompletności + przypięcie regresji**, nie pisanie od zera.
- **Ryzyko #1 (klucz w logach)** ma dwuwarstwową obronę: (i) **dyscyplina** — jedyny „komin" logów to `src/lib/services/logger.ts`, wymuszony ESLintem `no-console: error`, i do loggera nigdy nie jest przekazywany `apiKey` ani surowe żądanie; (ii) **backstop** — masker `maskSecrets`/`maskUnknown` (`src/lib/services/mask.ts`). Istnieją testy `mask.test.ts`, `logger.test.ts`, `byok-endpoint.test.ts`. **Luka wartościująca do pokrycia w Fazie 1:** masker łapie tylko klucze pasujące do wzorca `sk-`+≥20 znaków **albo** ≥32-znakowej wysokiej entropii, podczas gdy walidacja wejścia klucza to *tylko* trim + niepusty (`byok-key.ts`) — więc krótki/nie-`sk-` klucz **nie zostałby zamaskowany**. To dokładnie anty-wzorzec z §2: happy-path (real `sk-...`) przechodzi, ale oracle nie odzwierciedla formatu, jaki aplikacja faktycznie dopuszcza.

**Rekomendowany kształt Fazy 1** (do doprecyzowania w `/10x-plan`): audyt istniejącego pokrycia obu ryzyk → dodanie testów *negatywnych/granicznych* domykających realne luki (masker vs dopuszczalny format klucza; error-path near-miss przy `classifier.ts` cause) → przypięcie zestawu jako świadoma bariera regresji. Wszystko na warstwie **unit** — żaden scenariusz nie wymaga e2e ani dostawcy AI.

## Detailed Findings

### Ryzyko #1 — Powierzchnia wycieku klucza (masking + logi + błędy)

#### Filtr maskujący ISTNIEJE (dwa odrębne mechanizmy o przeciwnej semantyce)

- **Masker redakcyjny logów** — `src/lib/services/mask.ts`:
  - `maskSecrets(input, config)` (`mask.ts:35-46`) — redakcja do `[REDACTED]` dwiema ścieżkami: (a) reguła prefiksu — `escapeRegExp(prefix) + config.keyChars`, z domyślnymi = `/sk-[A-Za-z0-9_-]{20,}/g`; (b) fallback entropii — `/[A-Za-z0-9_+/=-]{32,}/g` redagowane tylko gdy `shannonBitsPerChar >= 3.5` (`mask.ts:16-27`).
  - `maskUnknown(value)` (`mask.ts:60-71`) — JSON-stringify dowolnej wartości (łapie cykle/BigInt → `[unserializable]`, nigdy nie rzuca), potem `maskSecrets`. To redaguje sekrety zagnieżdżone w serializowanych obiektach błędu/pola.
  - Konfiguracja: `src/lib/config/byok.ts` — `BYOK_KEY_PREFIXES = ["sk-"]` (`byok.ts:6`), `BYOK_KEY_CHARS = "[A-Za-z0-9_-]{20,}"` (`byok.ts:12`), `ENTROPY_MIN_LENGTH = 32` (`byok.ts:21`), `ENTROPY_MIN_BITS_PER_CHAR = 3.5` (`byok.ts:24`), złożone w `DEFAULT_MASK_CONFIG` (`byok.ts:35-40`). Redakcja jest **pełna** (cały dopasowany ciąg → `[REDACTED]`).
- **Masker wyświetlania (celowo PRZECIWNY — zachowuje tożsamość, NIE jest filtrem logów)** — `src/lib/services/byok-display.ts`:
  - `maskKeyForDisplay(plain)` (`byok-display.ts:11-15`) — `key.slice(0,3) + "…" + key.slice(-4)` (np. `sk-…AB12`); ≤8 znaków → same kropki. Nagłówkowy komentarz (`byok-display.ts:1-4`) wprost ostrzega, by nie mylić go z redaktorem `mask.ts`. Wynik zapisywany jako `api_key_hint` (plaintext, nie-sekret).

#### Format klucza — brak egzekwowania (to jest oracle maskera)

- Walidacja wejścia to **trim + niepusty, WYŁĄCZNIE**: `src/pages/api/profile/byok-key.ts:29-34` (`apiKey = ... .trim()`, odrzuć pusty). **Brak sprawdzania prefiksu / długości / regex.** Zgodne z archiwalną decyzją S-01 (walidacja formatu świadomie poza zakresem, FR-022).
- **Konsekwencja dla oracle:** masker (§wyżej) niezawodnie łapie tylko klucze `sk-`+≥20 lub ≥32-znakowe wysokoentropijne. Krótki fixture typu `sk-test-klucz` (13 znaków) **nie zostałby zredagowany** przez `maskSecrets` — istniejące testy przechodzą, bo taki klucz nigdy nie trafia do loggera, a nie dlatego, że masker go łapie. Realne klucze OpenAI (`sk-`/`sk-proj-` + długie) są łapane.

#### Ścieżki logowania — pojedynczy wymuszony komin

- **Tylko 4 wywołania `console.*` w `src/`, wszystkie wewnątrz `logger.ts`.** Wymuszone ESLintem `no-console: "error"` z wyjątkiem tylko dla loggera (`eslint.config.js:23`, `eslint.config.js:74`). Zero `console.*` w komponentach React / `.astro` / middleware.
- Sink maskuje przed zapisem: `logger.info/warn/error` → `write()` (`logger.ts:15-28`): `maskSecrets(message)` + `maskUnknown(fields)` (`logger.ts:11-16`). `reportError(error, fields)` (`logger.ts:78-80`): `maskUnknown(serializeError(error))`, gdzie `serializeError` (`logger.ts:47-72`) rozwija `name/message/stack`, wszystkie pola enumerowalne (np. `config`/`response` błędu HTTP) i `cause` rekurencyjnie (głębokość ≤8), a całość maskuje. **Każda ścieżka logowania przechodzi przez masker; nie znaleziono surowego sinka.**

#### Ścieżki błędów / error handlery

- **Odpowiedzi HTTP nie echują surowych błędów** poza bezpiecznymi miejscami: `classify.ts:66` zwraca `err.message` tylko w gałęzi `UnsupportedFileTypeError || FileTooLargeError` (`classify.ts:64-66`) — komunikaty o pliku, klucz jeszcze nieodszyfrowany (deszyfracja później, `classify.ts:93`). `signin.ts:16`/`signup.ts:16` wstawiają `error.message` do query redirectu — błędy auth Supabase, klucz poza zasięgiem. Reszta catchy zwraca generyczne stringi.
- **Klasy błędów NIE przechwytują materiału klucza** — wszystkie BYOK/classifier błędy: stały komunikat + opcjonalne `{cause}` (`types.ts:13-48`, `types.ts:151-188`). Crypto (`aes-gcm.ts:64-87`) rzuca `DecryptionError`/`EnvelopeFormatError` z `cause` = wyjątek Web Crypto (bez plaintextu).
- **`error_message` w DB to krótki kod, nigdy klucz**: `failSession` zapisuje `error_message: code` (`import-session.ts:58`), `code` ∈ {`timeout`,`invalid_key`,`provider`,`contract`,`unsupported_model`,`too_many_items`,`storage`,`encoding`,`empty_file`,`unknown`} (`classify-core.ts:41-49`).

#### Gdzie odszyfrowany klucz żyje jako zmienna

- Ślad deszyfracja → nagłówek `Authorization`: `decryptApiKey` (`byok-crypto.ts:53-55` → `aes-gcm.ts:64-87`). Ingest: klucz odszyfrowany `classify.ts:93`, w zasięgu przez obsługę sesji/uploadu (`classify.ts:104-152`), przekazany do `runClassification` (`classify.ts:154`). Retry: `retry.ts:72` → `retry.ts:123`. Core: `classify-core.ts:56-65`. Finalne użycie: `classifier.ts:71` — `Authorization: \`Bearer ${opts.apiKey}\`` w `fetch` (`classifier.ts:66-74`).
- W każdym z tych zasięgów do `reportError`/`logger` przekazywane są tylko `err`/`{sessionId}`/`{sessionId,code}`/`{status}` — **zmienna `apiKey` nigdy nie idzie do loga/odpowiedzi**, a stack trace JS nie osadza wartości zmiennych lokalnych.

#### Punkty ominięcia (error-path — sedno)

- **`classifier.ts:75-78` (catch błędu sieci — najostrzejszy near-miss).** `catch (err) → throw new ClassifierProviderError(..., {cause: err})`. Dziś ten `cause` **NIE jest logowany**: `mapClassifyError` zwraca `"provider"` bez `reportError` (`classify-core.ts:44`), pada tylko `logger.warn("classify: failed", {sessionId, code})` (`classify-core.ts:85`). Gdyby ktoś zmienił tę gałąź na `reportError(err)` i błąd fetch niósł żądanie/nagłówki, masker byłby **jedynym** backstopem — a łapie tylko `sk-`+20 / 32-znakowe entropijne.
- **`classifier.ts:66-74` samo żądanie.** Nowy `logger.info("request", {headers})` zserializowałby `Authorization: "Bearer sk-..."`; `maskUnknown` zredagowałby real `sk-...`, ale krótki/nie-`sk-` klucz (dopuszczony przez walidację) przeszedłby niezredagowany.
- **Obserwacja ogólna:** gwarancja „brak klucza w logach" opiera się na **dwóch niezależnych warstwach** — ESLint (wszystko przez `logger.ts`) + dyscyplina (do loggera nigdy `apiKey`/żądania). Masker `mask.ts` to **backstop, nie obrona pierwszej linii**, z luką pokrycia dla krótkich/nie-`sk-` kluczy.

### Ryzyko #4 — Egress wsadu (allowlista hostów + no-store, fail-closed)

#### Strażnicy egress ISTNIEJĄ (fail-closed, rzucają)

- `src/lib/config/ai.ts` (75 linii):
  - **`assertSafeBaseUrl(raw)`** (`ai.ts:40-54`): `new URL(raw)` w try/catch → `AiConfigError("...nie jest poprawnym URL")` (`ai.ts:42-46`); `protocol !== "https:"` → rzuca (`ai.ts:47-49`, **https-only**); host spoza allowlisty → rzuca (`ai.ts:50-52`, **dokładne dopasowanie `url.hostname`**).
  - **`assertNoStore(store): false`** (`ai.ts:60-65`): `if (store) throw AiConfigError(...)`; inaczej zwraca `false`.
  - Obie **rzucają** (nie logują ostrzeżenia). `AiConfigError` (`ai.ts:28-33`). Uruchamiane przy budowie `aiConfig` (`ai.ts:68-74`): `baseUrl: assertSafeBaseUrl(OPENAI_BASE_URL)` (`ai.ts:70`), `store: assertNoStore(OPENAI_STORE)` (`ai.ts:73`) → **walidacja odpala się przy imporcie modułu** (ewaluacja top-level).

#### Allowlista hostów — W KODZIE (nieprzeszerzalna z env)

- `ai.ts:25`: `const ALLOWED_OPENAI_HOSTS = ["api.openai.com"] as const;` — jedyny dozwolony host. Moduł-prywatny `const`; komentarz (`ai.ts:21-24`) jawnie: w kodzie, „by wroga/błędna konfiguracja env nie mogła jej rozszerzyć". **Nie eksportowana.** Realizacja lekcji `lessons.md` „Konfiguracja wrażliwa na bezpieczeństwo: waliduj fail-closed w kodzie, nie ufaj env".

#### Env fields — surowa wartość PRZECHODZI przez walidację przed użyciem

- `astro.config.mjs:85`: `OPENAI_BASE_URL: envField.string({ context:"server", access:"public", default:"https://api.openai.com/v1" })`.
- `astro.config.mjs:88`: `OPENAI_STORE: envField.boolean({ context:"server", access:"public", default:false })`.
- Importowane z `astro:env/server` w `ai.ts:6-12`. Wartość env **nie jest używana surowo** — przechodzi przez `assertSafeBaseUrl`/`assertNoStore` zanim wyląduje w `aiConfig`. Poza `ai.ts` nie ma surowego odczytu tych env w `src/`.

#### Punkt wysyłki wsadu + klucza — używa ZWALIDOWANEJ wartości

- `src/lib/ai/classifier.ts:66` — jedyny fetch do dostawcy: `fetch(\`${aiConfig.baseUrl}/chat/completions\`, {...})`. **baseUrl** = wartość po `assertSafeBaseUrl` (nie surowo z env). **Authorization** = `Bearer ${opts.apiKey}` (`classifier.ts:71`). **Body** = wsad (`classifier.ts:73`, `buildChatRequest` `classifier.ts:53-61`).
- **no-store**: parametr `store` jest w **body** (nie nagłówek), wpisywany `store: params.store` (`request.ts:28`) z `aiConfig.store` (`classifier.ts:59`) = zawsze `false` (po `assertNoStore`). Inwariant prywatności realizowany polem `store:false` w treści żądania.
- Wszystkie inne `fetch()` w `src/` (hooki) celują w lokalne `/api/...`, nie w dostawcę — jedyny egress AI to `classifier.ts:66`.

#### Wroga wartość łamiąca inwariant — rdzeń testu

Punkt wywołania: `aiConfig` (`ai.ts:68-74`), ewaluowany przy imporcie modułu. Wrogie wejścia (każde oczekuje `AiConfigError`):

| Wroga wartość env | Łamie | Strażnik / linia |
|---|---|---|
| `OPENAI_BASE_URL=https://evil.example.com/v1` (spoza allowlisty) | egress klucza BYOK do wrogiego hosta | `ai.ts:50-52` |
| `OPENAI_BASE_URL=http://api.openai.com/v1` (nie-https) | egress w plaintext | `ai.ts:47-49` |
| `OPENAI_BASE_URL=nie-url` | — | `ai.ts:42-46` |
| `OPENAI_STORE=true` | retencja treści wsadu | `ai.ts:60-64` |

**Wszystkie cztery są już pokryte** w `src/lib/config/ai.test.ts:24-49`.

#### Ograniczenie testowalności — strażnicy NIE eksportowani

- `assertSafeBaseUrl`, `assertNoStore`, `ALLOWED_OPENAI_HOSTS` **nie są eksportowane** (moduł-prywatne). Eksport z `ai.ts`: tylko `AI_REQUEST_TIMEOUT_MS` (`ai.ts:18`), `AiConfigError` (`ai.ts:28`), `aiConfig` (`ai.ts:68`).
- Skutek: test **nie może** wywołać `assertSafeBaseUrl(hostileValue)` w izolacji. Jedyna ścieżka to **re-ewaluacja modułu** — wzorzec `ai.test.ts`: `vi.doMock("astro:env/server", ...)` (`ai.test.ts:12-21`) + dynamiczny `await import("@/lib/config/ai")` + `vi.resetModules()`/`vi.doUnmock` w `afterEach` (`ai.test.ts:7-10`). Funkcje są czyste (bez I/O), ale walidacja jest **efektem ubocznym ładowania modułu**. To decyzja dla planu: zostać przy re-imporcie, czy dodać eksport dla izolowanego testu (dziś eksportu brak).

### Infrastruktura testowa i konwencje (dla planu)

- **Configi**: `vitest.config.ts` (env `node`, `vitest.config.ts:9`; exclude `**/*.integration.test.ts`, `vitest.config.ts:10`; alias `@`→`./src`, `vitest.config.ts:12-16`; brak `setupFiles`). `vitest.integration.config.ts` (include `**/*.integration.test.ts`, ładuje env testowe, timeout 30 s).
- **Skrypty**: `test: "vitest run"` (`package.json:16`), `test:integration` (`package.json:17`). `vitest ^4.1.8`. **Brak `@vitest/coverage-*`** (coverage nieskonfigurowane) i brak `test:watch`.
- **52 pliki unit współlokowane** (`foo.ts` + `foo.test.ts`, bez `__tests__/`); **9 integracyjnych w `tests/integration/`** (nie współlokowane). Warianty „brakującej zmiennej" jako osobne pliki: `byok-crypto.no-kek.test.ts`, `user-hash.no-salt.test.ts` — wprost wzorzec fail-closed.
- **Testy referencyjne (§6.1/§6.5 książki kucharskiej):**
  - `src/lib/config/ai.test.ts` — fail-closed przy imporcie (`vi.doMock` + `resetModules` + dynamic import; `rejects.toThrow(/allowlisty|https|URL|store/)`).
  - `src/lib/ai/classifier.test.ts` — egress przez granicę HTTP (`vi.stubGlobal("fetch", fetchMock)`, inspekcja `fetchMock.mock.calls[0]`; asercje `url).not.toContain("sk-...")`, `body).not.toContain(...)`, `Authorization === "Bearer sk-..."`).
  - `src/lib/services/mask.test.ts` — czysta funkcja (`maskSecrets`/`maskUnknown`, `toContain("[REDACTED]")` / `.not.toContain`).
- **Mockowanie**: MSW **nieobecny**. Granica HTTP przez `vi.stubGlobal("fetch", vi.fn())`; env przez `vi.mock("astro:env/server", ...)` (hoistowany) lub `vi.doMock` (gdy walidacja przy imporcie). Logi/konsola przez `vi.spyOn(console, ...)`.

## Code References

Permalinki przypięte do commita `736bfd9` (`https://github.com/qbarium/10xdevs3_project/blob/736bfd967d7f9f69bbff832496ad94a1f0a4dd86/...`):

**Ryzyko #1 (masking + logi):**
- [`src/lib/services/mask.ts#L35-L46`](https://github.com/qbarium/10xdevs3_project/blob/736bfd967d7f9f69bbff832496ad94a1f0a4dd86/src/lib/services/mask.ts#L35-L46) — `maskSecrets` (prefiks + entropia).
- [`src/lib/services/mask.ts#L60-L71`](https://github.com/qbarium/10xdevs3_project/blob/736bfd967d7f9f69bbff832496ad94a1f0a4dd86/src/lib/services/mask.ts#L60-L71) — `maskUnknown`.
- [`src/lib/config/byok.ts#L35-L40`](https://github.com/qbarium/10xdevs3_project/blob/736bfd967d7f9f69bbff832496ad94a1f0a4dd86/src/lib/config/byok.ts#L35-L40) — `DEFAULT_MASK_CONFIG` (parametry maskera / format klucza).
- [`src/lib/services/logger.ts#L47-L80`](https://github.com/qbarium/10xdevs3_project/blob/736bfd967d7f9f69bbff832496ad94a1f0a4dd86/src/lib/services/logger.ts#L47-L80) — `serializeError` + `reportError` (jedyny komin).
- [`src/lib/services/byok-display.ts#L11-L15`](https://github.com/qbarium/10xdevs3_project/blob/736bfd967d7f9f69bbff832496ad94a1f0a4dd86/src/lib/services/byok-display.ts#L11-L15) — `maskKeyForDisplay` (przeciwna semantyka — NIE filtr logów).
- [`src/pages/api/profile/byok-key.ts#L29-L34`](https://github.com/qbarium/10xdevs3_project/blob/736bfd967d7f9f69bbff832496ad94a1f0a4dd86/src/pages/api/profile/byok-key.ts#L29-L34) — walidacja wejścia klucza (trim + niepusty, bez formatu).
- [`src/lib/ai/classifier.ts#L66-L78`](https://github.com/qbarium/10xdevs3_project/blob/736bfd967d7f9f69bbff832496ad94a1f0a4dd86/src/lib/ai/classifier.ts#L66-L78) — fetch + `Authorization` + catch `cause` (najostrzejszy near-miss).

**Ryzyko #4 (egress):**
- [`src/lib/config/ai.ts#L25`](https://github.com/qbarium/10xdevs3_project/blob/736bfd967d7f9f69bbff832496ad94a1f0a4dd86/src/lib/config/ai.ts#L25) — `ALLOWED_OPENAI_HOSTS` (allowlista w kodzie).
- [`src/lib/config/ai.ts#L40-L65`](https://github.com/qbarium/10xdevs3_project/blob/736bfd967d7f9f69bbff832496ad94a1f0a4dd86/src/lib/config/ai.ts#L40-L65) — `assertSafeBaseUrl` + `assertNoStore` (fail-closed).
- [`src/lib/config/ai.ts#L68-L74`](https://github.com/qbarium/10xdevs3_project/blob/736bfd967d7f9f69bbff832496ad94a1f0a4dd86/src/lib/config/ai.ts#L68-L74) — `aiConfig` (walidacja przy imporcie modułu).
- [`astro.config.mjs#L85-L88`](https://github.com/qbarium/10xdevs3_project/blob/736bfd967d7f9f69bbff832496ad94a1f0a4dd86/astro.config.mjs#L85-L88) — env `OPENAI_BASE_URL`/`OPENAI_STORE`.
- [`src/lib/ai/request.ts#L28`](https://github.com/qbarium/10xdevs3_project/blob/736bfd967d7f9f69bbff832496ad94a1f0a4dd86/src/lib/ai/request.ts#L28) — `store: params.store` w body.

**Testy referencyjne / infrastruktura:**
- [`src/lib/config/ai.test.ts#L24-L49`](https://github.com/qbarium/10xdevs3_project/blob/736bfd967d7f9f69bbff832496ad94a1f0a4dd86/src/lib/config/ai.test.ts#L24-L49) — istniejące pokrycie 4 wrogich wartości egress.
- [`src/lib/ai/classifier.test.ts#L55-L68`](https://github.com/qbarium/10xdevs3_project/blob/736bfd967d7f9f69bbff832496ad94a1f0a4dd86/src/lib/ai/classifier.test.ts#L55-L68) — inwariant „klucz tylko w nagłówku, nie w URL/body".
- [`src/lib/services/mask.test.ts`](https://github.com/qbarium/10xdevs3_project/blob/736bfd967d7f9f69bbff832496ad94a1f0a4dd86/src/lib/services/mask.test.ts) — wzorzec czystej funkcji maskera.
- [`vitest.config.ts#L9-L16`](https://github.com/qbarium/10xdevs3_project/blob/736bfd967d7f9f69bbff832496ad94a1f0a4dd86/vitest.config.ts#L9-L16) — env node, exclude integracyjnych, alias `@`.

## Architecture Insights

- **Obrona w głąb, nie pojedynczy strażnik.** Oba ryzyka mają wzorzec „warstwa strukturalna wymuszona + backstop": #1 = ESLint-komin + dyscyplina (pierwsza linia) i masker (backstop); #4 = allowlista w kodzie + fail-closed przy imporcie i `store:false` jawnie w body. Test QA powinien celować w **inwariant** (co musi być prawdą), a nie w pojedynczą funkcję — inaczej ryzykuje pominięcie warstwy nośnej.
- **Fail-closed jako powtarzalny wzorzec projektu.** Trzy niezależne miejsca realizują ten sam kształt: KEK (crypto), `CLASSIFICATION_HASH_SALT` (user-hash), `assertSafeBaseUrl`/`assertNoStore` (egress) — wszystkie rzucają przy złej/brakującej wartości. Repo koduje to nawet w konwencji testów: pliki-warianty `*.no-kek.test.ts` / `*.no-salt.test.ts`. Nowe testy fail-closed dla egress mają gotowy wzorzec do naśladowania.
- **Allowlista w kodzie, nie w env** — świadoma granica zaufania (`env to nie granica zaufania`, `lessons.md`). To sam w sobie inwariant wart przypięcia: test, który wykryłby, gdyby ktoś przeniósł allowlistę do env.
- **Testowalność bywa efektem ubocznym ładowania modułu.** `aiConfig` waliduje przy imporcie → testy muszą tańczyć `doMock` + `resetModules` + dynamic import. To realny koszt utrzymania; plan powinien świadomie wybrać między „zostać przy re-imporcie" (zero zmian w produkcie) a „wyeksportować czyste funkcje" (łatwiejszy test, ale zmiana powierzchni modułu).

## Historical Context (from prior changes)

- `context/archive/2026-06-07-byok-secret-security/plan.md` — **F-01**: centralny logger jako jedyny komin, masker `sk-`+entropia, crypto AES-256-GCM fail-closed. Świadome luki: próg entropii `ENTROPY_MIN_LENGTH=32` (token 20–31 znaków bez prefiksu przechodzi — ACCEPTED-AS-RISK dla „tylko OpenAI"); `atob` toleruje białe znaki (SKIPPED — tag GCM to ostateczna brama).
- `context/archive/2026-06-08-byok-key-config/plan.md` — **S-01**: przechowywanie klucza (`profiles.api_key_encrypted`), `api_key_hint` przez `maskKeyForDisplay`, RLS per-user. Walidacja formatu klucza **świadomie pominięta** (FR-022). Flaga długu CSRF (F1) → prekursor S-14.
- `context/archive/2026-06-10-first-gated-generation/reviews/impl-review.md` — **S-02, ustalenie F2**: tu wprowadzono `assertSafeBaseUrl`/`assertNoStore` po wykryciu, że `OPENAI_BASE_URL`/`OPENAI_STORE` były `access:"public"` bez walidacji (wektor egress klucza + retencja wsadu). Znane nietestowane: guard 413 na `Content-Length` (tylko runtime Workers — `Request` syntetyczny w vitest nie niesie `Content-Length`); bucket `import-files` bez limitu rozmiaru/MIME na poziomie Storage (ACCEPTED-AS-RISK).
- `context/archive/2026-07-02-csrf-hardening/plan.md` — **S-14**: origin-check fail-closed w middleware PRZED `getUser()`, obejmuje mutujące `profile/byok-key` (zapis klucza) i `ingest/classify` (wysyłka wsadu). Domyka dług F1 z S-01. Predykat `isTrustedRequest` czysty i już otestowany (`src/lib/security/csrf.test.ts`).

## Related Research

- Brak wcześniejszych `research.md` bezpośrednio o inwariantach bezpieczeństwa w `context/changes/**` (to pierwsza faza wdrożenia test-planu). Materiał historyczny pochodzi z `plan.md`/`reviews/` powyższych zmian archiwalnych.
- Kanon nadrzędny: `context/foundation/test-plan.md` §2 (mapa ryzyka, ryzyka #1 i #4), §2 tabela „Wskazówki reagowania na ryzyko" (definiuje, co ta faza ma udowodnić i jakie anty-wzorce omijać), §6.1/§6.5 (książka kucharska do wypełnienia przez tę fazę).

## Open Questions

Do rozstrzygnięcia w `/10x-plan` (decyzje projektowe, nie fakty o kodzie):

1. **Luka maskera vs dopuszczalny format klucza (#1).** Czy Faza 1 dodaje test negatywny dokumentujący, że krótki/nie-`sk-` klucz **nie** jest łapany przez `maskSecrets` — i czy to test „pinujący znane ograniczenie" (jak F3 w archiwum), czy sygnał do **utwardzenia** (np. walidacja formatu klucza przy zapisie / rozszerzenie klasy maskera)? Utwardzenie byłoby zmianą produktu poza czystym testowaniem — wymaga świadomej decyzji zakresu.
2. **Error-path near-miss `classifier.ts:75-78` (#1).** Czy warto dodać test regresji asertujący, że `cause` błędu sieci **nie** trafia do żadnego sinka (dziś nie trafia, bo `mapClassifyError` nie woła `reportError`) — jako bariera przeciw przyszłej zmianie, która by to złamała?
3. **Eksport strażników egress (#4).** Zostać przy wzorcu re-importu modułu (zero zmian w produkcie, istniejący `ai.test.ts` już to robi), czy wyeksportować `assertSafeBaseUrl`/`assertNoStore` jako czyste funkcje dla izolowanego testu? Kompromis: koszt utrzymania testu vs powiększenie powierzchni modułu.
4. **Zakres „audyt vs dopisanie".** Skoro rdzeń #4 jest pokryty, a #1 ma masker/logger/endpoint pokryte — czy Faza 1 to przede wszystkim (a) audyt kompletności istniejących asercji względem tabeli §2 „Co udowodniłoby ochronę", (b) domknięcie luk negatywnych z pkt 1–2, (c) przypięcie zestawu jako świadoma bariera regresji? Rekomendacja badania: wszystkie trzy, w tej kolejności, warstwa unit.
5. **Aktualizacja §6.5 książki kucharskiej.** Faza kończy się podfazą wpisującą do `test-plan.md` §6.5 wzorzec „inwariant bezpieczeństwa/prywatności" (lokalizacja, nazewnictwo `*.test.ts` / wariant `*.no-<var>.test.ts`, test referencyjny `ai.test.ts`/`mask.test.ts`, komenda `npm test`). Do potwierdzenia w planie.
