# Utwardzenie anty-CSRF mutujących endpointów — Plan implementacji

## Przegląd

Utwardzamy powierzchnię mutującą aplikacji przed CSRF metodą **obrony w głąb**. Nie łatamy
otwartej dziury — badanie wykazało, że ochrona już istnieje niejawnie (domyślny
`checkOrigin: true` w Astro + `SameSite=Lax` z `@supabase/ssr` + preflight CORS dla JSON).
Zmiana czyni tę ochronę **jawną, odporną na cichą regresję i dokłada warstwę aplikacyjną**:
własna, fail-closed kontrola `Origin`/`Sec-Fetch-Site` w `src/middleware.ts` (obejmująca też
klasę `application/json`, którą wbudowany middleware Astro celowo przepuszcza), przypięcie
domyślnej ochrony Astro w konfiguracji, jawny `SameSite=Lax` na ciasteczku sesji oraz test
regresji predykatu.

## Analiza stanu obecnego

- Sesja Supabase w ciasteczkach (`src/lib/supabase.ts:9` — `createServerClient`); `setAll`
  przekazuje opcje `@supabase/ssr` bez zmian (`supabase.ts:18`).
- Wszystkie mutacje pod `src/pages/api/**`: 3 formularze auth (`signin`/`signup` — `formData()`;
  `signout` — natywny `<form method=POST>`), gałąź plikowa `classify` (`multipart`), reszta to
  `request.json()` (`items` bulk/operational/create, `items/[id]` PATCH, `trash/empty`,
  `profile/byok-key` POST+DELETE, `import-sessions/retry`, gałąź paste `classify`).
- Front: 10 wywołań `fetch` rozsianych po 4 hookach (`src/components/hooks/`), **bez wspólnego
  wrappera**; 3 natywne formularze auth w ogóle nie idą przez `fetch`.
- **Brak jakiejkolwiek jawnej kontroli CSRF** w `src/` (grep `Origin|Sec-Fetch|csrf` → 0 trafień
  bezpieczeństwa) oraz **brak bloku `security`** w `astro.config.mjs`.
- Ochrona niejawna (potwierdzona w `node_modules`):
  - `astro/dist/core/config/schemas/base.js:52` → `checkOrigin` domyślnie `true`.
  - `astro/dist/core/app/middlewares.js` → wbudowany origin-check odrzuca (403) cross-site żądania
    z „formularzowym" Content-Type (`urlencoded`/`multipart`/`text/plain`) oraz z brakiem
    Content-Type; **`application/json` przepuszcza bez kontroli**.
  - `astro/dist/core/base-pipeline.js:149` → middleware wpięty (`unshift`, przed middleware usera).
  - `@supabase/ssr/dist/main/utils/constants.js:6` → `sameSite: "lax"`, `httpOnly: false`.

## Pożądany stan końcowy

Każde żądanie mutujące (POST/PUT/PATCH/DELETE) jest odrzucane z 403, jeśli nie pochodzi
z tego samego originu — egzekwowane w **dwóch niezależnych warstwach**: wbudowanej Astro
(jawnie przypiętej) i aplikacyjnej w `middleware.ts` (pokrywającej też JSON). Ciasteczko sesji
ma jawnie ustawiony `SameSite=Lax`. Test jednostkowy pinuje predykat origin-check przeciw
regresji. Weryfikacja: cross-origin `curl` POST → 403; przepływy aplikacji (dodanie itemu,
akcje zbiorcze, logowanie) działają bez zmian.

### Kluczowe odkrycia:

- Astro `checkOrigin: true` jest domyślny i realnie wpięty (`base-pipeline.js:149`) — ale jako
  domyślna wartość frameworka może po cichu zniknąć przy aktualizacji/refaktorze; stąd jawny pin.
- Wbudowany origin-check Astro **nie sprawdza `application/json`** (`middlewares.js:36`
  `hasFormLikeHeader`) — tę klasę broni dziś tylko preflight CORS; warstwa aplikacyjna domyka
  ją jawnie.
- Repo wyodrębnia logikę do `src/lib/` i testuje ją w izolacji (wzorzec:
  `src/pages/api/items/bulk.test.ts` — mock `@/lib/supabase`, sztuczny `Request`, asercja
  `res.status`); origin-check jako czysta funkcja pasuje do tego wzorca.
- Ujednolicony kształt błędu API to `{ ok:false, code, error }` (lekcja S-03, `lessons.md`) —
  403 z warstwy aplikacyjnej dziedziczy ten kształt przez `json()` z `@/lib/http`.
- Lekcja „waliduj fail-closed w kodzie, nie ufaj env/domyślnym" (`lessons.md`, S-02) — dozwolony
  origin ustalamy self-referential (`Origin === url.origin`), bez listy w env.

