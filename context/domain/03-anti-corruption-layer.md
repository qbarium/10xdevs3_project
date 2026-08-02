---
title: "Warstwa antykorupcyjna (ACL): izolacja Supabase za portami repozytoriów (DDD, L5 element ③)"
created: 2026-08-02
type: refactor-plan
based_on: context/domain/01-domain-distillation.md
project: TaskerLight
method: "Prompt DDD „Anti-Corruption Layer” z 10xDevs M4L5. Tryb: TYLKO ODCZYT kodu produkcyjnego; produkt to PLAN, nie implementacja. Dowody plik:linia zweryfikowane w repo na created; liczby linii odzwierciedlają stan repo na tę datę."
---

# Warstwa antykorupcyjna (ACL) TaskerLight

**To jest PLAN, nie implementacja.** Buduje na destylacji `01-domain-distillation.md` — nie wyprowadza domeny od nowa. Prompt „Anti-Corruption Layer” każe znaleźć zależność, która **przecieka przez granice warstw**, wybrać najgorszą i zaprojektować port + adapter, tak by wymiana biblioteki dotknęła TYLKO adaptera. Destylacja postawiła hipotezę: warstwa AI (`src/lib/ai/**`) może być już częściowo odseparowana, a Supabase to „fundament rozsiany po serwisach”. **Zweryfikowałem obie hipotezy w kodzie i wybrałem #1 na podstawie dowodów, nie założeń.**

**Werdykt w jednym zdaniu:** hipoteza z `01` potwierdza się — **AI jest już dobrze odseparowane** (brak SDK ⇒ brak przecieku typu biblioteki; publiczna funkcja `classify() → ClassifiedItem[]` to de-facto port), a **najgorszym przeciekiem jest Supabase**: surowy `SupabaseClient` i jego DSL (`.from().select().eq()`, `.rpc()`, `.storage`, `.auth`) przenika przez ~30 plików produkcyjnych we wszystkich warstwach, bez żadnej abstrakcji repozytorium.

**Legenda dowodów:** **[E]** evidence (zweryfikowane plik:linia), **[I]** inference (wniosek), **[U]** unknown (biała plama).

**Relacja do rodzeństwa:** `01` = mapa domeny; `02-invariant-aggregate-refactor.md` = agregat `Item` (maszyna stanów akceptacji). Ten dokument (③) jest ortogonalny: `02` pyta „gdzie żyje niezmiennik”, ③ pyta „gdzie żyje wiedza o bibliotece”. **Zbiegają się w jednym pliku** — `items-mutation.ts` — więc plan ③ i plan `02` trzeba koordynować (patrz KROK 6, „Kolejność wobec `02`”).

---

## KROK 0 — Kontekst i deklaracje wymienialności

### Zależności zewnętrzne (`package.json`)

Runtime, które realnie mogą „przeciekać” domenę:

| Pakiet | Wersja | Rola | Uwaga dla ACL |
|---|---|---|---|
| `@supabase/ssr` | `^0.10.3` | tworzenie klienta SSR (cookie-session) | **[E]** importowany w JEDNYM pliku: `supabase.ts:1` |
| `@supabase/supabase-js` | `^2.99.1` | typ `SupabaseClient`/`User` + DSL Postgrest/Storage/Auth | **[E]** typ w sygnaturach ~9 modułów (niżej) |
| `zod` | `^4.4.3` | walidacja | granica wejścia, nie przecieka jako typ domenowy |
| `radix-ui` / `lucide-react` / `sonner` / `class-variance-authority` | — | UI | czysto prezentacja |

**Dwa kluczowe fakty z `package.json`, które zmieniają werdykt:**

1. **Brak SDK dostawcy AI.** Nie ma `openai`, `@ai-sdk/*` ani żadnego klienta LLM. **[E]** Klasyfikacja idzie surowym `fetch` (`classifier.ts:74`). Skoro nie ma biblioteki, nie ma jej TYPU do przeciekania do sygnatur — to najsilniejszy pojedynczy sygnał, że AI jest z natury mniej „przeciekliwe” niż zależność z bogatym SDK.
2. **Brak zewnętrznej biblioteki kryptograficznej.** Nie ma `bcrypt`, `jsonwebtoken`, `node-forge` itp. Całe krypto BYOK stoi na wbudowanym **Web Crypto** (`crypto.subtle`), już zamknięte w `src/lib/crypto/aes-gcm.ts` (`:46,54,56,85`) i `user-hash.ts:17,24`. **[E]** Kandydat „biblioteka kryptograficzna (jeśli zewnętrzna)” z promptu **nie istnieje** — nie ma czego izolować. Odnotowuję uczciwie i wykreślam go z dalszej analizy.

### Warstwy (z `01`, potwierdzone)

API routes (`src/pages/api/**`) → serwisy (`src/lib/services/**`) → logika domenowa (`src/lib/items/**`) → walidacja (`src/lib/validation/**`) → AI (`src/lib/ai/**`) → typy (`src/types.ts`) → persystencja (`supabase/migrations/**`). Klient Supabase jest wstrzykiwany od góry (strona/endpoint/middleware) w dół (serwis).

