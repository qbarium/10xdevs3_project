# Testy inwariantów bezpieczeństwa/prywatności — Plan implementacji

## Przegląd

Faza 1 wdrożenia test-planu (`context/foundation/test-plan.md §3`): testy jednostkowe inwariantów
bezpieczeństwa/prywatności dla **ryzyka #1** (klucz API użytkownika wycieka do logów / błędów) i
**ryzyka #4** (surowy wsad wychodzi poza allowlistę hostów / retencja u dostawcy). Tryb pracy:
**audyt istniejącego pokrycia + domknięcie realnych luk + przypięcie regresji** — bez duplikowania
tego, co już otestowane, i **bez zmian w kodzie produkcyjnym**.

## Analiza stanu obecnego

Badanie (`research.md`) + odczyt plików testów ustalił, że rdzeń obu ryzyk jest już otestowany:

- **Ryzyko #4 (egress) — praktycznie w pełni pokryte:**
  - `src/lib/config/ai.test.ts:23-49` — 4 wrogie wartości env (`OPENAI_BASE_URL` spoza allowlisty /
    `http://` / błędny URL / `OPENAI_STORE=true`) → `AiConfigError` (fail-closed przy imporcie modułu).
  - `src/lib/ai/request.test.ts:24` — `buildChatRequest` wpisuje `store:false` i `user:<hash>` (nie surowy userId).
  - `src/lib/ai/classifier.test.ts:55-68` — klucz **tylko** w nagłówku `Authorization`, nigdy w URL/body.
- **Ryzyko #1 (klucz w logach) — obrona pierwszej linii pokryta, backstop ma udokumentowaną lukę:**
  - `src/lib/services/logger.test.ts` + `src/lib/services/byok-endpoint.test.ts` — jedyny komin
    logów, maskowanie `cause`/pól zagnieżdżonych, generyczny błąd endpointu, sukces nic nie loguje.
  - `src/lib/services/mask.test.ts` — masker; **luka:** wszystkie testy klucza używają kształtu
    pasującego do regexu maskera (`sk-`+≥20 znaków lub ≥32-znakowa entropia), podczas gdy walidacja
    wejścia klucza (`src/pages/api/profile/byok-key.ts:29-34`) to tylko trim+niepusty — więc krótki
    lub nie-`sk-` klucz **nie zostałby zamaskowany**. Oracle wzięty z kształtu filtra = tautologia (§2).

## Pożądany stan końcowy

Po tej zmianie zestaw testów jednostkowych **jawnie dokumentuje granicę** ochrony obu ryzyk (co
backstop maskera łapie, a czego nie i dlaczego to akceptowalne), przypina najostrzejszy near-miss
ścieżki błędu (#1) oraz inwariant „`store:false` na drucie" (#4), a `test-plan.md §6` przestaje mówić
„TBD" o wzorcu testu inwariantu bezpieczeństwa. Weryfikacja: `npm test` zielony; §6.5 wypełnione;
przegląd potwierdza, że oracle testów granicy NIE pochodzi z kształtu regexu maskera.

### Kluczowe odkrycia:

- Masker wymaga `sk-`+`{20,}` znaków (`src/lib/config/byok.ts:12`) lub ≥32-znakowej entropii
  (`byok.ts:21`, `src/lib/services/mask.ts:41-44`); walidacja wejścia klucza nie egzekwuje formatu
  (`byok-key.ts:29-34`) → krótki/nie-`sk-` klucz omija backstop. Obrona pierwszej linii to „klucz
  nigdy nie trafia do loggera" (ESLint `no-console` + dyscyplina), a masker to backstop.
- Near-miss #1: `src/lib/ai/classifier.ts:75-78` zawija surowy `cause` błędu sieci; dziś NIE jest
  logowany, bo `mapClassifyError` zwraca `"provider"` bez `reportError` (`src/lib/ai/classify-core.ts:44`,
  loguje tylko `logger.warn(..., {sessionId, code})` w `classify-core.ts:85`).
- `aiConfig` waliduje przy imporcie modułu (`src/lib/config/ai.ts:68-74`); strażnicy nie są
  eksportowani → wzorzec testu to `vi.doMock("astro:env/server")` + `vi.resetModules()` + dynamiczny
  import (już zastosowany w `ai.test.ts`).
- Konwencja: testy współlokowane `<moduł>.test.ts`; warianty „brakującej zmiennej" jako osobne pliki
  `*.no-kek.test.ts` / `*.no-salt.test.ts`; mock granicy HTTP przez `vi.stubGlobal("fetch", vi.fn())`;
  MSW nieobecny; brak `@vitest/coverage-*`. Uruchomienie: `npm test`.

## Czego NIE robimy

- **NIE utwardzamy produktu** — żadnej walidacji formatu klucza w `byok-key.ts` ani rozszerzania
  maskera (świadoma decyzja: „przypnij granicę", nie „utwardź"). FR-022 pozostaje poza zakresem
  (zgodnie z archiwalną decyzją S-01). Jeśli utwardzenie kiedyś wejdzie, to osobna zmiana.
- **NIE eksportujemy** `assertSafeBaseUrl`/`assertNoStore` — zostajemy przy wzorcu re-importu modułu.
- **NIE duplikujemy** pokrytego rdzenia #4 (4 wrogie wartości w `ai.test.ts`, `store:false` w izolacji
  w `request.test.ts`) — dla #4 tylko audyt + jeden pin end-to-end „na drucie".
