# Bezpieczna warstwa sekretu BYOK (F-01) — Plan implementacji

## Przegląd

Fundament bezpieczeństwa dla kluczy BYOK, który musi działać, zanim jakikolwiek klucz zostanie zapisany lub użyty. Dwie zdolności:

1. **Szyfrowanie klucza w spoczynku** — AES-256-GCM przez Web Crypto (`crypto.subtle`), klucz szyfrujący (KEK) jako surowy 32-bajtowy sekret z konfiguracji aplikacji, koperta samoopisująca się `v1.<iv>.<ciphertext+tag>`. Fail-closed.
2. **Aktywny filtr maskujący** — centralny logger jako jedyny „komin" logów i błędów, z maskerem czyszczącym ciągi w kształcie klucza (konfigurowalny prefiks `sk-` + fallback wysokiej entropii). Egzekwowany regułą ESLint `no-console: error` z wyjątkiem dla pliku loggera (FR-026 — twardy zakaz globalny).

Całość pokryta testami Vitest, w tym wymagane przypadki: prawdziwy klucz `sk-` zostaje zamaskowany, długi nie-sekret przechodzi.

## Analiza stanu obecnego

- **Brak warstwy kryptograficznej** w kodzie; `nodejs_compat` włączony (`wrangler.jsonc:6-8`), więc Web Crypto (`crypto.subtle`, `crypto.getRandomValues`) dostępne natywnie w workerd, a w Node 22 (CI/Vitest) jako `globalThis.crypto`.
- **Brak centralnego loggera**; błędy lecą ad hoc (np. `src/pages/api/auth/signin.ts:16` przekazuje `error.message` w query stringu). Reguła `no-console` jest dziś `"warn"` (`eslint.config.js:23`).
- **Sekrety przez `astro:env/server`**, schema w `astro.config.mjs:17-22` (oba pola `optional: true`, `access: "secret"`). Wzorzec gotowy do dołożenia KEK.
- **`src/lib/`** zawiera `supabase.ts`, `config-status.ts`, `utils.ts`. Brak `src/lib/services/`, brak `src/types.ts`.
- **Brak test runnera** — `package.json` bez vitest/jest; CI (`.github/workflows/ci.yml`) odpala `npm ci → astro sync → lint → build`, bez kroku testów.
- **Alias `@/*` → `./src/*`** (`tsconfig.json:9-11`) — Vitest musi go odwzorować osobno.
- **Migracja `supabase/migrations/20260604214624_init.sql`** to placeholder; brak tabeli `profiles`/kolumny klucza — to należy do S-01, nie F-01.

## Pożądany stan końcowy

Po ukończeniu planu w bazie kodu istnieją, przetestowane i zlintowane:

- moduł szyfrowania, który dla danego KEK zamienia jawny klucz na kopertę `v1.iv.ct` i z powrotem, fail-closed przy uszkodzeniu lub braku KEK;
- centralny logger maskujący sekrety przed zapisem, jako jedyne dozwolone miejsce użycia `console`, z regułą ESLint wymuszającą ten komin;
- pole sekretu `BYOK_KEK` w schemacie środowiska (opcjonalne) oraz widoczność jego obecności przez `/api/health` (`hasKek`), bez ujawniania wartości (wpis w `config-status` i bramkowanie komunikatem → S-01);
- działający `npm run test` (Vitest) z testami crypto i maskera, podpięty do CI.

Weryfikacja stanu końcowego: `npm run lint && npm run build && npm run test` przechodzą; `/api/health` zwraca flagę `hasKek` bez wartości sekretu.

### Kluczowe odkrycia:

- `nodejs_compat` w `wrangler.jsonc:6-8` — Web Crypto dostępne bez shimu; brak potrzeby `node:crypto`.
- `no-console: "warn"` w `eslint.config.js:23` — do podniesienia na `"error"` + wyjątek dla loggera (flat config: osobny blok `files: ["src/lib/services/logger.ts"]`).
- `config-status.ts:11-19` + `health.ts:9` — gotowy wzorzec flagi konfiguracji bez wycieku wartości; KEK dołączamy analogicznie.
- `astro.config.mjs:17-22` — `envField.string({ context: "server", access: "secret", optional: true })` to wzorzec dla `BYOK_KEK`.