### Co dokumenty DEKLARUJĄ o wymienialności

To jest oś (c) rankingu — rozjazd „intencja vs kod”. Wynik jest **wybiórczy**:

| Komponent | Deklaracja w dokumentach | Czy kod ją realizuje? |
|---|---|---|
| **Model AI** | „Konkretny model **konfigurowalny przez ENV variable** (redeploy do zmiany)” **[E]** `shape-notes.md:72`; FR-023 „model = decyzja w spec technicznej” **[E]** `prd.md:214` | **TAK** — `CLASSIFIER_MODEL` z env + `resolver.ts:21` wybiera ścieżkę. Intencja ↔ kod **zgodne**, brak rozjazdu. |
| **Dostawca AI** | „AI provider: **OpenAI (zdecydowane)**” **[E]** `shape-notes.md:423`, `taskerLight-shape-seed.md:282`. PRD mówi wyłącznie „**zewnętrzny dostawca AI**”, nazwę trzyma jako daną (FR-024) | **CZĘŚCIOWO** — nazwa dostawcy to stała konfiguracji `AI_PROVIDER_NAME="OpenAI"` (`byok.ts:15`), a nie literał w kodzie. Język PRD jest provider-neutralny; kod w większości też. |
| **Provider auth** | Wybór **spośród alternatyw**: „Supabase Auth, Auth.js, własna implementacja” **[E]** `taskerLight-shape-seed.md:306`; „priorytet: **minimalny czas implementacji**” **[E]** `prd.md:300`, `shape-notes.md:355`. Rozstrzygnięte: „baseline = **Supabase email**; OAuth → Zaparkowane” **[E]** `roadmap.md:288,294` | **NIE jako port** — kod woła `supabase.auth.getUser()` wprost w middleware (`:22`) i endpointach auth. Wybór „na czas”, nie „na wymienialność”, ale **dokument wprost traktował providera jako podmienialny**. |
| **Persystencja (Postgres/Storage)** | Brak jawnej deklaracji „trzymaj Postgres wymienialny”. ALE ślad **de-vendoringu**: kolumnę `openai_api_key_encrypted` z seeda **[E]** `taskerLight-shape-seed.md:257` przemianowano w kodzie na neutralne `api_key_encrypted` (`profile-key.ts:24`) | Kod hermetyzuje sekret serwera server-only (`supabase.ts:3`), ale DSL bazy jest rozsmarowany po serwisach. |
| **Adapter hostingu** | „Wymaga **swap adaptera Astro na `@astrojs/node`**” przy zmianie platformy **[E]** `infrastructure.md:42` | Realny scenariusz wymiany, ale dotyczy adaptera Astro, nie Supabase/AI. |

**Wniosek KROK 0.** Wymienialność, którą dokumenty deklarują dla AI (model przez ENV), jest **już dostarczona** — tam nie ma rozjazdu do naprawy. Za to **provider auth był jawnie wybrany spośród wymienialnych alternatyw „na czas”**, a kod przybija go na stałe do `supabase.auth.*` — to realny (choć łagodny) rozjazd intencja↔kod po stronie Supabase.

---

## KROK 1 — Przeciekające zależności (pełny inwentarz)

### Kandydat #A — Supabase (`@supabase/ssr` + `@supabase/supabase-js`)

Sygnały z promptu, które trafia: **ten sam pakiet w wielu warstwach** ✔, **typ biblioteki w sygnaturach domenowych** ✔, **duplikacja rekonstrukcji obiektu biblioteki** ✔ (22× `createClient`), **wołanie tego samego klienta po obu stronach granicy** ✔ (server + ochrona przed bundlem klienta).

**A0. Fabryka (1 plik) — jedyne poprawne miejsce:**
- `supabase.ts:1` import `@supabase/ssr`; `:5` `createClient(headers, cookies)`; `:9` `createServerClient(...)`; `:3` sekret `SUPABASE_KEY` z `astro:env/server` (server-only). **[E]**

**A1. Przeciek typu do globalnego kontraktu (1 plik):**
- `env.d.ts:3` — `App.Locals.user: import("@supabase/supabase-js").User | null`. **[E]** Typ biblioteki jest w globalnym kontrakcie Astro — każdy `context.locals.user` w całej apce zna `User` z SDK.

**A2. Serwisy domenowe — `SupabaseClient` w sygnaturze + surowy DSL (7 modułów):**