- **NIE piszemy** testów integracyjnych ani e2e i **nie wołamy realnego dostawcy AI** — cała warstwa unit.
- **NIE dotykamy** CSRF (zamknięte S-14), izolacji per-user / RLS (to Faza 2 test-planu) ani crypto
  (pokryte w `byok-secret-security`).
- **NIE podłączamy bramki CI** dla testów — to Faza 5 test-planu.

## Podejście do implementacji

Najpierw domknięcie realnej luki #1 (gros nowej pracy), potem lekki audyt + pojedynczy pin #4 i
zamykająca podfaza książki kucharskiej §6. Każdy nowy test naśladuje istniejący wzorzec referencyjny,
by pozostać spójnym z zestawem (`mask.test.ts` — czysta funkcja; `classifier.test.ts` —
`vi.stubGlobal("fetch")` + inspekcja `mock.calls`).

## Krytyczne szczegóły implementacji

- **Oracle maskera NIE może pochodzić z kształtu regexu maskera.** Testy granicy #1 celowo używają
  kluczy KRÓTSZYCH niż próg (`sk-`+<20 znaków albo <32-znakowy nie-`sk-`), by udokumentować, czego
  backstop NIE łapie. To charakterystyka znanego ograniczenia (jak archiwalne F3), nie bug do naprawy.
- **Pin „cause nie trafia do sinka" musi użyć NIEmaskowalnego sentinela.** Gdyby treść `cause` była
  kształtu klucza (`sk-`+długi), masker zredagowałby dowód i test byłby zielony przypadkiem — nie
  wykryłby przyszłego dodania `reportError(err)`. Oracle: umieść w `cause` sentinel, którego masker
  nie redaguje (krótki, niska entropia, bez prefiksu), i asertuj jego NIEobecność w wyjściu console.
- **`aiConfig` waliduje przy imporcie** — testy egress idą wzorcem `vi.doMock` + `resetModules` +
  dynamiczny import; strażnicy nie są wywoływalni w izolacji.

## Faza 1: Domknięcie luki maskera #1 (klucz w logach)

### Przegląd

Uczynić granicę backstopu maskera jawną (test charakteryzujący, że krótki/nie-`sk-` klucz przechodzi
niezamaskowany) oraz przypiąć, że surowy `cause` błędu sieci klasyfikatora nie trafia do żadnego sinka
logów — niezależnie od maskera.

### Wymagane zmiany:

#### 1. Testy granicy maskera (znane ograniczenie backstopu)

**Plik**: `src/lib/services/mask.test.ts`

**Cel**: Udokumentować przez test, że `maskSecrets` NIE maskuje kluczy w kształtach, które walidacja
wejścia dopuszcza, a których backstop nie pokrywa: (a) krótki `sk-` klucz (mniej niż próg `{20,}`
znaków po prefiksie), (b) krótki nie-`sk-` ciąg o niskiej entropii/poniżej progu 32 znaków. Czyni to
granicę uczciwą wobec przyszłego kontrybutora zamiast pozostawiać wrażenie „masker łapie wszystko".

**Kontrakt**: Nowe `it(...)` w istniejącym `describe("mask — maskowanie sekretów")`. Asercje typu
`expect(maskSecrets("sk-abc123")).toBe("sk-abc123")` oraz `.not.toContain("[REDACTED]")` dla krótkiego
nie-`sk-`. Komentarz wiąże test z granicą backstopu (obrona pierwszej linii = klucz nigdy nie trafia
do loggera; klucze OpenAI są zawsze `sk-`+długie, więc realne ryzyko znikome). Oracle jawnie krótszy
niż próg z `byok.ts` — nie kopiuj kształtu regexu.