## Czego NIE robimy

- **Schemat DB i kolumna zaszyfrowanego klucza** — należy do S-01 (`byok-key-config`).
- **UI profilu** (zapis/podgląd zamaskowany/usuń klucz) — S-01.
- **Wpis KEK w `config-status` + globalny baner / bramkowanie ścieżek komunikatem** — S-01 (tam powstaje realna ścieżka do bramkowania; w F-01 dałoby tylko baner-widmo w produkcji, bo `missingConfigs` napędza globalny baner w `src/layouts/Layout.astro`). F-01 sygnalizuje KEK wyłącznie flagą `hasKek` w `/api/health`.
- **Wywołania dostawcy AI oraz helper FR-025** (solony hash identyfikatora użytkownika) — S-02 (`first-gated-generation`).
- **Retrofit istniejących przekazań błędów w trasach auth** (`signin.ts`/`signup.ts` query-string, `ServerError.tsx`) — klucz AI tam nie przepływa; opcjonalne utwardzanie poza zakresem F-01.
- **Rotacja KEK** (PRD OQ7) — statyczny KEK; koperta nosi wersję, by przyszła rotacja nie wymagała migracji.
- **Walidacja klucza przy zapisie** (FR-022) — świadomie poza F-01; klucz ujawni się przy pierwszym wywołaniu w S-02.

## Podejście do implementacji

Cztery fazy przyrostowe, każda samodzielnie weryfikowalna. Najpierw tooling testowy i szkielet konfiguracji (żeby kolejne fazy pisały testy od razu), potem rdzeń kryptograficzny, potem warstwa logowania/maskowania z egzekucją ESLint, na końcu widoczność konfiguracji. Naczelna zasada projektowa: **rozdział czystego rdzenia od otoczki związanej z konfiguracją** — funkcje crypto i masker są czyste (przyjmują klucz/konfigurację jako argumenty, bez importu `astro:env`), a cienka otoczka czyta sekrety. Dzięki temu testy Vitest działają na czystym rdzeniu bez rozwiązywania wirtualnego modułu `astro:env/server`.

## Krytyczne szczegóły implementacji

- **Unikalność IV (AES-GCM).** Każde szyfrowanie generuje świeży, losowy 12-bajtowy IV (`crypto.getRandomValues`). Ponowne użycie IV pod tym samym kluczem łamie bezpieczeństwo GCM — IV nigdy nie jest stały ani wyprowadzany z jawnego tekstu.
- **Separacja czyste/konfiguracja dla testowalności.** Rdzeń (`src/lib/crypto/aes-gcm.ts`, `src/lib/services/mask.ts`) nie importuje `astro:env/server`. Tylko otoczki (`byok-crypto.ts`, ewentualne wiązanie konfiguracji maskera) czytają środowisko. Bez tego Vitest nie rozwiąże `astro:env/server`.
- **Fail-closed.** `decrypt` i odczyt KEK zgłaszają typowane błędy (`ByokCryptoError` i podtypy). Naruszenie tagu GCM jest wykrywane przez `crypto.subtle.decrypt` (rzuca) — brak cichego przejścia z błędnym kluczem. Komunikaty błędów przechodzą przez masker, więc nie mogą zawierać fragmentu klucza.
- **KEK = dokładnie 32 bajty.** Otoczka dekoduje `BYOK_KEK` z base64 i waliduje długość 32 bajtów; nieprawidłowa długość → `KekNotConfiguredError` (fail-closed), nie cichy fallback.
- **Separator koperty.** Format `v1.<base64(iv)>.<base64(ciphertext+tag)>`; `.` nie należy do alfabetu base64, więc parsowanie przez podział na 3 segmenty jest jednoznaczne.
- **Logger nie może rzucać.** `maskUnknown` owija `JSON.stringify` w try/catch — struktury cykliczne (typowe w obiektach błędów bibliotek) i `BigInt` dają `[unserializable]`, nigdy wyjątek. Próba zalogowania błędu nie może wywołać kolejnego błędu.

## Faza 1: Tooling testowy + szkielet konfiguracji