| Plik | Typ w sygnaturze | DSL biblioteki (plik:linia) |
|---|---|---|
| `services/items.ts` | `:8` | `.from("items").select().eq().in().or().order().range()` `:78,86,144–150`; **`buildSearchOrFilter` koduje składnię quotingu `.or()` PostgREST** `:39–46` |
| `services/items-mutation.ts` | `:9` | `.from("items")` `:68,101,125,145,173,182,202,231,252` (insert/update/select) |
| `services/import-session.ts` | `:6` | `.from("import_sessions")` `:24,48,57,131,184,205,228,257`; **`.rpc("persist_classification")`** `:36` |
| `services/file-upload.ts` | `:9` | `.storage.from(BUCKET).upload/remove` `:67,82`; `.from("import_files").insert` `:73` |
| `services/session-input.ts` | `:9` | `.storage.from(BUCKET).download` `:46` |
| `services/profile-key.ts` | `:6` | `.from("profiles").upsert/select/update` `:21,42,61,75` |
| `ai/classify-core.ts` | `:12` | `runClassification(supabase: SupabaseClient, …)` `:56–59` — orkiestracja AI też bierze surowy klient |

**A3. Powierzchnia auth (middleware + 3 endpointy):**
- `middleware.ts:4` import `createClient`; `:17` wywołanie; **`:22` `supabase.auth.getUser()`**. **[E]**
- `api/auth/signin.ts:9`, `api/auth/signup.ts:9`, `api/auth/signout.ts:5` — tworzą klienta i wołają `supabase.auth.*`. **[E]**

**A4. Miejsca wywołań, które instancjonują i „przewlekają” surowy klient w dół (bootstrap zduplikowany):**
- **8 stron `.astro`:** `profile.astro:16`, `items.astro:43`, `items/active.astro:32`, `items/done.astro:31`, `items/cancelled.astro:31`, `items/trash.astro:31`, `import-sessions.astro:32`, `ingest.astro:20`. **[E]**
- **~11 endpointów API:** `ingest/classify.ts:83`, `profile/byok-key.ts:36,57,73`, `import-sessions/index.ts:27`, `import-sessions/retry.ts:40`, `import-sessions/[id]/items.ts:32`, `items/index.ts:42,72`, `items/bulk.ts:34`, `items/operational.ts:35`, `items/[id].ts:39`, `items/trash/empty.ts:27`. **[E]**

**A5. Ręcznie pilnowane granice bundla klienta (najgroźniejszy sygnał — patrz KROK 3):**
- `FileDropZone.tsx:4` — komentarz: „`import type` Supabase znika przy budowaniu, a `uploadImportFile` wytrząsa tree-shaking”. **[E]**
- `session-list-criteria.ts:13` — komentarz: „hook bez wciągania `@supabase/supabase-js` do bundla przeglądarki”. **[E]**

**Suma powierzchni Supabase: ~30+ plików produkcyjnych** (1 fabryka + 1 typ globalny + 7 serwisów + 1 orkiestracja AI + middleware + 3 endpointy auth + 8 stron + ~11 endpointów + 2 strażniki bundla).

### Kandydat #B — dostawca AI / OpenAI (`src/lib/ai/**` + `config/**`)

Cała wiedza o OpenAI mieści się w **strefie AI + config** i NIE wychodzi do UI/DB/serwisów domenowych:
- `ai/classifier.ts:74` `fetch(".../chat/completions")`; `:79` nagłówek `Authorization: Bearer`; `:88–94` mapowanie statusów na typowane błędy.
- `ai/request.ts:19–35` kształt body Chat Completions (`messages`, `response_format`); `:45–72` parser `choices[0].message.content` / `finish_reason` / `refusal`; `:41–43` gałąź Responses jako SZEW.
- `ai/resolver.ts:6–13` katalog `CLASSIC_MODELS` (`gpt-*`); `:21–28` `resolveEndpoint`.
- `config/ai.ts:6–12` env `OPENAI_*`; `:25` `ALLOWED_OPENAI_HOSTS`; `:40–65` walidacje fail-closed; `:83–89` `aiConfig`.
- `config/byok.ts:15` `AI_PROVIDER_NAME="OpenAI"`; `:18` `AI_PROVIDER_KEYS_URL`.
- **Rezydua poza strefą (drobne):** `ingest-errors.ts:14` — literał „OpenAI” zaszyty na sztywno, **omijając** stałą `AI_PROVIDER_NAME` (`byok.ts:15`); `user-hash.ts:1` — komentarz. **[E]**

**Suma powierzchni AI: ~8 plików, prawie wszystkie w intencjonalnej strefie adaptera.** Publiczna granica `classify(rawText, opts): Promise<ClassifiedItem[]>` (`classifier.ts:39`) **nie niesie żadnego typu OpenAI** — wejście to `{apiKey, userId, signal}`, wyjście to czysty kontrakt domenowy `ClassifiedItem` (`types.ts:141`, tylko `type/title/description`).

### Kandydat #C — krypto — **odrzucony (brak zależności zewnętrznej)**

Web Crypto (wbudowane), zamknięte w `src/lib/crypto/aes-gcm.ts` + owijka `byok-crypto.ts`. Nie ma biblioteki do izolacji. **[E]** (patrz KROK 0, fakt 2).

---

## KROK 2 — Klasyfikacja i wybór #1