#### 2. Pin: `cause` błędu sieci nie trafia do sinka logów

**Plik**: `src/lib/ai/classify-core.test.ts`

**Cel**: Przypiąć inwariant, że gdy klasyfikator rzuca `ClassifierProviderError` z surowym `cause`
(potencjalnie niosącym szczegóły żądania), warstwa obsługi (`mapClassifyError`/`runClassification`)
NIE przekazuje treści `cause` do console — chroni najostrzejszy near-miss `classifier.ts:75-78` przed
przyszłą zmianą, która dodałaby `reportError(err)`.

**Kontrakt**: Nowy `it(...)`; zmockuj `@/lib/ai/classifier` tak, by `classify` rzucał
`ClassifierProviderError(..., { cause: new Error("<sentinel>") })`; spy na `console.{info,warn,error}`
(wzorzec z `logger.test.ts`/`byok-endpoint.test.ts`); wywołaj ścieżkę `runClassification`; asertuj, że
złapane wyjście NIE zawiera `<sentinel>`. `<sentinel>` musi być NIEmaskowalny (patrz Krytyczne
szczegóły) — inaczej test zielony przypadkiem. Reużyj istniejących mocków pliku, jeśli są.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- [ ] Testy granicy maskera przechodzą: `npm test`
- [ ] Pin „cause nie trafia do sinka" przechodzi: `npm test`
- [ ] Lint + typecheck czyste: `npm run lint`

#### Weryfikacja ręczna:

- [ ] Testy granicy jawnie (komentarzem) opisują znane ograniczenie backstopu, nie sugerują buga; oracle nie pochodzi z kształtu regexu maskera
- [ ] Pin `cause` używa NIEmaskowalnego sentinela — ręcznie zweryfikowane, że test staje się czerwony po tymczasowym dodaniu `reportError(err)` w ścieżce provider

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznych, zatrzymaj
się na ręczne potwierdzenie przed Fazą 2.

---

## Faza 2: Audyt egress #4 + pin „store:false na drucie" + książka kucharska

### Przegląd

Potwierdzić audytem, że rdzeń #4 jest pokryty, dołożyć jedną asercję end-to-end „`store:false` na
drucie" i domknąć fazę podfazą aktualizującą `test-plan.md §6` (wzorzec inwariantu bezpieczeństwa +
test referencyjny).

### Wymagane zmiany:

#### 1. Pin: wychodzące żądanie `classify` niesie `store:false`

**Plik**: `src/lib/ai/classifier.test.ts`

**Cel**: Przypiąć end-to-end, że `aiConfig.store` (=`assertNoStore`, zawsze `false`) faktycznie ląduje
w body żądania na drucie. Dziś `request.test.ts` testuje `buildChatRequest` w izolacji z `store:false`
jako input, ale żadna asercja nie łączy realnego wywołania `classify` z wartością na drucie.

**Kontrakt**: Nowe `it(...)` lub rozszerzenie istniejącego testu inspekcji `fetchMock.mock.calls[0]`;
po `runClassify()` asertuj `JSON.parse(init.body as string).store === false`. Reużywa `fetchMock` i
mocka `astro:env/server` z pliku.

#### 2. Wypełnienie książki kucharskiej §6

**Plik**: `context/foundation/test-plan.md`

**Cel**: Zastąpić placeholdery „TBD" konkretnym wzorcem, tak by §6 stało się kanoniczną odpowiedzią
„jak dodać test inwariantu bezpieczeństwa w tym projekcie".