### Przegląd

Wprowadza Vitest z aliasem `@/*`, niesekretny moduł konfiguracji BYOK, wspólne typy oraz pole sekretu KEK w schemacie środowiska. Po tej fazie kolejne fazy mogą pisać testy i czytać konfigurację.

### Wymagane zmiany:

#### 1. Test runner Vitest

**Plik**: `vitest.config.ts` (nowy), `package.json`

**Cel**: umożliwić uruchamianie testów jednostkowych czystego rdzenia w Node 22 z rozwiązaniem aliasu `@/*`.

**Kontrakt**: `vitest.config.ts` eksportuje `defineConfig` z `test.environment: "node"` oraz `resolve.alias` mapującym `@` → `./src` (przez `fileURLToPath`). `package.json` `scripts` zyskuje `"test": "vitest run"`; `devDependencies` zyskuje `vitest`; dochodzi `"engines": { "node": ">=20" }` (twardy próg dla `globalThis.crypto.subtle` — `.nvmrc`/CI pinują tylko major 22, bez `engines` nie ma podłogi). Web Crypto dostępne jako `globalThis.crypto` (Node 22) — bez dodatkowego środowiska.

**Okablowanie type-aware lint (krytyczne — inaczej `npm run lint`/CI padnie).** `eslint.config.js` ma `projectService: true` + `strictTypeChecked`, a `tsconfig.json` obejmuje `**/*` — więc `*.test.ts` ORAZ samo `vitest.config.ts` będą lintowane regułami type-aware. Aby lint przeszedł: (a) wybierz jedną drogę dla globali testowych — import API z `vitest` (`import { describe, it, expect, vi } from "vitest"`) ALBO `test.globals: true` + `"types": ["vitest/globals"]` w `tsconfig`; (b) zapewnij, że `vitest.config.ts` spełnia `strictTypeChecked` (lub dodaj do ignores ESLint); (c) zainstaluj `vitest` przed pierwszym lintem.

#### 2. Niesekretny moduł konfiguracji BYOK

**Plik**: `src/lib/config/byok.ts` (nowy)

**Cel**: trzymać konfigurowalne, niesekretne wartości maskera i nazewnictwa dostawcy poza kodem logiki (zgodnie z decyzją: prefiks i nazwa jako konfiguracja, nie stałe rozsiane w kodzie).