## Czego NIE robimy

- **Nie wprowadzamy tokenu CSRF** (synchronizer/double-submit) — redundantny wobec origin-check;
  brak wspólnego wrappera `fetch` czyniłby go drogim (10 wywołań + 3 formularze poza `fetch`).
- **Nie wprowadzamy wspólnego wrappera `fetch`** — origin-check nie wymaga żadnych zmian po
  stronie klienta.
- **Nie dokładamy allowlisty Content-Type** na endpointach JSON — warstwa aplikacyjna sprawdza
  `Origin` niezależnie od Content-Type, więc dodatkowa kontrola CT byłaby redundancją.
- **Nie zmieniamy `httpOnly`** ciasteczka sesji (`false` to wymóg `@supabase/ssr`; ryzyko XSS
  jest osobną, nie-CSRF sprawą).
- **Nie rozważamy `SameSite=Strict`** (zrywa sesję przy wejściu z linku zewnętrznego za
  marginalny zysk — origin-check już pokrywa CSRF).
- **Nie dotykamy 10 wywołań `fetch` ani 3 formularzy** — pozostają bez zmian.
- **Warstwa kodu tego planu nie zależy od wpisu roadmapy ani zgłoszeń GitHub** — to zmiana spoza
  pierwotnej roadmapy. Decyzją użytkownika umiejscowiono ją jednak jako wycinek utwardzający **S-14**
  (wpis dodany do `roadmap.md` w commicie 720ba4d; sync boardu zgodnie z „Uwagami dotyczącymi
  migracji"). — _zaktualizowano w impl-review 2026-07-05: sekcja odzwierciedla podjętą decyzję._

## Podejście do implementacji

Dwie fazy, po jednej dźwigni każda. Faza 1 dostarcza rdzeń ochrony (aplikacyjny origin-check
+ jawny pin Astro + test) — to samodzielna, kompletna warstwa. Faza 2 dokłada niezależną
warstwę ciasteczkową (`SameSite=Lax` jawnie). Rozdział jest celowy: fazy dotykają rozłącznych
plików i mają niezależne bramki weryfikacji ręcznej (Faza 1: cross-origin → 403; Faza 2:
logowanie działa + atrybut ciasteczka).

## Krytyczne szczegóły implementacji

- **Sekwencjonowanie w middleware:** kontrola CSRF musi biec **przed** `supabase.auth.getUser()`
  w `src/middleware.ts` — wrogie cross-site żądanie odrzucamy fail-fast, bez rundy sieciowej do
  Supabase. Obecny kod woła `createClient` + `getUser` jako pierwsze; nowa bramka wchodzi ponad
  tym.
- **Współistnienie z origin-checkiem Astro:** wbudowany middleware Astro jest `unshift`owany
  przed middleware usera, więc cross-site żądania *formularzowe* Astro odrzuca zanim dobiegnie
  nasza warstwa — to nie kolizja: legalne same-origin przechodzi obie kontrole, a nasza dokłada
  pokrycie `application/json` i sygnał `Sec-Fetch-Site`. Obie zwracają 403.
- **Kontrakt fail-closed (predykat):** żądanie mutujące jest zaufane wtedy i tylko wtedy, gdy
  `Origin` jest obecny i równy `url.origin`, LUB `Origin` jest nieobecny i `Sec-Fetch-Site`
  = `same-origin`. Każdy inny przypadek (Origin obecny i różny; brak obu nagłówków) → odrzuć.
  Oba nagłówki są ustawiane przez przeglądarkę (forbidden headers) — atakujący ich nie podrobi.

## Faza 1: Aplikacyjna kontrola Origin + pin Astro

### Przegląd

Wprowadza czysty, testowalny predykat origin-check, wpina go w `middleware.ts` jako fail-closed
bramkę 403 dla żądań mutujących (pokrywa też JSON), przypina domyślną ochronę Astro w
konfiguracji i pinuje predykat testem jednostkowym.

### Wymagane zmiany:

#### 1. Helper origin-check (nowy)

**Plik**: `src/lib/security/csrf.ts`

**Cel**: Rozstrzyga, czy żądanie mutujące pochodzi z zaufanego (same-origin) źródła. Czysta
funkcja bez zależności od Astro/Supabase, by była deterministycznie testowalna w izolacji.

**Kontrakt**: Eksportuje `isMutatingMethod(method: string): boolean` (true dla metod spoza
`GET`/`HEAD`/`OPTIONS`) oraz `isTrustedRequest(request: Request, url: URL): boolean`. Predykat
`isTrustedRequest` realizuje kontrakt fail-closed z sekcji „Krytyczne szczegóły":

```ts
export function isTrustedRequest(request: Request, url: URL): boolean {
  const origin = request.headers.get("origin");
  if (origin !== null) return origin === url.origin;
  return request.headers.get("sec-fetch-site") === "same-origin";
}
```

#### 2. Wpięcie bramki w middleware

**Plik**: `src/middleware.ts`

**Cel**: Odrzucić nietrusted żądania mutujące z 403 **przed** autoryzacją, zachowując istniejącą
logikę auth/redirectów dla pozostałych żądań.

**Kontrakt**: Na początku `onRequest` (przed `createClient`): jeśli
`isMutatingMethod(context.request.method) && !isTrustedRequest(context.request, context.url)`,
zwróć `json({ ok: false, code: "forbidden", error: "Żądanie z niedozwolonego źródła." }, 403)`
(import `json` z `@/lib/http`). W przeciwnym razie kontynuuj bez zmian.

#### 3. Jawny pin ochrony Astro

**Plik**: `astro.config.mjs`

**Cel**: Przypiąć domyślny `checkOrigin: true`, by aktualizacja frameworka lub refaktor
konfiguracji nie wyłączyły ochrony po cichu.

**Kontrakt**: Dodać top-level klucz `security: { checkOrigin: true }` w `defineConfig({...})`
(obok `output`, `adapter`, `env`) z komentarzem wyjaśniającym, że to jawny pin domyślnej
wartości, nie zmiana zachowania.

#### 4. Test jednostkowy predykatu

**Plik**: `src/lib/security/csrf.test.ts` (nowy)

**Cel**: Zapinować predykat origin-check przeciw regresji — to jest „pin", przed którym ta
zmiana ma chronić.

**Kontrakt**: Testy `isTrustedRequest` (wzorzec `bulk.test.ts` — budowa `Request` z nagłówkami):
same-origin `Origin` → `true`; cross-site `Origin` → `false`; brak `Origin` +
`Sec-Fetch-Site: same-origin` → `true`; brak `Origin` + `Sec-Fetch-Site: cross-site` → `false`;
brak obu nagłówków → `false`. Plus `isMutatingMethod`: `GET`/`HEAD`/`OPTIONS` → `false`,
`POST`/`PATCH`/`DELETE` → `true`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build (z kontrolą typów) przechodzi: `npm run build`
- Testy jednostkowe przechodzą: `npm test`

#### Weryfikacja ręczna:

- Cross-origin POST odrzucony: `curl -i -X POST http://localhost:4321/api/items/bulk -H "Origin: https://evil.example" -H "Content-Type: application/json" -d '{}'` → **403**.
- Legalne przepływy działają przez UI (`http://localhost:4321`): dodanie itemu ręcznego, akcja zbiorcza (accept/trash), edycja itemu — wszystkie kończą się sukcesem.
- Żądanie bez `Origin` z `Sec-Fetch-Site: same-origin` przechodzi (symulacja: `curl` z `-H "Sec-Fetch-Site: same-origin"` bez `Origin` na endpoint mutujący → nie 403 z warstwy CSRF).
- Logowanie (natywny formularz `signin`) nadal działa i przekierowuje po sukcesie.

**Uwaga implementacyjna**: Po zakończeniu Fazy 1 i przejściu weryfikacji automatycznych, zatrzymaj
się na ręczne potwierdzenie od człowieka, zanim przejdziesz do Fazy 2. Bloki faz używają zwykłych
punktorów — pola wyboru `- [ ]` są w sekcji `## Postęp` na dole.

---

## Faza 2: Jawny SameSite=Lax na ciasteczku sesji

### Przegląd

Wymusza jawny `SameSite=Lax` przy zapisie ciasteczek sesji, niezależnie od domyślnych wartości
`@supabase/ssr` — druga, niezależna warstwa obrony przed cross-site wysyłką ciasteczka.

### Wymagane zmiany:

#### 1. Wymuszenie SameSite w setAll

**Plik**: `src/lib/supabase.ts`

**Cel**: Przypiąć `sameSite: 'lax'` na wszystkich ciasteczkach zapisywanych przez klienta SSR,
by atrybut nie zależał od domyślnej wartości biblioteki (dziś `lax`, ale mogłaby się zmienić
przy aktualizacji).

**Kontrakt**: W `setAll` (`supabase.ts:17`), przy `cookies.set`, scal opcje wymuszając SameSite:
`cookies.set(name, value, { ...options, sameSite: "lax" })`. Bez zmiany pozostałych opcji
(`path`, `maxAge`, `httpOnly` itd. zostają jak podał Supabase).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna:

- Logowanie działa; po zalogowaniu odświeżenie strony (`F5`) nie wylogowuje (sesja utrzymana).
- W DevTools (Application → Cookies) ciasteczka sesji Supabase mają atrybut `SameSite=Lax`.
- Wylogowanie (natywny formularz `signout`) działa.

**Uwaga implementacyjna**: Po zakończeniu Fazy 2 i przejściu weryfikacji automatycznych, zatrzymaj
się na ręczne potwierdzenie od człowieka. Pola wyboru w sekcji `## Postęp`.

---

## Strategia testowania

### Testy jednostkowe:

- `isTrustedRequest`: same-origin / cross-site / brak-Origin+SecFetch / brak obu — patrz Faza 1.4.
- `isMutatingMethod`: metody bezpieczne vs mutujące.

### Testy integracyjne:

- Poza zakresem — predykat jest czysty i w pełni pokryty testem jednostkowym; wpięcie w middleware
  potwierdza weryfikacja ręczna (cross-origin `curl` → 403).

### Kroki testowania ręcznego:

1. `npm run dev`; `curl -i -X POST http://localhost:4321/api/items/bulk -H "Origin: https://evil.example" -H "Content-Type: application/json" -d '{}'` → 403.
2. Przez UI: zaloguj się, dodaj item, wykonaj akcję zbiorczą, edytuj item — bez błędów.
3. DevTools → Cookies: atrybut `SameSite=Lax` na ciasteczku sesji (po Fazie 2).
4. Odśwież stronę po zalogowaniu — sesja utrzymana.

## Uwagi dotyczące wydajności

Origin-check to porównanie dwóch stringów nagłówków — koszt pomijalny. Ustawiona przed
`getUser()`, bramka **oszczędza** rundę sieciową do Supabase dla odrzucanych żądań.

## Uwagi dotyczące migracji

- Brak migracji danych/schematu.
- Zmiana `SameSite` dotyczy tylko nowo zapisywanych ciasteczek — istniejące sesje odświeżą atrybut
  przy kolejnym zapisie tokena; nie wymaga wylogowania użytkowników.
- **Roadmapa/board:** ta zmiana nie ma wpisu w `context/foundation/roadmap.md` (wszystkie S-01…S-13
  `done`). Przed sync boardu GitHub trzeba zdecydować, czy umieścić ją jako wycinek utwardzający
  (np. `S-14`/element `foundation`). To decyzja użytkownika poza zakresem tego planu.

## Referencje

- Powierzchnia mutująca + wywołania `fetch`: badanie w tej sesji (mapa endpointów, 2026-07-02).
- Wbudowany origin-check Astro: `node_modules/astro/dist/core/app/middlewares.js`.
- Domyślny `checkOrigin`: `node_modules/astro/dist/core/config/schemas/base.js:52`.
- Domyślny `SameSite`: `node_modules/@supabase/ssr/dist/main/utils/constants.js:6`.
- Wzorzec testu endpointu: `src/pages/api/items/bulk.test.ts`.
- Kształt błędu API + fail-closed w kodzie: `context/foundation/lessons.md`.

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po zakończeniu kroku.
> Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Aplikacyjna kontrola Origin + pin Astro

#### Automatyczne

- [x] 1.1 Lint przechodzi: `npm run lint` — 720ba4d
- [x] 1.2 Build (z kontrolą typów) przechodzi: `npm run build` — 720ba4d
- [x] 1.3 Testy jednostkowe przechodzą: `npm test` (7 nowych, 512 łącznie) — 720ba4d

#### Ręczne

- [x] 1.4 Cross-origin POST → 403 (`curl` z obcym `Origin`; potwierdzone dev + prod-preview + na 4321) — 720ba4d
- [ ] 1.5 Legalne przepływy UI działają (dodanie itemu, akcja zbiorcza, edycja) — opcjonalny sanity, niezrobiony
- [x] 1.6 Żądanie bez `Origin` + `Sec-Fetch-Site: same-origin` przechodzi (401, nie 403) — 720ba4d
- [x] 1.7 Logowanie (formularz `signin`) działa (sesja obecna w ciasteczkach) — 720ba4d

### Faza 2: Jawny SameSite=Lax na ciasteczku sesji

#### Automatyczne

- [x] 2.1 Lint przechodzi: `npm run lint` — 720ba4d
- [x] 2.2 Build przechodzi: `npm run build` — 720ba4d

#### Ręczne

- [x] 2.3 Logowanie działa; sesja utrzymana (ciasteczko `sb-127-auth-token` obecne, długi expiry) — 720ba4d
- [x] 2.4 Ciasteczko sesji ma atrybut `SameSite=Lax` (DevTools — potwierdzone zrzutem) — 720ba4d
- [x] 2.5 Wylogowanie (formularz `signout`) działa — bramka zweryfikowana auto-proxy (impl-review 2026-07-05): same-origin form POST → 302 `/`; cross-origin form → 403 (warstwa Astro); cross-origin `application/json` → 403 `{code:forbidden}` (warstwa aplikacyjna). Pełny wizualny wylog w przeglądarce nie sterowany headless.