| Oś | Supabase (#A) | AI / OpenAI (#B) |
|---|---|---|
| **(a) Liczba warstw/plików** | **~30+** plików: API + strony + middleware + serwisy + orkiestracja AI + typ globalny + 2 strażniki bundla | ~8 plików, **wszystkie w strefie `ai/**` + `config/**`**; zero przecieku do UI/DB |
| **(b) Koszt wymiany DZIŚ** | **Bardzo wysoki** — brak portu; każdy serwis mówi surowym DSL Postgrest/Storage/Auth; wymiana dotyka każdej sygnatury i każdego z 22 call-site’ów `createClient` | **Niski–średni** — wymiana dostawcy dotyka `request.ts` + `fetch` w `classifier.ts` + katalog modeli + `config/*`, ale **w jednej strefie**; granica `classify()` się nie zmienia |
| **(c) Rozjazd intencja↔kod** | Provider auth **jawnie wybrany spośród alternatyw „na czas”** (`prd.md:300`, `seed:306`), a kod przybija `supabase.auth.*`; wzorzec de-vendoringu w projekcie istnieje (`api_key_encrypted`) | **Brak rozjazdu** — jedyna zadeklarowana wymienialność (model przez ENV) jest **dostarczona** (`resolver` + `CLASSIFIER_MODEL`) |

### Werdykt: **#1 = Supabase.** AI jest już dobrze odseparowane — mówię to uczciwie.

**Dlaczego AI NIE jest #1 (bez wyolbrzymiania nieistniejącego przecieku):** brak SDK ⇒ brak typu biblioteki w sygnaturach; `classify()` to wąska funkcja zwracająca czysty typ domenowy; surowa odpowiedź modelu nigdy nie opuszcza klasyfikatora (FR-005) i nie trafia do bazy (`01` KROK 4). To jest **de-facto ACL** — hipoteza z `01` potwierdzona. Realne, drobne braki AI (nie uzasadniają statusu #1): (i) brak **jawnego wstrzykiwanego interfejsu** — `classify-core.ts:14` importuje `classify` po nazwie, nie przez port; (ii) stałe identyfikujące dostawcę **rozproszone** między `config/ai.ts`, `config/byok.ts` i literał w `ingest-errors.ts:14`. Oba to poprawki „na jedną fazę”, opisane w Aneksie.

**Dlaczego Supabase JEST #1:** wygrywa wszystkie trzy osie. Biblioteka nie jest „za granicą” — jej **DSL jest słownikiem persystencji całej domeny**, a jej **typ jest w globalnym kontrakcie** (`env.d.ts:3`). Co ważne: klient jest dziś **wstrzykiwany** (serwisy dostają go parametrem, więc są testowalne z atrapą) — to forma DI, ale **wstrzykiwany jest surowy typ biblioteki, a ciała mówią jej DSL**. To „wstrzykiwanie przecieku”, nie ACL. Wartość izolacji nie zależy nawet od tego, czy kiedyś porzucimy Supabase (dla MVP mało prawdopodobne) — patrz KROK 3, cztery korzyści niezależne od wymiany vendora.

---

## KROK 3 — Diagnoza przecieku #1 (Supabase)

### Duplikacja (cytaty plik:linia)

1. **`ITEM_COLUMNS` — lista kolumn tabeli `items` zduplikowana BAJT W BAJT** w dwóch serwisach:
   - `items.ts:13–14` i `items-mutation.ts:14–15` — identyczny string `"id, user_id, import_session_id, type, title, description, acceptance_status, operational_status, created_at, updated_at"`. **[E]** To wiedza o kształcie persystencji powielona w dwóch miejscach; ACL scala ją w mapperze adaptera.
2. **`createClient(headers, cookies)` — bootstrap zależności powtórzony ~22×** (8 stron + ~11 endpointów + middleware). **[E]** Ten sam ceremoniał tworzenia klienta zamiast jednej fabryki wołanej przez wszystkich.
3. **`BUCKET = "import-files"` — nazwa bucketa Storage zduplikowana** w `file-upload.ts:13` i `session-input.ts:16` (dodatkowo w regule `lessons.md:65`). **[E]** Wiedza o lokalizacji w Storage powielona.
4. **`.eq("user_id", userId)` — wzorzec dostępu (redundantny wobec RLS, „obrona w głąb”) powtórzony** w każdym odczycie/mutacji (`items.ts:78,147`, `import-session.ts:131`, …). **[E]**

### Przecieki przez granice

- **DSL biblioteki = język domeny persystencji.** Serwisy nie mówią „zapisz wpis” — mówią `supabase.from("items").insert({...}).select(ITEM_COLUMNS).single<Item>()` (`items-mutation.ts:67–80`). Fluent-builder Postgrest, RPC (`import-session.ts:36`), Storage (`file-upload.ts:67`) i Auth (`middleware.ts:22`) są wplecione bezpośrednio w logikę.
- **Typ w globalnym kontrakcie.** `env.d.ts:3` wciąga `User` z SDK do `App.Locals` — nie da się dotknąć `locals.user` bez zależności od biblioteki.
- **NAJGROŹNIEJSZY: granica klient/serwer trzymana RĘCZNIE.** Guardrail „`@supabase/supabase-js` nie może wejść do bundla przeglądarki” jest dziś egzekwowany **wyłącznie** przez erasure `import type` + tree-shaking, pilnowany komentarzami w `FileDropZone.tsx:4` i `session-list-criteria.ts:13`. **[E]** Wystarczy, że ktoś zaimportuje z serwisu **wartość** (nie tylko typ) do wyspy React, a klient Supabase zostanie zbundlowany do przeglądarki. To dokładnie „SDK wciągane do bundla klienta” z promptu. **[I]** — nie zaobserwowany incydent, lecz krucha granica utrzymywana dyscypliną, nie strukturą.

### Guardraile PRD — stan i obowiązek ACL

- **Sekret serwera nie wychodzi do klienta.** `SUPABASE_KEY` żyje tylko w `astro:env/server` (`supabase.ts:3`), po stronie serwera. **Nie jest dziś złamany.** ACL musi to zachować: tworzenie klienta zostaje w adapterze server-only.
- **Klucz BYOK / prywatność wsadu.** To guardraile ścieżki AI (klucz tylko w nagłówku `classifier.ts:79`; nie logowany, `prd.md:272`; allowlista hostów `config/ai.ts:25`; `store:false` `config/ai.ts:88`; wsad tylko do dostawcy AI, `prd.md:49,279,338`). **Żaden nie jest złamany** i ACL Supabase ich nie dotyka — odnotowuję, by nie mieszać dwóch granic.

**Uczciwie:** ACL Supabase to refaktor **izolacji wymiany + higieny granic + testowalności**, a nie łatanie dziury bezpieczeństwa. Cztery korzyści niezależne od tego, czy kiedykolwiek zmienimy vendora: (1) testy przestają imitować fluent-builder Postgrest i implementują mały interfejs domenowy; (2) granica bundla klient/serwer staje się **strukturalna**, nie komentarzowa; (3) `ITEM_COLUMNS`/mapowanie wiersz↔encja mają JEDNO miejsce; (4) powstaje naturalny dom dla guardów maszyny stanów z `02`.

### Rozjazd dokument↔kod (oś c, dowód)

Provider auth był w dokumentach **wymienialnym wyborem** („Supabase Auth, Auth.js, własna implementacja”, `taskerLight-shape-seed.md:306`; kryterium „minimalny czas implementacji”, `prd.md:300`). Kod nie zostawia po nim szwu — `supabase.auth.getUser()` stoi wprost w `middleware.ts:22`, a logowanie/rejestracja w `api/auth/*`. Zadeklarowana podmienialność nie ma w kodzie odpowiednika (portu `AuthGateway`).

---

## KROK 4 — Projekt ACL

### 4.0 Ocena istniejącego częściowego portu (AI) — wzorzec do naśladowania

Zamiast projektować od zera, biorę `classify()` jako **działający wzorzec ACL w tym repo** i przenoszę jego zasady na Supabase:
- **Wąska granica, typ domenowy na wyjściu:** `classify(rawText, {apiKey,userId,signal}) → ClassifiedItem[]` (`classifier.ts:39`). Reszta apki nie zna kształtu odpowiedzi OpenAI.
- **Wiedza o transporcie w jednym module czystym:** `request.ts` (body + parser). Gałąź nieobsługiwana to jawny SZEW (`buildResponsesRequest():never`, `request.ts:41`), nie milczące założenie.
- **Czego brakowałoby do „pełnego” ACL AI** (Aneks, nie #1): jawny interfejs `Classifier` wstrzykiwany zamiast importu po nazwie + konsolidacja stałych dostawcy (w tym literał `ingest-errors.ts:14` → `AI_PROVIDER_NAME`).

### 4.1 Kształt docelowy Supabase: porty repozytoriów + jeden adapter + mapper

Trzy zdolności Supabase (DB / Auth / Storage) → rodziny **portów w języku domeny**. Reszta kodu zna tylko porty; **jedyny** plik importujący `@supabase/*` to adapter.

```
src/lib/ports/                 ← interfejsy w języku domeny (zero @supabase/*)
  item-repository.ts           ItemRepository
  import-session-repository.ts ImportSessionRepository
  profile-key-store.ts         ProfileKeyStore
  auth-gateway.ts              AuthGateway
  import-file-store.ts         ImportFileStore
src/lib/adapters/supabase/     ← JEDYNE miejsce z @supabase/*
  client.ts                    (przeniesione z supabase.ts — fabryka server-only)
  row-mappers.ts               rowToItem / rowToSession / … + ITEM_COLUMNS (jedyne)
  supabase-item-repository.ts  implements ItemRepository
  …                            po jednym adapterze na port
  index.ts                     makeSupabaseRepositories(headers, cookies) → { items, sessions, profileKey, auth, files }
```

**Value object jako jedyne miejsce wiedzy o kształcie persystencji** — mapper wiersz↔encja w adapterze:

```
// src/lib/adapters/supabase/row-mappers.ts   (PSEUDOKOD projektowy — nie kod produkcyjny)
const ITEM_COLUMNS = "id, user_id, import_session_id, type, title, description, " +
                     "acceptance_status, operational_status, created_at, updated_at"; // JEDYNE wystąpienie
function rowToItem(row): Item { /* snake_case wiersz → encja domenowa */ }
```

**Wąskie porty (interfejsy w języku domeny — sygnatury):**

```
// src/lib/ports/item-repository.ts
interface ItemRepository {
  list(userId: string, criteria: ListCriteria, window?: ListWindow): Promise<ItemsPage>;
  listBySession(userId: string, sessionId: string, window?: ListWindow): Promise<ItemsPage>;
  createManual(userId: string, input: CreateItemInput): Promise<Item>;
  setAcceptanceBulk(userId, ids, from, to): Promise<Item[]>;   // guard `from` w adapterze
  moveToTrash(userId, ids): Promise<Item[]>;
  restoreFromTrash(userId, ids): Promise<Item[]>;
  edit(userId, id, patch: EditItemInput, expectedUpdatedAt): Promise<Item>; // 409/404 w adapterze
  emptyTrash(userId): Promise<number>;
}

// src/lib/ports/import-session-repository.ts
interface ImportSessionRepository {
  create(userId, rawInput: string | null): Promise<{ id: string }>;
  persistClassification(sessionId, items: ClassifiedItem[]): Promise<number>; // opakowuje .rpc
  finalizeEmpty(sessionId): Promise<void>;
  fail(sessionId, code: string): Promise<void>;
  list(userId, opts: GetImportSessionsOptions): Promise<...>;
  reopen(sessionId): Promise<...>;
  reapStaleProcessing(): Promise<number>;
}

// src/lib/ports/profile-key-store.ts
interface ProfileKeyStore {
  save(userId, encrypted, hint, updatedAt): Promise<void>;
  getStatus(userId): Promise<ByokKeyStatus>;
  getEncrypted(userId): Promise<string | null>;
  delete(userId): Promise<void>;
}

// src/lib/ports/auth-gateway.ts   ← domyka rozjazd z KROK 3
interface AuthGateway {
  currentUser(): Promise<DomainUser | null>;      // NIE zwraca @supabase User
  signIn(email, password): Promise<AuthResult>;
  signUp(email, password): Promise<AuthResult>;
  signOut(): Promise<void>;
}

// src/lib/ports/import-file-store.ts
interface ImportFileStore {
  upload(userId, sessionId, file: File): Promise<UploadedFileRef>;
  download(path: string): Promise<Uint8Array>;
  remove(path: string): Promise<void>;
}
```

**Adapter (pseudokod — jedyny znający DSL):**

```
// src/lib/adapters/supabase/supabase-item-repository.ts
class SupabaseItemRepository implements ItemRepository {
  constructor(private db: SupabaseClient) {}      // JEDYNY import @supabase/* w domenie
  async createManual(userId, input) {
    const { data, error } = await this.db.from("items")
      .insert({ user_id: userId, import_session_id: null, ...input,
                acceptance_status: "accepted",
                operational_status: deriveOperationalStatus(input.type),
                updated_at: nowIso() })
      .select(ITEM_COLUMNS).single();
    if (error) throw new PersistenceError("createManual", { cause: error });
    return rowToItem(data);
  }
  // list/edit/moveToTrash/… — te same ciała co dziś w items(-mutation).ts, przeniesione TUTAJ
}
```

**Serwis domenowy przestaje znać bibliotekę** — dostaje port, nie klienta:

```
// PSEUDOKOD: logika domenowa (np. reguły akceptacji z `02`) zależy od portu
async function acceptItems(items: ItemRepository, userId, ids) {
  return items.setAcceptanceBulk(userId, ids, "pending", "accepted"); // zero .from()/.eq()
}
```

### 4.2 Kalibracja na MVP (uczciwie o zakresie)

- Encje w `types.ts` (`Item`, `ImportSession`, `Profile`) **są dziś kształtem wiersza** (snake_case). Pierwszy krok ACL **izoluje klienta** (porty + adapter), zostawiając encje = wiersz; mapper jest wtedy trywialny (dzisiejsze `.single<Item>()`). **Opcjonalny** późniejszy krok rozdziela „wiersz persystencji” (wewnętrzny adaptera) od „encji domenowej” — świadomie poza pierwszym cięciem, by nie przezłocić MVP.
- Auth/Storage są cienkie i generyczne (`01` KROK 2: GENERIC). Ich porty są tanie, więc mieszczą się w planie, ale mają niższy priorytet niż repozytoria DB (patrz fazy).

---

## KROK 5 — Dowód izolacji + before/after

### Co dotknie wymiana biblioteki (kryterium sukcesu ACL)

Po refaktorze podmiana Supabase (na inny Postgres/Storage/Auth) dotyka **wyłącznie** `src/lib/adapters/supabase/**`. **NIE zmienia się:**
- **Tabele/migracje** (`supabase/migrations/**`) — RLS/RPC bez zmian; adapter dalej mówi do tego samego schematu.
- **Kontrakty API** (`{ ok, sessionId, status, … }` z `classify-core.ts:98–110`, kody HTTP) — endpointy wołają porty, kształt odpowiedzi bez zmian.
- **UI / wyspy React** — dostają gotowe `Item[]`/`ItemsPage`, nigdy klienta.
- **Serwisy/logika domenowa** — zależą od interfejsu portu, nie od `SupabaseClient`.
- **Maszyna stanów z `02`** — guardy przenoszą się do adaptera repozytorium bez zmiany semantyki.

### Before / after (zduplikowane i przeciekające miejsca)

**(1) Lista wpisów — `items.ts:72–126`:**
- *Before:* `listItems(supabase: SupabaseClient, userId, criteria, window?)` buduje `supabase.from("items").select(ITEM_COLUMNS)…` w ciele serwisu.
- *After:* `ItemRepository.list(userId, criteria, window?)`; fluent-builder + `ITEM_COLUMNS` + `buildSearchOrFilter` (quoting `.or()`) żyją w `SupabaseItemRepository`. Wołający dostaje `ItemsPage` (dane domenowe).

**(2) Wpis ręczny — `items-mutation.ts:62–83`:**
- *Before:* `createManualItem(supabase, userId, input)` → `.from("items").insert(...).select(ITEM_COLUMNS).single<Item>()`.
- *After:* `ItemRepository.createManual(userId, input)`; `ITEM_COLUMNS` znika z serwisu (kasuje duplikat #1), niezmiennik `accepted+new+session=NULL` zostaje przy logice, mapowanie wiersza w adapterze.

**(3) BYOK — `profile-key.ts:59–67`:**
- *Before:* `getEncryptedApiKey(supabase, userId)` → `.from("profiles").select("api_key_encrypted")…`.
- *After:* `ProfileKeyStore.getEncrypted(userId): Promise<string|null>`. Guardrail „koperta nigdy do odpowiedzi” zostaje; endpoint klasyfikacji dostaje `string|null`, nie query-builder.

**(4) Granica bundla klienta — `FileDropZone.tsx:4`:**
- *Before:* wyspa importuje z `file-upload.ts` (moduł z `SupabaseClient`), a bezpieczeństwo bundla trzyma `import type` + komentarz.
- *After:* wyspy importują wyłącznie z modułów-DTO/stałych (bez adaptera); adapter nie jest osiągalny z grafu klienta → granica **strukturalna**, komentarze-strażniki zbędne.

### Otwarte pytania zależne od kontraktu biblioteki (rozstrzygnięcia → do ADAPTERA)

- **Zwrot RPC `persist_classification`** (`import-session.ts:41–42` toleruje `number` lub fallback) — semantykę „ile zapisano” koduje `persistClassification` w adapterze, nie endpoint.
- **Mapowanie błędów Postgrest → błędy domenowe** (dziś `throw new Error(..., {cause})` w serwisach) — jeden `PersistenceError`/`ConflictError` produkuje adapter; `ItemConflictError`/`ItemNotEditableError` (`items-mutation.ts:21–38`) stają się kontraktem portu `edit`, mapowanym z compare-and-swap wewnątrz adaptera.
- **Kształt `User` w `locals`** — `AuthGateway.currentUser()` zwraca `DomainUser` (id, email), odcinając `env.d.ts:3` od `@supabase/supabase-js`.

---

## KROK 6 — Weryfikacja i plan faz

### Kryterium sukcesu (sprawdzalne)

`grep -r "@supabase/" src/` zwraca **wyłącznie** pliki w `src/lib/adapters/supabase/**`.

- **DZIŚ znają zależność (do wyzerowania poza adapterem):** `supabase.ts`, `env.d.ts:3`, 7 serwisów (`items.ts`, `items-mutation.ts`, `import-session.ts`, `file-upload.ts`, `session-input.ts`, `profile-key.ts`), `ai/classify-core.ts:12`, `middleware.ts`, `api/auth/{signin,signup,signout}.ts`, 8 stron `.astro`, ~11 endpointów, oraz komentarze-strażniki w `FileDropZone.tsx:4` i `session-list-criteria.ts:13`.
- **PO refaktorze znają zależność:** tylko `src/lib/adapters/supabase/**` (fabryka + mappery + adaptery). Reszta importuje `src/lib/ports/**`.

### Plan faz (test-first Vitest; każda faza odwracalna — „dodaj test, zanim dotkniesz”, M4L4)

- **Faza 0 — szkielet portów (bez zmiany zachowania).** Zdefiniuj interfejsy w `src/lib/ports/**`; przenieś fabrykę do `adapters/supabase/client.ts` (re-eksport ze starej ścieżki dla kompatybilności). Test: kontraktowy szkielet + „build/lint zielone”. Odwracalne: usunięcie folderów.
- **Faza 1 — `ItemRepository` (największa wartość).** Przenieś ciała `items.ts` + `items-mutation.ts` do `SupabaseItemRepository`; scal `ITEM_COLUMNS` do mappera (kasuje duplikat). **Test-first:** przepisz istniejące `items.test.ts`/`items-mutation.test.ts` na atrapę `ItemRepository` (mały interfejs zamiast imitacji fluent-buildera); charakteryzuj guardy i 409/404 z `[id].ts`. Odwracalne per-plik.
- **Faza 2 — `ImportSessionRepository` (+ RPC).** `persistClassification/finalizeEmpty/fail/list/reopen/reap`. `classify-core.ts` zaczyna brać port zamiast `SupabaseClient` (`:56`). Test: `import-session.test.ts` + regresja kontraktu `classify.test.ts` (422/ok:false).
- **Faza 3 — `ProfileKeyStore`.** `save/getStatus/getEncrypted/delete`. Test: zachowanie „koperta nigdy do odpowiedzi” jako charakteryzacja portu.
- **Faza 4 — `AuthGateway` + `ImportFileStore`.** `currentUser/signIn/signUp/signOut`; `upload/download/remove` (scal `BUCKET` do adaptera — kasuje duplikat #3). `env.d.ts` przechodzi na `DomainUser`. Test: middleware guard + round-trip uploadu.
- **Faza 5 — przełączenie call-site’ów + strukturalna granica bundla.** Strony/endpointy/middleware wołają `makeSupabaseRepositories(...)` zamiast `createClient` (kasuje duplikat #2, 22 miejsca); usuń komentarze-strażniki, bo adapter jest nieosiągalny z grafu klienta. **Bramka:** grep `@supabase/` = tylko `adapters/supabase/**`. Odwracalne: fabryka trzyma stary kształt, można cofać endpoint po endpoincie.

### Kolejność wobec `02`

`02` (agregat `Item`) i ta ③ (port `ItemRepository`) **modyfikują ten sam `items-mutation.ts`**. Rekomendacja **[I]:** najpierw **Faza 1 ③** (wydziel `ItemRepository`), potem `02` osadza strażnika przejść **za portem** (adapter = miejsce, gdzie guard `WHERE`/CHECK spina się z persystencją). Odwrotna kolejność wymusza podwójny refaktor tego pliku. Alternatywnie oba plany można złączyć w jedną sekwencję faz na `items-mutation.ts`.

---

## Ograniczenia tej analizy

- Tryb **tylko-odczyt**; produkt to PLAN. Nie napisano kodu produkcyjnego — bloki to sygnatury/pseudokod projektowy.
- Numery linii odzwierciedlają stan repo na `created` (2026-08-02); twierdzenia „tylko tutaj”/liczby (np. 22× `createClient`, ~30 plików) zebrano grepem — jeśli decyzja stanie na konkretnej liczbie, potwierdź `ast-grep` (technika z M4L3).
- Status „granica bundla krucha” to **[I]** (model zagrożeń: import wartości z serwisu do wyspy), nie zaobserwowany incydent.
- Guardraile bezpieczeństwa (sekret serwera server-only, higiena klucza BYOK, prywatność wsadu) **nie są dziś złamane**; ACL ma je zachować, nie naprawić.

---

## Podsumowanie (dla czytelnika)

Dokument wybiera i projektuje warstwę antykorupcyjną dla TaskerLight. Zweryfikowałem hipotezę z `01`: **AI jest już dobrze odseparowane** — brak SDK OpenAI (wywołanie surowym `fetch`), więc żaden typ biblioteki nie przecieka do sygnatur, a publiczna funkcja `classify() → ClassifiedItem[]` to de-facto port; jedyna zadeklarowana wymienialność (model przez ENV) jest już dostarczona. Krypto odpada, bo stoi na wbudowanym Web Crypto — nie ma zewnętrznej biblioteki do izolacji. **Najgorszym przeciekiem (#1) jest Supabase:** surowy `SupabaseClient` i jego DSL (`.from/.rpc/.storage/.auth`) przenikają przez **~30+ plików produkcyjnych** we wszystkich warstwach — 7 serwisów + orkiestrację AI mających typ w sygnaturze, globalny `App.Locals` (`env.d.ts:3`), 22 miejsca bootstrapu `createClient`, oraz dwie ręcznie pilnowane komentarzami granice bundla klienta. Diagnoza pokazuje twardą duplikację (`ITEM_COLUMNS` bajt w bajt w dwóch serwisach, `BUCKET`, wzorzec `.eq("user_id")`) i najgroźniejszy przeciek: krucha, komentarzowa ochrona przed wciągnięciem SDK do przeglądarki. Projekt ACL to porty repozytoriów w języku domeny (`ItemRepository`, `ImportSessionRepository`, `ProfileKeyStore`, `AuthGateway`, `ImportFileStore`) + jeden adapter Supabase jako jedyny znający bibliotekę + mapper wiersz↔encja jako jedyne miejsce `ITEM_COLUMNS`. Kryterium sukcesu jest sprawdzalne: `grep @supabase/ src/` ma zwracać wyłącznie katalog adaptera. Plan to sześć odwracalnych, test-first faz, skoordynowanych z refaktorem agregatu `Item` z `02` (wspólny plik `items-mutation.ts`).