**Kontrakt**: eksportuje `BYOK_KEY_PREFIXES: readonly string[]` (wartość: `["sk-"]` — łapie też `sk-proj-`), `BYOK_KEY_CHARS` — klasa znaków klucza po prefiksie wraz z progiem długości (np. `[A-Za-z0-9_-]{20,}`), by regex prefiksu był deterministyczny i testowalny (bez tego „prefiks + następujące znaki" pod- lub nad-dopasowuje), `AI_PROVIDER_NAME: string` (`"OpenAI"`), oraz parametry fallbacku entropii (`ENTROPY_MIN_LENGTH`, `ENTROPY_MIN_BITS_PER_CHAR` lub równoważny próg). Typ `ByokMaskConfig` opisujący te pola, by masker mógł przyjąć override w testach.

#### 3. Wspólne typy i błędy

**Plik**: `src/types.ts` (nowy)

**Cel**: jeden dom dla typu koperty, poziomów logowania i hierarchii błędów kryptograficznych.

**Kontrakt**: `EncryptedEnvelope` (typ brandowany na bazie `string`), `LogLevel` (`"info" | "warn" | "error"`), `LogFields` (rekord serializowalny). Klasa bazowa `ByokCryptoError` i podtypy `KekNotConfiguredError`, `EnvelopeFormatError`, `DecryptionError` (mogą żyć tu lub w `src/lib/crypto/errors.ts` importowanym przez `types.ts` — implementator wybiera, byle jeden punkt prawdy).

#### 4. Pole sekretu KEK w schemacie środowiska

**Plik**: `astro.config.mjs`

**Cel**: zadeklarować `BYOK_KEK` jako serwerowy sekret, opcjonalny (build CI bez sekretu musi przechodzić, jak Supabase).

**Kontrakt**: w `env.schema` dochodzi `BYOK_KEK: envField.string({ context: "server", access: "secret", optional: true })`. Brak zmian w `wrangler.jsonc` (sekret wgrywany przez `wrangler secret put`, poza tym planem — to operacja [USER]).

#### 5. Krok testów w pipeline CI

**Plik**: `.github/workflows/ci.yml`

**Cel**: zielony build musi wymagać przejścia testów — bez tego deklaracja „testy podpięte do CI" jest pusta (testy istnieją tylko w `package.json`).

**Kontrakt**: do joba `ci` (po `npm run lint` i `npm run build`) dochodzi krok `- run: npm run test`. Krok nie wymaga sekretów (testy działają na czystym rdzeniu, bez `astro:env`). Niepowodzenie testów = czerwony pipeline, więc branch protection (`required_status_checks=[ci]`) blokuje merge z nieprzechodzącymi testami.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Instalacja zależności bez błędu: `npm install`
- `npm run test` uruchamia Vitest (choćby pojedynczy smoke test) i kończy się sukcesem
- Typy i sync Astro przechodzą: `npx astro sync && npx astro check`
- Build przechodzi: `npm run build`
- Lint przechodzi, type-aware lint obejmuje `*.test.ts` i `vitest.config.ts` bez błędu: `npm run lint`
- `.github/workflows/ci.yml` zawiera krok `npm run test` w jobie `ci` (po `lint`/`build`)

#### Weryfikacja ręczna:

- `vitest.config.ts` rozwiązuje import `@/...` w przykładowym teście (świadomie sprawdzone na jednym imporcie)
- CI na pierwszym pushu wykonuje krok testów i jest zielony (push pod jawną zgodą [USER]; czerwone testy blokują merge)

**Uwaga implementacyjna**: po przejściu weryfikacji automatycznych zatrzymaj się na ręczne potwierdzenie przed Fazą 2.

---

## Faza 2: Warstwa kryptograficzna

### Przegląd

Czysty rdzeń AES-256-GCM (koperta wersjonowana, fail-closed) plus otoczka czytająca KEK z konfiguracji. Pełne pokrycie testami roundtrip i ścieżek błędów.

### Wymagane zmiany:

#### 1. Czysty rdzeń szyfrowania

**Plik**: `src/lib/crypto/aes-gcm.ts` (nowy)

**Cel**: deterministyczny, testowalny rdzeń szyfrowania bez zależności od środowiska.

**Kontrakt**: `importAesKey(raw: Uint8Array): Promise<CryptoKey>` (wymaga 32 bajtów, inaczej rzuca), `encryptToEnvelope(plaintext: string, key: CryptoKey): Promise<EncryptedEnvelope>`, `decryptFromEnvelope(envelope: string, key: CryptoKey): Promise<string>`. Świeży 12-bajtowy IV per szyfrowanie. Format koperty:

```
v1.<base64(iv)>.<base64(ciphertext+tag)>
```

Malformed koperta → `EnvelopeFormatError`; nieudane `crypto.subtle.decrypt` (zły klucz / naruszony tag) → `DecryptionError`. Brak logowania jawnego tekstu lub klucza wewnątrz.

#### 2. Otoczka związana z konfiguracją

**Plik**: `src/lib/services/byok-crypto.ts` (nowy)

**Cel**: udostępnić aplikacji `encryptApiKey`/`decryptApiKey` używające KEK z konfiguracji, fail-closed przy braku/nieprawidłowym KEK.

**Kontrakt**: czyta `BYOK_KEK` z `astro:env/server`, dekoduje base64, waliduje 32 bajty, importuje `CryptoKey` (memoizacja w obrębie modułu). `encryptApiKey(plain: string): Promise<EncryptedEnvelope>` i `decryptApiKey(envelope: string): Promise<string>` delegują do rdzenia. Brak/nieprawidłowy KEK → `KekNotConfiguredError`. Wszystkie błędy są typowane i nie zawierają materiału klucza.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Testy crypto przechodzą: `npm run test` — roundtrip (encrypt→decrypt = oryginał), dwa szyfrowania tego samego tekstu dają różne koperty (różny IV), naruszenie ciphertext → `DecryptionError`, malformed koperta → `EnvelopeFormatError`, zły klucz → `DecryptionError`
- Build przechodzi: `npm run build`
- Lint przechodzi: `npm run lint`

#### Weryfikacja ręczna:

- Wymuszony błąd odszyfrowania nie ujawnia w wyjściu fragmentu KEK ani jawnego tekstu (świadomie sprawdzone)

**Uwaga implementacyjna**: zatrzymaj się na ręczne potwierdzenie przed Fazą 3.

---

## Faza 3: Logger + masker + egzekucja ESLint

### Przegląd

Czysty masker, centralny logger jako jedyny komin i jedyny plik z `console`, oraz reguła ESLint wymuszająca ten komin globalnie.

### Wymagane zmiany:

#### 1. Czysty masker

**Plik**: `src/lib/services/mask.ts` (nowy)

**Cel**: usuwać ciągi w kształcie klucza z dowolnego tekstu przed zapisem do logu.

**Kontrakt**: `maskSecrets(input: string, config?: ByokMaskConfig): string` zastępuje (a) dopasowania prefiksów z `BYOK_KEY_PREFIXES` wraz z następującym ciągiem znaków klucza oraz (b) długie tokeny wysokiej entropii (fallback) placeholderem `[REDACTED]`. `maskUnknown(value: unknown): string` serializuje wejście (JSON) i przepuszcza przez `maskSecrets` — używane przez logger dla pól strukturalnych. **Serializacja w `maskUnknown` jest owinięta w try/catch**: `JSON.stringify` rzuca przy strukturach cyklicznych (typowych w obiektach błędów bibliotek, np. `request`↔`response`) oraz przy `BigInt`; przy niepowodzeniu `maskUnknown` zwraca bezpieczny placeholder `"[unserializable]"` zamiast propagować wyjątek — logger nigdy nie może rzucić przy próbie zalogowania błędu. Domyślna konfiguracja z `src/lib/config/byok.ts`; `config` pozwala na override w testach.

#### 2. Centralny logger

**Plik**: `src/lib/services/logger.ts` (nowy)

**Cel**: jedyny dozwolony punkt logowania/raportowania błędów, maskujący przed zapisem.

**Kontrakt**: `logger.info/warn/error(message: string, fields?: LogFields): void` serializuje `message` + `fields`, przepuszcza przez `maskUnknown`, dopiero potem zapisuje przez `console`. `reportError(err: unknown, fields?: LogFields): void` serializuje CAŁY obiekt błędu (wszystkie pola enumerowalne + `cause`) i przepuszcza przez `maskUnknown` — nie tylko `message`/`stack`, bo sekret może siedzieć w polu zagnieżdżonym (np. owinięty błąd HTTP z `config.headers.authorization`, albo `cause`). To **jedyny** plik z dozwolonym `console`.

#### 3. Egzekucja ESLint

**Plik**: `eslint.config.js`

**Cel**: mechanicznie wymusić, że żaden surowy `console` nie obejdzie maskera.

**Kontrakt**: w `baseConfig.rules` `no-console` zmienia się z `"warn"` na `"error"`. Do tablicy w eksporcie `tseslint.config(...)` dochodzi blok `files: ["src/lib/services/logger.ts"]` z `rules: { "no-console": "off" }`, umieszczony po `baseConfig`, by nadpisać regułę tylko dla loggera.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Testy maskera przechodzą: `npm run test` — klucz `sk-...` zamaskowany, klucz `sk-proj-...` zamaskowany, długi nie-sekret (np. zdanie/UUID o niskiej entropii) przechodzi nienaruszony, losowy token wysokiej entropii zamaskowany fallbackiem, maskowanie wewnątrz serializowanego obiektu
- Logger odporny na nieserializowalne pola: `npm run test` — logowanie obiektu z cyklem (oraz `BigInt`) nie rzuca wyjątku i daje zamaskowane, bezpieczne wyjście (`[unserializable]`); `reportError` maskuje sekret ukryty w polu zagnieżdżonym (`cause`/`config`)
- Lint przechodzi z `no-console: error`: `npm run lint` (brak surowego `console` poza loggerem)
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna:

- Ręczne wywołanie `logger.error` z atrapą `sk-` w treści daje w wyjściu `[REDACTED]` zamiast klucza (świadomie sprawdzone)

**Uwaga implementacyjna**: zatrzymaj się na ręczne potwierdzenie przed Fazą 4.

---

## Faza 4: Widoczność konfiguracji

### Przegląd

Sygnalizacja obecności KEK przez health endpoint, bez ujawniania wartości. (Wpis w `config-status` i bramkowanie ścieżek komunikatem przeniesione do S-01, gdzie powstaje UI profilu i realna ścieżka do bramkowania — w F-01 dałoby tylko baner-widmo w produkcji, bo `missingConfigs` napędza globalny baner w `src/layouts/Layout.astro`.)

### Wymagane zmiany:

#### 1. Flaga w health endpoint

**Plik**: `src/pages/api/health.ts`

**Cel**: umożliwić weryfikację deployu, czy Worker widzi KEK, bez wycieku wartości.

**Kontrakt**: do odpowiedzi JSON dochodzi `hasKek: Boolean(BYOK_KEK)` (import z `astro:env/server`). Bez zmiany kształtu pozostałych pól.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Build przechodzi: `npm run build`
- Lint przechodzi: `npm run lint`
- Testy przechodzą: `npm run test`

#### Weryfikacja ręczna:

- `npm run dev` + `GET /api/health` zwraca `hasKek` jako boolean, bez wartości sekretu w odpowiedzi (sprawdzone przy ustawionym i przy braku `BYOK_KEK` w `.dev.vars`)

**Uwaga implementacyjna**: po tej fazie F-01 jest gotowy; kolejny krok to S-01 (zapis zaszyfrowanego klucza w profilu).

---

## Strategia testowania

### Testy jednostkowe:

- **Crypto** (`src/lib/crypto/aes-gcm.test.ts`): roundtrip; różny IV (dwie koperty tego samego tekstu różne); naruszenie ciphertext → `DecryptionError`; malformed koperta (zły prefiks/segmenty) → `EnvelopeFormatError`; zły klucz → `DecryptionError`.
- **Masker** (`src/lib/services/mask.test.ts`): `sk-` zamaskowany; `sk-proj-` zamaskowany; długi nie-sekret przechodzi (przypadek wymagany); losowy token wysokiej entropii zamaskowany fallbackiem; maskowanie w serializowanym obiekcie.
- **Logger / odporność serializacji** (`src/lib/services/mask.test.ts` / `logger.test.ts`): logowanie obiektu ze strukturą cykliczną nie rzuca i zwraca `[unserializable]`; pole `BigInt` nie rzuca; jeśli wejście zawiera klucz `sk-`, wynik jest zamaskowany (bezpieczny placeholder, nie surowy obiekt); `reportError` na błędzie z sekretem `sk-` w polu zagnieżdżonym (`cause` / `config.headers.authorization`) → zamaskowany.
- **Otoczka KEK** (`src/lib/services/byok-crypto.test.ts`, opcjonalnie): brak/zły KEK → `KekNotConfiguredError` (z mockiem `astro:env/server` przez `vi.mock`); jeśli mock okaże się kruchy, ścieżka weryfikowana ręcznie przez `/api/health` + `config-status`.

### Kroki testowania ręcznego:

1. `npm run dev`, `GET /api/health` → `hasKek` obecne, bez wartości.
2. Wywołanie `logger.error` z atrapą klucza `sk-TEST...` → wyjście zawiera `[REDACTED]`.
3. Usunięcie `BYOK_KEK` z `.dev.vars` → ścieżka crypto zgłasza `KekNotConfiguredError`; `/api/health` zwraca `hasKek: false`.

## Uwagi dotyczące wydajności

Szyfrowanie/odszyfrowanie pojedynczego klucza to operacja jednorazowa per zapis/odczyt — pomijalny koszt CPU (Web Crypto natywny). Memoizacja importu `CryptoKey` w otoczce unika powtórnego importu przy każdym wywołaniu. Bez wpływu na bramkę CPU planu Free (`infrastructure.md`).

## Uwagi dotyczące migracji

Brak migracji DB w F-01 (kolumna klucza wchodzi w S-01). Wprowadzenie sekretu `BYOK_KEK` to operacja [USER] poza repo: wygenerowanie 32-bajtowego losowego klucza (np. `openssl rand -base64 32`), `wrangler secret put BYOK_KEK` (prod) oraz wpis w `.dev.vars` (lokalnie, gitignored). Rotacja KEK: poza MVP; koperta `v1` umożliwia przyszłą wersję bez migracji.

## Referencje

- Roadmapa: `context/foundation/roadmap.md` → F-01
- PRD: FR-021, FR-026, FR-022 (kontekst), NFR „Klucze API w stanie spoczynku", NFR „Prywatność wsadu"
- Tożsamość zmiany: `context/changes/byok-secret-security/change.md`
- Wzorzec flagi konfiguracji (zdrowia): `src/pages/api/health.ts:9` (wpis `config-status.ts:11-19` jako wzorzec → konsumowany w S-01)
- Konsument banera konfiguracji (powód przeniesienia wpisu KEK do S-01): `src/layouts/Layout.astro:4,23`
- Wzorzec sekretu środowiska: `astro.config.mjs:17-22`
- GitHub: parent Issue #4 (`foundation`, `north-star`)

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>`, gdy krok zostanie zrealizowany. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Tooling testowy + szkielet konfiguracji

#### Automatyczne

- [x] 1.1 Instalacja zależności bez błędu: `npm install` — 11eb8cf
- [x] 1.2 `npm run test` uruchamia Vitest i kończy się sukcesem — 11eb8cf
- [x] 1.3 `npx astro sync && npx astro check` przechodzą — 11eb8cf
- [x] 1.4 Build przechodzi: `npm run build` — 11eb8cf
- [x] 1.5 Lint przechodzi (type-aware lint obejmuje `*.test.ts` i `vitest.config.ts` bez błędu): `npm run lint` — 11eb8cf
- [x] 1.6 `.github/workflows/ci.yml` zawiera krok `npm run test` w jobie `ci` (po lint/build) — 11eb8cf

#### Ręczne

- [x] 1.7 `vitest.config.ts` rozwiązuje import `@/...` w przykładowym teście — 11eb8cf
- [ ] 1.8 CI na pierwszym pushu wykonuje krok testów i jest zielony (push pod zgodą [USER])

### Faza 2: Warstwa kryptograficzna

#### Automatyczne

- [ ] 2.1 Testy crypto przechodzą (roundtrip, różny IV, naruszenie ciphertext, malformed koperta, zły klucz): `npm run test`
- [ ] 2.2 Build przechodzi: `npm run build`
- [ ] 2.3 Lint przechodzi: `npm run lint`

#### Ręczne

- [ ] 2.4 Wymuszony błąd odszyfrowania nie ujawnia fragmentu KEK ani jawnego tekstu

### Faza 3: Logger + masker + egzekucja ESLint

#### Automatyczne

- [ ] 3.1 Testy maskera przechodzą (`sk-` zamaskowany, `sk-proj-` zamaskowany, długi nie-sekret przechodzi, token wysokiej entropii zamaskowany, maskowanie w obiekcie): `npm run test`
- [ ] 3.2 Logger odporny na nieserializowalne pola (cykl, `BigInt`) — nie rzuca, daje `[unserializable]`; `reportError` maskuje sekret w polu zagnieżdżonym (`cause`/`config`): `npm run test`
- [ ] 3.3 Lint przechodzi z `no-console: error`: `npm run lint`
- [ ] 3.4 Build przechodzi: `npm run build`

#### Ręczne

- [ ] 3.5 `logger.error` z atrapą `sk-` daje `[REDACTED]` w wyjściu

### Faza 4: Widoczność konfiguracji

#### Automatyczne

- [ ] 4.1 Build przechodzi: `npm run build`
- [ ] 4.2 Lint przechodzi: `npm run lint`
- [ ] 4.3 Testy przechodzą: `npm run test`

#### Ręczne

- [ ] 4.4 `GET /api/health` zwraca `hasKek` jako boolean, bez wartości sekretu (przy ustawionym i przy braku `BYOK_KEK`)