**Kontrakt**: Edycja markdown. §6.5 („inwariant bezpieczeństwa/prywatności") dostaje: lokalizację
(współlokowany `<moduł>.test.ts`), wzorce (fail-closed przy imporcie: `vi.doMock` + `resetModules` +
dynamiczny import; egress: `vi.stubGlobal("fetch")` + inspekcja `mock.calls`; masker: czysta funkcja;
wariant „brakującej zmiennej": `*.no-<var>.test.ts`), testy referencyjne (`src/lib/config/ai.test.ts`,
`src/lib/services/mask.test.ts`), komendę `npm test`. §6.1 test referencyjny TBD → `src/lib/services/mask.test.ts`.
§6.6 dostaje 2-3 linie notatki per faza (czego nauczyła — luka backstopu, sentinel oracle). Aktualizuj
`## 8. Rejestr świeżości` datą, jeśli dotyczy.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- [ ] Asercja „store:false na drucie" przechodzi: `npm test`
- [ ] Cały zestaw zielony bez regresji: `npm test`
- [ ] Lint + typecheck czyste: `npm run lint`
- [ ] `test-plan.md §6.5` nie zawiera już „TBD — patrz §3 Faza 1" (grep pusty)

#### Weryfikacja ręczna:

- [ ] §6.5/§6.1/§6.6 opisują realny wzorzec (lokalizacja, nazewnictwo, test referencyjny, komenda) zgodny z tym, co faza faktycznie zrobiła
- [ ] Audyt #4 potwierdzony w przeglądzie: dodano tylko pin „na drucie", zero duplikacji istniejących asercji

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznych, zatrzymaj
się na ręczne potwierdzenie. Po niej zmiana jest gotowa do `/10x-implement`→`/10x-impl-review`.

---

## Strategia testowania

### Testy jednostkowe:

- Granica maskera: krótki `sk-` (<20 po prefiksie) i krótki nie-`sk-` → niezamaskowane (charakterystyka).
- Pin `cause`: sentinel w `cause` `ClassifierProviderError` nie pojawia się w console na ścieżce provider.
- Egress na drucie: body żądania `classify` niesie `store:false`.
- Przypadki brzegowe: sentinel dobrany tak, by masker go nie redagował (niska entropia, brak prefiksu, <32 znaki).

### Testy integracyjne:

- Brak — cała zmiana jest jednostkowa (izolacja per-user / RLS to Faza 2 test-planu, osobna zmiana).

### Kroki testowania ręcznego:

1. Uruchom `npm test` — cały zestaw zielony.
2. Tymczasowo dodaj `reportError(err)` w gałęzi provider `classify-core.ts` → pin `cause` staje się czerwony; cofnij zmianę.
3. Przejrzyj `test-plan.md §6` — wzorzec czytelny dla kogoś, kto nie brał udziału w tej fazie.

## Uwagi dotyczące wydajności

Brak implikacji wydajnościowych — zmiana wyłącznie testowa, bez kodu produkcyjnego.

## Uwagi dotyczące migracji

Brak — żadnych zmian schematu, danych ani konfiguracji runtime.

## Referencje

- Powiązane badania: `context/changes/testing-security-privacy-invariants/research.md`
- Umowa jakościowa: `context/foundation/test-plan.md` (§2 mapa ryzyka #1/#4, §6 książka kucharska)
- Testy referencyjne: `src/lib/config/ai.test.ts`, `src/lib/services/mask.test.ts`, `src/lib/ai/classifier.test.ts`
- Kontekst historyczny: `context/archive/2026-06-07-byok-secret-security/plan.md` (F-01 masker; F3 znane ograniczenie entropii), `context/archive/2026-06-10-first-gated-generation/reviews/impl-review.md` (F2 strażnicy egress)

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po zakończeniu kroku. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Domknięcie luki maskera #1 (klucz w logach)

#### Automatyczne

- [x] 1.1 Testy granicy maskera przechodzą: `npm test` — f2597b9
- [x] 1.2 Pin „cause nie trafia do sinka" przechodzi: `npm test` — f2597b9
- [x] 1.3 Lint + typecheck czyste: `npm run lint` — f2597b9

#### Ręczne

- [x] 1.4 Testy granicy jawnie opisują znane ograniczenie backstopu; oracle nie z kształtu regexu maskera — f2597b9
- [x] 1.5 Pin `cause` staje się czerwony po tymczasowym dodaniu `reportError(err)` — zweryfikowane ręcznie — f2597b9

### Faza 2: Audyt egress #4 + pin „store:false na drucie" + książka kucharska

#### Automatyczne

- [x] 2.1 Asercja „store:false na drucie" przechodzi: `npm test`
- [x] 2.2 Cały zestaw zielony bez regresji: `npm test`
- [x] 2.3 Lint + typecheck czyste: `npm run lint`
- [x] 2.4 `test-plan.md §6.5` nie zawiera już „TBD — patrz §3 Faza 1"

#### Ręczne

- [x] 2.5 §6.5/§6.1/§6.6 opisują realny wzorzec zgodny z tym, co faza zrobiła
- [x] 2.6 Audyt #4 potwierdzony: dodano tylko pin „na drucie", zero duplikacji
